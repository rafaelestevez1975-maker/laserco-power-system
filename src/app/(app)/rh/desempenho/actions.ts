'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * Módulo RH · Desempenho  substitui o clone estático do protótipo.
 *
 * Tabelas REAIS (introspecção lkii  ver scratchpad/schemas.txt):
 *  - avaliacoes_desempenho: id, colaborador_id, avaliador_id, periodo (text),
 *      nota_produtividade, nota_qualidade, nota_comportamento, nota_trabalho_equipe,
 *      nota_geral (numeric 0–5), observacoes, criado_em.
 *  - pdi (Plano de Desenvolvimento Individual): id, colaborador_id, responsavel_id,
 *      titulo, descricao, prazo (date), status (text), progresso (int), criado_em, atualizado_em.
 *  - metas_colaborador: já tem CRUD próprio em /cadastros/metas  aqui só lemos (resumo).
 *
 * Nenhuma das três tabelas tem coluna `unidade_id` → o escopo multitenant é aplicado
 * via o conjunto de colaboradores da unidade ativa (filtrados na page por unidade_id).
 *
 * RBAC: só gestor/admin/rh criam/editam avaliações e PDIs (gate de UI + revalidação aqui).
 */
const PAPEIS_ESCRITA = ['gestor', 'gerente', 'rh']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

/** Notas de 0 a 5 (escala do protótipo "Nota média 4,8"). */
const NOTA_MIN = 0
const NOTA_MAX = 5

const PDI_STATUS = ['planejado', 'em_andamento', 'concluido', 'cancelado'] as const

/** Converte "4,5" / "4.5" / number em número (ou null se vazio/ inválido). */
function parseNota(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// ─────────────────────────── Avaliações de desempenho ───────────────────────────

export type AvaliacaoInput = {
  colaborador_id: string
  periodo: string
  nota_produtividade?: number | string | null
  nota_qualidade?: number | string | null
  nota_comportamento?: number | string | null
  nota_trabalho_equipe?: number | string | null
  nota_geral?: number | string | null
  observacoes?: string | null
}

type NotaCampo = 'nota_produtividade' | 'nota_qualidade' | 'nota_comportamento' | 'nota_trabalho_equipe'
const NOTA_LABEL: Record<NotaCampo, string> = {
  nota_produtividade: 'Produtividade',
  nota_qualidade: 'Qualidade',
  nota_comportamento: 'Comportamento',
  nota_trabalho_equipe: 'Trabalho em equipe',
}

/** Valida e normaliza uma avaliação. Retorna { erro } ou { payload }. */
function montarAvaliacao(input: AvaliacaoInput): { erro: string } | { payload: Record<string, unknown> } {
  if (!input.colaborador_id) return { erro: 'Selecione o colaborador.' }
  const periodo = (input.periodo || '').trim()
  if (!periodo) return { erro: 'Informe o período da avaliação (ex.: 2026-Q2).' }

  const campos: NotaCampo[] = ['nota_produtividade', 'nota_qualidade', 'nota_comportamento', 'nota_trabalho_equipe']
  const notas: Record<string, number | null> = {}
  for (const c of campos) {
    const n = parseNota(input[c])
    if (n != null && (n < NOTA_MIN || n > NOTA_MAX)) return { erro: `${NOTA_LABEL[c]} deve ser entre ${NOTA_MIN} e ${NOTA_MAX}.` }
    notas[c] = n
  }

  // Nota geral: usa a informada, senão calcula a média das notas preenchidas.
  let geral = parseNota(input.nota_geral)
  if (geral != null && (geral < NOTA_MIN || geral > NOTA_MAX)) return { erro: `Nota geral deve ser entre ${NOTA_MIN} e ${NOTA_MAX}.` }
  if (geral == null) {
    const preenchidas = campos.map((c) => notas[c]).filter((n): n is number => n != null)
    if (preenchidas.length > 0) geral = Math.round((preenchidas.reduce((a, b) => a + b, 0) / preenchidas.length) * 100) / 100
  }

  return {
    payload: {
      colaborador_id: input.colaborador_id,
      periodo,
      ...notas,
      nota_geral: geral,
      observacoes: (input.observacoes || '').trim() || null,
    },
  }
}

/** Cria uma avaliação de desempenho. RBAC: gestor/gerente/rh/admin. avaliador_id = usuário logado. */
export async function criarAvaliacao(input: AvaliacaoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para registrar avaliações.' }

  const r = montarAvaliacao(input)
  if ('erro' in r) return { ok: false, error: r.erro }

  const { data, error: e } = await op.sb
    .from('avaliacoes_desempenho')
    .insert({ ...r.payload, avaliador_id: op.userId })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'registrar avaliação') }
  revalidatePath('/rh/desempenho')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita uma avaliação existente. RBAC: gestor/gerente/rh/admin. */
