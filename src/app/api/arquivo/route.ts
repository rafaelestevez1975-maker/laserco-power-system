import { NextResponse, type NextRequest } from 'next/server'
import { bunnyDownload, bunnyVerificarUrl } from '@/lib/bunny'

export const dynamic = 'force-dynamic'

/**
 * Proxy de download para arquivos PRIVADOS no Bunny Storage.
 * Recebe uma URL assinada (gerada por bunnySignedUrl): b=bucket, p=path, exp, sig.
 * Valida a assinatura HMAC + expiração e faz o stream do arquivo com a AccessKey do servidor
 * (a chave nunca vai pro cliente). Espelha o comportamento do createSignedUrl do Supabase.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const b = sp.get('b') || ''
  const p = sp.get('p') || ''
  const exp = sp.get('exp') || ''
  const sig = sp.get('sig') || ''

  if (!bunnyVerificarUrl(b, p, exp, sig)) {
    return NextResponse.json({ error: 'Link inválido ou expirado.' }, { status: 403 })
  }

  const arquivo = await bunnyDownload(b, p)
  if (!arquivo) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })

  const nome = p.split('/').pop() || 'arquivo'
  return new NextResponse(arquivo.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': arquivo.contentType,
      'Content-Disposition': `inline; filename="${nome}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
