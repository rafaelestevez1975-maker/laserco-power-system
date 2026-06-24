'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { responderConversa, abrirChamadoDaConversa } from '@/app/(app)/sac/triagem/actions'

export type Chat = { id: string; telefone: string | null; nome: string | null; ultima_msg: string | null; ultima_msg_em: string | null; nao_lidas: number | null; bot_ativo: boolean | null; ticket_id: string | null }
export type Msg = { id: string; chat_id: string | null; direcao: string | null; autor: string | null; tipo: string | null; texto: string | null; criado_em: string | null }

const isIn = (d: string | null) => !/out|saida|saída|enviad|atendente|bot/i.test(d || '')
const hora = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '')
const iniciais = (n: string | null, tel: string | null) => (n?.trim()?.[0]?.toUpperCase()) || (tel ? tel.slice(-2) : '?')

export function TriagemWhatsapp({ chats, msgs }: { chats: Chat[]; msgs: Msg[] }) {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<string | null>(chats[0]?.id ?? null)
  const [texto, setTexto] = useState('')
  const [busy, setBusy] = useState(false)
  const [aviso, setAviso] = useState('')

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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? chats.filter((c) => (c.nome || '').toLowerCase().includes(q) || (c.telefone || '').includes(q)) : chats
  }, [chats, busca])

  const thread = useMemo(() => msgs.filter((m) => m.chat_id === sel), [msgs, sel])
  const chat = chats.find((c) => c.id === sel) || null

  return (
    <div className="cli-card" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 220px)', minHeight: 420, overflow: 'hidden' }}>
      {/* Lista de conversas */}
      <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔎 Buscar conversa..."
            style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtrados.length === 0 && <div style={{ padding: 16, color: 'var(--text-3)', fontSize: 13 }}>Nenhuma conversa.</div>}
          {filtrados.map((c) => (
            <div key={c.id} onClick={() => setSel(c.id)}
              style={{ display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line)', background: c.id === sel ? 'var(--surface-2)' : undefined }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: '50%', background: 'var(--brand-500)', color: '#fff', fontWeight: 700, flexShrink: 0 }}>{iniciais(c.nome, c.telefone)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome || c.telefone || ''}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)', flexShrink: 0 }}>{hora(c.ultima_msg_em)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.ultima_msg || ''}</div>
              </div>
              {!!c.nao_lidas && <span style={{ alignSelf: 'center', background: 'var(--green)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center', padding: '0 5px' }}>{c.nao_lidas}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg)' }}>
        {!chat ? (
          <div style={{ margin: 'auto', color: 'var(--text-3)' }}>Selecione uma conversa</div>
        ) : (
          <>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', background: 'var(--brand-500)', color: '#fff', fontWeight: 700 }}>{iniciais(chat.nome, chat.telefone)}</span>
              <div>
                <b style={{ fontSize: 13 }}>{chat.nome || chat.telefone}</b>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{chat.telefone} {chat.bot_ativo ? '· 🤖 bot ativo' : ''}</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
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
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.texto || <i style={{ color: 'var(--text-3)' }}>[{m.tipo || 'mídia'}]</i>}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right', marginTop: 2 }}>{hora(m.criado_em)}</div>
                  </div>
                )
              })}
            </div>
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
