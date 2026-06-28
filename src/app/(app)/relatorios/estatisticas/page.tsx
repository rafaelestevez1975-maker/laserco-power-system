import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de segurança ao paginar o financeiro (espelha faturamento/financeiro):
// SEMPRE escopamos por período e/ou unidade, mas limitamos o pull por garantia.
const SUM_CAP = 20000
const PAGE = 1000

type LancMin = { valor: number | null }

type SbRangeQuery = {
  eq: (c: string, v: unknown) => SbRangeQuery
  gte: (c: string, v: unknown) => SbRangeQuery
  lt: (c: string, v: unknown) => SbRangeQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: unknown }>
}

type SbCountQuery = {
  eq: (c: string, v: unknown) => SbCountQuery
  gte: (c: string, v: unknown) => SbCountQuery
  lt: (c: string, v: unknown) => SbCountQuery
  then: Promise<{ count: number | null; error: unknown }>['then']
}

/**
 * Soma o valor das receitas (lancamentos_financeiros, tipo='receita') no período,
 * escopando por unidade quando houver. Pagina até SUM_CAP. Trata erro → soma 0.
 */
async function somaReceita(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null,
  ini: string | null,
  fim: string | null,
): Promise<{ total: number; qtd: number; capped: boolean; erro: boolean }> {
  let total = 0
  let qtd = 0
  let from = 0
  let capped = false
  for (;;) {
    let q = sb
      .from('lancamentos_financeiros')
      .select('valor')
      .eq('tipo', 'receita') as unknown as SbRangeQuery
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (ini) q = q.gte('data_competencia', ini)
    if (fim) q = q.lt('data_competencia', fim)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) return { total: 0, qtd: 0, capped: false, erro: true }
    const batch = (data ?? []) as LancMin[]
    for (const r of batch) total += r.valor || 0
    qtd += batch.length
    if (batch.length < PAGE) break
    from += PAGE
    if (qtd >= SUM_CAP) {
      capped = true
      break
    }
  }
  return { total, qtd, capped, erro: false }
}

/** Conta clientes (head:true) com filtros opcionais. Trata erro → 0. */
async function contarClientes(
  sb: Awaited<ReturnType<typeof createClient>>,
  build: (q: SbCountQuery) => SbCountQuery,
): Promise<number> {
  const base = sb.from('clientes').select('id', { count: 'exact', head: true }) as unknown as SbCountQuery
  const { count, error } = await build(base)
  if (error) return 0
  return count ?? 0
}

/** Conta agendamentos (head:true) por status/unidade/janela (coluna inicio). Trata erro → 0. */
async function contarAgendamentos(
  sb: Awaited<ReturnType<typeof createClient>>,
  opts: { status?: string; unidadeId: string | null; iniTs: string | null; fimTs: string | null },
): Promise<number> {
  let q = sb.from('agendamentos').select('id', { count: 'exact', head: true }) as unknown as SbCountQuery
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.unidadeId) q = q.eq('unidade_id', opts.unidadeId)
  if (opts.iniTs) q = q.gte('inicio', opts.iniTs)
  if (opts.fimTs) q = q.lt('inicio', opts.fimTs)
  const { count, error } = await q
  if (error) return 0
  return count ?? 0
}

