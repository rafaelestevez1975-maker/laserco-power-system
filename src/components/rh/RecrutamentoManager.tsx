'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { moverCandidato, iniciarProcesso, atualizarNotas, criarCurriculo, avisarDisponibilidade, definirScore, type NovoCurriculo } from '@/app/(app)/rh/recrutamento/actions'
import { waHref, dataBR } from '@/lib/fmt'

export type Candidato = {
  id: string; nome: string; email: string | null; telefone: string | null; cpf: string | null
  fonte: string; estagio: string; score: number | null; notas: string | null; motivoReprovacao: string | null
  criado: string; cargo: string; vagaTitulo: string | null; unidade: string | null; cidade: string | null; estado: string | null
}

const ESTAGIOS: { id: string; label: string; cor: string }[] = [
  { id: 'triagem', label: 'Triagem', cor: 'var(--text-3)' },
  { id: 'entrevista_rh', label: 'Entrevista RH', cor: 'var(--blue)' },
  { id: 'teste_tecnico', label: 'Teste Técnico', cor: 'var(--amber)' },
  { id: 'entrevista_gestor', label: 'Entrevista Gestor', cor: 'var(--brand-500)' },
  { id: 'proposta', label: 'Proposta', cor: 'var(--gold-600)' },
  { id: 'contratado', label: 'Contratado', cor: 'var(--green)' },
  { id: 'reprovado', label: 'Reprovado', cor: 'var(--red)' },
]
const LABEL: Record<string, string> = Object.fromEntries(ESTAGIOS.map((e) => [e.id, e.label]))
const COR: Record<string, string> = Object.fromEntries(ESTAGIOS.map((e) => [e.id, e.cor]))
const EM_PROCESSO = new Set(['entrevista_rh', 'teste_tecnico', 'entrevista_gestor', 'proposta'])
const DRAG_OFF = new Set(['contratado', 'reprovado'])
const FONTE_LABEL: Record<string, string> = { portal: 'Site', whatsapp: 'WhatsApp', indicacao: 'Indicação', linkedin: 'LinkedIn', outro: 'Outro' }

// waHref e dataBR vêm de @/lib/fmt (DRY — ver docs/CONSOLIDACAO.md D3/D4)

