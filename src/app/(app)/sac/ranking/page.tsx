import { createClient } from '@/lib/supabase/server'
import { listAtendentesSac } from '@/lib/pessoas'

const medalha = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`)
const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })

export default async function SacRankingPage() {
  const sb = await createClient()
  const atendentes = await listAtendentesSac(sb)

  const linhas = await Promise.all(atendentes.map(async (a) => {
    const [{ count: total }, { count: concl }, { count: viol }] = await Promise.all([
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('fase', 'Concluído'),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('sla_violado', true),
    ])
    const t = total ?? 0
    return { id: a.id, nome: a.nome, cargo: a.cargo, total: t, concluidos: concl ?? 0, violados: viol ?? 0, slaPct: t ? Math.round(((t - (viol ?? 0)) / t) * 100) : 0 }
  }))
  linhas.sort((x, y) => y.total - x.total || y.concluidos - x.concluidos)

  return (
    <div className="view active">
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>#</th><th>Atendente</th><th>Cargo (RH)</th><th>Atendimentos</th><th>Concluídos</th><th>SLA violado</th><th>SLA cumprido</th></tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={7} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum atendente SAC ativo.</td></tr>}
              {linhas.map((l, i) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 700 }}>{medalha(i)}</td>
                  <td><b>{l.nome}</b></td>
                  <td>{l.cargo || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{l.total}</td>
                  <td style={{ textAlign: 'center' }}>{l.concluidos}</td>
                  <td style={{ textAlign: 'center' }}>{l.violados}</td>
                  <td><span style={l.slaPct >= 80 ? pill('#E7F0EC', '#15803D') : l.slaPct >= 50 ? pill('#FBEFD9', '#9A6700') : pill('#FBE9EB', '#D85563')}>{l.total ? `${l.slaPct}%` : '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-info-circle" /> Ranking pelos chamados atribuídos a cada atendente (mesmas pessoas de Atendentes/Colaboradores). Cresce conforme o atendimento roda pelo sistema.
      </div>
    </div>
  )
}
