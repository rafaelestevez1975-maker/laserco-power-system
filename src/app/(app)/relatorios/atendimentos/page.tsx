import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'
import { rotuloMes } from '@/components/dashboards/agg'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de segurança ao paginar (a base de agendamentos tem ~136k linhas, mas SEMPRE
// escopamos por inicio (período) e/ou unidade  a janela é bem menor). Ainda assim
// limitamos o pull para não explodir em períodos amplos.
const SUM_CAP = 20000
const PAGE = 1000

// Atendimento concluído = agendamento com status='concluido'. A coluna concluido_em veio
// 100% vazia do import BEMP (por isso o filtro antigo deixava a tela sempre em branco), mas o
// STATUS marca corretamente. Dimensões REAIS disponíveis nesses registros: inicio, fim (→ duração
// real), unidade_id (+ nome). O import NÃO trouxe servico_id/profissional_id/cliente_id (todos
// nulos), então o relatório analisa o que existe de verdade: volume por mês e por unidade.
type UnidadeEmbed = { nome: string | null } | null
type AgRow = {
  id: string
  inicio: string | null
  fim: string | null
  unidade_id: string | null
  unidade: UnidadeEmbed | UnidadeEmbed[]
}

// Interface estrutural mínima do builder encadeável (eq/gte/lt + range thenable).
type SbQuery = {
  select: (cols: string) => SbQuery
  eq: (c: string, v: unknown) => SbQuery
  gte: (c: string, v: unknown) => SbQuery
  lt: (c: string, v: unknown) => SbQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: unknown }>
}

/** Supabase pode devolver embeds como objeto ou array de 1  normaliza p/ objeto. */
function um<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/** Duração em minutos entre inicio e fim; ignora valores inválidos/absurdos (> 8h). */
function duracaoMin(inicio: string | null, fim: string | null): number {
  if (!inicio || !fim) return 0
  const a = Date.parse(inicio)
  const b = Date.parse(fim)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  const min = (b - a) / 60000
  return min > 0 && min <= 480 ? min : 0
}

/**
 * Pagina (range) os atendimentos CONCLUÍDOS (status='concluido') do período, escopados por
 * unidade quando houver; período filtrado por `inicio` (sempre preenchido). Devolve linhas
 * mínimas + flag de truncamento. Sempre trata erro de query → estado vazio (nunca quebra).
 */
async function pullAtendimentos(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null,
  iniTs: string | null,
  fimTs: string | null,
): Promise<{ rows: AgRow[]; capped: boolean; erro: boolean }> {
  const out: AgRow[] = []
  let from = 0
  let capped = false
  for (;;) {
    let q = sb
      .from('agendamentos')
      .select('id, inicio, fim, unidade_id, unidade:unidades(nome)')
      .eq('status', 'concluido') as unknown as SbQuery
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniTs) q = q.gte('inicio', iniTs)
    if (fimTs) q = q.lt('inicio', fimTs)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) return { rows: out, capped, erro: true }
    const batch = (data ?? []) as AgRow[]
    out.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
    if (out.length >= SUM_CAP) {
      capped = true
      break
    }
  }
  return { rows: out, capped, erro: false }
}

type PorUnidade = { chave: string; nome: string; count: number; duracaoTotal: number }

function minutosLabel(min: number): string {
  if (min <= 0) return '—'
  return `${Math.round(min)} min`
}

function horasLabel(min: number): string {
  if (min <= 0) return '—'
  return `${Math.round(min / 60).toLocaleString('pt-BR')} h`
}

