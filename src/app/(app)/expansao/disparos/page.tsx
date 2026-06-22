import { listInstances, uazapiConfigurado } from '@/lib/uazapi'
import { DisparoComposer } from '@/components/disparos/DisparoComposer'

export default async function DisparosPage() {
  let canais: string[] = []
  if (uazapiConfigurado()) {
    try {
      const all = await listInstances()
      canais = all.filter((i) => /laser/i.test(i.name) && i.status === 'connected').map((i) => i.name)
    } catch { /* mostra estado vazio no composer */ }
  }

  return (
    <div className="view active">
      <div className="crm-note">
        <i className="ti ti-send" /> <b>Disparos de WhatsApp.</b> O envio em massa roda na UAZAPI com <b>delay</b> entre mensagens
        (anti-ban). Captação de franquia/revenda que <b>não pode parar</b> — escolha o canal conectado e a base de números.
      </div>
      <DisparoComposer canais={canais} />
    </div>
  )
}
