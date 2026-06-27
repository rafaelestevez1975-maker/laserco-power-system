import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'
import { DashTabs, dashQuery } from '@/components/dashboards/DashTabs'
import { contar, pullLancamentos, ultimosMeses, rotuloMes, type LancMin } from '@/components/dashboards/agg'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const somaVal = (rows: LancMin[]) => rows.reduce((a, r) => a + (r.valor || 0), 0)
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

export default async function DashGerencialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Visão geral histórica → default '90d' (financeiro só tem histórico).
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Agregados de topo (counts head:true + soma enxuta de receita) ──
  const ag = { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId }
  const [
    totalAg,
    concluido,
    cancelado,
    rec,
  ] = await Promise.all([
    contar(sb, 'agendamentos', ag),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'concluido' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'cancelado' } }),
    pullLancamentos(sb, 'receita', unidadeId, range.ini, range.fim),
  ])
  const totalReceita = somaVal(rec.rows)

  // Clientes novos no período (criado_em). Sem escopo por unidade: clientes.unidade_origem_id
  // é sempre null na base lkii → contagem global, com nota honesta abaixo.
  const novosClientes = await contar(sb, 'clientes', { dateCol: 'criado_em', gte: range.ini, lt: range.fim })

  // ── Séries mensais (12 meses) ──
  const meses = ultimosMeses(range.fim, 12)

  // Receita por mês a partir das linhas já carregadas.
  const recPorMes = new Map<string, number>()
  for (const r of rec.rows) {
    if (!r.data_competencia) continue
    const ym = r.data_competencia.slice(0, 7)
    recPorMes.set(ym, (recPorMes.get(ym) || 0) + (r.valor || 0))
  }
  const serieReceita: BarRow[] = meses.map((m) => ({ label: rotuloMes(m.ym), value: recPorMes.get(m.ym) || 0 }))

  // Clientes novos por mês (1 count head:true por mês = 12 queries baratas).
  const novosPorMes = await Promise.all(
    meses.map((m) => contar(sb, 'clientes', { dateCol: 'criado_em', gte: m.ini, lt: m.fim })),
  )
  const serieClientes: BarRow[] = meses.map((m, i) => ({ label: rotuloMes(m.ym), value: novosPorMes[i], display: novosPorMes[i].toLocaleString('pt-BR') }))

  // Agendamentos por mês.
  const agPorMes = await Promise.all(
    meses.map((m) => {
      const a = asTsStart(m.ini)
      const b = asTsStart(m.fim)
      return contar(sb, 'agendamentos', { dateCol: 'inicio', gte: a, lt: b, unidadeId })
    }),
  )
  const serieAg: BarRow[] = meses.map((m, i) => ({ label: rotuloMes(m.ym), value: agPorMes[i], display: agPorMes[i].toLocaleString('pt-BR') }))

  const taxaConclusao = pct(concluido, totalAg)
  const taxaCancel = pct(cancelado, totalAg)
  const mesesComRec = serieReceita.filter((m) => m.value > 0).length

  const kpis: RelKpi[] = [
    { label: 'Receita no período', value: moedaBR(totalReceita), icon: 'ti-cash', delta: mesesComRec > 0 ? `${moedaBR(totalReceita / mesesComRec)}/mês` : undefined, deltaTone: 'flat' },
    { label: 'Agendamentos', value: totalAg.toLocaleString('pt-BR'), icon: 'ti-calendar-stats', delta: `${taxaConclusao}% concluídos`, deltaTone: 'up' },
    { label: 'Cancelamentos', value: cancelado.toLocaleString('pt-BR'), icon: 'ti-calendar-x', delta: `${taxaCancel}% do total`, deltaTone: taxaCancel > 25 ? 'down' : 'flat' },
    { label: 'Clientes novos', value: novosClientes.toLocaleString('pt-BR'), icon: 'ti-user-plus' },
  ]

  return (
    <div className="view active">
      <DashTabs active="gerencial" query={dashQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Dashboard Gerencial</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/dashboards/gerencial" />

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Receita por mês" icon="ti-chart-bar" rows={serieReceita} gold asMoeda emptyMsg="Sem receita no período." />
        <BarChart title="Agendamentos por mês" icon="ti-calendar-stats" rows={serieAg} emptyMsg="Sem agendamentos no período." />
        <BarChart title="Clientes novos por mês" icon="ti-user-plus" rows={serieClientes} gold emptyMsg="Sem clientes novos no período." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Resumo mensal
          </span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num-r">Receita</th>
                <th className="num-r">Agendamentos</th>
                <th className="num-r">Clientes novos</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m, i) => (
                <tr key={m.ym}>
                  <td style={{ color: 'var(--text-2)' }}>{rotuloMes(m.ym)}</td>
                  <td className="num-r">{moedaBR(recPorMes.get(m.ym) || 0)}</td>
                  <td className="num-r">{agPorMes[i].toLocaleString('pt-BR')}</td>
                  <td className="num-r">{novosPorMes[i].toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
          <i className="ti ti-info-circle" /> Clientes novos são contados globalmente (a base lkii não vincula
          cliente à unidade de origem). Receita e agendamentos respeitam a unidade ativa.
        </div>
      </div>

      {/* TODO(legado: buildDashb/gerencial): comparativo vs período anterior, metas e ticket por
          unidade dependem de tabela de metas e de vínculo cliente↔unidade — indisponíveis no lkii atual. */}
    </div>
  )
}
