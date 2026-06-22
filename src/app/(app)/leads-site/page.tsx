import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SiteLeadsInbox, type SiteLead } from '@/components/leads-site/SiteLeadsInbox'

type Row = { id: string; created_at: string | null; data: {
  tipo?: string; origem?: string; status?: string | null; routed_to?: string
  dados?: { nome?: string; email?: string; whatsapp?: string; telefone?: string; mensagem?: string; area?: string }
} | null }

export default async function LeadsSitePage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  const { data } = await sb.from('site_leads').select('id, data, created_at').order('created_at', { ascending: false }).limit(500)
  const rows = (data ?? []) as Row[]

  const leads: SiteLead[] = rows.map((r) => {
    const d = r.data?.dados ?? {}
    return {
      id: r.id,
      tipo: r.data?.tipo ?? '—',
      nome: d.nome?.trim() || 'Lead do site',
      email: d.email || null,
      contato: d.whatsapp || d.telefone || null,
      area: d.area || null,
      mensagem: d.mensagem || null,
      origem: r.data?.origem || null,
      quando: r.created_at,
      routed: r.data?.status === 'roteado',
      destino: r.data?.routed_to ?? null,
    }
  })

  return (
    <div className="view active">
      <div className="crm-note">
        <i className="ti ti-route" /> Leads vindos do site (indicação, agendamento, SAC, franquia, etc.). Roteie cada um
        para a <b>unidade</b> certa — tipo <b>SAC</b> vira chamado no SAC; os demais viram lead no <b>CRM</b>.
      </div>
      <SiteLeadsInbox leads={leads} unidades={ctx?.unidades ?? []} activeUnitId={ctx?.activeUnitId ?? null} />
    </div>
  )
}
