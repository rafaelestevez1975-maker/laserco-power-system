'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'

export type ActionResult = { ok: boolean; error?: string }

/** Escopos válidos, do mais restrito ao mais amplo (ordem usada no editor). */
export const ESCOPOS = ['proprio', 'unidade', 'empresa', 'global'] as const
export type Escopo = (typeof ESCOPOS)[number]

/**
 * Mudança de uma célula do grid: recurso × ação → escopo selecionado (ou null = sem permissão).
 * O editor manda só o que mudou (diff) em relação ao estado salvo.
 */
export type CellChange = {
  recurso_id: string
  acao_id: string
  escopo: Escopo | null
}

const SEM_PERM = 'Apenas o administrador geral edita perfis de acesso.'

/** Só admin_geral edita RBAC (gate forte; é o "todo botão com permissão"). */
async function gateAdmin() {
  const { op, error } = await requireOperador()
  if (!op) return { op: null as null, error: error || 'Sessão expirada.' }
  if (!ehAdmin(op.papel)) return { op: null as null, error: SEM_PERM }
  return { op, error: undefined }
}

/**
 * Salva as permissões de um cargo a partir do diff de células do grid.
 *
 * Modelo: cada par (recurso, ação) admite no máximo 1 escopo selecionado no editor
 * (o escopo é hierárquico — escolher "empresa" cobre unidade/próprio na lógica de RLS).
 * Persistir = para cada célula alterada, remover as permissoes daquele (recurso,ação)
 * que o cargo tinha e inserir a do novo escopo (se houver).
 *
 * Usa adminClient (service-role, server-only) — RBAC não depende de RLS, igual ao
 * resolveRecursos() de lib/session. Gate forte: só admin_geral chega aqui.
 */
export async function salvarPermissoesCargo(
  cargoId: string,
  changes: CellChange[],
): Promise<ActionResult & { gravadas?: number; removidas?: number }> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!cargoId) return { ok: false, error: 'Cargo inválido.' }
  if (!Array.isArray(changes) || changes.length === 0) return { ok: false, error: 'Nenhuma alteração para salvar.' }

  const admin = adminClient()

  // Cargo precisa existir e não ser do sistema só-leitura crítico (Super Admin).
  const { data: cargoRow, error: eCargo } = await admin
    .from('cargos')
    .select('id, nome, slug, is_sistema, ativo')
    .eq('id', cargoId)
    .maybeSingle()
  const cargo = cargoRow as { id: string; nome: string; slug: string; is_sistema: boolean; ativo: boolean } | null
  if (eCargo) return { ok: false, error: 'Falha ao carregar o cargo.' }
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }
  // Super Admin é a âncora do sistema — não deixamos editar pelo painel (evita lockout).
  if (cargo.slug === 'super_admin') return { ok: false, error: 'O cargo Super Admin é protegido e não pode ser editado.' }

  // ── Validação por campo + resolução das permissao_id pelo schema real ──
  const ACOES = new Set(['admin', 'aprovar', 'criar', 'deletar', 'editar', 'exportar', 'ler'])
  const ESC = new Set(ESCOPOS as readonly string[])
  const limpos: CellChange[] = []
  for (const c of changes) {
    if (!c?.recurso_id || typeof c.recurso_id !== 'string') return { ok: false, error: 'Recurso inválido na alteração.' }
    if (!ACOES.has(c.acao_id)) return { ok: false, error: `Ação inválida: ${c.acao_id}.` }
    if (c.escopo !== null && !ESC.has(c.escopo)) return { ok: false, error: `Escopo inválido: ${c.escopo}.` }
    limpos.push({ recurso_id: c.recurso_id, acao_id: c.acao_id, escopo: c.escopo })
  }

  // Recursos e ações afetados — pega TODAS as permissoes desses pares para saber o que remover/inserir.
  const recursoIds = [...new Set(limpos.map((c) => c.recurso_id))]
  const acaoIds = [...new Set(limpos.map((c) => c.acao_id))]
  const { data: permsRaw, error: ePerms } = await admin
    .from('permissoes')
    .select('id, recurso_id, acao_id, escopo')
    .in('recurso_id', recursoIds)
    .in('acao_id', acaoIds)
  if (ePerms) return { ok: false, error: 'Falha ao carregar as permissões do schema.' }
  const perms = (permsRaw ?? []) as { id: string; recurso_id: string; acao_id: string; escopo: string }[]
  // índice (recurso|acao|escopo) → permissao_id
  const permId = new Map<string, string>()
  // índice (recurso|acao) → todas as permissao_id (todos os escopos) p/ remoção
  const permsDoPar = new Map<string, string[]>()
  for (const p of perms) {
    permId.set(`${p.recurso_id}|${p.acao_id}|${p.escopo}`, p.id)
    const k = `${p.recurso_id}|${p.acao_id}`
    permsDoPar.set(k, [...(permsDoPar.get(k) ?? []), p.id])
  }

  const idsRemover: string[] = []
  const idsInserir: string[] = []
  for (const c of limpos) {
    const todosDoPar = permsDoPar.get(`${c.recurso_id}|${c.acao_id}`) ?? []
    if (todosDoPar.length === 0) return { ok: false, error: `Par recurso/ação sem permissão cadastrada: ${c.recurso_id}/${c.acao_id}.` }
    // remove todos os escopos desse par (depois reinsere só o escolhido)
    for (const id of todosDoPar) idsRemover.push(id)
    if (c.escopo) {
      const pid = permId.get(`${c.recurso_id}|${c.acao_id}|${c.escopo}`)
      if (!pid) return { ok: false, error: `Permissão inexistente: ${c.recurso_id}/${c.acao_id}/${c.escopo}.` }
      idsInserir.push(pid)
    }
  }

  // ── Persistência: remove os escopos antigos dos pares tocados, insere os novos ──
  let removidas = 0
  if (idsRemover.length > 0) {
    const { error: eDel, count } = await admin
      .from('cargo_permissoes')
      .delete({ count: 'exact' })
      .eq('cargo_id', cargoId)
      .in('permissao_id', idsRemover)
    if (eDel) return { ok: false, error: `Falha ao remover permissões: ${eDel.message}` }
    removidas = count ?? 0
  }

  let gravadas = 0
  if (idsInserir.length > 0) {
    const rows = idsInserir.map((permissao_id) => ({ cargo_id: cargoId, permissao_id }))
    // upsert para tolerar concorrência / reexecução (PK composta cargo_id+permissao_id).
    const { error: eIns, count } = await admin
      .from('cargo_permissoes')
      .upsert(rows, { onConflict: 'cargo_id,permissao_id', ignoreDuplicates: true, count: 'exact' })
    if (eIns) return { ok: false, error: `Falha ao gravar permissões: ${eIns.message}` }
    gravadas = count ?? idsInserir.length
  }

  // ── Auditoria da mudança (audit_log) ──
  await registrarAuditoria(op.userId, cargo, {
    alteracoes: limpos.length,
    removidas,
    gravadas,
    detalhe: limpos.slice(0, 50).map((c) => `${c.recurso_id}.${c.acao_id}=${c.escopo ?? '∅'}`),
  })

  revalidatePath('/perfis')
  revalidatePath(`/perfis/${cargoId}`)
  return { ok: true, gravadas, removidas }
}

