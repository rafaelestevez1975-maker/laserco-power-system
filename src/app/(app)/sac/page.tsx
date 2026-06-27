import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { rangePeriodo } from '@/lib/periodo'
import { moedaBR, dataHoraBR } from '@/lib/fmt'
import { SacDashFiltros } from '@/components/sac/SacDashFiltros'

const CANAIS = ['Reclame Aqui', 'Blip', 'WhatsApp', 'Sults', 'Procon', 'Instagram', 'Manual', 'E-mail']
const FASES = ['Novo', 'Contato com cliente', 'Em pagamento', 'Concluído']
const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })

type SP = { periodo?: string; di?: string; df?: string; atendente?: string }

function Barras({ titulo, icon, dados }: { titulo: string; icon: string; dados: { nome: string; n: number }[] }) {
  const max = Math.max(1, ...dados.map((d) => d.n))
  return (
    <div className="rel-card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 12 }}><i className={`ti ${icon}`} /> {titulo}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dados.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sem dados no período.</div>}
        {dados.map((d) => (
          <div key={d.nome} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 46px', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12.5 }}>{d.nome}</span>
            <div style={{ background: 'var(--line)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
              <div style={{ width: `${(d.n / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--brand-400),var(--brand-600))' }} />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{d.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function SacDashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { periodo, di, df, atendente } = await searchParams
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null
  const sb = await createClient()
  const { ini, fim } = rangePeriodo(periodo, di, df)

  const [atendentesFull, { data: motivosRaw }] = await Promise.all([
    listAtendentesSac(sb),
    sb.from('sac_motivos').select('label').eq('ativo', true).order('ordem', { ascending: true }),
  ])
  const atendentes = atendentesFull.map((a) => ({ id: a.id, nome: a.nome }))
  const motivos = ((motivosRaw ?? []) as { label: string }[]).map((m) => m.label)

  // base com todos os filtros (unidade ativa + atendente + período)
  const base = () => {
    let q = sb.from('sac_tickets').select('id', { count: 'exact', head: true })
    if (activeUnit) q = q.eq('unidade_id', activeUnit)
    if (atendente) q = q.eq('atribuido_para', atendente)
    if (ini) q = q.gte('criado_em', ini)
    if (fim) q = q.lt('criado_em', fim)
    return q
  }
  const c = async (col?: string, val?: unknown) => {
    let q = base()
    if (col) q = q.eq(col, val as never)
    const { count } = await q
    return count ?? 0
  }

  const [total, novos, pagamento, concluidos, sla, canalCounts, faseCounts, motivoCounts] = await Promise.all([
    c(), c('fase', 'Novo'), c('fase', 'Em pagamento'), c('fase', 'Concluído'), c('sla_violado', true),
    Promise.all(CANAIS.map((k) => c('canal', k))),
    Promise.all(FASES.map((f) => c('fase', f))),
    Promise.all(motivos.map((m) => c('motivo_label', m))),
  ])
  const emAberto = total - concluidos
  const slaPct = total ? Math.round((sla / total) * 100) : 0

  // Reembolsos (período): tickets com valor_devolucao > 0
  let rq = sb.from('sac_tickets').select('valor_devolucao, pago')
    .gt('valor_devolucao', 0)
  if (activeUnit) rq = rq.eq('unidade_id', activeUnit)
  if (atendente) rq = rq.eq('atribuido_para', atendente)
  if (ini) rq = rq.gte('criado_em', ini)
  if (fim) rq = rq.lt('criado_em', fim)
  const { data: reembRows } = await rq.limit(1000)
  const reemb = (reembRows ?? []) as { valor_devolucao: number | null; pago: boolean | null }[]
  const reembTotal = reemb.reduce((s, r) => s + (r.valor_devolucao || 0), 0)
  const reembPagos = reemb.filter((r) => r.pago).length

  // Chamados recentes (6)
  let recq = sb.from('sac_tickets').select('numero, protocolo, nome_cliente, canal, fase, criado_em')
    .order('criado_em', { ascending: false }).limit(6)
  if (activeUnit) recq = recq.eq('unidade_id', activeUnit)
  if (atendente) recq = recq.eq('atribuido_para', atendente)
  if (ini) recq = recq.gte('criado_em', ini)
  if (fim) recq = recq.lt('criado_em', fim)
  const { data: recentesRaw } = await recq
  const recentes = (recentesRaw ?? []) as { numero: number | null; protocolo: string | null; nome_cliente: string | null; canal: string | null; fase: string | null; criado_em: string | null }[]

  const kpis: [string, string | number, string][] = [
    ['Total de chamados', total.toLocaleString('pt-BR'), 'ti-headset'],
    ['Novos', novos.toLocaleString('pt-BR'), 'ti-inbox'],
    ['Em pagamento', pagamento.toLocaleString('pt-BR'), 'ti-cash'],
    ['Concluídos', concluidos.toLocaleString('pt-BR'), 'ti-circle-check'],
    ['Em aberto', emAberto.toLocaleString('pt-BR'), 'ti-progress'],
    [`SLA violado (${slaPct}%)`, sla.toLocaleString('pt-BR'), 'ti-alarm'],
  ]

  const motivoBars = motivos.map((m, i) => ({ nome: m, n: motivoCounts[i] })).filter((d) => d.n > 0).sort((a, b) => b.n - a.n).slice(0, 8)

  return (
    <div className="view active">
      <SacDashFiltros atendentes={atendentes} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {kpis.map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span><b style={{ fontSize: 20 }}>{val}</b></span>
          </div>
        ))}
      </div>

      <div className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <i className="ti ti-receipt-refund" style={{ fontSize: 22, color: 'var(--brand-500)' }} />
        <span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>Reembolsos solicitados (período)</span><b style={{ fontSize: 18 }}>{moedaBR(reembTotal)}</b></span>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{reemb.length} solicitação(ões) · {reembPagos} paga(s)</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 18 }}>
        <Barras titulo="Chamados por canal" icon="ti-chart-bar" dados={CANAIS.map((k, i) => ({ nome: k, n: canalCounts[i] }))} />
        <Barras titulo="Por fase (kanban)" icon="ti-layout-kanban" dados={FASES.map((f, i) => ({ nome: f, n: faseCounts[i] }))} />
        <Barras titulo="Por motivo (top 8)" icon="ti-list-details" dados={motivoBars} />
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Protocolo</th><th>Cliente</th><th>Canal</th><th>Fase</th><th>Aberto em</th></tr></thead>
            <tbody>
              {recentes.length === 0 && <tr><td colSpan={5} style={{ padding: 18, color: 'var(--text-3)' }}>Nenhum chamado no período.</td></tr>}
              {recentes.map((t, i) => (
                <tr key={i}>
                  <td><b>{t.protocolo || `SAC-${t.numero ?? ''}`}</b></td>
                  <td>{t.nome_cliente || ''}</td>
                  <td>{t.canal || ''}</td>
                  <td><span style={t.fase === 'Concluído' ? pill('#E7F0EC', '#15803D') : pill('#F7E7EB', '#8A2A41')}>{t.fase || ''}</span></td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{dataHoraBR(t.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <Link className="btn" href="/sac/chamados"><i className="ti ti-arrow-right" /> Ver todos os chamados</Link>
      </div>
    </div>
  )
}
