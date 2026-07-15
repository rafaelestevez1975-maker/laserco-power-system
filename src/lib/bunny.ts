import crypto from 'crypto'

/**
 * Camada única de armazenamento no Bunny CDN.
 *  - STORAGE (bunny.net Storage): documentos/arquivos. Substitui o Supabase Storage.
 *    "bucket" vira uma pasta de topo dentro da storage zone (ex.: contratos/, disco/, sac-midia/).
 *  - STREAM (bunny.net Stream): vídeos da Universidade (library dedicada).
 *
 * Segredos vêm de env (fora do Git): BUNNY_STORAGE_*, BUNNY_STREAM_*, BUNNY_URL_SECRET.
 * Só roda no servidor (usa AccessKey privada).
 */

// ─────────────────────────── STORAGE (arquivos) ───────────────────────────
const ZONE = process.env.BUNNY_STORAGE_ZONE || ''
const KEY = process.env.BUNNY_STORAGE_KEY || ''
const HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com'
const CDN = process.env.BUNNY_CDN_HOST || '' // pull zone p/ URL pública
const SECRET = process.env.BUNNY_URL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret'

/** Bunny Storage está configurado? (permite degradar p/ Supabase enquanto não há chave.) */
export function bunnyStorageOn(): boolean {
  return !!(ZONE && KEY)
}

function storageUrl(bucket: string, path: string): string {
  const clean = `${bucket}/${path}`.replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  return `https://${HOST}/${ZONE}/${clean}`
}

/** Envia bytes para {bucket}/{path}. Retorna { error } em falha (não lança). */
export async function bunnyUpload(
  bucket: string,
  path: string,
  bytes: Buffer | Uint8Array,
  contentType = 'application/octet-stream',
): Promise<{ error?: string }> {
  if (!bunnyStorageOn()) return { error: 'Bunny Storage não configurado.' }
  try {
    const r = await fetch(storageUrl(bucket, path), {
      method: 'PUT',
      headers: { AccessKey: KEY, 'Content-Type': contentType },
      body: bytes as unknown as BodyInit,
    })
    if (!r.ok) return { error: `Bunny upload HTTP ${r.status}` }
    return {}
  } catch (e) {
    return { error: `Bunny upload: ${(e as Error).message}` }
  }
}

/** Baixa {bucket}/{path} do Storage (com AccessKey). null se não achar. */
export async function bunnyDownload(bucket: string, path: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!bunnyStorageOn()) return null
  try {
    const r = await fetch(storageUrl(bucket, path), { headers: { AccessKey: KEY } })
    if (!r.ok) return null
    return { bytes: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') || 'application/octet-stream' }
  } catch {
    return null
  }
}

/** Remove um ou mais arquivos (best-effort, não lança). */
export async function bunnyRemove(bucket: string, paths: string[]): Promise<void> {
  if (!bunnyStorageOn()) return
  await Promise.all(
    paths.map((p) => fetch(storageUrl(bucket, p), { method: 'DELETE', headers: { AccessKey: KEY } }).catch(() => undefined)),
  )
}

/** URL pública (CDN) — só para arquivos que podem ser públicos (ex.: sac-midia). */
export function bunnyPublicUrl(bucket: string, path: string): string {
  const clean = `${bucket}/${path}`.replace(/^\/+/, '').replace(/\/{2,}/g, '/')
  return CDN ? `https://${CDN}/${clean}` : storageUrl(bucket, path)
}

/**
 * URL assinada de curta duração para arquivos PRIVADOS — espelha o createSignedUrl do
 * Supabase. Aponta para /api/arquivo (proxy nosso, que valida a assinatura HMAC e faz
 * o stream do Storage com a AccessKey). Assim o link abre sem depender de cookie/sessão.
 */
export function bunnySignedUrl(bucket: string, path: string, expiresSec = 300): string {
  const exp = Math.floor(Date.now() / 1000) + expiresSec
  const sig = crypto.createHmac('sha256', SECRET).update(`${bucket}|${path}|${exp}`).digest('hex')
  const qs = new URLSearchParams({ b: bucket, p: path, exp: String(exp), sig })
  return `/api/arquivo?${qs.toString()}`
}

/** Valida a assinatura de /api/arquivo (usado pela rota de proxy). */
export function bunnyVerificarUrl(bucket: string, path: string, exp: string, sig: string): boolean {
  if (!bucket || !path || !exp || !sig) return false
  if (!/^\d+$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return false
  const esperado = crypto.createHmac('sha256', SECRET).update(`${bucket}|${path}|${exp}`).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ─────────────────────────── STREAM (vídeos) ───────────────────────────
const STREAM_LIB = process.env.BUNNY_STREAM_LIBRARY || ''
const STREAM_KEY = process.env.BUNNY_STREAM_KEY || ''
const STREAM_CDN = process.env.BUNNY_STREAM_CDN || '' // ex.: vz-xxxx.b-cdn.net

export function bunnyStreamOn(): boolean {
  return !!(STREAM_LIB && STREAM_KEY)
}

/** Cria um vídeo (metadados) na library e retorna o guid p/ upload. */
export async function bunnyStreamCriarVideo(titulo: string): Promise<{ guid: string } | { error: string }> {
  if (!bunnyStreamOn()) return { error: 'Bunny Stream não configurado.' }
  try {
    const r = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB}/videos`, {
      method: 'POST',
      headers: { AccessKey: STREAM_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ title: titulo }),
    })
    if (!r.ok) return { error: `Bunny Stream criar HTTP ${r.status}` }
    const j = (await r.json()) as { guid: string }
    return { guid: j.guid }
  } catch (e) {
    return { error: `Bunny Stream criar: ${(e as Error).message}` }
  }
}

/** Faz upload dos bytes do vídeo para um guid já criado. */
export async function bunnyStreamUpload(guid: string, bytes: Buffer | Uint8Array): Promise<{ error?: string }> {
  if (!bunnyStreamOn()) return { error: 'Bunny Stream não configurado.' }
  try {
    const r = await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB}/videos/${guid}`, {
      method: 'PUT',
      headers: { AccessKey: STREAM_KEY },
      body: bytes as unknown as BodyInit,
    })
    if (!r.ok) return { error: `Bunny Stream upload HTTP ${r.status}` }
    return {}
  } catch (e) {
    return { error: `Bunny Stream upload: ${(e as Error).message}` }
  }
}

export async function bunnyStreamRemover(guid: string): Promise<void> {
  if (!bunnyStreamOn() || !guid) return
  await fetch(`https://video.bunnycdn.com/library/${STREAM_LIB}/videos/${guid}`, {
    method: 'DELETE',
    headers: { AccessKey: STREAM_KEY },
  }).catch(() => undefined)
}

/** URL do player embutível (iframe) do vídeo. */
export function bunnyStreamEmbedUrl(guid: string): string {
  return `https://iframe.mediadelivery.net/embed/${STREAM_LIB}/${guid}`
}

/** URL do HLS (para players nativos). */
export function bunnyStreamHlsUrl(guid: string): string {
  return STREAM_CDN ? `https://${STREAM_CDN}/${guid}/playlist.m3u8` : ''
}
