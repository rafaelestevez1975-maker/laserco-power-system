'use client'

import { useMemo, useState } from 'react'
import { dispararCampanha } from '@/app/(app)/expansao/disparos/actions'

export type CanalOpt = { nome: string; label: string; escopo: 'unidade' | 'geral' | null; unidadeId: string | null; delayMin: number; delayMax: number }

export function DisparoComposer({ canais, activeUnitId }: { canais: CanalOpt[]; activeUnitId: string | null }) {
  // Pré-seleciona o canal da unidade ativa (ou o 1º).
  const inicial = canais.find((c) => c.unidadeId && c.unidadeId === activeUnitId) ?? canais[0]
  const [canal, setCanal] = useState(inicial?.nome ?? '')
  const sel = canais.find((c) => c.nome === canal) ?? inicial
  const [nome, setNome] = useState('')
  const [texto, setTexto] = useState('')
  const [numeros, setNumeros] = useState('')
  const [dMin, setDMin] = useState(String(inicial?.delayMin ?? 20))
  const [dMax, setDMax] = useState(String(inicial?.delayMax ?? 45))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; txt: string } | null>(null)

  const total = useMemo(
    () => new Set(numeros.split(/[\n,;]+/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 10)).size,
    [numeros],
  )
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }

  function trocarCanal(n: string) {
    setCanal(n)
    const c = canais.find((x) => x.nome === n)
    if (c) { setDMin(String(c.delayMin)); setDMax(String(c.delayMax)) }
  }

  async function disparar() {
    if (!canal) { setMsg({ tipo: 'erro', txt: 'Selecione um canal conectado.' }); return }
    if (!confirm(`Disparar para ${total} número(s) pelo canal "${sel?.label ?? canal}"?`)) return
    setSaving(true); setMsg(null)
    const res = await dispararCampanha(canal, texto, numeros, Number(dMin), Number(dMax), nome)
    setSaving(false)
    if (!res.ok) setMsg({ tipo: 'erro', txt: res.error || 'Erro ao disparar.' })
    else { setMsg({ tipo: 'ok', txt: `Campanha criada na UAZAPI para ${res.total} número(s). O envio roda com delay (anti-ban).` }); setNumeros(''); setTexto(''); setNome('') }
  }

  if (canais.length === 0) {
    return (
      <div className="rel-card" style={{ padding: 16 }}>
        Nenhum canal de WhatsApp <b>conectado</b>. Conecte o número da sua unidade em <a href="/canais" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>Canais WhatsApp</a> antes de disparar.
      </div>
    )
  }

  return (
    <div className="rel-card" style={{ padding: 18, display: 'grid', gap: 12, maxWidth: 720 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Canal (número da unidade)</label>
          <select style={inp} value={canal} onChange={(e) => trocarCanal(e.target.value)}>
            {canais.map((c) => <option key={c.nome} value={c.nome}>{c.label}{c.escopo === 'geral' ? ' · geral' : ''}</option>)}
          </select>
          {sel && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{sel.escopo === 'geral' ? 'Canal geral da franqueadora' : sel.escopo === 'unidade' ? 'Canal da unidade' : 'Canal sem vínculo — defina em Canais'}</div>}
        </div>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Nome da campanha</label><input style={inp} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Oferta junho" /></div>
      </div>

      <div><label style={{ fontSize: 12, fontWeight: 600 }}>Mensagem</label>
        <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a mensagem do disparo…" />
      </div>

      <div><label style={{ fontSize: 12, fontWeight: 600 }}>Números <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(um por linha, ou separados por vírgula)</span></label>
        <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={numeros} onChange={(e) => setNumeros(e.target.value)} placeholder={'48999990000\n11988887777'} />
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{total} número(s) válido(s)</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Delay mín. (s)</label><input style={inp} type="number" value={dMin} onChange={(e) => setDMin(e.target.value)} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Delay máx. (s)</label><input style={inp} type="number" value={dMax} onChange={(e) => setDMax(e.target.value)} /></div>
      </div>

      {msg && <p style={{ fontSize: 12.5, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.txt}</p>}

      <div>
        <button className="btn btn-primary" disabled={saving || total === 0 || !texto.trim()} onClick={disparar}>
          {saving ? 'Enviando para a fila…' : <><i className="ti ti-send" /> Disparar para {total}</>}
        </button>
      </div>
    </div>
  )
}