/** Grava 1 linha em audit_log (best-effort — nunca derruba a operação principal). */
async function registrarAuditoria(
  userId: string,
  cargo: { id: string; nome: string; slug: string },
  dados: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = adminClient()
    await admin.from('audit_log').insert({
      usuario_id: userId,
      acao: 'rbac.cargo.permissoes.editar',
      recurso_id: 'sistema.cargo',
      recurso_uuid: cargo.id,
      recurso_label: `${cargo.nome} (${cargo.slug})`,
      dados_depois: dados,
      origem: 'web',
      resultado: 'sucesso',
    })
  } catch {
    // auditoria é secundária; segue o jogo
  }
}

/**
 * Aplica um preset rápido a um cargo: concede a ação 'ler' (escopo escolhido) em
 * TODOS os recursos, ou limpa tudo. Atalho do editor para perfis novos.
 */
export async function aplicarPreset(
  cargoId: string,
  preset: 'leitura_total' | 'limpar',
  escopo: Escopo = 'unidade',
): Promise<ActionResult & { gravadas?: number; removidas?: number }> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!cargoId) return { ok: false, error: 'Cargo inválido.' }

  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id, nome, slug').eq('id', cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; nome: string; slug: string } | null
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }
  if (cargo.slug === 'super_admin') return { ok: false, error: 'O cargo Super Admin é protegido.' }

  if (preset === 'limpar') {
    const { error: eDel, count } = await admin.from('cargo_permissoes').delete({ count: 'exact' }).eq('cargo_id', cargoId)
    if (eDel) return { ok: false, error: `Falha ao limpar: ${eDel.message}` }
    await registrarAuditoria(op.userId, cargo, { preset: 'limpar', removidas: count ?? 0 })
    revalidatePath('/perfis'); revalidatePath(`/perfis/${cargoId}`)
    return { ok: true, removidas: count ?? 0 }
  }

  // leitura_total: concede 'ler' no escopo informado em todos os recursos
  if (!(ESCOPOS as readonly string[]).includes(escopo)) return { ok: false, error: 'Escopo inválido.' }
  const { data: lerPerms } = await admin.from('permissoes').select('id').eq('acao_id', 'ler').eq('escopo', escopo)
  const ids = ((lerPerms ?? []) as { id: string }[]).map((p) => p.id)
  if (ids.length === 0) return { ok: false, error: 'Sem permissões de leitura no schema.' }
  const rows = ids.map((permissao_id) => ({ cargo_id: cargoId, permissao_id }))
  const { error: eIns, count } = await admin
    .from('cargo_permissoes')
    .upsert(rows, { onConflict: 'cargo_id,permissao_id', ignoreDuplicates: true, count: 'exact' })
  if (eIns) return { ok: false, error: `Falha ao aplicar preset: ${eIns.message}` }
  await registrarAuditoria(op.userId, cargo, { preset: `leitura_total:${escopo}`, gravadas: count ?? ids.length })
  revalidatePath('/perfis'); revalidatePath(`/perfis/${cargoId}`)
  return { ok: true, gravadas: count ?? ids.length }
}

// TODO(legado: buildPerfis) — criar/editar cargo (nome, slug, descrição), ativar/inativar
//   e excluir cargo. O legado (PERFIS[]) era 100% mock; aqui priorizamos o editor de
//   permissões que PERSISTE. CRUD de cargos exige cuidar de empresa_id/is_sistema e de
//   não orfanar usuario_cargos; deixado para a próxima onda.
// TODO(legado: buildPerfis) — atribuir/remover cargo de usuário (usuario_cargos) com
//   empresa_id/unidade_id/expira_em. Hoje só leitura da contagem por cargo.
// TODO(legado: buildPerfis) — exportar a matriz de permissões (Excel/CSV) do cargo.
