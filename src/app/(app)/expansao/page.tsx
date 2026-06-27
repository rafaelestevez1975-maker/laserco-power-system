import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ExpansaoTabs } from '@/components/expansao/ExpansaoTabs'
import type { ExpEtapa, ExpLead } from '@/components/expansao/types'

export const dynamic = 'force-dynamic'

export default async function ExpansaoPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const isAdmin = ctx?.isAdmin ?? false

  // ── Feature-detect: a migration 050 cria crm_etapas.pipeline. Se a coluna
  //    não existe, a query abaixo falha → mostramos banner e estado vazio. ──
  let migracaoOk = true
  let etapas: ExpEtapa[] = []
  {
    const { data, error } = await sb
      .from('crm_etapas')
      .select('id, nome, ordem, cor, pipeline')
      .eq('pipeline', 'franquia')
      .eq('ativo', true)
      .order('ordem', { ascending: true })
    if (error) {
      migracaoOk = false
    } else {
      etapas = (data ?? []).map((e) => ({ id: e.id, nome: e.nome, cor: e.cor }))
    }
  }

  // Leads de franquia (escopados por unidade quando houver; admin/null vê todos).
  let leads: ExpLead[] = []
  if (migracaoOk) {
    let q = sb
      .from('crm_leads')
      .select('id, nome, telefone, email, origem, valor_estimado, etapa_id, status, tipo_lead, temperatura, empresa, uf, criado_em')
      .eq('pipeline', 'franquia')
      .order('criado_em', { ascending: false })
      .limit(500)
    if (activeUnit) q = q.eq('unidade_id', activeUnit)
    const { data, error } = await q
    if (error) {
      migracaoOk = false
    } else {
      leads = (data ?? []) as ExpLead[]
    }
  }

  return (
    <div className="view active">
      <ExpansaoTabs
        migracaoOk={migracaoOk}
        etapas={etapas}
        leads={leads}
        unidades={ctx?.unidades ?? []}
        activeUnitId={activeUnit}
        isAdmin={isAdmin}
      />
    </div>
  )
}
