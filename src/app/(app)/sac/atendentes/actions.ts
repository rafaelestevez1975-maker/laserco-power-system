'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel, ehAdmin } from '@/lib/rbac'
import { listAtendentesSac } from '@/lib/pessoas'
import { adminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/session'
import type { SB } from '@/lib/sb'

export type DistribResult = { ok: boolean; error?: string; conversas?: number; tickets?: number; atendentes?: number }

export type CriarAtendenteInput = { nome: string; email: string; senha: string; telefone?: string; unidadeId?: string | null }

const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

/** Trilha de auditoria (secundária — nunca quebra a ação principal). Mesma tabela
 *  e formato das demais ações do sistema (audit_log). */
async function audit(userId: string, acao: string, label: string): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId, acao, recurso_id: 'sac.atendentes', recurso_label: label, origem: 'web', resultado: 'sucesso',
    })
  } catch { /* auditoria é secundária */ }
}

/** Empresa do operador (1ª vinculada em usuario_cargos) → fallback empresa raiz (lkii tem 1). */
async function resolverEmpresa(admin: ReturnType<typeof adminClient>, userId: string): Promise<string | null> {
  const { data: uc } = await admin.from('usuario_cargos').select('empresa_id').eq('perfil_id', userId).not('empresa_id', 'is', null).limit(1)
  const emp = ((uc ?? []) as { empresa_id: string | null }[])[0]?.empresa_id
  if (emp) return emp
  const { data: empresas } = await admin.from('empresas').select('id').limit(1)
  return ((empresas ?? []) as { id: string }[])[0]?.id ?? null
}

/** Cria o ACESSO de login de uma atendente SAC: usuário de autenticação (auth) +
 *  perfil com papel 'sac' (mesmo id). É o fluxo que o ADMIN usa para liberar o login
 *  das consultoras (o trigger handle_new_user já cria o perfil por metadata; o upsert
 *  garante o perfil e grava o telefone). Ver project-laserco-people-model. */
export async function criarAcessoAtendente(input: CriarAtendenteInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode criar acessos de atendente.' }

  const nome = input.nome?.trim()
  const email = input.email?.trim().toLowerCase()
  const senha = input.senha ?? ''
  if (!nome) return { ok: false, error: 'Informe o nome da atendente.' }
  if (!emailValido(email)) return { ok: false, error: 'Informe um e-mail válido.' }
  if (senha.length < 8) return { ok: false, error: 'A senha deve ter ao menos 8 caracteres.' }

  const admin = adminClient()

  // 1) cria o login (e-mail já confirmado para a atendente conseguir entrar de imediato)
  const { data: created, error: eAuth } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: { nome_completo: nome, papel: 'sac', unidade_id: input.unidadeId || '' },
  })
  if (eAuth || !created?.user) {
    const m = eAuth?.message || ''
    if (/already|registered|exist|duplicate/i.test(m)) return { ok: false, error: 'Já existe um usuário com esse e-mail.' }
    return { ok: false, error: m || 'Não foi possível criar o login.' }
  }
  const uid = created.user.id

  // 2) garante o perfil (papel SAC) ligado ao mesmo id + grava telefone
  const { error: ePerfil } = await admin.from('perfis_usuario').upsert({
    id: uid, nome_completo: nome, email,
    telefone: input.telefone?.trim() || null,
    papel: 'sac', unidade_id: input.unidadeId || null,
    status: 'ativo', ativo: true,
  }, { onConflict: 'id' })
  if (ePerfil) {
    await admin.auth.admin.deleteUser(uid).catch(() => {}) // sem perfil o login é inútil → desfaz
    return { ok: false, error: msgErro(ePerfil.message, 'criar o perfil da atendente') }
  }

  // 3) vincula o cargo "Atendente SAC" (recursos SÓ do SAC). SEM esse vínculo o atendente
  //    fica com recursos=[] e não enxerga NADA no menu — papel 'sac' sozinho não dá acesso.
  //    É o RBAC real (usuario_cargos → cargo_permissoes → permissoes) que libera o módulo SAC.
  const { data: cargoRow } = await admin.from('cargos').select('id').eq('slug', 'atendente_sac').maybeSingle()
  const cargoId = (cargoRow as { id: string } | null)?.id
  if (cargoId) {
    const empresaId = await resolverEmpresa(admin, op.userId)
    const { error: eCargo } = await admin.from('usuario_cargos').insert({
      perfil_id: uid, cargo_id: cargoId, empresa_id: empresaId,
      unidade_id: input.unidadeId || null, ativo: true, atribuido_por: op.userId,
    })
    if (eCargo && !/duplicate|already|unique/i.test(eCargo.message)) {
      console.error('criarAcessoAtendente: vínculo do cargo Atendente SAC falhou:', eCargo.message)
    }
  } else {
    console.error('criarAcessoAtendente: cargo slug "atendente_sac" não encontrado — atendente ficará sem acesso até receber um cargo.')
  }

  await audit(op.userId, 'sac.atendente.criar', `Criou acesso SAC de ${nome}`)
  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Ativa/Desativa uma atendente (perfis_usuario.ativo). Atendente desativada não
 *  recebe mais distribuição e fica fora do ranking, mas continua listada na gestão.
 *  Paridade com o legado (a.ativo ? 'Ativo' : 'Inativo' + ação de alternar). Admin-only. */
