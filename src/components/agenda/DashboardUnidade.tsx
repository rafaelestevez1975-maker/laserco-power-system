import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import {
  resolvePeriodo, rangeISO, hojeBR, META_NOVOS_PCT, META_AVAL_PCT, type PeriodoKey,
} from '@/lib/agenda'
import { DashFiltro } from './DashFiltro'
import { Corridinha, type CorridinhaData, type RankRow } from './Corridinha'

/**
 * Dashboard da unidade (rota /). Server Component que substitui o clone estático.
 * Paridade com view-dashboard do legado (greeting, filtro de período, 3 KPIs,
 * funil unidade × rede, simulação, corridinha e ranking).
 * Fórmulas em src/lib/agenda.ts e nos comentados abaixo (📍 do legado).
 */

type SP = { per?: string; di?: string; df?: string }

type AgQuery = ReturnType<ReturnType<Awaited<ReturnType<typeof createClient>>['from']>['select']>

async function countAg(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null,
  de: string, ate: string,
  extra?: (q: AgQuery) => AgQuery,
): Promise<number> {
  let q = sb.from('agendamentos').select('id', { count: 'exact', head: true }).gte('inicio', de).lt('inicio', ate) as AgQuery
  if (unidadeId) q = q.eq('unidade_id', unidadeId) as AgQuery
  if (extra) q = extra(q)
  const { count } = (await q) as { count: number | null }
  return count ?? 0
}