export async function salvarAvaliacao(id: string, input: AvaliacaoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar avaliações.' }
  if (!id) return { ok: false, error: 'Avaliação inválida.' }

  const r = montarAvaliacao(input)
  if ('erro' in r) return { ok: false, error: r.erro }

  const { error: e } = await op.sb.from('avaliacoes_desempenho').update(r.payload).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar avaliação') }
  revalidatePath('/rh/desempenho')
  return { ok: true }
}

/** Exclui uma avaliação. RBAC: gestor/gerente/rh/admin. */
export async function excluirAvaliacao(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para excluir avaliações.' }
  if (!id) return { ok: false, error: 'Avaliação inválida.' }

  const { error: e } = await op.sb.from('avaliacoes_desempenho').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir avaliação') }
  revalidatePath('/rh/desempenho')
  return { ok: true }
}

// ─────────────────────────── PDI (Plano de Desenvolvimento Individual) ───────────────────────────

export type PdiInput = {
  colaborador_id: string
  titulo: string
  descricao?: string | null
  prazo?: string | null
  status?: string | null
  progresso?: number | string | null
}

/** Valida e normaliza um PDI. Retorna { erro } ou { payload }. */
function montarPdi(input: PdiInput): { erro: string } | { payload: Record<string, unknown> } {
  if (!input.colaborador_id) return { erro: 'Selecione o colaborador.' }
  const titulo = (input.titulo || '').trim()
  if (!titulo) return { erro: 'Informe o título do plano de desenvolvimento.' }

  const status = (input.status || 'planejado').trim()
  if (!PDI_STATUS.includes(status as (typeof PDI_STATUS)[number])) return { erro: 'Status do PDI inválido.' }

  let progresso: number | null = null
  if (input.progresso != null && input.progresso !== '') {
    const p = typeof input.progresso === 'number' ? input.progresso : Number(String(input.progresso).trim())
    if (!Number.isFinite(p) || !Number.isInteger(p) || p < 0 || p > 100) return { erro: 'Progresso deve ser inteiro entre 0 e 100.' }
    progresso = p
  }

  return {
    payload: {
      colaborador_id: input.colaborador_id,
      titulo,
      descricao: (input.descricao || '').trim() || null,
      prazo: input.prazo || null,
      status,
      progresso: progresso ?? 0,
    },
  }
}

/** Cria um PDI. RBAC: gestor/gerente/rh/admin. responsavel_id = usuário logado. */
export async function criarPdi(input: PdiInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para criar PDIs.' }

  const r = montarPdi(input)
  if ('erro' in r) return { ok: false, error: r.erro }

  const { data, error: e } = await op.sb
    .from('pdi')
    .insert({ ...r.payload, responsavel_id: op.userId })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'criar PDI') }
  revalidatePath('/rh/desempenho')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita um PDI existente. RBAC: gestor/gerente/rh/admin. */
export async function salvarPdi(id: string, input: PdiInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar PDIs.' }
  if (!id) return { ok: false, error: 'PDI inválido.' }

  const r = montarPdi(input)
  if ('erro' in r) return { ok: false, error: r.erro }

  const { error: e } = await op.sb
    .from('pdi')
    .update({ ...r.payload, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'salvar PDI') }
  revalidatePath('/rh/desempenho')
  return { ok: true }
}

/** Atualiza o progresso de um PDI (lançamento rápido). RBAC: gestor/gerente/rh/admin. */
export async function atualizarProgressoPdi(id: string, progresso: number): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para atualizar PDIs.' }
  if (!id) return { ok: false, error: 'PDI inválido.' }
  if (!Number.isInteger(progresso) || progresso < 0 || progresso > 100) return { ok: false, error: 'Progresso deve ser inteiro entre 0 e 100.' }

  // Concluído ao chegar a 100%.
  const status = progresso >= 100 ? 'concluido' : undefined
  const { error: e } = await op.sb
    .from('pdi')
    .update({ progresso, ...(status ? { status } : {}), atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'atualizar progresso') }
  revalidatePath('/rh/desempenho')
  return { ok: true }
}

/** Exclui um PDI. RBAC: gestor/gerente/rh/admin. */
export async function excluirPdi(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para excluir PDIs.' }
  if (!id) return { ok: false, error: 'PDI inválido.' }

  const { error: e } = await op.sb.from('pdi').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir PDI') }
  revalidatePath('/rh/desempenho')
  return { ok: true }
}
