'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
// ESCOPOS vem de ./constants (um 'use server' só pode exportar funções async).
import { ESCOPOS, type Escopo } from './constants'

export type ActionResult = { ok: boolean; error?: string }

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
 * (o escopo é hierárquico  escolher "empresa" cobre unidade/próprio na lógica de RLS).
 * Persistir = para cada célula alterada, remover as permissoes daquele (recurso,ação)
 * que o cargo tinha e inserir a do novo escopo (se houver).
 *
 * Usa adminClient (service-role, server-only)  RBAC não depende de RLS, igual ao
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
  // Super Admin é a âncora do sistema  não deixamos editar pelo painel (evita lockout).
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

  // Recursos e ações afetados  pega TODAS as permissoes desses pares para saber o que remover/inserir.
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

  // O que o cargo JÁ tem nesses pares  p/ preservar o escopo existente e NUNCA escalar.
  // (A matriz é binária: concede/revoga. Ela não deve regredir nem escalar o escopo de
  //  um par já concedido com escopo 'unidade'/'proprio' para 'global'.)
  const allPermIds = perms.map((p) => p.id)
  const paresJaConcedidos = new Set<string>()
  if (allPermIds.length > 0) {
    const { data: atuaisRaw, error: eAtuais } = await admin
      .from('cargo_permissoes').select('permissao_id').eq('cargo_id', cargoId).in('permissao_id', allPermIds)
    if (eAtuais) return { ok: false, error: 'Falha ao carregar as permissões atuais do cargo.' }
    const jaTem = new Set((atuaisRaw ?? []).map((r) => (r as { permissao_id: string }).permissao_id))
    for (const p of perms) if (jaTem.has(p.id)) paresJaConcedidos.add(`${p.recurso_id}|${p.acao_id}`)
  }

  const idsRemover: string[] = []
  const idsInserir: string[] = []
  let puladas = 0
  for (const c of limpos) {
    const par = `${c.recurso_id}|${c.acao_id}`
    const todosDoPar = permsDoPar.get(par) ?? []
    // Par sem permissão cadastrada (checkbox-fantasma): pula a célula, NÃO aborta o cargo inteiro.
    if (todosDoPar.length === 0) { puladas++; continue }
    if (c.escopo) {
      // CONCEDER: só concede ('global') se o par ainda NÃO está concedido  preserva o escopo de quem já tem.
      if (paresJaConcedidos.has(par)) continue
      const pid = permId.get(`${par}|${c.escopo}`)
      if (!pid) { puladas++; continue } // escopo pedido inexistente no schema → pula
      idsInserir.push(pid)
    } else {
      // REVOGAR: remove todos os escopos do par para este cargo.
      for (const id of todosDoPar) idsRemover.push(id)
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

/** Grava 1 linha em audit_log (best-effort  nunca derruba a operação principal).
 *  `acaoVerbo` define o sufixo de `acao` (ex.: 'criar' → rbac.cargo.criar). */
async function registrarAuditoria(
  userId: string,
  cargo: { id: string; nome: string; slug: string },
  dados: Record<string, unknown>,
  acaoVerbo = 'permissoes.editar',
): Promise<void> {
  try {
    const admin = adminClient()
    await admin.from('audit_log').insert({
      usuario_id: userId,
      acao: `rbac.cargo.${acaoVerbo}`,
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
  preset: 'leitura_total' | 'marcar_tudo' | 'limpar',
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

  if (!(ESCOPOS as readonly string[]).includes(escopo)) return { ok: false, error: 'Escopo inválido.' }

  // Seleciona as permissões a conceder:
  //  • leitura_total → só a ação 'ler' no escopo informado (legado: "Leitura total").
  //  • marcar_tudo   → TODAS as ações de cada par recurso/ação no escopo informado,
  //                    caindo para o MAIOR escopo disponível ≤ o pedido (cobre os 281
  //                    checkboxes do legado "Marcar todas", L7289).
  let ids: string[] = []
  if (preset === 'leitura_total') {
    const { data: lerPerms } = await admin.from('permissoes').select('id').eq('acao_id', 'ler').eq('escopo', escopo)
    ids = ((lerPerms ?? []) as { id: string }[]).map((p) => p.id)
  } else {
    // marcar_tudo: pega TODAS as permissões e, para cada (recurso,ação), escolhe o
    // escopo disponível mais próximo (≤ escopo pedido), igual à seleção do grid.
    const ORDEM: Record<string, number> = { proprio: 1, unidade: 2, empresa: 3, global: 4 }
    const teto = ORDEM[escopo] ?? 2
    const { data: allPerms } = await admin.from('permissoes').select('id, recurso_id, acao_id, escopo')
    const perms = (allPerms ?? []) as { id: string; recurso_id: string; acao_id: string; escopo: string }[]
    const melhor = new Map<string, { id: string; rank: number }>()
    for (const p of perms) {
      const rank = ORDEM[p.escopo] ?? 0
      if (rank > teto) continue // não concede escopo acima do pedido
      const k = `${p.recurso_id}|${p.acao_id}`
      const atual = melhor.get(k)
      if (!atual || rank > atual.rank) melhor.set(k, { id: p.id, rank })
    }
    ids = [...melhor.values()].map((m) => m.id)
  }
  if (ids.length === 0) return { ok: false, error: 'Sem permissões correspondentes no schema.' }

  // "Marcar todas" deve resultar exatamente no conjunto escolhido: limpamos antes
  // para não deixar escopos antigos de outras seleções no cargo.
  if (preset === 'marcar_tudo') {
    await admin.from('cargo_permissoes').delete().eq('cargo_id', cargoId)
  }

  const rows = ids.map((permissao_id) => ({ cargo_id: cargoId, permissao_id }))
  const { error: eIns, count } = await admin
    .from('cargo_permissoes')
    .upsert(rows, { onConflict: 'cargo_id,permissao_id', ignoreDuplicates: true, count: 'exact' })
  if (eIns) return { ok: false, error: `Falha ao aplicar preset: ${eIns.message}` }
  await registrarAuditoria(op.userId, cargo, { preset: `${preset}:${escopo}`, gravadas: count ?? ids.length })
  revalidatePath('/perfis'); revalidatePath(`/perfis/${cargoId}`)
  return { ok: true, gravadas: count ?? ids.length }
}

// ────────────────────────────────────────────────────────────────────────────
//  CRUD de cargos (perfis de acesso)  paridade com o legado buildPerfis/perfisRows
//  (legacy/index.html L7178-7293). O legado era 100% mock; aqui PERSISTE de verdade.
// ────────────────────────────────────────────────────────────────────────────

/** Gera um slug seguro a partir do nome (ascii, minúsculas, _). Prefixo da empresa
 *  para não colidir com os cargos do sistema (super_admin, gerente, …). */
function gerarSlug(nome: string, prefixo: string): string {
  const base = (nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return `${prefixo}${base || 'perfil'}`
}

/** Resolve a empresa do operador via usuario_cargos (1ª empresa vinculada).
 *  Fallback: a única empresa do tenant (modelo lkii tem 1 empresa raiz). */
async function resolverEmpresaDoOperador(admin: ReturnType<typeof adminClient>, userId: string): Promise<string | null> {
  const { data: uc } = await admin
    .from('usuario_cargos')
    .select('empresa_id')
    .eq('perfil_id', userId)
    .not('empresa_id', 'is', null)
    .limit(1)
  const emp = ((uc ?? []) as { empresa_id: string | null }[])[0]?.empresa_id
  if (emp) return emp
  const { data: empresas } = await admin.from('empresas').select('id').limit(1)
  return ((empresas ?? []) as { id: string }[])[0]?.id ?? null
}

/**
 * Cria um novo perfil de acesso (cargo) da empresa. Legado: btnNovoPerfil →
 * openPerfilEditor('') (L7286/7278). Insere em cargos com slug gerado, is_sistema=false,
 * ativo=true, sem orfanar usuario_cargos (nada a vincular ainda). Retorna o id criado.
 */
export async function criarCargo(input: {
  nome: string
  descricao?: string
  ativo?: boolean
  batePonto?: boolean
}): Promise<ActionResult & { id?: string }> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }

  const nome = (input?.nome || '').trim()
  if (nome.length < 2) return { ok: false, error: 'Informe o nome do perfil (mín. 2 caracteres).' }
  if (nome.length > 80) return { ok: false, error: 'Nome do perfil muito longo (máx. 80).' }

  const admin = adminClient()
  const empresaId = await resolverEmpresaDoOperador(admin, op.userId)
  if (!empresaId) return { ok: false, error: 'Não foi possível identificar a empresa para criar o perfil.' }

  // slug único: se colidir, sufixa com número.
  const prefixo = 'emp_'
  let slug = gerarSlug(nome, prefixo)
  const { data: existentes } = await admin.from('cargos').select('slug').like('slug', `${slug}%`)
  const usados = new Set(((existentes ?? []) as { slug: string }[]).map((r) => r.slug))
  if (usados.has(slug)) {
    let n = 2
    while (usados.has(`${slug}_${n}`)) n++
    slug = `${slug}_${n}`
  }

  const baseRow = {
    empresa_id: empresaId,
    nome,
    slug,
    descricao: (input?.descricao || '').trim() || null,
    is_sistema: false,
    ativo: input?.ativo === false ? false : true,
    criado_por: op.userId,
  }
  // Tenta com bate_ponto; se a coluna ainda não existe (migration rbac.sql não aplicada),
  // refaz sem ela  o perfil ainda é criado normalmente.
  let inserted: { id: string; nome: string; slug: string } | null = null
  {
    const r = await admin.from('cargos')
      .insert({ ...baseRow, bate_ponto: input?.batePonto === false ? false : true })
      .select('id, nome, slug').maybeSingle()
    if (r.error && /bate_ponto/.test(r.error.message)) {
      const r2 = await admin.from('cargos').insert(baseRow).select('id, nome, slug').maybeSingle()
      if (r2.error) return { ok: false, error: `Falha ao criar perfil: ${r2.error.message}` }
      inserted = r2.data as unknown as typeof inserted
    } else if (r.error) {
      return { ok: false, error: `Falha ao criar perfil: ${r.error.message}` }
    } else {
      inserted = r.data as unknown as typeof inserted
    }
  }
  const novo = inserted
  if (!novo) return { ok: false, error: 'Perfil não foi criado.' }

  await registrarAuditoria(op.userId, novo, { acao: 'criar', nome, slug }, 'criar')
  revalidatePath('/perfis')
  return { ok: true, id: (novo as { id: string }).id }
}

/**
 * Edita os dados básicos de um cargo. Legado: card "Dados do perfil" (input permNome +
 * select Ativo)  L7274/HTML 1736-1741. UPDATE em cargos (nome, descrição, ativo, bate_ponto).
 * Não permite editar o Super Admin (âncora do RBAC).
 */
export async function atualizarCargo(
  cargoId: string,
  input: { nome?: string; descricao?: string; ativo?: boolean; batePonto?: boolean },
): Promise<ActionResult> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!cargoId) return { ok: false, error: 'Cargo inválido.' }

  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id, nome, slug, is_sistema').eq('id', cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; nome: string; slug: string; is_sistema: boolean } | null
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }
  if (cargo.slug === 'super_admin') return { ok: false, error: 'O cargo Super Admin é protegido e não pode ser editado.' }

  const patch: Record<string, unknown> = {}
  if (input.nome !== undefined) {
    const nome = input.nome.trim()
    if (nome.length < 2) return { ok: false, error: 'Informe o nome do perfil (mín. 2 caracteres).' }
    if (nome.length > 80) return { ok: false, error: 'Nome do perfil muito longo (máx. 80).' }
    patch.nome = nome
  }
  if (input.descricao !== undefined) patch.descricao = input.descricao.trim() || null
  if (input.ativo !== undefined) patch.ativo = !!input.ativo
  if (input.batePonto !== undefined) patch.bate_ponto = !!input.batePonto
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nada para atualizar.' }

  const { error: eUpd } = await admin.from('cargos').update(patch).eq('id', cargoId)
  if (eUpd) return { ok: false, error: `Falha ao atualizar perfil: ${eUpd.message}` }

  await registrarAuditoria(op.userId, cargo, { acao: 'editar', ...patch }, 'editar')
  revalidatePath('/perfis')
  revalidatePath(`/perfis/${cargoId}`)
  return { ok: true }
}

/**
 * Ativa/inativa um cargo. Legado: ação de linha "Inativar"/"Ativar" (perfil-toggle,
 * L7205-7208). UPDATE cargos.ativo. Não mexe nos vínculos de usuário.
 */
export async function alternarAtivoCargo(cargoId: string): Promise<ActionResult & { ativo?: boolean }> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!cargoId) return { ok: false, error: 'Cargo inválido.' }

  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id, nome, slug, ativo').eq('id', cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; nome: string; slug: string; ativo: boolean } | null
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }
  if (cargo.slug === 'super_admin') return { ok: false, error: 'O cargo Super Admin é protegido.' }

  const novo = !(cargo.ativo !== false) // se ativo→inativa; se inativo→ativa
  const { error: eUpd } = await admin.from('cargos').update({ ativo: novo }).eq('id', cargoId)
  if (eUpd) return { ok: false, error: `Falha ao alternar status: ${eUpd.message}` }

  await registrarAuditoria(op.userId, cargo, { acao: novo ? 'ativar' : 'inativar' }, novo ? 'ativar' : 'inativar')
  revalidatePath('/perfis')
  revalidatePath(`/perfis/${cargoId}`)
  return { ok: true, ativo: novo }
}