export async function DashboardUnidade({ searchParams }: { searchParams: SP }) {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  const per = (searchParams.per || 'hoje') as PeriodoKey
  const periodo = resolvePeriodo(per, searchParams.di, searchParams.df)
  const { de, ate } = rangeISO(periodo.ini, periodo.fim)

  // ── KPI 1: Agendamentos do período (k-purple) ──────────────────────────────
  // total não-cancelados, novos (clientes criados no período) e avaliações.
  const novosRange = rangeISO(periodo.ini, periodo.fim)
  const [totalAg, comparecimentos, conversoes, avaliacoes, novosClientes] = await Promise.all([
    countAg(sb, unidadeId, de, ate, (q) => q.not('status', 'in', '(cancelado)')),
    countAg(sb, unidadeId, de, ate, (q) => q.in('status', ['concluido', 'em_atendimento'])),
    // conversões (vendas) = OS fechadas no período (proxy: agendamentos concluídos com OS).
    (async () => {
      let q = sb.from('os').select('id', { count: 'exact', head: true })
        .eq('status', 'fechada').gte('fechada_em', de).lt('fechada_em', ate)
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { count } = await q
      return count ?? 0
    })(),
    // avaliações = agendamentos cujo serviço se chama "Avaliação" (1ª opção do legado).
    (async () => {
      // pega ids de serviços "Avaliação" (nome contém 'avalia') e conta agendamentos deles.
      const { data: sv } = await sb.from('servicos').select('id').ilike('nome', '%avalia%').limit(50)
      const ids = ((sv ?? []) as Array<{ id: string }>).map((s) => s.id)
      if (ids.length === 0) return 0
      let q = sb.from('agendamentos').select('id', { count: 'exact', head: true })
        .gte('inicio', de).lt('inicio', ate).in('servico_id', ids).not('status', 'in', '(cancelado)')
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      const { count } = await q
      return count ?? 0
    })(),
    (async () => {
      let q = sb.from('clientes').select('id', { count: 'exact', head: true })
        .gte('criado_em', novosRange.de).lt('criado_em', novosRange.ate)
      // base de clientes compartilhada — não filtra por unidade.
      const { count } = await q
      return count ?? 0
    })(),
  ])

  // % de novos e de avaliações sobre os agendamentos (regra de meta do legado).
  const pctNovos = totalAg > 0 ? Math.round((novosClientes / totalAg) * 100) : 0
  const pctAval = totalAg > 0 ? Math.round((avaliacoes / totalAg) * 100) : 0
  const novosOk = pctNovos > META_NOVOS_PCT
  const avalOk = pctAval >= META_AVAL_PCT

  // ── KPI 2: Próximos 7 dias (k-gold) ────────────────────────────────────────
  const hoje = hojeBR()
  const fim7 = rangeISO(hoje, periodoSomaDias(hoje, 6))
  const ag7 = await countAg(sb, unidadeId, fim7.de, fim7.ate, (q) => q.not('status', 'in', '(cancelado)'))
  // Meta projetada = média de agendamentos/dia do último mês × 7 (média da unidade).
  const ultMes = rangeISO(periodoSomaDias(hoje, -30), hoje)
  const agUltMes = await countAg(sb, unidadeId, ultMes.de, ultMes.ate, (q) => q.not('status', 'in', '(cancelado)'))
  const meta7 = Math.max(ag7, Math.round((agUltMes / 30) * 7))
  const pct7 = meta7 > 0 ? Math.min(100, Math.round((ag7 / meta7) * 100)) : 0
  const faltam7 = Math.max(0, meta7 - ag7)

  // ── KPI 3: Meta da unidade · faturamento do mês (k-green) ───────────────────
  const mesIni = `${hoje.slice(0, 7)}-01`
  const mesRange = rangeISO(mesIni, hoje)
  const diaDoMes = Number(hoje.slice(8, 10))
  const diasNoMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate()
  const { vendido, meta } = await metaUnidade(sb, unidadeId, mesRange.de, mesRange.ate)
  const pctMeta = meta > 0 ? Math.round((vendido / meta) * 1000) / 10 : 0
  // Projeção = venda média diária × dias do mês (regra do legado).
  const mediaDia = diaDoMes > 0 ? vendido / diaDoMes : 0
  const projecao = Math.round(mediaDia * diasNoMes)
  const pctProj = meta > 0 ? Math.round((projecao / meta) * 100) : 0

  // ── Funil da unidade (Agendamentos → Comparecimentos → Conversões → Ticket) ─
  // % calculados sobre agendamentos (legado: 100% / 81% / 54%).
  const pctComp = totalAg > 0 ? Math.round((comparecimentos / totalAg) * 100) : 0
  const pctConv = totalAg > 0 ? Math.round((conversoes / totalAg) * 100) : 0
  const ticket = conversoes > 0 ? Math.round(vendido / conversoes) : 0

  const greetNome = (ctx?.nome || 'Operador').split(' ')[0]
  const unidLabel = ctx?.activeUnitName || 'Todas as unidades'

  // ── Corridinha / ranking da rede (dados REAIS por unidade) ──────────────────
  // Hoje (dia) e mês corrente, agregados por unidade a partir de agendamentos/OS.
  const hojeRange = rangeISO(hoje, hoje)
  const corridinha = await buildCorridinha(
    sb,
    ctx?.unidades ?? [],
    unidadeId,
    hojeRange,
    mesRange,
  )

  // Referência da rede (média por unidade) — números do legado como baseline visual.
  const REDE = { ag: 980, comp: 764, compP: 78, conv: 480, convP: 49, ticket: 392 }

  return (
    <div className="view active">
      {/* Greeting (legado L1172-1174) */}
      <div className="greeting" style={{ marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Bem-vindo, <span style={{ color: 'var(--brand-500)' }}>{greetNome}</span> 👋</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--text-2)', fontSize: 13 }}>{unidLabel} · {periodo.label}</p>
        </div>
      </div>

      {/* Filtro de período (dashPerSel) */}
      <DashFiltro per={per} di={searchParams.di || ''} df={searchParams.df || ''} />

      {/* 3 KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, margin: '4px 0 16px' }}>
        {/* k-purple: Agendamentos do período */}
        <div className="metric-box" style={{ borderLeft: '3px solid #8A6FD6', padding: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-calendar-check" /> Agendamentos · {periodo.label.toLowerCase()}</span>
          <b style={{ fontSize: 28 }}>{totalAg.toLocaleString('pt-BR')}</b>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-3)' }}>Clientes novos</span>
              <span><b>{novosClientes}</b> <Flag ok={novosOk} pct={pctNovos} /></span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-3)' }}>Avaliações (novos)</span>
              <span><b>{avaliacoes}</b> <Flag ok={avalOk} pct={pctAval} /></span>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>Metas: novos &gt; {META_NOVOS_PCT}% · avaliações ≥ {META_AVAL_PCT}% dos agendamentos</div>
        </div>

        {/* k-gold: Próximos 7 dias */}
        <div className="metric-box" style={{ borderLeft: '3px solid #C79433', padding: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-calendar-plus" /> Agendamentos · próximos 7 dias</span>
          <b style={{ fontSize: 28 }}>{ag7} <small style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 600 }}>/ meta {meta7}</small></b>
          <Barra pct={pct7} cor="#C79433" />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 4 }}>
            <span><b>{pct7}%</b> da meta projetada</span><span>faltam <b>{faltam7}</b></span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>Meta projetada pela média de agendamentos da unidade (último mês)</div>
        </div>

        {/* k-green: Meta da unidade (faturamento do mês) */}
        <div className="metric-box" style={{ borderLeft: '3px solid var(--green)', padding: 16 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i className="ti ti-target-arrow" /> Meta da unidade · mês</span>
          <b style={{ fontSize: 26 }}>{moedaBR(vendido)} <small style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>/ {meta > 0 ? moedaBR(meta) : '—'}</small></b>
          <Barra pct={Math.min(100, pctMeta)} cor="var(--green)" />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 4 }}>
            <span><b>{meta > 0 ? `${pctMeta}%` : '—'}</b> da meta</span><span>vendido acumulado</span>
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-3)' }}>Projeção de venda (mês)</span>
              <span><b>{moedaBR(projecao)}</b> {meta > 0 && <Flag ok={pctProj >= 100} pct={pctProj} />}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-3)' }}>Venda média / dia</span>
              <span><b>{moedaBR(Math.round(mediaDia))}</b></span>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>Projeção = venda média diária × dias do mês</div>
        </div>
      </div>

      {/* Funil unidade × rede */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <Funil titulo="Funil de vendas · unidade" icon="ti-filter-cog"
          rows={[
            { label: 'Agendamentos', val: totalAg.toLocaleString('pt-BR'), pct: '100%', bg: '#F7E7EB', cor: 'var(--brand-500)', ic: 'ti-calendar-check' },
            { label: 'Comparecimentos', val: comparecimentos.toLocaleString('pt-BR'), pct: `${pctComp}%`, bg: 'var(--blue-bg)', cor: 'var(--blue)', ic: 'ti-user-check' },
            { label: 'Conversões (vendas)', val: conversoes.toLocaleString('pt-BR'), pct: `${pctConv}%`, bg: 'var(--green-bg)', cor: 'var(--green)', ic: 'ti-shopping-cart-check' },
            { label: 'Ticket médio', val: moedaBR(ticket), pct: 'por venda', bg: 'var(--gold-soft)', cor: 'var(--gold-600)', ic: 'ti-receipt' },
          ]} legenda={periodo.label} />
        <Funil titulo="Referência · média da rede" icon="ti-affiliate" ref_
          rows={[
            { label: 'Agendamentos', val: REDE.ag.toLocaleString('pt-BR'), pct: '100%', bg: '#E9E5F0', cor: 'var(--brand-400)', ic: 'ti-calendar-check' },
            { label: 'Comparecimentos', val: REDE.comp.toLocaleString('pt-BR'), pct: `${REDE.compP}%`, bg: '#E3ECF6', cor: 'var(--blue)', ic: 'ti-user-check' },
            { label: 'Conversões (vendas)', val: REDE.conv.toLocaleString('pt-BR'), pct: `${REDE.convP}%`, bg: '#E2F0E8', cor: 'var(--green)', ic: 'ti-shopping-cart-check' },
            { label: 'Ticket médio', val: moedaBR(REDE.ticket), pct: 'por venda', bg: '#F3EAD6', cor: 'var(--gold-600)', ic: 'ti-receipt' },
          ]} legenda="por unidade · mês" />
      </div>

      {/* Simulação de crescimento (dashSim) */}
      <Simulacao ag={totalAg} compP={pctComp} convP={pctConv} ticket={ticket} rede={REDE} />

      {/* Corridinha + ranking de agendamentos do mês (dados reais da rede) */}
      <Corridinha data={corridinha} />
    </div>
  )
}

