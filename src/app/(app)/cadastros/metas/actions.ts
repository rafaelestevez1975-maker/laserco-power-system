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

/** Indicadores aceitos  espelham as metas do legado. Consts INTERNAS: um 'use server' só
 *  pode exportar funções async (os componentes têm as suas próprias listas / usam @/lib/periodo). */
const INDICADORES = ['venda', 'agendamentos', 'clientes_novos', 'indicacoes', 'sessoes'] as const
export type Indicador = (typeof INDICADORES)[number]

/** Período de apuração (legado: mensal / quinzenal / decendial). */
const PERIODOS = ['mensal', 'quinzenal', 'decendial'] as const

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

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de metas (tabela REAL `public.metas`) — paridade com a LISTAGEM do BEMP.
// Colunas: id, empresa_id, unidade_id (nullable, FK unidades), nome, indicador
// ('agendamentos'|'atendimentos'|'faturamento_bruto'|'faturamento_valor'|'vendas'),
// ciclo ('mensal'|'semanal'), valor (numeric), ativo (bool), criado_em, atualizado_em.
// unidade_id NULL = meta global (todas as unidades). RBAC: gestor/admin escrevem.
// (Distinto de metas_colaborador acima — nomes próprios p/ não colidir com criarMeta/salvarMeta.)
// ─────────────────────────────────────────────────────────────────────────────

const META_INDICADORES = ['agendamentos', 'atendimentos', 'faturamento_bruto', 'faturamento_valor', 'vendas'] as const
export type MetaIndicador = (typeof META_INDICADORES)[number]
const META_CICLOS = ['mensal', 'semanal'] as const
export type MetaCiclo = (typeof META_CICLOS)[number]

export type MetaCatInput = {
  nome: string
  indicador: string
  ciclo: string
  unidade_id?: string | null
  valor: number
  ativo?: boolean
}

/** Resolve a empresa do operador (via unidade do perfil; senão a 1ª empresa). */
async function resolverEmpresaMeta(op: NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>): Promise<string | null> {
  const { sb, userId } = op
  const { data: perfil } = await sb.from('perfis_usuario').select('unidade_id').eq('id', userId).maybeSingle()
  const unidadeId = (perfil as { unidade_id?: string | null } | null)?.unidade_id ?? null
  if (unidadeId) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).maybeSingle()
    const eid = (uni as { empresa_id?: string | null } | null)?.empresa_id ?? null
    if (eid) return eid
  }
  const { data: emp } = await sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  return (emp as { id?: string } | null)?.id ?? null
}

/** Validação por campo do catálogo de metas. Retorna msg ou null. */
function validarMetaCat(input: MetaCatInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome da meta.'
  const ind = (input.indicador || '').trim()
  if (!ind || !(META_INDICADORES as readonly string[]).includes(ind)) return 'Selecione um indicador válido.'
  const ciclo = (input.ciclo || '').trim()
  if (!ciclo || !(META_CICLOS as readonly string[]).includes(ciclo)) return 'Selecione um ciclo válido.'
  if (input.valor == null || !Number.isFinite(input.valor)) return 'Informe o valor da meta.'
  if (input.valor < 0) return 'O valor não pode ser negativo.'
  return null
}

function payloadMetaCat(input: MetaCatInput) {
  return {
    nome: (input.nome || '').trim(),
    indicador: (input.indicador || '').trim(),
    ciclo: (input.ciclo || '').trim(),
    unidade_id: input.unidade_id || null,
    valor: input.valor,
    ativo: input.ativo !== false,
  }
}

/** Cria uma meta no catálogo `metas`. RBAC: gestor/admin. */
export async function criarMetaCatalogo(input: MetaCatInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar metas.' }

  const v = validarMetaCat(input)
  if (v) return { ok: false, error: v }

  const empresa_id = await resolverEmpresaMeta(op)
  const { data, error: e } = await op.sb
    .from('metas')
    .insert({ ...payloadMetaCat(input), empresa_id })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar meta') }
  revalidatePath('/cadastros/metas')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita uma meta do catálogo `metas`. RBAC: gestor/admin. */
export async function editarMetaCatalogo(id: string, input: MetaCatInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar metas.' }
  if (!id) return { ok: false, error: 'Meta inválida.' }

  const v = validarMetaCat(input)
  if (v) return { ok: false, error: v }

  const { error: e } = await op.sb
    .from('metas')
    .update({ ...payloadMetaCat(input), atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'salvar meta') }
  revalidatePath('/cadastros/metas')
  return { ok: true }
}

/** Ativa/inativa uma meta do catálogo `metas`. RBAC: gestor/admin. */
export async function toggleMetaAtiva(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar metas.' }
  if (!id) return { ok: false, error: 'Meta inválida.' }

  const { error: e } = await op.sb
    .from('metas')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar meta' : 'inativar meta') }
  revalidatePath('/cadastros/metas')
  return { ok: true }
}

// TODO(needs-table: metas_unidade)  metas de unidade (venda mín. R$100k, agendamentos,
// clientes novos, indicações) com regras automáticas de reajuste do legado (3º mês = média
// dos 2 anteriores; novembro +40%; dezembro = patamar de outubro). Sem tabela própria no
// backend, o painel da unidade é um SIMULADOR (não persiste)  igual ao legado, cujo botão
// mSalvar também só exibe "Metas salvas e publicadas no Dashboard" sem persistir.
// A meta diária de indicações já foi alinhada à base 30 do legado (indMetaSync): meta diária
// = ceil(meta/30) e projeção = realizado/diaAtual*30 (componente MetasUnidadeSimulador).
