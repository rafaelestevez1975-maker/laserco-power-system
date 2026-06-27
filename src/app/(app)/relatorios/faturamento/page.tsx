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

// Teto de segurança ao somar (a tabela toda tem ~13k linhas, mas SEMPRE escopamos por
// período e/ou unidade — uma janela é bem menor; ainda assim limitamos o pull).
const SUM_CAP = 20000
const PAGE = 1000

type LancMin = { valor: number | null; unidade_id: string | null; data_competencia: string | null }

type SbQuery = {
  select: (cols: string) => SbQuery
  eq: (c: string, v: unknown) => SbQuery
  gte: (c: string, v: unknown) => SbQuery
  lt: (c: string, v: unknown) => SbQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null }>
}

/** Pagina (range) somando até SUM_CAP. Devolve linhas mínimas. */
async function pullReceitas(
  sb: Awaited<ReturnType<typeof createClient>>,
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
      .select('valor, unidade_id, data_competencia')
      .eq('tipo', 'receita') as unknown as SbQuery
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

/** Soma simples de valor sobre as linhas. */
function soma(rows: LancMin[]): number {
  return rows.reduce((a, r) => a + (r.valor || 0), 0)
}

export default async function RelFaturamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Dados financeiros são históricos (sem lançamentos no mês corrente) → default '90d'.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  // Linhas do período atual (escopadas por unidade ativa quando houver).
  const { rows, capped } = await pullReceitas(sb, unidadeId, range.ini, range.fim)
  const totalAtual = soma(rows)
  const qtd = rows.length

  // Comparativo: período anterior de mesmo tamanho (só quando há prev definido).
  let totalAnterior = 0
  let temComparativo = false
  if (range.prevIni && range.prevFim) {
    const prev = await pullReceitas(sb, unidadeId, range.prevIni, range.prevFim)
    totalAnterior = soma(prev.rows)
    temComparativo = true
  }
  const deltaPct = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : null
  const ticket = qtd > 0 ? totalAtual / qtd : 0

  // ── Faturamento por unidade (agrupa em memória as linhas já trazidas) ──
  // Nomes das unidades visíveis (já vêm limpos do contexto).
  const nomeUnidade: Record<string, string> = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))
  const porUnidade = new Map<string, number>()
  let semUnidade = 0
  for (const r of rows) {
    if (r.unidade_id) porUnidade.set(r.unidade_id, (porUnidade.get(r.unidade_id) || 0) + (r.valor || 0))
    else semUnidade += r.valor || 0
  }
  const linhasUnidade = [...porUnidade.entries()]
    .map(([id, v]) => ({ id, nome: nomeUnidade[id] ?? 'Unidade ' + id.slice(0, 6), valor: v }))
    .sort((a, b) => b.valor - a.valor)

  // ── Faturamento por mês de competência (linha do gráfico temporal) ──
  const porMes = new Map<string, number>()
  for (const r of rows) {
    const ym = (r.data_competencia || '').slice(0, 7) // YYYY-MM
    if (ym) porMes.set(ym, (porMes.get(ym) || 0) + (r.valor || 0))
  }
  const barMeses: BarRow[] = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, v]) => ({ label: ym, value: v, display: moedaBR(v) }))

  const barUnidades: BarRow[] = linhasUnidade.slice(0, 10).map((u) => ({ label: u.nome, value: u.valor, display: moedaBR(u.valor) }))

  const kpis: RelKpi[] = [
    { label: 'Faturamento', value: moedaBR(totalAtual), icon: 'ti-cash' },
    { label: 'Lançamentos', value: qtd.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-receipt' },
    { label: 'Ticket médio', value: moedaBR(ticket), icon: 'ti-receipt-2' },
    ...(temComparativo
      ? [
          {
            label: range.prevLabel,
            value: moedaBR(totalAnterior),
            icon: 'ti-history' as const,
            delta:
              deltaPct == null
                ? undefined
                : `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}% vs ${range.label}`,
            deltaTone: (deltaPct == null ? 'flat' : deltaPct >= 0 ? 'up' : 'down') as 'up' | 'down' | 'flat',
          } as RelKpi,
        ]
      : []),
  ]

  return (
    <div className="view active">
      <RelTabs active="faturamento" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Faturamento</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/faturamento" />

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: somando os primeiros {SUM_CAP.toLocaleString('pt-BR')} lançamentos. Refine o período ou filtre por unidade para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Faturamento por mês" icon="ti-calendar-dollar" rows={barMeses} gold asMoeda emptyMsg="Sem receita no período." />
        <BarChart title="Top unidades (R$)" icon="ti-building-store" rows={barUnidades} gold asMoeda emptyMsg="Sem unidades com receita." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Faturamento por unidade
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{linhasUnidade.length} unidade(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Unidade</th>
                <th className="num-r">Faturamento</th>
                <th className="num-r">% do total</th>
              </tr>
            </thead>
            <tbody>
              {linhasUnidade.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma receita registrada no período selecionado.
                  </td>
                </tr>
              )}
              {linhasUnidade.map((u) => (
                <tr key={u.id}>
                  <td>{u.nome}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(u.valor)}</td>
                  <td className="num-r">{totalAtual > 0 ? ((u.valor / totalAtual) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              ))}
              {semUnidade > 0 && (
                <tr style={{ opacity: 0.75 }}>
                  <td><em>Sem unidade vinculada</em></td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(semUnidade)}</td>
                  <td className="num-r">{totalAtual > 0 ? ((semUnidade / totalAtual) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              )}
            </tbody>
            {linhasUnidade.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>Total</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(totalAtual)}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
