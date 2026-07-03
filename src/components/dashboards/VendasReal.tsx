import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { DashFiltros } from '@/components/dashboards/DashFiltros'
import { resolveDashRange } from '@/components/dashboards/dashPeriodo'
import { rotuloMes, ultimosMeses } from '@/components/dashboards/agg'
import { pullOS } from '@/lib/relatorios'
import { pctInt } from '@/lib/dashboards'

export const VENDAS_CFG: Record<string, { titulo: string; sub: string; defPeriodo: string; comparativo?: boolean }> = {
  'vendas-geral': { titulo: 'Vendas · Visão Geral', sub: 'Panorama consolidado de vendas da rede (OS fechadas)', defPeriodo: 'ano' },
  'vendas-mes': { titulo: 'Vendas · Mês Atual', sub: 'Desempenho do mês corrente (OS fechadas)', defPeriodo: 'mes' },
  'vendas-comparativo': { titulo: 'Vendas · Comparativo', sub: 'Período atual × período anterior (OS fechadas)', defPeriodo: 'mes', comparativo: true },
  'vendas-historico': { titulo: 'Vendas · Histórico', sub: 'Série histórica de vendas (OS fechadas)', defPeriodo: 'ano' },
}

export type VendasSP = { periodo?: string; di?: string; df?: string; unidade?: string }

/**
 * Dashboards de Vendas com DADO REAL do ERP (substitui o iframe que apontava para outro
 * projeto Supabase com login próprio e tabelas inexistentes no ERP). Vendas = OS fechadas
 * (os.status='fechada'); receita = soma de os.total; ticket = receita/vendas. Escopo por
 * unidade quando o filtro for usado; senão consolida todas as unidades visíveis (RLS).
 */
