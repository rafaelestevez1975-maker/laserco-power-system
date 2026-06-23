'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { abrirChamado, carregarThread, responderChamado, finalizarChamado, assumirChamado, type ChamadoForm, type MensagemRow } from '@/app/(app)/chamados/actions'

export type Chamado = {
  id: string; numero: number; assunto: string; etiqueta: string
  de: string; para: string; prioridade: 'normal' | 'importante' | 'urgente'
  responsavel: string; abertoPor: string; finalizado: boolean; abertoEm: string
  descricao: string; box: 'recebidos' | 'enviados'
}

const PERIODOS = ['Hoje', 'Ontem', 'Semana passada', 'Últimos 30 dias', 'Mês atual', 'Mês passado', 'Este ano', 'Período…']
const PARTES = ['Comercial', 'Marketing', 'Financeiro', 'Operações', 'SAC', 'Expansão', 'RH', 'Área Técnica']
const ETIQUETAS = ['Solicitação', 'Suporte', 'Financeiro', 'Implantação', 'Projeto', 'Expansão']
const DEPTS = ['Todos', ...PARTES]
const TAGS_FILTRO = ['Todos', ...ETIQUETAS]
const PRIO_LABEL: Record<string, string> = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' }
const PRIO_ICON: Record<string, string> = { normal: 'ti-info-circle', importante: 'ti-alert-triangle', urgente: 'ti-urgent' }
const PRIO_COR: Record<string, string> = { normal: 'var(--blue)', importante: 'var(--amber)', urgente: 'var(--red)' }

const SLA_HORAS = 48
// SLA = 48 horas corridas a partir da abertura (conta fim de semana).
function prazoSLA(abertoISO: string, horas = SLA_HORAS): Date {
  return new Date(new Date(abertoISO).getTime() + horas * 3600 * 1000)
}
function fmtBR(d: Date) { return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function estaAtrasado(abertoISO: string, fin: boolean) {
  if (fin) return false
  return new Date() > prazoSLA(abertoISO)
}
function dentroPeriodo(iso: string, per: string): boolean {
  if (!per || per.startsWith('Período')) return true
  const d = new Date(iso); if (isNaN(+d)) return true
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth(), dd = now.getDate()
  let a: Date, b: Date
  if (per === 'Hoje') { a = new Date(y, m, dd); b = new Date(y, m, dd) }
  else if (per === 'Ontem') { a = new Date(y, m, dd - 1); b = new Date(y, m, dd - 1) }
  else if (per === 'Semana passada') { const dow = now.getDay(); b = new Date(y, m, dd - dow - 1); a = new Date(y, m, dd - dow - 7) }
  else if (per === 'Últimos 30 dias') { a = new Date(y, m, dd - 29); b = new Date(y, m, dd) }
  else if (per === 'Mês atual') { a = new Date(y, m, 1); b = new Date(y, m + 1, 0) }
  else if (per === 'Mês passado') { a = new Date(y, m - 1, 1); b = new Date(y, m, 0) }
  else if (per === 'Este ano') { a = new Date(y, 0, 1); b = new Date(y, 11, 31) }
  else return true
  d.setHours(12, 0, 0, 0); a.setHours(0, 0, 0, 0); b.setHours(23, 59, 59, 999)
  return d >= a && d <= b
}

function Kpis({ items }: { items: [string, string, string][] }) {
  return (
    <div className="rel-kpis">
      {items.map(([l, v, ic]) => (
        <div className="rel-kpi" key={l}><div className="rk-ic"><i className={`ti ${ic}`} /></div><div><div className="rk-v">{v}</div><div className="rk-l">{l}</div></div></div>
      ))}
    </div>
  )
}
function PrioTag({ p }: { p: string }) {
  if (p === 'normal') return null
  return <span className="evt-type" style={{ background: `${PRIO_COR[p]}22`, color: PRIO_COR[p] }}><i className={`ti ${PRIO_ICON[p]}`} /> {PRIO_LABEL[p]}</span>
}
function SitPill({ fin }: { fin: boolean }) {
  return fin
    ? <span className="wa-pill done"><i className="ti ti-flag-check" /> Finalizado</span>
    : <span className="wa-pill run"><i className="ti ti-progress" /> Ativo</span>
}
function PrazoCell({ c }: { c: Chamado }) {
  const lim = fmtBR(prazoSLA(c.abertoEm))
  if (c.finalizado) return <><span className="wa-pill ok"><i className="ti ti-check" /> Concluído</span><div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>limite {lim}</div></>
  const at = estaAtrasado(c.abertoEm, c.finalizado)
  return (
    <>
      {at
        ? <span className="wa-pill" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}><i className="ti ti-clock-exclamation" /> Atrasado</span>
        : <span className="wa-pill ok"><i className="ti ti-clock" /> Em dia</span>}
      <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>resolver até <b>{lim}</b></div>
    </>
  )
}

