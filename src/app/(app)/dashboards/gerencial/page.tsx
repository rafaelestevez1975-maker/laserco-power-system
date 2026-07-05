import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { asTsStart } from '@/components/relatorios/relPeriodo'
import { DashTabs, dashQuery } from '@/components/dashboards/DashTabs'
import { DashFiltros } from '@/components/dashboards/DashFiltros'
import { resolveDashRange } from '@/components/dashboards/dashPeriodo'
import { GerServBusca } from '@/components/dashboards/GerServBusca'
import {
  contar, pullLancamentos, somaLanc, somaPorChave, pullServicosPorOS,
  ultimosMeses, rotuloMes,
} from '@/components/dashboards/agg'
import { pullOS } from '@/lib/relatorios'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string; unidade?: string }

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

const FORMA_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  credito: 'Crédito', debito: 'Débito', boleto: 'Boleto', transferencia: 'Transferência',
  link: 'Link de pagamento', credito_recorrente: 'Crédito Recorrente', cheque: 'Cheque', outros: 'Outros',
}

export default async function DashGerencialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()

  const fixaTopo = ctx?.activeUnitId ?? null
  const uniFiltro = fixaTopo ? null : (sp.unidade && sp.unidade !== 'todas' ? sp.unidade : null)
  const unidadeId = fixaTopo ?? uniFiltro
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))
  const unidadeNome = unidadeId ? (ctx?.activeUnitName ?? unidades.find((u) => u.id === unidadeId)?.nome ?? 'Unidade') : 'Todas as unidades'

  // Default = 90 dias (QA 05/07: '30d' caía depois do fim dos dados → faturamento R$0).
  const periodo = sp.periodo || '90d'
  const range = resolveDashRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Agregados de topo (counts head:true + soma de receita + OS fechadas p/ serviços) ──
  const ag = { dateCol: 'inicio', gte: iniTs, lt: fimTs, unidadeId }
  const [totalAg, concluido, cancelado, rec, osFech] = await Promise.all([
    contar(sb, 'agendamentos', ag),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'concluido' } }),
    contar(sb, 'agendamentos', { ...ag, eq: { status: 'cancelado' } }),
    pullLancamentos(sb, 'receita', unidadeId, range.ini, range.fim),
    pullOS(sb, { unidadeId, ini: range.ini, fim: range.fim, status: 'fechada' }),
  ])
  const totalReceita = somaLanc(rec.rows)

  // ── Serviços (faturamento + sessões reais via os_servicos das OS fechadas) ──
  const servicos = await pullServicosPorOS(sb, osFech.rows.map((o) => o.id))
  const totServFat = servicos.reduce((a, s) => a + s.faturamento, 0)
  const totSessoes = servicos.reduce((a, s) => a + s.sessoes, 0)
  const ranked = [...servicos].sort((a, b) => b.faturamento - a.faturamento)
  const topServ = ranked.slice(0, 10)

  // ── 5 KPIs do legado (Faturamento/Ticket/Atendimentos/Sessões/Taxa de retorno) ──
  const atendimentos = concluido // agendamentos concluídos = atendimentos realizados
  const sessoesReal = totSessoes > 0 ? totSessoes : atendimentos // sessões via os_servicos; fallback p/ atendimentos
  const ticketMedio = atendimentos > 0 ? totalReceita / atendimentos : 0
  const taxaRetorno = pct(concluido, totalAg) // % de comparecimento como proxy de retorno/efetividade

  const kpis: RelKpi[] = [
    { label: 'Faturamento no período', value: moedaBR(totalReceita), icon: 'ti-currency-dollar' },
    { label: 'Ticket médio', value: moedaBR(ticketMedio), icon: 'ti-receipt' },
    { label: 'Atendimentos', value: atendimentos.toLocaleString('pt-BR'), icon: 'ti-user-check' },
    { label: 'Sessões realizadas', value: sessoesReal.toLocaleString('pt-BR'), icon: 'ti-checkbox' },
    { label: 'Taxa de retorno', value: `${taxaRetorno}%`, icon: 'ti-rotate', delta: `${concluido.toLocaleString('pt-BR')} de ${totalAg.toLocaleString('pt-BR')} agend.`, deltaTone: 'flat' },
  ]

  // ── Widget: Faturamento por forma de pagamento (real, lancamentos_financeiros) ──
  const porForma = somaPorChave(rec.rows, (r) => r.forma_pagamento || 'outros')
  const formaRows: BarRow[] = [...porForma.entries()]
    .map(([k, v]) => ({ label: FORMA_LABEL[k] ?? k, value: v, display: moedaBR(v) }))
    .sort((a, b) => b.value - a.value)

  // ── Widget: Top 10 serviços por faturamento e por sessões ──
  const topFatRows: BarRow[] = topServ.map((s) => ({ label: s.nome, value: s.faturamento, display: moedaBR(s.faturamento) }))
  const topSessRows: BarRow[] = [...ranked].sort((a, b) => b.sessoes - a.sessoes).slice(0, 10)
    .map((s) => ({ label: s.nome, value: s.sessoes, display: `${s.sessoes} sess.` }))

  // ── Séries mensais (12 meses) p/ a tabela ──
  const meses = ultimosMeses(range.fim, 12)
  const recPorMes = new Map<string, number>()
  for (const r of rec.rows) {
    if (!r.data_competencia) continue
    const ym = r.data_competencia.slice(0, 7)
    recPorMes.set(ym, (recPorMes.get(ym) || 0) + (r.valor || 0))
  }
  const serieReceita: BarRow[] = meses.map((m) => ({ label: rotuloMes(m.ym), value: recPorMes.get(m.ym) || 0 }))

  const exportData = {
    nome: 'dashboard-gerencial',
    header: ['#', 'Serviço', 'Faturamento', '% do total', 'Sessões', 'Ticket médio'],
    rows: topServ.map((s, i) => [
      i + 1, s.nome, moedaBR(s.faturamento),
      `${totServFat > 0 ? ((s.faturamento / totServFat) * 100).toFixed(1) : '0,0'}%`,
      s.sessoes, moedaBR(s.sessoes > 0 ? s.faturamento / s.sessoes : 0),
    ]) as (string | number)[][],
  }

  return (
    <div className="view active">
      <DashTabs active="gerencial" query={dashQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Dashboard Gerencial</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{range.label} · {unidadeNome}</span>
      </div>

      <DashFiltros
        periodo={periodo}
        di={sp.di || ''}
        df={sp.df || ''}
        basePath="/dashboards/gerencial"
        unidades={fixaTopo ? [] : unidades}
        unidade={sp.unidade || 'todas'}
        exportData={topServ.length > 0 ? exportData : undefined}
      />

      <RelKpis kpis={kpis} />

      <GerServBusca servicos={servicos} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Top 10 serviços  faturamento" icon="ti-sparkles" rows={topFatRows} gold asMoeda emptyMsg="Sem vendas de serviço no período (OS fechadas)." />
        <BarChart title="Top 10 serviços  sessões realizadas" icon="ti-checkbox" rows={topSessRows} emptyMsg="Sem sessões no período." />
        <BarChart title="Faturamento por forma de pagamento" icon="ti-credit-card" rows={formaRows} gold asMoeda emptyMsg="Sem receita lançada no período." />
        <BarChart title="Receita por mês" icon="ti-chart-bar" rows={serieReceita} gold asMoeda emptyMsg="Sem receita no período." />
      </div>

      <div style={{ marginTop: 4 }}>
        <div className="set-sec" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 8px' }}>
          Top 10 serviços  detalhamento (com % do total)
        </div>
        <div className="rel-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Serviço</th>
                  <th className="num-r">Faturamento</th>
                  <th className="num-r">% do total</th>
                  <th className="num-r">Sessões</th>
                  <th className="num-r">Ticket médio</th>
                </tr>
              </thead>
              <tbody>
                {topServ.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                      Nenhuma venda de serviço (OS fechada) no período selecionado.
                    </td>
                  </tr>
                )}
                {topServ.map((s, i) => (
                  <tr key={s.nome}>
                    <td>{i + 1}</td>
                    <td style={{ color: 'var(--text-2)' }}>{s.nome}</td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(s.faturamento)}</td>
                    <td className="num-r">{totServFat > 0 ? ((s.faturamento / totServFat) * 100).toFixed(1) : '0,0'}%</td>
                    <td className="num-r">{s.sessoes.toLocaleString('pt-BR')}</td>
                    <td className="num-r">{moedaBR(s.sessoes > 0 ? s.faturamento / s.sessoes : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 12 }}>
        <i className="ti ti-info-circle" /> Faturamento por serviço/sessões vem das OS <b>fechadas</b> do período (os_servicos);
        forma de pagamento e faturamento total vêm de lançamentos financeiros. Atendimentos = agendamentos concluídos.
        {(osFech.capped || rec.capped) && ' Período amplo: agregação limitada aos primeiros registros  refine o período.'}
      </div>
    </div>
  )
}
