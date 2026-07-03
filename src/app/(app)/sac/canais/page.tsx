import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { listInstances, limitesEnvio, uazapiConfigurado } from '@/lib/uazapi'
import { CanaisManager, type Canal } from '@/components/canais/CanaisManager'

export const dynamic = 'force-dynamic'

type Binding = { id: string; instancia_nome: string; escopo: 'unidade' | 'geral'; unidade_id: string | null; rotulo: string | null; delay_min: number; delay_max: number; atendente_id: string | null }

/**
 * Canais do SAC  CENTRALIZADO na franqueadora (pedido do Julio). NÃO há canal por franquia:
 * um WhatsApp central do SAC + os números PRÓPRIOS das atendentes (auto-serviço, no login delas).
 * Mais as origens de atendimento (Site → chamado). Tela isolada da de Gestão (/canais).
 */
export default async function SacCanaisPage() {
  const ctx = await getSessionContext()
  const isAdmin = ctx?.isAdmin ?? false
  let canais: Canal[] = []
  let atendentes: { id: string; nome: string }[] = []
  let erro = ''

  if (!uazapiConfigurado()) {
    erro = 'UAZAPI não configurada (faltam UAZAPI_BASE_URL / UAZAPI_ADMIN_TOKEN).'
  } else {
    try {
      const todas = (await listInstances()).filter((i) => /laser/i.test(i.name))
      const sb = await createClient()
      const [{ data }, atFull] = await Promise.all([
        // SAC = só canais centrais (franqueadora)  escopo 'geral'. Nunca por unidade.
        sb.from('canais_whatsapp').select('id, instancia_nome, escopo, unidade_id, rotulo, delay_min, delay_max, atendente_id').eq('escopo', 'geral'),
        listAtendentesSac(sb, false),
      ])
      atendentes = atFull.map((a) => ({ id: a.id, nome: a.nome }))
      const atNome = new Map(atendentes.map((a) => [a.id, a.nome]))
      const byNome = new Map<string, Binding>(((data ?? []) as Binding[]).map((b) => [b.instancia_nome, b]))
      // Admin vê todas as instâncias (inclusive sem vínculo, p/ vincular ao SAC); demais SAC veem as já centrais.
      const all = todas.filter((i) => (isAdmin ? true : !!byNome.get(i.name)))
      canais = await Promise.all(all.map(async (i) => {
        const b = byNome.get(i.name)
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
          unidadeNome: null,
          atendenteId: b?.atendente_id ?? null,
          atendenteNome: b?.atendente_id ? (atNome.get(b.atendente_id) ?? '') : null,
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
        : <CanaisManager canais={canais} unidades={[]} atendentes={atendentes} isAdmin={isAdmin} activeUnitId={null} activeUnitName="Franqueadora" central />}
    </div>
  )
}
