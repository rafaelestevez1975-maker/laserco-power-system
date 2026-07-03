'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dataBR } from '@/lib/fmt'
import {
  solicitarFerias,
  decidirFerias,
  registrarAtestado,
  decidirAtestado,
} from '@/app/(app)/rh/ferias/actions'

export type FeriasRow = {
  id: string
  colaborador_id: string
  colaboradorNome: string
  periodo_aquisitivo: string | null
  data_inicio: string | null
  data_fim: string | null
  dias_solicitados: number | null
  vender_dias: number | null
  status: string | null
  motivo: string | null
}

export type AtestadoRow = {
  id: string
  colaborador_id: string
  colaboradorNome: string
  data_inicio: string | null
  dias: number | null
  cid: string | null
  data_entrega: string | null
  status: string | null
  observacoes: string | null
}

export type ColabOpt = { id: string; nome: string }

type Aba = 'ferias' | 'atestados'

type Props = {
  ferias: FeriasRow[]
  atestados: AtestadoRow[]
  colaboradores: ColabOpt[]
  /** Colaborador vinculado ao usuário logado (ou null). Trava o form quando não é gestor/RH. */
  meuColaboradorId: string | null
  /** rh/gestor/gerente/admin: pode aprovar/recusar e lançar para qualquer um. */
  podeAprovar: boolean
  erro: string
  /** Há unidade ativa, mas nenhum colaborador nela. */
  semColaboradores: boolean
  activeUnitName: string
  kpis: { feriasPend: number; feriasAprov: number; atestPend: number; emFerias: number }
}

const ST_FERIAS: Record<string, { bg: string; color: string; label: string }> = {
  pendente: { bg: '#FEF3C7', color: '#A16207', label: 'Pendente' },
  aprovada: { bg: '#E7F0EC', color: '#15803D', label: 'Aprovada' },
  reprovada: { bg: '#FBE9EB', color: '#B91C1C', label: 'Recusada' },
  cancelada: { bg: '#EEF2F7', color: '#64748B', label: 'Cancelada' },
}
const ST_ATEST: Record<string, { bg: string; color: string; label: string }> = {
  pendente: { bg: '#FEF3C7', color: '#A16207', label: 'Pendente' },
  aprovado: { bg: '#E7F0EC', color: '#15803D', label: 'Aprovado' },
  reprovado: { bg: '#FBE9EB', color: '#B91C1C', label: 'Recusado' },
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

function pill(bg: string, color: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color, whiteSpace: 'nowrap' }
}

