import { getSessionContext } from '@/lib/session'
import { ImportarLeads } from '@/components/sac/ImportarLeads'

export default async function SacImportarPage() {
  const ctx = await getSessionContext()
  return (
    <div className="view active">
      <ImportarLeads unidades={ctx?.unidades ?? []} activeUnitId={ctx?.activeUnitId ?? null} />
    </div>
  )
}
