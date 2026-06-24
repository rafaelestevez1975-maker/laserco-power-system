'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarComunicado, marcarCiente, definirStatusComunicado, relatorioLeitura, type ComunicadoForm, type LeitorRow } from '@/app/(app)/comunicados/actions'

export type Comunicado = {
  id: string; titulo: string; mensagem: string
  prioridade: 'normal' | 'importante' | 'urgente'
  categoria: string; audiencia: string[]
  obrigatorio: boolean; email: boolean
  status: 'rascunho' | 'agendado' | 'publicado' | 'encerrado'
  dest: number; lidos: number; autor: string; quando: string
}

const PERIODOS = ['Hoje', 'Ontem', 'Semana passada', 'Últimos 30 dias', 'Mês atual', 'Mês passado', 'Este ano', 'Período…']
// Os 5 segmentos exatos que o cliente nomeou (anotação #10 / mensagens_whats):
// todos · nossos colaboradores · só escritório · só franqueados · funcionários de franqueados.
const AUDIENCIAS: [string, string][] = [
  ['Todos', 'Todos'],
  ['Nossos colaboradores', 'Nossos colaboradores'],
  ['Escritório', 'Só escritório'],
  ['Franqueados', 'Só franqueados'],
  ['Funcionários de franqueados', 'Funcionários de franqueados'],
]
const ASSUNTOS = ['Marketing', 'Operações', 'Comercial', 'Área Técnica', 'Diretoria', 'Treinamentos', 'Recursos Humanos']
const CATEGORIAS = ['Sem categoria', ...ASSUNTOS]
const PRIO_LABEL: Record<string, string> = { normal: 'Normal', importante: 'Importante', urgente: 'Urgente' }
const PRIO_ICON: Record<string, string> = { normal: 'ti-info-circle', importante: 'ti-alert-triangle', urgente: 'ti-urgent' }
const ST_LABEL: Record<string, string> = { rascunho: 'Rascunho', agendado: 'Agendado', publicado: 'Publicado', encerrado: 'Encerrado' }
const ST_PILL: Record<string, string> = { publicado: 'ok', agendado: 'pend', encerrado: 'done', rascunho: 'draft' }

function pct(l: number, d: number) { return Math.round((l / Math.max(d, 1)) * 100) }
function dataBR(s: string) { try { return new Date(s).toLocaleDateString('pt-BR') } catch { return '' } }
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
function BarChart({ rows, gold }: { rows: [string, number][]; gold?: boolean }) {
  const total = rows.reduce((a, r) => a + r[1], 0) || 1
  const max = Math.max(1, ...rows.map((r) => r[1]))
  if (!rows.length) return <div className="muted" style={{ padding: 8 }}>Sem dados no período.</div>
  return (
    <>
      {rows.map(([lbl, v]) => (
        <div className="bar-row" key={lbl}>
          <span className="bar-lbl" title={lbl}>{lbl}</span>
          <div className="bar-track"><div className={`bar-fill ${gold ? 'g' : ''}`} style={{ width: `${Math.round((v / max) * 100)}%` }} /></div>
          <span className="bar-val">{v} <b style={{ color: 'var(--brand-500)' }}>({Math.round((v / total) * 1000) / 10}%)</b></span>
        </div>
      ))}
    </>
  )
}