export function FeriasManager(props: Props) {
  const { ferias, atestados, colaboradores, meuColaboradorId, podeAprovar, erro, semColaboradores, activeUnitName, kpis } = props
  const router = useRouter()

  const [aba, setAba] = useState<Aba>('ferias')
  const [msg, setMsg] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [modal, setModal] = useState<'ferias' | 'atestado' | null>(null)
  const [recusa, setRecusa] = useState<FeriasRow | null>(null)

  // Quem não gerencia ("colaborador") só pode lançar se tiver registro de RH próprio.
  const podeCriar = podeAprovar || !!meuColaboradorId

  async function decidirF(id: string, status: 'aprovada' | 'reprovada' | 'cancelada', motivo?: string) {
    setMsg(''); setErroAcao(''); setBusy(id)
    const r = await decidirFerias(id, status, motivo)
    setBusy(null)
    if (!r.ok) { setErroAcao(r.error || 'Erro ao decidir.'); return }
    setMsg(status === 'aprovada' ? 'Férias aprovadas.' : status === 'reprovada' ? 'Solicitação recusada.' : 'Solicitação cancelada.')
    setRecusa(null)
    router.refresh()
  }

  async function decidirA(id: string, status: 'aprovado' | 'reprovado') {
    setMsg(''); setErroAcao(''); setBusy(id)
    const r = await decidirAtestado(id, status)
    setBusy(null)
    if (!r.ok) { setErroAcao(r.error || 'Erro ao decidir.'); return }
    setMsg(status === 'aprovado' ? 'Atestado aprovado.' : 'Atestado recusado.')
    router.refresh()
  }

  const botaoNovo = aba === 'ferias'
    ? { label: 'Solicitar férias', icon: 'ti-calendar-plus', open: () => { setMsg(''); setErroAcao(''); setModal('ferias') } }
    : { label: 'Registrar atestado', icon: 'ti-file-plus', open: () => { setMsg(''); setErroAcao(''); setModal('atestado') } }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 16px' }}>
        <div className="metric-box"><span>Férias pendentes</span><b style={{ color: kpis.feriasPend ? '#A16207' : 'var(--text-2)' }}>{kpis.feriasPend}</b></div>
        <div className="metric-box"><span>Férias aprovadas</span><b style={{ color: '#15803D' }}>{kpis.feriasAprov}</b></div>
        <div className="metric-box"><span>Em férias hoje</span><b style={{ color: kpis.emFerias ? '#0f6b3a' : 'var(--text-2)' }}>{kpis.emFerias}</b></div>
        <div className="metric-box"><span>Atestados pendentes</span><b style={{ color: kpis.atestPend ? '#A16207' : 'var(--text-2)' }}>{kpis.atestPend}</b></div>
      </div>

      {/* Abas */}
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={`seg-btn${aba === 'ferias' ? ' active' : ''}`} onClick={() => { setMsg(''); setErroAcao(''); setAba('ferias') }}>
          <i className="ti ti-beach" /> Férias <span style={{ opacity: 0.7 }}>({ferias.length})</span>
        </button>
        <button type="button" className={`seg-btn${aba === 'atestados' ? ' active' : ''}`} onClick={() => { setMsg(''); setErroAcao(''); setAba('atestados') }}>
          <i className="ti ti-stethoscope" /> Atestados <span style={{ opacity: 0.7 }}>({atestados.length})</span>
        </button>
      </div>

      {/* Ação principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          <i className="ti ti-building-store" /> {activeUnitName}
        </span>
        {podeCriar && (
          <button className="btn btn-primary" onClick={botaoNovo.open}>
            <i className={`ti ${botaoNovo.icon}`} /> {botaoNovo.label}
          </button>
        )}
      </div>

      {/* Mensagens */}
      {(msg || erroAcao) && (
        <div style={{ fontSize: 12.5, margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, background: erroAcao ? 'var(--red-bg)' : '#E7F0EC', color: erroAcao ? 'var(--red)' : '#15803D' }}>
          {erroAcao || msg}
        </div>
      )}

      {/* Erro de carregamento (estado de erro) */}
      {erro && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '12px 16px', background: 'var(--red-bg)', border: '1px solid #F0C0C0' }}>
          <i className="ti ti-alert-triangle" style={{ color: 'var(--red)', fontSize: 18 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{erro} Tente recarregar a página.</span>
        </div>
      )}

      {/* Sem colaboradores na unidade ativa */}
      {!erro && semColaboradores && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '12px 16px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
          <i className="ti ti-users-group" style={{ color: '#A16207', fontSize: 18 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Nenhum colaborador ativo nesta unidade. Cadastre colaboradores em <b>RH · Colaboradores</b>.</span>
        </div>
      )}

      {/* ── Aba Férias ── */}
      {aba === 'ferias' && !erro && (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Colaborador</th><th>Período aquisitivo</th><th>Início</th><th>Fim</th>
                  <th className="num-r">Dias</th><th className="num-r">Abono</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {ferias.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                      <i className="ti ti-beach" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                      Nenhuma solicitação de férias{semColaboradores ? '' : ' nesta unidade'}.
                    </td>
                  </tr>
                )}
                {ferias.map((r) => {
                  const st = ST_FERIAS[r.status || 'pendente'] ?? ST_FERIAS.pendente
                  return (
                    <tr key={r.id}>
                      <td>
                        <b>{r.colaboradorNome}</b>
                        {r.motivo && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.motivo}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.periodo_aquisitivo || ''}</td>
                      <td>{dataBR(r.data_inicio) || ''}</td>
                      <td>{dataBR(r.data_fim) || ''}</td>
                      <td className="num-r">{r.dias_solicitados ?? ''}</td>
                      <td className="num-r">{r.vender_dias ? r.vender_dias : ''}</td>
                      <td><span style={pill(st.bg, st.color)}>{st.label}</span></td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {podeAprovar && r.status === 'pendente' && (
                          <>
                            <button className="btn" style={{ color: '#15803D' }} disabled={busy === r.id} onClick={() => decidirF(r.id, 'aprovada')} title="Aprovar">
                              <i className="ti ti-check" />
                            </button>
                            <button className="btn" style={{ marginLeft: 6, color: '#B91C1C' }} disabled={busy === r.id} onClick={() => { setMsg(''); setErroAcao(''); setRecusa(r) }} title="Recusar">
                              <i className="ti ti-x" />
                            </button>
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
      )}

      {/* ── Aba Atestados ── */}
      {aba === 'atestados' && !erro && (
        <>
          <div className="rel-legend" style={{ marginBottom: 8 }}>
            <i className="ti ti-info-circle" /> Atestados médicos devem ser entregues ao RH em até <b>2 dias úteis</b> do afastamento.
          </div>
          <div className="cli-card">
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Colaborador</th><th>Início</th><th className="num-r">Dias</th><th>CID</th>
                    <th>Entregue ao RH</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {atestados.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                        <i className="ti ti-stethoscope" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                        Nenhum atestado registrado{semColaboradores ? '' : ' nesta unidade'}.
                      </td>
                    </tr>
                  )}
                  {atestados.map((r) => {
                    const st = ST_ATEST[r.status || 'pendente'] ?? ST_ATEST.pendente
                    return (
                      <tr key={r.id}>
                        <td>
                          <b>{r.colaboradorNome}</b>
                          {r.observacoes && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.observacoes}</div>}
                        </td>
                        <td>{dataBR(r.data_inicio) || ''}</td>
                        <td className="num-r">{r.dias ?? ''}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.cid || ''}</td>
                        <td style={{ fontSize: 12 }}>{r.data_entrega ? dataBR(r.data_entrega) : <span style={{ color: '#A16207' }}>pendente</span>}</td>
                        <td><span style={pill(st.bg, st.color)}>{st.label}</span></td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {podeAprovar && r.status === 'pendente' && (
                            <>
                              <button className="btn" style={{ color: '#15803D' }} disabled={busy === r.id} onClick={() => decidirA(r.id, 'aprovado')} title="Aprovar">
                                <i className="ti ti-check" />
                              </button>
                              <button className="btn" style={{ marginLeft: 6, color: '#B91C1C' }} disabled={busy === r.id} onClick={() => decidirA(r.id, 'reprovado')} title="Recusar">
                                <i className="ti ti-x" />
                              </button>
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
        </>
      )}

      {/* Modais de criação */}
      {modal === 'ferias' && (
        <FeriasForm
          colaboradores={colaboradores}
          podeAprovar={podeAprovar}
          meuColaboradorId={meuColaboradorId}
          onClose={() => setModal(null)}
          onSaved={(m) => { setModal(null); setMsg(m); router.refresh() }}
        />
      )}
      {modal === 'atestado' && (
        <AtestadoForm
          colaboradores={colaboradores}
          podeAprovar={podeAprovar}
          meuColaboradorId={meuColaboradorId}
          onClose={() => setModal(null)}
          onSaved={(m) => { setModal(null); setMsg(m); router.refresh() }}
        />
      )}

      {/* Modal de recusa (motivo obrigatório) */}
      {recusa && (
        <RecusaForm
          row={recusa}
          busy={busy === recusa.id}
          onClose={() => setRecusa(null)}
          onConfirm={(motivo) => decidirF(recusa.id, 'reprovada', motivo)}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Form: Solicitar férias ───────────────────────────

function FeriasForm(props: {
  colaboradores: ColabOpt[]
  podeAprovar: boolean
  meuColaboradorId: string | null
  onClose: () => void
  onSaved: (m: string) => void
}) {
  const { colaboradores, podeAprovar, meuColaboradorId, onClose, onSaved } = props
  // Colaborador comum: trava no próprio registro. Gestão/RH: escolhe livremente.
  const padraoColab = podeAprovar ? (colaboradores[0]?.id ?? '') : (meuColaboradorId ?? '')
  const [f, setF] = useState({ colaborador_id: padraoColab, periodo_aquisitivo: '', data_inicio: '', data_fim: '', vender_dias: '0', motivo: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const diasPrev = useMemo(() => {
    if (!f.data_inicio || !f.data_fim) return 0
    const a = new Date(f.data_inicio + 'T00:00:00').getTime()
    const b = new Date(f.data_fim + 'T00:00:00').getTime()
    if (isNaN(a) || isNaN(b)) return 0
    return Math.max(0, Math.round((b - a) / 86400000) + 1)
  }, [f.data_inicio, f.data_fim])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.colaborador_id) { setErr('Selecione o colaborador.'); return }
    if (!f.data_inicio || !f.data_fim) { setErr('Informe o período (início e fim).'); return }
    if (diasPrev <= 0) { setErr('A data fim deve ser igual ou após o início.'); return }
    if (diasPrev > 30) { setErr('O período não pode exceder 30 dias.'); return }
    setSaving(true)
    const r = await solicitarFerias({
      colaborador_id: f.colaborador_id,
      periodo_aquisitivo: f.periodo_aquisitivo,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
      vender_dias: Number(f.vender_dias) || 0,
      motivo: f.motivo,
    })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao solicitar.'); return }
    onSaved('Solicitação de férias enviada.')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="modal" style={{ width: 480 }}>
        <div className="modal-head">
          <h3><i className="ti ti-calendar-plus" /> Solicitar férias</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mf">
            <label>Colaborador</label>
            <select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)} disabled={!podeAprovar}>
              <option value="">Selecione…</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {!podeAprovar && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Você só pode solicitar para si mesmo.</span>}
          </div>
          <div className="mf"><label>Período aquisitivo</label><input style={inp} placeholder="2025/2026" value={f.periodo_aquisitivo} onChange={(e) => set('periodo_aquisitivo', e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mf" style={{ flex: 1 }}><label>Início</label><input style={inp} type="date" value={f.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></div>
            <div className="mf" style={{ flex: 1 }}><label>Fim</label><input style={inp} type="date" value={f.data_fim} onChange={(e) => set('data_fim', e.target.value)} /></div>
          </div>
          {diasPrev > 0 && <div style={{ fontSize: 12, color: 'var(--text-2)' }}><i className="ti ti-calendar" /> {diasPrev} dia(s) de férias.</div>}
          <div className="mf"><label>Vender dias (abono pecuniário, até 10)</label><input style={inp} type="number" min={0} max={10} value={f.vender_dias} onChange={(e) => set('vender_dias', e.target.value)} /></div>
          <div className="mf"><label>Observação</label><input style={inp} value={f.motivo} onChange={(e) => set('motivo', e.target.value)} /></div>
          {err && <div className="crm-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────── Form: Registrar atestado ───────────────────────────

function AtestadoForm(props: {
  colaboradores: ColabOpt[]
  podeAprovar: boolean
  meuColaboradorId: string | null
  onClose: () => void
  onSaved: (m: string) => void
}) {
  const { colaboradores, podeAprovar, meuColaboradorId, onClose, onSaved } = props
  const padraoColab = podeAprovar ? (colaboradores[0]?.id ?? '') : (meuColaboradorId ?? '')
  const [f, setF] = useState({ colaborador_id: padraoColab, data_inicio: '', dias: '1', cid: '', data_entrega: '', observacoes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.colaborador_id) { setErr('Selecione o colaborador.'); return }
    if (!f.data_inicio) { setErr('Informe a data de início do afastamento.'); return }
    const dias = Number(f.dias)
    if (!Number.isFinite(dias) || dias < 1) { setErr('Informe o número de dias (mínimo 1).'); return }
    setSaving(true)
    const r = await registrarAtestado({
      colaborador_id: f.colaborador_id,
      data_inicio: f.data_inicio,
      dias,
      cid: f.cid,
      data_entrega: f.data_entrega || undefined,
      observacoes: f.observacoes,
    })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao registrar.'); return }
    onSaved('Atestado registrado.')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="modal" style={{ width: 480 }}>
        <div className="modal-head">
          <h3><i className="ti ti-file-plus" /> Registrar atestado</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mf">
            <label>Colaborador</label>
            <select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)} disabled={!podeAprovar}>
              <option value="">Selecione…</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {!podeAprovar && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Você só pode registrar para si mesmo.</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mf" style={{ flex: 1 }}><label>Início do afastamento</label><input style={inp} type="date" value={f.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} /></div>
            <div className="mf" style={{ width: 110 }}><label>Dias</label><input style={inp} type="number" min={1} value={f.dias} onChange={(e) => set('dias', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="mf" style={{ flex: 1 }}><label>CID (opcional)</label><input style={inp} value={f.cid} onChange={(e) => set('cid', e.target.value)} /></div>
            <div className="mf" style={{ flex: 1 }}><label>Entregue ao RH em</label><input style={inp} type="date" value={f.data_entrega} onChange={(e) => set('data_entrega', e.target.value)} /></div>
          </div>
          <div className="mf"><label>Observações</label><input style={inp} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
          {err && <div className="crm-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Registrar'}</button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────── Modal: recusar férias (com motivo) ───────────────────────────

function RecusaForm(props: { row: FeriasRow; busy: boolean; onClose: () => void; onConfirm: (motivo: string) => void }) {
  const { row, busy, onClose, onConfirm } = props
  const [motivo, setMotivo] = useState('')

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-head">
          <h3><i className="ti ti-x" /> Recusar solicitação</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            Férias de <b>{row.colaboradorNome}</b> ({dataBR(row.data_inicio)} – {dataBR(row.data_fim)}).
          </div>
          <div className="mf">
            <label>Motivo da recusa (opcional)</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: período coincide com alta temporada" />
          </div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary" style={{ background: '#B91C1C' }} disabled={busy} onClick={() => onConfirm(motivo)}>
            {busy ? 'Recusando…' : 'Recusar férias'}
          </button>
        </div>
      </div>
    </div>
  )
}
