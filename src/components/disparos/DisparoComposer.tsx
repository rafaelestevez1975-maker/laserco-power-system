'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dispararCampanha, salvarTemplate, excluirTemplate, type Template } from '@/app/(app)/expansao/disparos/actions'

export type CanalOpt = { nome: string; label: string; escopo: 'unidade' | 'geral' | null; unidadeId: string | null; delayMin: number; delayMax: number }
export type ListaOpt = { nome: string; qtd: number }

// Variáveis suportadas no texto: placeholders da UAZAPI ({{...}}) + tokens do legado
// ({cliente}/{serviço}/{hora}/{unidade}/{cupom}) para paridade com os modelos do cliente.
const VARS: [string, string][] = [
  ['{{first_name}}', 'Primeiro nome'], ['{{name}}', 'Nome completo'],
  ['{cliente}', 'Cliente'], ['{serviço}', 'Serviço'], ['{hora}', 'Hora'], ['{unidade}', 'Unidade'], ['{cupom}', 'Cupom'],
]

export function DisparoComposer({ canais, activeUnitId, templates, listas }: { canais: CanalOpt[]; activeUnitId: string | null; templates: Template[]; listas?: ListaOpt[] }) {
  const router = useRouter()
  const inicial = canais.find((c) => c.unidadeId && c.unidadeId === activeUnitId) ?? canais[0]
  const [canal, setCanal] = useState(inicial?.nome ?? '')
  const sel = canais.find((c) => c.nome === canal) ?? inicial
  const [nome, setNome] = useState('')
  const [texto, setTexto] = useState('')
  const [numeros, setNumeros] = useState('')
  const [dMin, setDMin] = useState(String(inicial?.delayMin ?? 20))
  const [dMax, setDMax] = useState(String(inicial?.delayMax ?? 45))
  const [agendar, setAgendar] = useState('')
  const [publico, setPublico] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; txt: string } | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

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

  function inserirVar(v: string) {
    const ta = taRef.current
    if (!ta) { setTexto((t) => t + v); return }
    const start = ta.selectionStart, end = ta.selectionEnd
    setTexto((t) => t.slice(0, start) + v + t.slice(end))
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + v.length })
  }

  function aplicarTemplate(id: string) {
    const t = templates.find((x) => x.id === id)
    if (t) { setTexto(t.texto); if (!nome.trim()) setNome(t.nome) }
  }

  async function salvarModelo() {
    if (!texto.trim()) { setMsg({ tipo: 'erro', txt: 'Escreva a mensagem antes de salvar como modelo.' }); return }
    const n = window.prompt('Nome do modelo:', nome || '')
    if (n === null) return
    setSaving(true)
    const r = await salvarTemplate(n, texto)
    setSaving(false)
    if (!r.ok) { setMsg({ tipo: 'erro', txt: r.error || 'Erro ao salvar modelo.' }); return }
    setMsg({ tipo: 'ok', txt: 'Modelo salvo.' }); router.refresh()
  }

  async function excluirModelo(id: string) {
    if (!window.confirm('Excluir este modelo?')) return
    const r = await excluirTemplate(id)
    if (r.ok) router.refresh(); else setMsg({ tipo: 'erro', txt: r.error || 'Erro.' })
  }

  async function disparar() {
    if (!canal) { setMsg({ tipo: 'erro', txt: 'Selecione um canal conectado.' }); return }
    const quando = agendar ? ` agendado para ${new Date(agendar).toLocaleString('pt-BR')}` : ''
    if (!window.confirm(`Disparar para ${total} número(s) pelo canal "${sel?.label ?? canal}"${quando}?`)) return
    setSaving(true); setMsg(null)
    const res = await dispararCampanha(canal, texto, numeros, Number(dMin), Number(dMax), nome, agendar || undefined, publico || undefined)
    setSaving(false)
    if (!res.ok) { setMsg({ tipo: 'erro', txt: res.error || 'Erro ao disparar.' }); return }
    setMsg({ tipo: 'ok', txt: res.agendado ? `Campanha agendada para ${res.total} número(s).` : `Campanha criada para ${res.total} número(s). O envio roda com delay (anti-ban).` })
    setNumeros(''); setTexto(''); setNome(''); setAgendar('')
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

      {/* Público da campanha (base/segmento) — legado: a campanha escolhe uma BASE como público */}
      {listas && listas.length > 0 && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Público (base/segmento)</label>
          <select style={inp} value={publico} onChange={(e) => { setPublico(e.target.value); const l = listas.find((x) => x.nome === e.target.value); if (l && !nome.trim()) setNome(l.nome) }}>
            <option value="">Números colados manualmente (abaixo)</option>
            {listas.map((l) => <option key={l.nome} value={l.nome}>{l.nome} — {l.qtd.toLocaleString('pt-BR')} contatos</option>)}
          </select>
          {publico && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>Base dinâmica do sistema — cole os números do segmento abaixo (o sistema materializa a lista no disparo).</div>}
        </div>
      )}

      {/* Modelos salvos */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Modelos:</label>
        <select style={{ ...inp, width: 'auto', minWidth: 180 }} value="" onChange={(e) => { if (e.target.value) aplicarTemplate(e.target.value) }}>
          <option value="">{templates.length ? 'Carregar modelo…' : 'Nenhum modelo salvo'}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <button type="button" className="btn" disabled={saving} onClick={salvarModelo}><i className="ti ti-device-floppy" /> Salvar como modelo</button>
      </div>
      {templates.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {templates.map((t) => (
            <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, background: 'var(--surface-2)', borderRadius: 14, padding: '2px 4px 2px 10px' }}>
              {t.nome}
              <button type="button" title="Excluir modelo" onClick={() => excluirModelo(t.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13 }}>×</button>
            </span>
          ))}
        </div>
      )}

      <div><label style={{ fontSize: 12, fontWeight: 600 }}>Mensagem</label>
        <textarea ref={taRef} style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a mensagem do disparo…" />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Personalizar:</span>
          {VARS.map(([v, label]) => (
            <button key={v} type="button" className="btn" style={{ fontSize: 11.5, padding: '3px 8px' }} title={`Insere ${label} (a UAZAPI substitui pelo nome do contato)`} onClick={() => inserirVar(v)}>{v}</button>
          ))}
        </div>
      </div>

      <div><label style={{ fontSize: 12, fontWeight: 600 }}>Números <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(um por linha, ou separados por vírgula)</span></label>
        <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={numeros} onChange={(e) => setNumeros(e.target.value)} placeholder={'48999990000\n11988887777'} />
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{total} número(s) válido(s)</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Delay mín. (s)</label><input style={inp} type="number" value={dMin} onChange={(e) => setDMin(e.target.value)} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Delay máx. (s)</label><input style={inp} type="number" value={dMax} onChange={(e) => setDMax(e.target.value)} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Agendar para <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(opcional)</span></label><input style={inp} type="datetime-local" value={agendar} onChange={(e) => setAgendar(e.target.value)} /></div>
      </div>

      {msg && <p style={{ fontSize: 12.5, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.txt}</p>}

      <div>
        <button className="btn btn-primary" disabled={saving || total === 0 || !texto.trim()} onClick={disparar}>
          {saving ? 'Enviando para a fila…' : <><i className={`ti ${agendar ? 'ti-clock' : 'ti-send'}`} /> {agendar ? `Agendar para ${total}` : `Disparar para ${total}`}</>}
        </button>
      </div>
    </div>
  )
}
