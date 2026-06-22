'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarCanal, conectarCanal, statusCanal, desconectarCanal } from '@/app/(app)/canais/actions'

export type Canal = { name: string; status: string; owner?: string }

const conectado = (s: string) => s === 'connected'

export function CanaisManager({ canais, isAdmin }: { canais: Canal[]; isAdmin: boolean }) {
  const router = useRouter()
  const [qr, setQr] = useState<{ nome: string; img?: string; status: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [novo, setNovo] = useState('')
  const [msg, setMsg] = useState('')
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  async function abrirQr(nome: string) {
    setBusy(nome); setMsg('')
    const res = await conectarCanal(nome)
    setBusy(null)
    if (!res.ok || !res.state) { setMsg(res.error || 'Falha ao conectar.'); return }
    setQr({ nome, img: res.state.qrcode, status: res.state.status })
    if (poll.current) clearInterval(poll.current)
    poll.current = setInterval(async () => {
      const s = await statusCanal(nome)
      if (s.ok && s.state) {
        setQr((q) => (q ? { ...q, img: s.state!.qrcode ?? q.img, status: s.state!.status } : q))
        if (s.state.connected) {
          if (poll.current) clearInterval(poll.current)
          setQr(null); setMsg(`Canal "${nome}" conectado! ✅`); router.refresh()
        }
      }
    }, 4000)
  }

  function fecharQr() { if (poll.current) clearInterval(poll.current); setQr(null) }

  async function desconectar(nome: string) {
    if (!confirm(`Desconectar o canal "${nome}"?`)) return
    setBusy(nome)
    await desconectarCanal(nome); setBusy(null); router.refresh()
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setMsg('')
    const res = await criarCanal(novo)
    if (!res.ok) setMsg(res.error || 'Erro ao criar canal.')
    else { setNovo(''); setMsg('Canal criado. Clique em "Conectar" para parear o WhatsApp.'); router.refresh() }
  }

  return (
    <>
      {isAdmin && (
        <form onSubmit={criar} style={{ display: 'flex', gap: 10, margin: '4px 0 16px' }}>
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome do novo canal (ex.: unidade)"
            style={{ flex: 1, maxWidth: 360, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
          <button className="btn btn-primary" type="submit"><i className="ti ti-plus" /> Criar canal</button>
        </form>
      )}
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {canais.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Nenhum canal Laser ainda. {isAdmin ? 'Crie o primeiro acima.' : ''}</div>}
        {canais.map((c) => (
          <div key={c.name} className="rel-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 22, color: conectado(c.status) ? 'var(--green)' : 'var(--text-3)' }} />
              <b style={{ flex: 1 }}>{c.name}</b>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: conectado(c.status) ? '#E7F0EC' : '#FBE9EB', color: conectado(c.status) ? '#15803D' : '#D85563' }}>
                {conectado(c.status) ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            {c.owner && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>{c.owner}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {conectado(c.status)
                ? <button className="btn" disabled={busy === c.name} onClick={() => desconectar(c.name)}><i className="ti ti-plug-off" /> Desconectar</button>
                : <button className="btn btn-primary" disabled={busy === c.name} onClick={() => abrirQr(c.name)}>{busy === c.name ? '…' : <><i className="ti ti-qrcode" /> Conectar (QR)</>}</button>}
            </div>
          </div>
        ))}
      </div>

      {qr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={fecharQr}>
          <div className="lc-card" style={{ background: '#fff', padding: 24, maxWidth: 360, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="lc-title" style={{ fontSize: 17, marginBottom: 4 }}>Conectar {qr.nome}</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie:</p>
            {qr.img
              ? <img src={qr.img} alt="QR Code" style={{ width: 240, height: 240, margin: '0 auto', display: 'block' }} />
              : <div style={{ padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Gerando QR… ({qr.status})</div>}
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>Aguardando leitura… atualiza sozinho.</div>
            <button className="btn" style={{ marginTop: 14 }} onClick={fecharQr}>Fechar</button>
          </div>
        </div>
      )}
    </>
  )
}