/**
 * Alterna a flag "Bate ponto" do cargo. Legado: perfTogglePonto (L7213)  auditLog + toast.
 * Persiste cargos.bate_ponto (coluna nova, ver scripts/migrations/rbac.sql).
 */
export async function alternarBatePonto(cargoId: string): Promise<ActionResult & { batePonto?: boolean }> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!cargoId) return { ok: false, error: 'Cargo inválido.' }

  const admin = adminClient()
  const { data: cargoRow, error: eSel } = await admin.from('cargos').select('id, nome, slug, bate_ponto').eq('id', cargoId).maybeSingle()
  if (eSel && /bate_ponto/.test(eSel.message)) {
    return { ok: false, error: 'Aplique a migration scripts/migrations/rbac.sql no lkii (coluna bate_ponto ausente).' }
  }
  const cargo = cargoRow as { id: string; nome: string; slug: string; bate_ponto: boolean } | null
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }

  const novo = !(cargo.bate_ponto !== false)
  const { error: eUpd } = await admin.from('cargos').update({ bate_ponto: novo }).eq('id', cargoId)
  if (eUpd) {
    if (/bate_ponto/.test(eUpd.message)) return { ok: false, error: 'Aplique a migration scripts/migrations/rbac.sql no lkii (coluna bate_ponto ausente).' }
    return { ok: false, error: `Falha ao alternar bate-ponto: ${eUpd.message}` }
  }

  await registrarAuditoria(op.userId, cargo, { acao: novo ? 'ativou bate-ponto' : 'desativou bate-ponto' }, 'bate_ponto')
  revalidatePath('/perfis')
  return { ok: true, batePonto: novo }
}

