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
import { contar, DashAggError } from '@/components/dashboards/agg'
import { pullOS } from '@/lib/relatorios'
import { FUNIL_TIPO_UNI, pctInt, uniEhPropria } from '@/lib/dashboards'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string; unidade?: string; tipoUni?: string }

export default async function DashFunilPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()

  const fixaTopo = ctx?.activeUnitId ?? null
  const uniFiltro = fixaTopo ? null : (sp.unidade && sp.unidade !== 'todas' ? sp.unidade : null)
  const unidadeId = fixaTopo ?? uniFiltro
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))
  const unidadeNome = unidadeId ? (ctx?.activeUnitName ?? unidades.find((u) => u.id === unidadeId)?.nome ?? 'Unidade') : 'Todas as unidades'

  const tipoUni = ['proprias', 'franquias'].includes(sp.tipoUni || '') ? (sp.tipoUni as string) : 'ambas'

  // ── Filtro REAL "Tipo de unidade": resolve quais unidades entram no escopo ──
  // própria = CNPJ da franqueadora (uniEhPropria). Só se aplica quando NÃO há unidade fixa/selecionada.
  let unidadeIdsScope: string[] | null = null // null = sem restrição por lista
  let tipoUniNota = ''
  if (!unidadeId && tipoUni !== 'ambas' && unidades.length > 0) {
    const { data: cnpjs, error } = await sb
      .from('unidades')
      .select('id, cnpj')
      .in('id', unidades.map((u) => u.id))
    if (error) throw new DashAggError('unidades', error.message)
    const rows = (cnpjs ?? []) as { id: string; cnpj: string | null }[]
    unidadeIdsScope = rows
      .filter((u) => (tipoUni === 'proprias' ? uniEhPropria(u.cnpj) : !uniEhPropria(u.cnpj)))
      .map((u) => u.id)
    if (unidadeIdsScope.length === 0) tipoUniNota = 'Nenhuma unidade do tipo selecionado.'
  }

  // Agendamentos têm datas até o futuro → default = tudo p/ visão geral.
  const periodo = sp.periodo || 'tudo'
  const range = resolveDashRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // Lista de unidades efetivas a contar (respeita escopo do tipoUni).
  const escopoUnis: (string | null)[] = unidadeId
    ? [unidadeId]
    : unidadeIdsScope
      ? unidadeIdsScope
      : [null] // null = todas as visíveis (RLS)

  // ── Base real: agendamentos (counts head:true), somando sobre o escopo ──
  async function contarAg(eq?: Record<string, string>): Promise<number> {
    if (escopoUnis.length === 0) return 0
    const parts = await Promise.all(
      escopoUnis.map((u) => contar(sb, 'agendamentos', { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId: u, eq })),
    )
    return parts.reduce((a, b) => a + b, 0)
  }
  const [total, aberto, confirmado, emAtend, concluidoReal, cancelado] = await Promise.all([
    contarAg(),
    contarAg({ status: 'aberto' }),
    contarAg({ status: 'confirmado' }),
    contarAg({ status: 'em_atendimento' }),
    contarAg({ status: 'concluido' }),
    contarAg({ status: 'cancelado' }),
  ])
  const atendidosReal = concluidoReal + emAtend

  // ── Vendas REAIS: OS fechadas no período (count + receita = soma de total) ──
  // Substitui os ratios/tickets HARDCODED do legado por dado real do ERP (os.status='fechada').
  let osCapped = false
  let vendas = 0
  let receita = 0
  for (const u of escopoUnis) {
    const { rows, capped } = await pullOS(sb, { unidadeId: u, ini: range.ini, fim: range.fim, status: 'fechada' })
    vendas += rows.length
    receita += rows.reduce((a, o) => a + (o.total || 0), 0)
    osCapped = osCapped || capped
  }
  const ticketMedio = vendas > 0 ? receita / vendas : 0

  const agendamentos = total
  const comparecimento = atendidosReal

  // ── Funil de 4 estágios com DADO REAL: Agendamentos → Comparecimento → Vendas → Receita ──
  const stagesAg: FunnelStage[] = [
    { label: 'Agendamentos', value: agendamentos, display: agendamentos.toLocaleString('pt-BR'), sub: '100%', color: '#A8455C' },
    { label: 'Comparecimento', value: comparecimento, display: comparecimento.toLocaleString('pt-BR'), sub: `${pctInt(comparecimento, agendamentos)}% dos agendamentos`, color: '#8A2A41' },
    { label: 'Vendas (OS fechadas)', value: vendas, display: vendas.toLocaleString('pt-BR'), sub: `${pctInt(vendas, comparecimento)}% dos comparecimentos`, color: '#6E2032' },
    { label: 'Receita', value: vendas, display: moedaBR(receita), sub: 'OS fechadas no período', color: '#C79433' },
  ]

  // ── 6 KPIs (todos com dado real) ──
  const kpis: RelKpi[] = [
    { label: 'Agendamentos', value: agendamentos.toLocaleString('pt-BR'), icon: 'ti-calendar' },
    { label: 'Comparecimento', value: `${comparecimento.toLocaleString('pt-BR')} (${pctInt(comparecimento, agendamentos)}%)`, icon: 'ti-user-check' },
    { label: 'Vendas (OS fechadas)', value: `${vendas.toLocaleString('pt-BR')} (${pctInt(vendas, comparecimento)}%)`, icon: 'ti-businessplan' },
    { label: 'Ticket médio', value: vendas > 0 ? moedaBR(ticketMedio) : '', icon: 'ti-receipt' },
    { label: 'Conversão total', value: `${pctInt(vendas, agendamentos)}%`, icon: 'ti-percentage' },
    { label: 'Receita (OS fechadas)', value: moedaBR(receita), icon: 'ti-cash' },
  ]

  // ── Funil de agendamentos por status (real) ──
  const barStatusAg: BarRow[] = [
    { label: 'Concluídos', value: concluidoReal, display: concluidoReal.toLocaleString('pt-BR') },
    { label: 'Em atendimento', value: emAtend, display: emAtend.toLocaleString('pt-BR') },
    { label: 'Confirmados', value: confirmado, display: confirmado.toLocaleString('pt-BR') },
    { label: 'Abertos', value: aberto, display: aberto.toLocaleString('pt-BR') },
    { label: 'Cancelados', value: cancelado, display: cancelado.toLocaleString('pt-BR') },
  ]

  // ── Leads por origem (real, crm_leads.origem)  pipeline 'cliente', escopado por unidade ──
  // Pagina com range(): um select simples é cortado no teto de 1000 do PostgREST → subcontava
  // as origens em qualquer rede com +1000 leads. Teto de segurança em 50k linhas (só a coluna origem).
  const origemMap = new Map<string, number>()
  for (let from = 0; from < 50000; from += 1000) {
    let origemQ = sb.from('crm_leads').select('origem, id').eq('pipeline', 'cliente')
    if (unidadeId) origemQ = origemQ.eq('unidade_id', unidadeId)
    else if (unidadeIdsScope) origemQ = origemQ.in('unidade_id', unidadeIdsScope)
    // order estável por id: paginar com range() sem order deixa a ordem instável entre páginas
    // (seq scan vs index, insert concorrente) → linhas puladas/duplicadas → origem subcontada.
    origemQ = origemQ.order('id', { ascending: true })
    const { data, error: leadsErr } = await origemQ.range(from, from + 999)
    if (leadsErr) throw new DashAggError('crm_leads', leadsErr.message)
    const lote = (data ?? []) as { origem: string | null }[]
    for (const r of lote) {
      const k = (r.origem || 'Não informado').trim() || 'Não informado'
      origemMap.set(k, (origemMap.get(k) || 0) + 1)
    }
    if (lote.length < 1000) break
  }
  const origemRows: BarRow[] = [...origemMap.entries()]
    .map(([label, value]) => ({ label, value, display: value.toLocaleString('pt-BR') }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  // ── Breakdown por unidade (real): agendamentos × vendas (OS fechadas) por unidade ──
  let breakdownRows: { nome: string; ag: number; vendas: number; conv: number }[] = []
  let breakdownTitle = 'Conversão (vendas/agendamentos) por unidade'
  if (!unidadeId) {
    const lista = (unidadeIdsScope
      ? unidades.filter((u) => unidadeIdsScope!.includes(u.id))
      : unidades
    ).slice(0, 12)
    const porUni = await Promise.all(
      lista.map(async (u) => {
        const [agU, os] = await Promise.all([
          contar(sb, 'agendamentos', { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId: u.id }),
          pullOS(sb, { unidadeId: u.id, ini: range.ini, fim: range.fim, status: 'fechada' }),
        ])
        return { nome: u.nome, ag: agU, vendas: os.rows.length, conv: pctInt(os.rows.length, agU) }
      }),
    )
    breakdownRows = porUni.filter((r) => r.ag > 0 || r.vendas > 0).sort((a, b) => b.vendas - a.vendas)
  } else {
    breakdownTitle = `Conversão (vendas/agendamentos) · ${unidadeNome}`
    breakdownRows = [{ nome: unidadeNome, ag: agendamentos, vendas, conv: pctInt(vendas, agendamentos) }]
  }
  const breakdownChart: BarRow[] = breakdownRows.slice(0, 12).map((x) => ({ label: x.nome, value: x.vendas, display: `${x.vendas} vendas · ${x.conv}%` }))

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

      {tipoUniNota && (
        <div className="rel-card" style={{ fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px', marginBottom: 12 }}>
          <i className="ti ti-info-circle" /> {tipoUniNota}
        </div>
      )}
      {osCapped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: agregando as primeiras OS. Refine o período para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <Funnel
        title="Funil de vendas  agendamentos até receita"
        sub="Dado real do ERP: agendamentos, comparecimento (concluídos + em atendimento), vendas (OS fechadas) e receita do período."
        stages={stagesAg}
      />

      {/* Widgets de apoio (todos com dado real) */}
      <div className="dash-grid" style={{ marginBottom: 16 }}>
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
        <BarChart title={breakdownTitle} icon="ti-filter-cog" rows={breakdownChart} gold emptyMsg="Sem vendas no período." />
      </div>
      <div className="rel-card" style={{ marginBottom: 22 }}>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Unidade</th>
                <th className="num-r">Agendamentos</th>
                <th className="num-r">Vendas</th>
                <th className="num-r">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>Sem dados no período.</td></tr>
              )}
              {breakdownRows.map((x, i) => (
                <tr key={x.nome}>
                  <td>{i + 1}</td>
                  <td style={{ color: 'var(--text-2)' }}>{x.nome}</td>
                  <td className="num-r">{x.ag.toLocaleString('pt-BR')}</td>
                  <td className="num-r">{x.vendas.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{x.conv}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
        <i className="ti ti-info-circle" /> Todos os números vêm do ERP: agendamentos/comparecimento de <b>agendamentos</b>,
        vendas e receita de <b>OS fechadas</b> (os.status=&apos;fechada&apos;) no período. A separação Novos × Revenda ainda
        não é registrada por venda no ERP, por isso não é exibida.
      </div>
    </div>
  )
}
