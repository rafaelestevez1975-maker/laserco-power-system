import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'
import { pullOS, pullPagamentos, nomesClientes, mapaOsCliente, PAG_STATUS_LABEL, PULL_CAP } from '@/lib/relatorios'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const LISTA_MAX = 300
const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/**
 * Crédito em dinheiro  réplica da intenção do legado (REL_DEFS['credito-dinheiro'],
 * legacy/index.html ~4317: abas Situação/Movimentação de crédito em dinheiro por cliente).
 *
 * Não existe no backend lkii nenhuma tabela de carteira/saldo de crédito
 * (movimentos_caixa / caixas / sessoes_caixa / creditos NÃO existem  confirmado por
 * grep ".from('<tabela>')" em src). A fonte REAL disponível são os pagamentos de OS
 * feitos em DINHEIRO (os_pagamentos.metodo = 'dinheiro'), que é exatamente o "dinheiro
 * recebido por cliente" que o relatório descreve. Aqui apuramos:
 *   • Situação    → total recebido em dinheiro por cliente (com última movimentação).
 *   • Movimentação→ lista de recebimentos em dinheiro no período (data/cliente/valor/status).
 *
 * Escopo multitenant: os_pagamentos não tem unidade_id; restringimos pelas OS da unidade ativa
 * (mesmo padrão de relatorios/pagamentos). Default '90d' (pagamentos são históricos).
 */
