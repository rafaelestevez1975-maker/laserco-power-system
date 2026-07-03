/**
 * Backfill do HISTÓRICO do WhatsApp (pedido do Julio 02/07): puxa da UAZAPI as últimas
 * conversas (até 500) e importa as mensagens que o sistema não tem (dedup por wa_id) 
 * cobre o período anterior ao webhook e qualquer janela de falha.
 * Uso: node scripts/backfill-whatsapp-historico.mjs [maxChats] [msgsPorChat]
 * Idempotente: rodar de novo só completa o que faltar.
 */
import { readFileSync } from 'fs'

const MAX_CHATS = Number(process.argv[2]) || 500
const MSGS_POR_CHAT = Number(process.argv[3]) || 200

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const BASE = (env.UAZAPI_BASE_URL || '').replace(/\/$/, '')
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

const insts = await (await fetch(`${BASE}/instance/all`, { headers: { admintoken: env.UAZAPI_ADMIN_TOKEN } })).json()
const laser = insts.find((i) => i.name === 'Laser - WhatsApp')
if (!laser?.token) { console.error('Instância Laser não encontrada'); process.exit(1) }
const UZ = { token: laser.token, 'Content-Type': 'application/json' }

const normTel = (chatid) => (chatid || '').replace(/@.*$/, '').replace(/\D/g, '')
const tipoDe = (mt) => { const t = (mt || '').toLowerCase()
  if (!t || t.includes('conversation') || t.includes('text')) return 'text'
  if (t.includes('image')) return 'image'; if (t.includes('audio') || t.includes('ptt')) return 'audio'
  if (t.includes('video')) return 'video'; if (t.includes('document')) return 'document'
  if (t.includes('sticker')) return 'sticker'; return 'outro' }

// 1) últimas conversas na UAZAPI (individuais)
const chatsRes = await (await fetch(`${BASE}/chat/find`, { method: 'POST', headers: UZ, body: JSON.stringify({ operator: 'AND', sort: '-wa_lastMsgTimestamp', limit: MAX_CHATS }) })).json()
const uzChats = (chatsRes.chats || []).filter((c) => (c.wa_chatid || c.id || '').includes('@s.whatsapp.net'))
console.log(`UAZAPI: ${uzChats.length} conversas individuais`)

// 2) chats existentes no sistema (telefone → id)
const nossos = await (await fetch(`${SB_URL}/rest/v1/sac_whatsapp_chats?select=id,telefone`, { headers: H })).json()
const chatPorTel = new Map(nossos.map((c) => [c.telefone, c.id]))

let chatsNovos = 0, msgsNovas = 0, falhas = 0
for (const uc of uzChats) {
  const chatid = uc.wa_chatid || uc.id
  const tel = normTel(chatid)
  if (!tel) continue
  try {
    // 2a) garante o chat no sistema
    let chatDbId = chatPorTel.get(tel)
    if (!chatDbId) {
      const nome = uc.wa_contactName || uc.wa_name || uc.name || null
      const ins = await fetch(`${SB_URL}/rest/v1/sac_whatsapp_chats`, {
        method: 'POST', headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ telefone: tel, wa_chatid: `${tel}@s.whatsapp.net`, nome, ultima_msg: null, nao_lidas: 0, status: 'aberto' }),
      })
      const row = (await ins.json())[0]
      if (!row?.id) { falhas++; continue }
      chatDbId = row.id; chatPorTel.set(tel, chatDbId); chatsNovos++
    }
    // 2b) histórico na UAZAPI
    const mRes = await (await fetch(`${BASE}/message/find`, { method: 'POST', headers: UZ, body: JSON.stringify({ chatid, limit: MSGS_POR_CHAT }) })).json()
    const msgs = (mRes.messages || []).filter((m) => m.messageid || m.id)
    if (!msgs.length) continue
    // 2c) dedup por wa_id  GLOBAL (o índice único de wa_id vale para a tabela toda)
    const waIds = msgs.map((m) => m.messageid || m.id)
    const existRes = await fetch(`${SB_URL}/rest/v1/sac_whatsapp_mensagens?select=wa_id&wa_id=in.(${waIds.map((w) => `"${w}"`).join(',')})`, { headers: H })
    const jaTem = new Set((await existRes.json()).map((r) => r.wa_id))
    const novas = msgs.filter((m) => !jaTem.has(m.messageid || m.id)).map((m) => ({
      chat_id: chatDbId, wa_id: m.messageid || m.id,
      direcao: m.fromMe ? 'saida' : 'entrada',
      autor: m.fromMe ? (m.senderName || 'WhatsApp') : (m.senderName || tel),
      tipo: tipoDe(m.messageType),
      texto: (m.text || m.content?.text || '').trim() || null,
      midia_url: m.fileURL || null,
      status: m.status || null,
      criado_em: m.messageTimestamp ? new Date(m.messageTimestamp).toISOString() : new Date().toISOString(),
    }))
    for (let i = 0; i < novas.length; i += 200) {
      const lote = novas.slice(i, i + 200)
      const r = await fetch(`${SB_URL}/rest/v1/sac_whatsapp_mensagens`, { method: 'POST', headers: H, body: JSON.stringify(lote) })
      if (r.ok) msgsNovas += lote.length
      else { falhas++; console.error(tel, 'insert:', (await r.text()).slice(0, 120)) }
    }
    // CRÍTICO (lição de 02/07): preencher ultima_msg_em do chat  a lista da Conversa ordena por
    // essa data; chat sem ela (null) ia pro TOPO (nulls first) e escondia as conversas ativas.
    // Só atualiza se a mensagem importada for mais nova que a atual do chat (não rebaixa ativas).
    const maisNova = msgs.reduce((a, m) => (m.messageTimestamp > (a?.messageTimestamp ?? 0) ? m : a), null)
    if (maisNova) {
      const em = new Date(maisNova.messageTimestamp).toISOString()
      await fetch(`${SB_URL}/rest/v1/sac_whatsapp_chats?id=eq.${chatDbId}&or=(ultima_msg_em.is.null,ultima_msg_em.lt.${em})`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ ultima_msg_em: em, ultima_msg: ((maisNova.text || maisNova.content?.text || '📩 Mensagem') + '').slice(0, 120), ultima_msg_tipo: tipoDe(maisNova.messageType) }),
      }).catch(() => {})
    }
  } catch (e) { falhas++; console.error(tel, (e).message) }
}
console.log(`\nRESULTADO: ${chatsNovos} conversa(s) nova(s) criada(s) · ${msgsNovas} mensagem(ns) importada(s) · ${falhas} falha(s)`)
