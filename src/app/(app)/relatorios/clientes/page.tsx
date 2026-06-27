import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Interface estrutural mínima do builder (eq/gte/lt encadeáveis + thenable p/ count).
type CountQuery = {
  eq: (c: string, v: unknown) => CountQuery
  gte: (c: string, v: unknown) => CountQuery
  lt: (c: string, v: unknown) => CountQuery
  then: Promise<{ count: number | null }>['then']
}

/** Conta clientes (head:true → só count) com filtros opcionais. */
async function contar(
  sb: Awaited<ReturnType<typeof createClient>>,
  build: (q: CountQuery) => CountQuery,
): Promise<number> {
  const base = sb.from('clientes').select('id', { count: 'exact', head: true }) as unknown as CountQuery
  const { count } = await build(base)
  return count ?? 0
}

export default async function RelClientesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  // OBS: clientes.unidade_origem_id é SEMPRE null na base (introspecção) → não dá p/ escopar por unidade.
  // Mantemos o aviso na tela; quando a coluna for populada, o gate vira eq('unidade_origem_id', activeUnitId).
  const range = resolveRelRange(sp.periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── KPIs globais (head:true — nunca puxa as 347k linhas) ──
  const [totalGeral, ativos, verificados, novosPeriodo] = await Promise.all([
    contar(sb, (q) => q),
    contar(sb, (q) => q.eq('ativo', true)),
    contar(sb, (q) => q.eq('verificado', true)),
    contar(sb, (q) => {
      let qq = q
      if (iniTs) qq = qq.gte('criado_em', iniTs)
      if (fimTs) qq = qq.lt('criado_em', fimTs)
      return qq
    }),
  ])
  const inativos = totalGeral - ativos
  const pctAtivos = totalGeral > 0 ? (ativos / totalGeral) * 100 : 0

  // ── Novos clientes por mês (últimos 6 meses) — 6 counts head, barato ──
  const hoje = new Date()
  const tarefasMes: Promise<{ label: string; count: number }>[] = []
  for (let i = 5; i >= 0; i--) {
    const a = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const b = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1)
    const label = `${MESES_CURTO[a.getMonth()]}/${String(a.getFullYear()).slice(2)}`
    tarefasMes.push(
      (async () => {
        const cnt = await contar(sb, (q) => q.gte('criado_em', a.toISOString()).lt('criado_em', b.toISOString()))
        return { label, count: cnt }
      })(),
    )
  }
  const novosPorMes = await Promise.all(tarefasMes)

  const barNovos: BarRow[] = novosPorMes.map((m) => ({ label: m.label, value: m.count, display: m.count.toLocaleString('pt-BR') }))
  const barBase: BarRow[] = [
    { label: 'Ativos', value: ativos, display: ativos.toLocaleString('pt-BR') },
    { label: 'Inativos', value: inativos, display: inativos.toLocaleString('pt-BR') },
    { label: 'Verificados', value: verificados, display: verificados.toLocaleString('pt-BR') },
  ]

  const kpis: RelKpi[] = [
    { label: 'Base total', value: totalGeral.toLocaleString('pt-BR'), icon: 'ti-users' },
    { label: 'Ativos', value: ativos.toLocaleString('pt-BR'), icon: 'ti-user-check', delta: `${pctAtivos.toFixed(1)}% da base`, deltaTone: 'up' },
    { label: `Novos (${range.label})`, value: novosPeriodo.toLocaleString('pt-BR'), icon: 'ti-user-plus' },
    { label: 'Verificados', value: verificados.toLocaleString('pt-BR'), icon: 'ti-rosette-discount-check' },
  ]

  return (
    <div className="view active">
      <RelTabs active="clientes" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Clientes</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Novos no período: {range.label}</span>
      </div>

      <RelFiltros periodo={sp.periodo || 'mes'} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/clientes" />

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Novos clientes (últimos 6 meses)" icon="ti-user-plus" rows={barNovos} emptyMsg="Sem cadastros recentes." />
        <BarChart title="Composição da base" icon="ti-chart-pie" rows={barBase} emptyMsg="Base vazia." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Resumo da base
          </span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="num-r">Quantidade</th>
                <th className="num-r">% da base</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Total de clientes', totalGeral],
                  ['Ativos', ativos],
                  ['Inativos', inativos],
                  ['Verificados', verificados],
                  [`Novos em ${range.label}`, novosPeriodo],
                ] as [string, number][]
              ).map(([label, val]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{val.toLocaleString('pt-BR')}</td>
                  <td className="num-r">{totalGeral > 0 ? ((val / totalGeral) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rel-card" style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 14px' }}>
        <i className="ti ti-info-circle" /> Os números são da base inteira: a coluna <code>unidade_origem_id</code> não está populada no backend,
        então não é possível segmentar clientes por unidade ainda.
        {/* TODO(legado: buildClientes): segmentar por unidade quando unidade_origem_id for populado;
            breakdown por cidade/estado/canal_origem (count por valor) e cohort de retenção. */}
      </div>
    </div>
  )
}
