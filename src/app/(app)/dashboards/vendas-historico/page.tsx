import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { VendasReal, type VendasSP } from '@/components/dashboards/VendasReal'

export const dynamic = 'force-dynamic'

// Menu: "vendas-historico" (badge ADMIN). Dashboards de Vendas são restritos à franqueadora.
// Dado real do ERP (OS fechadas) — substitui o antigo iframe que apontava p/ outro projeto Supabase.
export default async function VendasPage({ searchParams }: { searchParams: Promise<VendasSP> }) {
  const [ctx, sp] = await Promise.all([getSessionContext(), searchParams])
  return <VendasReal slug="vendas-historico" sp={sp} podeVer={ehAdmin(ctx?.papel)} />
}
