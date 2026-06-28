'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarPremiacaoConfig } from '@/app/(app)/sac/config/actions'
import type { PremMonetaria } from '@/lib/sac'

const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, marginTop: 3 }
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)' }

const CAMPOS: { k: keyof PremMonetaria; label: string; step?: number }[] = [
  { k: 'porAtendimento', label: 'R$ por atendimento' },
  { k: 'porFinalizado', label: 'R$ por caso finalizado' },
  { k: 'porReversao', label: 'R$ por reversão (retenção)' },
  { k: 'porSLA', label: 'R$ por caso no prazo' },
  { k: 'pctVendas', label: '% sobre vendas no sistema', step: 0.1 },
  { k: 'bonusPacote', label: 'R$ por pacote vendido' },
  { k: 'bonusZeroAtraso', label: 'Bônus zero atrasos (R$)' },
  { k: 'bonusCSAT', label: 'Bônus satisfação CSAT (R$)' },
  { k: 'metaCSAT', label: 'Meta CSAT (nota mínima)', step: 0.1 },
]

export function PremiacaoConfig({ prem, podeEditar }: { prem: PremMonetaria; podeEditar: boolean }) {
  const router = useRouter()
  const [p, setP] = useState<PremMonetaria>(prem)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)

  async function salvar() {
    setBusy(true); setMsg('')
    const r = await salvarPremiacaoConfig(p)
    setBusy(false)
    setOk(r.ok)
    setMsg(r.ok ? 'Configuração de premiação salva.' : (r.error || 'Erro ao salvar.'))
    if (r.ok) router.refresh()
  }

  return (
    <div className="rel-card" style={{ marginBottom: 12 }}>
      <b><i className="ti ti-adjustments" style={{ color: 'var(--brand-500)' }} /> Regras de premiação do SAC <span style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--text-3)' }}>(prêmio em R$ por atendente)</span></b>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 10 }}>
        {CAMPOS.map(({ k, label, step }) => (
          <div key={k}>
            <label style={lbl}>{label}</label>
            <input type="number" min={0} step={step ?? 1} value={p[k]} disabled={!podeEditar}
              onChange={(e) => { const v = Number(e.target.value); setP({ ...p, [k]: Number.isFinite(v) && v >= 0 ? v : 0 }) }} style={inp} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-bulb" /> A <b>reversão</b> (reter um cancelamento/reembolso) paga mais, para incentivar a retenção. Somam-se ainda o <b>% sobre vendas</b> feitas pelo SAC no sistema, o bônus por respeitar o tempo de resposta (<b>SLA</b>), por <b>zero atrasos</b> e por <b>satisfação (CSAT ≥ {p.metaCSAT})</b>. Sugestões adicionais já incluídas: bônus por <b>pacote vendido</b> (upsell) e por <b>zero atrasos</b> no mês.
      </div>
      {msg && <p style={{ fontSize: 12.5, color: ok ? 'var(--green)' : 'var(--red)', marginTop: 8 }}>{msg}</p>}
      {podeEditar && <div style={{ marginTop: 10 }}><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar regras'}</button></div>}
    </div>
  )
}