/**
 * Exclui um perfil de acesso. Legado: perfDel (L7214)  confirm + auditLog + toast.
 * Valida ausência de usuario_cargos vinculados (não orfana usuários). As cargo_permissoes
 * caem em cascata (FK on delete cascade). Não exclui cargos do sistema.
 */
export async function excluirCargo(cargoId: string): Promise<ActionResult> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!cargoId) return { ok: false, error: 'Cargo inválido.' }

  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id, nome, slug, is_sistema').eq('id', cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; nome: string; slug: string; is_sistema: boolean } | null
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }
  if (cargo.slug === 'super_admin') return { ok: false, error: 'O cargo Super Admin é protegido e não pode ser excluído.' }
  if (cargo.is_sistema) return { ok: false, error: 'Cargos do sistema não podem ser excluídos. Inative-o se necessário.' }

  // Não orfanar: bloqueia se houver usuários vinculados.
  const { count: vinculos } = await admin
    .from('usuario_cargos')
    .select('id', { count: 'exact', head: true })
    .eq('cargo_id', cargoId)
  if ((vinculos ?? 0) > 0) {
    return { ok: false, error: `Há ${vinculos} usuário(s) com este perfil. Remova os vínculos antes de excluir.` }
  }

  // Remove as permissões do cargo (se não houver cascade no schema) e o cargo.
  await admin.from('cargo_permissoes').delete().eq('cargo_id', cargoId)
  const { error: eDel } = await admin.from('cargos').delete().eq('id', cargoId)
  if (eDel) return { ok: false, error: `Falha ao excluir perfil: ${eDel.message}` }

  await registrarAuditoria(op.userId, cargo, { acao: 'excluir' }, 'excluir')
  revalidatePath('/perfis')
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────────────
//  Vínculo usuário ↔ cargo (usuario_cargos)  atribuir / remover
// ────────────────────────────────────────────────────────────────────────────

