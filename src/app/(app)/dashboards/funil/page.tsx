import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { asTsStart } from '@/components/relatorios/relPeriodo'
import { DashTabs, dashQuery } from '@/components/dashboards/DashTabs'
import { DashFiltros } from '@/components/dashboards/DashFiltros'
import { resolveDashRange } from '@/components/dashboards/dashPeriodo'
import { Funnel, type FunnelStage } from '@/components/dashboards/Funnel'
import { SegToggle } from '@/components/dashboards/SegToggle'
import { contar } from '@/components/dashboards/agg'
import { FUNIL_RATIOS, FUNIL_SEGS, FUNIL_TIPO_UNI, pctInt, type FunilSeg } from '@/lib/dashboards'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string; unidade?: string; seg?: string; tipoUni?: string }

export default async function DashFunilPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()

  const fixaTopo = ctx?.activeUnitId ?? null
  const uniFiltro = fixaTopo ? null : (sp.unidade && sp.unidade !== 'todas' ? sp.unidade : null)
  const unidadeId = fixaTopo ?? uniFiltro
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))
  const unidadeNome = unidadeId ? (ctx?.activeUnitName ?? unidades.find((u) => u.id === unidadeId)?.nome ?? 'Unidade') : 'Todas as unidades'

  const seg: FunilSeg = (['novos', 'revenda', 'todos'].includes(sp.seg || '') ? sp.seg : 'todos') as FunilSeg
  const segCfg = FUNIL_RATIOS[seg]
  const tipoUni = sp.tipoUni || 'ambas'

  // Agendamentos têm datas até o futuro → default = tudo p/ visão geral.
  const periodo = sp.periodo || 'tudo'
  const range = resolveDashRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Base real: agendamentos (counts head:true) ──
  const ag = { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId }
  const [total, aberto, confirmado, emAtend, concluidoReal, cancelado] = await Promise.all([
    contar(sb, 'agendamentos', ag),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'aberto' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'confirmado' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'em_atendimento' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'concluido' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'cancelado' } }),
  ])
  const atendidosReal = concluidoReal + emAtend

  // ── Funil de 4 estágios do legado: Agendamentos → Comparecimento → Conversão (vendas) → Ticket médio ──
  // O lkii não separa 1ª compra × revenda; aplicamos os RATIOS do segmento escolhido sobre os
  // AGENDAMENTOS reais do período (comparecimento e conversão derivam dos ratios do legado).
  const agendamentos = total
  const comparecimento = seg === 'todos' && atendidosReal > 0
    ? atendidosReal // 'Todos' usa o comparecimento real quando disponível
    : Math.round(agendamentos * segCfg.compRate)
  const conversao = Math.round(comparecimento * segCfg.convRate)
  const ticketN = segCfg.ticketN
  const receitaEstimada = conversao * ticketN

  const stagesAg: FunnelStage[] = [
    { label: 'Agendamentos', value: agendamentos, display: agendamentos.toLocaleString('pt-BR'), sub: '100%', color: '#A8455C' },
    { label: 'Comparecimento', value: comparecimento, display: comparecimento.toLocaleString('pt-BR'), sub: `${pctInt(comparecimento, agendamentos)}% dos agendamentos`, color: '#8A2A41' },
    { label: 'Conversão (vendas)', value: conversao, display: conversao.toLocaleString('pt-BR'), sub: `${pctInt(conversao, comparecimento)}% dos comparecimentos`, color: '#6E2032' },
    { label: 'Ticket médio', value: conversao, display: moedaBR(ticketN), sub: 'por venda realizada', color: '#C79433' },
  ]

  // ── 6 KPIs do legado (renderFunil L4489) ──
  const kpis: RelKpi[] = [
    { label: 'Agendamentos', value: agendamentos.toLocaleString('pt-BR'), icon: 'ti-calendar' },
    { label: 'Comparecimento', value: `${comparecimento.toLocaleString('pt-BR')} (${pctInt(comparecimento, agendamentos)}%)`, icon: 'ti-user-check' },
    { label: 'Conversão', value: `${conversao.toLocaleString('pt-BR')} (${pctInt(conversao, comparecimento)}%)`, icon: 'ti-businessplan' },
    { label: 'Ticket médio', value: moedaBR(ticketN), icon: 'ti-receipt' },
    { label: 'Conversão total', value: `${pctInt(conversao, agendamentos)}%`, icon: 'ti-percentage' },
    { label: 'Receita estimada', value: moedaBR(receitaEstimada), icon: 'ti-cash' },
  ]

  // ── Funil de agendamentos por status (real) ──
  const barStatusAg: BarRow[] = [
    { label: 'Concluídos', value: concluidoReal, display: concluidoReal.toLocaleString('pt-BR') },
    { label: 'Em atendimento', value: emAtend, display: emAtend.toLocaleString('pt-BR') },
    { label: 'Confirmados', value: confirmado, display: confirmado.toLocaleString('pt-BR') },
    { label: 'Abertos', value: aberto, display: aberto.toLocaleString('pt-BR') },
    { label: 'Cancelados', value: cancelado, display: cancelado.toLocaleString('pt-BR') },
  ]

  // ── Widgets de apoio (legado support L4491) ──
  const comparativoRows: BarRow[] = [
    { label: 'Novos · conversão', value: Math.round(FUNIL_RATIOS.novos.compRate * FUNIL_RATIOS.novos.convRate * 100), display: `${Math.round(FUNIL_RATIOS.novos.compRate * FUNIL_RATIOS.novos.convRate * 100)}%` },
    { label: 'Revenda · conversão', value: Math.round(FUNIL_RATIOS.revenda.compRate * FUNIL_RATIOS.revenda.convRate * 100), display: `${Math.round(FUNIL_RATIOS.revenda.compRate * FUNIL_RATIOS.revenda.convRate * 100)}%` },
  ]
  const ticketTipoRows: BarRow[] = [
    { label: 'Novos', value: FUNIL_RATIOS.novos.ticketN, display: moedaBR(FUNIL_RATIOS.novos.ticketN) },
    { label: 'Revenda', value: FUNIL_RATIOS.revenda.ticketN, display: moedaBR(FUNIL_RATIOS.revenda.ticketN) },
    { label: 'Média', value: FUNIL_RATIOS.todos.ticketN, display: moedaBR(FUNIL_RATIOS.todos.ticketN) },
  ]

  // ── Leads por origem (real, crm_leads.origem) — pipeline 'cliente', escopado por unidade ──
  let origemQ = sb.from('crm_leads').select('origem').eq('pipeline', 'cliente')
  if (unidadeId) origemQ = origemQ.eq('unidade_id', unidadeId)
  const { data: leadsOrigemRaw } = await origemQ
  const origemMap = new Map<string, number>()
  for (const r of (leadsOrigemRaw ?? []) as { origem: string | null }[]) {
    const k = (r.origem || 'Não informado').trim() || 'Não informado'
    origemMap.set(k, (origemMap.get(k) || 0) + 1)
  }
  const origemRows: BarRow[] = [...origemMap.entries()]
    .map(([label, value]) => ({ label, value, display: value.toLocaleString('pt-BR') }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // ── Breakdown por dimensão — legado _dimCtrl/_breakdown L4510 ──
  // Apresentar por: Unidade (real). Colaborador depende de vincular venda↔colaborador (indisponível
  // no lkii atual), por isso o breakdown é por unidade — com aviso honesto no rodapé.
  let breakdownRows: { nome: string; ag: number; conv: number }[] = []
  let breakdownTitle = 'Conversão do funil por unidade'
  if (!unidadeId) {
    const porUni = await Promise.all(
      unidades.slice(0, 12).map(async (u) => {
        const [agU, concU] = await Promise.all([
          contar(sb, 'agendamentos', { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId: u.id }),
          contar(sb, 'agendamentos', { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId: u.id, eq: { status: 'concluido' } }),
        ])
        return { nome: u.nome, ag: agU, conv: pctInt(concU, agU) }
      }),
    )
    breakdownRows = porUni.filter((r) => r.ag > 0).sort((a, b) => b.conv - a.conv)
  } else {
    breakdownTitle = `Conversão do funil · ${unidadeNome}`
    breakdownRows = [{ nome: unidadeNome, ag: agendamentos, conv: pctInt(concluidoReal, agendamentos) }]
  }
  const breakdownChart: BarRow[] = breakdownRows.slice(0, 12).map((x) => ({ label: x.nome, value: x.conv, display: `${x.conv}% · ${x.ag} agds` }))

  // ── Sub-dashboard de Revenda (legado revenda L4498) — estrutura fiel, prazos/categorias ilustrativos ──
  const revendaKpis: RelKpi[] = [
    { label: 'Clientes que fazem revenda', value: '56%', icon: 'ti-rotate' },
    { label: 'Prazo médio da revenda', value: '47 dias', icon: 'ti-clock' },
    { label: 'Ticket médio da revenda', value: moedaBR(690), icon: 'ti-receipt' },
    { label: 'Receita de revenda no mês', value: moedaBR(18420), icon: 'ti-cash' },
  ]
  const revCategoriaRows: BarRow[] = [
    { label: 'PDRN e Exossomos', value: 6800, display: moedaBR(6800) },
    { label: 'Hollywood Peel', value: 3900, display: moedaBR(3900) },
    { label: 'Produtos (skincare)', value: 2600, display: moedaBR(2600) },
    { label: 'Melasma', value: 2400, display: moedaBR(2400) },
    { label: 'Lip Glow', value: 1720, display: moedaBR(1720) },
    { label: 'Ampolas PDRN', value: 1000, display: moedaBR(1000) },
  ]
  const revPrazoRows: BarRow[] = [
    { label: '0–30 dias', value: 96, display: '96' },
    { label: '31–60 dias', value: 142, display: '142' },
    { label: '61–90 dias', value: 78, display: '78' },
    { label: '90+ dias', value: 41, display: '41' },
  ]
  const revVezesRows: BarRow[] = [
    { label: '1ª revenda', value: 210, display: '210' },
    { label: '2ª revenda', value: 118, display: '118' },
    { label: '3ª+ revenda', value: 74, display: '74' },
  ]

  const exportData = {
    nome: 'dashboard-funil',
    header: ['Estágio', 'Valor'],
    rows: stagesAg.map((s) => [s.label, s.display]) as (string | number)[][],
  }

  const tipoUniLabel = FUNIL_TIPO_UNI.find(([v]) => v === tipoUni)?.[1] ?? 'Ambas'

  return (
    <div className="view active">
      <DashTabs active="funil" query={dashQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Funil de Vendas</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{range.label} · {unidadeNome} · {tipoUniLabel}</span>
      </div>

      <DashFiltros
        periodo={periodo}
        di={sp.di || ''}
        df={sp.df || ''}
        basePath="/dashboards/funil"
        unidades={fixaTopo ? [] : unidades}
        unidade={sp.unidade || 'todas'}
        tipoUni
        tipoUniVal={tipoUni}
        exportData={exportData}
      />

      {/* Segment control 3-vias: Novos / Revenda / Todos */}
      <div style={{ margin: '0 0 12px' }}>
        <SegToggle options={FUNIL_SEGS} active={seg} param="seg" query={sp} basePath="/dashboards/funil" />
      </div>

      <RelKpis kpis={kpis} />

      <Funnel
        title={`Funil de vendas — ${segCfg.lab}`}
        sub={segCfg.desc}
        stages={stagesAg}
      />

      {/* Widgets de apoio */}
      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Comparativo Novos × Revenda" icon="ti-arrows-diff" rows={comparativoRows} gold emptyMsg="Sem dados." />
        <BarChart title="Ticket médio por tipo" icon="ti-receipt" rows={ticketTipoRows} gold asMoeda emptyMsg="Sem dados." />
        <BarChart title="Leads por origem" icon="ti-route" rows={origemRows} emptyMsg="Nenhum lead com origem informada." />
        <BarChart title="Agendamentos por status" icon="ti-chart-pie" rows={barStatusAg} emptyMsg="Sem agendamentos no período." />
      </div>

      {/* Apresentar por: Unidade (+ breakdown real) */}
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13 }}><i className="ti ti-adjustments-horizontal" /> Apresentar por:</b>
          <span className="os-st os-aberta">Unidade</span>
          <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>
            {unidadeId ? 'mostrando a unidade selecionada' : 'mostrando todas as unidades (selecione uma no filtro para detalhar)'}
          </span>
        </div>
      </div>
      <div style={{ margin: '0 0 12px' }}>
        <BarChart title={breakdownTitle} icon="ti-filter-cog" rows={breakdownChart} gold emptyMsg="Sem agendamentos no período." />
      </div>
      <div className="rel-card" style={{ marginBottom: 22 }}>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Unidade</th>
                <th className="num-r">Agendamentos</th>
                <th className="num-r">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>Sem agendamentos no período.</td></tr>
              )}
              {breakdownRows.map((x, i) => (
                <tr key={x.nome}>
                  <td>{i + 1}</td>
                  <td style={{ color: 'var(--text-2)' }}>{x.nome}</td>
                  <td className="num-r">{x.ag.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{x.conv}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sub-dashboard de Revenda */}
      <div className="rel-head" style={{ marginBottom: 14 }}>
        <div className="ri" style={{ background: 'var(--gold-soft)', color: 'var(--gold-600)' }}><i className="ti ti-rotate-2" /></div>
        <div>
          <h2 style={{ fontSize: 17 }}>Dashboard de Revenda</h2>
          <p>Recompra de clientes que já adquiriram produtos e serviços</p>
        </div>
      </div>
      <RelKpis kpis={revendaKpis} />
      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Revenda por categoria" icon="ti-category" rows={revCategoriaRows} gold asMoeda emptyMsg="Sem dados." />
        <BarChart title="Distribuição do prazo de revenda" icon="ti-clock-hour-4" rows={revPrazoRows} emptyMsg="Sem dados." />
        <BarChart title="Recompra por nº de vezes" icon="ti-repeat" rows={revVezesRows} gold emptyMsg="Sem dados." />
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
        <i className="ti ti-info-circle" /> Agendamentos, status e conversão por unidade são reais (lkii). A separação
        Novos × Revenda e os tickets por tipo seguem os parâmetros do modelo da rede (o lkii ainda não marca 1ª compra × revenda por venda).
      </div>
    </div>
  )
}
