import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'
import { DashTabs, dashQuery } from '@/components/dashboards/DashTabs'
import { Funnel, type FunnelStage } from '@/components/dashboards/Funnel'
import { contar } from '@/components/dashboards/agg'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

export default async function DashFunilPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Agendamentos têm datas até o futuro → 'mes' funciona; default = tudo p/ visão geral.
  const periodo = sp.periodo || 'tudo'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Funil de AGENDAMENTOS (136k) — só counts head:true, nunca puxa linhas ──
  // Estágios reais (status descobertos na introspecção): aberto+confirmado → em_atendimento → concluido.
  // O funil de "comparecimento" usa concluido+em_atendimento como atendidos; cancelado é a perda.
  const ag = { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId }
  const [total, aberto, confirmado, emAtend, concluido, cancelado] = await Promise.all([
    contar(sb, 'agendamentos', ag),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'aberto' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'confirmado' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'em_atendimento' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'concluido' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'cancelado' } }),
  ])
  const atendidos = concluido + emAtend
  const validos = total - cancelado // agendamentos que não foram cancelados

  const stagesAg: FunnelStage[] = [
    { label: 'Agendamentos', value: total, display: total.toLocaleString('pt-BR'), sub: '100% no período', color: '#A8455C' },
    { label: 'Não cancelados', value: validos, display: validos.toLocaleString('pt-BR'), sub: `${pct(validos, total)}% dos agendamentos`, color: '#8A2A41' },
    { label: 'Atendidos', value: atendidos, display: atendidos.toLocaleString('pt-BR'), sub: `${pct(atendidos, total)}% dos agendamentos`, color: '#6E2032' },
    { label: 'Concluídos', value: concluido, display: concluido.toLocaleString('pt-BR'), sub: `${pct(concluido, total)}% do total`, color: '#C79433' },
  ]

  const barStatusAg: BarRow[] = [
    { label: 'Concluídos', value: concluido, display: concluido.toLocaleString('pt-BR') },
    { label: 'Em atendimento', value: emAtend, display: emAtend.toLocaleString('pt-BR') },
    { label: 'Confirmados', value: confirmado, display: confirmado.toLocaleString('pt-BR') },
    { label: 'Abertos', value: aberto, display: aberto.toLocaleString('pt-BR') },
    { label: 'Cancelados', value: cancelado, display: cancelado.toLocaleString('pt-BR') },
  ]

  // ── Funil de CRM (crm_leads por etapa) ──
  // crm_etapas é a ordem real do pipeline; conta leads por etapa_id (head:true).
  const { data: etapasRaw } = await sb
    .from('crm_etapas')
    .select('id, nome, ordem, cor')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
  const etapas = (etapasRaw ?? []) as { id: string; nome: string; ordem: number; cor: string | null }[]

  // crm_leads não tem coluna de data confiável para o período → conta por etapa sem filtro de data
  // (a base atual tem pouquíssimos leads; mostramos o estado real do pipeline).
  const etapaCounts = await Promise.all(
    etapas.map((e) => contar(sb, 'crm_leads', { eq: { etapa_id: e.id }, unidadeId })),
  )
  const leadsTotal = etapaCounts.reduce((a, b) => a + b, 0)
  const barEtapas: BarRow[] = etapas.map((e, i) => ({
    label: e.nome,
    value: etapaCounts[i],
    display: etapaCounts[i].toLocaleString('pt-BR'),
  }))
  const convEtapa = etapas.find((e) => e.nome.toLowerCase().includes('convertid'))
  const convertidos = convEtapa ? etapaCounts[etapas.indexOf(convEtapa)] : 0

  const kpis: RelKpi[] = [
    { label: 'Agendamentos', value: total.toLocaleString('pt-BR'), icon: 'ti-calendar-stats' },
    { label: 'Atendidos', value: atendidos.toLocaleString('pt-BR'), icon: 'ti-user-check', delta: `${pct(atendidos, total)}% de comparecimento`, deltaTone: 'up' },
    { label: 'Cancelados', value: cancelado.toLocaleString('pt-BR'), icon: 'ti-calendar-x', delta: `${pct(cancelado, total)}% de cancelamento`, deltaTone: pct(cancelado, total) > 25 ? 'down' : 'flat' },
    { label: 'Leads no CRM', value: leadsTotal.toLocaleString('pt-BR'), icon: 'ti-user-plus', delta: `${convertidos} convertido${convertidos === 1 ? '' : 's'}`, deltaTone: 'flat' },
  ]

  return (
    <div className="view active">
      <DashTabs active="funil" query={dashQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Funil de Vendas</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/dashboards/funil" />

      <RelKpis kpis={kpis} />

      <Funnel
        title="Funil de agendamentos"
        sub="Da reserva ao atendimento concluído — agendamentos reais da rede (status do lkii)."
        stages={stagesAg}
      />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Agendamentos por status" icon="ti-chart-pie" rows={barStatusAg} emptyMsg="Sem agendamentos no período." />
        <BarChart
          title="Leads do CRM por etapa"
          icon="ti-route"
          rows={barEtapas}
          gold
          emptyMsg="Nenhum lead no CRM ainda."
        />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-list-check" /> Pipeline do CRM por etapa
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{leadsTotal.toLocaleString('pt-BR')} leads</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Etapa</th>
                <th className="num-r">Leads</th>
                <th className="num-r">% do pipeline</th>
              </tr>
            </thead>
            <tbody>
              {leadsTotal === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum lead cadastrado no CRM ainda. O funil de agendamentos acima reflete a operação real.
                  </td>
                </tr>
              )}
              {etapas.map((e, i) => (
                <tr key={e.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: e.cor || 'var(--brand-500)', display: 'inline-block' }} />
                      {e.nome}
                    </span>
                  </td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{etapaCounts[i].toLocaleString('pt-BR')}</td>
                  <td className="num-r">{leadsTotal > 0 ? ((etapaCounts[i] / leadsTotal) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TODO(legado: buildDashb/funil): segmentação Novos × Revenda e funil por colaborador
          (legacy FUNIL_DATA/renderFunil) dependem de marcar lead/venda como 1ª compra vs revenda
          e de vincular vendas a colaborador — colunas/tabela inexistentes no lkii atual. */}
    </div>
  )
}
