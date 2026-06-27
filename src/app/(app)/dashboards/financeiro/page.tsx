import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { DashTabs, dashQuery } from '@/components/dashboards/DashTabs'
import { DashFiltros } from '@/components/dashboards/DashFiltros'
import { resolveDashRange } from '@/components/dashboards/dashPeriodo'
import {
  pullLancamentos, somaLanc, somaRealizado, somaPorChave,
  faturamentoMesAnterior, ultimosMeses, rotuloMes, type LancMin,
} from '@/components/dashboards/agg'
import { calcRoyalties, type Royalties } from '@/lib/dashboards'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string; unidade?: string }

export default async function DashFinanceiroPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()

  // Escopo de unidade: topo (activeUnitId) manda; senão o filtro ?unidade= (=todas → sem filtro).
  const fixaTopo = ctx?.activeUnitId ?? null
  const uniFiltro = fixaTopo ? null : (sp.unidade && sp.unidade !== 'todas' ? sp.unidade : null)
  const unidadeId = fixaTopo ?? uniFiltro
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))
  const unidadeNome = unidadeId ? (ctx?.activeUnitName ?? unidades.find((u) => u.id === unidadeId)?.nome ?? 'Unidade') : 'Todas as unidades'

  // Default financeiro = 'mes' (legado defPer='Mês atual').
  const periodo = sp.periodo || 'mes'
  const range = resolveDashRange(periodo, sp.di, sp.df)

  // ── Lançamentos do período: receita + despesa (status: pago=realizado, demais=previsto) ──
  const [rec, desp] = await Promise.all([
    pullLancamentos(sb, 'receita', unidadeId, range.ini, range.fim),
    pullLancamentos(sb, 'despesa', unidadeId, range.ini, range.fim),
  ])
  const capped = rec.capped || desp.capped

  // ── Royalties (10% do faturamento REALIZADO do mês anterior — só franqueada) ──
  // CNPJ da unidade ativa decide própria × franqueada (uniEhPropria).
  let royalties: Royalties | null = null
  if (unidadeId) {
    const [{ data: uni }, fatAnt] = await Promise.all([
      sb.from('unidades').select('cnpj').eq('id', unidadeId).maybeSingle(),
      faturamentoMesAnterior(sb, unidadeId),
    ])
    royalties = calcRoyalties((uni as { cnpj?: string | null } | null)?.cnpj ?? null, fatAnt)
  }

  // ── KPIs: contas a pagar/receber previstas × realizadas + royalties (legado relKpis L4621) ──
  const receberPrevisto = somaLanc(rec.rows)
  const receberRealizado = somaRealizado(rec.rows)
  const pagarBase = somaLanc(desp.rows)
  const pagarRealizado = somaRealizado(desp.rows)
  // Royalties (franqueada) entram nas contas a pagar previstas (lançamento automático no fluxo).
  const royValor = royalties?.franqueada ? royalties.valor : 0
  const pagarPrevisto = pagarBase + royValor

  const kpis: RelKpi[] = [
    { label: 'Contas a pagar previstas', value: moedaBR(pagarPrevisto), icon: 'ti-arrow-down-circle' },
    { label: 'Contas a pagar realizadas', value: moedaBR(pagarRealizado), icon: 'ti-circle-check' },
    { label: 'Royalties a pagar (auto)', value: royalties?.franqueada ? moedaBR(royalties.valor) : '—', icon: 'ti-receipt-2' },
    { label: 'Contas a receber previstas', value: moedaBR(receberPrevisto), icon: 'ti-arrow-up-circle' },
    { label: 'Contas a receber realizadas', value: moedaBR(receberRealizado), icon: 'ti-cash' },
    { label: 'Total de contas a receber', value: moedaBR(receberPrevisto), icon: 'ti-pig-money' },
  ]

  // ── Nomes de categorias (plano_contas) p/ os widgets de categoria ──
  const catIds = [...new Set([...rec.rows, ...desp.rows].map((r) => r.categoria_id).filter(Boolean))] as string[]
  const catNome: Record<string, string> = {}
  if (catIds.length > 0) {
    const { data: cats } = await sb.from('plano_contas').select('id, nome').in('id', catIds)
    for (const c of (cats ?? []) as { id: string; nome: string }[]) catNome[c.id] = c.nome
  }
  const nomeCat = (id: string) => (id === '∅' ? 'Sem categoria' : catNome[id] ?? 'Categoria ' + id.slice(0, 6))

  // ── Movimentação no período: Receitas / Despesas / Saldo (legado dashWidget mov L4629) ──
  const despComRoy = pagarBase + royValor
  const saldo = receberPrevisto - despComRoy
  const movRows: BarRow[] = [
    { label: 'Receitas', value: receberPrevisto, display: moedaBR(receberPrevisto) },
    { label: 'Despesas', value: despComRoy, display: moedaBR(despComRoy) },
    { label: 'Saldo', value: Math.max(0, saldo), display: moedaBR(saldo) },
  ]

  // ── Categorias de Contas a pagar (despesas por categoria + royalties) — legado cpData L4630 ──
  const pagarPorCat = somaPorChave(desp.rows, (r) => r.categoria_id || '∅')
  const cpRows: BarRow[] = [...pagarPorCat.entries()]
    .map(([id, v]) => ({ label: nomeCat(id), value: v, display: moedaBR(v) }))
    .sort((a, b) => b.value - a.value)
  if (royalties?.franqueada && royalties.valor > 0) {
    cpRows.push({ label: `Royalties (${royalties.pct}% mês ant.)`, value: royalties.valor, display: moedaBR(royalties.valor) })
    cpRows.sort((a, b) => b.value - a.value)
  }

  // ── Categorias de Contas a receber (receita por categoria) — legado cr L4632 ──
  const receberPorCat = somaPorChave(rec.rows, (r) => r.categoria_id || '∅')
  const crRows = [...receberPorCat.entries()]
    .map(([id, v]) => ({ nome: nomeCat(id), valor: v }))
    .sort((a, b) => b.valor - a.valor)

  // ── Receita por mês (12 meses) p/ a tabela detalhada ──
  const meses = ultimosMeses(range.fim, 12)
  const recPorMes = new Map<string, number>()
  for (const r of rec.rows) {
    if (!r.data_competencia) continue
    const ym = r.data_competencia.slice(0, 7)
    recPorMes.set(ym, (recPorMes.get(ym) || 0) + (r.valor || 0))
  }
  const serieMes: BarRow[] = meses.map((m) => ({ label: rotuloMes(m.ym), value: recPorMes.get(m.ym) || 0 }))
  const melhorMes = [...serieMes].sort((a, b) => b.value - a.value)[0]

  const exportData = {
    nome: 'dashboard-financeiro',
    header: ['Indicador', 'Valor'],
    rows: kpis.map((k) => [k.label, k.value]) as (string | number)[][],
  }

  return (
    <div className="view active">
      <DashTabs active="financeiro" query={dashQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Dashboard Financeiro</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{range.label} · {unidadeNome}</span>
      </div>

      <DashFiltros
        periodo={periodo}
        di={sp.di || ''}
        df={sp.df || ''}
        basePath="/dashboards/financeiro"
        unidades={fixaTopo ? [] : unidades}
        unidade={sp.unidade || 'todas'}
        exportData={exportData}
      />

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: agregando os primeiros lançamentos. Refine o período para totais exatos.
        </div>
      )}

      {/* Banner de Royalties (própria × franqueada) — legado royBanner L4617 */}
      {unidadeId && royalties && (
        royalties.franqueada ? (
          <div className="rel-card" style={{ background: '#FDF3E7', border: '1px solid #f0d8b0', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <i className="ti ti-receipt-2" style={{ fontSize: 24, color: '#B26A00' }} />
            <div>
              <b style={{ color: '#B26A00' }}>Royalties a pagar (automático) — {moedaBR(royalties.valor)}</b>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                {royalties.pct}% sobre o faturamento do <b>mês anterior</b> ({moedaBR(royalties.faturamentoMesAnterior)}) · vencimento{' '}
                <b>dia {10}</b> ({royalties.venc}). Lançado automaticamente no fluxo de caixa desta <b>unidade franqueada</b>.
              </div>
            </div>
          </div>
        ) : (
          <div className="rel-card" style={{ background: 'var(--green-bg)', marginBottom: 14 }}>
            <b style={{ color: '#0f6b3a' }}><i className="ti ti-circle-check" /> Loja própria</b>
            {' '}— não há royalties a pagar (apenas unidades <b>franqueadas</b> pagam royalties).
          </div>
        )
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Movimentação no período" icon="ti-chart-area-line" rows={movRows} emptyMsg="Sem movimentação no período." />
        <BarChart title="Categorias de Contas a pagar" icon="ti-arrow-down-circle" rows={cpRows} emptyMsg="Sem despesas lançadas no período." />
        <BarChart title="Categorias de Contas a receber" icon="ti-arrow-up-circle" rows={crRows.slice(0, 8).map((l) => ({ label: l.nome, value: l.valor, display: moedaBR(l.valor) }))} gold emptyMsg="Sem receita no período." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span><i className="ti ti-report-money" /> Receita por categoria</span>
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
              {crRows.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma receita lançada no período selecionado.
                  </td>
                </tr>
              )}
              {crRows.map((l) => (
                <tr key={l.nome}>
                  <td style={{ color: 'var(--text-2)' }}>{l.nome}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(l.valor)}</td>
                  <td className="num-r">{receberPrevisto > 0 ? ((l.valor / receberPrevisto) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              ))}
            </tbody>
            {crRows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>Total</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(receberPrevisto)}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
          <i className="ti ti-info-circle" /> Previsto = todos os lançamentos do período; Realizado = lançamentos com status{' '}
          <b>pago</b>. {!unidadeId && 'Royalties são calculados por unidade — selecione uma unidade para ver o banner e o valor.'}
        </div>
      </div>
    </div>
  )
}
