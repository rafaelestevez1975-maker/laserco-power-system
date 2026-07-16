'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'

/**
 * CRIAR USUÁRIO — ponto ÚNICO e geral de criação de acesso (Configurações → Usuários).
 * Generaliza o fluxo que antes existia só no SAC (criarAcessoAtendente): cria o login (auth) +
 * o perfil (perfis_usuario) + o vínculo de cargo (usuario_cargos). O cargo escolhido ("Perfil de
 * acesso") é quem define O QUE o usuário acessa (RBAC recurso×ação). Serve p/ qualquer
 * departamento (SAC, Universidade, Operação, RH…). RBAC: só admin_geral.
 */

export type ActionResult = { ok: boolean; error?: string; id?: string }
export type CriarUsuarioInput = {
  nome: string
  email: string
  senha: string
  telefone?: string
  unidadeId?: string | null
  cargoId: string // id de cargos (Perfil de acesso)
}

const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

/** Deriva o `papel` grosso a partir do slug do cargo escolhido. O acesso fino vem do RBAC do
 *  cargo; o papel só cobre gates coarse (ex.: SAC centralizado, bypass do admin_geral). */
function papelDoCargo(slug: string): string {
  const s = (slug || '').toLowerCase()
  if (/admin_geral|super_admin|admin_franqueado|proprietario|diretor/.test(s)) return 'admin_geral'
  if (/sac/.test(s)) return 'sac'
  if (/financ/.test(s)) return 'financeiro'
  if (/\brh\b|recursos_humanos/.test(s)) return 'rh'
  if (/crm|comercial|expansao|marketing/.test(s)) return 'crm'
  if (/gerente/.test(s)) return 'gerente'
  if (/gestor|subgerente|supervisor/.test(s)) return 'gestor'
  if (/recep/.test(s)) return 'recepcao'
  if (/operac/.test(s)) return 'operacoes'
  if (/tecnic|profissional|fisio/.test(s)) return 'tecnico'
  return 'colaborador'
}

async function audit(userId: string, acao: string, label: string): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId, acao, recurso_id: 'configuracoes.usuarios', recurso_label: label, origem: 'web', resultado: 'sucesso',
    })
  } catch { /* auditoria é secundária */ }
}

/** Empresa do operador (1ª em usuario_cargos) → fallback empresa raiz. */
async function resolverEmpresa(admin: ReturnType<typeof adminClient>, userId: string): Promise<string | null> {
  const { data: uc } = await admin.from('usuario_cargos').select('empresa_id').eq('perfil_id', userId).not('empresa_id', 'is', null).limit(1)
  const emp = ((uc ?? []) as { empresa_id: string | null }[])[0]?.empresa_id
  if (emp) return emp
  const { data: empresas } = await admin.from('empresas').select('id').limit(1)
  return ((empresas ?? []) as { id: string }[])[0]?.id ?? null
}

/** Cria um usuário completo (login + perfil + cargo). */
export async function criarUsuario(input: CriarUsuarioInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode criar usuários.' }

  const nome = input.nome?.trim()
  const email = input.email?.trim().toLowerCase()
  const senha = input.senha ?? ''
  if (!nome) return { ok: false, error: 'Informe o nome do usuário.' }
  if (!emailValido(email)) return { ok: false, error: 'Informe um e-mail válido.' }
  if (senha.length < 8) return { ok: false, error: 'A senha deve ter ao menos 8 caracteres.' }
  if (!input.cargoId) return { ok: false, error: 'Escolha um perfil de acesso.' }

  const admin = adminClient()

  // Cargo escolhido (define o acesso). Precisamos do slug p/ derivar o papel.
  const { data: cargoRow } = await admin.from('cargos').select('id, slug, nome').eq('id', input.cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; slug: string; nome: string } | null
  if (!cargo) return { ok: false, error: 'Perfil de acesso inválido.' }
  const papel = papelDoCargo(cargo.slug)
  // SAC é centralizado na franqueadora → nunca amarra unidade.
  const unidadeId = papel === 'sac' ? null : (input.unidadeId || null)

  // 1) login (e-mail já confirmado p/ entrar de imediato)
  const { data: created, error: eAuth } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: { nome_completo: nome, papel, unidade_id: unidadeId || '' },
  })
  if (eAuth || !created?.user) {
    const m = eAuth?.message || ''
    if (/already|registered|exist|duplicate/i.test(m)) return { ok: false, error: 'Já existe um usuário com esse e-mail.' }
    return { ok: false, error: m || 'Não foi possível criar o login.' }
  }
  const uid = created.user.id

  // 2) perfil (papel derivado do cargo)
  const { error: ePerfil } = await admin.from('perfis_usuario').upsert({
    id: uid, nome_completo: nome, email,
    telefone: input.telefone?.trim() || null,
    papel, unidade_id: unidadeId,
    status: 'ativo', ativo: true,
  }, { onConflict: 'id' })
  if (ePerfil) {
    await admin.auth.admin.deleteUser(uid).catch(() => {})
    return { ok: false, error: msgErro(ePerfil.message, 'criar o perfil do usuário') }
  }

  // 3) vínculo do cargo (RBAC real — sem isso o menu fica vazio)
  const empresaId = await resolverEmpresa(admin, op.userId)
  const { error: eCargo } = await admin.from('usuario_cargos').insert({
    perfil_id: uid, cargo_id: cargo.id, empresa_id: empresaId,
    unidade_id: unidadeId, ativo: true, atribuido_por: op.userId,
  })
  if (eCargo && !/duplicate|already|unique/i.test(eCargo.message)) {
    console.error('criarUsuario: vínculo de cargo falhou:', eCargo.message)
  }

  await audit(op.userId, 'usuario.criar', `Criou usuário ${nome} (${cargo.nome})`)
  revalidatePath('/configuracoes/usuarios')
  return { ok: true, id: uid }
}

