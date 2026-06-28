import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de segurança ao puxar linhas (SEMPRE escopamos por período/unidade no servidor,
// então a janela é pequena; ainda assim limitamos o pull para não estourar memória).
const PULL_CAP = 5000

// Linha de pacote vendido (item de OS) já com os embeds resolvidos.
// Fonte: os_pacotes (item de venda) → os (data/unidade/status) → pacotes (nome).
// Colunas confirmadas em src/app/(app)/os/actions.ts e src/app/(app)/pacotes/page.tsx.
type OsPacoteRow = {
  quantidade: number | null
  preco: number | null
  desconto: number | null
  total: number | null
  os: { criado_em: string | null; unidade_id: string | null; status: string | null } | { criado_em: string | null; unidade_id: string | null; status: string | null }[] | null
  pacote: { nome: string | null } | { nome: string | null }[] | null
}

/** Normaliza embed do Supabase (vem como objeto ou array de 1). */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function RelPacotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Vendas de pacote são históricas (importadas do legado) → 90d cobre melhor que 'mes'.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Pull dos pacotes vendidos (os_pacotes) escopados por período + unidade via OS ──
  // os!inner garante que só vêm itens com OS existente; filtramos nas colunas da OS.
  let query = sb
    .from('os_pacotes')
    .select('quantidade, preco, desconto, total, os:os!inner(criado_em, unidade_id, status), pacote:pacotes(nome)')
    .order('criado_em', { ascending: false, referencedTable: 'os' })
    .limit(PULL_CAP)
  if (unidadeId) query = query.eq('os.unidade_id', unidadeId)
  if (iniTs) query = query.gte('os.criado_em', iniTs)
  if (fimTs) query = query.lt('os.criado_em', fimTs)

  const { data, error } = await query
  const rows = (error ? [] : ((data ?? []) as OsPacoteRow[]))

  // ── Agrega em memória (janela escopada, no máx. PULL_CAP linhas) ──
  let receita = 0
  let descontos = 0
  let unidades = 0 // qtd de pacotes vendidos (soma das quantidades)
  const itens = rows.length // nº de linhas (itens de venda)
  let canceladas = 0

  // por pacote (nome) → { receita, qtd }
  const porPacote = new Map<string, { receita: number; qtd: number }>()
  // por mês (YYYY-MM) → receita
  const porMes = new Map<string, number>()

  for (const r of rows) {
    const os = one(r.os)
    const pac = one(r.pacote)
    const valor = Number(r.total) || 0
    const desc = Number(r.desconto) || 0
    const qtd = Number(r.quantidade) || 0
    const isCancelada = (os?.status || '').toLowerCase() === 'cancelada'

    if (isCancelada) {
      canceladas += 1
      continue // não conta nas métricas de receita
    }

    receita += valor
    descontos += desc
    unidades += qtd

    const nome = pac?.nome || '(pacote removido)'
    const acc = porPacote.get(nome) || { receita: 0, qtd: 0 }
    acc.receita += valor
    acc.qtd += qtd
    porPacote.set(nome, acc)

    const ym = (os?.criado_em || '').slice(0, 7) // YYYY-MM
    if (ym) porMes.set(ym, (porMes.get(ym) || 0) + valor)
  }

  const vendidos = itens - canceladas
  const ticketMedio = vendidos > 0 ? receita / vendidos : 0
  const capped = rows.length >= PULL_CAP

  // Ranking de pacotes por receita.
  const linhasPacote = [...porPacote.entries()]
    .map(([nome, v]) => ({ nome, receita: v.receita, qtd: v.qtd }))
    .sort((a, b) => b.receita - a.receita)

  const barTopPacotes: BarRow[] = linhasPacote
    .slice(0, 10)
    .map((p) => ({ label: p.nome, value: p.receita, display: moedaBR(p.receita) }))

  const barMeses: BarRow[] = [...porMes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, v]) => ({ label: ym, value: v, display: moedaBR(v) }))

  const kpis: RelKpi[] = [
    { label: 'Receita de pacotes', value: moedaBR(receita), icon: 'ti-cash' },
    { label: 'Pacotes vendidos', value: unidades.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-package' },
    { label: 'Ticket médio', value: moedaBR(ticketMedio), icon: 'ti-receipt-2' },
    { label: 'Descontos concedidos', value: moedaBR(descontos), icon: 'ti-discount-2' },
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
          <i className="ti ti-alert-triangle" /> Período muito amplo: somando os primeiros {PULL_CAP.toLocaleString('pt-BR')} itens. Refine o período ou filtre por unidade para totais exatos.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Top pacotes por receita" icon="ti-package" rows={barTopPacotes} gold asMoeda emptyMsg="Nenhum pacote vendido no período." />
        <BarChart title="Receita por mês" icon="ti-calendar-dollar" rows={barMeses} gold asMoeda emptyMsg="Sem receita de pacotes no período." />
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Pacotes vendidos no período
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{linhasPacote.length} pacote(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Pacote</th>
                <th className="num-r">Qtd. vendida</th>
                <th className="num-r">Receita</th>
                <th className="num-r">% da receita</th>
              </tr>
            </thead>
            <tbody>
              {linhasPacote.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum pacote vendido no período selecionado.
                  </td>
                </tr>
              )}
              {linhasPacote.map((p) => (
                <tr key={p.nome}>
                  <td>{p.nome}</td>
                  <td className="num-r">{p.qtd.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(p.receita)}</td>
                  <td className="num-r">{receita > 0 ? ((p.receita / receita) * 100).toFixed(1) : '0,0'}%</td>
                </tr>
              ))}
            </tbody>
            {linhasPacote.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ fontWeight: 800 }}>Total</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{unidades.toLocaleString('pt-BR')}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(receita)}</td>
                  <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="crm-note" style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-3)' }}>
        <i className="ti ti-info-circle" /> Vendas de pacotes contam itens de ordens de serviço (<code>os_pacotes</code>),
        escopadas pela data de abertura da OS e pela unidade ativa.
        {canceladas > 0 && <> {canceladas.toLocaleString('pt-BR')} item(ns) de OS cancelada foram desconsiderados.</>}
      </div>
    </div>
  )
}
