'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { responderConversa, abrirChamadoDaConversa, assumirConversa, devolverConversa, transferirConversa, marcarLido, adicionarNota, alterarStatusConversa, reativarIA } from '@/app/(app)/sac/triagem/actions'

export type Chat = { id: string; telefone: string | null; nome: string | null; ultima_msg: string | null; ultima_msg_em: string | null; nao_lidas: number | null; bot_ativo: boolean | null; ticket_id: string | null; atendente_id: string | null; status: string | null }
export type Msg = { id: string; chat_id: string | null; direcao: string | null; autor: string | null; tipo: string | null; texto: string | null; criado_em: string | null }
export type Atendente = { id: string; nome: string }
export type Nota = { id: string; chat_id: string | null; autor_nome: string | null; texto: string | null; criada_em: string | null }

const SLA_MIN = 5
const STATUS_LABEL: Record<string, string> = { aberto: 'Aberto', pendente: 'Pendente', resolvido: 'Resolvido' }

const isIn = (d: string | null) => !/out|saida|saída|enviad|atendente|bot/i.test(d || '')
const hora = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
const iniciais = (n: string | null, tel: string | null) => (n?.trim()?.[0]?.toUpperCase()) || (tel ? tel.slice(-2) : '?')

type Aba = 'minhas' | 'fila' | 'todas'

export function TriagemWhatsapp({ chats, msgs, atendentes, notas, operadorId }: { chats: Chat[]; msgs: Msg[]; atendentes: Atendente[]; notas: Nota[]; operadorId: string | null }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState<Aba>('todas')
  const [sel, setSel] = useState<string | null>(chats[0]?.id ?? null)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')
  const [lidos, setLidos] = useState<Set<string>>(new Set())
  const [transfer, setTransfer] = useState('')
  const [notasOpen, setNotasOpen] = useState(false)
  const [notaTxt, setNotaTxt] = useState('')

  // última mensagem por conversa → base do SLA de 1ª resposta (espera quando a última é do cliente)
  const ultimaMsgChat = useMemo(() => { const m = new Map<string, Msg>(); for (const x of msgs) if (x.chat_id) m.set(x.chat_id, x); return m }, [msgs])
  const aguardandoMin = (chatId: string): number | null => {
    const lm = ultimaMsgChat.get(chatId)
    if (!lm || !isIn(lm.direcao) || !lm.criado_em) return null
    return Math.floor((Date.now() - new Date(lm.criado_em).getTime()) / 60000)
  }

  const nomeAtendente = useMemo(() => new Map(atendentes.map((a) => [a.id, a.nome])), [atendentes])
  const minhasN = chats.filter((c) => c.atendente_id && c.atendente_id === operadorId).length
  const filaN = chats.filter((c) => !c.atendente_id).length

  function selecionar(id: string) {
    setSel(id); setAviso('')
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
  async function abrirChamado() {
    if (!sel) return
    setBusy(true); setAviso('')
    const res = await abrirChamadoDaConversa(sel)
    setBusy(false)
    if (!res.ok) setAviso(res.error || 'Falha ao abrir chamado.')
    else { setAviso(res.jaExistia ? 'Esta conversa já tem um chamado vinculado.' : 'Chamado aberto e vinculado à conversa. ✅'); router.refresh() }
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
    if (aba === 'minhas') arr = arr.filter((c) => c.atendente_id && c.atendente_id === operadorId)
    else if (aba === 'fila') arr = arr.filter((c) => !c.atendente_id)
    if (q) arr = arr.filter((c) => (c.nome || '').toLowerCase().includes(q) || (c.telefone || '').includes(q))
    return arr
  }, [chats, busca, aba, operadorId])

  const thread = useMemo(() => msgs.filter((m) => m.chat_id === sel), [msgs, sel])
  const chat = chats.find((c) => c.id === sel) || null
  const minha = !!chat?.atendente_id && chat.atendente_id === operadorId
  const respNome = chat?.atendente_id ? (nomeAtendente.get(chat.atendente_id) || 'Atribuído') : null
  const espera = chat ? aguardandoMin(chat.id) : null
  const notasSel = notas.filter((n) => n.chat_id === sel)
  const stat = chat?.status || 'aberto'

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

  return (
    <div className="cli-card" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 220px)', minHeight: 420, overflow: 'hidden' }}>
      {/* Lista de conversas */}
      <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          <div style={tab('todas')} onClick={() => setAba('todas')}>Todas ({chats.length})</div>
          <div style={tab('minhas')} onClick={() => setAba('minhas')}>Minhas ({minhasN})</div>
          <div style={tab('fila')} onClick={() => setAba('fila')}>Fila ({filaN})</div>
        </div>
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar conversa..."
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
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
                <select value={stat} disabled={busy} onChange={(e) => acao(() => alterarStatusConversa(chat.id, e.target.value as 'aberto' | 'pendente' | 'resolvido'), 'Status atualizado.')}
                  style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }} title="Status da conversa">
                  {(['aberto', 'pendente', 'resolvido'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
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
                  : <button className="btn btn-primary" disabled={busy} onClick={abrirChamado}><i className="ti ti-headset" /> Abrir chamado</button>}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {thread.length === 0 && <div style={{ margin: 'auto', color: 'var(--text-3)', fontSize: 13 }}>Sem mensagens nesta conversa.</div>}
              {thread.map((m) => {
                const entrada = isIn(m.direcao)
                return (
                  <div key={m.id} style={{ alignSelf: entrada ? 'flex-start' : 'flex-end', maxWidth: '72%', background: entrada ? 'var(--surface)' : '#DCF8C6', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 11px' }}>
                    {!entrada && m.autor && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-600)', marginBottom: 1 }}>{m.autor}</div>}
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.texto || <i style={{ color: 'var(--text-3)' }}>[{m.tipo || 'mídia'}]</i>}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right', marginTop: 2 }}>{hora(m.criado_em)}</div>
                  </div>
                )
              })}
            </div>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={texto} onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder="Responder pelo WhatsApp…"
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
