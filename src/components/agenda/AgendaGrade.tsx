'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarAgendamento, confirmarAgendamento, cancelarAgendamento, buscarClientes,
  cadastrarClienteRapido, criarBloqueio, publicarEventoRede, excluirEventoRede,
  type ClienteOpcao, type ActionResult,
} from '@/app/(app)/agenda/actions'
import { dataBR } from '@/lib/fmt'
import {
  corEvento, EVT_TIPOS, EVT_AUDIENCIAS, AGENDA_CAP_SERVICOS, AGENDA_GAPS,
  type OcupacaoInfo,
} from '@/lib/agenda'

// ── Constantes da grade (espelham o legado: START=8h, END=20h, SLOT 36px) ──
const START = 8 * 60
const END = 20 * 60
const SLOT = 36

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
export type EventoRede = {
  id: string
  titulo: string
  tipo: string
  horaInicio: string | null
  horaFim: string | null
  link: string | null
  audiencia: string[]
}

export type AgGridProps = {
  dia: string
  diaPrev: string
  diaNext: string
  labelDia: string
  gap: number
  profissionais: Profissional[]
  agendamentos: Agendamento[]
  bloqueios: Bloqueio[]
  servicos: ServicoOpcao[]
  eventosRede: EventoRede[]
  ocupacao: OcupacaoInfo
  unidadeId: string | null
  podeAgendar: boolean
  podeGerenciarEventos: boolean
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
  const {
    dia, diaPrev, diaNext, labelDia, gap, profissionais, agendamentos, bloqueios,
    servicos, eventosRede, ocupacao, unidadeId, podeAgendar, podeGerenciarEventos,
  } = props
  const GAP = gap
  const ROWS = (END - START) / GAP

  const [mostrarEventos, setMostrarEventos] = useState(true)
  const [novoEvento, setNovoEvento] = useState(false)
  const [bloqueioPara, setBloqueioPara] = useState<{ profissional: Profissional | null; horaMin: number } | null>(null)

  // Colunas: cada profissional + uma coluna "Sem profissional" se houver agendamentos órfãos.
  const orfaos = agendamentos.some((a) => !a.profissionalPerfilId || !profissionais.some((p) => p.perfilId === a.profissionalPerfilId))
  const colunas = useMemo(() => {
    const base = profissionais.map((p) => ({ key: p.id, perfilId: p.perfilId, nome: p.nome, cargo: p.cargo }))
    if (orfaos) base.push({ key: COL_SEM_PROF, perfilId: null, nome: 'Sem profissional', cargo: null })
    return base
  }, [profissionais, orfaos])

  const nCols = colunas.length

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

  const gridCols = `64px repeat(${nCols}, minmax(120px, 1fr))`

  function iniciais(nome: string): string {
    return nome.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?'
  }

  function setGap(g: number) {
    router.push(`/agenda?d=${dia}&gap=${g}`)
  }

  return (
    <>
      {/* Barra de ocupação (agOcup) */}
      <OcupacaoBar o={ocupacao} />

      {/* Toolbar de dia */}
      <div className="agenda-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="day-nav">
          <button title="Dia anterior" onClick={() => router.push(`/agenda?d=${diaPrev}&gap=${GAP}`)}><i className="ti ti-chevron-left" /></button>
          <span className="day-label"><i className="ti ti-calendar" /> {labelDia}</span>
          <button title="Próximo dia" onClick={() => router.push(`/agenda?d=${diaNext}&gap=${GAP}`)}><i className="ti ti-chevron-right" /></button>
        </div>
        <label style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-calendar-event" />
          <input type="date" defaultValue={dia} onChange={(e) => { if (e.target.value) router.push(`/agenda?d=${e.target.value}&gap=${GAP}`) }}
            style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit' }} />
        </label>

        {/* Seletor de GAP por unidade (uniSetGap) */}
        <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-ruler-2" /> Intervalo
          <select value={GAP} onChange={(e) => setGap(Number(e.target.value))}
            style={{ padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, fontFamily: 'inherit', background: '#fff' }}>
            {AGENDA_GAPS.map((g) => <option key={g} value={g}>{g} min</option>)}
          </select>
        </label>

        {podeAgendar
          ? <span className="ag-hint" style={{ fontSize: 12, color: 'var(--text-3)' }}><i className="ti ti-hand-finger" /> Clique em um horário livre para agendar</span>
          : <span className="ag-hint" style={{ fontSize: 12, color: 'var(--text-3)' }}>Selecione uma unidade no topo para agendar</span>}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarEventos} onChange={(e) => setMostrarEventos(e.target.checked)} /> Mostrar eventos na agenda
          </label>
          {podeGerenciarEventos && (
            <button className="btn" onClick={() => setNovoEvento(true)}><i className="ti ti-calendar-star" /> Novo evento</button>
          )}
          <button className="btn btn-ghost" title="Atualizar" onClick={() => router.refresh()}><i className="ti ti-refresh" /></button>
        </div>
      </div>

      {/* Banda de eventos da rede (redeBand) */}
      {mostrarEventos && eventosRede.length > 0 && (
        <div className="rede-band" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {eventosRede.map((e) => {
            const [cor, ic] = corEvento(e.tipo)
            return (
              <div key={e.id} className="rede-band-item"
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '7px 11px', borderRadius: 8, background: `${cor}14`, borderLeft: `3px solid ${cor}` }}>
                <i className={`ti ${ic}`} style={{ color: cor }} />
                <b style={{ color: cor }}>{e.horaInicio || ''}{e.horaFim ? `–${e.horaFim}` : ''}</b>
                <span>{e.titulo}</span>
                {e.link && <span style={{ color: 'var(--brand-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}><i className="ti ti-link" /> {e.link}</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {e.audiencia.map((a) => <span key={a} style={{ fontSize: 10.5, background: 'var(--surface-2)', color: 'var(--text-3)', padding: '1px 7px', borderRadius: 12 }}>{a}</span>)}
                  {podeGerenciarEventos && (
                    <button className="btn btn-ghost" title="Remover evento" onClick={() => excluirEventoRede(e.id).then(() => router.refresh())} style={{ padding: '2px 6px' }}><i className="ti ti-trash" style={{ color: 'var(--red)' }} /></button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

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
                        <div key={b.id} className="evt block" style={{ top, height: h - 3 }}
                          title={`${b.nome} · Bloqueio de horário — edição restrita aos administradores`}
                          onClick={(e) => { e.stopPropagation(); alert(`Bloqueio de horário · ${b.nome}\nClique em Configurações para editar (restrito aos administradores).`) }}>
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
                          onClick={(e) => {
                            e.stopPropagation()
                            if (lock) { alert('Atendimento finalizado — edição restrita aos administradores.'); return }
                            setDetalhe(a)
                          }}
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
          podeBloquear={podeGerenciarEventos}
          onClose={() => setCriar(null)}
          onDone={() => { setCriar(null); router.refresh() }}
          onBloqueio={(horaMin) => { setCriar(null); setBloqueioPara({ profissional: criar.profissional, horaMin }) }}
        />
      )}

      {novoEvento && (
        <EventoModal dia={dia} onClose={() => setNovoEvento(false)} onDone={() => { setNovoEvento(false); router.refresh() }} />
      )}

      {bloqueioPara && (
        <BloqueioModal
          profissional={bloqueioPara.profissional}
          dia={dia}
          horaMin={bloqueioPara.horaMin}
          unidadeId={unidadeId}
          onClose={() => setBloqueioPara(null)}
          onDone={() => { setBloqueioPara(null); router.refresh() }}
        />
      )}
    </>
  )
}

// ─────────────────────────── Barra de ocupação (agOcup) ───────────────────────────
function OcupacaoBar({ o }: { o: OcupacaoInfo }) {
  if (!o || o.nProf === 0) return null
  return (
    <div className="rel-card" style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', borderLeft: `4px solid ${o.cor}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ textAlign: 'center', minWidth: 64 }}>
          <div style={{ fontSize: 27, fontWeight: 800, color: o.cor, lineHeight: 1 }}>{o.pct}%</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>preenchida</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <b>{o.agendados}</b> agendamentos hoje · meta com sobreposição: <b>{o.alvo}</b> <span style={{ color: 'var(--text-3)' }}>({o.nProf} profissionais × {o.horas}h ÷ 30min, +45% de faltas)</span>.<br />
          <span style={{ color: 'var(--text-3)' }}>Como ~45% dos agendamentos faltam, faça <b>sobreposição</b> para ocupar o tempo ocioso — faltam <b>{o.faltam}</b> para a meta.</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 160, maxWidth: 340 }}>
        <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, o.pct)}%`, background: o.cor, transition: '.4s' }} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── Detalhe (confirmar / cancelar) ───────────────────────────
function DetalheModal({ ag, onClose, onDone }: { ag: Agendamento; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const podeMudar = ag.status !== 'concluido' && ag.status !== 'cancelado'
  const podeConfirmar = ag.status === 'aberto' // só "agendado" pode confirmar (regra do legado)

  async function run(fn: () => Promise<ActionResult>) {
    setBusy(true); setErr('')
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Erro.'); return }
    onDone()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="modal" style={{ width: 440 }}>
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
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {!cancelando ? (
            <>
              <button className="btn" onClick={onClose}>Fechar</button>
              {podeMudar && (
                <>
                  <button className="btn" disabled={busy} onClick={() => setCancelando(true)}><i className="ti ti-x" /> Cancelar</button>
                  {podeConfirmar && (
                    <>
                      <button className="btn" disabled={busy} onClick={() => run(() => confirmarAgendamento(ag.id, true))}
                        style={{ borderColor: '#0f6b3a', color: '#0f6b3a' }}>
                        <i className="ti ti-brand-whatsapp" /> Cliente confirmou
                      </button>
                      <button className="btn btn-primary" disabled={busy} onClick={() => run(() => confirmarAgendamento(ag.id, false))}>
                        <i className="ti ti-circle-check" /> {busy ? 'Confirmando…' : 'Confirmar agendamento'}
                      </button>
                    </>
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
const AVALIACAO: ServicoOpcao = { id: '__avaliacao__', nome: 'Avaliação', duracao_min: 30 }

function CriarModal({
  profissional, dia, horaMin, servicos, unidadeId, podeBloquear, onClose, onDone, onBloqueio,
}: {
  profissional: Profissional; dia: string; horaMin: number; servicos: ServicoOpcao[]
  unidadeId: string | null; podeBloquear: boolean; onClose: () => void; onDone: () => void
  onBloqueio: (horaMin: number) => void
}) {
  const [hora, setHora] = useState(hhmm(horaMin))
  // Múltiplos serviços (legado addServico). Avaliação (30min) é sempre a 1ª opção.
  const opcoesServico = useMemo(() => [AVALIACAO, ...servicos], [servicos])
  const [linhasServico, setLinhasServico] = useState<string[]>([opcoesServico[0]?.id || ''])
  const [obs, setObs] = useState('')
  const [viaSac, setViaSac] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [aviso, setAviso] = useState(false) // sobreposição → exige confirmação

  // Recorrência (legado recBox).
  const [recOn, setRecOn] = useState(false)
  const [recInt, setRecInt] = useState(1)
  const [recUni, setRecUni] = useState<'semana' | 'mes'>('semana')
  const [recVezes, setRecVezes] = useState(4)

  // Autocomplete de cliente (busca server-side sobre 347k).
  const [termo, setTermo] = useState('')
  const [opcoes, setOpcoes] = useState<ClienteOpcao[]>([])
  const [cliente, setCliente] = useState<ClienteOpcao | null>(null)
  const [buscando, setBuscando] = useState(false)
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cadastro rápido (legado quickReg).
  const [quickOpen, setQuickOpen] = useState(false)
  const [qTel, setQTel] = useState('')
  const [qEmail, setQEmail] = useState('')
  const [qSaving, setQSaving] = useState(false)

  useEffect(() => {
    if (cliente) return
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

  // Soma das durações + cap de 60min (legado apptRecalc).
  const somaMin = linhasServico.reduce((s, id) => s + (opcoesServico.find((o) => o.id === id)?.duracao_min || 0), 0)
  const ocupaMin = Math.min(somaMin, AGENDA_CAP_SERVICOS)
  const capped = somaMin > AGENDA_CAP_SERVICOS

  function setServico(idx: number, id: string) {
    setLinhasServico((arr) => arr.map((v, i) => (i === idx ? id : v)))
  }
  function addServico() { setLinhasServico((arr) => [...arr, opcoesServico[0]?.id || '']) }
  function rmServico(idx: number) { setLinhasServico((arr) => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr) }

  async function quickRegSubmit() {
    if (termo.trim().length < 2) { setErr('Informe o nome do cliente para o cadastro rápido.'); return }
    setQSaving(true); setErr('')
    const r = await cadastrarClienteRapido({ nome: termo.trim(), telefone: qTel, email: qEmail, unidade_id: unidadeId })
    setQSaving(false)
    if (!r.ok || !r.novoClienteId) { setErr(r.error || 'Erro ao cadastrar cliente.'); return }
    setCliente({ id: r.novoClienteId, nome: termo.trim(), telefone: qTel || null })
    setQuickOpen(false); setOpcoes([])
  }

  async function submit(forcar = false) {
    setErr(''); setSaving(true)
    const idsValidos = linhasServico.filter((id) => id && id !== AVALIACAO.id)
    const servicoId = idsValidos[0] || ''
    // Se só houver "Avaliação" (serviço sintético), não há servico_id real — exige um serviço de catálogo.
    if (!servicoId) {
      setSaving(false)
      setErr('Selecione ao menos um serviço do catálogo (Avaliação é apenas estimativa de tempo).')
      return
    }
    const res = await criarAgendamento({
      unidade_id: unidadeId || '',
      profissional_id: profissional.perfilId || '',
      cliente_id: cliente?.id || '',
      servico_id: servicoId,
      servico_ids_extra: idsValidos.slice(1),
      inicio: `${dia}T${hora}`,
      duracao_min: ocupaMin || undefined,
      observacao: obs,
      via_sac: viaSac,
      recorrencia: recOn ? { intervalo: recInt, unidade: recUni, vezes: recVezes } : undefined,
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
  const servSel: React.CSSProperties = { ...inp, padding: '8px 10px' }

  return (
    <Overlay onClose={onClose}>
      <div className="modal" style={{ width: 480, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <h3><i className="ti ti-calendar-plus" /> Novo agendamento</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12, overflow: 'auto' }}>
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
                {(buscando || opcoes.length > 0) && termo.trim().length >= 2 && !quickOpen && (
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
                {/* Cadastro rápido (quickReg) */}
                <span className="mini-link" onClick={() => setQuickOpen((v) => !v)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--brand-500)', cursor: 'pointer' }}>
                  <i className="ti ti-user-plus" /> Não está cadastrado? Fazer cadastro rápido
                </span>
                {quickOpen && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, padding: 10, border: '1px dashed var(--line)', borderRadius: 8 }}>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 600 }}>Telefone</label>
                      <input style={{ ...inp, marginTop: 3 }} value={qTel} onChange={(e) => setQTel(e.target.value)} placeholder="+55 (00) 00000-0000" />
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 600 }}>E-mail</label>
                      <input style={{ ...inp, marginTop: 3 }} value={qEmail} onChange={(e) => setQEmail(e.target.value)} placeholder="email@exemplo.com" />
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" disabled={qSaving || termo.trim().length < 2} onClick={quickRegSubmit} style={{ padding: '6px 12px' }}>
                        {qSaving ? 'Cadastrando…' : 'Cadastrar e usar'}
                      </button>
                    </div>
                    <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-3)' }}>Usa o nome digitado acima.</div>
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Horário *</label>
            <input type="time" step={300} style={{ ...inp, marginTop: 4, width: 140 }} value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>

          {/* Serviços (múltiplos) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Serviços <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>· Avaliação é sempre a 1ª opção</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {linhasServico.map((id, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6 }}>
                  <select style={servSel} value={id} onChange={(e) => setServico(idx, e.target.value)}>
                    {opcoesServico.map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.duracao_min} min)</option>)}
                  </select>
                  {linhasServico.length > 1 && (
                    <button className="btn" onClick={() => rmServico(idx)} style={{ padding: '4px 9px' }}><i className="ti ti-x" /></button>
                  )}
                </div>
              ))}
            </div>
            <span className="mini-link" onClick={addServico} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: 'var(--brand-500)', cursor: 'pointer' }}>
              <i className="ti ti-plus" /> Adicionar serviço
            </span>
            <div style={{ marginTop: 8, fontSize: 12.5, background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-2)' }}>
              <i className="ti ti-clock" style={{ color: 'var(--brand-500)' }} /> Tempo dos serviços: <b>{somaMin} min</b> · ocupa <b>{ocupaMin} min</b> na agenda.
              {capped && <b style={{ color: 'var(--amber)' }}> ⚠ Acima de 1h — limitado a 60 min.</b>}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Observação</label>
            <textarea rows={3} style={{ ...inp, marginTop: 4, resize: 'vertical' }} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações sobre o atendimento…" />
          </div>

          {/* Recorrência */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={recOn} onChange={(e) => setRecOn(e.target.checked)} /> Agendamento recorrente
            </label>
            {recOn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, flexWrap: 'wrap' }}>
                Repetir a cada
                <input type="number" min={1} value={recInt} onChange={(e) => setRecInt(Math.max(1, Number(e.target.value) || 1))} style={{ ...inp, width: 58 }} />
                <select value={recUni} onChange={(e) => setRecUni(e.target.value as 'semana' | 'mes')} style={{ ...inp, width: 'auto' }}>
                  <option value="semana">semana(s)</option>
                  <option value="mes">mês(es)</option>
                </select>
                por
                <input type="number" min={1} value={recVezes} onChange={(e) => setRecVezes(Math.max(1, Number(e.target.value) || 1))} style={{ ...inp, width: 58 }} />
                vezes
              </div>
            )}
          </div>

          {/* Campos customizados */}
          <div style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text-3)', marginBottom: 6 }}>Campos Customizados</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--blue)', fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={viaSac} onChange={(e) => setViaSac(e.target.checked)} /> Agendou pelo SAC?
            </label>
          </div>

          {err && <div className="modal-note" style={{ background: aviso ? 'var(--amber-bg, #FBEFD9)' : 'var(--red-bg)', color: aviso ? '#9A6700' : 'var(--red)', fontSize: 12.5 }}>{err}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button className="btn" onClick={onClose}><i className="ti ti-arrow-left" /> Voltar</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {podeBloquear && (
              <button className="btn" onClick={() => onBloqueio(horaMin)}><i className="ti ti-calendar-off" /> Criar bloqueio</button>
            )}
            {aviso ? (
              <button className="btn btn-primary" disabled={saving} onClick={() => submit(true)}>{saving ? 'Salvando…' : 'Sobrepor e agendar'}</button>
            ) : (
              <button className="btn btn-primary" disabled={saving || !cliente} onClick={() => submit(false)}><i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar'}</button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────── Criar bloqueio ───────────────────────────
function BloqueioModal({
  profissional, dia, horaMin, unidadeId, onClose, onDone,
}: {
  profissional: Profissional | null; dia: string; horaMin: number; unidadeId: string | null
  onClose: () => void; onDone: () => void
}) {
  const [nome, setNome] = useState('')
  const [ini, setIni] = useState(hhmm(horaMin))
  const [fim, setFim] = useState(hhmm(Math.min(END, horaMin + 60)))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setSaving(true); setErr('')
    const r = await criarBloqueio({
      unidade_id: unidadeId || '',
      profissional_id: profissional?.perfilId || null,
      dia, hora_inicio: ini, hora_fim: fim, nome,
    })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao criar bloqueio.'); return }
    onDone()
  }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }

  return (
    <Overlay onClose={onClose}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-head">
          <h3><i className="ti ti-calendar-off" /> Criar bloqueio</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{profissional ? <><i className="ti ti-user" /> {profissional.nome}</> : 'Bloqueio geral da unidade'} · {dataBR(`${dia}T12:00:00-03:00`)}</div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Motivo</label>
            <input style={{ ...inp, marginTop: 4 }} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: almoço, manutenção" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Início *</label><input type="time" step={300} style={{ ...inp, marginTop: 4 }} value={ini} onChange={(e) => setIni(e.target.value)} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Fim *</label><input type="time" step={300} style={{ ...inp, marginTop: 4 }} value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12.5 }}>{err}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Salvando…' : 'Criar bloqueio'}</button>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────── Novo evento da rede ───────────────────────────
function EventoModal({ dia, onClose, onDone }: { dia: string; onClose: () => void; onDone: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState(EVT_TIPOS[0])
  const [data, setData] = useState(dia)
  const [ini, setIni] = useState('14:00')
  const [fim, setFim] = useState('15:00')
  const [link, setLink] = useState('')
  const [audiencia, setAudiencia] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function toggleAudi(a: string) {
    setAudiencia((arr) => arr.includes(a) ? arr.filter((x) => x !== a) : [...arr, a])
  }
  async function submit() {
    setSaving(true); setErr('')
    const r = await publicarEventoRede({ titulo, tipo, data, hora_inicio: ini, hora_fim: fim, link, audiencia })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao publicar evento.'); return }
    onDone()
  }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }

  return (
    <Overlay onClose={onClose}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-head">
          <h3><i className="ti ti-calendar-star" /> Novo evento da rede</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Assunto *</label>
            <input style={{ ...inp, marginTop: 4 }} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Treinamento de protocolo" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Tipo</label>
              <select style={{ ...inp, marginTop: 4 }} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {EVT_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Data</label>
              <input type="date" style={{ ...inp, marginTop: 4 }} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Início</label><input type="time" style={{ ...inp, marginTop: 4 }} value={ini} onChange={(e) => setIni(e.target.value)} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Fim</label><input type="time" style={{ ...inp, marginTop: 4 }} value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Link ou local</label>
            <input style={{ ...inp, marginTop: 4 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… ou endereço presencial" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>Direcionamento *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {EVT_AUDIENCIAS.map((a) => (
                <label key={a} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 10px' }}>
                  <input type="checkbox" checked={audiencia.includes(a)} onChange={() => toggleAudi(a)} /> {a}
                </label>
              ))}
            </div>
          </div>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)', fontSize: 12.5 }}>{err}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={submit}><i className="ti ti-calendar-star" /> {saving ? 'Publicando…' : 'Publicar na agenda'}</button>
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
