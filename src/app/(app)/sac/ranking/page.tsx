import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { PremiacaoConfig } from '@/components/sac/PremiacaoConfig'
import type { PremPesos, PremPremios } from '@/app/(app)/sac/config/actions'

const medalha = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`)
const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })
const PESOS_DEF: PremPesos = { pesoResolvidos: 40, pesoSLA: 30, pesoTempo: 20, pesoSemAtraso: 10 }
const PREMIOS_DEF: PremPremios = { p1: '', p2: '', p3: '' }

export default async function SacRankingPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  const [{ data: cfgRaw }, atendentes] = await Promise.all([
    sb.from('sac_premiacao_config').select('pesos, premios').limit(1).maybeSingle(),
    listAtendentesSac(sb),
  ])
  const cfg = cfgRaw as { pesos?: Partial<PremPesos>; premios?: Partial<PremPremios> } | null
  const pesos: PremPesos = { ...PESOS_DEF, ...(cfg?.pesos ?? {}) }
  const premios: PremPremios = { ...PREMIOS_DEF, ...(cfg?.premios ?? {}) }

  const linhasBase = await Promise.all(atendentes.map(async (a) => {
    const [{ count: total }, { count: resolvidos }, { count: violados }, { count: reversoes }] = await Promise.all([
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('fase', 'Concluído'),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('sla_violado', true),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('fase', 'Concluído').not('pago', 'is', true).or('motivo_label.ilike.%cancel%,motivo_label.ilike.%reembolso%,motivo_label.ilike.%retenç%'),
    ])
    const t = total ?? 0
    const slaCumprido = t ? (t - (violados ?? 0)) / t : 0
    return { id: a.id, nome: a.nome, cargo: a.cargo, total: t, resolvidos: resolvidos ?? 0, reversoes: reversoes ?? 0, slaPct: Math.round(slaCumprido * 100), slaCumprido }
  }))

  const maxBase = Math.max(1, ...linhasBase.map((l) => l.resolvidos + l.reversoes))
  const linhas = linhasBase
    .map((l) => {
      const fatorRes = (l.resolvidos + l.reversoes) / maxBase
      const score = Math.round(pesos.pesoResolvidos * fatorRes + (pesos.pesoSLA + pesos.pesoSemAtraso) * l.slaCumprido)
      return { ...l, score }
    })
    .sort((a, b) => b.score - a.score || b.resolvidos - a.resolvidos)
  const premioDe = (i: number) => (i === 0 ? premios.p1 : i === 1 ? premios.p2 : i === 2 ? premios.p3 : '')

  const podeEditar = !!(ctx?.isAdmin || ctx?.papel === 'gestor' || ctx?.papel === 'sac')

  return (
    <div className="view active">
      <PremiacaoConfig pesos={pesos} premios={premios} podeEditar={podeEditar} />

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>#</th><th>Atendente</th><th>Cargo</th><th>Atend.</th><th>Resolv.</th><th>Reversões</th><th>SLA</th><th>Pontuação</th><th>Prêmio</th></tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum atendente SAC ativo.</td></tr>}
              {linhas.map((l, i) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: 700 }}>{medalha(i)}</td>
                  <td><b>{l.nome}</b></td>
                  <td>{l.cargo || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{l.total}</td>
                  <td style={{ textAlign: 'center' }}>{l.resolvidos}</td>
                  <td style={{ textAlign: 'center', color: l.reversoes > 0 ? '#15803D' : 'var(--text-3)', fontWeight: l.reversoes > 0 ? 700 : 400 }}>{l.reversoes}</td>
                  <td><span style={l.slaPct >= 80 ? pill('#E7F0EC', '#15803D') : l.slaPct >= 50 ? pill('#FBEFD9', '#9A6700') : pill('#FBE9EB', '#D85563')}>{l.total ? `${l.slaPct}%` : '—'}</span></td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--brand-600)' }}>{l.score}</td>
                  <td style={{ fontSize: 12.5 }}>{i < 3 && premioDe(i) ? <span style={{ fontWeight: 600 }}>{premioDe(i)}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-info-circle" /> Pontuação = pesos × (resolvidos+reversões normalizados, SLA cumprido). Reversão = cancelamento/reembolso concluído sem devolução (retenção). Vendas/CSAT/tempo entram quando houver dados.
      </div>
    </div>
  )
}
