import { NextResponse, type NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { normTel, listInstances, sendText, resolverInstancia, downloadMessage, type Instancia } from '@/lib/uazapi'
import { reHostMidia } from '@/lib/sac-midia'
import { gerarRespostaSAC, iaConfigurada, type MensagemHistorico } from '@/lib/ia'

/**
 * Webhook de entrada da UAZAPI. Grava as mensagens recebidas em
 * sac_whatsapp_chats + sac_whatsapp_mensagens (alimenta a Triagem WhatsApp).
 * Auth: `?secret=` / header x-webhook-secret == UAZAPI_WEBHOOK_SECRET, OU body.token == UAZAPI_TOKEN.
 * Configurar na UAZAPI: https://<dominio>/api/webhooks/uazapi?secret=<UAZAPI_WEBHOOK_SECRET>
 *
 * Cobre as DUAS formas de envelope documentadas (spec UAZAPI):
 *  (a) { EventType:'messages', message:{...} }            — forma "legada" plana
 *  (b) WebhookEvent { event:'message'|'messages_update'|'connection', instance, token, data:{...} }
 * O canal de ORIGEM (instance/token/owner) é resolvido contra canais_whatsapp para propagar
 * unidade_id ao chat (escopo por unidade) e rotear a resposta pelo MESMO número que recebeu.
 */
type Msg = {
  id?: string; messageid?: string; chatid?: string; fromMe?: boolean; isGroup?: boolean
  wasSentByApi?: boolean; messageType?: string; text?: string; senderName?: string
  messageTimestamp?: number; status?: string; fileURL?: string; owner?: string
}
type WebhookBody = {
  EventType?: string; event?: string
  message?: Msg; data?: Msg
  instance?: string; token?: string; owner?: string
}
type ChatRow = { id: string; nome: string | null; nao_lidas: number; bot_ativo?: boolean | null; atendente_id?: string | null }
type CanalBinding = { instancia_nome: string; unidade_id: string | null }

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

/** Em produção SEMPRE exige secret OU token. Só aceita anônimo em desenvolvimento
 *  (NODE_ENV !== 'production') quando nenhum secret está configurado — evita que uma env
 *  ausente no deploy abra o endpoint para gravações não autenticadas. */
function autorizado(req: NextRequest, body: WebhookBody): boolean {
  const secret = process.env.UAZAPI_WEBHOOK_SECRET
  const got = req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (secret && got === secret) return true
  const tk = process.env.UAZAPI_TOKEN
  if (tk && body.token && body.token === tk) return true
  if (process.env.NODE_ENV === 'production') return false // fora de dev, exige credencial
  return !secret // dev sem secret configurado: aceita
}

const isColMissing = (msg?: string | null) => /column|does not exist|schema cache|unidade_id|canal/i.test(msg || '')

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as WebhookBody | null
  if (!body) return NextResponse.json({ error: 'invalid-json' }, { status: 400 })
  if (!autorizado(req, body)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Normaliza o tipo de evento das duas formas: 'messages' (plano) e 'message' (envelope).
  const rawEvent = (body.EventType ?? body.event ?? '').toLowerCase()
  const eventKind =
    rawEvent === 'messages_update' ? 'messages_update'
    : rawEvent === 'connection' ? 'connection'
    : (rawEvent === 'messages' || rawEvent === 'message') ? 'messages'
    : rawEvent
  // O payload da mensagem vem em `message` (forma a) OU `data` (forma b — WebhookEvent).
  const msg = body.message ?? body.data
  const sb = adminClient()

  // ── Conexão: reflete queda/retorno do canal sem depender de polling em /canais ──
  if (eventKind === 'connection') {
    // Resolve o NOME real da instância (o evento pode trazer id/owner) p/ casar canais_whatsapp.
    const instancias = await listInstances().catch(() => [] as Instancia[])
    const inst = resolverInstancia(instancias, { instance: body.instance, token: body.token, owner: msg?.owner ?? body.owner })
    const nomeInst = inst?.name ?? (body.instance || msg?.owner || '').trim()
    const conectado = inst ? inst.status === 'connected'
      : /open|connected|online/i.test(String((msg as unknown as { status?: string })?.status ?? rawEvent))
    if (nomeInst) {
      // Atualiza o vínculo SE a tabela tiver coluna de status (defensivo: degrada se não existir).
      const { error } = await sb.from('canais_whatsapp').update({ status: conectado ? 'connected' : 'disconnected' }).eq('instancia_nome', nomeInst)
      if (error && !isColMissing(error.message)) console.error('webhook connection:', error.message)
    }
    return NextResponse.json({ ok: true, event: 'connection', instancia: nomeInst, conectado })
  }

  if (eventKind === 'messages_update') {
    const waId = msg?.messageid ?? msg?.id
    if (waId && msg?.status) await sb.from('sac_whatsapp_mensagens').update({ status: msg.status }).eq('wa_id', waId)
    return NextResponse.json({ ok: true, event: 'messages_update' })
  }
  if (eventKind !== 'messages' || !msg?.chatid) return NextResponse.json({ ignored: rawEvent || 'no-message' })
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

  // ── Canal de ORIGEM → unidade/escopo (escopo por unidade_id na entrada) ──
  // Identifica QUAL número/instância recebeu a mensagem para (1) carimbar a unidade no chat e
  // (2) responder pelo mesmo canal. Usa o vínculo confiável de canais_whatsapp (não regex de nome).
  const instancias = await listInstances().catch(() => [] as Instancia[])
  const inst = resolverInstancia(instancias, { instance: body.instance, token: body.token, owner: msg.owner ?? body.owner })
  let unidadeOrigem: string | null = null
  const canalNome: string | null = inst?.name ?? null
  if (inst?.name) {
    // Vínculo confiável canal⟷unidade (colunas confirmadas em canais_whatsapp).
    const { data: bind } = await sb.from('canais_whatsapp')
      .select('instancia_nome, unidade_id').eq('instancia_nome', inst.name).maybeSingle()
    const b = bind as CanalBinding | null
    if (b) unidadeOrigem = b.unidade_id ?? null
  }

  // Insert com escopo (unidade_id/canal_nome). Se as colunas não existirem no schema,
  // degrada para o insert mínimo — sem quebrar a entrada das mensagens.
  let chat: ChatRow | null = null
  const { data: chatRaw } = await sb.from('sac_whatsapp_chats').select('id, nome, nao_lidas, bot_ativo, atendente_id').eq('telefone', telefone).maybeSingle()
  chat = chatRaw as ChatRow | null

  if (!chat) {
    const baseInsert: Record<string, unknown> = {
      telefone, wa_chatid: msg.chatid, nome: !fromMe ? (msg.senderName || null) : null,
      ultima_msg: preview(tipo, texto), ultima_msg_tipo: tipo, ultima_msg_em: quando, nao_lidas: fromMe ? 0 : 1,
    }
    // Só inclui as chaves de escopo quando há valor — evita forçar null numa coluna NOT NULL.
    const comEscopo = { ...baseInsert, ...(unidadeOrigem ? { unidade_id: unidadeOrigem } : {}), ...(canalNome ? { canal_nome: canalNome } : {}) }
    let ins = await sb.from('sac_whatsapp_chats').insert(comEscopo).select('id, nome, nao_lidas, bot_ativo, atendente_id').single()
    if (ins.error && isColMissing(ins.error.message)) {
      ins = await sb.from('sac_whatsapp_chats').insert(baseInsert).select('id, nome, nao_lidas, bot_ativo, atendente_id').single()
    }
    if (ins.error || !ins.data) return NextResponse.json({ error: 'db-insert-failed' }, { status: 500 })
    chat = ins.data as ChatRow
  } else {
    const basePatch: Record<string, unknown> = {
      ultima_msg: preview(tipo, texto), ultima_msg_tipo: tipo, ultima_msg_em: quando,
      nao_lidas: fromMe ? chat.nao_lidas : (chat.nao_lidas ?? 0) + 1,
      ...(!fromMe && msg.senderName && !chat.nome ? { nome: msg.senderName } : {}),
    }
    // Reafirma o escopo no chat existente (caso tenha entrado antes do carimbo de unidade).
    const comEscopo = { ...basePatch, ...(unidadeOrigem ? { unidade_id: unidadeOrigem } : {}), ...(canalNome ? { canal_nome: canalNome } : {}) }
    let upd = await sb.from('sac_whatsapp_chats').update(comEscopo).eq('id', chat.id)
    if (upd.error && isColMissing(upd.error.message)) {
      upd = await sb.from('sac_whatsapp_chats').update(basePatch).eq('id', chat.id)
    }
  }

  // Mídia recebida: a UAZAPI nem sempre manda `fileURL` no webhook. Quando não vem, baixa via
  // /message/download (igual ao sistema antigo) usando o id interno da mensagem + token do canal
  // de origem, e re-hospeda no bucket permanente `sac-midia` — resolve o "[image]"/áudio que não
  // tocava E a expiração da URL temporária da UAZAPI (~2 dias).
  let midiaUrl: string | null = null
  let midiaMime: string | null = null
  if (['image', 'audio', 'video', 'document', 'sticker'].includes(tipo)) {
    let fonte = msg.fileURL || null
    const dlToken = inst?.token || process.env.UAZAPI_TOKEN || ''
    const midiaId = msg.id || msg.messageid || null
    if (!fonte && midiaId && dlToken) {
      const dl = await downloadMessage(dlToken, midiaId)
      if (dl.ok) { fonte = dl.fileURL || null; midiaMime = dl.mimetype || null }
    }
    if (fonte) midiaUrl = await reHostMidia(fonte, { mime: midiaMime, prefixo: 'recebidas' })
  }

  await sb.from('sac_whatsapp_mensagens').insert({
    chat_id: chat.id, wa_id: waId, direcao: fromMe ? 'saida' : 'entrada',
    autor: fromMe ? (msg.senderName || 'WhatsApp') : (msg.senderName || chat.nome || telefone),
    tipo, texto: texto || null,
    midia_url: midiaUrl, midia_mimetype: midiaMime,
    status: msg.status ?? null, criado_em: quando,
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
        // Responde pelo MESMO canal que recebeu (origem). Só cai pra heurística se a origem
        // não foi resolvida (envelope sem instance/token) — e nunca por outro número conectado.
        const canal = (inst && inst.status === 'connected' && inst.token)
          ? inst
          : instancias.find((i) => /laser/i.test(i.name) && i.status === 'connected')
        if (canal?.token) {
          const env = await sendText(canal.token, telefone, r.resposta)
          const ag = new Date().toISOString()
          await sb.from('sac_whatsapp_mensagens').insert({
            chat_id: chat.id, wa_id: env.messageid ?? null, direcao: 'saida', autor: 'Assistente IA',
            tipo: 'text', texto: r.resposta, status: env.ok ? (env.status ?? 'sent') : 'failed', criado_em: ag,
          })
          const patch: Record<string, unknown> = { ultima_msg: r.resposta.slice(0, 120), ultima_msg_tipo: 'text', ultima_msg_em: ag }
          if (r.transferir) patch.bot_ativo = false // assunto sensível → fila humana
          if (r.nomeCliente && !chat.nome) patch.nome = r.nomeCliente
          await sb.from('sac_whatsapp_chats').update(patch).eq('id', chat.id)
          return NextResponse.json({ ok: true, telefone, ia: true, transferir: r.transferir, canal: canal.name })
        }
      }
    } catch (e) { console.error('webhook IA:', (e as Error).message) }
  }

  return NextResponse.json({ ok: true, telefone, direcao: fromMe ? 'saida' : 'entrada', unidade: unidadeOrigem })
}

export async function GET(req: NextRequest) {
  const secret = process.env.UAZAPI_WEBHOOK_SECRET
  const got = req.nextUrl.searchParams.get('secret') ?? ''
  if (secret && got !== secret) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true, info: 'Webhook UAZAPI ativo.' })
}
