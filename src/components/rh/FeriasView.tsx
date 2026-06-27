'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { dataBR } from '@/lib/fmt'
import { solicitarFerias, decidirFerias, registrarAtestado, decidirAtestado } from '@/app/(app)/rh/ferias/actions'

export type FeriasRow = {
  id: string; colaborador_id: string; colaboradorNome: string
  periodo_aquisitivo: string | null; data_inicio: string | null; data_fim: string | null
  dias_solicitados: number; vender_dias: number; status: string; motivo: string | null
}
export type AtestadoRow = {
  id: string; colaborador_id: string; colaboradorNome: string
  data_inicio: string | null; dias: number; cid: string | null; data_entrega: string | null
  status: string; observacoes: string | null
}
export type ColabOpt = { id: string; nome: string }

type Props = {
  ferias: FeriasRow[]; atestados: AtestadoRow[]; colaboradores: ColabOpt[]
  podeAprovar: boolean; semDados: boolean; activeUnitName: string
  kpis: { feriasPend: number; atestPend: number; emFerias: number }
}

const ST_FERIAS: Record<string, { bg: string; color: string; label: string }> = {
  pendente: { bg: '#FEF3C7', color: '#A16207', label: 'Pendente' },
  aprovada: { bg: '#E7F0EC', color: '#15803D', label: 'Aprovada' },
  reprovada: { bg: '#FBE9EB', color: '#B91C1C', label: 'Reprovada' },
  cancelada: { bg: '#EEF2F7', color: '#64748B', label: 'Cancelada' },
}
const ST_ATEST: Record<string, { bg: string; color: string; label: string }> = {
  pendente: { bg: '#FEF3C7', color: '#A16207', label: 'Pendente' },
  aprovado: { bg: '#E7F0EC', color: '#15803D', label: 'Aprovado' },
  reprovado: { bg: '#FBE9EB', color: '#B91C1C', label: 'Reprovado' },
}
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

