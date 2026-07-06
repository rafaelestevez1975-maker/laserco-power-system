import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'
import { rotuloMes } from '@/components/dashboards/agg'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de segurança ao paginar (SEMPRE escopamos por período/unidade no servidor).
// IMPORTANTE: paginamos com range() em lotes de PAGE — um único .limit(N) grande é cortado
// silenciosamente pelo teto max-rows (=1000) do PostgREST, o que fazia o relatório enxergar
// só as ~1000 OS mais recentes (subcontagem grave numa janela com ~12k vendas de pacote).
const PULL_CAP = 20000
const PAGE = 1000

// Venda de pacote = ORDEM DE SERVIÇO com origem='pacote'.
// A tabela de itens os_pacotes veio VAZIA do import BEMP (só cabeçalhos de OS entraram);
// portanto a fonte real das vendas de pacote é a própria OS (origem='pacote'). Colunas
// confirmadas no banco: preco_total (bruto), desconto_total, total (líquido), status, criado_em.
// Obs.: o import não trouxe QUAL pacote (não há pacote_id na OS), então não há ranking por
// nome de pacote nos dados históricos — o detalhamento por pacote passa a existir conforme o
// PDV gerar novas vendas (que populam os_pacotes). Aqui reportamos os agregados reais + por mês.
type OsRow = {
  status: string | null
  preco_total: number | null
  desconto_total: number | null
  total: number | null
  criado_em: string | null
}

/** Pagina (range) as OS de pacote do período/unidade. Nunca usa um .limit() grande (max-rows). */
async function pullPacotes(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null,
  iniTs: string | null,
  fimTs: string | null,
): Promise<{ rows: OsRow[]; capped: boolean; erro: boolean }> {
  const out: OsRow[] = []
  let from = 0
  let capped = false
  for (;;) {
    let query = sb
      .from('os')
      .select('status, preco_total, desconto_total, total, criado_em')
      .eq('origem', 'pacote')
      .order('criado_em', { ascending: false })
    if (unidadeId) query = query.eq('unidade_id', unidadeId)
    if (iniTs) query = query.gte('criado_em', iniTs)
    if (fimTs) query = query.lt('criado_em', fimTs)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) return { rows: out, capped, erro: true }
    const batch = (data ?? []) as OsRow[]
    out.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
    if (out.length >= PULL_CAP) {
      capped = true
      break
    }
  }
  return { rows: out, capped, erro: false }
}

export default async function RelPacotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Vendas de pacote concentram-se no mês corrente → 90d cobre bem sem nascer vazio.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Pull das OS de pacote escopadas por período (criado_em) + unidade ──
  const { rows, capped: pullCapped, erro: error } = await pullPacotes(sb, unidadeId, iniTs, fimTs)

  // ── Agrega em memória (janela escopada, no máx. PULL_CAP linhas) ──
  // Muitas OS de pacote são CORTESIA/indicação (total=0, 100% de desconto). Contamos essas
  // à parte para não distorcer o ticket médio (calculado só sobre os pacotes pagos).
  let receita = 0
  let descontos = 0
  let canceladas = 0
  let cortesias = 0
  let pagos = 0
  const itens = rows.length

  // por mês (YYYY-MM) → { receita, qtd, pagos }
  const porMes = new Map<string, { receita: number; qtd: number; pagos: number }>()

  for (const r of rows) {
    const isCancelada = (r.status || '').toLowerCase() === 'cancelada'
    if (isCancelada) {
      canceladas += 1
      continue // vendas canceladas não entram nas métricas de receita
    }
    const valor = Number(r.total) || 0
    const desc = Number(r.desconto_total) || 0
    receita += valor
    descontos += desc
    const ehPago = valor > 0
    if (ehPago) pagos += 1
    else cortesias += 1

    const ym = (r.criado_em || '').slice(0, 7) // YYYY-MM
    if (ym) {
      const acc = porMes.get(ym) || { receita: 0, qtd: 0, pagos: 0 }
      acc.receita += valor
      acc.qtd += 1
      if (ehPago) acc.pagos += 1
      porMes.set(ym, acc)
    }
  }

  const vendidos = itens - canceladas
  const ticketMedio = pagos > 0 ? receita / pagos : 0
  const capped = pullCapped

  // Séries por mês (cronológicas) para gráficos + tabela de detalhamento.
  const meses = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const barReceita: BarRow[] = meses.map(([ym, v]) => ({ label: rotuloMes(ym), value: v.receita, display: moedaBR(v.receita) }))
  const barQtd: BarRow[] = meses.map(([ym, v]) => ({ label: rotuloMes(ym), value: v.qtd, display: v.qtd.toLocaleString('pt-BR') }))

  const kpis: RelKpi[] = [
    { label: 'Receita de pacotes', value: moedaBR(receita), icon: 'ti-cash' },
    { label: 'Pacotes vendidos', value: vendidos.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-package' },
    { label: 'Ticket médio (pagos)', value: moedaBR(ticketMedio), icon: 'ti-receipt-2' },
    { label: 'Cortesias (100% desc.)', value: cortesias.toLocaleString('pt-BR'), icon: 'ti-gift' },
  ]

  return (
    <div className="view active">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Relatório de Pacotes</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/pacotes" />

      {error && (
        <div className="crm-note" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar as vendas de pacotes agora. Mostrando relatório vazio.
        </div>
      )}

      {capped && !error && (
        <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
          <i className="ti ti-alert-triangle" /> Período muito amplo: somando as primeiras {PULL_CAP.toLocaleString('pt-BR')} vendas. Refine o período ou filtre por unidade para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Receita de pacotes por mês" icon="ti-calendar-dollar" rows={barReceita} gold asMoeda emptyMsg="Sem receita de pacotes no período." />
        <BarChart title="Pacotes vendidos por mês" icon="ti-package" rows={barQtd} emptyMsg="Nenhum pacote vendido no período." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Detalhamento por mês
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{vendidos.toLocaleString('pt-BR')} venda(s) no período</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th className="num-r">Pacotes vendidos</th>
                <th className="num-r">Receita</th>
                <th className="num-r">Ticket médio</th>
                <th className="num-r">% da receita</th>
              </tr>
            </thead>
            <tbody>
              {meses.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum pacote vendido no período selecionado.
                  </td>
                </tr>
              )}
              {meses.map(([ym, v]) => (
                <tr key={ym}>
                  <td>{rotuloMes(ym)}</td>
                  <td className="num-r">{v.qtd.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(v.receita)}</td>
                  <td className="num-r">{moedaBR(v.pagos > 0 ? v.receita / v.pagos : 0)}</td>
                  <td className="num-r">{receita > 0 ? ((v.receita / receita) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              ))}
            </tbody>
            {meses.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>Total</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{vendidos.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(receita)}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(ticketMedio)}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="crm-note" style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-3)' }}>
        <i className="ti ti-info-circle" /> Vendas de pacotes = ordens de serviço com origem <code>pacote</code>, escopadas pela data de
        abertura da OS e pela unidade ativa. O ticket médio considera só os pacotes pagos; as {cortesias.toLocaleString('pt-BR')} cortesia(s)
        (100% de desconto, ex.: indicação) entram na contagem de vendidos mas não no ticket. Total de descontos concedidos no período:
        {' '}{moedaBR(descontos)}.
        {canceladas > 0 && <> {canceladas.toLocaleString('pt-BR')} venda(s) cancelada(s) foram desconsideradas.</>} O detalhamento
        por nome de pacote passa a aparecer conforme novas vendas forem registradas pelo PDV (a base importada do BEMP não trouxe
        qual pacote de cada OS).
      </div>
    </div>
  )
}
