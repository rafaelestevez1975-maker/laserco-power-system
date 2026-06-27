import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const SUM_CAP = 20000
const PAGE = 1000

type LancMin = { valor: number | null; categoria_id: string | null; data_competencia: string | null; status: string | null }

type SbQuery = {
  select: (cols: string) => SbQuery
  eq: (c: string, v: unknown) => SbQuery
  gte: (c: string, v: unknown) => SbQuery
  lt: (c: string, v: unknown) => SbQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null }>
}

async function pull(
  sb: Awaited<ReturnType<typeof createClient>>,
  tipo: 'receita' | 'despesa',
  unidadeId: string | null,
  ini: string | null,
  fim: string | null,
): Promise<{ rows: LancMin[]; capped: boolean }> {
  const out: LancMin[] = []
  let from = 0
  let capped = false
  for (;;) {
    let q = sb
      .from('lancamentos_financeiros')
      .select('valor, categoria_id, data_competencia, status')
      .eq('tipo', tipo) as unknown as SbQuery
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (ini) q = q.gte('data_competencia', ini)
    if (fim) q = q.lt('data_competencia', fim)
    const { data } = await q.range(from, from + PAGE - 1)
    const batch = (data ?? []) as LancMin[]
    out.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
    if (out.length >= SUM_CAP) {
      capped = true
      break
    }
  }
  return { rows: out, capped }
}

const somaVal = (rows: LancMin[]) => rows.reduce((a, r) => a + (r.valor || 0), 0)

export default async function RelFinanceiroPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  // Dados financeiros são históricos (sem lançamentos no mês corrente) → default '90d'.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  const [rec, desp] = await Promise.all([
    pull(sb, 'receita', unidadeId, range.ini, range.fim),
    pull(sb, 'despesa', unidadeId, range.ini, range.fim),
  ])
  const capped = rec.capped || desp.capped

  const totalReceita = somaVal(rec.rows)
  const totalDespesa = somaVal(desp.rows)
  const resultado = totalReceita - totalDespesa
  const margem = totalReceita > 0 ? (resultado / totalReceita) * 100 : 0

  // Carregar nomes de categorias (plano_contas) usadas — uma query enxuta.
  const catIds = [...new Set([...rec.rows, ...desp.rows].map((r) => r.categoria_id).filter(Boolean))] as string[]
  const catNome: Record<string, string> = {}
  if (catIds.length > 0) {
    const { data: cats } = await sb.from('plano_contas').select('id, nome').in('id', catIds)
    for (const c of (cats ?? []) as { id: string; nome: string }[]) catNome[c.id] = c.nome
  }

  // DRE por categoria de receita.
  const recPorCat = new Map<string, number>()
  for (const r of rec.rows) {
    const k = r.categoria_id || '∅'
    recPorCat.set(k, (recPorCat.get(k) || 0) + (r.valor || 0))
  }
  const linhasReceita = [...recPorCat.entries()]
    .map(([id, v]) => ({ nome: id === '∅' ? 'Sem categoria' : (catNome[id] ?? 'Categoria ' + id.slice(0, 6)), valor: v }))
    .sort((a, b) => b.valor - a.valor)

  const despPorCat = new Map<string, number>()
  for (const r of desp.rows) {
    const k = r.categoria_id || '∅'
    despPorCat.set(k, (despPorCat.get(k) || 0) + (r.valor || 0))
  }
  const linhasDespesa = [...despPorCat.entries()]
    .map(([id, v]) => ({ nome: id === '∅' ? 'Sem categoria' : (catNome[id] ?? 'Categoria ' + id.slice(0, 6)), valor: v }))
    .sort((a, b) => b.valor - a.valor)

  const barReceitaVsDespesa: BarRow[] = [
    { label: 'Receita', value: totalReceita, display: moedaBR(totalReceita) },
    { label: 'Despesa', value: totalDespesa, display: moedaBR(totalDespesa) },
    { label: 'Resultado', value: Math.max(resultado, 0), display: moedaBR(resultado) },
  ]

  const kpis: RelKpi[] = [
    { label: 'Receita', value: moedaBR(totalReceita), icon: 'ti-trending-up' },
    { label: 'Despesa', value: moedaBR(totalDespesa), icon: 'ti-trending-down' },
    {
      label: 'Resultado',
      value: moedaBR(resultado),
      icon: 'ti-report-money',
      delta: `Margem ${margem.toFixed(1)}%`,
      deltaTone: resultado >= 0 ? 'up' : 'down',
    },
    { label: 'Lançamentos', value: (rec.rows.length + desp.rows.length).toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-receipt' },
  ]

  return (
    <div className="view active">
      <RelTabs active="financeiro" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Financeiro — DRE simples</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/financeiro" />

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: agregando os primeiros {SUM_CAP.toLocaleString('pt-BR')} lançamentos por tipo. Refine o período para totais exatos.
        </div>
      )}

      {totalDespesa === 0 && (
        <div className="rel-card" style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 14px' }}>
          <i className="ti ti-info-circle" /> Não há lançamentos do tipo <b>despesa</b> no backend ainda (base atual só tem receitas).
          {/* TODO(legado: buildFinanceiro): integrar contas a pagar/despesas reais quando a fonte existir; a DRE já está pronta para consumi-las. */}
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Receita × Despesa × Resultado" icon="ti-chart-bar" rows={barReceitaVsDespesa} gold asMoeda />
        <BarChart
          title="Receita por categoria"
          icon="ti-category"
          rows={linhasReceita.slice(0, 8).map((l) => ({ label: l.nome, value: l.valor, display: moedaBR(l.valor) }))}
          gold
          asMoeda
          emptyMsg="Sem receita no período."
        />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-report-money" /> Demonstrativo do período
          </span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th className="num-r">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'var(--surface-2)' }}>
                <td style={{ fontWeight: 800 }}>(+) Receitas</td>
                <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(totalReceita)}</td>
              </tr>
              {linhasReceita.map((l) => (
                <tr key={'r-' + l.nome}>
                  <td style={{ paddingLeft: 22, color: 'var(--text-2)' }}>{l.nome}</td>
                  <td className="num-r">{moedaBR(l.valor)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--surface-2)' }}>
                <td style={{ fontWeight: 800 }}>(−) Despesas</td>
                <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(totalDespesa)}</td>
              </tr>
              {linhasDespesa.length === 0 ? (
                <tr>
                  <td style={{ paddingLeft: 22, color: 'var(--text-3)' }}><em>Nenhuma despesa lançada</em></td>
                  <td className="num-r" style={{ color: 'var(--text-3)' }}>{moedaBR(0)}</td>
                </tr>
              ) : (
                linhasDespesa.map((l) => (
                  <tr key={'d-' + l.nome}>
                    <td style={{ paddingLeft: 22, color: 'var(--text-2)' }}>{l.nome}</td>
                    <td className="num-r">{moedaBR(l.valor)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--line)' }}>
                <td style={{ fontWeight: 800 }}>(=) Resultado do período</td>
                <td className="num-r" style={{ fontWeight: 800, color: resultado >= 0 ? 'var(--green, #1f9d55)' : 'var(--red, #d23b53)' }}>{moedaBR(resultado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
