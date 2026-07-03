import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { scopeUnidade } from '@/lib/sb'
import { avaliarFunil, montarChecklistMensal, type FunilSnapshot, type MediasRede } from '@/lib/checklist'
import { ChecklistView } from '@/components/checklist/ChecklistView'
import type { PlanoRow, TarefaRow } from '@/components/checklist/PlanosList'

export const dynamic = 'force-dynamic'

// Papéis que podem criar planos / marcar tarefas (admin sempre passa).
const PAPEIS_ESCRITA = ['gestor']

/** Conta dias entre hoje e a data de prazo derivada (semana_fim + maior prazo de tarefa). */
function diasRestantes(semanaFim: string | null): number | null {
  if (!semanaFim) return null
  const fim = new Date(semanaFim + 'T23:59:59')
  if (isNaN(fim.getTime())) return null
  return Math.ceil((fim.getTime() - Date.now()) / 86_400_000)
}

export default async function ChecklistPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))
  const activeUnitId = ctx?.activeUnitId ?? null

  // ── 1) Snapshot do funil (kpis_unidade_snapshot)  último registro da unidade ativa ──
  let snapQuery = sb
    .from('kpis_unidade_snapshot')
    .select('agendamentos_total, taxa_comparecimento, taxa_conversao, ticket_medio, data_referencia, periodo')
    .order('data_referencia', { ascending: false })
    .limit(1)
  snapQuery = scopeUnidade(snapQuery, activeUnitId)
  const { data: snapData } = await snapQuery
  const snap = ((snapData ?? [])[0] as FunilSnapshot | undefined) ?? null
  const linhas = avaliarFunil(snap)

  // ── 1b) Médias da REDE (TODA a rede)  usadas no checklist mensal SULTS ──
  // Pega o último snapshot de cada unidade e tira a média (legacy chkAvg sobre CHK_UNITS).
  // Usa service-role DE PROPÓSITO: a média da rede tem de ser a mesma para qualquer
  // papel/unidade ativa. Com o client RLS, um gestor escopado veria só a própria unidade
  // e toda comparação "acima da média da rede" cairia em valor >= ele mesmo (sempre Conforme).
  const { data: redeData } = await adminClient()
    .from('kpis_unidade_snapshot')
    .select('unidade_id, agendamentos_total, taxa_comparecimento, taxa_conversao, ticket_medio, data_referencia')
    .order('data_referencia', { ascending: false })
    .limit(2000)
  const ultimoPorUnidade = new Map<string, { ag: number; comp: number; conv: number; ticket: number }>()
  for (const r of (redeData ?? []) as Array<{ unidade_id: string; agendamentos_total: number | null; taxa_comparecimento: number | null; taxa_conversao: number | null; ticket_medio: number | null }>) {
    if (!ultimoPorUnidade.has(r.unidade_id)) {
      ultimoPorUnidade.set(r.unidade_id, {
        ag: r.agendamentos_total ?? 0,
        comp: r.taxa_comparecimento ?? 0,
        conv: r.taxa_conversao ?? 0,
        ticket: r.ticket_medio ?? 0,
      })
    }
  }
  const rede = [...ultimoPorUnidade.values()]
  const n = Math.max(1, rede.length)
  const mediasRede: MediasRede = {
    ag: rede.reduce((a, u) => a + u.ag, 0) / n,
    comp: rede.reduce((a, u) => a + u.comp, 0) / n,
    conv: rede.reduce((a, u) => a + u.conv, 0) / n,
    ticket: rede.reduce((a, u) => a + u.ticket, 0) / n,
  }
  // Checklist mensal SULTS (6 seções, ~26 questões, pontuação 340)  só faz sentido
  // com snapshot da unidade ativa. Sem snapshot, a aba mostra empty-state.
  const mensal = snap ? montarChecklistMensal(snap, mediasRede) : null

  // ── 2) Planos de ação (planos_acao) + tarefas (plano_acao_tarefas) ──
  let planosQuery = sb
    .from('planos_acao')
    .select('id, unidade_id, semana_inicio, semana_fim, status, prioridade, resumo_executivo, diagnostico_ia, cumprimento_pct, concluido_em, gerado_em')
    .order('gerado_em', { ascending: false })
    .limit(100)
  planosQuery = scopeUnidade(planosQuery, activeUnitId)
  const { data: planosData } = await planosQuery
  const planosBase = (planosData ?? []) as Array<Omit<PlanoRow, 'tarefas' | 'unidade_nome'>>

  // Tarefas de todos os planos visíveis (1 query, agrupada em memória).
  const planoIds = planosBase.map((p) => p.id)
  const tarefasByPlano = new Map<string, TarefaRow[]>()
  if (planoIds.length > 0) {
    const { data: tarData } = await sb
      .from('plano_acao_tarefas')
      .select('id, plano_id, titulo, descricao, categoria, ordem, prazo_dias, concluida, concluida_em')
      .in('plano_id', planoIds)
      .order('ordem', { ascending: true })
    for (const t of (tarData ?? []) as TarefaRow[]) {
      const arr = tarefasByPlano.get(t.plano_id) ?? []
      arr.push(t)
      tarefasByPlano.set(t.plano_id, arr)
    }
  }

  // Mapa de nome de unidade (para quando estiver vendo "todas as unidades").
  const unidadeNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  const planos: PlanoRow[] = planosBase.map((p) => ({
    ...p,
    unidade_nome: unidadeNome.get(p.unidade_id) ?? null,
    tarefas: tarefasByPlano.get(p.id) ?? [],
  }))

  // ── 3) KPIs de planos: abertos / atrasados / concluídos ──
  const abertos = planos.filter((p) => p.status === 'ativo')
  const concluidos = planos.filter((p) => p.status === 'concluido')
  const atrasados = abertos.filter((p) => {
    const d = diasRestantes(p.semana_fim)
    return d != null && d < 0
  })

  const kpis = {
    abertos: abertos.length,
    atrasados: atrasados.length,
    concluidos: concluidos.length,
    total: planos.length,
  }

  // Unidades elegíveis para criar plano (a ativa, ou todas se admin sem filtro).
  const unidadesParaCriar = activeUnitId
    ? (ctx?.unidades ?? []).filter((u) => u.id === activeUnitId)
    : (ctx?.unidades ?? [])

  return (
    <ChecklistView
      linhas={linhas}
      snap={snap}
      planos={planos}
      kpis={kpis}
      mensal={mensal}
      podeEscrever={podeEscrever}
      unidades={unidadesParaCriar}
      activeUnitId={activeUnitId}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
    />
  )
}
