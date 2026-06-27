'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarAgendamento, confirmarAgendamento, cancelarAgendamento, buscarClientes,
  type ClienteOpcao, type ActionResult,
} from '@/app/(app)/agenda/actions'
import { dataBR } from '@/lib/fmt'

// ── Constantes da grade (espelham o legado: START=8h, END=20h, GAP 10min, SLOT 36px) ──
const START = 8 * 60
const END = 20 * 60
const GAP = 10
const SLOT = 36
const ROWS = (END - START) / GAP

export type Profissional = { id: string; perfilId: string | null; nome: string; cargo: string | null }
export type Agendamento = {
  id: string
  inicio: string
  fim: string | null
  status: string | null
  observacao: string | null
  profissionalPerfilId: string | null
  clienteNome: string | null
  servicoNome: string | null
  servicoDuracao: number | null
  profissionalNome: string | null
}
export type Bloqueio = {
  id: string
  nome: string
  profissionalPerfilId: string | null
  horaInicio: string | null
  horaFim: string | null
}
export type ServicoOpcao = { id: string; nome: string; duracao_min: number }

export type AgGridProps = {
  dia: string
  diaPrev: string
  diaNext: string
  labelDia: string
  profissionais: Profissional[]
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  servicos: ServicoOpcao[]
  unidadeId: string | null
  podeAgendar: boolean
}

// Mapeia status do backend → classe de cor da grade (legacy.css .evt.*).
// Enum real status_agendamento: aberto | confirmado | em_atendimento | concluido | cancelado | no_show.
function classeStatus(status: string | null): string {
  switch (status) {
    case 'confirmado': return 'confirmado'
    case 'em_atendimento': return 'os'
    case 'concluido': return 'finalizado'
    case 'no_show': return 'block' // falta — cinza riscado
    default: return 'agendado' // aberto/outros
  }
}
function rotuloStatus(status: string | null): string {
  const m: Record<string, string> = {
    aberto: 'Agendado', confirmado: 'Confirmado', em_atendimento: 'Em atendimento',
    concluido: 'Concluído', cancelado: 'Cancelado', no_show: 'Falta',
  }
  return m[status || ''] || (status || '—')
}

const COL_SEM_PROF = '__sem_prof__'