export async function VendasReal({ slug, sp, podeVer }: { slug: string; sp: VendasSP; podeVer: boolean }) {
  const cfg = VENDAS_CFG[slug] ?? VENDAS_CFG['vendas-geral']

  if (!podeVer) {
    return (
      <div className="view active">
        <div className="rel-card" style={{ textAlign: 'center', padding: 40 }}>
          <i className="ti ti-lock" style={{ fontSize: 34, color: 'var(--text-3)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '12px 0 6px' }}>Acesso restrito</h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            Os dashboards de Vendas são exclusivos da administração da franqueadora.
          </p>
        </div>
      </div>
    )
  }

  const ctx = await getSessionContext()
  const sb = await createClient()

  const fixaTopo = ctx?.activeUnitId ?? null
  const uniFiltro = fixaTopo ? null : (sp.unidade && sp.unidade !== 'todas' ? sp.unidade : null)
  const unidadeId = fixaTopo ?? uniFiltro
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))
  const unidadeNome = unidadeId ? (ctx?.activeUnitName ?? unidades.find((u) => u.id === unidadeId)?.nome ?? 'Unidade') : 'Todas as unidades'

  const periodo = sp.periodo || cfg.defPeriodo
  const range = resolveDashRange(periodo, sp.di, sp.df)

  // ── Vendas REAIS do período: OS fechadas (count + receita = soma de total) ──
  const { rows: osRows, capped } = await pullOS(sb, { unidadeId, ini: range.ini, fim: range.fim, status: 'fechada' })
  const vendas = osRows.length
  const receita = osRows.reduce((a, o) => a + (o.total || 0), 0)
  const ticket = vendas > 0 ? receita / vendas : 0
  const desconto = osRows.reduce((a, o) => a + (o.desconto_total || 0), 0)

  // ── Comparativo (período anterior)  só quando há janela anterior definida ──
  let prev: { vendas: number; receita: number } | null = null
  if (cfg.comparativo && range.prevIni && range.prevFim) {
    const { rows: prevRows } = await pullOS(sb, { unidadeId, ini: range.prevIni, fim: range.prevFim, status: 'fechada' })
    prev = { vendas: prevRows.length, receita: prevRows.reduce((a, o) => a + (o.total || 0), 0) }
  }
  const deltaPct = (atual: number, ant: number) => (ant > 0 ? Math.round(((atual - ant) / ant) * 100) : null)

  const kpis: RelKpi[] = [
    {
      label: 'Receita (OS fechadas)', value: moedaBR(receita), icon: 'ti-cash',
      ...(prev ? { delta: deltaPct(receita, prev.receita) != null ? `${deltaPct(receita, prev.receita)}% vs ${range.prevLabel}` : `vs ${range.prevLabel}`, deltaTone: (receita >= prev.receita ? 'up' : 'down') as 'up' | 'down' } : {}),
    },
    {
      label: 'Vendas', value: vendas.toLocaleString('pt-BR'), icon: 'ti-shopping-cart',
      ...(prev ? { delta: deltaPct(vendas, prev.vendas) != null ? `${deltaPct(vendas, prev.vendas)}% vs ${range.prevLabel}` : `vs ${range.prevLabel}`, deltaTone: (vendas >= prev.vendas ? 'up' : 'down') as 'up' | 'down' } : {}),
    },
    { label: 'Ticket médio', value: vendas > 0 ? moedaBR(ticket) : '', icon: 'ti-receipt' },
    { label: 'Descontos concedidos', value: moedaBR(desconto), icon: 'ti-discount' },
  ]

  // ── Série mensal (12 meses) por receita das OS fechadas ──
  const meses = ultimosMeses(range.fim, 12)
  const recPorMes = new Map<string, number>()
  const qtdPorMes = new Map<string, number>()
  for (const o of osRows) {
    if (!o.criado_em) continue
    const ym = o.criado_em.slice(0, 7)
    recPorMes.set(ym, (recPorMes.get(ym) || 0) + (o.total || 0))
    qtdPorMes.set(ym, (qtdPorMes.get(ym) || 0) + 1)
  }
  const serieReceita: BarRow[] = meses.map((m) => ({ label: rotuloMes(m.ym), value: recPorMes.get(m.ym) || 0, display: moedaBR(recPorMes.get(m.ym) || 0) }))

  // ── Breakdown por unidade (real) quando não há unidade fixa ──
  let porUni: { nome: string; vendas: number; receita: number }[] = []
  if (!unidadeId) {
    porUni = await Promise.all(
      unidades.slice(0, 20).map(async (u) => {
        const { rows } = await pullOS(sb, { unidadeId: u.id, ini: range.ini, fim: range.fim, status: 'fechada' })
        return { nome: u.nome, vendas: rows.length, receita: rows.reduce((a, o) => a + (o.total || 0), 0) }
      }),
    )
    porUni = porUni.filter((u) => u.vendas > 0).sort((a, b) => b.receita - a.receita)
  }
  const uniRows: BarRow[] = porUni.slice(0, 12).map((u) => ({ label: u.nome, value: u.receita, display: moedaBR(u.receita) }))

  const exportData = {
    nome: slug,
    header: ['Mês', 'Receita'],
    rows: serieReceita.map((s) => [s.label, s.display ?? moedaBR(s.value)]) as (string | number)[][],
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{cfg.titulo}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{range.label} · {unidadeNome}</span>
        <span className="os-st os-aberta" style={{ marginLeft: 4 }}>ADMIN</span>
      </div>

      <DashFiltros
        periodo={periodo}
        di={sp.di || ''}
        df={sp.df || ''}
        basePath={`/dashboards/${slug}`}
        unidades={fixaTopo ? [] : unidades}
        unidade={sp.unidade || 'todas'}
        exportData={serieReceita.some((s) => s.value > 0) ? exportData : undefined}
      />

      {capped && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: agregando as primeiras OS. Refine o período para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      {prev && (
        <div className="rel-card" style={{ marginBottom: 14, fontSize: 12.5, color: 'var(--text-2)' }}>
          <b><i className="ti ti-arrows-left-right" /> Comparativo</b>  período anterior ({range.prevLabel}):{' '}
          {moedaBR(prev.receita)} em {prev.vendas.toLocaleString('pt-BR')} vendas.{' '}
          {prev.receita > 0 && <>Variação de receita: <b>{deltaPct(receita, prev.receita)}%</b>.</>}
        </div>
      )}

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Receita por mês" icon="ti-chart-bar" rows={serieReceita} gold asMoeda emptyMsg="Sem vendas (OS fechadas) no período." />
        {!unidadeId && <BarChart title="Receita por unidade" icon="ti-building-store" rows={uniRows} asMoeda emptyMsg="Sem vendas (OS fechadas) no período." />}
      </div>

      {!unidadeId && (
        <div className="rel-card">
          <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
            <span><i className="ti ti-building-store" /> Vendas por unidade</span>
          </div>
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Unidade</th>
                  <th className="num-r">Vendas</th>
                  <th className="num-r">Receita</th>
                  <th className="num-r">% da receita</th>
                </tr>
              </thead>
              <tbody>
                {porUni.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>Sem vendas (OS fechadas) no período selecionado.</td></tr>
                )}
                {porUni.map((u, i) => (
                  <tr key={u.nome}>
                    <td>{i + 1}</td>
                    <td style={{ color: 'var(--text-2)' }}>{u.nome}</td>
                    <td className="num-r">{u.vendas.toLocaleString('pt-BR')}</td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(u.receita)}</td>
                    <td className="num-r">{pctInt(u.receita, receita)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 12 }}>
        <i className="ti ti-info-circle" /> Vendas = OS <b>fechadas</b> (os.status=&apos;fechada&apos;); receita = soma de os.total; ticket = receita/vendas.
        Dados do ERP, escopados por unidade conforme o filtro.
      </div>
    </div>
  )
}
