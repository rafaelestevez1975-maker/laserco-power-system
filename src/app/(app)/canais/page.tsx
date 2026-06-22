import { getSessionContext } from '@/lib/session'
import { listInstances, uazapiConfigurado } from '@/lib/uazapi'
import { CanaisManager, type Canal } from '@/components/canais/CanaisManager'

export default async function CanaisPage() {
  const ctx = await getSessionContext()
  let canais: Canal[] = []
  let erro = ''

  if (!uazapiConfigurado()) {
    erro = 'UAZAPI não configurada (faltam UAZAPI_BASE_URL / UAZAPI_ADMIN_TOKEN).'
  } else {
    try {
      const all = await listInstances()
      // Mostra só os canais da Laser&Co (por convenção de nome).
      canais = all.filter((i) => /laser/i.test(i.name)).map((i) => ({ name: i.name, status: i.status, owner: i.owner }))
    } catch {
      erro = 'Não foi possível listar os canais na UAZAPI.'
    }
  }

  return (
    <div className="view active">
      <div className="crm-note">
        <i className="ti ti-brand-whatsapp" /> <b>Canais de WhatsApp.</b> Cada canal é um número conectado via QR Code (UAZAPI).
        As automações e disparos saem pelo canal da unidade — se cair, basta reconectar aqui.
      </div>
      {erro
        ? <div className="rel-card" style={{ padding: 16, color: 'var(--red)' }}>{erro}</div>
        : <CanaisManager canais={canais} isAdmin={ctx?.isAdmin ?? false} />}
    </div>
  )
}
