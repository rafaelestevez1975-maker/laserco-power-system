'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { responderConversa, abrirChamadoDaConversa, assumirConversa, devolverConversa, transferirConversa, marcarLido, adicionarNota, alterarStatusConversa, reativarIA, buscarClientePorContato, enviarMidia, descartarConversa, type ClienteResumo } from '@/app/(app)/sac/triagem/actions'

// ticks de entrega (status da UAZAPI)
function Ticks({ status }: { status?: string | null }) {
  const s = (status || '').toLowerCase()
  if (s.includes('read')) return <span style={{ color: '#34B7F1', fontSize: 11 }}>✓✓</span>
  if (s.includes('deliver')) return <span style={{ color: 'var(--text-3)', fontSize: 11 }}>✓✓</span>
  if (s.includes('fail') || s.includes('erro')) return <span style={{ color: 'var(--red)', fontSize: 11 }}>⚠</span>
  return <span style={{ color: 'var(--text-3)', fontSize: 11 }}>✓</span>
}
// lê um arquivo como data URI (base64)
const lerComoDataURL = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) })
// comprime imagem no navegador (max 1600px, JPEG) p/ caber no limite
async function comprimirImagem(f: File): Promise<string> {
  if (!f.type.startsWith('image/')) return lerComoDataURL(f)
  const dataUrl = await lerComoDataURL(f)
  try {
    const img = document.createElement('img'); img.src = dataUrl; await img.decode()
    const max = 1600; let { width: w, height: h } = img
    if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r) }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    cv.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return cv.toDataURL('image/jpeg', 0.82)
  } catch { return dataUrl }
}

export type Chat = { id: string; telefone: string | null; nome: string | null; ultima_msg: string | null; ultima_msg_em: string | null; nao_lidas: number | null; bot_ativo: boolean | null; ticket_id: string | null; atendente_id: string | null; status: string | null }
export type Msg = { id: string; chat_id: string | null; direcao: string | null; autor: string | null; tipo: string | null; texto: string | null; midia_url?: string | null; midia_mimetype?: string | null; status?: string | null; criado_em: string | null }
export type Atendente = { id: string; nome: string }
export type Nota = { id: string; chat_id: string | null; autor_nome: string | null; texto: string | null; criada_em: string | null }
export type Unidade = { id: string; nome: string }

const SLA_MIN = 5
const STATUS_OPCOES = ['aberto', 'pendente', 'resolvido'] as const
const STATUS_LABEL: Record<string, string> = { aberto: 'Aberto', pendente: 'Pendente', resolvido: 'Resolvido', fechado: 'Fechado', em_atendimento: 'Em atendimento' }
// Conversas nesses status saem da fila ativa de triagem (paridade do legado: ao virar
// chamado / ser descartada, some da lista). Um toggle deixa revê-las quando preciso.
const STATUS_ARQUIVADO = new Set(['resolvido', 'fechado'])

const isIn = (d: string | null) => !/out|saida|saída|enviad|atendente|bot/i.test(d || '')
const hora = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
const iniciais = (n: string | null, tel: string | null) => (n?.trim()?.[0]?.toUpperCase()) || (tel ? tel.slice(-2) : '?')

type Aba = 'minhas' | 'fila' | 'todas'

