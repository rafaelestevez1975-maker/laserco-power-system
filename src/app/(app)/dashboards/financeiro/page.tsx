import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'
import { DashTabs, dashQuery } from '@/components/dashboards/DashTabs'
import { pullLancamentos, ultimosMeses, rotuloMes, type LancMin } from '@/components/dashboards/agg'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const somaVal = (rows: LancMin[]) => rows.reduce((a, r) => a + (r.valor || 0), 0)

export default async function DashFinanceiroPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  // Dados financeiros são históricos (BEMP — sem lançamentos no mês corrente) → default '90d'.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  // Receita (a base lkii só tem tipo=receita; despesa=0 → DRE/saldo mostram estado honesto).
  const rec = await pullLancamentos(sb, 'receita', unidadeId, range.ini, range.fim)
  const totalReceita = somaVal(rec.rows)
  const qtdLanc = rec.rows.length

  // Nomes de categoria (plano_contas) — uma query enxuta com os ids usados.
  const catIds = [...new Set(rec.rows.map((r) => r.categoria_id).filter(Boolean))] as string[]
  const catNome: Record<string, string> = {}
  if (catIds.length > 0) {
    const { data: cats } = await sb.from('plano_contas').select('id, nome').in('id', catIds)
    for (const c of (cats ?? []) as { id: string; nome: string }[]) catNome[c.id] = c.nome
  }

  // Receita por categoria.
  const porCat = new Map<string, number>()
  for (const r of rec.rows) {
    const k = r.categoria_id || '∅'
    porCat.set(k, (porCat.get(k) || 0) + (r.valor || 0))
  }
  const linhasCat = [...porCat.entries()]
    .map(([id, v]) => ({ nome: id === '∅' ? 'Sem categoria' : (catNome[id] ?? 'Categoria ' + id.slice(0, 6)), valor: v }))
    .sort((a, b) => b.valor - a.valor)

  // Receita por mês (12 meses até o fim do período) — soma a partir das linhas já carregadas.
  const meses = ultimosMeses(range.fim, 12)
  const porMes = new Map<string, number>()
  for (const r of rec.rows) {
    if (!r.data_competencia) continue
    const ym = r.data_competencia.slice(0, 7)
    porMes.set(ym, (porMes.get(ym) || 0) + (r.valor || 0))
  }
  const serieMes: BarRow[] = meses.map((m) => ({ label: rotuloMes(m.ym), value: porMes.get(m.ym) || 0 }))
  const mesesComDado = serieMes.filter((m) => m.value > 0)
  const ticketMedio = qtdLanc > 0 ? totalReceita / qtdLanc : 0
  const mediaMensal = mesesComDado.length > 0 ? totalReceita / mesesComDado.length : 0
  const melhorMes = [...serieMes].sort((a, b) => b.value - a.value)[0]

  const kpis: RelKpi[] = [
    { label: 'Receita total', value: moedaBR(totalReceita), icon: 'ti-cash' },
    { label: 'Média mensal', value: moedaBR(mediaMensal), icon: 'ti-chart-area-line', delta: `${mesesComDado.length} ${mesesComDado.length === 1 ? 'mês' : 'meses'} com receita`, deltaTone: 'flat' },
    { label: 'Ticket médio', value: moedaBR(ticketMedio), icon: 'ti-receipt' },
    { label: 'Lançamentos', value: qtdLanc.toLocaleString('pt-BR') + (rec.capped ? '+' : ''), icon: 'ti-list-numbers' },
  ]

  return (
    <div className="view active">
      <DashTabs active="financeiro" query={dashQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Dashboard Financeiro</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/dashboards/financeiro" />

      {rec.capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: agregando os primeiros lançamentos. Refine o período para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart
          title="Receita por mês"
          icon="ti-chart-bar"
          rows={serieMes}
          gold
          asMoeda
          emptyMsg="Sem receita no período selecionado."
        />
        <BarChart
          title="Receita por categoria"
          icon="ti-category"
          rows={linhasCat.slice(0, 8).map((l) => ({ label: l.nome, value: l.valor, display: moedaBR(l.valor) }))}
          gold
          asMoeda
          emptyMsg="Sem receita no período."
        />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-report-money" /> Receita por categoria
          </span>
          {melhorMes && melhorMes.value > 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
              Melhor mês: {melhorMes.label} ({moedaBR(melhorMes.value)})
            </span>
          )}
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num-r">Receita</th>
                <th className="num-r">% do total</th>
              </tr>
            </thead>
            <tbody>
              {linhasCat.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma receita lançada no período selecionado.
                  </td>
                </tr>
              )}
              {linhasCat.map((l) => (
                <tr key={l.nome}>
                  <td style={{ color: 'var(--text-2)' }}>{l.nome}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(l.valor)}</td>
                  <td className="num-r">{totalReceita > 0 ? ((l.valor / totalReceita) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              ))}
            </tbody>
            {linhasCat.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>Total</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(totalReceita)}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* TODO(legado: buildDashb/financeiro): contas a pagar/despesas e fluxo de caixa (saldo)
          dependem de lançamentos tipo=despesa — a base lkii atual só tem receitas (0 despesas).
          A estrutura já consome despesa via pullLancamentos quando a fonte existir. */}
    </div>
  )
}
