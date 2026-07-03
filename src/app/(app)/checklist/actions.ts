'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { CATEGORIAS_TAREFA } from '@/lib/checklist'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * Planos de Ação do Checklist PDCA  backend real lkii.
 *   planos_acao(id, unidade_id, semana_inicio, semana_fim, status, prioridade,
 *               resumo_executivo, diagnostico_ia, gargalos[], kpis_snapshot,
 *               cumprimento_pct, concluido_em, observacoes_finais, gerado_em)
 *   plano_acao_tarefas(id, plano_id, titulo, descricao, categoria, ordem,
 *               prazo_dias, concluida, concluida_em, concluida_por)
 *
 * RBAC: criar/editar plano e marcar tarefa = gestor / admin_geral.
 * Multitenant: o plano é gravado com a unidade ativa (scopeUnidade não se aplica
 * em INSERT  passamos o unidade_id explícito).
 */
const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

// Status válidos observados/aceitos no backend (planos_acao.status).
const STATUS_VALIDOS = ['ativo', 'concluido', 'expirado', 'cancelado'] as const
const PRIORIDADES = ['baixa', 'media', 'alta'] as const

export type TarefaInput = {
  titulo: string
  descricao?: string | null
  categoria?: string | null
  prazo_dias?: number | null
}

export type PlanoInput = {
  unidade_id: string
  semana_inicio: string // YYYY-MM-DD
  semana_fim: string // YYYY-MM-DD
  prioridade?: string
  resumo_executivo?: string | null
  diagnostico_ia?: string | null
  tarefas: TarefaInput[]
}

/** Validação por campo (espelha o cliente). Retorna msg de erro ou null. */
function validar(input: PlanoInput): string | null {
  if (!input.unidade_id) return 'Selecione a unidade do plano.'
  const ini = (input.semana_inicio || '').trim()
  const fim = (input.semana_fim || '').trim()
  if (!ini) return 'Informe a data de início da semana.'
  if (!fim) return 'Informe a data de fim da semana.'
  if (fim < ini) return 'A data de fim não pode ser anterior ao início.'
  if (input.prioridade && !PRIORIDADES.includes(input.prioridade as (typeof PRIORIDADES)[number])) {
    return 'Prioridade inválida.'
  }
  const tarefas = (input.tarefas || []).filter((t) => (t.titulo || '').trim())
  if (tarefas.length === 0) return 'Adicione ao menos uma tarefa ao plano.'
  for (const t of tarefas) {
    if ((t.titulo || '').trim().length < 3) return 'Título de tarefa muito curto.'
    if (t.prazo_dias != null && (!Number.isInteger(t.prazo_dias) || t.prazo_dias < 0 || t.prazo_dias > 180)) {
      return 'Prazo da tarefa deve ser entre 0 e 180 dias.'
    }
    if (t.categoria && !CATEGORIAS_TAREFA.includes(t.categoria as (typeof CATEGORIAS_TAREFA)[number])) {
      return 'Categoria de tarefa inválida.'
    }
  }
  return null
}

/**
 * Cria um plano de ação + suas tarefas (2 inserts: plano, depois tarefas em lote).
 * Se as tarefas falharem, removemos o plano órfão para não deixar lixo.
 */
