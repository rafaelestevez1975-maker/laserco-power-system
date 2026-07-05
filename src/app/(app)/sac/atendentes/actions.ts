'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel, ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/session'
import { candidatosOnline } from '@/lib/sac-distribuicao'
import type { SB } from '@/lib/sb'

export type DistribResult = { ok: boolean; error?: string; conversas?: number; tickets?: number; atendentes?: number }

// Cargos do SAC que o "Novo atendente" pode atribuir (todos resolvem só para recursos sac.*,
// então o usuário enxerga apenas o módulo SAC). Atendente = padrão. (Não exportar: este é um
// módulo 'use server'  só funções async podem ser exportadas; o componente define o seu rótulo.)
const SLUGS_SAC = new Set(['atendente_sac', 'supervisor_sac', 'consulta_sac'])

export type CriarAtendenteInput = { nome: string; email: string; senha: string; telefone?: string; unidadeId?: string | null; cargoSlug?: string }

const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

/** Trilha de auditoria (secundária  nunca quebra a ação principal). Mesma tabela
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
  //    fica com recursos=[] e não enxerga NADA no menu  papel 'sac' sozinho não dá acesso.
  //    É o RBAC real (usuario_cargos → cargo_permissoes → permissoes) que libera o módulo SAC.
  const cargoSlug = SLUGS_SAC.has(input.cargoSlug || '') ? (input.cargoSlug as string) : 'atendente_sac'
  const { data: cargoRow } = await admin.from('cargos').select('id').eq('slug', cargoSlug).maybeSingle()
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
    console.error('criarAcessoAtendente: cargo slug "atendente_sac" não encontrado  atendente ficará sem acesso até receber um cargo.')
  }

  await audit(op.userId, 'sac.atendente.criar', `Criou acesso SAC de ${nome}`)
  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Liga/desliga a presença SAC do PRÓPRIO operador. Online = recebe conversas automaticamente
 *  (entra na auto-distribuição); Offline = não recebe. Pedido do Julio (toggle no menu do nome). */
export async function definirPresencaSac(online: boolean): Promise<{ ok: boolean; online?: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const { error: e } = await adminClient().from('perfis_usuario').update({ sac_online: !!online }).eq('id', op.userId)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar a presença') }
  revalidatePath('/sac/triagem'); revalidatePath('/sac/atendentes')
  return { ok: true, online: !!online }
}

/** Admin liga/desliga a presença SAC de OUTRO atendente. Resolve o "tudo cai numa pessoa só"
 *  quando as demais esqueceram de ficar online (a auto-distribuição só sorteia quem está online). */
