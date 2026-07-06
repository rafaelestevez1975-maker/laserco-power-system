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
 * Relatório de Crédito Recorrente  réplica da intenção do legado
 * (REL_DEFS['credito-recorrente'], legacy/index.html ~4331: assinaturas recorrentes,
 * MRR recorrente, falhas de cobrança, cancelamentos; colunas Cliente/Status/Valor/Modo/Próx. cobrança).
 *
 * Fonte de dados REAL (confirmada no código):
 *   • A forma de pagamento "Crédito Recorrente" é um tipo do catálogo formas_pagamento
 *     (tipo = 'Crédito Recorrente', integração PagoLivre  ver lib/catalogo.ehRecorrente e
 *     src/app/(app)/cadastros/formas-pagamento/*). Não existe tabela de assinaturas *por cliente*
 *     no backend lkii (cliente_assinaturas / assinaturas / clientes_planos não aparecem em
 *     nenhum from()), então status Ativo/Pausado/Cancelado por assinatura e "próxima cobrança"
 *     não são calculáveis ainda.
 *   • O dado REAL disponível são as cobranças recorrentes efetivamente lançadas: pagamentos de OS
 *     com metodo = 'credito_recorrente' (METODO_LABEL.credito_recorrente em src/lib/relatorios.ts).
 *     É a mesma fonte do relatório /relatorios/credito-dinheiro (metodo = 'dinheiro'). Aqui apuramos:
 *       - Por cliente   → total cobrado em crédito recorrente (com última cobrança).
 *       - Movimentação  → cada cobrança no período (data/cliente/valor/status).
 *
 * Mapeamento das métricas do legado para o dado real:
 *   Assinaturas recorrentes → clientes distintos com cobrança recorrente.
 *   MRR recorrente          → total recebido (aprovado) em crédito recorrente no período.
 *   Falhas de cobrança      → cobranças recusadas/estornadas.
 *   Cancelamentos           → cobranças canceladas.
 *
 * Escopo multitenant: os_pagamentos não tem unidade_id → restringimos pelas OS da unidade ativa
 * (mesmo padrão de relatorios/credito-dinheiro e relatorios/pagamentos). Default '90d'.
 *
 * ROBUSTEZ: pullPagamentos/pullOS tratam ausência de dados como vazio (sem quebrar). Se a forma
 * "Crédito Recorrente" ainda não foi usada em nenhuma cobrança, o relatório renderiza um estado
 * "sem cobranças recorrentes" + nota explicativa em vez de erro.
 */
export default async function RelCreditoRecorrentePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  // Multitenant: quando há unidade ativa, restringe as cobranças às OS daquela unidade.
  let osIds: string[] | null = null
  let osCapped = false
  if (unidadeId) {
    const os = await pullOS(sb, { unidadeId, ini: null, fim: null })
    osIds = os.rows.map((r) => r.id)
    osCapped = os.capped
  }

  // Puxa pagamentos do período e filtra somente os de CRÉDITO RECORRENTE.
  const { rows: todos, capped } = await pullPagamentos(sb, { ini: range.ini, fim: range.fim, osIds })
  const rows = todos.filter((r) => (r.metodo || '').toLowerCase() === 'credito_recorrente')

  const ehAprovado = (s: string | null) => s === 'aprovado'
  const ehFalha = (s: string | null) => s === 'recusado' || s === 'estornado'
  const ehCancelado = (s: string | null) => s === 'cancelado'

  // ── Resolve cliente via OS (os_pagamentos não tem cliente_id direto) ──
  const osComPag = [...new Set(rows.map((r) => r.os_id || '').filter(Boolean))]
  const nomeCliente: Record<string, string> = {}
  const clienteIdDaOs = await mapaOsCliente(sb, osComPag)
  if (Object.keys(clienteIdDaOs).length > 0) {
    const cliIds = Object.values(clienteIdDaOs).filter((v): v is string => !!v)
    Object.assign(nomeCliente, await nomesClientes(sb, cliIds))
  }
  const chaveCliente = (osId: string | null): string => {
    if (!osId) return '∅'
    return clienteIdDaOs[osId] || '∅'
  }
  const nomeDoPag = (osId: string | null): string => {
    const k = chaveCliente(osId)
    if (k === '∅') return 'Sem cliente vinculado'
    return nomeCliente[k] ?? ''
  }

  // ── KPIs ──
  let mrrRecorrente = 0
  let qtdAprovados = 0
  for (const r of rows) {
    if (!ehAprovado(r.status)) continue
    mrrRecorrente += Number(r.valor) || 0
    qtdAprovados += 1
  }
  const falhas = rows.filter((r) => ehFalha(r.status)).length
  const cancelamentos = rows.filter((r) => ehCancelado(r.status)).length
  // Assinaturas recorrentes = clientes distintos com ao menos uma cobrança recorrente aprovada.
  const clientesRecorrentes = new Set<string>()
  for (const r of rows) {
    if (ehAprovado(r.status)) clientesRecorrentes.add(chaveCliente(r.os_id))
  }
  const ticket = qtdAprovados > 0 ? mrrRecorrente / qtdAprovados : 0

  // ── Por cliente: total recorrente (só aprovados) + última cobrança ──
  const porCliente = new Map<string, { nome: string; valor: number; qtd: number; ultima: string | null }>()
  for (const r of rows) {
    if (!ehAprovado(r.status)) continue
    const k = chaveCliente(r.os_id)
    const nome = k === '∅' ? 'Sem cliente vinculado' : nomeCliente[k] ?? ''
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
    { label: 'Assinaturas recorrentes', value: clientesRecorrentes.size.toLocaleString('pt-BR'), icon: 'ti-credit-card', delta: 'Clientes com cobrança recorrente', deltaTone: 'flat' },
    { label: 'MRR recorrente', value: moedaBR(mrrRecorrente), icon: 'ti-cash', delta: `${qtdAprovados.toLocaleString('pt-BR')} cobrança(s) aprovada(s)`, deltaTone: 'flat' },
    { label: 'Falhas de cobrança', value: falhas.toLocaleString('pt-BR'), icon: 'ti-alert-triangle', deltaTone: falhas > 0 ? 'down' : 'flat' },
    { label: 'Cancelamentos', value: cancelamentos.toLocaleString('pt-BR'), icon: 'ti-x', deltaTone: cancelamentos > 0 ? 'down' : 'flat' },
    { label: 'Ticket médio', value: moedaBR(ticket), icon: 'ti-receipt' },
  ]

  function statusPill(s: string | null) {
    if (s === 'aprovado') return <span className="os-st os-fechada">Aprovado</span>
    if (s === 'pendente') return <span className="os-st os-aberta">Pendente</span>
    if (s === 'cancelado') return <span className="os-st os-cancelada">Cancelado</span>
    return <span className="os-st os-cancelada">{PAG_STATUS_LABEL[s || ''] ?? 'Falha'}</span>
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
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Crédito Recorrente</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="rel-legend">
        Apuração das <b>cobranças em crédito recorrente</b> (pagamentos de OS com método
        <b> Crédito Recorrente</b> · PagoLivre) no período. A tabela por cliente totaliza as cobranças aprovadas;
        a <b>Movimentação</b> lista cada cobrança. Apenas cobranças <b>aprovadas</b> entram no MRR e no ticket.
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/credito-recorrente" />
        <ExportCsvButton filename={`credito-recorrente-${periodo}`} headers={['Data', 'Cliente', 'Valor', 'Status']} rows={csvRows} />
      </div>

      {(capped || osCapped) && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período/unidade muito amplos: agregando as primeiras {PULL_CAP.toLocaleString('pt-BR')} linhas. Refine o período para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Crédito recorrente por mês" icon="ti-calendar-dollar" rows={barMeses} gold asMoeda emptyMsg="Sem cobranças recorrentes no período." />
        <BarChart title="Top clientes (R$ recorrente)" icon="ti-users" rows={barClientes} gold asMoeda emptyMsg="Sem clientes com crédito recorrente." />
      </div>

      {/* ── Por cliente ── */}
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-credit-card" /> Cobranças recorrentes por cliente
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{linhasCliente.length.toLocaleString('pt-BR')} cliente(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num-r">Cobranças</th>
                <th className="num-r">Total recorrente</th>
                <th>Última cobrança</th>
              </tr>
            </thead>
            <tbody>
              {linhasCliente.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma cobrança em crédito recorrente no período selecionado.
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
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(mrrRecorrente)}</td>
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
            {rows.length.toLocaleString('pt-BR')} cobrança(s){detalhe.length < rows.length ? ` · exibindo ${detalhe.length}` : ''}
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
                    Nenhuma cobrança recorrente no período selecionado.
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
        <i className="ti ti-info-circle" /> O backend ainda não possui uma <b>tabela de assinaturas por cliente</b>
        (vínculo cliente↔plano recorrente inexistente), então <b>status por assinatura (Ativo/Pausado/Cancelado),
        modo de operação e próxima cobrança</b> não são calculáveis. Este relatório usa a fonte real disponível:
        as <b>cobranças de OS no método Crédito Recorrente</b> (PagoLivre). Quando o vínculo de assinatura por cliente
        existir, serão adicionados o status da assinatura e a data da próxima cobrança.
      </div>
    </div>
  )
}
