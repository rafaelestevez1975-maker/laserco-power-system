import { NextResponse, type NextRequest } from 'next/server'
import { ingestSacLeadsDoSite } from '@/lib/sac-ingest'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Ingestão dos formulários de SAC do site → Chamados na franqueadora.
 * Chamado pelo Vercel Cron (vercel.json) e também acionável manualmente.
 * Protegido por CRON_SECRET quando definido  o Vercel Cron envia
 * `Authorization: Bearer <CRON_SECRET>`. Sem a env, roda aberto (idempotente,
 * não expõe dado: só materializa chamados que já cairiam de qualquer forma).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
  }
  try {
    const res = await ingestSacLeadsDoSite()
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
