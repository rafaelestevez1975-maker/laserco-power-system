import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { siteClient } from '@/lib/supabase/site'
import { matchUnidadeId } from '@/lib/unidade-match'
import { SiteLeadsInbox, type SiteLead } from '@/components/leads-site/SiteLeadsInbox'

type SiteRow = { id: string; tipo?: string; nome?: string; telefone?: string; email?: string; unidade?: string; created_at?: string
  dados?: { nome?: string; telefone?: string; whatsapp?: string; email?: string; mensagem?: string; area?: string; origem?: string; _roteado?: boolean; _routed_to?: string } }
type LkiiRow = { id: string; created_at: string | null; data: { tipo?: string; origem?: string; status?: string; routed_to?: string
  dados?: { nome?: string; email?: string; whatsapp?: string; telefone?: string; mensagem?: string; area?: string } } | null }

export default async function LeadsSitePage() {
  const ctx = await getSessionContext()
  const unidades = ctx?.unidades ?? []
  const site = siteClient()
  let leads: SiteLead[] = []

  if (site) {
    // Fonte REAL: lasercompany_leads (Supabase do site).
    const { data } = await site.from('lasercompany_leads')
      .select('id, tipo, nome, telefone, email, unidade, created_at, dados')
      .order('created_at', { ascending: false }).limit(500)
    leads = ((data ?? []) as SiteRow[]).map((r) => ({
      id: r.id, tipo: r.tipo ?? '',
      nome: r.nome || r.dados?.nome || 'Lead do site',
      email: r.email || r.dados?.email || null,
      contato: r.telefone || r.dados?.telefone || r.dados?.whatsapp || null,
      area: r.dados?.area || r.unidade || null,
      mensagem: r.dados?.mensagem || null,
      origem: r.dados?.origem || r.unidade || null,
      quando: r.created_at ?? null,
      routed: r.dados?._roteado === true,
      destino: r.dados?._routed_to ?? null,
      unidadeLabel: r.unidade ?? null,
      sugestaoUnidadeId: matchUnidadeId(r.unidade, unidades),
    }))
  } else {
    // Fallback: lkii.site_leads (apenas teste, enquanto não há a service key do site).
    const sb = await createClient()
    const { data } = await sb.from('site_leads').select('id, data, created_at').order('created_at', { ascending: false }).limit(500)
    leads = ((data ?? []) as LkiiRow[]).map((r) => {
      const d = r.data?.dados ?? {}
      return { id: r.id, tipo: r.data?.tipo ?? '', nome: d.nome?.trim() || 'Lead do site', email: d.email || null,
        contato: d.whatsapp || d.telefone || null, area: d.area || null, mensagem: d.mensagem || null,
        origem: r.data?.origem || null, quando: r.created_at, routed: r.data?.status === 'roteado', destino: r.data?.routed_to ?? null }
    })
  }

  // Os formulários de SAC do site NÃO aparecem aqui (inbox do comercial): eles viram
  // chamado na franqueadora automaticamente (ver lib/sac-ingest) e a atendente os trata
  // direto em SAC › Chamados. Aqui ficam só os leads comerciais (CRM) e currículos (RH).
  const leadsComercial = leads.filter((l) => (l.tipo ?? '').toLowerCase() !== 'sac')

  return (
    <div className="view active">
      <SiteLeadsInbox leads={leadsComercial} unidades={ctx?.unidades ?? []} activeUnitId={ctx?.activeUnitId ?? null} />
    </div>
  )
}
