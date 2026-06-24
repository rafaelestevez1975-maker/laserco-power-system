import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export default async function SacDashboardPage() {
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null
  const sb = await createClient()
  const c = async (col?: string, val?: unknown) => {
    let q = sb.from('sac_tickets').select('id', { count: 'exact', head: true })
    if (activeUnit) q = q.eq('unidade_id', activeUnit) // respeita a unidade ativa do topo
    if (col) q = q.eq(col, val as never)
    const { count } = await q
    return count ?? 0
  }

  const canais = ['Reclame Aqui', 'Blip', 'WhatsApp', 'Sults', 'Procon', 'Instagram', 'Manual', 'E-mail']
  const [total, novos, contato, pagamento, concluidos, sla, canalCounts] = await Promise.all([
    c(), c('fase', 'Novo'), c('fase', 'Contato com cliente'), c('fase', 'Em pagamento'), c('fase', 'Concluído'), c('sla_violado', true),
    Promise.all(canais.map((k) => c('canal', k))),
  ])
  const emAberto = total - concluidos
  const slaPct = total ? Math.round((sla / total) * 100) : 0
  const maxCanal = Math.max(1, ...canalCounts)

  const kpis: [string, string | number, string][] = [
    ['Total de chamados', total.toLocaleString('pt-BR'), 'ti-headset'],
    ['Novos', novos.toLocaleString('pt-BR'), 'ti-inbox'],
    ['Em pagamento', pagamento.toLocaleString('pt-BR'), 'ti-cash'],
    ['Concluídos', concluidos.toLocaleString('pt-BR'), 'ti-circle-check'],
    ['Em aberto', emAberto.toLocaleString('pt-BR'), 'ti-progress'],
    [`SLA violado (${slaPct}%)`, sla.toLocaleString('pt-BR'), 'ti-alarm'],
  ]

  return (
    <div className="view active">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '4px 0 18px' }}>
        {kpis.map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span><b style={{ fontSize: 20 }}>{val}</b></span>
          </div>
        ))}
      </div>

      <div className="rel-card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}><i className="ti ti-chart-bar" /> Chamados por canal</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {canais.map((k, i) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 50px', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5 }}>{k}</span>
              <div style={{ background: 'var(--line)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${(canalCounts[i] / maxCanal) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--brand-400),var(--brand-600))' }} />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{canalCounts[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
