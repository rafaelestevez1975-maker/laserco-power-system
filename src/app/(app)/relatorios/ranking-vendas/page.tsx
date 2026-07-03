import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { RankLimitSel } from '@/components/relatorios/RankLimitSel'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'
import { pullOS, nomesPerfis, PULL_CAP } from '@/lib/relatorios'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string; limit?: string }

const LIMITES = [10, 50, 100, 250, 500]

/**
 * Ranking de Vendas  réplica do RANKS.vendas / rankRender do legado (legacy/index.html ~6963).
 * Sobre dado REAL: ranqueia os vendedores (os.criado_por) por valor total de OS fechadas no
 * período, com colunas Posição/Colaborador/Vendas/Valor/Ticket médio, seletor Top 10/50/100/250/500
 * e rodapé "Exibindo Top X de Y". Default '90d' (OS são históricas como o faturamento).
 */
export default async function RelRankingVendasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const limite = LIMITES.includes(Number(sp.limit)) ? Number(sp.limit) : 10

  // Só OS fechadas (venda efetivada), como no relatório de vendas do legado.
  const { rows, capped } = await pullOS(sb, { unidadeId, ini: range.ini, fim: range.fim, status: 'fechada' })

  // Agrega por vendedor (criado_por).
  type Agg = { id: string; vendas: number; valor: number }
  const porVend = new Map<string, Agg>()
  let totalVendido = 0
  for (const r of rows) {
    const valor = Number(r.total) || 0
    totalVendido += valor
    const k = r.criado_por || '∅'
    const a = porVend.get(k) || { id: k, vendas: 0, valor: 0 }
    a.vendas += 1
    a.valor += valor
    porVend.set(k, a)
  }

  const nomes = await nomesPerfis(sb, [...porVend.keys()].filter((k) => k !== '∅'))
  const ranking = [...porVend.values()]
    .map((a) => ({
      id: a.id,
      nome: a.id === '∅' ? 'Sem vendedor vinculado' : (nomes[a.id] ?? 'Vendedor ' + a.id.slice(0, 6)),
      vendas: a.vendas,
      valor: a.valor,
      ticket: a.vendas > 0 ? a.valor / a.vendas : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  const visiveis = ranking.slice(0, limite)
  const lider = ranking[0]
  const totalQtd = rows.length
  const ticketGeral = totalQtd > 0 ? totalVendido / totalQtd : 0

  const barTop: BarRow[] = ranking.slice(0, 10).map((r) => ({ label: r.nome, value: r.valor, display: moedaBR(r.valor) }))

  const kpis: RelKpi[] = [
    { label: 'Total vendido', value: moedaBR(totalVendido), icon: 'ti-currency-dollar' },
    { label: 'Vendedores', value: ranking.length.toLocaleString('pt-BR'), icon: 'ti-users' },
    { label: 'Líder', value: lider ? lider.nome : '', icon: 'ti-trophy', delta: lider ? moedaBR(lider.valor) : undefined, deltaTone: 'up' },
    { label: 'Ticket médio', value: moedaBR(ticketGeral), icon: 'ti-receipt' },
  ]

  const csvRows = visiveis.map((r, i) => [i + 1, r.nome, r.vendas, Math.round(r.valor), Math.round(r.ticket)])

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Ranking de Vendas</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="rel-legend">
        Ranqueado por <b>valor de OS fechadas</b> no período, por vendedor (responsável da OS). Use o seletor <b>limite do ranking</b> para alternar entre Top 10/50/100/250/500.
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
          <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/ranking-vendas" />
          <RankLimitSel value={limite} />
        </div>
        <ExportCsvButton filename={`ranking-vendas-${periodo}`} headers={['Posição', 'Colaborador', 'Vendas', 'Valor', 'Ticket médio']} rows={csvRows} />
      </div>

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: ranqueando as primeiras {PULL_CAP.toLocaleString('pt-BR')} OS. Refine o período ou filtre por unidade para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Top 10 vendedores (R$)" icon="ti-medal" rows={barTop} gold asMoeda emptyMsg="Sem vendas no período." />
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-trophy" /> Ranking de vendas · {range.label}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{ranking.length} vendedor(es)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th className="num-r">Posição</th>
                <th>Colaborador</th>
                <th className="num-r">Vendas</th>
                <th className="num-r">Valor</th>
                <th className="num-r">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma OS fechada no período selecionado.
                  </td>
                </tr>
              )}
              {visiveis.map((r, i) => (
                <tr key={r.id}>
                  <td className="num-r" style={{ fontWeight: 700, color: i < 3 ? 'var(--brand-500)' : undefined }}>{i + 1}º</td>
                  <td>
                    <span className="cli-name">{r.nome}</span>
                  </td>
                  <td className="num-r">{r.vendas.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 700 }}>{moedaBR(r.valor)}</td>
                  <td className="num-r">{moedaBR(r.ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visiveis.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 18px', textAlign: 'right' }}>
            Exibindo Top {Math.min(limite, ranking.length)} de {ranking.length}
          </div>
        )}
      </div>
    </div>
  )
}