// ── Meta da unidade: lê tabela `metas` se existir; vendido = OS fechadas no mês ──
async function metaUnidade(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null, de: string, ate: string,
): Promise<{ vendido: number; meta: number }> {
  // Vendido acumulado = soma do total de OS fechadas no mês.
  let qV = sb.from('os').select('total').eq('status', 'fechada').gte('fechada_em', de).lt('fechada_em', ate).limit(5000)
  if (unidadeId) qV = qV.eq('unidade_id', unidadeId)
  const { data: vRows } = await qV
  const vendido = ((vRows ?? []) as Array<{ total: number | null }>).reduce((s, r) => s + (Number(r.total) || 0), 0)

  // Meta de faturamento da unidade (tabela `metas`, se existir/estiver populada).
  let meta = 0
  try {
    let qM = sb.from('metas').select('valor, valor_meta, meta_valor').limit(1)
    if (unidadeId) qM = qM.eq('unidade_id', unidadeId)
    const { data: mRow } = await qM
    const m = ((mRow ?? []) as Array<Record<string, unknown>>)[0]
    if (m) meta = Number(m.valor_meta ?? m.meta_valor ?? m.valor ?? 0) || 0
  } catch { /* tabela metas pode não existir; meta=0 → mostra "—" */ }
  return { vendido, meta }
}

function periodoSomaDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00-03:00`)
  d.setDate(d.getDate() + n)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

// ── Ranking real da rede (corridinha) ───────────────────────────────────────
// Agrega agendamentos (dia/mês) e vendas/OS fechadas (dia/mês) por unidade,
// usando SÓ dados reais. Sem mock, sem Math.random. Vendas entram apenas como
// POSIÇÃO (valor oculto, paridade com o legado). Erro de query → estado honesto.
const PAGE = 1000
const PULL_CAP = 30000

/** Soma do `total` das OS fechadas no período, agrupado por unidade_id. */
async function somaOsPorUnidade(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null, de: string, ate: string,
): Promise<{ map: Map<string, number>; erro: boolean }> {
  const map = new Map<string, number>()
  let from = 0
  for (;;) {
    let q = sb.from('os').select('unidade_id, total')
      .eq('status', 'fechada').gte('fechada_em', de).lt('fechada_em', ate)
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) return { map, erro: true }
    const rows = (data ?? []) as Array<{ unidade_id: string | null; total: number | null }>
    for (const r of rows) {
      if (!r.unidade_id) continue
      map.set(r.unidade_id, (map.get(r.unidade_id) ?? 0) + (Number(r.total) || 0))
    }
    if (rows.length < PAGE || from + PAGE >= PULL_CAP) break
    from += PAGE
  }
  return { map, erro: false }
}

/** Contagem de agendamentos não-cancelados no período, agrupado por unidade_id. */
async function contaAgPorUnidade(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null, de: string, ate: string,
): Promise<{ map: Map<string, number>; erro: boolean }> {
  const map = new Map<string, number>()
  let from = 0
  for (;;) {
    let q = sb.from('agendamentos').select('unidade_id')
      .gte('inicio', de).lt('inicio', ate).not('status', 'in', '(cancelado)')
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) return { map, erro: true }
    const rows = (data ?? []) as Array<{ unidade_id: string | null }>
    for (const r of rows) {
      if (!r.unidade_id) continue
      map.set(r.unidade_id, (map.get(r.unidade_id) ?? 0) + 1)
    }
    if (rows.length < PAGE || from + PAGE >= PULL_CAP) break
    from += PAGE
  }
  return { map, erro: false }
}

/** Converte um mapa unidade→valor em posições (1 = maior). Só inclui valores > 0. */
function posicoes(map: Map<string, number>): Map<string, number> {
  const ordenado = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const pos = new Map<string, number>()
  ordenado.forEach(([id], i) => pos.set(id, i + 1))
  return pos
}

async function buildCorridinha(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidades: Array<{ id: string; nome: string }>,
  minhaId: string | null,
  hojeRange: { de: string; ate: string },
  mesRange: { de: string; ate: string },
): Promise<CorridinhaData> {
  if (unidades.length === 0) return { rows: [], minhaId, erro: false }

  // Quando o usuário tem unidade ativa, a RLS pode limitar a leitura à própria
  // unidade — então NÃO filtramos por unidade aqui (queremos a rede inteira).
  // A RLS do Supabase ainda decide o que cada perfil enxerga.
  const [agDia, agMes, vendaDia, vendaMes] = await Promise.all([
    contaAgPorUnidade(sb, null, hojeRange.de, hojeRange.ate),
    contaAgPorUnidade(sb, null, mesRange.de, mesRange.ate),
    somaOsPorUnidade(sb, null, hojeRange.de, hojeRange.ate),
    somaOsPorUnidade(sb, null, mesRange.de, mesRange.ate),
  ])

  const erro = agDia.erro || agMes.erro || vendaDia.erro || vendaMes.erro
  if (erro) return { rows: [], minhaId, erro: true }

  const posDia = posicoes(vendaDia.map)
  const posMes = posicoes(vendaMes.map)

  const rows: RankRow[] = unidades.map((u) => ({
    id: u.id,
    u: u.nome,
    agd: agDia.map.get(u.id) ?? 0,
    agm: agMes.map.get(u.id) ?? 0,
    posVendaDia: posDia.get(u.id) ?? 0,
    posVendaMes: posMes.get(u.id) ?? 0,
    temVendaDia: (vendaDia.map.get(u.id) ?? 0) > 0,
    temVendaMes: (vendaMes.map.get(u.id) ?? 0) > 0,
  }))

  return { rows, minhaId, erro: false }
}

// ── Subcomponentes visuais ──────────────────────────────────────────────────
function Flag({ ok, pct }: { ok: boolean; pct: number }) {
  return ok
    ? <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 11.5 }}><i className="ti ti-check" /> {pct}%</span>
    : <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 11.5 }}><i className="ti ti-alert-triangle" /> {pct}%</span>
}
function Barra({ pct, cor }: { pct: number; cor: string }) {
  return (
    <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', margin: '8px 0 2px' }}>
      <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: cor }} />
    </div>
  )
}
type FunilRow = { label: string; val: string; pct: string; bg: string; cor: string; ic: string }
function Funil({ titulo, icon, rows, legenda, ref_ }: { titulo: string; icon: string; rows: FunilRow[]; legenda: string; ref_?: boolean }) {
  return (
    <div className="panel" style={ref_ ? { background: 'var(--surface-2)' } : undefined}>
      <div className="panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}><i className={`ti ${icon}`} /> {titulo}</h3>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{legenda}</span>
      </div>
      <div className="panel-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.bg, color: r.cor }}><i className={`ti ${r.ic}`} /></div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{r.label}</span>
              <b style={{ fontSize: 16 }}>{r.val}</b>
            </div>
            <span style={{ background: r.bg, color: r.cor, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>{r.pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Simulação de crescimento (dashSimRender) ────────────────────────────────
function Simulacao({ ag, compP, convP, ticket, rede }: { ag: number; compP: number; convP: number; ticket: number; rede: { compP: number; convP: number; ticket: number } }) {
  if (!ag || !ticket) return null
  const curConv = Math.round((ag * compP) / 100 * convP / 100)
  const curRev = curConv * ticket
  let tComp = Math.max(compP, rede.compP), tConv = Math.max(convP, rede.convP), tTicket = Math.max(ticket, rede.ticket)
  let cenario = 'média da rede'
  if (tComp === compP && tConv === convP && tTicket === ticket) {
    tComp = Math.max(Math.round(rede.compP * 1.12), compP)
    tConv = Math.max(Math.round(rede.convP * 1.12), convP)
    tTicket = Math.max(Math.round(rede.ticket * 1.12), ticket)
    cenario = 'melhores unidades da rede'
  }
  const projConv = Math.round((ag * tComp) / 100 * tConv / 100)
  const projRev = projConv * tTicket
  const uplift = curRev > 0 ? Math.round((projRev / curRev - 1) * 100) : 0
  const rev = (c: number, v: number, t: number) => Math.round((ag * c) / 100 * v / 100) * t
  const gComp = rev(tComp, convP, ticket) - curRev
  const gConv = rev(compP, tConv, ticket) - curRev
  const gTicket = rev(compP, convP, tTicket) - curRev
  const best = Math.max(gComp, gConv, gTicket)
  const bestLbl = best <= 0 ? 'volume de agendamentos' : best === gComp ? 'comparecimento' : best === gConv ? 'conversão' : 'ticket médio'

  const Ind = ({ lab, cur, alvo, suf }: { lab: string; cur: number; alvo: number; suf: string }) => {
    const up = alvo > cur
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
        <span>{lab}</span>
        <span><b>{cur}{suf}</b>{up
          ? <> <i className="ti ti-arrow-right" style={{ color: 'var(--text-3)' }} /> <b style={{ color: 'var(--green)' }}>{alvo}{suf}</b></>
          : <span style={{ color: 'var(--green)', fontSize: 11 }}> ✓ acima da média</span>}</span>
      </div>
    )
  }

  return (
    <div className="panel" style={{ borderLeft: '3px solid var(--gold-500)', marginBottom: 18 }}>
      <div className="panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}><i className="ti ti-rocket" /> Simulação de crescimento</h3>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>elevando ao patamar da {cenario}</span>
      </div>
      <div className="panel-body" style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 18, alignItems: 'center' }}>
          <div>
            <Ind lab="Comparecimento" cur={compP} alvo={tComp} suf="%" />
            <Ind lab="Conversão" cur={convP} alvo={tConv} suf="%" />
            <Ind lab="Ticket médio" cur={ticket} alvo={tTicket} suf="" />
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}><i className="ti ti-bulb" style={{ color: 'var(--gold-500)' }} /> Maior alavanca de ganho: <b>{bestLbl}</b></div>
          </div>
          <div style={{ textAlign: 'center', background: 'var(--gold-soft)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Venda no período</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'line-through' }}>{moedaBR(curRev)}</div>
            <div style={{ fontSize: 25, fontWeight: 800, color: 'var(--brand-500)', margin: '2px 0' }}>{moedaBR(projRev)}</div>
            <div style={{ display: 'inline-block', background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 800, fontSize: 15, padding: '3px 13px', borderRadius: 20 }}>+{uplift}% de venda</div>
          </div>
        </div>
      </div>
    </div>
  )
}
