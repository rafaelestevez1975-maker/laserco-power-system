import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'
import { pullOS, pullPagamentos, nomesClientes, mapaOsCliente, METODO_LABEL, PAG_STATUS_LABEL, PULL_CAP } from '@/lib/relatorios'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const LISTA_MAX = 300

/**
 * Pagamentos  réplica da aba Pagamentos do legado (assinaturas.Pagamentos / relPremiacoes
 * ~4266/6926). Sobre dado REAL: agrega os_pagamentos (Previsto/Recebido/Pendente/Com erro/Taxa
 * de sucesso) e breakdown por método. Para escopar por unidade, restringe pelas OS da unidade
 * ativa (os_pagamentos não tem unidade_id). Default '90d' (pagamentos são históricos).
 */
export default async function RelPagamentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  // Multitenant: quando há unidade ativa, restringe os pagamentos às OS daquela unidade.
  // Sem unidade ativa, traz todos (admin/rede). osIds=null = sem restrição por OS.
  let osIds: string[] | null = null
  let osCapped = false
  if (unidadeId) {
    const os = await pullOS(sb, { unidadeId, ini: null, fim: null })
    osIds = os.rows.map((r) => r.id)
    osCapped = os.capped
  }

  const { rows, capped } = await pullPagamentos(sb, { ini: range.ini, fim: range.fim, osIds })

  // Agrega por status financeiro.
  const ehAprovado = (s: string | null) => s === 'aprovado'
  const ehPendente = (s: string | null) => s === 'pendente'
  const ehErro = (s: string | null) => s === 'recusado' || s === 'estornado' || s === 'cancelado'

  let recebido = 0
  let pendente = 0
  let comErro = 0
  for (const r of rows) {
    const v = Number(r.valor) || 0
    if (ehAprovado(r.status)) recebido += v
    else if (ehPendente(r.status)) pendente += v
    else if (ehErro(r.status)) comErro += v
  }
  const previsto = recebido + pendente + comErro
  const taxaSucesso = previsto > 0 ? (recebido / previsto) * 100 : 0

  // Breakdown por método (só os recebidos/aprovados, como no PDV).
  const porMetodo = new Map<string, { valor: number; qtd: number }>()
  for (const r of rows) {
    if (!ehAprovado(r.status)) continue
    const k = r.metodo || 'outros'
    const a = porMetodo.get(k) || { valor: 0, qtd: 0 }
    a.valor += Number(r.valor) || 0
    a.qtd += 1
    porMetodo.set(k, a)
  }
  const linhasMetodo = [...porMetodo.entries()]
    .map(([k, v]) => ({ metodo: METODO_LABEL[k] ?? k, valor: v.valor, qtd: v.qtd }))
    .sort((a, b) => b.valor - a.valor)

  const barMetodo: BarRow[] = linhasMetodo.slice(0, 10).map((m) => ({ label: m.metodo, value: m.valor, display: moedaBR(m.valor) }))

  // Lista detalhada (mais recentes primeiro).
  const detalhe = [...rows].sort((a, b) => (b.data_pagamento || '').localeCompare(a.data_pagamento || '')).slice(0, LISTA_MAX)
  // Resolve cliente via OS (os_pagamentos não tem cliente_id direto).
  const osDetalheIds = [...new Set(detalhe.map((r) => r.os_id || '').filter(Boolean))]
  const clienteDaOs = await mapaOsCliente(sb, osDetalheIds)
  if (Object.keys(clienteDaOs).length > 0) {
    const cliIds = Object.values(clienteDaOs).filter((v): v is string => !!v)
    const nomesC = await nomesClientes(sb, cliIds)
    for (const id of Object.keys(clienteDaOs)) {
      const cid = clienteDaOs[id]
      clienteDaOs[id] = cid ? (nomesC[cid] ?? '') : ''
    }
  }

  const kpis: RelKpi[] = [
    { label: 'Previsto no período', value: moedaBR(previsto), icon: 'ti-calendar-dollar' },
    { label: 'Recebido', value: moedaBR(recebido), icon: 'ti-cash', delta: `${taxaSucesso.toFixed(0)}% de sucesso`, deltaTone: taxaSucesso >= 80 ? 'up' : 'flat' },
    { label: 'Pendente', value: moedaBR(pendente), icon: 'ti-clock' },
    { label: 'Com erro', value: moedaBR(comErro), icon: 'ti-alert-triangle', deltaTone: comErro > 0 ? 'down' : 'flat' },
    { label: 'Taxa de sucesso', value: `${taxaSucesso.toFixed(0)}%`, icon: 'ti-percentage' },
  ]

  function statusPill(s: string | null) {
    if (s === 'aprovado') return <span className="os-st os-fechada">Recebido</span>
    if (s === 'pendente') return <span className="os-st os-aberta">Pendente</span>
    return <span className="os-st os-cancelada">{PAG_STATUS_LABEL[s || ''] ?? 'Com erro'}</span>
  }

  const csvRows = detalhe.map((r) => [
    dataBR(r.data_pagamento),
    (r.os_id && clienteDaOs[r.os_id]) || '',
    METODO_LABEL[r.metodo || 'outros'] ?? r.metodo ?? '',
    Math.round(Number(r.valor) || 0),
    PAG_STATUS_LABEL[r.status || ''] ?? r.status ?? '',
  ])

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Pagamentos</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="rel-legend">
        Apuração dos <b>pagamentos de OS</b> no período (data de pagamento). <b>Recebido</b> = aprovados, <b>Pendente</b> = aguardando, <b>Com erro</b> = recusados/estornados/cancelados. A taxa de sucesso é recebido ÷ previsto.
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/pagamentos" />
        <ExportCsvButton filename={`pagamentos-${periodo}`} headers={['Data', 'Cliente', 'Método', 'Valor', 'Status']} rows={csvRows} />
      </div>

      {(capped || osCapped) && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período/unidade muito amplos: agregando as primeiras {PULL_CAP.toLocaleString('pt-BR')} linhas. Refine o período para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Recebido por método (R$)" icon="ti-credit-card" rows={barMetodo} gold asMoeda emptyMsg="Sem pagamentos recebidos no período." />
        <BarChart
          title="Previsto × Recebido × Pendente × Erro"
          icon="ti-chart-bar"
          rows={[
            { label: 'Previsto', value: previsto, display: moedaBR(previsto) },
            { label: 'Recebido', value: recebido, display: moedaBR(recebido) },
            { label: 'Pendente', value: pendente, display: moedaBR(pendente) },
            { label: 'Com erro', value: comErro, display: moedaBR(comErro) },
          ]}
          gold
          asMoeda
          emptyMsg="Sem pagamentos no período."
        />
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-receipt-2" /> Pagamentos no período
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{rows.length.toLocaleString('pt-BR')} pagamento(s){detalhe.length < rows.length ? ` · exibindo ${detalhe.length}` : ''}</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Método</th>
                <th className="num-r">Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum pagamento registrado no período selecionado.
                  </td>
                </tr>
              )}
              {detalhe.map((r, i) => (
                <tr key={i}>
                  <td>{dataBR(r.data_pagamento)}</td>
                  <td>
                    <span className="cli-name">{(r.os_id && clienteDaOs[r.os_id]) || ''}</span>
                  </td>
                  <td>{METODO_LABEL[r.metodo || 'outros'] ?? r.metodo ?? ''}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(Number(r.valor) || 0)}</td>
                  <td>{statusPill(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rel-card" style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 14px' }}>
        <i className="ti ti-info-circle" /> A apuração de <b>premiações pela Matriz de Metas</b> (faixas 80/100/120/130% por colaborador) está em
        <b> Cadastros · Comissões</b> e <b>Relatórios · Metas</b>; aqui mostramos os pagamentos efetivos das OS.
        {/* TODO(legado: relPremiacoesHTML 6926): roster de premiação por colaborador (premCalc/premRoster)
            depende da persistência da Matriz de Comissões; quando a tabela existir, somar aba "Premiações". */}
      </div>
    </div>
  )
}
