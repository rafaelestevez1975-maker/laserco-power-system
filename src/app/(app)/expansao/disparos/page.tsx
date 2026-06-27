import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listInstances, uazapiConfigurado } from '@/lib/uazapi'
import { listarTemplates, dadosDisparos } from '@/app/(app)/expansao/disparos/actions'
import { DisparoComposer, type CanalOpt } from '@/components/disparos/DisparoComposer'
import { DisparosResumo } from '@/components/expansao/DisparosResumo'

export const dynamic = 'force-dynamic'

type Binding = { instancia_nome: string; escopo: 'unidade' | 'geral'; unidade_id: string | null; rotulo: string | null; delay_min: number; delay_max: number }

export default async function DisparosPage() {
  const ctx = await getSessionContext()
  const uniNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))
  let canais: CanalOpt[] = []

  if (uazapiConfigurado()) {
    try {
      const conectadas = (await listInstances()).filter((i) => /laser/i.test(i.name) && i.status === 'connected')
      const sb = await createClient()
      const { data } = await sb.from('canais_whatsapp').select('instancia_nome, escopo, unidade_id, rotulo, delay_min, delay_max')
      const byNome = new Map<string, Binding>(((data ?? []) as Binding[]).map((b) => [b.instancia_nome, b]))
      canais = conectadas.map((i) => {
        const b = byNome.get(i.name)
        const label = b?.rotulo || (b?.escopo === 'geral' ? 'Geral (franqueadora)' : (b?.unidade_id ? uniNome.get(b.unidade_id) ?? i.name : i.name))
        return { nome: i.name, label, escopo: b?.escopo ?? null, unidadeId: b?.unidade_id ?? null, delayMin: b?.delay_min ?? 20, delayMax: b?.delay_max ?? 45 }
      })
    } catch { /* estado vazio no composer */ }
  }

  const templates = await listarTemplates()
  const { listas, historico } = await dadosDisparos(ctx?.activeUnitId ?? null)

  return (
    <div className="view active">
      <DisparoComposer canais={canais} activeUnitId={ctx?.activeUnitId ?? null} templates={templates} />
      <DisparosResumo listas={listas} historico={historico} />
    </div>
  )
}