export default async function RelAtendimentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Default '90d' (a base de atendimentos concluídos concentra-se em torno do mês corrente),
  // para o relatório não nascer vazio.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  const { rows, capped, erro } = await pullAtendimentos(sb, unidadeId, iniTs, fimTs)

  // ── Agregações em memória ──
  const total = rows.length
  const porUnidade = new Map<string, PorUnidade>()
  const porMes = new Map<string, number>()
  let duracaoTotal = 0
  let comDuracao = 0

  for (const r of rows) {
    const dur = duracaoMin(r.inicio, r.fim)
    if (dur > 0) {
      duracaoTotal += dur
      comDuracao += 1
    }
    const chave = r.unidade_id ?? '__sem__'
    const nome = um(r.unidade)?.nome?.trim() || 'Sem unidade'
    const cur = porUnidade.get(chave) ?? { chave, nome, count: 0, duracaoTotal: 0 }
    cur.count += 1
    cur.duracaoTotal += dur
    porUnidade.set(chave, cur)

    const ym = (r.inicio || '').slice(0, 7) // YYYY-MM
    if (ym) porMes.set(ym, (porMes.get(ym) || 0) + 1)
  }

  const unidades = [...porUnidade.values()].sort((a, b) => b.count - a.count)
  const unidadesAtivas = unidades.filter((u) => u.chave !== '__sem__').length
  const duracaoMedia = comDuracao > 0 ? duracaoTotal / comDuracao : 0

  const meses = [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const barMeses: BarRow[] = meses.map(([ym, c]) => ({ label: rotuloMes(ym), value: c, display: c.toLocaleString('pt-BR') }))
  const barUnidades: BarRow[] = unidades
    .slice(0, 10)
    .map((u) => ({ label: u.nome, value: u.count, display: u.count.toLocaleString('pt-BR') }))

  const kpis: RelKpi[] = [
    { label: 'Atendimentos concluídos', value: total.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-user-check' },
    { label: 'Unidades atendendo', value: unidadesAtivas.toLocaleString('pt-BR'), icon: 'ti-building-store' },
    { label: 'Duração média', value: minutosLabel(duracaoMedia), icon: 'ti-clock' },
    { label: 'Tempo total em atendimento', value: horasLabel(duracaoTotal), icon: 'ti-hourglass' },
  ]

  return (
    <div className="view active">
      <RelTabs active="atendimentos" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Atendimentos</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/atendimentos" />

      {erro ? (
        <div className="crm-note" style={{ marginTop: 12 }}>
          <i className="ti ti-database-off" /> Relatório em preparação: não foi possível ler a fonte de atendimentos no momento.
          Tente novamente ou refine o período.
        </div>
      ) : (
        <>
          {capped && (
            <div
              className="rel-card"
              style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}
            >
              <i className="ti ti-alert-triangle" /> Período muito amplo: usando os primeiros {SUM_CAP.toLocaleString('pt-BR')} atendimentos
              concluídos. Refine o período ou filtre por unidade para totais exatos.
            </div>
          )}

          <RelKpis kpis={kpis} />

          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <BarChart title="Atendimentos por mês" icon="ti-calendar-stats" rows={barMeses} emptyMsg="Sem atendimentos no período." />
            <BarChart title="Atendimentos por unidade (top 10)" icon="ti-building-store" rows={barUnidades} emptyMsg="Sem atendimentos no período." />
          </div>

          <div className="rel-card">
            <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
              <span>
                <i className="ti ti-table" /> Atendimentos por unidade
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{total.toLocaleString('pt-BR')} no período</span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Unidade</th>
                    <th className="num-r">Atendimentos</th>
                    <th className="num-r">% do total</th>
                    <th className="num-r">Duração média</th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum atendimento concluído no período selecionado.
                      </td>
                    </tr>
                  )}
                  {unidades.map((u) => (
                    <tr key={u.chave}>
                      <td>{u.chave === '__sem__' ? <em>Sem unidade vinculada</em> : u.nome}</td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{u.count.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{total > 0 ? ((u.count / total) * 100).toFixed(1) : '0,0'}%</td>
                      <td className="num-r">{minutosLabel(u.count > 0 ? u.duracaoTotal / u.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
                {unidades.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--line)' }}>
                      <td style={{ fontWeight: 800 }}>Total</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{total.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{minutosLabel(duracaoMedia)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="crm-note" style={{ marginTop: 4 }}>
            <i className="ti ti-info-circle" /> Atendimentos = agendamentos com <code>status</code> concluído, filtrados pela data de
            atendimento (<code>inicio</code>). A duração é real (<code>fim − inicio</code>). A base importada do BEMP não trouxe o serviço
            nem o profissional de cada atendimento, por isso a análise é por unidade e período; o detalhamento por serviço/profissional
            passa a existir conforme novos atendimentos forem registrados pelo sistema.
          </div>
        </>
      )}
    </div>
  )
}