export async function setAtendenteAtivo(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode ativar/desativar atendentes.' }
  if (!id) return { ok: false, error: 'Atendente inválida.' }
  if (id === op.userId && !ativo) return { ok: false, error: 'Você não pode desativar o seu próprio acesso.' }

  const admin = adminClient()
  const { data: perfil } = await admin.from('perfis_usuario').select('nome_completo').eq('id', id).maybeSingle()
  const nome = (perfil as { nome_completo?: string } | null)?.nome_completo || 'atendente'

  // status acompanha ativo (mesma convenção do criarAcessoAtendente).
  const { error: e } = await admin.from('perfis_usuario')
    .update({ ativo, status: ativo ? 'ativo' : 'inativo' }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'reativar a atendente' : 'desativar a atendente') }

  await audit(op.userId, ativo ? 'sac.atendente.ativar' : 'sac.atendente.desativar', `${ativo ? 'Reativou' : 'Desativou'} ${nome}`)
  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Carga atual (conversas atribuídas + tickets abertos atribuídos) por atendente,
 *  respeitando a unidade ativa do topo (não conta a rede inteira quem opera numa unidade). */
async function cargaPorAtendente(sb: SB, ids: string[], unidadeId: string | null): Promise<Map<string, number>> {
  const carga = new Map<string, number>()
  await Promise.all(ids.map(async (id) => {
    // Filtro de unidade inline (o generic de scopeUnidade estoura a profundidade do tipo — TS2589).
    let qConv = sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).eq('atendente_id', id)
    if (unidadeId) qConv = qConv.eq('unidade_id', unidadeId)
    let qTick = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', id).neq('fase', 'Concluído')
    if (unidadeId) qTick = qTick.eq('unidade_id', unidadeId)
    const [{ count: c1 }, { count: c2 }] = await Promise.all([qConv, qTick])
    carga.set(id, (c1 ?? 0) + (c2 ?? 0))
  }))
  return carga
}

/** Distribuição automática IGUALITÁRIA: atribui a fila não-atribuída (conversas que
 *  precisam de humano + chamados abertos sem dono) ao atendente menos carregado, na
 *  unidade ativa do topo. Atribuição usa o id do perfis_usuario (people-model). */
export async function distribuirFila(): Promise<DistribResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'sac', 'gestor')) return { ok: false, error: 'Você não tem permissão para distribuir o atendimento.' }
  const sb = op.sb

  // Escopo de unidade (mesmo do topo): só distribui a fila da unidade ativa.
  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null

  const atendentes = await listAtendentesSac(sb)
  if (atendentes.length === 0) return { ok: false, error: 'Nenhum atendente SAC ativo para distribuir.' }

  const carga = await cargaPorAtendente(sb, atendentes.map((a) => a.id), unidadeId)
  const menosCarregado = () => {
    let best = atendentes[0].id, min = Infinity
    for (const a of atendentes) { const c = carga.get(a.id) ?? 0; if (c < min) { min = c; best = a.id } }
    return best
  }

  // 1) Conversas vivas: precisam de humano (sem atendente, bot desligado), na unidade ativa.
  let qConv = sb.from('sac_whatsapp_chats').select('id').is('atendente_id', null).eq('bot_ativo', false)
  if (unidadeId) qConv = qConv.eq('unidade_id', unidadeId)
  const { data: convs } = await qConv.order('ultima_msg_em', { ascending: true }).limit(300)
  let nConv = 0
  for (const c of (convs ?? []) as { id: string }[]) {
    const aid = menosCarregado()
    const { error: e } = await sb.from('sac_whatsapp_chats').update({ atendente_id: aid }).eq('id', c.id)
    if (!e) { carga.set(aid, (carga.get(aid) ?? 0) + 1); nConv++ }
  }

  // 2) Chamados abertos sem dono (a tela exibe "X sem atendente" → têm que ser atribuídos).
  //    Mais antigos primeiro; limite para não despejar milhares de uma vez.
  let qTick = sb.from('sac_tickets').select('id').is('atribuido_para', null).neq('fase', 'Concluído')
  if (unidadeId) qTick = qTick.eq('unidade_id', unidadeId)
  const { data: ticks } = await qTick.order('criado_em', { ascending: true }).limit(300)
  let nTick = 0
  for (const t of (ticks ?? []) as { id: string }[]) {
    const aid = menosCarregado()
    const { error: e } = await sb.from('sac_tickets').update({ atribuido_para: aid }).eq('id', t.id)
    if (!e) { carga.set(aid, (carga.get(aid) ?? 0) + 1); nTick++ }
  }

  if (nConv + nTick > 0) {
    const esc = unidadeId ? ` (unidade ${ctx?.activeUnitName ?? ''})`.trimEnd() : ' (toda a rede)'
    await audit(op.userId, 'sac.fila.distribuir', `Distribuiu ${nConv} conversa(s) e ${nTick} chamado(s)${esc}`)
  }

  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem'); revalidatePath('/sac/chamados')
  return { ok: true, conversas: nConv, tickets: nTick, atendentes: atendentes.length }
}
