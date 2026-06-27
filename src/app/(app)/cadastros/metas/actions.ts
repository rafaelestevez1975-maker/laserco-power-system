'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * CRUD de metas por colaborador sobre a tabela REAL `metas_colaborador` (estava vazia).
 *
 * Colunas (introspecção lkii):
 *   id, colaborador_id (FK colaboradores, NOT NULL), criado_por (FK perfis_usuario),
 *   indicador (text), peso (int), unidade_medida (text), valor_alvo (numeric),
 *   valor_realizado (numeric), periodo_inicio (date), periodo_fim (date),
 *   status (text), criado_em, atualizado_em.
 *
 * NÃO há coluna unidade_id aqui → o escopo de unidade é aplicado via o colaborador
 * (filtramos colaboradores pela unidade ativa na page). RBAC: só gestor/admin escrevem.
 *
 * As metas de venda mín. R$100k são por UNIDADE (regras de negócio do legado) e não têm
 * tabela no backend → o painel da unidade é um simulador. Aqui persistimos metas
 * individuais/por colaborador (indicador = venda, agendamentos, clientes_novos, etc.).
 */
const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

/** Indicadores aceitos — espelham as metas do legado. */
export const INDICADORES = ['venda', 'agendamentos', 'clientes_novos', 'indicacoes', 'sessoes'] as const
export type Indicador = (typeof INDICADORES)[number]

/** Período de apuração (legado: mensal / quinzenal / decendial). */
export const PERIODOS = ['mensal', 'quinzenal', 'decendial'] as const

export type MetaInput = {
  colaborador_id: string
  indicador: string
  unidade_medida?: string | null
  valor_alvo: number
  valor_realizado?: number | null
  peso?: number | null
  periodo_inicio?: string | null
  periodo_fim?: string | null
  status?: string | null
}

// Meta mínima de venda no legado: R$ 100.000 (mês).
const META_VENDA_MIN = 100000

/** Validação por campo (criar/editar). Retorna msg ou null. */
function validar(input: MetaInput): string | null {
  if (!input.colaborador_id) return 'Selecione o colaborador.'
  const ind = (input.indicador || '').trim()
  if (!ind) return 'Informe o indicador da meta.'

  const alvo = input.valor_alvo
  if (alvo == null || !Number.isFinite(alvo)) return 'Informe o valor da meta (alvo).'
  if (alvo < 0) return 'A meta não pode ser negativa.'
  // Regra do legado: meta de VENDA nunca abaixo de R$ 100.000 (mensal).
  if (ind === 'venda' && alvo < META_VENDA_MIN) return `Meta de venda mensal mínima é ${META_VENDA_MIN.toLocaleString('pt-BR')} (R$).`

  if (input.valor_realizado != null && (!Number.isFinite(input.valor_realizado) || input.valor_realizado < 0)) return 'Realizado inválido.'
  if (input.peso != null && (!Number.isInteger(input.peso) || input.peso < 0 || input.peso > 100)) return 'Peso deve ser inteiro entre 0 e 100.'

  if (input.periodo_inicio && input.periodo_fim && input.periodo_inicio > input.periodo_fim) return 'O início do período não pode ser depois do fim.'
  return null
}

function payload(input: MetaInput, criadoPor?: string) {
  return {
    colaborador_id: input.colaborador_id,
    indicador: (input.indicador || '').trim(),
    unidade_medida: (input.unidade_medida || '').trim() || null,
    valor_alvo: input.valor_alvo,
    valor_realizado: input.valor_realizado != null ? input.valor_realizado : 0,
    peso: input.peso != null ? input.peso : null,
    periodo_inicio: input.periodo_inicio || null,
    periodo_fim: input.periodo_fim || null,
    status: (input.status || 'ativa').trim(),
    ...(criadoPor ? { criado_por: criadoPor } : {}),
  }
}

/** Cria uma meta de colaborador. RBAC: gestor/admin. */
export async function criarMeta(input: MetaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar metas.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { data, error: e } = await op.sb
    .from('metas_colaborador')
    .insert(payload(input, op.userId))
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar meta') }
  revalidatePath('/cadastros/metas')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita uma meta existente. RBAC: gestor/admin. */
export async function salvarMeta(id: string, input: MetaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar metas.' }
  if (!id) return { ok: false, error: 'Meta inválida.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { error: e } = await op.sb
    .from('metas_colaborador')
    .update({ ...payload(input), atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'salvar meta') }
  revalidatePath('/cadastros/metas')
  return { ok: true }
}

/** Atualiza o realizado de uma meta (lançamento rápido). RBAC: gestor/admin. */
export async function atualizarRealizado(id: string, valorRealizado: number): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para atualizar metas.' }
  if (!id) return { ok: false, error: 'Meta inválida.' }
  if (!Number.isFinite(valorRealizado) || valorRealizado < 0) return { ok: false, error: 'Realizado inválido.' }

  const { error: e } = await op.sb
    .from('metas_colaborador')
    .update({ valor_realizado: valorRealizado, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'atualizar realizado') }
  revalidatePath('/cadastros/metas')
  return { ok: true }
}

/** Exclui uma meta. RBAC: gestor/admin. */
export async function excluirMeta(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para excluir metas.' }
  if (!id) return { ok: false, error: 'Meta inválida.' }

  const { error: e } = await op.sb.from('metas_colaborador').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir meta') }
  revalidatePath('/cadastros/metas')
  return { ok: true }
}

// TODO(needs-table: metas_unidade) — metas de unidade (venda mín. R$100k, agendamentos,
// clientes novos, indicações) com regras automáticas de reajuste do legado (3º mês = média
// dos 2 anteriores; novembro +40%; dezembro = patamar de outubro). Sem tabela própria no
// backend, o painel da unidade é um SIMULADOR (não persiste) — igual ao legado, cujo botão
// mSalvar também só exibe "Metas salvas e publicadas no Dashboard" sem persistir.
// A meta diária de indicações já foi alinhada à base 30 do legado (indMetaSync): meta diária
// = ceil(meta/30) e projeção = realizado/diaAtual*30 (componente MetasUnidadeSimulador).
