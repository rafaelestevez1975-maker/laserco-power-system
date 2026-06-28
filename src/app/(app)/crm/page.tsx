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

  // Contagem REAL por etapa (count exato, não cai no teto de 500 — mesmo padrão do SAC
  // Kanban). O cabeçalho de cada coluna e os KPIs de número usam isto; a lista de cards
  // continua capada em 500 por etapa do board.
  const contagens = await Promise.all(etapas.map((et) => {
    let cq = sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('pipeline', 'cliente').eq('etapa_id', et.id)
    if (activeUnit) cq = cq.eq('unidade_id', activeUnit)
    return cq
  }))
  const totaisPorEtapa: Record<string, number> = {}
  etapas.forEach((et, i) => { totaisPorEtapa[et.id] = contagens[i].count ?? 0 })

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

  // KPIs reais — usam a CONTAGEM exata por etapa (não o array capado em 500).
  // Etapas de fechamento (ganho/perdido) por nome, p/ separar do "funil ativo".
  const ehGanho = (n: string) => /convert|ganho|fechad/i.test(n)
  const ehPerdido = (n: string) => /perdid/i.test(n)
  const ganho = etapas.filter((e) => ehGanho(e.nome)).reduce((s, e) => s + (totaisPorEtapa[e.id] ?? 0), 0)
  const perdido = etapas.filter((e) => ehPerdido(e.nome)).reduce((s, e) => s + (totaisPorEtapa[e.id] ?? 0), 0)
  const ativos = etapas.filter((e) => !ehGanho(e.nome) && !ehPerdido(e.nome))
  const totalFunil = ativos.reduce((s, e) => s + (totaisPorEtapa[e.id] ?? 0), 0)
  const conv = ganho + perdido > 0 ? Math.round((ganho / (ganho + perdido)) * 100) : 0
  const agora = Date.now()
  // Valor em negociação e prazos 48h vencidos dependem de valor/criado_em por lead —
  // calculados sobre os leads carregados (até 500 mais recentes por unidade).
  const idsAtivos = new Set(ativos.map((e) => e.id))
  const leadsAtivos = leads.filter((l) => l.etapa_id && idsAtivos.has(l.etapa_id))
  const valorNeg = leadsAtivos.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  const vencidos = leadsAtivos.filter((l) => l.criado_em && agora - new Date(l.criado_em).getTime() > 48 * 3600e3).length

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
        <div className="metric-box"><span>Leads no funil</span><b>{totalFunil}</b></div>
        <div className="metric-box"><span>Valor em negociação</span><b>{money(valorNeg)}</b></div>
        <div className="metric-box"><span>Taxa de conversão</span><b>{conv}%</b></div>
        <div className="metric-box" style={vencidos > 0 ? { border: '1.5px solid var(--red)' } : undefined}>
          <span>Prazos 48h vencidos</span><b style={{ color: vencidos > 0 ? 'var(--red)' : undefined }}>{vencidos}</b>
        </div>
      </div>

      <CrmBoard etapas={etapas} leads={leads} totaisPorEtapa={totaisPorEtapa} unidades={ctx?.unidades ?? []} colaboradores={colaboradores} activeUnitId={activeUnit} isAdmin={ctx?.isAdmin ?? false} />
    </div>
  )
}