/** Troca o perfil de acesso (cargo) de um usuário existente. */
export async function trocarCargoUsuario(perfilId: string, cargoId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode alterar acessos.' }
  if (!perfilId || !cargoId) return { ok: false, error: 'Dados inválidos.' }

  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id, slug').eq('id', cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; slug: string } | null
  if (!cargo) return { ok: false, error: 'Perfil de acesso inválido.' }

  // desativa vínculos atuais e cria o novo
  await admin.from('usuario_cargos').update({ ativo: false }).eq('perfil_id', perfilId)
  const empresaId = await resolverEmpresa(admin, op.userId)
  const { data: perfilRow } = await admin.from('perfis_usuario').select('unidade_id').eq('id', perfilId).maybeSingle()
  const unidadeId = papelDoCargo(cargo.slug) === 'sac' ? null : ((perfilRow as { unidade_id: string | null } | null)?.unidade_id ?? null)
  await admin.from('usuario_cargos').insert({
    perfil_id: perfilId, cargo_id: cargo.id, empresa_id: empresaId, unidade_id: unidadeId, ativo: true, atribuido_por: op.userId,
  })
  await admin.from('perfis_usuario').update({ papel: papelDoCargo(cargo.slug) }).eq('id', perfilId)

  await audit(op.userId, 'usuario.trocar_cargo', `Trocou o perfil de acesso de ${perfilId}`)
  revalidatePath('/configuracoes/usuarios')
  return { ok: true }
}

/** Ativa/inativa o acesso de um usuário (corta login sem apagar). */
export async function definirAtivoUsuario(perfilId: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode alterar usuários.' }
  if (!perfilId) return { ok: false, error: 'Usuário inválido.' }
  if (perfilId === op.userId) return { ok: false, error: 'Você não pode inativar o próprio acesso.' }

  const admin = adminClient()
  const { error: e } = await admin.from('perfis_usuario').update({ ativo, status: ativo ? 'ativo' : 'inativo' }).eq('id', perfilId)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar o usuário') }
  // bloqueia/reabilita o login de fato
  await admin.auth.admin.updateUserById(perfilId, ativo ? { ban_duration: 'none' } : { ban_duration: '876000h' }).catch(() => {})
  await audit(op.userId, 'usuario.ativo', `${ativo ? 'Reativou' : 'Inativou'} ${perfilId}`)
  revalidatePath('/configuracoes/usuarios')
  return { ok: true }
}

/** Redefine a senha e força troca no próximo acesso. */
export async function redefinirSenhaUsuario(perfilId: string, novaSenha: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode redefinir senhas.' }
  if (!perfilId || (novaSenha ?? '').length < 8) return { ok: false, error: 'A senha deve ter ao menos 8 caracteres.' }

  const admin = adminClient()
  const { error: e } = await admin.auth.admin.updateUserById(perfilId, { password: novaSenha })
  if (e) return { ok: false, error: msgErro(e.message, 'redefinir a senha') }
  try { await admin.from('colaboradores').update({ forcar_troca_senha: true }).eq('perfil_id', perfilId) } catch { /* ficha RH opcional */ }
  await audit(op.userId, 'usuario.senha', `Redefiniu a senha de ${perfilId}`)
  return { ok: true }
}
