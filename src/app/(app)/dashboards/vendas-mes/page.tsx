import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { VendasIframe } from '@/components/dashboards/VendasIframe'

export const dynamic = 'force-dynamic'

// Menu: "vendas-mes" (badge ADMIN). Dashboards de Vendas são restritos à franqueadora.
export default async function VendasPage() {
  const ctx = await getSessionContext()
  return <VendasIframe slug="vendas-mes" podeVer={ehAdmin(ctx?.papel)} />
}