export function TriagemWhatsapp({
  chats, msgs, atendentes, notas, operadorId,
  unidades = [], activeUnitId = null, motivos = [],
  totalN, minhasN: minhasNServer, filaN: filaNServer, amostraCapped = false,
}: {
  chats: Chat[]; msgs: Msg[]; atendentes: Atendente[]; notas: Nota[]; operadorId: string | null
  unidades?: Unidade[]; activeUnitId?: string | null; motivos?: string[]
  totalN?: number; minhasN?: number; filaN?: number; amostraCapped?: boolean
}) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState<Aba>('todas')
  const [verArquivadas, setVerArquivadas] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')
  const [lidos, setLidos] = useState<Set<string>>(new Set())
  const [transfer, setTransfer] = useState('')
  const [notasOpen, setNotasOpen] = useState(false)
  const [notaTxt, setNotaTxt] = useState('')
  const [cliOpen, setCliOpen] = useState(false)
  const [cli, setCli] = useState<ClienteResumo | null>(null)
  const [cliBusy, setCliBusy] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [chamadoOpen, setChamadoOpen] = useState(false)
  const [form, setForm] = useState({ nome: '', cpf: '', telefone: '', email: '', unidade_id: '', motivo: '' })
  const fileRef = useRef<HTMLInputElement | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const threadRef = useRef<HTMLDivElement | null>(null)

  // ── Tempo real: re-busca os dados do servidor a cada 3s (soft-refresh preserva a
  // conversa aberta e o texto digitado). O webhook da UAZAPI já grava as mensagens
  // recebidas no banco, então elas aparecem sozinhas. Pausa quando a aba está oculta.
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!id) id = setInterval(() => { if (!document.hidden) router.refresh() }, 3000) }
    const stop = () => { if (id) { clearInterval(id); id = null } }
    const onVis = () => { if (document.hidden) stop(); else { router.refresh(); start() } }
    start()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [router])

  async function abrirCliente() {
    const novo = !cliOpen; setCliOpen(novo)
    if (novo && sel) {
      const c = chats.find((x) => x.id === sel)
      // Identifica por CPF (preferencial) quando o cliente já está casado no cadastro do
      // chamado, senão pelo telefone da conversa. O CPF digitado no fluxo "Abrir chamado"
      // também alimenta essa busca.
      const cpf = (form.cpf || cli?.cpf || '').trim() || null
      setCliBusy(true); setCli(null)
      const r = await buscarClientePorContato(c?.telefone ?? null, cpf)
      setCli(r); setCliBusy(false)
    }
  }

  // última mensagem por conversa → base do SLA de 1ª resposta (espera quando a última é do cliente)
  const ultimaMsgChat = useMemo(() => { const m = new Map<string, Msg>(); for (const x of msgs) if (x.chat_id) m.set(x.chat_id, x); return m }, [msgs])
  const aguardandoMin = (chatId: string): number | null => {
    const lm = ultimaMsgChat.get(chatId)
    if (!lm || !isIn(lm.direcao) || !lm.criado_em) return null
    return Math.floor((Date.now() - new Date(lm.criado_em).getTime()) / 60000)
  }

  const nomeAtendente = useMemo(() => new Map(atendentes.map((a) => [a.id, a.nome])), [atendentes])
  // Contagens REAIS vêm do servidor (count exact); fallback p/ amostra só se não vierem.
  const totalReal = totalN ?? chats.length
  const minhasN = minhasNServer ?? chats.filter((c) => c.atendente_id && c.atendente_id === operadorId).length
  const filaN = filaNServer ?? chats.filter((c) => !c.atendente_id).length
  const arquivadasN = chats.filter((c) => STATUS_ARQUIVADO.has((c.status || '').toLowerCase())).length

  function selecionar(id: string) {
    setSel(id); setAviso(''); setCliOpen(false); setCli(null); setNotasOpen(false); setChamadoOpen(false)
    const c = chats.find((x) => x.id === id)
    if (c && c.nao_lidas && !lidos.has(id)) { setLidos((p) => new Set(p).add(id)); marcarLido(id) }
  }

  async function enviar() {
    if (!sel || !texto.trim()) return
    setBusy(true); setAviso('')
    const res = await responderConversa(sel, texto)
    setBusy(false)
    if (!res.ok) setAviso(res.error || 'Falha ao enviar.')
    else { setTexto(''); router.refresh() }
  }

  async function enviarArquivo(f: File | null | undefined) {
    if (!f || !sel) return
    const tipo: 'image' | 'audio' | 'video' | 'document' = f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('video/') ? 'video' : 'document'
    setBusy(true); setAviso('')
    const file = tipo === 'image' ? await comprimirImagem(f) : await lerComoDataURL(f)
    const r = await enviarMidia(sel, { tipo, file, nomeArquivo: f.name, mimetype: f.type, caption: texto.trim() || undefined })
    setBusy(false)
    if (!r.ok) setAviso(r.error || 'Falha ao enviar arquivo.'); else { setTexto(''); router.refresh() }
  }
  async function gravarVoz() {
    if (gravando) { recRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream); recRef.current = mr; chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/ogg' })
        const file = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob) })
        if (sel) { setBusy(true); const r = await enviarMidia(sel, { tipo: 'ptt', file, mimetype: 'audio/ogg' }); setBusy(false); if (!r.ok) setAviso(r.error || 'Falha no áudio.'); else router.refresh() }
        setGravando(false)
      }
      mr.start(); setGravando(true)
    } catch { setAviso('Não consegui acessar o microfone.') }
  }
  // Abre o "Fluxo inicial — dados do cliente" (legado): pré-preenche nome/telefone da conversa.
  function abrirFluxoChamado() {
    const c = chats.find((x) => x.id === sel)
    if (!c) return
    setForm({ nome: c.nome || '', cpf: form.cpf || '', telefone: c.telefone || '', email: '', unidade_id: activeUnitId || '', motivo: motivos[0] || '' })
    setAviso(''); setChamadoOpen(true)
  }
  async function confirmarChamado() {
    if (!sel) return
    if (!form.nome.trim()) { setAviso('Informe o nome do cliente.'); return }
    if (!form.unidade_id) { setAviso('Selecione a unidade atendida.'); return }
    setBusy(true); setAviso('')
    const res = await abrirChamadoDaConversa(sel, { nome: form.nome, cpf: form.cpf, telefone: form.telefone, email: form.email, unidade_id: form.unidade_id, motivo: form.motivo })
    setBusy(false)
    if (!res.ok) setAviso(res.error || 'Falha ao abrir chamado.')
    else { setChamadoOpen(false); setAviso(res.jaExistia ? 'Esta conversa já tem um chamado vinculado.' : 'Chamado aberto e vinculado à conversa. ✅'); router.refresh() }
  }
  async function descartar() {
    if (!sel) return
    if (!confirm('Descartar esta conversa da triagem? Ela sai da fila de atendimento (status Fechado).')) return
    setBusy(true); setAviso('')
    const res = await descartarConversa(sel)
    setBusy(false)
    if (!res.ok) setAviso(res.error || 'Falha ao descartar.')
    else { setSel(null); setAviso('Conversa descartada da triagem.'); router.refresh() }
  }
  async function acao(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(true); setAviso('')
    const res = await fn()
    setBusy(false)
    if (!res.ok) setAviso(res.error || 'Erro.'); else { setAviso(okMsg); router.refresh() }
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    let arr = chats
    // Fila ativa de triagem: conversas resolvidas/fechadas saem da lista (paridade do legado),
    // a menos que o toggle "ver arquivadas" esteja ligado ou a busca aponte para elas.
    if (!verArquivadas && !q) arr = arr.filter((c) => !STATUS_ARQUIVADO.has((c.status || '').toLowerCase()))
    if (aba === 'minhas') arr = arr.filter((c) => c.atendente_id && c.atendente_id === operadorId)
    else if (aba === 'fila') arr = arr.filter((c) => !c.atendente_id)
    if (q) arr = arr.filter((c) => (c.nome || '').toLowerCase().includes(q) || (c.telefone || '').includes(q))
    return arr
  }, [chats, busca, aba, operadorId, verArquivadas])

  // Seleção: mantém a conversa atual enquanto ela existir na lista filtrada; senão pega a 1ª.
  // (Antes ficava presa em chats[0] e "pulava" após reordenação por ultima_msg_em.)
  useEffect(() => {
    if (sel && filtrados.some((c) => c.id === sel)) return
    setSel(filtrados[0]?.id ?? null)
  }, [filtrados, sel])

  const thread = useMemo(() => msgs.filter((m) => m.chat_id === sel), [msgs, sel])
  const chat = chats.find((c) => c.id === sel) || null
  const minha = !!chat?.atendente_id && chat.atendente_id === operadorId
  const respNome = chat?.atendente_id ? (nomeAtendente.get(chat.atendente_id) || 'Atribuído') : null
  const espera = chat ? aguardandoMin(chat.id) : null
  const notasSel = notas.filter((n) => n.chat_id === sel)
  const stat = chat?.status || 'aberto'

  // Ao trocar de conversa: vai pro fim. Ao chegar mensagem nova: só rola se já estiver
  // perto do fim (não atrapalha quem está lendo o histórico mais acima).
  useEffect(() => { const el = threadRef.current; if (el && sel) el.scrollTop = el.scrollHeight }, [sel])
  useEffect(() => {
    const el = threadRef.current; if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight
  }, [thread.length])

  async function addNota() {
    if (!sel || !notaTxt.trim()) return
    setBusy(true)
    const res = await adicionarNota(sel, notaTxt)
    setBusy(false)
    if (res.ok) { setNotaTxt(''); router.refresh() } else setAviso(res.error || 'Erro ao salvar nota.')
  }

  const tab = (id: Aba): React.CSSProperties => ({
    flex: 1, textAlign: 'center', padding: '8px 4px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    color: aba === id ? 'var(--brand-600)' : 'var(--text-3)', borderBottom: aba === id ? '2px solid var(--brand-500)' : '2px solid transparent',
  })
  const inpForm: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, width: '100%' }

  return (
    <div className="cli-card" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 220px)', minHeight: 420, overflow: 'hidden' }}>
      {/* Lista de conversas */}
      <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          <div style={tab('todas')} onClick={() => setAba('todas')}>Todas ({totalReal})</div>
          <div style={tab('minhas')} onClick={() => setAba('minhas')}>Minhas ({minhasN})</div>
          <div style={tab('fila')} onClick={() => setAba('fila')}>Fila ({filaN})</div>
        </div>
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar conversa..."
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <div style={{ fontSize: 10.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }} title="As mensagens recebidas/enviadas aparecem automaticamente">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} /> Tempo real ativo
            </div>
            <label style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title="Mostrar conversas resolvidas/fechadas (descartadas)">
              <input type="checkbox" checked={verArquivadas} onChange={(e) => setVerArquivadas(e.target.checked)} /> arquivadas{arquivadasN ? ` (${arquivadasN})` : ''}
            </label>
          </div>
          {amostraCapped && (
            <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 5 }} title={`Carregadas as ${chats.length} conversas mais recentes de ${totalReal}.`}>
              <i className="ti ti-info-circle" /> Mostrando as {chats.length} mais recentes de {totalReal}. Use a busca para localizar as demais.
            </div>
          )}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtrados.length === 0 && <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 13 }}>Nenhuma conversa.</div>}
          {filtrados.map((c) => {
            const unread = !!c.nao_lidas && !lidos.has(c.id)
            return (
              <div key={c.id} onClick={() => selecionar(c.id)}
                style={{ display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', background: c.id === sel ? 'var(--surface-2)' : undefined }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: '50%', background: 'var(--brand-500)', color: '#fff', fontWeight: 700, flexShrink: 0 }}>{iniciais(c.nome, c.telefone)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome || c.telefone || ''}</b>
                    <span style={{ fontSize: 10.5, color: 'var(--text-3)', flexShrink: 0 }}>{hora(c.ultima_msg_em)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultima_msg || ''}</div>
                  <div style={{ fontSize: 10.5, marginTop: 2 }}>
                    {c.atendente_id
                      ? <span style={{ color: c.atendente_id === operadorId ? 'var(--green)' : 'var(--text-3)' }}><i className="ti ti-user-check" /> {c.atendente_id === operadorId ? 'Você' : (nomeAtendente.get(c.atendente_id) || 'Atribuído')}</span>
                      : <span style={{ color: 'var(--amber)' }}><i className="ti ti-inbox" /> na fila</span>}
                  </div>
                </div>
                {unread && <span style={{ alignSelf: 'center', background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center', padding: '0 5px' }}>{c.nao_lidas}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Thread */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        {!chat ? (
          <div style={{ margin: 'auto', color: 'var(--text-3)' }}>Selecione uma conversa</div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', background: 'var(--brand-500)', color: '#fff', fontWeight: 700 }}>{iniciais(chat.nome, chat.telefone)}</span>
              <div>
                <b style={{ fontSize: 13 }}>{chat.nome || chat.telefone}</b>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                  {chat.telefone}
                  {' · '}{respNome ? <span style={{ color: minha ? 'var(--green)' : 'var(--text-2)' }}>{minha ? 'você' : respNome}</span> : <span style={{ color: 'var(--amber)' }}>não atribuído</span>}
                  {chat.bot_ativo ? ' · 🤖 bot' : ''}
                  {espera != null && espera >= 1 && <span style={{ marginLeft: 6, color: espera >= SLA_MIN ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>· ⏱ {espera}min aguardando</span>}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={STATUS_OPCOES.includes(stat as typeof STATUS_OPCOES[number]) ? stat : 'aberto'} disabled={busy} onChange={(e) => acao(() => alterarStatusConversa(chat.id, e.target.value as typeof STATUS_OPCOES[number]), 'Status atualizado.')}
                  style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} title="Status da conversa">
                  {STATUS_OPCOES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <button className="btn" onClick={abrirCliente}><i className="ti ti-user-search" /> Cliente</button>
                <button className="btn" onClick={() => setNotasOpen((v) => !v)}><i className="ti ti-notes" /> Notas{notasSel.length ? ` (${notasSel.length})` : ''}</button>
                {!chat.bot_ativo && <button className="btn" disabled={busy} onClick={() => acao(() => reativarIA(chat.id), 'IA reativada nesta conversa.')} title="Voltar o atendimento automático por IA">🤖 Reativar IA</button>}
                {!minha && <button className="btn" disabled={busy} onClick={() => acao(() => assumirConversa(chat.id), 'Conversa assumida por você.')}><i className="ti ti-hand-grab" /> Assumir</button>}
                {chat.atendente_id && <button className="btn" disabled={busy} onClick={() => acao(() => devolverConversa(chat.id), 'Devolvida à fila.')}><i className="ti ti-arrow-back-up" /> Devolver</button>}
                <select value={transfer} disabled={busy} onChange={(e) => { const v = e.target.value; setTransfer(''); if (v) acao(() => transferirConversa(chat.id, v), 'Conversa transferida.') }}
                  style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}>
                  <option value="">Transferir…</option>
                  {atendentes.filter((a) => a.id !== chat.atendente_id).map((a) => <option key={a.id} value={a.id}>{a.id === operadorId ? 'Para mim' : a.nome}</option>)}
                </select>
                {chat.ticket_id
                  ? <span className="os-st" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}><i className="ti ti-headset" /> Chamado vinculado</span>
                  : <button className="btn btn-primary" disabled={busy} onClick={abrirFluxoChamado}><i className="ti ti-headset" /> Abrir chamado</button>}
                <button className="btn" disabled={busy} onClick={descartar} title="Tirar a conversa da fila de triagem (status Fechado)" style={{ color: 'var(--red)' }}><i className="ti ti-trash" /> Descartar</button>
              </div>
            </div>
            <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {thread.length === 0 && <div style={{ margin: 'auto', color: 'var(--text-3)', fontSize: 13 }}>Sem mensagens nesta conversa.</div>}
              {thread.map((m) => {
                const entrada = isIn(m.direcao)
                const t = (m.tipo || '').toLowerCase()
                return (
                  <div key={m.id} style={{ alignSelf: entrada ? 'flex-start' : 'flex-end', maxWidth: '72%', background: entrada ? 'var(--surface)' : '#DCF8C6', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 11px' }}>
                    {!entrada && m.autor && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-600)', marginBottom: 1 }}>{m.autor}</div>}
                    {m.midia_url && t.includes('image') && <img src={m.midia_url} alt="" style={{ maxWidth: 220, borderRadius: 6, display: 'block', marginBottom: 4 }} />}
                    {m.midia_url && t.includes('audio') && <audio controls src={m.midia_url} style={{ maxWidth: 230, display: 'block', marginBottom: 4 }} />}
                    {m.midia_url && t.includes('video') && <video controls src={m.midia_url} style={{ maxWidth: 230, borderRadius: 6, display: 'block', marginBottom: 4 }} />}
                    {m.midia_url && (t.includes('document') || t.includes('outro')) && <a href={m.midia_url} target="_blank" rel="noopener" style={{ fontSize: 12.5, color: 'var(--brand-600)' }}><i className="ti ti-file" /> {m.texto || 'Documento'}</a>}
                    {(m.texto || !m.midia_url) && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.texto || (!m.midia_url ? <i style={{ color: 'var(--text-3)' }}>[{m.tipo || 'mídia'}]</i> : null)}</div>}
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right', marginTop: 2, display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>{hora(m.criado_em)} {!entrada && <Ticks status={m.status} />}</div>
                  </div>
                )
              })}
            </div>
            {cliOpen && (
              <div style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-2)', padding: 10, maxHeight: 220, overflowY: 'auto' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}><i className="ti ti-user-search" /> Cliente (identificado por telefone/CPF)</div>
                {cliBusy && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Buscando no cadastro…</div>}
                {!cliBusy && cli && !cli.achou && <div style={{ fontSize: 12, color: 'var(--amber)' }}>Não encontrei cadastro para este contato — pode ser não-cliente.</div>}
                {!cliBusy && cli?.achou && (
                  <div style={{ fontSize: 12.5, display: 'grid', gap: 4 }}>
                    <div><b>{cli.nome}</b> {cli.ativo === false && <span style={{ color: 'var(--text-3)' }}>(inativo)</span>}{cli.verificado && <span style={{ color: 'var(--green)' }}> ✓ verificado</span>}</div>
                    <div style={{ color: 'var(--text-2)' }}>{[cli.cpf && `CPF ${cli.cpf}`, cli.telefone, cli.email].filter(Boolean).join(' · ')}</div>
                    {(cli.cidade || cli.estado) && <div style={{ color: 'var(--text-2)' }}>{[cli.cidade, cli.estado].filter(Boolean).join('/')}</div>}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
                      <span>📅 {cli.agendamentos ?? 0} agend.</span>
                      <span>✅ {cli.concluidos ?? 0} sessões</span>
                      <span>💳 créditos {cli.saldoCreditos ?? 0}</span>
                      <span>⭐ {cli.saldoPontos ?? 0} pts</span>
                      {cli.totalGasto != null && <span>💰 R$ {Math.round(cli.totalGasto).toLocaleString('pt-BR')}</span>}
                    </div>
                  </div>
                )}
              </div>
            )}
            {chamadoOpen && (
              <div style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-2)', padding: 12, maxHeight: 300, overflowY: 'auto' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 2 }}><i className="ti ti-forms" style={{ color: 'var(--brand-500)' }} /> Fluxo inicial — dados do cliente</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>Confirme os dados e o chamado é aberto e vinculado a esta conversa.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Nome completo *" style={inpForm} autoFocus />
                  <input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} placeholder="CPF" style={inpForm} />
                  <input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="WhatsApp" style={inpForm} />
                  <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="E-mail" style={inpForm} />
                  <select value={form.unidade_id} onChange={(e) => setForm((f) => ({ ...f, unidade_id: e.target.value }))} style={inpForm}>
                    <option value="">Unidade atendida *</option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                  <select value={form.motivo} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))} style={inpForm}>
                    <option value="">Motivo / assunto</option>
                    {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-primary" disabled={busy} onClick={confirmarChamado}><i className="ti ti-ticket" /> Abrir chamado</button>
                  <button className="btn" disabled={busy} onClick={() => setChamadoOpen(false)}>Cancelar</button>
                </div>
              </div>
            )}
            {notasOpen && (
              <div style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-2)', padding: 10, maxHeight: 200, overflowY: 'auto' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}><i className="ti ti-notes" /> Notas internas (não vão ao cliente)</div>
                {notasSel.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhuma nota ainda.</div>}
                {notasSel.map((n) => (
                  <div key={n.id} style={{ fontSize: 12.5, marginBottom: 6, borderLeft: '2px solid var(--gold-500)', paddingLeft: 8 }}>
                    <div>{n.texto}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{n.autor_nome || '—'} · {n.criada_em ? new Date(n.criada_em).toLocaleString('pt-BR') : ''}</div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input value={notaTxt} onChange={(e) => setNotaTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNota() }} placeholder="Adicionar nota interna…" style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }} />
                  <button className="btn" disabled={busy || !notaTxt.trim()} onClick={addNota}>Salvar</button>
                </div>
              </div>
            )}
            <div style={{ borderTop: '1px solid var(--line)', background: 'var(--surface)', padding: 10 }}>
              {aviso && <div style={{ fontSize: 12, color: 'var(--brand-600)', marginBottom: 6 }}>{aviso}</div>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileRef} type="file" hidden accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => { enviarArquivo(e.target.files?.[0]); e.currentTarget.value = '' }} />
                <button className="btn" title="Anexar arquivo/foto" disabled={busy} onClick={() => fileRef.current?.click()}><i className="ti ti-paperclip" /></button>
                <button className="btn" title={gravando ? 'Parar e enviar áudio' : 'Gravar áudio'} disabled={busy} onClick={gravarVoz} style={gravando ? { color: 'var(--red)', borderColor: 'var(--red)' } : undefined}><i className={`ti ${gravando ? 'ti-player-stop-filled' : 'ti-microphone'}`} /></button>
                <input
                  value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder={gravando ? '🔴 Gravando áudio…' : 'Responder pelo WhatsApp…'}
                  style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 20, fontSize: 13 }}
                />
                <button className="btn btn-primary" disabled={busy || !texto.trim()} onClick={enviar}>
                  <i className="ti ti-send" /> Enviar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
