import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { CrmBoard, type Etapa, type Lead } from '@/components/crm/CrmBoard'

const money = (v: number) => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR')

export default async function CrmPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null

  const { data: etapasRaw } = await sb
    .from('crm_etapas').select('id, nome, ordem, cor').eq('ativo', true).order('ordem', { ascending: true })
  const etapas = (etapasRaw ?? []) as Etapa[]

  let q = sb
    .from('crm_leads')
    .select('id, nome, telefone, origem, servico_interesse, valor_estimado, etapa_id, status, ia_score, criado_em')
    .order('criado_em', { ascending: false }).limit(500)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)
  const { data: leadsRaw } = await q
  const leads = (leadsRaw ?? []) as (Lead & { criado_em: string | null })[]

  const { count: siteLeadsCount } = await sb.from('site_leads').select('id', { count: 'exact', head: true })

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
      <div className="crm-note">
        <i className="ti ti-info-circle" /> Funil padrão Laser&amp;Co — dados reais
        {activeUnit ? ' da unidade ativa' : ' (todas as unidades que você acessa)'}.
      </div>

      <Link href="/leads-site" className="crm-note" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-500)', display: 'block', textDecoration: 'none', color: 'inherit' }}>
        <i className="ti ti-inbox" /> <b>Leads do site:</b> {siteLeadsCount ?? 0} na caixa de entrada
        {' '}— clique para rotear por unidade (SAC / CRM). <i className="ti ti-arrow-right" />
      </Link>

      {vencidos > 0 && (
        <div id="crmAlert">
          <div className="crm-sla-alert">
            <i className="ti ti-alarm" /> <b>{vencidos} lead(s) com prazo de 48h vencido</b> — dê andamento para não perder a venda.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '14px 0 18px' }}>
        <div className="metric-box"><span>Leads no funil</span><b>{ativos.length}</b></div>
        <div className="metric-box"><span>Valor em negociação</span><b>{money(valorNeg)}</b></div>
        <div className="metric-box"><span>Taxa de conversão</span><b>{conv}%</b></div>
        <div className="metric-box"><span>Prazo 48h vencido</span><b>{vencidos}</b></div>
      </div>

      <CrmBoard etapas={etapas} leads={leads} unidades={ctx?.unidades ?? []} activeUnitId={activeUnit} />
    </div>
  )
}
