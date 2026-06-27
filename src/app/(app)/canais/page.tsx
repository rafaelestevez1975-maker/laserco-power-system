import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listInstances, limitesEnvio, uazapiConfigurado } from '@/lib/uazapi'
import { CanaisManager, type Canal } from '@/components/canais/CanaisManager'

type Binding = { id: string; instancia_nome: string; escopo: 'unidade' | 'geral'; unidade_id: string | null; rotulo: string | null; delay_min: number; delay_max: number }

export default async function CanaisPage() {
  const ctx = await getSessionContext()
  const unidades = ctx?.unidades ?? []
  const uniNome = new Map(unidades.map((u) => [u.id, u.nome]))
  let canais: Canal[] = []
  let erro = ''

  if (!uazapiConfigurado()) {
    erro = 'UAZAPI não configurada (faltam UAZAPI_BASE_URL / UAZAPI_ADMIN_TOKEN).'
  } else {
    try {
      const all = (await listInstances()).filter((i) => /laser/i.test(i.name))
      const sb = await createClient()
      const { data } = await sb.from('canais_whatsapp').select('id, instancia_nome, escopo, unidade_id, rotulo, delay_min, delay_max')
      const byNome = new Map<string, Binding>(((data ?? []) as Binding[]).map((b) => [b.instancia_nome, b]))
      canais = await Promise.all(all.map(async (i) => {
        const b = byNome.get(i.name)
        // Saúde de envio: o WhatsApp permite INICIAR conversas por este número? (restrição de número novo)
        let restrito = false, restritoAte: string | null = null
        if (i.status === 'connected' && i.token) {
          const lim = await limitesEnvio(i.token)
          if (lim && !lim.podeIniciar) { restrito = true; restritoAte = lim.restritoAte ?? null }
        }
        return {
          name: i.name, status: i.status, owner: i.owner,
          vinculado: !!b,
          bindingId: b?.id,
          escopo: b?.escopo,
          unidadeId: b?.unidade_id ?? null,
          unidadeNome: b?.unidade_id ? uniNome.get(b.unidade_id) ?? '' : null,
          rotulo: b?.rotulo ?? null,
          delayMin: b?.delay_min ?? 20,
          delayMax: b?.delay_max ?? 45,
          restrito, restritoAte,
        }
      }))
    } catch {
      erro = 'Não foi possível listar os canais na UAZAPI.'
    }
  }

  return (
    <div className="view active">
      {erro
        ? <div className="rel-card" style={{ padding: 16, color: 'var(--red)' }}>{erro}</div>
        : <CanaisManager canais={canais} unidades={unidades} isAdmin={ctx?.isAdmin ?? false} activeUnitId={ctx?.activeUnitId ?? null} activeUnitName={ctx?.activeUnitName ?? ''} />}
    </div>
  )
}