export async function criarPlano(input: PlanoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para criar planos de ação.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const tarefas = (input.tarefas || []).filter((t) => (t.titulo || '').trim())

  const { data: plano, error: ePlano } = await op.sb
    .from('planos_acao')
    .insert({
      unidade_id: input.unidade_id,
      semana_inicio: input.semana_inicio,
      semana_fim: input.semana_fim,
      status: 'ativo',
      prioridade: input.prioridade && PRIORIDADES.includes(input.prioridade as (typeof PRIORIDADES)[number]) ? input.prioridade : 'media',
      resumo_executivo: (input.resumo_executivo || '').trim() || `${tarefas.length} ação(ões) planejada(s) para a semana.`,
      diagnostico_ia: (input.diagnostico_ia || '').trim() || null,
    })
    .select('id')
    .single()

  if (ePlano || !plano) return { ok: false, error: msgErro(ePlano?.message, 'criar plano de ação') }
  const planoId = (plano as { id: string }).id

  const rows = tarefas.map((t, i) => ({
    plano_id: planoId,
    titulo: t.titulo.trim(),
    descricao: (t.descricao || '').trim() || null,
    categoria: t.categoria && CATEGORIAS_TAREFA.includes(t.categoria as (typeof CATEGORIAS_TAREFA)[number]) ? t.categoria : 'geral',
    ordem: i + 1,
    prazo_dias: t.prazo_dias != null ? t.prazo_dias : 7, // NOT NULL no banco (default 7)
  }))

  const { error: eTar } = await op.sb.from('plano_acao_tarefas').insert(rows)
  if (eTar) {
    // rollback do plano órfão
    await op.sb.from('planos_acao').delete().eq('id', planoId)
    return { ok: false, error: msgErro(eTar.message, 'salvar tarefas do plano') }
  }

  revalidatePath('/checklist')
  return { ok: true, id: planoId }
}

/** Marca/desmarca uma tarefa como concluída e recalcula o cumprimento_pct do plano. */
export async function toggleTarefa(tarefaId: string, planoId: string, concluida: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para atualizar tarefas.' }
  if (!tarefaId || !planoId) return { ok: false, error: 'Tarefa inválida.' }

  const { error: e } = await op.sb
    .from('plano_acao_tarefas')
    .update({
      concluida,
      concluida_em: concluida ? new Date().toISOString() : null,
      concluida_por: concluida ? op.userId : null,
    })
    .eq('id', tarefaId)

  if (e) return { ok: false, error: msgErro(e.message, 'atualizar tarefa') }

  // Recalcula % de cumprimento do plano (server-side, sobre o estado real).
  const { data: tarefas } = await op.sb
    .from('plano_acao_tarefas')
    .select('concluida')
    .eq('plano_id', planoId)
  const lista = (tarefas ?? []) as { concluida: boolean }[]
  const total = lista.length
  const feitas = lista.filter((t) => t.concluida).length
  const pct = total > 0 ? Math.round((feitas / total) * 10000) / 100 : 0
  await op.sb.from('planos_acao').update({ cumprimento_pct: pct }).eq('id', planoId)

  revalidatePath('/checklist')
  return { ok: true }
}

/** Conclui (ou reabre) um plano de ação. */
export async function definirStatusPlano(planoId: string, status: string, observacoes?: string | null): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar o plano.' }
  if (!planoId) return { ok: false, error: 'Plano inválido.' }
  if (!STATUS_VALIDOS.includes(status as (typeof STATUS_VALIDOS)[number])) return { ok: false, error: 'Status inválido.' }

  const concluido = status === 'concluido'
  const { error: e } = await op.sb
    .from('planos_acao')
    .update({
      status,
      concluido_em: concluido ? new Date().toISOString() : null,
      observacoes_finais: concluido ? ((observacoes || '').trim() || null) : null,
    })
    .eq('id', planoId)

  if (e) return { ok: false, error: msgErro(e.message, 'atualizar status do plano') }
  revalidatePath('/checklist')
  return { ok: true }
}

// TODO(legado: buildChecklist): coleta automática semanal (cron) dos KPIs por unidade,
// geração automática de planos por fragilidade (indicadores < 7 viram tarefas sozinhos),
// chat/comentários no plano e simulação final de pontuação. Dependem de cron (pg_cron) e
// de tabela de comentários  fora do escopo sem acesso de migration.
// TODO(needs-table: sults_checklist_avaliacoes): persistir a avaliação completa por seção
// (modelo SULTS mensal). A tabela existe mas está vazia/sem colunas confirmadas  por isso
// a aba "Avaliação" é calculada em tempo real a partir de kpis_unidade_snapshot, sem gravar.