/** Atribui um cargo a um usuário (usuario_cargos). empresa_id resolvido do cargo;
 *  unidade/expiração opcionais. Idempotente (upsert por perfil+cargo). */
export async function atribuirCargoUsuario(input: {
  cargoId: string
  perfilId: string
  unidadeId?: string | null
  expiraEm?: string | null
}): Promise<ActionResult> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!input?.cargoId || !input?.perfilId) return { ok: false, error: 'Informe usuário e perfil.' }

  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id, nome, slug, empresa_id').eq('id', input.cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; nome: string; slug: string; empresa_id: string | null } | null
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }

  // Confere usuário existe.
  const { data: perfil } = await admin.from('perfis_usuario').select('id, nome_completo').eq('id', input.perfilId).maybeSingle()
  if (!perfil) return { ok: false, error: 'Usuário não encontrado.' }

  const empresaId = cargo.empresa_id ?? (await resolverEmpresaDoOperador(admin, op.userId))
  if (!empresaId) return { ok: false, error: 'Não foi possível identificar a empresa do vínculo.' }

  // Já existe vínculo (mesmo perfil+cargo)? Reativa em vez de duplicar.
  const { data: existRow } = await admin
    .from('usuario_cargos')
    .select('id')
    .eq('perfil_id', input.perfilId)
    .eq('cargo_id', input.cargoId)
    .maybeSingle()
  const exist = existRow as { id: string } | null

  if (exist) {
    const { error: eUpd } = await admin
      .from('usuario_cargos')
      .update({ ativo: true, unidade_id: input.unidadeId ?? null, expira_em: input.expiraEm ?? null })
      .eq('id', exist.id)
    if (eUpd) return { ok: false, error: `Falha ao reativar vínculo: ${eUpd.message}` }
  } else {
    const { error: eIns } = await admin.from('usuario_cargos').insert({
      perfil_id: input.perfilId,
      cargo_id: input.cargoId,
      empresa_id: empresaId,
      unidade_id: input.unidadeId ?? null,
      ativo: true,
      atribuido_por: op.userId,
      expira_em: input.expiraEm ?? null,
    })
    if (eIns) return { ok: false, error: `Falha ao atribuir perfil: ${eIns.message}` }
  }

  await registrarAuditoria(op.userId, cargo, { acao: 'atribuir cargo', perfil_id: input.perfilId }, 'usuario.atribuir')
  revalidatePath('/perfis')
  revalidatePath(`/perfis/${input.cargoId}`)
  return { ok: true }
}