export async function definirPresencaAtendente(id: string, online: boolean): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode alterar a presença de outro atendente.' }
  if (!id) return { ok: false, error: 'Atendente inválida.' }
  const admin = adminClient()
  const { data: perfil } = await admin.from('perfis_usuario').select('nome_completo').eq('id', id).maybeSingle()
  if (!perfil) return { ok: false, error: 'Atendente não encontrada.' }
  const { error: e } = await admin.from('perfis_usuario').update({ sac_online: !!online }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar a presença') }
  await audit(op.userId, online ? 'sac.atendente.online' : 'sac.atendente.offline', `${online ? 'Ativou' : 'Desativou'} a presença de ${(perfil as { nome_completo?: string }).nome_completo || 'atendente'}`)
  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Admin troca o CARGO SAC de um atendente (Atendente ⇄ Supervisor ⇄ Consulta). Remove os
 *  vínculos SAC anteriores e cria o novo. Muda o que a pessoa vê e se entra na distribuição
 *  (consulta_sac fica de fora). O menu da pessoa só reflete após novo login (RBAC em cache). */
export async function definirCargoAtendente(id: string, cargoSlug: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode alterar o cargo do atendente.' }
  if (!id) return { ok: false, error: 'Atendente inválida.' }
  if (!SLUGS_SAC.has(cargoSlug)) return { ok: false, error: 'Cargo inválido.' }
  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id').eq('slug', cargoSlug).maybeSingle()
  const novoCargoId = (cargoRow as { id: string } | null)?.id
  if (!novoCargoId) return { ok: false, error: 'Cargo não encontrado.' }
  // Remove só os cargos SAC operacionais/consulta anteriores (preserva outros vínculos, ex.: admin_sac).
  const { data: sacCargos } = await admin.from('cargos').select('id').in('slug', [...SLUGS_SAC])
  const sacIds = ((sacCargos ?? []) as { id: string }[]).map((c) => c.id)
  if (sacIds.length) await admin.from('usuario_cargos').delete().eq('perfil_id', id).in('cargo_id', sacIds)
  const { data: perfil } = await admin.from('perfis_usuario').select('nome_completo, unidade_id').eq('id', id).maybeSingle()
  const p = perfil as { nome_completo?: string; unidade_id?: string | null } | null
  const empresaId = await resolverEmpresa(admin, op.userId)
  const { error: e } = await admin.from('usuario_cargos').insert({
    perfil_id: id, cargo_id: novoCargoId, empresa_id: empresaId,
    unidade_id: p?.unidade_id ?? null, ativo: true, atribuido_por: op.userId,
  })
  if (e && !/duplicate|already|unique/i.test(e.message)) return { ok: false, error: msgErro(e.message, 'alterar o cargo') }
  await audit(op.userId, 'sac.atendente.cargo', `Alterou cargo de ${p?.nome_completo || 'atendente'} → ${cargoSlug}`)
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
    // Filtro de unidade inline (o generic de scopeUnidade estoura a profundidade do tipo  TS2589).
    // Só conversas ABERTAS entram na carga (as resolvidas não são trabalho vivo).
    let qConv = sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).eq('atendente_id', id).eq('status', 'aberto')
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

  // Só atendentes ONLINE + operacionais (mesma regra da auto-distribuição  QA 05/07: o botão
  // manual usava listAtendentesSac e podia despejar a fila em quem estava OFFLINE).
  const online = await candidatosOnline(sb, unidadeId)
  if (online.length === 0) return { ok: false, error: 'Nenhuma atendente ONLINE para distribuir. Peça para ficarem online (ou distribua quando estiverem).' }

  const carga = await cargaPorAtendente(sb, online, unidadeId)
  const menosCarregado = () => {
    let best = online[0], min = Infinity
    for (const id of online) { const c = carga.get(id) ?? 0; if (c < min) { min = c; best = id } }
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
  return { ok: true, conversas: nConv, tickets: nTick, atendentes: online.length }
}

/** Reequilibra o BACKLOG: redistribui as conversas ABERTAS já atribuídas entre as atendentes
 *  ONLINE, com MÍNIMA perturbação  cada uma mantém as suas até o alvo (total/nº online); só o
 *  excedente e as conversas de quem não está online migram para as de menor carga. Idempotente. */
export async function reequilibrarBacklog(): Promise<{ ok: boolean; movidas?: number; atendentes?: number; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'sac', 'gestor')) return { ok: false, error: 'Você não tem permissão para reequilibrar o atendimento.' }
  const sb = op.sb
  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null

  const cands = await candidatosOnline(sb, unidadeId)
  if (cands.length === 0) return { ok: false, error: 'Nenhuma atendente online para receber as conversas. Ponha ao menos uma online.' }
  if (cands.length === 1) return { ok: false, error: 'Só há uma atendente online  não há entre quem dividir. Ponha outra online.' }

  let qChats = sb.from('sac_whatsapp_chats').select('id, atendente_id').eq('status', 'aberto').not('atendente_id', 'is', null)
  if (unidadeId) qChats = qChats.eq('unidade_id', unidadeId)
  const { data: chatsRaw } = await qChats.limit(3000)
  const chats = (chatsRaw ?? []) as { id: string; atendente_id: string | null }[]
  const total = chats.length
  if (total === 0) return { ok: true, movidas: 0, atendentes: cands.length }
  const alvo = Math.ceil(total / cands.length)

  // Mantém cada candidata até o alvo; o resto vai pro pool a redistribuir.
  const carga = new Map<string, number>(cands.map((id) => [id, 0]))
  const pool: string[] = []
  for (const ch of chats) {
    const dono = ch.atendente_id
    if (dono && carga.has(dono) && (carga.get(dono) as number) < alvo) carga.set(dono, (carga.get(dono) as number) + 1)
    else pool.push(ch.id)
  }
  const porAtendente = new Map<string, string[]>(cands.map((id) => [id, []]))
  for (const chatId of pool) {
    let best = cands[0], min = Infinity
    for (const id of cands) { const c = carga.get(id) as number; if (c < min) { min = c; best = id } }
    carga.set(best, (carga.get(best) as number) + 1)
    ;(porAtendente.get(best) as string[]).push(chatId)
  }

  let movidas = 0
  for (const [aid, ids] of porAtendente) {
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200)
      const { error: e } = await sb.from('sac_whatsapp_chats').update({ atendente_id: aid }).in('id', lote)
      if (!e) movidas += lote.length
    }
  }
  if (movidas > 0) await audit(op.userId, 'sac.backlog.reequilibrar', `Reequilibrou ${movidas} conversa(s) entre ${cands.length} atendente(s) online`)
  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true, movidas, atendentes: cands.length }
}
