/**
 * Cliente UAZAPI (uazapiGO v2)  server-only.
 * - Endpoints de administração (criar/listar instâncias) usam header `admintoken`.
 * - Endpoints de instância (connect/status/disconnect/send) usam header `token` (token da instância).
 * Env: UAZAPI_BASE_URL, UAZAPI_ADMIN_TOKEN, UAZAPI_TOKEN (instância padrão).
 */
const BASE = (process.env.UAZAPI_BASE_URL || '').replace(/\/$/, '')
const ADMIN = process.env.UAZAPI_ADMIN_TOKEN || ''

export type Instancia = { id?: string; name: string; token: string; status: string; owner?: string; profileName?: string }
export type ConnState = { status: string; connected: boolean; qrcode?: string; paircode?: string }

function asQrDataUrl(qr?: string): string | undefined {
  if (!qr) return undefined
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`
}

async function adminGet(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { admintoken: ADMIN }, cache: 'no-store' })
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) }
}
async function adminPost(path: string, payload: Record<string, unknown>) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { admintoken: ADMIN, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) }
}
async function instPost(path: string, token: string, payload: Record<string, unknown> = {}) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) }
}
async function instGet(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { token }, cache: 'no-store' })
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) }
}

export function uazapiConfigurado(): boolean {
  return !!(BASE && ADMIN)
}

/** Lista todas as instâncias da conta (admintoken). */
export async function listInstances(): Promise<Instancia[]> {
  const { body } = await adminGet('/instance/all')
  const arr = Array.isArray(body) ? body : (body?.instances ?? [])
  return (arr as Record<string, unknown>[]).map((i) => ({
    id: (i.id ?? i.instanceId ?? i.instance_id) as string | undefined,
    name: String(i.name ?? ''),
    token: String(i.token ?? ''),
    status: String(i.status ?? 'disconnected'),
    owner: (i.owner ?? i.number ?? i.phone) as string | undefined,
    profileName: (i.profileName ?? i.name) as string | undefined,
  }))
}

/** Só os dígitos de um identificador (telefone/owner), p/ casar por número de forma robusta. */
function soDigitos(s?: string | null): string { return (s || '').replace(/\D/g, '') }

/** Resolve QUAL instância gerou um evento do webhook, na ordem mais confiável:
 *  token da instância → id da instância → nome da instância → owner (número/JID do dono).
 *  Devolve a instância casada (com token) ou null. Base do roteamento por canal de origem:
 *  evita responder a unidade B pelo número da unidade A em redes multi-número. */
export function resolverInstancia(
  instancias: Instancia[],
  ev: { instance?: string | null; token?: string | null; owner?: string | null },
): Instancia | null {
  const tk = (ev.token || '').trim()
  if (tk) { const m = instancias.find((i) => i.token === tk); if (m) return m }
  const inst = (ev.instance || '').trim()
  if (inst) {
    const m = instancias.find((i) => i.id === inst || i.name === inst)
    if (m) return m
  }
  const own = soDigitos(ev.owner)
  if (own.length >= 8) {
    const m = instancias.find((i) => soDigitos(i.owner).includes(own) || own.includes(soDigitos(i.owner)))
    if (m) return m
  }
  return null
}

/** Cria uma instância nova (admintoken) e retorna o token. */
export async function createInstance(name: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const { ok, body } = await adminPost('/instance/create', { name })
  if (!ok) return { ok: false, error: (body as { error?: string })?.error || 'Falha ao criar instância.' }
  const token = (body as { token?: string; instance?: { token?: string } })?.token ?? (body as { instance?: { token?: string } })?.instance?.token
  return { ok: true, token }
}

/** Inicia conexão e gera QR (token da instância). */
export async function connectInstance(token: string): Promise<ConnState> {
  const { body } = await instPost('/instance/connect', token)
  const inst = (body as { connected?: boolean; instance?: { status?: string; qrcode?: string; paircode?: string } })
  return {
    status: inst?.instance?.status ?? 'connecting',
    connected: inst?.connected === true || inst?.instance?.status === 'connected',
    qrcode: asQrDataUrl(inst?.instance?.qrcode),
    paircode: inst?.instance?.paircode,
  }
}

/** Status atual da instância (+ QR atualizado se conectando). */
export async function getStatus(token: string): Promise<ConnState> {
  const { body } = await instGet('/instance/status', token)
  const d = body as { status?: { connected?: boolean }; instance?: { status?: string; qrcode?: string } }
  return {
    status: d?.instance?.status ?? 'disconnected',
    connected: d?.status?.connected === true || d?.instance?.status === 'connected',
    qrcode: asQrDataUrl(d?.instance?.qrcode),
  }
}

export async function disconnectInstance(token: string): Promise<{ ok: boolean }> {
  const { ok } = await instPost('/instance/disconnect', token)
  return { ok }
}

/** Apaga a instância de vez (desconecta o aparelho e remove do banco da UAZAPI). */
export async function deleteInstance(token: string): Promise<{ ok: boolean }> {
  const r = await fetch(`${BASE}/instance`, { method: 'DELETE', headers: { token } })
  return { ok: r.ok }
}

export function normTel(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  return d.startsWith('55') ? d : '55' + d
}

type ErroEnvioBody = {
  error?: string; message?: string; provider_code?: number; error_key?: string
  provider_message_ptbr?: string; message_ptbr?: string
  details?: { reachout_timelock?: { until?: string } }
}
const dataBR = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

/** Traduz erros de envio da UAZAPI/WhatsApp para algo claro pro atendente. */
export function traduzErroEnvio(body: unknown, fallback = 'Falha no envio.'): string {
  const b = (body || {}) as ErroEnvioBody
  const raw = String(b.error || b.message || '').toLowerCase()
  const reachout = b.provider_code === 463 || b.error_key === 'WHATSAPP_REACHOUT_TIMELOCK'
    || /\b463\b|reachout|temporary restriction|starting new conversation|under a temporary/.test(raw)
  if (reachout) {
    const ate = dataBR(b.details?.reachout_timelock?.until)
    return `O WhatsApp colocou este número sob restrição temporária${ate ? ` (até ${ate})` : ''} para INICIAR conversas novas pelo aparelho conectado ao sistema (dispositivo vinculado). É proteção anti-spam de número recém-ativado  pelo CELULAR principal funciona normal. Para iniciar conversas pelo sistema: use um número já estabelecido ou aguarde liberar. Responder logo que o cliente te escreve tende a funcionar.`
  }
  if (/not.*on.*whatsapp|invalid.*number|no.*account|exists.*false/.test(raw)) return 'Esse número não tem WhatsApp ativo.'
  if (/disconnect|not connected|no instance|instance.*not/.test(raw)) return 'A conexão do canal caiu. Reconecte o número em Canais.'
  if (/rate|too many|limit/.test(raw)) return 'Muitos envios em sequência  aguarde alguns segundos e tente de novo.'
  return b.message_ptbr || b.provider_message_ptbr || b.error || fallback
}

export type LimiteEnvio = { podeIniciar: boolean; restritoAte?: string | null; motivo?: string }
/** Saúde de envio do número: o WhatsApp permite INICIAR conversas novas por este
 *  dispositivo vinculado? (reachout timelock de número novo). null = não foi possível checar. */
export async function limitesEnvio(token: string): Promise<LimiteEnvio | null> {
  const { ok, body } = await instGet('/instance/wa_messages_limits', token)
  if (!ok || !body) return null
  const b = body as { can_send_new_messages?: boolean; reachout_timelock?: { until?: string }; provider_message_ptbr?: string }
  return {
    podeIniciar: b.can_send_new_messages !== false,
    restritoAte: b.reachout_timelock?.until ?? null,
    motivo: b.provider_message_ptbr,
  }
}

/** Extrai messageid/status da resposta de envio da UAZAPI (formato varia por endpoint).
 *  O messageid é o wa_id que permite casar os callbacks messages_update (delivered/read). */
function lerEnvio(body: unknown): { messageid?: string; status?: string } {
  const b = (body || {}) as { messageid?: string; id?: string; status?: string; message?: { messageid?: string; id?: string; status?: string } }
  return {
    messageid: b.messageid ?? b.id ?? b.message?.messageid ?? b.message?.id,
    status: b.status ?? b.message?.status,
  }
}

/** Envia texto por uma instância (token da instância)  base para os disparos.
 *  Retorna messageid (wa_id) p/ vincular a mensagem própria aos callbacks de status. */
export async function sendText(token: string, numero: string, texto: string): Promise<{ ok: boolean; error?: string; messageid?: string; status?: string }> {
  const { ok, body } = await instPost('/send/text', token, { number: normTel(numero), text: texto })
  return ok ? { ok: true, ...lerEnvio(body) } : { ok: false, error: traduzErroEnvio(body) }
}

export type MidiaTipo = 'image' | 'video' | 'audio' | 'ptt' | 'document' | 'sticker'
/** Envia mídia por uma instância (token). `file` = URL pública OU base64 (data URI ou puro). */
export async function sendMedia(token: string, numero: string, tipo: MidiaTipo, file: string, opts: { caption?: string; docName?: string } = {}): Promise<{ ok: boolean; error?: string; fileURL?: string; messageid?: string; status?: string }> {
  const { ok, body } = await instPost('/send/media', token, { number: normTel(numero), type: tipo, file, ...opts })
  if (!ok) return { ok: false, error: traduzErroEnvio(body, 'Falha no envio de mídia.') }
  const b = body as { fileURL?: string; message?: { fileURL?: string } }
  return { ok: true, fileURL: b?.fileURL ?? b?.message?.fileURL, ...lerEnvio(body) }
}

/** Baixa a mídia de uma mensagem recebida. A UAZAPI nem sempre manda `fileURL` no webhook 
 *  POST /message/download (token da instância) com `return_link` devolve a URL pública + mimetype
 *  (e gera MP3 para áudio). `id` = id INTERNO da UAZAPI da mensagem (msg.id no webhook).
 *  Sem isso, imagem/áudio/vídeo recebidos ficam como "[image]" no chat. */
export async function downloadMessage(token: string, id: string): Promise<{ ok: boolean; fileURL?: string; mimetype?: string }> {
  const { ok, body } = await instPost('/message/download', token, { id, return_link: true, generate_mp3: true })
  if (!ok) return { ok: false }
  const b = (body || {}) as { fileURL?: string; mimetype?: string; message?: { fileURL?: string; mimetype?: string } }
  return { ok: true, fileURL: b.fileURL ?? b.message?.fileURL, mimetype: b.mimetype ?? b.message?.mimetype }
}

/** URL pública do nosso webhook (com ?secret=) que a UAZAPI deve chamar.
 *  CRÍTICO: a UAZAPI é externa e precisa ALCANÇAR a URL  nunca pode ser localhost.
 *  Se NEXT_PUBLIC_APP_URL apontar pra localhost (dev), cai pro domínio público. */
const WEBHOOK_FALLBACK = 'https://laserco-power-system.vercel.app'
export function urlWebhook(): string {
  let base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  if (!base || /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(base)) {
    base = (process.env.WEBHOOK_PUBLIC_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
      || WEBHOOK_FALLBACK).replace(/\/$/, '')
  }
  const secret = process.env.UAZAPI_WEBHOOK_SECRET
  return `${base}/api/webhooks/uazapi${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`
}

/** POST /webhook (token da instância)  garante que a instância entrega os eventos no nosso endpoint.
 *  excludeMessages: ["wasSentByApi"] evita loop com o que o próprio sistema/IA envia. */
export async function configurarWebhook(token: string, url: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, body } = await instPost('/webhook', token, {
    url, enabled: true, events: ['messages', 'messages_update', 'connection'], excludeMessages: ['wasSentByApi'],
  })
  return ok ? { ok: true } : { ok: false, error: (body as { error?: string })?.error || 'Falha ao configurar webhook.' }
}

export type CampanhaInput = { numbers: string[]; text: string; delayMin: number; delayMax: number; info?: string; scheduledFor?: number }

/** Cria uma campanha de envio em massa (UAZAPI gerencia a fila + delay anti-ban).
 *  scheduledFor: timestamp epoch em MS para agendar (0/ausente = envia agora).
 *  A mensagem suporta placeholders da UAZAPI, ex.: {{first_name}}, {{name}}. */
export async function criarCampanhaSimples(token: string, c: CampanhaInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { ok, body } = await instPost('/sender/simple', token, {
    numbers: c.numbers.map(normTel),
    type: 'text',
    text: c.text,
    delayMin: c.delayMin,
    delayMax: c.delayMax,
    scheduled_for: c.scheduledFor && c.scheduledFor > 0 ? c.scheduledFor : 0,
    info: c.info ?? 'Campanha',
  })
  if (!ok) return { ok: false, error: (body as { error?: string })?.error || 'Falha ao criar campanha.' }
  const b = body as { folder_id?: string; id?: string }
  return { ok: true, id: b?.folder_id ?? b?.id }
}
