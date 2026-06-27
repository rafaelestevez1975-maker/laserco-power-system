import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { CrmBoard, type Etapa, type Lead } from '@/components/crm/CrmBoard'
import { moedaBR } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

const money = moedaBR

type LeadRow = Lead & { criado_em: string | null; responsavel_id?: string | null }

export default async function CrmPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null

  // pipeline='cliente' separa o CRM de clientes do funil de Expansão (franquia) — migration 050
  const { data: etapasRaw } = await sb
    .from('crm_etapas').select('id, nome, ordem, cor').eq('ativo', true).eq('pipeline', 'cliente').order('ordem', { ascending: true })
  const etapas = (etapasRaw ?? []) as Etapa[]

  let q = sb
    .from('crm_leads')
    .select('id, nome, telefone, origem, servico_interesse, valor_estimado, etapa_id, status, ia_score, temperatura, criado_em, responsavel_id')
    .eq('pipeline', 'cliente')
    .order('criado_em', { ascending: false }).limit(500)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)
  const { data: leadsRaw } = await q
  const leadRows = (leadsRaw ?? []) as LeadRow[]

  // Nomes dos responsáveis (1 query, mapeada por id) + colaboradores p/ o select do modal.
  const { data: colabRaw } = await sb
    .from('perfis_usuario').select('id, nome_completo').eq('ativo', true)
    .order('nome_completo', { ascending: true }).range(0, 499)
  const colaboradores = ((colabRaw ?? []) as { id: string; nome_completo: string | null }[]).map((c) => ({ id: c.id, nome: c.nome_completo || '(sem nome)' }))
  const nomePorId = new Map(colaboradores.map((c) => [c.id, c.nome]))

  const leads: Lead[] = leadRows.map((l) => ({
    ...l,
    responsavel_nome: l.responsavel_id ? (nomePorId.get(l.responsavel_id) ?? null) : null,
  }))

  // KPIs reais
  const nomeDe = (id: string | null) => etapas.find((e) => e.id === id)?.nome ?? ''
  const ganho = leads.filter((l) => nomeDe(l.etapa_id) === 'Convertido').length
  const perdido = leads.filter((l) => nomeDe(l.etapa_id) === 'Perdido').length
  const ativos = leads.filter((l) => !['Convertido', 'Perdido'].includes(nomeDe(l.etapa_id)))
  const valorNeg = ativos.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  const conv = ganho + perdido > 0 ? Math.round((ganho / (ganho + perdido)) * 100) : 0
  const agora = Date.now()
  const vencidos = ativos.filter((l) => l.criado_em && agora - new Date(l.criado_em).getTime() > 48 * 3600e3).length

  return (
    <div className="view active">
      {vencidos > 0 && (
        <div id="crmAlert">
          <div className="crm-sla-alert">
            <i className="ti ti-alarm" /> <b>{vencidos} lead(s) com prazo de 48h vencido</b>  dê andamento para não perder a venda.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '14px 0 18px' }}>
        <div className="metric-box"><span>Leads no funil</span><b>{ativos.length}</b></div>
        <div className="metric-box"><span>Valor em negociação</span><b>{money(valorNeg)}</b></div>
        <div className="metric-box"><span>Taxa de conversão</span><b>{conv}%</b></div>
        <div className="metric-box" style={vencidos > 0 ? { border: '1.5px solid var(--red)' } : undefined}>
          <span>Prazos 48h vencidos</span><b style={{ color: vencidos > 0 ? 'var(--red)' : undefined }}>{vencidos}</b>
        </div>
      </div>

      <CrmBoard etapas={etapas} leads={leads} unidades={ctx?.unidades ?? []} colaboradores={colaboradores} activeUnitId={activeUnit} isAdmin={ctx?.isAdmin ?? false} />
    </div>
  )
}