/** Remove o vínculo usuário↔cargo (usuario_cargos). */
export async function removerCargoUsuario(input: { cargoId: string; perfilId: string }): Promise<ActionResult> {
  const { op, error } = await gateAdmin()
  if (!op) return { ok: false, error }
  if (!input?.cargoId || !input?.perfilId) return { ok: false, error: 'Vínculo inválido.' }

  const admin = adminClient()
  const { data: cargoRow } = await admin.from('cargos').select('id, nome, slug').eq('id', input.cargoId).maybeSingle()
  const cargo = cargoRow as { id: string; nome: string; slug: string } | null
  if (!cargo) return { ok: false, error: 'Cargo não encontrado.' }

  const { error: eDel } = await admin
    .from('usuario_cargos')
    .delete()
    .eq('perfil_id', input.perfilId)
    .eq('cargo_id', input.cargoId)
  if (eDel) return { ok: false, error: `Falha ao remover vínculo: ${eDel.message}` }

  await registrarAuditoria(op.userId, cargo, { acao: 'remover cargo', perfil_id: input.perfilId }, 'usuario.remover')
  revalidatePath('/perfis')
  revalidatePath(`/perfis/${input.cargoId}`)
  return { ok: true }
}

// TODO(legado: buildPerfis)  exportar a matriz de permissões (Excel/CSV) do cargo.
