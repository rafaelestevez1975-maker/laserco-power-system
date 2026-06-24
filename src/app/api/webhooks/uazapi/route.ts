import { NextResponse, type NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { normTel, listInstances, sendText } from '@/lib/uazapi'
import { gerarRespostaSAC, iaConfigurada, type MensagemHistorico } from '@/lib/ia'

/**
 * Webhook de entrada da UAZAPI. Grava as mensagens recebidas em
 * sac_whatsapp_chats + sac_whatsapp_mensagens (alimenta a Triagem WhatsApp).
 * Auth: `?secret=` / header x-webhook-secret == UAZAPI_WEBHOOK_SECRET, OU body.token == UAZAPI_TOKEN.
 * Configurar na UAZAPI: https://<dominio>/api/webhooks/uazapi?secret=<UAZAPI_WEBHOOK_SECRET>
 */
type Msg = {
  id?: string; messageid?: string; chatid?: string; fromMe?: boolean; isGroup?: boolean
  wasSentByApi?: boolean; messageType?: string; text?: string; senderName?: string
  messageTimestamp?: number; status?: string; fileURL?: string
}
type WebhookBody = { EventType?: string; event?: string; message?: Msg; token?: string }
type ChatRow = { id: string; nome: string | null; nao_lidas: number; bot_ativo?: boolean | null; atendente_id?: string | null }

function classificarTipo(mt?: string): string {
  const t = (mt ?? '').toLowerCase()
  if (!t || t.includes('conversation') || t.includes('text')) return 'text'
  if (t.includes('image')) return 'image'
  if (t.includes('audio') || t.includes('ptt')) return 'audio'
  if (t.includes('video')) return 'video'
  if (t.includes('document')) return 'document'
  if (t.includes('sticker')) return 'sticker'
  if (t.includes('location')) return 'location'
  if (t.includes('contact')) return 'contact'
  return 'outro'
}
const PREVIEW: Record<string, string> = { text: '', image: '📷 Imagem', audio: '🎤 Áudio', video: '🎬 Vídeo', document: '📎 Documento', sticker: '🏷️ Figurinha', location: '📍 Localização', contact: '👤 Contato', outro: '📩 Mensagem' }
function preview(tipo: string, texto: string) { return tipo === 'text' ? texto.slice(0, 120) : (texto ? `${PREVIEW[tipo]} · ${texto.slice(0, 100)}` : PREVIEW[tipo]) }

function autorizado(req: NextRequest, body: WebhookBody): boolean {
  const secret = process.env.UAZAPI_WEBHOOK_SECRET
  const got = req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (secret && got === secret) return true
  const tk = process.env.UAZAPI_TOKEN
  if (tk && body.token && body.token === tk) return true
  return !secret // se nenhum secret configurado, aceita (dev)
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as WebhookBody | null
  if (!body) return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  if (!autorizado(req, body)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const event = body.EventType ?? body.event ?? ''
  const msg = body.message
  const sb = adminClient()

  if (event === 'messages_update') {
    const waId = msg?.messageid ?? msg?.id
    if (waId && msg?.status) await sb.from('sac_whatsapp_mensagens').update({ status: msg.status }).eq('wa_id', waId)
    return NextResponse.json({ ok: true, event })
  }
  if (event !== 'messages' || !msg?.chatid) return NextResponse.json({ ignored: event || 'no-message' })
  if (msg.isGroup) return NextResponse.json({ ignored: 'group' })
  if (msg.wasSentByApi) return NextResponse.json({ ignored: 'sent-by-api' })

  const telefone = normTel(msg.chatid)
  if (!telefone) return NextResponse.json({ ignored: 'invalid-tel' })

  const fromMe = msg.fromMe === true
  const tipo = classificarTipo(msg.messageType)
  const texto = (msg.text ?? '').trim()
  const waId = msg.messageid ?? msg.id ?? null
  const quando = msg.messageTimestamp ? new Date(msg.messageTimestamp).toISOString() : new Date().toISOString()

  if (waId) {
    const { data: dup } = await sb.from('sac_whatsapp_mensagens').select('id').eq('wa_id', waId).maybeSingle()
    if (dup) return NextResponse.json({ ok: true, dedup: true })
  }

  const { data: chatRaw } = await sb.from('sac_whatsapp_chats').select('id, nome, nao_lidas, bot_ativo, atendente_id').eq('telefone', telefone).maybeSingle()
  let chat = chatRaw as ChatRow | null
  if (!chat) {
    const { data: created, error } = await sb.from('sac_whatsapp_chats').insert({
      telefone, wa_chatid: msg.chatid, nome: !fromMe ? (msg.senderName || null) : null,
      ultima_msg: preview(tipo, texto), ultima_msg_tipo: tipo, ultima_msg_em: quando, nao_lidas: fromMe ? 0 : 1,
    }).select('id, nome, nao_lidas, bot_ativo, atendente_id').single()
    if (error || !created) return NextResponse.json({ error: 'db-insert-failed' }, { status: 500 })
    chat = created as ChatRow
  } else {
    await sb.from('sac_whatsapp_chats').update({
      ultima_msg: preview(tipo, texto), ultima_msg_tipo: tipo, ultima_msg_em: quando,
      nao_lidas: fromMe ? chat.nao_lidas : (chat.nao_lidas ?? 0) + 1,
      ...(!fromMe && msg.senderName && !chat.nome ? { nome: msg.senderName } : {}),
    }).eq('id', chat.id)
  }

  await sb.from('sac_whatsapp_mensagens').insert({
    chat_id: chat.id, wa_id: waId, direcao: fromMe ? 'saida' : 'entrada',
    autor: fromMe ? (msg.senderName || 'WhatsApp') : (msg.senderName || chat.nome || telefone),
    tipo, texto: texto || null, midia_url: msg.fileURL || null, status: msg.status ?? null, criado_em: quando,
  })

  // IA de atendimento (OpenRouter): responde quando é mensagem do cliente,
  // o bot está ativo, não há atendente humano e a IA está configurada.
  const botAtivo = chat.bot_ativo ?? true
  if (!fromMe && tipo === 'text' && texto && botAtivo && !chat.atendente_id && iaConfigurada()) {
    try {
      const { data: hist } = await sb.from('sac_whatsapp_mensagens')
        .select('direcao, autor, texto').eq('chat_id', chat.id).order('criado_em', { ascending: true }).limit(20)
      const historico: MensagemHistorico[] = (hist ?? []).map((m: { direcao: string | null; autor: string | null; texto: string | null }) => ({
        autor: /entrada/i.test(m.direcao || '') ? 'cliente' : (/assistente|ia|bot/i.test(m.autor || '') ? 'ia' : 'atendente'),
        texto: m.texto || '',
      }))
      const r = await gerarRespostaSAC(historico)
      if (r?.resposta) {
        const all = await listInstances()
        const canal = all.find((i) => /laser/i.test(i.name) && i.status === 'connected')
        if (canal?.token) {
          const env = await sendText(canal.token, telefone, r.resposta)
          const ag = new Date().toISOString()
          await sb.from('sac_whatsapp_mensagens').insert({
            chat_id: chat.id, direcao: 'saida', autor: 'Assistente IA', tipo: 'text', texto: r.resposta, status: env.ok ? 'sent' : 'failed', criado_em: ag,
          })
          const patch: Record<string, unknown> = { ultima_msg: r.resposta.slice(0, 120), ultima_msg_tipo: 'text', ultima_msg_em: ag }
          if (r.transferir) patch.bot_ativo = false // assunto sensível → fila humana
          if (r.nomeCliente && !chat.nome) patch.nome = r.nomeCliente
          await sb.from('sac_whatsapp_chats').update(patch).eq('id', chat.id)
          return NextResponse.json({ ok: true, telefone, ia: true, transferir: r.transferir })
        }
      }
    } catch (e) { console.error('webhook IA:', (e as Error).message) }
  }

  return NextResponse.json({ ok: true, telefone, direcao: fromMe ? 'saida' : 'entrada' })
}

export async function GET(req: NextRequest) {
  const secret = process.env.UAZAPI_WEBHOOK_SECRET
  const got = req.nextUrl.searchParams.get('secret') ?? ''
  if (secret && got !== secret) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true, info: 'Webhook UAZAPI ativo.' })
}