function Kpis({ items }: { items: [string, string, string][] }) {
  return <div className="rel-kpis">{items.map(([l, v, ic]) => (
    <div className="rel-kpi" key={l}><div className="rk-ic"><i className={`ti ${ic}`} /></div><div><div className="rk-v">{v}</div><div className="rk-l">{l}</div></div></div>
  ))}</div>
}
function Bars({ rows, gold }: { rows: [string, number][]; gold?: boolean }) {
  const total = rows.reduce((a, r) => a + r[1], 0) || 1
  const max = Math.max(1, ...rows.map((r) => r[1]))
  if (!rows.length) return <div className="muted" style={{ padding: 8 }}>Sem dados.</div>
  return <>{rows.map(([lbl, v]) => (
    <div className="bar-row" key={lbl}>
      <span className="bar-lbl" title={lbl}>{lbl}</span>
      <div className="bar-track"><div className={`bar-fill ${gold ? 'g' : ''}`} style={{ width: `${Math.round((v / max) * 100)}%` }} /></div>
      <span className="bar-val">{v} <b style={{ color: 'var(--brand-500)' }}>({Math.round((v / total) * 1000) / 10}%)</b></span>
    </div>
  ))}</>
}
function EstagioPill({ e }: { e: string }) {
  return <span style={{ background: `color-mix(in srgb, ${COR[e]} 16%, transparent)`, color: COR[e], fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>{LABEL[e] || e}</span>
}

export function RecrutamentoManager({ candidatos, isAdmin }: { candidatos: Candidato[]; isAdmin: boolean }) {
  const router = useRouter()
  const [view, setView] = useState<'curriculos' | 'kanban'>('curriculos')
  const [cands, setCands] = useState<Candidato[]>(candidatos)
  const [fil, setFil] = useState({ busca: '', cargo: 'Todos', estado: 'Todos', fonte: 'Todos', estagio: 'Todos' })
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState(false)
  const [notasDe, setNotasDe] = useState<Candidato | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => setCands(candidatos), [candidatos])

  const cargos = useMemo(() => Array.from(new Set(cands.map((c) => c.cargo).filter(Boolean))).sort(), [cands])
  const estados = useMemo(() => Array.from(new Set(cands.map((c) => c.estado).filter(Boolean))).sort() as string[], [cands])

  const filtrados = useMemo(() => {
    const q = fil.busca.trim().toLowerCase()
    return cands.filter((c) =>
      (!q || c.nome.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.telefone || '').includes(q)) &&
      (fil.cargo === 'Todos' || c.cargo === fil.cargo) &&
      (fil.estado === 'Todos' || c.estado === fil.estado) &&
      (fil.fonte === 'Todos' || c.fonte === fil.fonte) &&
      (fil.estagio === 'Todos' || c.estagio === fil.estagio)
    )
  }, [cands, fil])

  const total = filtrados.length
  const emTriagem = filtrados.filter((c) => c.estagio === 'triagem').length
  const emProcesso = filtrados.filter((c) => EM_PROCESSO.has(c.estagio)).length
  const contratados = filtrados.filter((c) => c.estagio === 'contratado').length

  const porCargo = useMemo(() => tally(filtrados.map((c) => c.cargo)), [filtrados])
  const porEstado = useMemo(() => tally(filtrados.map((c) => c.estado || '')), [filtrados])
  const porFonte = useMemo(() => tally(filtrados.map((c) => FONTE_LABEL[c.fonte] || c.fonte)), [filtrados])

  function optimistic(id: string, estagio: string) { setCands((p) => p.map((c) => (c.id === id ? { ...c, estagio } : c))) }

  async function mover(id: string, estagio: string, motivo?: string) {
    const before = cands
    optimistic(id, estagio)
    const r = await moverCandidato(id, estagio as never, motivo)
    if (!r.ok) { setCands(before); setMsg(r.error || 'Erro ao mover.') } else router.refresh()
  }
  async function iniciar(id: string) {
    setMsg(''); const before = cands; optimistic(id, 'entrevista_rh')
    const r = await iniciarProcesso(id)
    if (!r.ok) { setCands(before); setMsg(r.error || 'Erro.') } else { setMsg('Processo iniciado  candidato movido para Entrevista RH.'); router.refresh() }
  }
  function reprovar(id: string) {
    const motivo = window.prompt('Motivo da reprovação (aparece no currículo):', '')
    if (motivo === null) return
    mover(id, 'reprovado', motivo)
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id); const destino = e.over ? String(e.over.id) : null
    if (!destino) return
    const c = cands.find((x) => x.id === id)
    if (!c || c.estagio === destino) return
    if (destino === 'reprovado') { reprovar(id); return }
    mover(id, destino)
  }

  return (
    <>
      <div className="rel-legend">
        <b>Banco de talentos</b>  todo currículo (site, WhatsApp, indicação, manual) cai aqui. O recrutador <b>filtra</b> e só então
        <b> inicia o processo</b> de um candidato (entra no Kanban). Cada franquia vê os currículos da sua unidade; a franqueadora vê todos.
      </div>

      <div className="rel-tabs" style={{ marginBottom: 14 }}>
        <div className={`rel-tab ${view === 'curriculos' ? 'active' : ''}`} onClick={() => setView('curriculos')}><i className="ti ti-id-badge-2" /> Currículos ({cands.length})</div>
        <div className={`rel-tab ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}><i className="ti ti-layout-kanban" /> Kanban (processo)</div>
      </div>

      <Kpis items={[
        ['Currículos', String(total), 'ti-id-badge-2'],
        ['Em triagem', String(emTriagem), 'ti-inbox'],
        ['Em processo', String(emProcesso), 'ti-progress'],
        ['Contratados', String(contratados), 'ti-user-check'],
        ['Conversão', (total ? Math.round((contratados / total) * 100) : 0) + '%', 'ti-percentage'],
      ]} />

      <div className="rel-card" style={{ margin: '0 0 14px' }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-filter flt" /> Filtros</span>
          {msg && <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</span>}
        </div>
        <div className="rel-filgrid" style={{ marginTop: 12 }}>
          <div className="rf"><label>Buscar</label><input value={fil.busca} onChange={(e) => setFil((f) => ({ ...f, busca: e.target.value }))} placeholder="nome, e-mail, telefone" /></div>
          <div className="rf"><label>Cargo/função</label><select value={fil.cargo} onChange={(e) => setFil((f) => ({ ...f, cargo: e.target.value }))}><option>Todos</option>{cargos.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="rf"><label>Estado</label><select value={fil.estado} onChange={(e) => setFil((f) => ({ ...f, estado: e.target.value }))}><option>Todos</option>{estados.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="rf"><label>Fonte</label><select value={fil.fonte} onChange={(e) => setFil((f) => ({ ...f, fonte: e.target.value }))}><option>Todos</option>{Object.keys(FONTE_LABEL).map((c) => <option key={c} value={c}>{FONTE_LABEL[c]}</option>)}</select></div>
          <div className="rf"><label>Estágio</label><select value={fil.estagio} onChange={(e) => setFil((f) => ({ ...f, estagio: e.target.value }))}><option>Todos</option>{ESTAGIOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        </div>
      </div>

      <div className="rel-acts" style={{ justifyContent: 'flex-end', margin: '-4px 0 14px' }}>
        <button className="btn btn-primary" onClick={() => setNovo(true)}><i className="ti ti-plus" /> Novo currículo</button>
      </div>

      {view === 'curriculos' ? (
        <>
          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <div className="dash-w"><h4><i className="ti ti-briefcase" /> Por cargo/função</h4><Bars rows={porCargo} /></div>
            <div className="dash-w"><h4><i className="ti ti-map-pin" /> Por estado</h4><Bars rows={porEstado} gold /></div>
            <div className="dash-w"><h4><i className="ti ti-broadcast" /> Por fonte</h4><Bars rows={porFonte} /></div>
          </div>

          <div className="cli-card"><div className="cli-scroll">
            <table className="cli-table">
              <thead><tr><th>Candidato</th><th>Cargo</th><th>Local</th><th>Fonte</th><th>Estágio</th><th>Entrada</th><th>Ações</th></tr></thead>
              <tbody>
                {filtrados.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>Nenhum currículo neste filtro.</td></tr>}
                {filtrados.map((c) => {
                  const wa = waHref(c.telefone)
                  return (
                    <tr key={c.id}>
                      <td><span className="cli-name">{c.nome}</span><div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {c.telefone && <span>{c.telefone}</span>}{c.email && <span>· {c.email}</span>}
                      </div></td>
                      <td>{c.cargo}</td>
                      <td style={{ fontSize: 12.5 }}>{[c.cidade, c.estado].filter(Boolean).join(' / ') || c.unidade || ''}</td>
                      <td><span className="orig-tag" style={{ fontSize: 10.5 }}>{FONTE_LABEL[c.fonte] || c.fonte}</span></td>
                      <td><EstagioPill e={c.estagio} />{c.estagio === 'reprovado' && c.motivoReprovacao && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{c.motivoReprovacao}</div>}</td>
                      <td style={{ fontSize: 12.5 }}>{dataBR(c.criado)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.estagio === 'triagem'
                          ? <span className="os-link" onClick={() => iniciar(c.id)}><i className="ti ti-player-play" /> Iniciar processo</span>
                          : <span className="os-link" onClick={() => setView('kanban')}><i className="ti ti-layout-kanban" /> No kanban</span>}
                        {' · '}<span className="os-link" onClick={() => setNotasDe(c)}>Notas</span>
                        {wa && <> · <a href={wa} target="_blank" rel="noopener" className="os-link"><i className="ti ti-brand-whatsapp" /></a></>}
                        {!DRAG_OFF.has(c.estagio) && <> · <span className="os-link" style={{ color: 'var(--red)' }} onClick={() => reprovar(c.id)}>Reprovar</span></>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div></div>
        </>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="kanban">
            {ESTAGIOS.map((et) => (
              <Coluna key={et.id} etapa={et} candidatos={filtrados.filter((c) => c.estagio === et.id)} onIniciar={iniciar} />
            ))}
          </div>
        </DndContext>
      )}

      {novo && <NovoCurriculoModal onClose={() => setNovo(false)} onSaved={() => { setNovo(false); router.refresh() }} />}
      {notasDe && <NotasModal candidato={notasDe} onClose={() => setNotasDe(null)} onSaved={() => { setNotasDe(null); router.refresh() }} />}
    </>
  )
}

function tally(arr: (string | null | undefined)[]): [string, number][] {
  const o: Record<string, number> = {}
  arr.forEach((x) => { const k = (x || '') as string; o[k] = (o[k] ?? 0) + 1 })
  return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12) as [string, number][]
}

function Coluna({ etapa, candidatos, onIniciar }: { etapa: { id: string; label: string; cor: string }; candidatos: Candidato[]; onIniciar: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  return (
    <div className="kan-col">
      <div className="kan-head"><span className="dot" style={{ background: etapa.cor }} /><span className="t">{etapa.label}</span><span className="cnt">{candidatos.length}</span></div>
      <div className="kan-sum">{etapa.id === 'triagem' ? 'novos currículos' : 'no estágio'}</div>
      <div ref={setNodeRef} className="kan-body" style={isOver ? { outline: '2px dashed var(--brand-400)', outlineOffset: -4, borderRadius: 8 } : undefined}>
        {candidatos.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}></div>}
        {candidatos.map((c) => <CardCand key={c.id} c={c} onIniciar={onIniciar} />)}
      </div>
    </div>
  )
}

function CardCand({ c, onIniciar }: { c: Candidato; onIniciar: (id: string) => void }) {
  const disabled = DRAG_OFF.has(c.estagio)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id, disabled })
  const wa = waHref(c.telefone)
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1, cursor: disabled ? 'default' : 'grab',
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="lead-card">
      <div className="lc-top"><span className="lc-name">{c.nome}</span>{c.score != null && <span className="lc-temp">{c.score}%</span>}</div>
      <div className="lc-serv">{c.cargo}{c.cidade ? ` · ${c.cidade}` : ''}</div>
      <div className="lc-meta">
        <span className="orig-tag" style={{ fontSize: 10 }}>{FONTE_LABEL[c.fonte] || c.fonte}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {c.estagio === 'triagem' && <button className="btn" style={{ padding: '2px 7px', fontSize: 11 }} onClick={() => onIniciar(c.id)} onPointerDown={(e) => e.stopPropagation()}>Iniciar</button>}
          {wa && <a href={wa} target="_blank" rel="noopener" className="wa-link" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}><i className="ti ti-brand-whatsapp wa" /></a>}
        </span>
      </div>
    </div>
  )
}

function NotasModal({ candidato, onClose, onSaved }: { candidato: Candidato; onClose: () => void; onSaved: () => void }) {
  const [txt, setTxt] = useState(candidato.notas || '')
  const [score, setScore] = useState(candidato.score != null ? String(candidato.score) : '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function salvar() {
    setBusy(true); setMsg('')
    const r = await atualizarNotas(candidato.id, txt)
    const sc = score.trim()
    if (r.ok && sc !== '' && Number(sc) !== (candidato.score ?? -1)) await definirScore(candidato.id, Number(sc))
    setBusy(false)
    if (r.ok) onSaved(); else setMsg(r.error || 'Erro ao salvar.')
  }
  async function avisar() {
    if (!window.confirm('Enviar mensagem de disponibilidade por WhatsApp para este candidato?')) return
    setBusy(true); setMsg('')
    const r = await avisarDisponibilidade(candidato.id)
    setBusy(false)
    setMsg(r.ok ? '✓ Mensagem enviada por WhatsApp. A nota foi registrada.' : (r.error || 'Erro ao enviar.'))
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-head"><h3><i className="ti ti-notes" /> {candidato.nome}</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'block' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10 }}>{candidato.cargo} · {[candidato.cidade, candidato.estado].filter(Boolean).join('/') || ''} · <EstagioPill e={candidato.estagio} /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="mf" style={{ maxWidth: 160 }}><label>Nota de triagem (0–100)</label>
              <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} placeholder="ex.: 80" />
            </div>
            {candidato.telefone && (
              <button type="button" className="btn" disabled={busy} onClick={avisar} title="Enviar disponibilidade por WhatsApp (precisa de canal conectado)">
                <i className="ti ti-brand-whatsapp" /> Avisar disponibilidade
              </button>
            )}
          </div>
          <div className="mf"><label>Andamento / notas (espelhado no currículo)</label>
            <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={6} placeholder="Ex.: não está disponível, não quer shopping, mora longe…" />
          </div>
          {msg && <p style={{ fontSize: 12.5, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)', marginTop: 8 }}>{msg}</p>}
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Fechar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
      </div>
    </div>
  )
}

function NovoCurriculoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<NovoCurriculo>({ nome: '', email: '', telefone: '', cargo: '', fonte: 'outro', notas: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  function salvar() {
    setErr(''); if (!f.nome?.trim()) { setErr('Informe o nome.'); return }
    setBusy(true); criarCurriculo(f).then((r) => { setBusy(false); if (r.ok) onSaved(); else setErr(r.error || 'Erro.') })
  }
  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-head"><h3><i className="ti ti-user-plus" /> Novo currículo</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div className="mf"><label>Nome</label><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Nome do candidato" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Telefone (WhatsApp)</label><input value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="(11) 99999-9999" /></div>
            <div className="mf"><label>E-mail</label><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Cargo/função</label><input value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} placeholder="vendedor, recepcionista, aplicador…" /></div>
            <div className="mf"><label>Fonte</label><select value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })}>{Object.keys(FONTE_LABEL).map((k) => <option key={k} value={k}>{FONTE_LABEL[k]}</option>)}</select></div>
          </div>
          <div className="mf"><label>Notas</label><textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={3} /></div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Cadastrar'}</button></div>
      </div>
    </div>
  )
}
