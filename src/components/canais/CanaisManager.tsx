'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarCanal, salvarVinculo, conectarCanal, statusCanal, desconectarCanal, sincronizarCanal, type Escopo } from '@/app/(app)/canais/actions'

export type Canal = {
  name: string; status: string; owner?: string
  vinculado: boolean; bindingId?: string
  escopo?: Escopo; unidadeId?: string | null; unidadeNome?: string | null
  rotulo?: string | null; delayMin?: number; delayMax?: number
}
export type Unidade = { id: string; nome: string }

const conectado = (s: string) => s === 'connected'

export function CanaisManager({ canais, unidades, isAdmin, activeUnitId, activeUnitName }: {
  canais: Canal[]; unidades: Unidade[]; isAdmin: boolean; activeUnitId: string | null; activeUnitName: string
}) {
  const router = useRouter()
  const [qr, setQr] = useState<{ nome: string; img?: string; status: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState(false)
  const [editar, setEditar] = useState<Canal | null>(null)
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
          if (poll.current) clearInterval(poll.current); setQr(null)
          setMsg(`Canal "${nome}" conectado! Sincronizando mensagens…`)
          // auto-sincroniza o webhook ao conectar → garante que as mensagens caem na Triagem
          const sy = await sincronizarCanal(nome)
          setMsg(sy.ok ? `Canal "${nome}" conectado e sincronizado. ✅ As mensagens aparecem na Triagem em tempo real.` : `Canal "${nome}" conectado, mas a sincronização falhou: ${sy.error || ''}`)
          router.refresh()
        }
      }
    }, 4000)
  }
  function fecharQr() { if (poll.current) clearInterval(poll.current); setQr(null) }
  async function desconectar(nome: string) { if (!confirm(`Desconectar o canal "${nome}"?`)) return; setBusy(nome); await desconectarCanal(nome); setBusy(null); router.refresh() }
  async function sincronizar(nome: string) {
    setBusy(nome); setMsg('')
    const r = await sincronizarCanal(nome)
    setBusy(null)
    setMsg(r.ok ? `Canal "${nome}" sincronizado — as mensagens vão cair na Triagem. ✅` : (r.error || 'Falha ao sincronizar.'))
  }

  function escopoBadge(c: Canal) {
    if (!c.vinculado) return <span style={pill('#FBE9EB', '#D85563')}>sem vínculo</span>
    if (c.escopo === 'geral') return <span style={pill('#FBF3DF', '#9A7B12')}><i className="ti ti-broadcast" /> Geral</span>
    return <span style={pill('#EFE9F7', '#6b1f3a')}><i className="ti ti-building-store" /> {c.unidadeNome || 'Unidade'}</span>
  }

  return (
    <>
      <div className="rel-acts" style={{ justifyContent: 'space-between', margin: '4px 0 14px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</span>
        <button className="btn btn-primary" onClick={() => setNovo(true)}><i className="ti ti-plus" /> Novo canal</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 14 }}>
        {canais.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Nenhum canal Laser ainda. Crie o primeiro.</div>}
        {canais.map((c) => (
          <div key={c.name} className="rel-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <i className="ti ti-brand-whatsapp" style={{ fontSize: 22, color: conectado(c.status) ? 'var(--green)' : 'var(--text-3)' }} />
              <b style={{ flex: 1, fontSize: 13.5 }}>{c.rotulo || c.name}</b>
              <span style={pill(conectado(c.status) ? '#E7F0EC' : '#FBE9EB', conectado(c.status) ? '#15803D' : '#D85563')}>{conectado(c.status) ? 'Conectado' : 'Desconectado'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              {escopoBadge(c)}
              {c.vinculado && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>delay {c.delayMin}–{c.delayMax}s</span>}
            </div>
            {c.owner && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>{c.owner}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {conectado(c.status)
                ? <>
                    <button className="btn" disabled={busy === c.name} onClick={() => sincronizar(c.name)} title="Reaplica o webhook — garante que as mensagens recebidas apareçam na Triagem em tempo real"><i className="ti ti-refresh" /> Sincronizar</button>
                    <button className="btn" disabled={busy === c.name} onClick={() => desconectar(c.name)}><i className="ti ti-plug-off" /> Desconectar</button>
                  </>
                : <button className="btn btn-primary" disabled={busy === c.name} onClick={() => abrirQr(c.name)}>{busy === c.name ? '…' : <><i className="ti ti-qrcode" /> Conectar (QR)</>}</button>}
              <button className="btn" onClick={() => setEditar(c)}><i className="ti ti-settings" /> {c.vinculado ? 'Editar' : 'Vincular'}</button>
            </div>
          </div>
        ))}
      </div>

      {(novo || editar) && (
        <CanalModal
          base={editar} isAdmin={isAdmin} unidades={unidades} activeUnitId={activeUnitId} activeUnitName={activeUnitName}
          onClose={() => { setNovo(false); setEditar(null) }}
          onSaved={(m) => { setNovo(false); setEditar(null); setMsg(m); router.refresh() }}
        />
      )}

      {qr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={fecharQr}>
          <div className="lc-card" style={{ background: '#fff', padding: 24, maxWidth: 360, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="lc-title" style={{ fontSize: 17, marginBottom: 4 }}>Conectar {qr.nome}</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14 }}>Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie:</p>
            {qr.img ? <img src={qr.img} alt="QR Code" style={{ width: 240, height: 240, margin: '0 auto', display: 'block' }} /> : <div style={{ padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Gerando QR… ({qr.status})</div>}
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>Aguardando leitura… atualiza sozinho.</div>
            <button className="btn" style={{ marginTop: 14 }} onClick={fecharQr}>Fechar</button>
          </div>
        </div>
      )}
    </>
  )
}

function pill(bg: string, color: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color, display: 'inline-flex', alignItems: 'center', gap: 4 }
}

function CanalModal({ base, isAdmin, unidades, activeUnitId, activeUnitName, onClose, onSaved }: {
  base: Canal | null; isAdmin: boolean; unidades: Unidade[]; activeUnitId: string | null; activeUnitName: string
  onClose: () => void; onSaved: (msg: string) => void
}) {
  const editando = !!base // vincular/editar instância existente
  const [nome, setNome] = useState(base?.name ?? '')
  const [escopo, setEscopo] = useState<Escopo>(base?.escopo ?? (isAdmin ? 'unidade' : 'unidade'))
  const [unidadeId, setUnidadeId] = useState(base?.unidadeId ?? activeUnitId ?? unidades[0]?.id ?? '')
  const [rotulo, setRotulo] = useState(base?.rotulo ?? '')
  const [dMin, setDMin] = useState(String(base?.delayMin ?? 20))
  const [dMax, setDMax] = useState(String(base?.delayMax ?? 45))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function salvar() {
    setErr('')
    if (!editando && !nome.trim()) { setErr('Informe o nome do canal.'); return }
    if (escopo === 'unidade' && isAdmin && !unidadeId) { setErr('Selecione a unidade.'); return }
    const min = Number(dMin), max = Number(dMax)
    if (!Number.isFinite(min) || min < 1) { setErr('Delay mínimo inválido (use ≥ 1 segundo).'); return }
    if (!Number.isFinite(max) || max < min) { setErr('O delay máximo deve ser maior ou igual ao mínimo.'); return }
    setBusy(true)
    const form = { nome: editando ? base!.name : nome, escopo, unidadeId, rotulo, delayMin: min, delayMax: max }
    const res = editando ? await salvarVinculo({ ...form, id: base!.bindingId }) : await criarCanal(form)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved(editando ? 'Vínculo do canal salvo.' : 'Canal criado. Clique em "Conectar (QR)" para parear.')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-head"><h3><i className="ti ti-brand-whatsapp" /> {editando ? `Canal: ${base!.name}` : 'Novo canal'}</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          {!editando && <div className="mf"><label>Nome do canal</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Suzano (será 'Laser - …')" /></div>}
          <div className="mf"><label>Rótulo (opcional)</label><input value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Ex.: WhatsApp Vendas Suzano" /></div>
          <div className="mf"><label>Escopo</label>
            {isAdmin ? (
              <select value={escopo} onChange={(e) => setEscopo(e.target.value as Escopo)}>
                <option value="unidade">Unidade (número da franquia)</option>
                <option value="geral">Geral (franqueadora)</option>
              </select>
            ) : <input value={`Unidade  ${activeUnitName}`} disabled />}
          </div>
          {escopo === 'unidade' && isAdmin && (
            <div className="mf"><label>Unidade</label>
              <select value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                <option value="">Selecione…</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Delay mín. (s)</label><input type="number" value={dMin} onChange={(e) => setDMin(e.target.value)} /></div>
            <div className="mf"><label>Delay máx. (s)</label><input type="number" value={dMax} onChange={(e) => setDMax(e.target.value)} /></div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>O delay (anti-ban) é aplicado aos disparos deste canal.</div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : (editando ? 'Salvar vínculo' : 'Criar canal')}</button></div>
      </div>
    </div>
  )
}