export function ChamadosManager({ chamados, isAdmin, origemFranqueado }: { chamados: Chamado[]; isAdmin: boolean; origemFranqueado: string | null }) {
  const router = useRouter()
  const [box, setBox] = useState<'recebidos' | 'enviados'>('recebidos')
  const [fil, setFil] = useState({ periodo: 'Este ano', situacao: 'Todos', assunto: 'Todos', para: 'Todos' })
  const [novo, setNovo] = useState(false)
  const [det, setDet] = useState<Chamado | null>(null)
  const [msg, setMsg] = useState('')

  const noBox = chamados.filter((c) => c.box === box)
  const base = noBox.filter((c) =>
    dentroPeriodo(c.abertoEm, fil.periodo) &&
    (fil.assunto === 'Todos' || c.etiqueta === fil.assunto) &&
    (fil.para === 'Todos' || c.para === fil.para)
  )
  const ativos = base.filter((c) => !c.finalizado).length
  const finz = base.filter((c) => c.finalizado).length
  const atrasados = base.filter((c) => !c.finalizado && estaAtrasado(c.abertoEm, c.finalizado)).length
  const list = base.filter((c) => fil.situacao === 'Todos' || (fil.situacao === 'Ativos' ? !c.finalizado : c.finalizado))

  if (det) return <ChamadoDetalhe chamado={det} isAdmin={isAdmin} onBack={() => { setDet(null); router.refresh() }} />

  return (
    <>
      <div className="rel-legend">
        Solicitações <b>entre departamentos da franqueadora</b> e <b>entre franqueados e os departamentos</b>, nos dois sentidos. Filtre por
        <b> período</b>, <b>situação</b> (ativos/finalizados), <b>assunto</b> e <b>departamento</b>. Cada chamado deve ser resolvido em
        <b> até 48 horas</b> a partir da abertura — passou disso, entra em <b>atraso</b> e a data-limite aparece no chamado.
      </div>

      <Kpis items={[
        ['Chamados ativos', String(ativos), 'ti-ticket'],
        ['Finalizados', String(finz), 'ti-checks'],
        ['Atrasados (ativos)', String(atrasados), 'ti-alert-triangle'],
        ['Prazo SLA', '48 horas', 'ti-clock'],
      ]} />

      <div className="rel-acts" style={{ justifyContent: 'space-between', margin: '-4px 0 14px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{msg}</span>
        <button className="btn btn-primary" onClick={() => setNovo(true)}><i className="ti ti-plus" /> Abrir chamado</button>
      </div>

      <div className="rel-tabs">
        {(['recebidos', 'enviados'] as const).map((b) => (
          <div key={b} className={`rel-tab ${b === box ? 'active' : ''}`} onClick={() => setBox(b)}>
            {b === 'recebidos' ? 'Recebidos' : 'Enviados'} ({chamados.filter((c) => c.box === b).length})
          </div>
        ))}
      </div>

      <div className="rel-card" style={{ margin: '0 0 14px' }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-filter flt" /> Filtros</span></div>
        <div className="rel-filgrid" style={{ marginTop: 12 }}>
          <div className="rf"><label>Período (abertura)</label><select value={fil.periodo} onChange={(e) => setFil((f) => ({ ...f, periodo: e.target.value }))}>{PERIODOS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="rf"><label>Situação</label><select value={fil.situacao} onChange={(e) => setFil((f) => ({ ...f, situacao: e.target.value }))}>{['Todos', 'Ativos', 'Finalizados'].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="rf"><label>Assunto</label><select value={fil.assunto} onChange={(e) => setFil((f) => ({ ...f, assunto: e.target.value }))}>{TAGS_FILTRO.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="rf"><label>Departamento (para)</label><select value={fil.para} onChange={(e) => setFil((f) => ({ ...f, para: e.target.value }))}>{DEPTS.map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
      </div>

      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>#</th><th>Assunto</th><th>De → Para</th><th>Responsável</th><th>Situação</th><th>Prazo (SLA)</th><th>Ações</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>Nenhum chamado neste filtro.</td></tr>}
            {list.map((c) => (
              <tr key={c.id}>
                <td style={{ color: 'var(--text-3)' }}>#{c.numero}</td>
                <td><span className="cli-name">{c.assunto}</span><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.etiqueta} · aberto {new Date(c.abertoEm).toLocaleDateString('pt-BR')}</div></td>
                <td style={{ fontSize: 12 }}>{c.de} <i className="ti ti-arrow-right" style={{ color: 'var(--brand-400)' }} /> {c.para}</td>
                <td>{c.responsavel === '—' ? <span className="muted">a atribuir</span> : c.responsavel}</td>
                <td><SitPill fin={c.finalizado} /></td>
                <td><PrazoCell c={c} /></td>
                <td><span className="os-link" onClick={() => setDet(c)}><i className="ti ti-eye" /> Abrir</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>

      {novo && <NovoChamado origemFranqueado={origemFranqueado} onClose={() => setNovo(false)} onSaved={(b) => { setNovo(false); setBox(b); router.refresh() }} onError={setMsg} />}
    </>
  )
}

function ChamadoDetalhe({ chamado, isAdmin, onBack }: { chamado: Chamado; isAdmin: boolean; onBack: () => void }) {
  const [msgs, setMsgs] = useState<MensagemRow[] | null>(null)
  const [fin, setFin] = useState(chamado.finalizado)
  const [resp, setResp] = useState(chamado.responsavel)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    carregarThread(chamado.id).then((r) => setMsgs(r.ok ? r.mensagens ?? [] : []))
  }, [chamado.id])
  // Rola o chat para a última mensagem sempre que a thread muda.
  useEffect(() => { const el = chatRef.current; if (el) el.scrollTop = el.scrollHeight }, [msgs])
  const lim = fmtBR(prazoSLA(chamado.abertoEm))
  const atrasado = estaAtrasado(chamado.abertoEm, fin)

  function assumir() {
    setBusy(true); setErro('')
    assumirChamado(chamado.id).then((r) => { setBusy(false); if (r.ok) setResp(r.responsavel || resp); else setErro(r.error || 'Erro.') })
  }

  function enviar() {
    const t = texto.trim(); if (!t) return
    setBusy(true); setErro('')
    responderChamado(chamado.id, t).then((r) => {
      setBusy(false)
      if (!r.ok) { setErro(r.error || 'Erro.'); return }
      setTexto('')
      carregarThread(chamado.id).then((x) => setMsgs(x.ok ? x.mensagens ?? [] : []))
    })
  }
  function toggleFin() {
    setBusy(true)
    finalizarChamado(chamado.id, !fin).then((r) => { setBusy(false); if (r.ok) setFin(!fin); else setErro(r.error || 'Erro.') })
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}><span className="os-link" onClick={onBack}><i className="ti ti-arrow-left" /> Voltar aos chamados</span></div>
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>#{chamado.numero}</span>
          <PrioTag p={chamado.prioridade} />
          <span className="orig-tag">{chamado.etiqueta}</span>
          <span style={{ marginLeft: 'auto' }}><SitPill fin={fin} /></span>
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700 }}>{chamado.assunto}</h3>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>{chamado.de} <i className="ti ti-arrow-right" /> {chamado.para} · responsável: {resp === '—' ? <span className="muted">a atribuir</span> : <b>{resp}</b>} · aberto {new Date(chamado.abertoEm).toLocaleString('pt-BR')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}><i className="ti ti-clock" /> Prazo de resolução (SLA 48h): <b>{lim}</b>{!fin && atrasado && <span className="wa-pill" style={{ background: 'var(--red-bg)', color: 'var(--red)', marginLeft: 6 }}>atrasado</span>}</span>
          {isAdmin && !fin && <button className="btn" disabled={busy} onClick={assumir}><i className="ti ti-user-check" /> Assumir</button>}
          <button className="btn btn-primary" disabled={busy} onClick={toggleFin}>{fin ? <><i className="ti ti-rotate" /> Reabrir chamado</> : <><i className="ti ti-flag-check" /> Finalizar chamado</>}</button>
        </div>
        {erro && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{erro}</div>}
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="chat-msgs" ref={chatRef} style={{ height: 340, borderRadius: 0 }}>
          {msgs === null && <div style={{ padding: 16, color: 'var(--text-3)' }}>Carregando…</div>}
          {msgs?.map((m) => (
            <div key={m.id} className={`msg ${m.papel_remetente === 'solicitante' ? 'in' : 'out'}`}>
              <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 2, opacity: 0.8 }}>{m.autor_nome || (m.papel_remetente === 'solicitante' ? 'Solicitante' : 'Responsável')}</div>
              {m.mensagem}
              <span className="mt">{new Date(m.criada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
        <div className="chat-reply">
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva um retorno / atualização…" onKeyDown={(e) => { if (e.key === 'Enter') enviar() }} />
          <button className="chat-send" style={{ background: 'var(--brand-500)' }} disabled={busy} onClick={enviar}><i className="ti ti-send" /></button>
        </div>
      </div>
    </>
  )
}

function NovoChamado({ onClose, onSaved, onError, origemFranqueado }: { onClose: () => void; onSaved: (box: 'recebidos' | 'enviados') => void; onError: (m: string) => void; origemFranqueado: string | null }) {
  const [f, setF] = useState<ChamadoForm>({ assunto: '', etiqueta: 'Solicitação', de_parte: origemFranqueado || PARTES[0], para_parte: 'Financeiro', prioridade: 'normal', descricao: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  function salvar() {
    setErr('')
    if (!f.assunto.trim() || !f.descricao.trim()) { setErr('Preencha assunto e descrição.'); return }
    if (f.de_parte === f.para_parte) { setErr('“De” e “Para” não podem ser o mesmo departamento.'); return }
    setBusy(true)
    abrirChamado(f).then((r) => {
      setBusy(false)
      if (r.ok) { onError(''); onSaved(/franquead/i.test(f.de_parte) ? 'recebidos' : 'enviados') }
      else { setErr(r.error || 'Erro ao abrir chamado.'); onError(r.error || '') }
    })
  }
  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-head"><h3><i className="ti ti-ticket" /> Abrir chamado</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div className="mf"><label>Assunto</label><input value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} placeholder="Resumo da solicitação" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>De</label>
              {origemFranqueado
                ? <input value={origemFranqueado} disabled title="Sua unidade — definido pelo seu acesso" />
                : <select value={f.de_parte} onChange={(e) => setF({ ...f, de_parte: e.target.value })}>{PARTES.map((p) => <option key={p}>{p}</option>)}</select>}
            </div>
            <div className="mf"><label>Para</label><select value={f.para_parte} onChange={(e) => setF({ ...f, para_parte: e.target.value })}>{PARTES.map((p) => <option key={p}>{p}</option>)}</select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Assunto (etiqueta)</label><select value={f.etiqueta} onChange={(e) => setF({ ...f, etiqueta: e.target.value })}>{ETIQUETAS.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div className="mf"><label>Prioridade</label><select value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value as ChamadoForm['prioridade'] })}><option value="normal">Normal</option><option value="importante">Importante</option><option value="urgente">Urgente</option></select></div>
          </div>
          <div className="mf"><label>Descrição</label><textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} rows={4} placeholder="Descreva a solicitação…" /></div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Enviando…' : <><i className="ti ti-send" /> Abrir e enviar</>}</button></div>
      </div>
    </div>
  )
}
