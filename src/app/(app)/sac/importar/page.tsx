import { getSessionContext } from '@/lib/session'
import { ImportarLeads } from '@/components/sac/ImportarLeads'

export default async function SacImportarPage() {
  const ctx = await getSessionContext()

  // Sem sessão (cookie expirado) → estado honesto em vez de tela em branco.
  if (!ctx) {
    return (
      <div className="view active">
        <div className="rel-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Sessão expirada. Recarregue a página para importar chamados.
        </div>
      </div>
    )
  }

  return (
    <div className="view active">
      <ImportarLeads unidades={ctx.unidades} activeUnitId={ctx.activeUnitId} />
    </div>
  )
}
