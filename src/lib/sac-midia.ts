import { adminClient } from '@/lib/supabase/admin'

const BUCKET = 'sac-midia'

function extFromMime(m?: string | null): string {
  const t = (m || '').toLowerCase()
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'
  if (t.includes('png')) return 'png'
  if (t.includes('webp')) return 'webp'
  if (t.includes('gif')) return 'gif'
  if (t.includes('opus') || t.includes('ogg')) return 'ogg'
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3'
  if (t.includes('aac')) return 'aac'
  if (t.includes('mp4')) return 'mp4'
  if (t.includes('webm')) return 'webm'
  if (t.includes('pdf')) return 'pdf'
  return 'bin'
}

/**
 * Re-hospeda uma mídia (data URI base64 OU URL remota da UAZAPI) no bucket PÚBLICO
 * `sac-midia` e devolve a URL pública  que carrega de fato em <img>/<audio>/<video>.
 * Resolve: imagem enviada que aparecia como "[image]" e áudio que não carregava (a
 * UAZAPI nem sempre devolve URL, e quando devolve nem sempre é pública).
 * Degrada para o valor original se qualquer passo falhar  nunca quebra a mensagem.
 */
export async function reHostMidia(
  src: string | null | undefined,
  opts: { mime?: string | null; prefixo?: string } = {},
): Promise<string | null> {
  if (!src) return null
  try {
    let bytes: Buffer
    let mime = opts.mime || 'application/octet-stream'
    if (src.startsWith('data:')) {
      const m = src.match(/^data:([^;]+);base64,([\s\S]*)$/)
      if (!m) return src
      mime = m[1] || mime
      bytes = Buffer.from(m[2], 'base64')
    } else if (/^https?:\/\//i.test(src)) {
      const r = await fetch(src)
      if (!r.ok) return src
      mime = r.headers.get('content-type') || mime
      bytes = Buffer.from(await r.arrayBuffer())
    } else {
      return src
    }
    if (bytes.byteLength === 0 || bytes.byteLength > 16 * 1024 * 1024) return src
    const path = `${opts.prefixo || 'sac'}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extFromMime(mime)}`
    const sb = adminClient()
    const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
    if (error) return src
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  } catch {
    return src
  }
}
