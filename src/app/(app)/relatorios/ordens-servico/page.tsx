import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'
import { pullOS, nomesClientes, PULL_CAP } from '@/lib/relatorios'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const LISTA_MAX = 300

const STATUS_META: Record<string, { label: string; cls: string }> = {
  aberta: { label: 'Aberta', cls: 'os-aberta' },
  fechada: { label: 'Finalizada', cls: 'os-fechada' },
  cancelada: { label: 'Cancelada', cls: 'os-cancelada' },
}

const ORIGEM_LABEL: Record<string, string> = {
  avulsa: 'Avulsa',
  agendamento: 'Agendamento',
  pacote: 'Pacote',
  assinatura: 'Assinatura',
  interna: 'Interna',
  multa_assinatura: 'Multa de assinatura',
}

/**
 * Ordens de serviço — réplica do REL_DEFS['ordens-servico'] do legado (legacy/index.html ~4406).
 * Sobre dado REAL (tabela os). KPIs: OS no período / Finalizadas / Em aberto / Canceladas.
 * Colunas: OS/Cliente/Origem/Status/Abertura/Valor.
 */
export default async function RelOrdensServicoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  const { rows, capped } = await pullOS(sb, { unidadeId, ini: range.ini, fim: range.fim })

  const total = rows.length
  const finalizadas = rows.filter((r) => r.status === 'fechada').length
  const abertas = rows.filter((r) => r.status === 'aberta').length
  const canceladas = rows.filter((r) => r.status === 'cancelada').length
  const valorTotal = rows.filter((r) => r.status !== 'cancelada').reduce((a, r) => a + (Number(r.total) || 0), 0)

  // Quando o pull é truncado (capped), TODO número derivado também é parcial → marca '+'
  // para não exibir contadores fechados que não somam o total exibido.
  const cap = capped ? '+' : ''
  const nfmt = (n: number) => n.toLocaleString('pt-BR') + cap

  // Breakdown por origem.
  const porOrigem = new Map<string, number>()
  for (const r of rows) {
    const k = r.origem || 'avulsa'
    porOrigem.set(k, (porOrigem.get(k) || 0) + 1)
  }
  const barOrigem: BarRow[] = [...porOrigem.entries()]
    .map(([k, v]) => ({ label: ORIGEM_LABEL[k] ?? k, value: v, display: nfmt(v) }))
    .sort((a, b) => b.value - a.value)

  const barStatus: BarRow[] = [
    { label: 'Finalizadas', value: finalizadas, display: nfmt(finalizadas) },
    { label: 'Em aberto', value: abertas, display: nfmt(abertas) },
    { label: 'Canceladas', value: canceladas, display: nfmt(canceladas) },
  ]

  // Lista detalhada.
  const detalhe = [...rows].sort((a, b) => (b.criado_em || '').localeCompare(a.criado_em || '')).slice(0, LISTA_MAX)
  const nomesC = await nomesClientes(sb, detalhe.map((r) => r.cliente_id || '').filter(Boolean))

  const kpis: RelKpi[] = [
    { label: 'OS no período', value: nfmt(total), icon: 'ti-clipboard-list' },
    { label: 'Finalizadas', value: nfmt(finalizadas), icon: 'ti-circle-check', delta: total > 0 ? `${((finalizadas / total) * 100).toFixed(0)}% da amostra` : undefined, deltaTone: 'up' },
    { label: 'Em aberto', value: nfmt(abertas), icon: 'ti-clock' },
    { label: 'Valor total', value: moedaBR(valorTotal) + cap, icon: 'ti-cash' },
  ]

  const csvRows = detalhe.map((r) => [
    r.cliente_id ? (nomesC[r.cliente_id] ?? '—') : '—',
    ORIGEM_LABEL[r.origem || 'avulsa'] ?? r.origem ?? '—',
    STATUS_META[r.status || '']?.label ?? r.status ?? '—',
    dataBR(r.criado_em),
    Math.round(Number(r.total) || 0),
  ])

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Ordens de serviço</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/ordens-servico" />
        <ExportCsvButton filename={`ordens-servico-${periodo}`} headers={['Cliente', 'Origem', 'Status', 'Abertura', 'Valor']} rows={csvRows} />
      </div>

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: analisando as primeiras {PULL_CAP.toLocaleString('pt-BR')} OS. Refine o período ou filtre por unidade.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Por status" icon="ti-chart-pie" rows={barStatus} emptyMsg="Sem OS no período." />
        <BarChart title="Por origem" icon="ti-route" rows={barOrigem} emptyMsg="Sem OS no período." />
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-clipboard-list" /> Ordens de serviço
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{nfmt(total)} OS{detalhe.length < total ? ` · exibindo ${detalhe.length}` : ''}</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Abertura</th>
                <th className="num-r">Valor</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma OS no período selecionado.
                  </td>
                </tr>
              )}
              {detalhe.map((r) => {
                const meta = STATUS_META[r.status || ''] ?? { label: r.status ?? '—', cls: 'os-aberta' }
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="cli-name">{r.cliente_id ? (nomesC[r.cliente_id] ?? '—') : '—'}</span>
                    </td>
                    <td>{ORIGEM_LABEL[r.origem || 'avulsa'] ?? r.origem ?? '—'}</td>
                    <td>
                      <span className={`os-st ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td>{dataBR(r.criado_em)}</td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(Number(r.total) || 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
