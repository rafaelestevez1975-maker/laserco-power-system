import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/session'
import { DashboardUnidade } from '@/components/agenda/DashboardUnidade'

export const dynamic = 'force-dynamic'

/** Dashboard da unidade (rota /). Server Component real sobre dados do lkii
 *  (substitui o clone estático getSnapshot('/')). Paridade: view-dashboard do legado.
 *  Usuário SAC-only (papel 'sac' ou recursos só sac.*) é levado direto ao Dashboard do SAC. */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ per?: string; di?: string; df?: string }> }) {
  const ctx = await getSessionContext() // memoizado (cache): não custa round-trip extra vs o layout
  const sacOnly = !!ctx && !ctx.isAdmin && (ctx.papel === 'sac' || (ctx.recursos.length > 0 && ctx.recursos.every((r) => r.startsWith('sac'))))
  if (sacOnly) redirect('/sac')
  return <DashboardUnidade searchParams={await searchParams} />
}
