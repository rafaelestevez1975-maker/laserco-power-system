import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

type ContratoRow = {
  id: string
  cliente_nome: string | null
  plano: string | null
  status: string | null
  valor_mensal: number | null
  criado_em: string | null
  assinado_em: string | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'os-fechada' },
  encerrado: { label: 'Encerrado', cls: 'os-aberta' },
  cancelado: { label: 'Cancelado', cls: 'os-cancelada' },
  inadimplente: { label: 'Inadimplente', cls: 'os-cancelada' },
}

/**
 * Contratos — réplica do REL_DEFS.contratos do legado (legacy/index.html ~4311).
 * Lê da tabela `contratos` (migration scripts/migrations/relatorios.sql). KPIs: contratos
 * ativos / assinados no período / inadimplentes / valor contratado (MRR ativo). Colunas:
 * Cliente/Plano/Status/Criação/Assinatura/Valor.
 */
export default async function RelContratosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)

  // A tabela pode não existir ainda → tratamos o erro p/ mostrar banner de migration.
  let rows: ContratoRow[] = []
  let tabelaAusente = false
  {
    let q = sb
      .from('contratos')
      .select('id, cliente_nome, plano, status, valor_mensal, criado_em, assinado_em')
      .order('criado_em', { ascending: false })
      .limit(1000)
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    const { data, error } = await q
    if (error) tabelaAusente = true
    else rows = (data ?? []) as ContratoRow[]
  }

  // KPIs.
  const ativos = rows.filter((r) => r.status === 'ativo').length
  const inadimplentes = rows.filter((r) => r.status === 'inadimplente').length
  const assinadosPeriodo = rows.filter(
    (r) => r.assinado_em && (!range.ini || r.assinado_em >= range.ini) && (!range.fim || r.assinado_em < range.fim),
  ).length
  // Valor contratado = MRR dos contratos ativos.
  const valorContratado = rows.filter((r) => r.status === 'ativo').reduce((a, r) => a + (Number(r.valor_mensal) || 0), 0)

  // Breakdown por plano (contratos ativos).
  const porPlano = new Map<string, number>()
  for (const r of rows) {
    if (r.status !== 'ativo') continue
    const k = r.plano || '—'
    porPlano.set(k, (porPlano.get(k) || 0) + 1)
  }
  const barPlano: BarRow[] = [...porPlano.entries()]
    .map(([k, v]) => ({ label: k, value: v, display: v.toLocaleString('pt-BR') }))
    .sort((a, b) => b.value - a.value)

  // Breakdown por status.
  const barStatus: BarRow[] = Object.keys(STATUS_META).map((k) => {
    const c = rows.filter((r) => r.status === k).length
    return { label: STATUS_META[k].label, value: c, display: c.toLocaleString('pt-BR') }
  })

  const kpis: RelKpi[] = [
    { label: 'Contratos ativos', value: ativos.toLocaleString('pt-BR'), icon: 'ti-file-description' },
    { label: `Assinados (${range.label})`, value: assinadosPeriodo.toLocaleString('pt-BR'), icon: 'ti-signature' },
    { label: 'Inadimplentes', value: inadimplentes.toLocaleString('pt-BR'), icon: 'ti-alert-triangle', deltaTone: inadimplentes > 0 ? 'down' : 'flat' },
    { label: 'Valor contratado (MRR)', value: moedaBR(valorContratado), icon: 'ti-cash' },
  ]

  const csvRows = rows.map((r) => [
    r.cliente_nome || '—',
    r.plano || '—',
    STATUS_META[r.status || '']?.label ?? r.status ?? '—',
    dataBR(r.criado_em),
    r.assinado_em ? dataBR(r.assinado_em) : 'Pendente',
    Math.round(Number(r.valor_mensal) || 0),
  ])

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Contratos</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      {(tabelaAusente || (rows.length === 0 && !tabelaAusente)) && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '12px 14px' }}>
          <i className="ti ti-database-import" />{' '}
          {tabelaAusente
            ? 'A tabela de contratos ainda não existe no backend. '
            : 'Não há contratos cadastrados ainda. '}
          Aplique a migration <code>scripts/migrations/relatorios.sql</code> no lkii para criar a tabela <code>contratos</code> e popular contratos de exemplo a partir dos clientes reais.
        </div>
      )}

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/contratos" />
        <ExportCsvButton filename={`contratos-${periodo}`} headers={['Cliente', 'Plano', 'Status', 'Criação', 'Assinatura', 'Valor/mês']} rows={csvRows} />
      </div>

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Contratos ativos por plano" icon="ti-files" rows={barPlano} emptyMsg="Sem contratos ativos." />
        <BarChart title="Por status" icon="ti-chart-pie" rows={barStatus} emptyMsg="Sem contratos." />
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-file-description" /> Contratos
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{rows.length.toLocaleString('pt-BR')} contrato(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Criação</th>
                <th>Assinatura</th>
                <th className="num-r">Valor/mês</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum contrato a exibir.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const meta = STATUS_META[r.status || ''] ?? { label: r.status ?? '—', cls: 'os-aberta' }
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="cli-name">{r.cliente_nome || '—'}</span>
                    </td>
                    <td>{r.plano || '—'}</td>
                    <td>
                      <span className={`os-st ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td>{dataBR(r.criado_em)}</td>
                    <td>{r.assinado_em ? dataBR(r.assinado_em) : <span style={{ color: 'var(--text-3)' }}>Pendente</span>}</td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(Number(r.valor_mensal) || 0)}/mês</td>
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