export function FeriasView(props: Props) {
  const { ferias, atestados, colaboradores, podeAprovar, semDados, activeUnitName, kpis } = props
  const router = useRouter()
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [modal, setModal] = useState<'ferias' | 'atestado' | null>(null)

  async function decidirF(id: string, status: 'aprovada' | 'reprovada' | 'cancelada') {
    setMsg(''); setErro('')
    const r = await decidirFerias(id, status)
    if (!r.ok) { setErro(r.error || 'Erro.'); return }
    setMsg('Solicitação atualizada.'); router.refresh()
  }
  async function decidirA(id: string, status: 'aprovado' | 'reprovado') {
    setMsg(''); setErro('')
    const r = await decidirAtestado(id, status)
    if (!r.ok) { setErro(r.error || 'Erro.'); return }
    setMsg('Atestado atualizado.'); router.refresh()
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 16px' }}>
        <div className="metric-box"><span>Férias pendentes</span><b style={{ color: kpis.feriasPend ? 'var(--amber)' : 'var(--text-2)' }}>{kpis.feriasPend}</b></div>
        <div className="metric-box"><span>Atestados pendentes</span><b style={{ color: kpis.atestPend ? 'var(--amber)' : 'var(--text-2)' }}>{kpis.atestPend}</b></div>
        <div className="metric-box"><span>Férias aprovadas</span><b style={{ color: '#15803D' }}>{kpis.emFerias}</b></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <button className="btn btn-primary" onClick={() => { setMsg(''); setErro(''); setModal('ferias') }}><i className="ti ti-calendar-plus" /> Solicitar férias</button>
        <button className="btn" onClick={() => { setMsg(''); setErro(''); setModal('atestado') }}><i className="ti ti-file-plus" /> Registrar atestado</button>
      </div>

      {(msg || erro) && (
        <div style={{ fontSize: 12.5, margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, background: erro ? 'var(--red-bg)' : '#E7F0EC', color: erro ? 'var(--red)' : '#15803D' }}>{erro || msg}</div>
      )}

      {semDados && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '10px 14px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
          <i className="ti ti-database-off" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Nenhuma solicitação ainda. Se as tabelas não existirem, aplique a migration <b>scripts/migrations/rh.sql</b> no lkii.</span>
        </div>
      )}

      {/* ── Férias ── */}
      <div className="cli-card" style={{ marginBottom: 16 }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-beach flt" /> Solicitações de férias · {activeUnitName}</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Colaborador</th><th>Período aquisitivo</th><th>Início</th><th>Fim</th><th className="num-r">Dias</th><th className="num-r">Abono</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {ferias.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>Nenhuma solicitação de férias.</td></tr>}
              {ferias.map((r) => {
                const st = ST_FERIAS[r.status] ?? ST_FERIAS.pendente
                return (
                  <tr key={r.id}>
                    <td><b>{r.colaboradorNome}</b></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.periodo_aquisitivo || '—'}</td>
                    <td>{dataBR(r.data_inicio) || '—'}</td>
                    <td>{dataBR(r.data_fim) || '—'}</td>
                    <td className="num-r">{r.dias_solicitados}</td>
                    <td className="num-r">{r.vender_dias || '—'}</td>
                    <td><span style={pill(st.bg, st.color)}>{st.label}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {podeAprovar && r.status === 'pendente' && (
                        <>
                          <button className="btn" style={{ color: '#15803D' }} onClick={() => decidirF(r.id, 'aprovada')}><i className="ti ti-check" /></button>
                          <button className="btn" style={{ marginLeft: 6, color: '#B91C1C' }} onClick={() => decidirF(r.id, 'reprovada')}><i className="ti ti-x" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Atestados ── */}
      <div className="rel-legend" style={{ marginBottom: 8 }}>Atestados médicos devem ser entregues ao RH em até <b>2 dias úteis</b> do afastamento.</div>
      <div className="cli-card">
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-stethoscope flt" /> Atestados médicos</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Colaborador</th><th>Início</th><th className="num-r">Dias</th><th>CID</th><th>Entregue ao RH</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {atestados.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>Nenhum atestado registrado.</td></tr>}
              {atestados.map((r) => {
                const st = ST_ATEST[r.status] ?? ST_ATEST.pendente
                return (
                  <tr key={r.id}>
                    <td><b>{r.colaboradorNome}</b></td>
                    <td>{dataBR(r.data_inicio) || '—'}</td>
                    <td className="num-r">{r.dias}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.cid || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.data_entrega ? dataBR(r.data_entrega) : <span style={{ color: 'var(--amber)' }}>pendente</span>}</td>
                    <td><span style={pill(st.bg, st.color)}>{st.label}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {podeAprovar && r.status === 'pendente' && (
                        <>
                          <button className="btn" style={{ color: '#15803D' }} onClick={() => decidirA(r.id, 'aprovado')}><i className="ti ti-check" /></button>
                          <button className="btn" style={{ marginLeft: 6, color: '#B91C1C' }} onClick={() => decidirA(r.id, 'reprovado')}><i className="ti ti-x" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'ferias' && <FeriasForm colaboradores={colaboradores} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); router.refresh() }} onErro={setErro} />}
      {modal === 'atestado' && <AtestadoForm colaboradores={colaboradores} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setMsg(m); router.refresh() }} onErro={setErro} />}
    </div>
  )
}

function pill(bg: string, color: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color, whiteSpace: 'nowrap' }
}

function FeriasForm({ colaboradores, onClose, onSaved, onErro }: { colaboradores: ColabOpt[]; onClose: () => void; onSaved: (m: string) => void; onErro: (e: string) => void }) {
  const [f, setF] = useState({ colaborador_id: colaboradores[0]?.id ?? '', periodo_aquisitivo: '', data_inicio: '', data_fim: '', vender_dias: '0', motivo: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function submit(e: React.FormEvent) {
    e.preventDefault(); onErro(''); setSaving(true)
    const r = await solicitarFerias({ colaborador_id: f.colaborador_id, periodo_aquisitivo: f.periodo_aquisitivo, data_inicio: f.data_inicio, data_fim: f.data_fim, vender_dias: Number(f.vender_dias) || 0, motivo: f.motivo })
    setSaving(false)
    if (!r.ok) { onErro(r.error || 'Erro.'); return }
    onSaved('Solicitação de férias enviada.')
  }
  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="modal" style={{ width: 480 }}>
        <div className="modal-head"><h3><i className="ti ti-calendar-plus" /> Solicitar férias</h3><button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mf"><label>Colaborador</label><select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)}><option value="">Selecione…</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div className="mf"><label>Período aquisitivo</label><input style={inp} placeholder="2025/2026" value={f.periodo_aquisitivo} onChange={(e) => set('periodo_aquisitivo', e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mf" style={{ flex: 1 }}><label>Início</label><input style={inp} type="date" value={f.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></div>
            <div className="mf" style={{ flex: 1 }}><label>Fim</label><input style={inp} type="date" value={f.data_fim} onChange={(e) => set('data_fim', e.target.value)} /></div>
          </div>
          <div className="mf"><label>Vender dias (abono pecuniário, até 10)</label><input style={inp} type="number" min={0} max={10} value={f.vender_dias} onChange={(e) => set('vender_dias', e.target.value)} /></div>
          <div className="mf"><label>Observação</label><input style={inp} value={f.motivo} onChange={(e) => set('motivo', e.target.value)} /></div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </form>
    </div>
  )
}

function AtestadoForm({ colaboradores, onClose, onSaved, onErro }: { colaboradores: ColabOpt[]; onClose: () => void; onSaved: (m: string) => void; onErro: (e: string) => void }) {
  const [f, setF] = useState({ colaborador_id: colaboradores[0]?.id ?? '', data_inicio: '', dias: '1', cid: '', data_entrega: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  async function submit(e: React.FormEvent) {
    e.preventDefault(); onErro(''); setSaving(true)
    const r = await registrarAtestado({ colaborador_id: f.colaborador_id, data_inicio: f.data_inicio, dias: Number(f.dias) || 1, cid: f.cid, data_entrega: f.data_entrega || undefined, observacoes: f.observacoes })
    setSaving(false)
    if (!r.ok) { onErro(r.error || 'Erro.'); return }
    onSaved('Atestado registrado.')
  }
  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="modal" style={{ width: 480 }}>
        <div className="modal-head"><h3><i className="ti ti-file-plus" /> Registrar atestado</h3><button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mf"><label>Colaborador</label><select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)}><option value="">Selecione…</option>{colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mf" style={{ flex: 1 }}><label>Início do afastamento</label><input style={inp} type="date" value={f.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></div>
            <div className="mf" style={{ width: 110 }}><label>Dias</label><input style={inp} type="number" min={1} value={f.dias} onChange={(e) => set('dias', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mf" style={{ flex: 1 }}><label>CID (opcional)</label><input style={inp} value={f.cid} onChange={(e) => set('cid', e.target.value)} /></div>
            <div className="mf" style={{ flex: 1 }}><label>Entregue ao RH em</label><input style={inp} type="date" value={f.data_entrega} onChange={(e) => set('data_entrega', e.target.value)} /></div>
          </div>
          <div className="mf"><label>Observações</label><input style={inp} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Registrar'}</button>
        </div>
      </form>
    </div>
  )
}
