import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de segurança ao paginar (a base de agendamentos tem ~136k linhas, mas SEMPRE
// escopamos por concluido_em (período) e/ou unidade — a janela é bem menor). Ainda assim
// limitamos o pull para não explodir em períodos amplos.
const SUM_CAP = 20000
const PAGE = 1000

// Réplica mínima das colunas confirmadas em src/app/(app)/agenda/page.tsx:
//   agendamentos: id, inicio, fim, status, servico_id, profissional_id, unidade_id, concluido_em
//   FK profissional_id → perfis_usuario (embed desambiguado pelo nome do FK).
//   FK servico_id → servicos(nome, duracao_min).
type ServicoEmbed = { nome: string | null; duracao_min: number | null } | null
type ProfEmbed = { nome_completo: string | null } | null
type AgRow = {
  id: string
  inicio: string | null
  concluido_em: string | null
  servico_id: string | null
  profissional_id: string | null
  servico: ServicoEmbed | ServicoEmbed[]
  profissional: ProfEmbed | ProfEmbed[]
}

// Interface estrutural mínima do builder encadeável (eq/gte/lt/not + range thenable).
type SbQuery = {
  select: (cols: string) => SbQuery
  eq: (c: string, v: unknown) => SbQuery
  gte: (c: string, v: unknown) => SbQuery
  lt: (c: string, v: unknown) => SbQuery
  not: (c: string, op: string, v: unknown) => SbQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: unknown }>
}