function pctDelta(atual: number, anterior: number): { txt: string; tone: 'up' | 'down' | 'flat' } | null {
  if (anterior <= 0) return null
  const pct = ((atual - anterior) / anterior) * 100
  return {
    txt: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs período anterior`,
    tone: pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat',
  }
}

export default async function RelEstatisticasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Financeiro é histórico (sem lançamentos no mês corrente) e a base de agendamentos
  // tem datas futuras; '90d' é o default que mostra dado real nos dois domínios.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)
  const prevIniTs = asTsStart(range.prevIni)
  const prevFimTs = asTsStart(range.prevFim)
  const temComparativo = !!(range.prevIni && range.prevFim)

  // ── Coleta consolidada (tudo em paralelo) ──
  const [
    fatAtual,
    fatAnterior,
    agTotal,
    agConcluidos,
    agCancelados,
    agTotalAnt,
    novosClientes,
    baseClientes,
    clientesAtivos,
  ] = await Promise.all([
    somaReceita(sb, unidadeId, range.ini, range.fim),
    temComparativo
      ? somaReceita(sb, unidadeId, range.prevIni, range.prevFim)
      : Promise.resolve({ total: 0, qtd: 0, capped: false, erro: false }),
    contarAgendamentos(sb, { unidadeId, iniTs, fimTs }),
    contarAgendamentos(sb, { status: 'concluido', unidadeId, iniTs, fimTs }),
    contarAgendamentos(sb, { status: 'cancelado', unidadeId, iniTs, fimTs }),
    temComparativo
      ? contarAgendamentos(sb, { unidadeId, iniTs: prevIniTs, fimTs: prevFimTs })
      : Promise.resolve(0),
    // clientes não tem unidade_origem_id populado → contamos a base inteira (igual rel/clientes).
    contarClientes(sb, (q) => {
      let qq = q
      if (iniTs) qq = qq.gte('criado_em', iniTs)
      if (fimTs) qq = qq.lt('criado_em', fimTs)
      return qq
    }),
    contarClientes(sb, (q) => q),
    contarClientes(sb, (q) => q.eq('ativo', true)),
  ])

  const faturamento = fatAtual.total
  const faturamentoAnt = fatAnterior.total
  const capped = fatAtual.capped || fatAnterior.capped

  // Ticket médio: faturamento / atendimentos concluídos (proxy de "atendimentos" do legado).
  const ticket = agConcluidos > 0 ? faturamento / agConcluidos : 0
  const taxaConclusao = agTotal > 0 ? (agConcluidos / agTotal) * 100 : 0
  const taxaCancel = agTotal > 0 ? (agCancelados / agTotal) * 100 : 0

  const deltaFat = pctDelta(faturamento, faturamentoAnt)
  const deltaAg = pctDelta(agTotal, agTotalAnt)

  // ── KPIs (espelham a aba "Unidade" do legado: Faturamento, Atendimentos, Ticket médio) ──
  const kpis: RelKpi[] = [
    {
      label: 'Faturamento',
      value: moedaBR(faturamento),
      icon: 'ti-currency-dollar',
      delta: deltaFat?.txt,
      deltaTone: deltaFat?.tone,
    },
    {
      label: 'Atendimentos',
      value: agConcluidos.toLocaleString('pt-BR'),
      icon: 'ti-user-check',
      delta: `${taxaConclusao.toFixed(1)}% de conclusão`,
      deltaTone: 'flat',
    },
    { label: 'Ticket médio', value: moedaBR(ticket), icon: 'ti-receipt' },
    {
      label: 'Novos clientes',
      value: novosClientes.toLocaleString('pt-BR'),
      icon: 'ti-user-plus',
    },
  ]

  // ── Gráficos: comparativo de volume e composição de agendamentos ──
  const barComparativo: BarRow[] = temComparativo
    ? [
        { label: range.label, value: faturamento, display: moedaBR(faturamento) },
        { label: range.prevLabel, value: faturamentoAnt, display: moedaBR(faturamentoAnt) },
      ]
    : [{ label: range.label, value: faturamento, display: moedaBR(faturamento) }]

  const barAgenda: BarRow[] = [
    { label: 'Total', value: agTotal, display: agTotal.toLocaleString('pt-BR') },
    { label: 'Concluídos', value: agConcluidos, display: agConcluidos.toLocaleString('pt-BR') },
    { label: 'Cancelados', value: agCancelados, display: agCancelados.toLocaleString('pt-BR') },
  ]

  // ── Tabela de indicadores consolidados (com vs. período anterior quando disponível) ──
  type Indicador = { nome: string; valor: string; atualNum?: number; antNum?: number }
  const indicadores: Indicador[] = [
    { nome: 'Faturamento', valor: moedaBR(faturamento), atualNum: faturamento, antNum: temComparativo ? faturamentoAnt : undefined },
    { nome: 'Agendamentos (total)', valor: agTotal.toLocaleString('pt-BR'), atualNum: agTotal, antNum: temComparativo ? agTotalAnt : undefined },
    { nome: 'Atendimentos concluídos', valor: agConcluidos.toLocaleString('pt-BR') },
    { nome: 'Cancelamentos', valor: agCancelados.toLocaleString('pt-BR') },
    { nome: 'Ticket médio', valor: moedaBR(ticket) },
    { nome: 'Taxa de conclusão', valor: `${taxaConclusao.toFixed(1)}%` },
    { nome: 'Taxa de cancelamento', valor: `${taxaCancel.toFixed(1)}%` },
    { nome: 'Novos clientes no período', valor: novosClientes.toLocaleString('pt-BR') },
    { nome: 'Base de clientes (ativos)', valor: clientesAtivos.toLocaleString('pt-BR') },
    { nome: 'Base de clientes (total)', valor: baseClientes.toLocaleString('pt-BR') },
  ]

  return (
    <div className="view active">
      <RelTabs active="estatisticas" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Estatísticas gerais</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/estatisticas" />

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: somando os primeiros {SUM_CAP.toLocaleString('pt-BR')} lançamentos. Refine o período ou filtre por unidade para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Faturamento vs período anterior" icon="ti-chart-bar" rows={barComparativo} gold asMoeda emptyMsg="Sem receita no período." />
        <BarChart title="Agendamentos no período" icon="ti-calendar-stats" rows={barAgenda} emptyMsg="Sem agendamentos no período." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-chart-line" /> Indicadores consolidados
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{range.label}</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="num-r">Valor</th>
                {temComparativo && <th className="num-r">vs. período anterior</th>}
              </tr>
            </thead>
            <tbody>
              {indicadores.map((ind) => {
                const d = ind.atualNum != null && ind.antNum != null ? pctDelta(ind.atualNum, ind.antNum) : null
                return (
                  <tr key={ind.nome}>
                    <td>{ind.nome}</td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{ind.valor}</td>
                    {temComparativo && (
                      <td
                        className="num-r"
                        style={{
                          fontWeight: 600,
                          color:
                            d == null
                              ? 'var(--text-3)'
                              : d.tone === 'up'
                                ? 'var(--green, #1f9d55)'
                                : d.tone === 'down'
                                  ? 'var(--red, #d23b53)'
                                  : 'var(--text-3)',
                        }}
                      >
                        {d ? d.txt.replace(' vs período anterior', '') : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crm-note" style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 14 }}>
        <i className="ti ti-info-circle" /> Visão consolidada de faturamento (lançamentos de receita), agendamentos e
        clientes. Faturamento e agendamentos respeitam a unidade ativa; a base de clientes é global enquanto
        <code> unidade_origem_id</code> não estiver populada no backend.
        {/* TODO(legado: estatisticas): aba "Colaborador" (atendimentos/faturamento/ocupação por profissional)
            quando a tabela `profissionais` existir; indicador de ocupação depende de agenda/capacidade. */}
      </div>
    </div>
  )
}
