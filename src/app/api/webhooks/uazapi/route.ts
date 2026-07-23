import { NextResponse, type NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { normTel, listInstances, sendText, resolverInstancia, downloadMessage, type Instancia } from '@/lib/uazapi'
import { reHostMidia } from '@/lib/sac-midia'
import { escolherAtendenteOnline } from '@/lib/sac-distribuicao'
import { gerarRespostaSAC, iaConfigurada, expedienteSac, type MensagemHistorico } from '@/lib/ia'
import { FRANQUEADORA_EMPRESA_ID, resolverMotivoSac } from '@/lib/sac-ingest'

/**
 * Webhook de entrada da UAZAPI. Grava as mensagens recebidas em
 * sac_whatsapp_chats + sac_whatsapp_mensagens (alimenta a Conversa).
 * Auth: `?secret=` / header x-webhook-secret == UAZAPI_WEBHOOK_SECRET, OU body.token == UAZAPI_TOKEN.
 * Configurar na UAZAPI: https://<dominio>/api/webhooks/uazapi?secret=<UAZAPI_WEBHOOK_SECRET>
 *
 * Cobre as DUAS formas de envelope documentadas (spec UAZAPI):
 *  (a) { EventType:'messages', message:{...} }             forma "legada" plana
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
type ChatRow = { id: string; nome: string | null; nao_lidas: number; bot_ativo?: boolean | null; atendente_id?: string | null; ticket_id?: string | null }
type CanalBinding = { instancia_nome: string; unidade_id: string | null; atendente_id?: string | null }

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

/**
 * O senderName às vezes chega como variável de template não substituída
 * (ex.: "{{whatsappQuestion_niwwk0xy07m}}") e virava o NOME do cliente no sistema —
 * 26 cadastros nasceram assim. Descarta qualquer nome com {{...}} ou {…}.
 */
function nomeLimpo(n: string | null | undefined): string | null {
  const s = (n ?? '').trim()
  if (!s || /\{\{|\}\}|^\{.*\}$/.test(s)) return null
  return s
}

/** Em produção SEMPRE exige secret OU token. Só aceita anônimo em desenvolvimento
 *  (NODE_ENV !== 'production') quando nenhum secret está configurado  evita que uma env
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
  // O payload da mensagem vem em `message` (forma a) OU `data` (forma b  WebhookEvent).
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
  // NÃO ignorar wasSentByApi: as "mensagens automáticas" configuradas na própria UAZAPI (e
  // qualquer envio via API feito fora do sistema) chegam só com essa flag  ignorá-las deixava
  // a conversa "Sem mensagens" no sistema enquanto o WhatsApp mostrava a resposta. Os envios do
  // PRÓPRIO sistema não duplicam: eles gravam o wa_id na hora do envio e o dedup abaixo segura.

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
  let canalAtendenteId: string | null = null // canal de número PRÓPRIO de uma atendente (modelo híbrido)
  const canalNome: string | null = inst?.name ?? null
  if (inst?.name) {
    // Vínculo confiável canal⟷unidade/atendente (colunas confirmadas em canais_whatsapp).
    const { data: bind } = await sb.from('canais_whatsapp')
      .select('instancia_nome, unidade_id, atendente_id').eq('instancia_nome', inst.name).maybeSingle()
    const b = bind as CanalBinding | null
    if (b) { unidadeOrigem = b.unidade_id ?? null; canalAtendenteId = b.atendente_id ?? null }
  }

  // Insert com escopo (unidade_id/canal_nome). Se as colunas não existirem no schema,
  // degrada para o insert mínimo  sem quebrar a entrada das mensagens.
  let chat: ChatRow | null = null
  const { data: chatRaw } = await sb.from('sac_whatsapp_chats').select('id, nome, nao_lidas, bot_ativo, atendente_id, ticket_id').eq('telefone', telefone).maybeSingle()
  chat = chatRaw as ChatRow | null

  if (!chat) {
    const baseInsert: Record<string, unknown> = {
      telefone, wa_chatid: msg.chatid, nome: !fromMe ? nomeLimpo(msg.senderName) : null,
      ultima_msg: preview(tipo, texto), ultima_msg_tipo: tipo, ultima_msg_em: quando, nao_lidas: fromMe ? 0 : 1,
    }
    // Só inclui as chaves de escopo quando há valor  evita forçar null numa coluna NOT NULL.
    const comEscopo = { ...baseInsert, ...(unidadeOrigem ? { unidade_id: unidadeOrigem } : {}), ...(canalNome ? { canal_nome: canalNome } : {}) }
    let ins = await sb.from('sac_whatsapp_chats').insert(comEscopo).select('id, nome, nao_lidas, bot_ativo, atendente_id, ticket_id').single()
    if (ins.error && isColMissing(ins.error.message)) {
      ins = await sb.from('sac_whatsapp_chats').insert(baseInsert).select('id, nome, nao_lidas, bot_ativo, atendente_id, ticket_id').single()
    }
    if (ins.error || !ins.data) return NextResponse.json({ error: 'db-insert-failed' }, { status: 500 })
    chat = ins.data as ChatRow
  } else {
    const basePatch: Record<string, unknown> = {
      ultima_msg: preview(tipo, texto), ultima_msg_tipo: tipo, ultima_msg_em: quando,
      nao_lidas: fromMe ? chat.nao_lidas : (chat.nao_lidas ?? 0) + 1,
      ...(!fromMe && nomeLimpo(msg.senderName) && !chat.nome ? { nome: nomeLimpo(msg.senderName) } : {}),
    }
    // Reafirma o escopo no chat existente (caso tenha entrado antes do carimbo de unidade).
    const comEscopo = { ...basePatch, ...(unidadeOrigem ? { unidade_id: unidadeOrigem } : {}), ...(canalNome ? { canal_nome: canalNome } : {}) }
    let upd = await sb.from('sac_whatsapp_chats').update(comEscopo).eq('id', chat.id)
    if (upd.error && isColMissing(upd.error.message)) {
      upd = await sb.from('sac_whatsapp_chats').update(basePatch).eq('id', chat.id)
    }
  }

  // ── Fluxo de atendimento (pedido do Julio): a IA faz o PRIMEIRO atendimento; a atendente humana
  // entra só quando (a) o canal é de número PRÓPRIO de uma atendente, (b) a IA não está no circuito
  // (sem IA configurada, bot desligado, ou mensagem não-texto), ou (c) a IA transfere/falha (abaixo).
  // Antes a distribuição atribuía humana na hora e a IA (que só responde sem dono) nunca disparava. ──
  const botAtivo = chat.bot_ativo ?? true
  const iaAtende = !fromMe && tipo === 'text' && !!texto && botAtivo && !chat.atendente_id && iaConfigurada() && !canalAtendenteId
  if (!fromMe && chat && !chat.atendente_id) {
    try {
      if (canalAtendenteId) {
        // Número próprio → direto pra dona (não passa pela IA central).
        const { error: eAtr } = await sb.from('sac_whatsapp_chats').update({ atendente_id: canalAtendenteId }).eq('id', chat.id)
        if (!eAtr) chat.atendente_id = canalAtendenteId
      } else if (!iaAtende) {
        // IA fora do circuito (sem IA / bot off / mídia) → distribui pra atendente online menos carregada.
        const alvo = await escolherAtendenteOnline(sb, unidadeOrigem)
        if (alvo) { const { error: eAtr } = await sb.from('sac_whatsapp_chats').update({ atendente_id: alvo }).eq('id', chat.id); if (!eAtr) chat.atendente_id = alvo }
      }
      // iaAtende === true → NÃO atribui agora; a IA responde primeiro (bloco de IA abaixo).
    } catch (e) { console.error('webhook auto-distribuição:', (e as Error).message) }
  }

  // Mídia recebida: a UAZAPI nem sempre manda `fileURL` no webhook. Quando não vem, baixa via
  // /message/download (igual ao sistema antigo) usando o id interno da mensagem + token do canal
  // de origem, e re-hospeda no bucket permanente `sac-midia`  resolve o "[image]"/áudio que não
  // tocava E a expiração da URL temporária da UAZAPI (~2 dias).
  let midiaUrl: string | null = null
  let midiaMime: string | null = null
  if (['image', 'audio', 'video', 'document', 'sticker'].includes(tipo)) {
    // Nunca deixar uma falha de download/re-host derrubar a gravação da mensagem (item: sync):
    // se der erro, grava a mensagem sem a mídia (melhor do que sumir do sistema).
    try {
      let fonte = msg.fileURL || null
      const dlToken = inst?.token || process.env.UAZAPI_TOKEN || ''
      const midiaId = msg.id || msg.messageid || null
      if (!fonte && midiaId && dlToken) {
        const dl = await downloadMessage(dlToken, midiaId)
        if (dl.ok) { fonte = dl.fileURL || null; midiaMime = dl.mimetype || null }
      }
      if (fonte) midiaUrl = await reHostMidia(fonte, { mime: midiaMime, prefixo: 'recebidas' })
    } catch (e) { console.error('webhook mídia (segue sem anexo):', (e as Error).message) }
  }

  // Se a gravação da MENSAGEM falhar, responde 500 → a UAZAPI reenvia o evento e nada se perde.
  // (Antes o erro era engolido: o chat já tinha atualizado o preview, mas a mensagem sumia  o
  // "cliente mandou e não apareceu no sistema" relatado pelas atendentes.)
  const { error: eMsg } = await sb.from('sac_whatsapp_mensagens').insert({
    chat_id: chat.id, wa_id: waId, direcao: fromMe ? 'saida' : 'entrada',
    autor: fromMe ? (nomeLimpo(msg.senderName) || 'WhatsApp') : (nomeLimpo(msg.senderName) || chat.nome || telefone),
    tipo, texto: texto || null,
    midia_url: midiaUrl, midia_mimetype: midiaMime,
    status: msg.status ?? null, criado_em: quando,
  })
  if (eMsg) {
    console.error('webhook msg-insert:', eMsg.message)
    return NextResponse.json({ error: 'db-msg-insert-failed' }, { status: 500 })
  }

  // IA de atendimento (OpenRouter): faz o 1º atendimento (iaAtende calculado acima).
  if (iaAtende) {
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
        // não foi resolvida (envelope sem instance/token)  e nunca por outro número conectado.
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
          if (r.transferir) {
            // Assunto sensível/que a IA não resolve → desliga o bot e passa pra fila humana.
            // Roteamento por ESPECIALIDADE: usa o motivo já classificado pela IA para escolher
            // o analista do assunto (Reestruturação do SAC); cai para menos carregada se ninguém.
            patch.bot_ativo = false
            const motivoLabel = resolverMotivoSac({ motivo: r.motivo, assunto: r.motivo, mensagem: texto })
            const alvo = await escolherAtendenteOnline(sb, unidadeOrigem, motivoLabel).catch(() => null)
            if (alvo) patch.atendente_id = alvo
            // Pedido do Julio (02/07): quando a IA identifica o problema, ela JÁ ABRE o chamado
            // (nome/CPF/motivo coletados) e distribui  a atendente não precisa abrir manual.
            if (!chat.ticket_id) {
              try {
                const cpfDig = (r.cpf || '').replace(/\D/g, '')
                const { data: tIns, error: eT } = await sb.from('sac_tickets').insert({
                  empresa_id: FRANQUEADORA_EMPRESA_ID, unidade_id: unidadeOrigem, // SAC centralizado (rede)  carimba a unidade se o canal tiver
                  nome_cliente: (nomeLimpo(r.nomeCliente) || nomeLimpo(chat.nome) || telefone).trim(),
                  cpf_cliente: cpfDig.length === 11 ? cpfDig : null,
                  telefone_cliente: telefone,
                  assunto: (r.motivo || 'Atendimento WhatsApp (IA)').slice(0, 120),
                  motivo_label: motivoLabel,
                  canal: 'WhatsApp', status: 'aberto', prioridade: 'media', fase: 'Novo',
                  atribuido_para: alvo ?? null,
                  observacoes: `Aberto automaticamente pela IA na triagem do WhatsApp.${r.motivo ? ' Motivo relatado: ' + r.motivo : ''}`,
                }).select('id').single()
                if (!eT && tIns) patch.ticket_id = (tIns as { id: string }).id
                else if (eT) console.error('webhook IA→chamado:', eT.message)
              } catch (e) { console.error('webhook IA→chamado:', (e as Error).message) }
            }
          }
          if (r.nomeCliente && !chat.nome) patch.nome = r.nomeCliente
          await sb.from('sac_whatsapp_chats').update(patch).eq('id', chat.id)
          return NextResponse.json({ ok: true, telefone, ia: true, transferir: r.transferir, canal: canal.name })
        }
      }
    } catch (e) { console.error('webhook IA:', (e as Error).message) }
    // A IA estava no circuito mas não respondeu/enviou (sem canal, erro, etc.) → não deixa a conversa
    // órfã: manda pra fila humana (atendente online menos carregada).
    if (!chat.atendente_id) {
      const alvo = await escolherAtendenteOnline(sb, unidadeOrigem).catch(() => null)
      if (alvo) await sb.from('sac_whatsapp_chats').update({ atendente_id: alvo }).eq('id', chat.id)
    }
  }

  // ── MENSAGEM AUTOMÁTICA DE ESPERA (Reestruturação do SAC) ──
  // Cliente escreveu e a conversa já está com um humano (bot off) mas ninguém respondeu ainda:
  // manda UM aviso de "você está na fila" para reduzir ansiedade e os contatos repetidos. Dedupe:
  // só envia se a ÚLTIMA mensagem de saída não for já um aviso de fila (evita spam a cada msg).
  const FILA_AUTOR = 'Sistema · Fila'
  if (!fromMe && chat?.atendente_id && !botAtivo) {
    try {
      const { data: ult } = await sb.from('sac_whatsapp_mensagens')
        .select('direcao, autor').eq('chat_id', chat.id).order('criado_em', { ascending: false }).limit(6)
      // Já mandamos aviso de fila desde a última resposta humana? (procura antes de qualquer saída não-fila)
      let jaAvisou = false
      for (const m of (ult ?? []) as { direcao: string | null; autor: string | null }[]) {
        if ((m.direcao || '') === 'saida') { if ((m.autor || '') === FILA_AUTOR) jaAvisou = true; break }
      }
      if (!jaAvisou) {
        const exp = expedienteSac()
        const msgFila = exp.aberto
          ? 'Recebemos a sua mensagem! ✅ Você está na fila de atendimento e uma de nossas consultoras já vai te responder por aqui. Obrigado pela paciência. 🙏'
          : 'Recebemos a sua mensagem! ✅ Nosso atendimento é de segunda a sexta, das 9h às 18h. Uma consultora dá sequência no próximo horário comercial. Obrigado pela paciência. 🙏'
        const canal = (inst && inst.status === 'connected' && inst.token)
          ? inst : instancias.find((i) => /laser/i.test(i.name) && i.status === 'connected')
        if (canal?.token) {
          const env = await sendText(canal.token, telefone, msgFila)
          const ag = new Date().toISOString()
          await sb.from('sac_whatsapp_mensagens').insert({
            chat_id: chat.id, wa_id: env.messageid ?? null, direcao: 'saida', autor: FILA_AUTOR,
            tipo: 'text', texto: msgFila, status: env.ok ? (env.status ?? 'sent') : 'failed', criado_em: ag,
          })
          await sb.from('sac_whatsapp_chats').update({ ultima_msg: msgFila.slice(0, 120), ultima_msg_tipo: 'text', ultima_msg_em: ag }).eq('id', chat.id)
        }
      }
    } catch (e) { console.error('webhook msg-espera:', (e as Error).message) }
  }

  return NextResponse.json({ ok: true, telefone, direcao: fromMe ? 'saida' : 'entrada', unidade: unidadeOrigem })
}

export async function GET(req: NextRequest) {
  const secret = process.env.UAZAPI_WEBHOOK_SECRET
  const got = req.nextUrl.searchParams.get('secret') ?? ''
  if (secret && got !== secret) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true, info: 'Webhook UAZAPI ativo.' })
}
