import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'
import { pullOS, nomesPerfis, nomesClientes, PULL_CAP } from '@/lib/relatorios'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const LISTA_MAX = 300

/**
 * Descontos  réplica do REL_DEFS.descontos do legado (legacy/index.html ~4337).
 * Sobre dado REAL: cada OS com desconto_total > 0 vira uma aplicação de desconto.
 * KPIs: descontos concedidos (R$), nº de aplicações, % médio, maior impacto (vendedor).
 * Colunas: Data/Cliente/Desconto (R$)/% sobre bruto/Valor líquido/Colaborador.
 */
export default async function RelDescontosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  // OS não canceladas no período (descontos valem para vendas concretizadas/abertas).
  const { rows, capped } = await pullOS(sb, { unidadeId, ini: range.ini, fim: range.fim, status: ['aberta', 'fechada'] })
  const comDesconto = rows.filter((r) => (Number(r.desconto_total) || 0) > 0)

  const totalConcedido = comDesconto.reduce((a, r) => a + (Number(r.desconto_total) || 0), 0)
  const aplicacoes = comDesconto.length
  // % médio = média ponderada do desconto sobre o total bruto.
  const somaBruto = comDesconto.reduce((a, r) => a + (Number(r.total_bruto) || (Number(r.total) || 0) + (Number(r.desconto_total) || 0)), 0)
  const pctMedio = somaBruto > 0 ? (totalConcedido / somaBruto) * 100 : 0

  // Maior impacto: vendedor que concedeu mais desconto.
  const porVend = new Map<string, number>()
  for (const r of comDesconto) {
    const k = r.criado_por || '∅'
    porVend.set(k, (porVend.get(k) || 0) + (Number(r.desconto_total) || 0))
  }
  const nomesV = await nomesPerfis(sb, [...porVend.keys()].filter((k) => k !== '∅'))
  const rankVend = [...porVend.entries()]
    .map(([id, v]) => ({ nome: id === '∅' ? 'Sem vendedor' : (nomesV[id] ?? 'Vendedor ' + id.slice(0, 6)), valor: v }))
    .sort((a, b) => b.valor - a.valor)
  const maiorImpacto = rankVend[0]?.nome ?? ''

  // Lista detalhada (cap leve, mais recentes primeiro).
  const detalhe = [...comDesconto]
    .sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || ''))
    .slice(0, LISTA_MAX)
  const nomesC = await nomesClientes(sb, detalhe.map((r) => r.cliente_id || '').filter(Boolean))

  const linhas = detalhe.map((r) => {
    const desc = Number(r.desconto_total) || 0
    const liquido = Number(r.total) || 0
    const bruto = Number(r.total_bruto) || liquido + desc
    const pct = bruto > 0 ? (desc / bruto) * 100 : 0
    return {
      data: r.criado_em,
      cliente: r.cliente_id ? (nomesC[r.cliente_id] ?? '') : '',
      desconto: desc,
      pct,
      liquido,
      colaborador: r.criado_por ? (nomesV[r.criado_por] ?? 'Vendedor ' + r.criado_por.slice(0, 6)) : '',
    }
  })

  const barVend: BarRow[] = rankVend.slice(0, 10).map((v) => ({ label: v.nome, value: v.valor, display: moedaBR(v.valor) }))

  const kpis: RelKpi[] = [
    { label: 'Descontos concedidos', value: moedaBR(totalConcedido), icon: 'ti-discount' },
    { label: 'Nº de aplicações', value: aplicacoes.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-tag' },
    { label: '% médio', value: `${pctMedio.toFixed(1)}%`, icon: 'ti-percentage' },
    { label: 'Maior impacto', value: maiorImpacto, icon: 'ti-user-dollar' },
  ]

  const csvRows = linhas.map((l) => [dataBR(l.data), l.cliente, Math.round(l.desconto), l.pct.toFixed(1) + '%', Math.round(l.liquido), l.colaborador])

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Descontos</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/descontos" />
        <ExportCsvButton filename={`descontos-${periodo}`} headers={['Data', 'Cliente', 'Desconto', '%', 'Valor líquido', 'Colaborador']} rows={csvRows} />
      </div>

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: analisando as primeiras {PULL_CAP.toLocaleString('pt-BR')} OS. Refine o período ou filtre por unidade.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Desconto concedido por colaborador (R$)" icon="ti-discount" rows={barVend} gold asMoeda emptyMsg="Sem descontos no período." />
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-list-details" /> Aplicações de desconto
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{aplicacoes.toLocaleString('pt-BR')} aplicação(ões){detalhe.length < comDesconto.length ? ` · exibindo ${detalhe.length}` : ''}</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th className="num-r">Desconto</th>
                <th className="num-r">%</th>
                <th className="num-r">Valor líquido</th>
                <th>Colaborador</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum desconto concedido no período selecionado.
                  </td>
                </tr>
              )}
              {linhas.map((l, i) => (
                <tr key={i}>
                  <td>{dataBR(l.data)}</td>
                  <td>
                    <span className="cli-name">{l.cliente}</span>
                  </td>
                  <td className="num-r" style={{ fontWeight: 600, color: 'var(--red)' }}>− {moedaBR(l.desconto)}</td>
                  <td className="num-r">{l.pct.toFixed(1)}%</td>
                  <td className="num-r">{moedaBR(l.liquido)}</td>
                  <td>{l.colaborador}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