export default async function RelCreditoDinheiroPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  // Multitenant: quando há unidade ativa, restringe os pagamentos às OS daquela unidade.
  let osIds: string[] | null = null
  let osCapped = false
  if (unidadeId) {
    const os = await pullOS(sb, { unidadeId, ini: null, fim: null })
    osIds = os.rows.map((r) => r.id)
    osCapped = os.capped
  }

  // Puxa pagamentos do período e filtra somente os feitos em DINHEIRO.
  const { rows: todos, capped } = await pullPagamentos(sb, { ini: range.ini, fim: range.fim, osIds })
  const rows = todos.filter((r) => (r.metodo || '').toLowerCase() === 'dinheiro')

  const ehAprovado = (s: string | null) => s === 'aprovado'

  // KPIs  só recebimentos aprovados contam como dinheiro efetivamente em caixa.
  let totalDinheiro = 0
  let qtdAprovados = 0
  for (const r of rows) {
    if (!ehAprovado(r.status)) continue
    totalDinheiro += Number(r.valor) || 0
    qtdAprovados += 1
  }
  const ticket = qtdAprovados > 0 ? totalDinheiro / qtdAprovados : 0

  // Total recebido (todos os métodos, aprovados) para calcular a participação do dinheiro.
  let totalGeralAprovado = 0
  for (const r of todos) {
    if (ehAprovado(r.status)) totalGeralAprovado += Number(r.valor) || 0
  }
  const pctDinheiro = totalGeralAprovado > 0 ? (totalDinheiro / totalGeralAprovado) * 100 : 0

  // Resolve cliente via OS (os_pagamentos não tem cliente_id direto).
  const osComPag = [...new Set(rows.map((r) => r.os_id || '').filter(Boolean))]
  const nomeCliente: Record<string, string> = {}
  const clienteIdDaOs = await mapaOsCliente(sb, osComPag)
  if (Object.keys(clienteIdDaOs).length > 0) {
    const cliIds = Object.values(clienteIdDaOs).filter((v): v is string => !!v)
    Object.assign(nomeCliente, await nomesClientes(sb, cliIds))
  }
  const nomeDoPag = (osId: string | null): string => {
    if (!osId) return ''
    const cid = clienteIdDaOs[osId]
    return cid ? (nomeCliente[cid] ?? '') : ''
  }
  const chaveCliente = (osId: string | null): string => {
    if (!osId) return '∅'
    return clienteIdDaOs[osId] || '∅'
  }

  // ── Situação: total em dinheiro por cliente (só aprovados) + última movimentação ──
  const porCliente = new Map<string, { nome: string; valor: number; qtd: number; ultima: string | null }>()
  for (const r of rows) {
    if (!ehAprovado(r.status)) continue
    const k = chaveCliente(r.os_id)
    const nome = k === '∅' ? 'Sem cliente vinculado' : nomeCliente[k] ?? nomeDoPag(r.os_id)
    const a = porCliente.get(k) || { nome, valor: 0, qtd: 0, ultima: null as string | null }
    a.valor += Number(r.valor) || 0
    a.qtd += 1
    const d = r.data_pagamento || null
    if (d && (!a.ultima || d > a.ultima)) a.ultima = d
    porCliente.set(k, a)
  }
  const linhasCliente = [...porCliente.values()].sort((a, b) => b.valor - a.valor)

  // ── Movimentação: detalhe cronológico (mais recentes primeiro) ──
  const detalhe = [...rows]
    .sort((a, b) => (b.data_pagamento || '').localeCompare(a.data_pagamento || ''))
    .slice(0, LISTA_MAX)

  // ── Gráficos ──
  const porMes = new Map<string, number>()
  for (const r of rows) {
    if (!ehAprovado(r.status)) continue
    const ym = (r.data_pagamento || '').slice(0, 7) // YYYY-MM
    if (ym) porMes.set(ym, (porMes.get(ym) || 0) + (Number(r.valor) || 0))
  }
  const barMeses: BarRow[] = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, v]) => {
      const [, m] = ym.split('-')
      const label = `${MESES_CURTO[(Number(m) || 1) - 1] ?? m}/${ym.slice(2, 4)}`
      return { label, value: v, display: moedaBR(v) }
    })

  const barClientes: BarRow[] = linhasCliente
    .slice(0, 10)
    .map((c) => ({ label: c.nome, value: c.valor, display: moedaBR(c.valor) }))

  const kpis: RelKpi[] = [
    { label: 'Recebido em dinheiro', value: moedaBR(totalDinheiro), icon: 'ti-coins' },
    { label: 'Recebimentos', value: qtdAprovados.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-receipt' },
    { label: 'Clientes', value: linhasCliente.length.toLocaleString('pt-BR'), icon: 'ti-users' },
    { label: 'Ticket médio', value: moedaBR(ticket), icon: 'ti-receipt-2' },
    {
      label: '% do recebido',
      value: `${pctDinheiro.toFixed(0)}%`,
      icon: 'ti-percentage',
      delta: totalGeralAprovado > 0 ? `de ${moedaBR(totalGeralAprovado)} no total` : undefined,
      deltaTone: 'flat',
    },
  ]

  function statusPill(s: string | null) {
    if (s === 'aprovado') return <span className="os-st os-fechada">Recebido</span>
    if (s === 'pendente') return <span className="os-st os-aberta">Pendente</span>
    return <span className="os-st os-cancelada">{PAG_STATUS_LABEL[s || ''] ?? 'Com erro'}</span>
  }

  const csvRows = detalhe.map((r) => [
    dataBR(r.data_pagamento),
    nomeDoPag(r.os_id),
    Math.round(Number(r.valor) || 0),
    PAG_STATUS_LABEL[r.status || ''] ?? r.status ?? '',
  ])

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Crédito em dinheiro</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="rel-legend">
        Apuração dos <b>recebimentos em dinheiro</b> (pagamentos de OS com método <b>Dinheiro</b>) no período.
        A <b>Situação</b> totaliza por cliente; a <b>Movimentação</b> lista cada recebimento. Apenas pagamentos
        <b> aprovados</b> entram nos totais e KPIs.
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/credito-dinheiro" />
        <ExportCsvButton filename={`credito-dinheiro-${periodo}`} headers={['Data', 'Cliente', 'Valor', 'Status']} rows={csvRows} />
      </div>

      {(capped || osCapped) && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período/unidade muito amplos: agregando as primeiras {PULL_CAP.toLocaleString('pt-BR')} linhas. Refine o período para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Dinheiro recebido por mês" icon="ti-calendar-dollar" rows={barMeses} gold asMoeda emptyMsg="Sem recebimentos em dinheiro no período." />
        <BarChart title="Top clientes (R$ em dinheiro)" icon="ti-users" rows={barClientes} gold asMoeda emptyMsg="Sem clientes com pagamento em dinheiro." />
      </div>

      {/* ── Situação: por cliente ── */}
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-coins" /> Situação por cliente
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{linhasCliente.length.toLocaleString('pt-BR')} cliente(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num-r">Recebimentos</th>
                <th className="num-r">Total em dinheiro</th>
                <th>Última movimentação</th>
              </tr>
            </thead>
            <tbody>
              {linhasCliente.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum recebimento em dinheiro no período selecionado.
                  </td>
                </tr>
              )}
              {linhasCliente.map((c, i) => (
                <tr key={i}>
                  <td>
                    <span className="cli-name">{c.nome}</span>
                  </td>
                  <td className="num-r">{c.qtd.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(c.valor)}</td>
                  <td>{dataBR(c.ultima)}</td>
                </tr>
              ))}
            </tbody>
            {linhasCliente.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>Total</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{qtdAprovados.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(totalDinheiro)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Movimentação: detalhe ── */}
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-arrows-exchange" /> Movimentação no período
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {rows.length.toLocaleString('pt-BR')} movimento(s){detalhe.length < rows.length ? ` · exibindo ${detalhe.length}` : ''}
          </span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th className="num-r">Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma movimentação em dinheiro no período selecionado.
                  </td>
                </tr>
              )}
              {detalhe.map((r, i) => (
                <tr key={i}>
                  <td>{dataBR(r.data_pagamento)}</td>
                  <td>
                    <span className="cli-name">{nomeDoPag(r.os_id)}</span>
                  </td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(Number(r.valor) || 0)}</td>
                  <td>{statusPill(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crm-note" style={{ marginTop: 16 }}>
        <i className="ti ti-info-circle" /> O backend ainda não possui uma <b>carteira de crédito/saldo</b> dedicada
        (tabelas de caixa/créditos inexistentes). Este relatório usa a fonte real disponível: os
        <b> pagamentos de OS em dinheiro</b>. Quando uma tabela de saldo de crédito do cliente existir, a aba
        Situação passará a refletir o saldo remanescente (créditos concedidos − utilizados).
      </div>
    </div>
  )
}