/** minutos desde meia-noite a partir de um ISO (no fuso BR). */
function minDoDia(iso: string): number {
  const d = new Date(iso)
  // toLocaleString no fuso BR para extrair hora/min locais corretos.
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  const [hh, mm] = s.split(':').map(Number)
  return hh * 60 + mm
}
function minDeHora(t: string | null): number | null {
  if (!t) return null
  const [hh, mm] = t.split(':').map(Number)
  if (isNaN(hh)) return null
  return hh * 60 + (mm || 0)
}
function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function AgendaGrade(props: AgGridProps) {
  const router = useRouter()
  const { dia, diaPrev, diaNext, labelDia, profissionais, agendamentos, bloqueios, servicos, unidadeId, podeAgendar } = props

  // Colunas: cada profissional + uma coluna "Sem profissional" se houver agendamentos órfãos.
  const orfaos = agendamentos.some((a) => !a.profissionalPerfilId || !profissionais.some((p) => p.perfilId === a.profissionalPerfilId))
  const colunas = useMemo(() => {
    const base = profissionais.map((p) => ({ key: p.id, perfilId: p.perfilId, nome: p.nome, cargo: p.cargo }))
    if (orfaos) base.push({ key: COL_SEM_PROF, perfilId: null, nome: 'Sem profissional', cargo: null })
    return base
  }, [profissionais, orfaos])

  const nCols = colunas.length

  // Agrupa agendamentos por coluna (perfilId). Órfãos vão para COL_SEM_PROF.
  const porColuna = useMemo(() => {
    const map = new Map<string, Agendamento[]>()
    for (const c of colunas) map.set(c.key, [])
    for (const a of agendamentos) {
      if (a.status === 'cancelado') continue
      const col = colunas.find((c) => c.perfilId && c.perfilId === a.profissionalPerfilId)
      const key = col ? col.key : COL_SEM_PROF
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return map
  }, [agendamentos, colunas])

  const bloqPorColuna = useMemo(() => {
    const map = new Map<string, Bloqueio[]>()
    for (const c of colunas) map.set(c.key, [])
    for (const b of bloqueios) {
      const col = colunas.find((c) => c.perfilId && c.perfilId === b.profissionalPerfilId)
      const key = col ? col.key : COL_SEM_PROF
      if (map.has(key)) map.get(key)!.push(b)
    }
    return map
  }, [bloqueios, colunas])

  // Estado dos modais.
  const [detalhe, setDetalhe] = useState<Agendamento | null>(null)
  const [criar, setCriar] = useState<{ profissional: Profissional; horaMin: number } | null>(null)

  function onSlotClick(colKey: string, slotIndex: number) {
    if (!podeAgendar) return
    const prof = profissionais.find((p) => p.id === colKey)
    if (!prof || !prof.perfilId) return // só agenda em colunas de profissional com perfil vinculado
    setCriar({ profissional: prof, horaMin: START + slotIndex * GAP })
  }

  // Estilos dinâmicos: nº de colunas varia (legacy é fixo em 4).
  const gridCols = `64px repeat(${nCols}, minmax(120px, 1fr))`

  function iniciais(nome: string): string {
    return nome.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?'
  }

  return (
    <>
      {/* Toolbar de dia */}
      <div className="agenda-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="day-nav">
          <button title="Dia anterior" onClick={() => router.push(`/agenda?d=${diaPrev}`)}><i className="ti ti-chevron-left" /></button>
          <span className="day-label"><i className="ti ti-calendar" /> {labelDia}</span>
          <button title="Próximo dia" onClick={() => router.push(`/agenda?d=${diaNext}`)}><i className="ti ti-chevron-right" /></button>
        </div>
        <label style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-calendar-event" />
          <input type="date" defaultValue={dia} onChange={(e) => { if (e.target.value) router.push(`/agenda?d=${e.target.value}`) }}
            style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
        </label>
        {podeAgendar
          ? <span className="ag-hint" style={{ fontSize: 12, color: 'var(--text-3)' }}><i className="ti ti-hand-finger" /> Clique em um horário livre para agendar</span>
          : <span className="ag-hint" style={{ fontSize: 12, color: 'var(--text-3)' }}>Selecione uma unidade no topo para agendar</span>}
      </div>

      {profissionais.length === 0 ? (
        <div className="cli-card" style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>
          <i className="ti ti-users" /> Nenhum profissional ativo nesta unidade. Cadastre colaboradores para montar a grade.
        </div>
      ) : (
        <div className="agenda-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <div className="agenda-head" style={{ display: 'grid', gridTemplateColumns: gridCols }}>
            <div className="corner" />
            {colunas.map((c) => (
              <div key={c.key} className="col-h">
                <span className="ch-ava">{iniciais(c.nome)}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
              </div>
            ))}
          </div>
          <div className="agenda-scroll" style={{ maxHeight: '70vh', overflow: 'auto' }}>
            <div className="agenda-grid" style={{ display: 'grid', gridTemplateColumns: gridCols, position: 'relative' }}>
              {/* Coluna de horários */}
              <div className="time-col">
                {Array.from({ length: ROWS }).map((_, i) => {
                  const m = START + i * GAP
                  const isHour = m % 60 === 0
                  return <div key={i} className={`time-slot ${isHour ? 'hour' : ''}`}>{isHour ? hhmm(m) : ''}</div>
                })}
              </div>

              {/* Colunas de profissionais */}
              {colunas.map((c) => {
                const evts = porColuna.get(c.key) ?? []
                const blocks = bloqPorColuna.get(c.key) ?? []
                return (
                  <div key={c.key} className="prof-col">
                    {/* linhas/slots clicáveis */}
                    {Array.from({ length: ROWS }).map((_, i) => {
                      const m = START + i * GAP
                      const cls = m % 60 === 0 ? 'hour' : (m % 30 === 0 ? 'half' : '')
                      return (
                        <div
                          key={i}
                          className={`slot-line ${cls}`}
                          title={podeAgendar && c.perfilId ? `Agendar ${hhmm(m)}` : undefined}
                          onClick={() => onSlotClick(c.key, i)}
                        />
                      )
                    })}

                    {/* bloqueios */}
                    {blocks.map((b) => {
                      const bi = minDeHora(b.horaInicio) ?? START
                      const bf = minDeHora(b.horaFim) ?? END
                      const top = ((Math.max(bi, START) - START) / GAP) * SLOT
                      const h = ((Math.min(bf, END) - Math.max(bi, START)) / GAP) * SLOT
                      if (h <= 0) return null
                      return (
                        <div key={b.id} className="evt block" style={{ top, height: h - 3 }} title={b.nome}>
                          <div className="en"><i className="ti ti-lock" style={{ fontSize: 11 }} /> {b.nome}</div>
                        </div>
                      )
                    })}

                    {/* agendamentos */}
                    {evts.map((a) => {
                      const ini = minDoDia(a.inicio)
                      const fimMin = a.fim ? minDoDia(a.fim) : ini + (a.servicoDuracao || GAP)
                      const top = ((Math.max(ini, START) - START) / GAP) * SLOT
                      const h = Math.max(SLOT - 3, ((Math.min(fimMin, END) - Math.max(ini, START)) / GAP) * SLOT - 3)
                      const k = classeStatus(a.status)
                      const lock = a.status === 'concluido'
                      return (
                        <div
                          key={a.id}
                          className={`evt ${k}`}
                          style={{ top, height: h }}
                          title={`${a.clienteNome || 'Cliente'} · ${rotuloStatus(a.status)}`}
                          onClick={(e) => { e.stopPropagation(); setDetalhe(a) }}
                        >
                          {lock && <i className="ti ti-lock evt-lock" />}
                          <div className="et">{hhmm(ini)}</div>
                          <div className="en">{a.clienteNome || 'Cliente'}</div>
                          {a.servicoNome && <div className="es">{a.servicoNome}</div>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legenda de status */}
      <div className="legend">
        <span><span className="sw" style={{ background: '#9690A6' }} /> Bloqueio</span>
        <span><span className="sw" style={{ background: '#3D7FD1' }} /> Agendado</span>
        <span><span className="sw" style={{ background: 'var(--brand-500)' }} /> Confirmado</span>
        <span><span className="sw" style={{ background: '#E0922A' }} /> Em atendimento</span>
        <span><span className="sw" style={{ background: '#1F9D6B' }} /> Concluído <i className="ti ti-lock" style={{ fontSize: 12 }} /></span>
      </div>

      {detalhe && (
        <DetalheModal
          ag={detalhe}
          onClose={() => setDetalhe(null)}
          onDone={() => { setDetalhe(null); router.refresh() }}
        />
      )}

      {criar && (
        <CriarModal
          profissional={criar.profissional}
          dia={dia}
          horaMin={criar.horaMin}
          servicos={servicos}
          unidadeId={unidadeId}
          onClose={() => setCriar(null)}
          onDone={() => { setCriar(null); router.refresh() }}
        />
      )}
    </>
  )
}

// ─────────────────────────── Detalhe (confirmar / cancelar) ───────────────────────────
function DetalheModal({ ag, onClose, onDone }: { ag: Agendamento; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const podeMudar = ag.status !== 'concluido' && ag.status !== 'cancelado'

  async function run(fn: () => Promise<ActionResult>) {
    setBusy(true); setErr('')
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Erro.'); return }
    onDone()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-head">
          <h3><i className="ti ti-calendar-event" /> Agendamento</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <Linha rotulo="Cliente" valor={ag.clienteNome || '—'} />
          <Linha rotulo="Profissional" valor={ag.profissionalNome || '—'} />
          <Linha rotulo="Serviço" valor={ag.servicoNome || '—'} />
          <Linha rotulo="Horário" valor={`${hhmm(minDoDia(ag.inicio))}${ag.fim ? '–' + hhmm(minDoDia(ag.fim)) : ''}`} />
          <Linha rotulo="Status" valor={rotuloStatus(ag.status)} />
          {ag.observacao && <Linha rotulo="Observação" valor={ag.observacao} />}

          {cancelando && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Motivo do cancelamento *</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginTop: 4 }}
                placeholder="Ex.: cliente desmarcou" />
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {!cancelando ? (
            <>
              <button className="btn" onClick={onClose}>Fechar</button>
              {podeMudar && (
                <>
                  <button className="btn" disabled={busy} onClick={() => setCancelando(true)}><i className="ti ti-x" /> Cancelar</button>
                  {ag.status !== 'confirmado' && (
                    <button className="btn btn-primary" disabled={busy} onClick={() => run(() => confirmarAgendamento(ag.id))}>
                      <i className="ti ti-check" /> {busy ? 'Confirmando…' : 'Confirmar'}
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={() => { setCancelando(false); setMotivo('') }}>Voltar</button>
              <button className="btn btn-primary" disabled={busy || !motivo.trim()} onClick={() => run(() => cancelarAgendamento(ag.id, motivo))}>
                {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
            </>
          )}
        </div>
      </div>
    </Overlay>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--text-3)' }}>{rotulo}</span>
      <b style={{ textAlign: 'right' }}>{valor}</b>
    </div>
  )
}

// ─────────────────────────── Criar agendamento ───────────────────────────
function CriarModal({
  profissional, dia, horaMin, servicos, unidadeId, onClose, onDone,
}: {
  profissional: Profissional; dia: string; horaMin: number; servicos: ServicoOpcao[]
  unidadeId: string | null; onClose: () => void; onDone: () => void
}) {
  const [hora, setHora] = useState(hhmm(horaMin))
  const [servicoId, setServicoId] = useState(servicos[0]?.id || '')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState(false) // sobreposição → exige confirmação

  // Autocomplete de cliente (busca server-side sobre 347k).
  const [termo, setTermo] = useState('')
  const [opcoes, setOpcoes] = useState<ClienteOpcao[]>([])
  const [cliente, setCliente] = useState<ClienteOpcao | null>(null)
  const [buscando, setBuscando] = useState(false)
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (cliente) return // já escolhido
    if (tRef.current) clearTimeout(tRef.current)
    const t = termo.trim()
    if (t.length < 2) { setOpcoes([]); return }
    tRef.current = setTimeout(async () => {
      setBuscando(true)
      const res = await buscarClientes(t, unidadeId)
      setBuscando(false)
      setOpcoes(res)
    }, 280)
    return () => { if (tRef.current) clearTimeout(tRef.current) }
  }, [termo, cliente, unidadeId])

  async function submit(forcar = false) {
    setErr(''); setSaving(true)
    const dur = servicos.find((s) => s.id === servicoId)?.duracao_min || 10
    const res = await criarAgendamento({
      unidade_id: unidadeId || '',
      profissional_id: profissional.perfilId || '',
      cliente_id: cliente?.id || '',
      servico_id: servicoId,
      inicio: `${dia}T${hora}`,
      duracao_min: dur,
      observacao: obs,
      forcar,
    })
    setSaving(false)
    if (!res.ok) {
      if (res.avisoSobreposicao) { setAviso(true); setErr(res.error || ''); return }
      setErr(res.error || 'Erro ao agendar.')
      return
    }
    onDone()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }

  return (
    <Overlay onClose={onClose}>
      <div className="modal" style={{ width: 460 }}>
        <div className="modal-head">
          <h3><i className="ti ti-calendar-plus" /> Novo agendamento</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            <i className="ti ti-user" /> {profissional.nome} · <i className="ti ti-calendar" /> {dataBR(`${dia}T12:00:00-03:00`)}
          </div>

          {/* Cliente (autocomplete) */}
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Cliente *</label>
            {cliente ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 8, marginTop: 4 }}>
                <span style={{ fontSize: 13 }}><b>{cliente.nome}</b>{cliente.telefone ? ` · ${cliente.telefone}` : ''}</span>
                <button className="btn" onClick={() => { setCliente(null); setTermo(''); setOpcoes([]) }} style={{ padding: '3px 8px' }}><i className="ti ti-x" /></button>
              </div>
            ) : (
              <>
                <input style={{ ...inp, marginTop: 4 }} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar por nome, telefone ou CPF…" autoFocus />
                {(buscando || opcoes.length > 0) && termo.trim().length >= 2 && (
                  <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 2, background: '#fff', border: '1px solid var(--line)', borderRadius: 8, maxHeight: 200, overflow: 'auto', boxShadow: 'var(--shadow-md)' }}>
                    {buscando && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--text-3)' }}>Buscando…</div>}
                    {!buscando && opcoes.length === 0 && <div style={{ padding: 10, fontSize: 12.5, color: 'var(--text-3)' }}>Nenhum cliente encontrado.</div>}
                    {!buscando && opcoes.map((o) => (
                      <button key={o.id} onClick={() => { setCliente(o); setOpcoes([]) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', fontSize: 13 }}>
                        <b>{o.nome}</b>{o.telefone ? <span style={{ color: 'var(--text-3)' }}> · {o.telefone}</span> : ''}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Horário *</label>
              <input type="time" step={300} style={{ ...inp, marginTop: 4 }} value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Serviço *</label>
              <select style={{ ...inp, marginTop: 4 }} value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
                <option value="">Selecione…</option>
                {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.duracao_min ? ` (${s.duracao_min}min)` : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Observação</label>
            <input style={{ ...inp, marginTop: 4 }} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
          </div>

          {err && <div className="modal-note" style={{ background: aviso ? 'var(--amber-bg, #FBEFD9)' : 'var(--red-bg)', color: aviso ? '#9A6700' : 'var(--red)', fontSize: 12.5 }}>{err}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          {aviso ? (
            <button className="btn btn-primary" disabled={saving} onClick={() => submit(true)}>{saving ? 'Salvando…' : 'Sobrepor e agendar'}</button>
          ) : (
            <button className="btn btn-primary" disabled={saving || !cliente || !servicoId} onClick={() => submit(false)}>{saving ? 'Salvando…' : 'Agendar'}</button>
          )}
        </div>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-ov open" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {children}
    </div>
  )
}
