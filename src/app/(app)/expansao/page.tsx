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
  // A LISTA fica capada em LEADS_CAP; os TOTAIS (KPIs, funil, %) usam contagem exata
  // separada — mesmo padrão do CRM/SAC Kanban (não cai no teto do array).
  const LEADS_CAP = 500
  let leads: ExpLead[] = []
  let totalLeads = 0
  const totaisPorEtapa: Record<string, number> = {}
  if (migracaoOk) {
    let q = sb
      .from('crm_leads')
      .select('id, nome, telefone, email, origem, valor_estimado, etapa_id, status, tipo_lead, temperatura, empresa, uf, criado_em')
      .eq('pipeline', 'franquia')
      .order('criado_em', { ascending: false })
      .limit(LEADS_CAP)
    if (activeUnit) q = q.eq('unidade_id', activeUnit)
    const { data, error } = await q
    if (error) {
      migracaoOk = false
    } else {
      leads = (data ?? []) as ExpLead[]
    }
  }

  if (migracaoOk) {
    // Total REAL de leads de franquia (count exato, não o tamanho do array capado).
    let cq = sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('pipeline', 'franquia')
    if (activeUnit) cq = cq.eq('unidade_id', activeUnit)
    const { count } = await cq
    totalLeads = count ?? 0

    // Contagem REAL por etapa — para o funil e os KPIs derivados não caírem no teto.
    const contagens = await Promise.all(etapas.map((et) => {
      let eq = sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('pipeline', 'franquia').eq('etapa_id', et.id)
      if (activeUnit) eq = eq.eq('unidade_id', activeUnit)
      return eq
    }))
    etapas.forEach((et, i) => { totaisPorEtapa[et.id] = contagens[i].count ?? 0 })
  }

  const leadsCapped = totalLeads > leads.length

  return (
    <div className="view active">
      <ExpansaoTabs
        migracaoOk={migracaoOk}
        etapas={etapas}
        leads={leads}
        totalLeads={totalLeads}
        totaisPorEtapa={totaisPorEtapa}
        leadsCapped={leadsCapped}
        unidades={ctx?.unidades ?? []}
        activeUnitId={activeUnit}
        isAdmin={isAdmin}
      />
    </div>
  )
}