/** Supabase pode devolver embeds como objeto ou array de 1 — normaliza p/ objeto. */
function um<T>(v: T | T[] | null): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/**
 * Pagina (range) os atendimentos CONCLUÍDOS (concluido_em not null) do período,
 * escopados por unidade quando houver. Devolve linhas mínimas + flag de truncamento.
 * Sempre trata erro de query → estado vazio (nunca quebra em runtime).
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
      .select(
        'id, inicio, concluido_em, servico_id, profissional_id, servico:servicos(nome, duracao_min), profissional:perfis_usuario!agendamentos_profissional_id_fkey(nome_completo)',
      )
      .not('concluido_em', 'is', null) as unknown as SbQuery
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniTs) q = q.gte('concluido_em', iniTs)
    if (fimTs) q = q.lt('concluido_em', fimTs)
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

type Agrupado = { chave: string; nome: string; count: number; duracaoTotal: number }

/** Agrupa atendimentos por uma chave (serviço/profissional), somando duração estimada. */
function agrupar(rows: AgRow[], modo: 'servico' | 'profissional'): Agrupado[] {
  const map = new Map<string, Agrupado>()
  for (const r of rows) {
    const serv = um(r.servico)
    const prof = um(r.profissional)
    const dur = serv?.duracao_min ?? 0
    let chave: string
    let nome: string
    if (modo === 'servico') {
      chave = r.servico_id ?? '__sem__'
      nome = serv?.nome?.trim() || 'Sem serviço'
    } else {
      chave = r.profissional_id ?? '__sem__'
      nome = prof?.nome_completo?.trim() || 'Sem profissional'
    }
    const cur = map.get(chave) ?? { chave, nome, count: 0, duracaoTotal: 0 }
    cur.count += 1
    cur.duracaoTotal += dur
    map.set(chave, cur)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

function minutosLabel(min: number): string {
  if (min <= 0) return '—'
  return `${Math.round(min)} min`
}

export default async function RelAtendimentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Atendimentos concluídos são históricos (data importada do BEMP vai até ~2025) →
  // default '90d' como no relatório de faturamento, para o relatório não nascer vazio.
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  const { rows, capped, erro } = await pullAtendimentos(sb, unidadeId, iniTs, fimTs)

  // ── Agregações em memória ──
  const total = rows.length
  const porServico = agrupar(rows, 'servico')
  const porProfissional = agrupar(rows, 'profissional')

  // Profissionais ativos = distintos com profissional_id preenchido (ignora "Sem profissional").
  const profsAtivos = porProfissional.filter((p) => p.chave !== '__sem__').length
  const servicosDistintos = porServico.filter((s) => s.chave !== '__sem__').length

  // Duração média estimada a partir de servicos.duracao_min (só conta linhas com duração > 0).
  const totalDuracao = porServico.reduce((a, s) => a + s.duracaoTotal, 0)
  const comDuracao = rows.reduce((a, r) => {
    const serv = um(r.servico)
    return a + ((serv?.duracao_min ?? 0) > 0 ? 1 : 0)
  }, 0)
  const duracaoMedia = comDuracao > 0 ? totalDuracao / comDuracao : 0

  const barServicos: BarRow[] = porServico
    .slice(0, 10)
    .map((s) => ({ label: s.nome, value: s.count, display: s.count.toLocaleString('pt-BR') }))
  const barProfs: BarRow[] = porProfissional
    .slice(0, 10)
    .map((p) => ({ label: p.nome, value: p.count, display: p.count.toLocaleString('pt-BR') }))

  const kpis: RelKpi[] = [
    { label: 'Atendimentos concluídos', value: total.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-user-check' },
    { label: 'Serviços distintos', value: servicosDistintos.toLocaleString('pt-BR'), icon: 'ti-list-details' },
    { label: 'Profissionais ativos', value: profsAtivos.toLocaleString('pt-BR'), icon: 'ti-users' },
    { label: 'Duração média', value: minutosLabel(duracaoMedia), icon: 'ti-clock' },
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
            <BarChart title="Top serviços (atendimentos)" icon="ti-list-details" rows={barServicos} emptyMsg="Sem atendimentos no período." />
            <BarChart title="Por profissional" icon="ti-users" rows={barProfs} emptyMsg="Sem atendimentos no período." />
          </div>

          <div className="rel-card">
            <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
              <span>
                <i className="ti ti-table" /> Atendimentos por serviço
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{total.toLocaleString('pt-BR')} no período</span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th className="num-r">Atendimentos</th>
                    <th className="num-r">% do total</th>
                    <th className="num-r">Duração total (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {porServico.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum atendimento concluído no período selecionado.
                      </td>
                    </tr>
                  )}
                  {porServico.map((s) => (
                    <tr key={s.chave}>
                      <td>{s.chave === '__sem__' ? <em>Sem serviço vinculado</em> : s.nome}</td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{s.count.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{total > 0 ? ((s.count / total) * 100).toFixed(1) : '0,0'}%</td>
                      <td className="num-r">{minutosLabel(s.duracaoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                {porServico.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--line)' }}>
                      <td style={{ fontWeight: 800 }}>Total</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{total.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>100%</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{minutosLabel(totalDuracao)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="rel-card">
            <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
              <span>
                <i className="ti ti-user-cog" /> Atendimentos por profissional
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{porProfissional.length} registro(s)</span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Profissional</th>
                    <th className="num-r">Atendimentos</th>
                    <th className="num-r">% do total</th>
                    <th className="num-r">Duração total (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {porProfissional.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum atendimento concluído no período selecionado.
                      </td>
                    </tr>
                  )}
                  {porProfissional.map((p) => (
                    <tr key={p.chave}>
                      <td>{p.chave === '__sem__' ? <em>Sem profissional vinculado</em> : p.nome}</td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{p.count.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{total > 0 ? ((p.count / total) * 100).toFixed(1) : '0,0'}%</td>
                      <td className="num-r">{minutosLabel(p.duracaoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crm-note" style={{ marginTop: 4 }}>
            <i className="ti ti-info-circle" /> Atendimentos = agendamentos com <code>concluido_em</code> preenchido. A duração é estimada
            a partir de <code>servicos.duracao_min</code>. Na base importada (BEMP) muitos registros têm <code>profissional_id</code> vazio
            e aparecem como &quot;Sem profissional vinculado&quot;.
            {/* TODO(legado: atendimentos): ticket médio por atendimento depende de valor/forma de pagamento
                ligados ao agendamento; quando a fonte (pagamentos × agendamento) existir, somar receita. */}
          </div>
        </>
      )}
    </div>
  )
}
