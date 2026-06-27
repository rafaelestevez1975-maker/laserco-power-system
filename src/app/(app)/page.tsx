import { DashboardUnidade } from '@/components/agenda/DashboardUnidade'

export const dynamic = 'force-dynamic'

/** Dashboard da unidade (rota /). Server Component real sobre dados do lkii
 *  (substitui o clone estático getSnapshot('/')). Paridade: view-dashboard do legado. */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ per?: string; di?: string; df?: string }> }) {
  return <DashboardUnidade searchParams={await searchParams} />
}