export function ComunicadosManager({ comunicados, myCiente, isAdmin, nome }: { comunicados: Comunicado[]; myCiente: string[]; isAdmin: boolean; nome: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fil, setFil] = useState({ periodo: 'Este ano', dest: 'Todos', assunto: 'Todos' })
  const [tab, setTab] = useState<'Todos' | 'Publicados' | 'Agendados' | 'Encerrados'>('Todos')
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState(false)
  const [report, setReport] = useState<{ com: Comunicado; leitores: LeitorRow[] | null } | null>(null)
  const cienteSet = useMemo(() => new Set(myCiente), [myCiente])

  const base = useMemo(() => comunicados.filter((c) =>
    dentroPeriodo(c.quando, fil.periodo) &&
    (fil.dest === 'Todos' || c.audiencia.includes(fil.dest) || c.audiencia.includes('Todos')) &&
    (fil.assunto === 'Todos' || c.categoria === fil.assunto)
  ), [comunicados, fil])

  const dest = base.reduce((a, c) => a + c.dest, 0)
  const lidos = base.reduce((a, c) => a + c.lidos, 0)
  const counts = {
    Todos: base.length,
    Publicados: base.filter((c) => c.status === 'publicado').length,
    Agendados: base.filter((c) => c.status === 'agendado').length,
    Encerrados: base.filter((c) => c.status === 'encerrado').length,
  }
  const list = base.filter((c) => tab === 'Todos' || c.status === tab.replace(/s$/, '').toLowerCase())

  const porAssunto = useMemo(() => {
    const o: Record<string, number> = {}; base.forEach((c) => { o[c.categoria || ''] = (o[c.categoria || ''] ?? 0) + 1 })
    return Object.entries(o).sort((a, b) => b[1] - a[1]) as [string, number][]
  }, [base])
  const porDest = useMemo(() => {
    const o: Record<string, number> = {}; base.forEach((c) => (c.audiencia.length ? c.audiencia : ['']).forEach((x) => { o[x] = (o[x] ?? 0) + 1 }))
    return Object.entries(o).sort((a, b) => b[1] - a[1]) as [string, number][]
  }, [base])

  // Leitura obrigatória pendente para o usuário atual.
  const pendentesObrig = comunicados.filter((c) => c.obrigatorio && c.status === 'publicado' && !cienteSet.has(c.id))

  function darCiente(id: string) {
    setMsg(''); startTransition(async () => {
      const r = await marcarCiente(id)
      if (!r.ok) setMsg(r.error || 'Erro ao registrar ciente.')
      else { setMsg('Leitura confirmada. Obrigado!'); router.refresh() }
    })
  }
  function abrirReport(com: Comunicado) {
    setReport({ com, leitores: null })
    startTransition(async () => { const r = await relatorioLeitura(com.id); setReport({ com, leitores: r.ok ? r.leitores ?? [] : [] }) })
  }
  function mudarStatus(id: string, status: 'publicado' | 'encerrado') {
    startTransition(async () => { const r = await definirStatusComunicado(id, status); if (r.ok) router.refresh(); else setMsg(r.error || 'Erro.') })
  }

  return (
    <>
      <div className="rel-legend">
        Somente <b>administradores</b> enviam comunicados. Filtre por <b>período</b>, <b>destinatário</b> (geral, unidades próprias, franquias, franqueados, office) e
        <b> assunto</b>. Comunicados <b>obrigatórios</b> exigem o <b>“ciente”</b> no primeiro acesso.
      </div>

      {pendentesObrig.length > 0 && (
        <div className="crm-sla-alert" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {pendentesObrig.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <i className="ti ti-urgent" /> <b>{c.titulo}</b>
              <span style={{ fontSize: 12.5, opacity: 0.9 }}> leitura obrigatória</span>
              <button className="btn btn-primary" disabled={pending} onClick={() => darCiente(c.id)} style={{ marginLeft: 'auto' }}>
                <i className="ti ti-check" /> Estou ciente
              </button>
            </div>
          ))}
        </div>
      )}

      <Kpis items={[
        ['Comunicados', String(base.length), 'ti-speakerphone'],
        ['Destinatários', dest.toLocaleString('pt-BR'), 'ti-users'],
        ['Cientes (leram)', lidos.toLocaleString('pt-BR'), 'ti-checks'],
        ['Taxa de leitura', pct(lidos, dest) + '%', 'ti-percentage'],
      ]} />

      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-filter flt" /> Filtros</span></div>
        <div className="rel-filgrid" style={{ marginTop: 12 }}>
          <div className="rf"><label>Período</label>
            <select value={fil.periodo} onChange={(e) => setFil((f) => ({ ...f, periodo: e.target.value }))}>{PERIODOS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="rf"><label>Destinatário</label>
            <select value={fil.dest} onChange={(e) => setFil((f) => ({ ...f, dest: e.target.value }))}>{AUDIENCIAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="rf"><label>Assunto</label>
            <select value={fil.assunto} onChange={(e) => setFil((f) => ({ ...f, assunto: e.target.value }))}><option>Todos</option>{ASSUNTOS.map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
      </div>

      <div className="rel-acts" style={{ justifyContent: 'space-between', margin: '-4px 0 14px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{msg}</span>
        {isAdmin && <button className="btn btn-primary" onClick={() => setNovo(true)}><i className="ti ti-plus" /> Novo comunicado</button>}
      </div>

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <div className="dash-w"><h4><i className="ti ti-tag" /> Comunicados por assunto</h4><BarChart rows={porAssunto} /></div>
        <div className="dash-w"><h4><i className="ti ti-users" /> Comunicados por destinatário</h4><BarChart rows={porDest} gold /></div>
      </div>

      <div className="rel-tabs" style={{ marginBottom: 14 }}>
        {(['Todos', 'Publicados', 'Agendados', 'Encerrados'] as const).map((t) => (
          <div key={t} className={`rel-tab ${t === tab ? 'active' : ''}`} onClick={() => setTab(t)}>{t} ({counts[t]})</div>
        ))}
      </div>

      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>ID</th><th>Título</th><th>Visto por</th><th>Criado por</th><th>Quando</th><th>Para</th><th>Obrig.</th><th>E-mail</th><th>Categoria</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24 }}>Nenhum comunicado neste filtro.</td></tr>}
            {list.map((c) => {
              const p = pct(c.lidos, c.dest)
              return (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text-3)' }}>#{c.id.slice(0, 6)}</td>
                  <td><span className="cli-name">{c.titulo}</span> {c.prioridade !== 'normal' && <span className="evt-type" style={{ marginLeft: 4 }}><i className={`ti ${PRIO_ICON[c.prioridade]}`} /> {PRIO_LABEL[c.prioridade]}</span>}</td>
                  <td><div style={{ fontWeight: 700, color: p >= 50 ? 'var(--green)' : 'var(--amber)' }}>{p}%</div><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.lidos} de {c.dest}</div></td>
                  <td>{c.autor}</td>
                  <td>{dataBR(c.quando)}</td>
                  <td>{c.audiencia.map((a) => <span className="evt-audi-tag" key={a}>{a}</span>)}</td>
                  <td>{c.obrigatorio ? <span className="wa-pill pend">Sim</span> : <span className="muted">Não</span>}</td>
                  <td>{c.email ? <i className="ti ti-mail" style={{ color: 'var(--green)' }} /> : <span className="muted"></span>}</td>
                  <td><span className="orig-tag">{c.categoria}</span></td>
                  <td><span className={`wa-pill ${ST_PILL[c.status] || 'draft'}`}>{ST_LABEL[c.status]}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="os-link" onClick={() => abrirReport(c)}>Visualizar</span>
                    {isAdmin && c.status === 'publicado' && <> · <span className="os-link" onClick={() => mudarStatus(c.id, 'encerrado')}>Encerrar</span></>}
                    {isAdmin && c.status === 'encerrado' && <> · <span className="os-link" onClick={() => mudarStatus(c.id, 'publicado')}>Reabrir</span></>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div></div>

      {novo && <NovoComunicado onClose={() => setNovo(false)} onSaved={() => { setNovo(false); router.refresh() }} />}
      {report && <ReportModal data={report} onClose={() => setReport(null)} />}
    </>
  )
}

function NovoComunicado({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<ComunicadoForm>({ titulo: '', mensagem: '', prioridade: 'normal', categoria: 'Sem categoria', audiencia: ['Todos'], leitura_obrigatoria: false, enviar_email: false, status: 'publicado', agendado_para: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  function toggleAud(a: string) { setF((p) => ({ ...p, audiencia: p.audiencia.includes(a) ? p.audiencia.filter((x) => x !== a) : [...p.audiencia, a] })) }
  function salvar() {
    setErr(''); if (!f.titulo.trim() || !f.mensagem.trim()) { setErr('Preencha título e mensagem.'); return }
    setBusy(true); criarComunicado(f).then((r) => { setBusy(false); if (r.ok) onSaved(); else setErr(r.error || 'Erro ao salvar.') })
  }
  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-head"><h3><i className="ti ti-speakerphone" /> Novo comunicado</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div className="mf"><label>Título</label><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Título do comunicado" /></div>
          <div className="mf"><label>Mensagem</label><textarea value={f.mensagem} onChange={(e) => setF({ ...f, mensagem: e.target.value })} rows={4} placeholder="Conteúdo do aviso…" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Prioridade</label><select value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value as ComunicadoForm['prioridade'] })}><option value="normal">Normal</option><option value="importante">Importante</option><option value="urgente">Urgente</option></select></div>
            <div className="mf"><label>Categoria</label><select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="mf"><label>Destinatários</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {AUDIENCIAS.map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, border: '1px solid var(--line)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', background: f.audiencia.includes(v) ? 'var(--surface-2)' : 'var(--surface)' }}>
                  <input type="checkbox" checked={f.audiencia.includes(v)} onChange={() => toggleAud(v)} /> {l}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.leitura_obrigatoria} onChange={(e) => setF({ ...f, leitura_obrigatoria: e.target.checked })} /> Leitura obrigatória (ciente)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={f.enviar_email} onChange={(e) => setF({ ...f, enviar_email: e.target.checked })} /> Enviar por e-mail</label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Publicação</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ComunicadoForm['status'] })}><option value="publicado">Publicar agora</option><option value="agendado">Agendar</option><option value="rascunho">Salvar rascunho</option></select></div>
            {f.status === 'agendado' && <div className="mf"><label>Quando</label><input type="datetime-local" value={f.agendado_para ?? ''} onChange={(e) => setF({ ...f, agendado_para: e.target.value })} /></div>}
          </div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : <><i className="ti ti-send" /> Publicar</>}</button></div>
      </div>
    </div>
  )
}

function ReportModal({ data, onClose }: { data: { com: Comunicado; leitores: LeitorRow[] | null }; onClose: () => void }) {
  const { com, leitores } = data
  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-head"><h3><i className="ti ti-eye" /> {com.titulo}</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'block' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>{com.mensagem}</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Leitura: {com.lidos} de {com.dest} ({pct(com.lidos, com.dest)}%)</div>
          {leitores === null && <div className="muted">Carregando relatório…</div>}
          {leitores && leitores.length === 0 && <div className="muted">Ninguém deu “ciente” ainda.</div>}
          {leitores && leitores.length > 0 && (
            <div className="cli-scroll" style={{ maxHeight: 320 }}>
              <table className="cli-table"><thead><tr><th>Nome</th><th>Unidade</th><th>Leu em</th></tr></thead>
                <tbody>{leitores.map((l, i) => <tr key={i}><td>{l.nome}</td><td>{l.unidade ?? ''}</td><td>{new Date(l.lido_em).toLocaleString('pt-BR')}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-foot"><button className="btn btn-primary" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  )
}
