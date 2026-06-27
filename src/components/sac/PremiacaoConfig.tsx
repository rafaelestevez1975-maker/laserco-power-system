'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarPremiacaoConfig, type PremPesos, type PremPremios } from '@/app/(app)/sac/config/actions'

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600 }

export function PremiacaoConfig({ pesos, premios, podeEditar }: { pesos: PremPesos; premios: PremPremios; podeEditar: boolean }) {
  const router = useRouter()
  const [p, setP] = useState<PremPesos>(pesos)
  const [pr, setPr] = useState<PremPremios>(premios)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const soma = p.pesoResolvidos + p.pesoSLA + p.pesoTempo + p.pesoSemAtraso

  async function salvar() {
    setBusy(true); setMsg('')
    const r = await salvarPremiacaoConfig(p, pr)
    setBusy(false)
    setMsg(r.ok ? 'Configuração de premiação salva.' : (r.error || 'Erro ao salvar.'))
    if (r.ok) router.refresh()
  }

  const numIn = (k: keyof PremPesos, label: string) => (
    <div className="mf"><label style={lbl}>{label}</label>
      <input type="number" min={0} max={100} value={p[k]} disabled={!podeEditar} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} style={inp} />
    </div>
  )
  const txtIn = (k: keyof PremPremios, label: string) => (
    <div className="mf"><label style={lbl}>{label}</label>
      <input value={pr[k]} disabled={!podeEditar} onChange={(e) => setPr({ ...pr, [k]: e.target.value })} style={inp} />
    </div>
  )

  return (
    <div className="rel-card" style={{ padding: 16, marginBottom: 18 }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}><i className="ti ti-percentage" /> Regras de premiação <span style={{ fontSize: 11.5, color: soma === 100 ? 'var(--text-3)' : '#C2410C' }}>(pesos somam {soma}{soma !== 100 ? ' — ideal 100' : ''})</span></h3>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>A pontuação do atendente combina casos resolvidos (+ reversões/retenções), SLA cumprido e zero atrasos. Tempo médio entra quando o sistema medir os tempos.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {numIn('pesoResolvidos', 'Peso resolvidos')}
        {numIn('pesoSLA', 'Peso SLA')}
        {numIn('pesoSemAtraso', 'Peso zero atraso')}
        {numIn('pesoTempo', 'Peso tempo')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 10 }}>
        {txtIn('p1', '🥇 1º lugar')}
        {txtIn('p2', '🥈 2º lugar')}
        {txtIn('p3', '🥉 3º lugar')}
      </div>
      {msg && <p style={{ fontSize: 12.5, color: msg.includes('salva') ? 'var(--green)' : 'var(--red)', marginTop: 8 }}>{msg}</p>}
      {podeEditar && <div style={{ marginTop: 10 }}><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar regras'}</button></div>}
    </div>
  )
}
