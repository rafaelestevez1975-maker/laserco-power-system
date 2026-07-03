import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { one } from '@/lib/sb'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de segurança ao puxar linhas p/ listagem/somas (a tabela `nfse` é pequena 
// emissões fiscais  mas SEMPRE escopamos por período e/ou unidade). Limitamos o pull.
const ROW_CAP = 5000
const PAGE = 1000
const LIST_MAX = 200

// Status reais (CHECK em scripts/migrations/nfse.sql):
//   autorizada | cancelada | processando | erro
const STATUS: { val: string; label: string; icon: string; cls: string }[] = [
  { val: 'autorizada', label: 'Autorizadas', icon: 'ti-file-invoice', cls: 'os-fechada' },
  { val: 'processando', label: 'Processando', icon: 'ti-loader', cls: 'os-aberta' },
  { val: 'cancelada', label: 'Canceladas', icon: 'ti-x', cls: 'os-cancelada' },
  { val: 'erro', label: 'Com erro', icon: 'ti-alert-triangle', cls: 'os-cancelada' },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS.map((s) => [s.val, s.label.replace(/s$/, '')]))
const STATUS_CLS: Record<string, string> = Object.fromEntries(STATUS.map((s) => [s.val, s.cls]))

type NfseRow = {
  id: string
  numero: string | null
  competencia: string | null
  tipo: string
  fato_gerador: string
  cliente_nome: string | null
  valor: number | null
  status: string
  criado_em: string | null
  unidade_id: string | null
  cliente?: { nome: string | null } | { nome: string | null }[] | null
}

type SbQuery = {
  select: (cols: string) => SbQuery
  eq: (c: string, v: unknown) => SbQuery
  gte: (c: string, v: unknown) => SbQuery
  lt: (c: string, v: unknown) => SbQuery
  order: (c: string, o: { ascending: boolean; nullsFirst?: boolean }) => SbQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>
}

export default async function RelNotasFiscaisPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Emissões fiscais são históricas (não há nota no mês corrente necessariamente) → default '90d'.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  // `criado_em` é timestamptz; filtramos por borda de dia. (`competencia` é text 'YYYY-MM',
  // populada de forma irregular  usamos a data de criação como eixo de período.)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Pull paginado (escopado por unidade ativa + período de criação). ──
  const rows: NfseRow[] = []
  let from = 0
  let capped = false
  let semTabela = false
  for (;;) {
    let q = sb
      .from('nfse')
      .select('id, numero, competencia, tipo, fato_gerador, cliente_nome, valor, status, criado_em, unidade_id, cliente:clientes(nome)')
      .order('criado_em', { ascending: false, nullsFirst: false }) as unknown as SbQuery
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniTs) q = q.gte('criado_em', iniTs)
    if (fimTs) q = q.lt('criado_em', fimTs)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) {
      // Migration `nfse` é aplicada manualmente → tabela pode não existir ainda.
      if (/relation|does not exist|schema cache/i.test(error.message || '')) semTabela = true
      break
    }
    const batch = (data ?? []) as NfseRow[]
    rows.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
    if (rows.length >= ROW_CAP) {
      capped = true
      break
    }
  }

  // ── Estado "sem fonte de dados" (migration ausente): não quebra, orienta o usuário. ──
  if (semTabela) {
    return (
      <div className="view active">
        <RelTabs active="notas-fiscais" query={relQuery(sp)} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Notas Fiscais</h2>
        </div>
        <div className="crm-note" style={{ marginTop: 12 }}>
          <i className="ti ti-file-invoice" /> Relatório em preparação: a fonte de dados de notas fiscais (NFS-e)
          ainda não está disponível neste ambiente. Quando a emissão fiscal estiver configurada, as notas emitidas,
          canceladas e em processamento aparecerão aqui.
        </div>
      </div>
    )
  }

  // ── KPIs + agregações (em memória, sobre as linhas já trazidas) ──
  const porStatus = new Map<string, number>()
  const valorPorStatus = new Map<string, number>()
  const porTipo = new Map<string, { qtd: number; valor: number }>()
  let valorAutorizadas = 0
  for (const r of rows) {
    const st = r.status || 'processando'
    const val = Number(r.valor) || 0
    porStatus.set(st, (porStatus.get(st) || 0) + 1)
    valorPorStatus.set(st, (valorPorStatus.get(st) || 0) + val)
    if (st === 'autorizada') valorAutorizadas += val
    const tp = (r.tipo || '').toUpperCase() || ''
    const cur = porTipo.get(tp) || { qtd: 0, valor: 0 }
    cur.qtd += 1
    cur.valor += val
    porTipo.set(tp, cur)
  }
  const total = rows.length
  const emitidas = porStatus.get('autorizada') ?? 0
  const canceladas = porStatus.get('cancelada') ?? 0
  const processando = porStatus.get('processando') ?? 0
  const comErro = porStatus.get('erro') ?? 0

  const statusCounts = STATUS.map((s) => ({
    ...s,
    count: porStatus.get(s.val) ?? 0,
    valor: valorPorStatus.get(s.val) ?? 0,
  }))

  const barStatus: BarRow[] = statusCounts.map((s) => ({ label: s.label, value: s.count, display: s.count.toLocaleString('pt-BR') }))
  const tipos = [...porTipo.entries()]
    .sort((a, b) => b[1].valor - a[1].valor)
    .map(([tipo, v]) => ({ tipo, ...v }))
  const barTipoValor: BarRow[] = tipos.map((t) => ({ label: t.tipo, value: t.valor, display: moedaBR(t.valor) }))

  const kpis: RelKpi[] = [
    { label: 'Notas emitidas', value: emitidas.toLocaleString('pt-BR'), icon: 'ti-file-invoice', delta: total > 0 ? `${((emitidas / total) * 100).toFixed(1)}% do período` : undefined, deltaTone: 'up' },
    { label: 'Valor autorizado', value: moedaBR(valorAutorizadas), icon: 'ti-cash' },
    { label: 'Canceladas', value: canceladas.toLocaleString('pt-BR'), icon: 'ti-x', delta: comErro > 0 || processando > 0 ? `${processando} processando` : undefined, deltaTone: 'flat' },
    { label: 'Com erro', value: comErro.toLocaleString('pt-BR'), icon: 'ti-alert-triangle', deltaTone: comErro > 0 ? 'down' : 'flat' },
  ]

  const listadas = rows.slice(0, LIST_MAX)

  return (
    <div className="view active">
      <RelTabs active="notas-fiscais" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Notas Fiscais</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/notas-fiscais" />

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: considerando as primeiras {ROW_CAP.toLocaleString('pt-BR')} notas. Refine o período ou filtre por unidade para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Por status" icon="ti-chart-pie" rows={barStatus} emptyMsg="Sem notas no período." />
        <BarChart title="Valor por tipo (R$)" icon="ti-receipt-tax" rows={barTipoValor} gold asMoeda emptyMsg="Sem notas no período." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Resumo por status
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{total.toLocaleString('pt-BR')} no período</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Status</th>
                <th className="num-r">Quantidade</th>
                <th className="num-r">% do total</th>
                <th className="num-r">Valor</th>
              </tr>
            </thead>
            <tbody>
              {total === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma nota fiscal no período selecionado.
                  </td>
                </tr>
              )}
              {total > 0 &&
                statusCounts.map((s) => (
                  <tr key={s.val}>
                    <td>
                      <span className={`os-st ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{s.count.toLocaleString('pt-BR')}</td>
                    <td className="num-r">{total > 0 ? ((s.count / total) * 100).toFixed(1) : '0,0'}%</td>
                    <td className="num-r">{moedaBR(s.valor)}</td>
                  </tr>
                ))}
            </tbody>
            {total > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>Total</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{total.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(statusCounts.reduce((a, s) => a + s.valor, 0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-list-details" /> Notas no período
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
            {listadas.length.toLocaleString('pt-BR')}
            {total > listadas.length ? ` de ${total.toLocaleString('pt-BR')}` : ''} nota(s)
          </span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Emissão</th>
                <th>Competência</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Fato gerador</th>
                <th className="num-r">Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {listadas.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma nota fiscal no período selecionado.
                  </td>
                </tr>
              )}
              {listadas.map((n) => {
                const cliente = n.cliente_nome || one(n.cliente)?.nome || ''
                const st = n.status || 'processando'
                return (
                  <tr key={n.id}>
                    <td style={{ fontWeight: 600 }}>{n.numero || ''}</td>
                    <td>{dataBR(n.criado_em) || ''}</td>
                    <td>{n.competencia || ''}</td>
                    <td>{cliente}</td>
                    <td>{(n.tipo || '').toUpperCase() || ''}</td>
                    <td style={{ textTransform: 'capitalize' }}>{n.fato_gerador || ''}</td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(Number(n.valor) || 0)}</td>
                    <td>
                      <span className={`os-st ${STATUS_CLS[st] || 'os-aberta'}`}>{STATUS_LABEL[st] || st}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rel-card" style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 14px' }}>
        <i className="ti ti-info-circle" /> Relatório read-only. O período usa a data de emissão (<code>criado_em</code>);
        para gerenciar, cancelar ou emitir notas, use a tela de <strong>Notas Fiscais</strong>.
      </div>
    </div>
  )
}
