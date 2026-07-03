import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

/**
 * Relatório de Avaliações (NPS / CSAT)  réplica do REL_DEFS.avaliacoes do legado
 * (legacy/index.html ~4292). No legado os KPIs ("188 avaliações", "4,8 nota média",
 * "86% promotores", "4% detratores") e as linhas (Data/Cliente/Serviço/Profissional/
 * Nota/Comentário) eram 100% MOCK.
 *
 * ROBUSTEZ: NÃO existe tabela de avaliações de CLIENTE (NPS/CSAT) no backend atual.
 *   grep -rl "from('avaliacoes')" src  → nada.
 *   A única tabela com nome próximo é `avaliacoes_desempenho`, que é avaliação de
 *   DESEMPENHO de colaborador (RH /rh/desempenho)  conceito diferente; não tem
 *   nota de cliente, serviço nem comentário de pós-venda. Portanto NÃO consultamos
 *   essa tabela aqui.
 *
 * Estratégia: tentamos consultar a tabela `avaliacoes` de forma DEFENSIVA (try/catch +
 * checagem de error). Como a tabela não existe, o Supabase devolve erro → caímos no
 * estado "Relatório em preparação / sem fonte de dados ainda" (crm-note), mantendo a
 * estrutura (filtros, KPIs zerados, tabela vazia) visível. No dia em que a tabela
 * `avaliacoes` for criada com as colunas esperadas (nota, comentario, cliente_nome,
 * servico_nome, profissional_nome, criado_em, unidade_id), este relatório passa a
 * exibir os números reais automaticamente  sem mexer no código.
 */

// Linha esperada da (futura) tabela `avaliacoes`. Tudo opcional → tolerante a esquema.
type AvaliacaoRow = {
  id?: string | number
  nota?: number | string | null
  comentario?: string | null
  cliente_nome?: string | null
  servico_nome?: string | null
  profissional_nome?: string | null
  criado_em?: string | null
  unidade_id?: string | null
}

/** NPS clássico: nota >= 9 promotor, 7–8 neutro, <= 6 detrator (escala 0–10).
 *  Para a escala 1–5 (CSAT/estrelas) do legado, mapeamos 5 = promotor, 4 = neutro, <=3 = detrator. */
function classificaNps(notaRaw: unknown, escalaMax: number): 'promotor' | 'neutro' | 'detrator' {
  const n = Number(notaRaw)
  if (!Number.isFinite(n)) return 'neutro'
  if (escalaMax <= 5) {
    if (n >= 5) return 'promotor'
    if (n >= 4) return 'neutro'
    return 'detrator'
  }
  if (n >= 9) return 'promotor'
  if (n >= 7) return 'neutro'
  return 'detrator'
}

export default async function RelAvaliacoesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  const range = resolveRelRange(sp.periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Fonte real (defensiva): tabela `avaliacoes`. Não existe hoje → error → estado vazio. ──
  let semFonte = false
  let rows: AvaliacaoRow[] = []
  try {
    let q = sb
      .from('avaliacoes')
      .select('id, nota, comentario, cliente_nome, servico_nome, profissional_nome, criado_em, unidade_id')
      .order('criado_em', { ascending: false })
      .limit(500)
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniTs) q = q.gte('criado_em', iniTs)
    if (fimTs) q = q.lt('criado_em', fimTs)
    const { data, error } = await q
    if (error) semFonte = true
    else rows = (data ?? []) as AvaliacaoRow[]
  } catch {
    semFonte = true
  }

  // ── Métricas (só fazem sentido quando há fonte; com semFonte ficam zeradas) ──
  const total = rows.length
  const notas = rows.map((r) => Number(r.nota)).filter((n) => Number.isFinite(n))
  const escalaMax = notas.some((n) => n > 5) ? 10 : 5
  const notaMedia = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : 0

  let promotores = 0
  let neutros = 0
  let detratores = 0
  for (const r of rows) {
    const c = classificaNps(r.nota, escalaMax)
    if (c === 'promotor') promotores++
    else if (c === 'neutro') neutros++
    else detratores++
  }
  const pctPromotores = total > 0 ? (promotores / total) * 100 : 0
  const pctDetratores = total > 0 ? (detratores / total) * 100 : 0
  const nps = total > 0 ? pctPromotores - pctDetratores : 0

  const kpis: RelKpi[] = [
    { label: 'Avaliações', value: total.toLocaleString('pt-BR'), icon: 'ti-star' },
    {
      label: 'Nota média',
      value: notas.length ? notaMedia.toFixed(1).replace('.', ',') : '',
      icon: 'ti-star-filled',
    },
    {
      label: 'Promotores',
      value: total > 0 ? `${pctPromotores.toFixed(0)}%` : '',
      icon: 'ti-thumb-up',
      delta: total > 0 ? `${promotores.toLocaleString('pt-BR')} avaliação(ões)` : undefined,
      deltaTone: 'up',
    },
    {
      label: 'Detratores',
      value: total > 0 ? `${pctDetratores.toFixed(0)}%` : '',
      icon: 'ti-thumb-down',
      delta: total > 0 ? `${detratores.toLocaleString('pt-BR')} avaliação(ões)` : undefined,
      deltaTone: pctDetratores > 0 ? 'down' : 'flat',
    },
  ]

  // ── Distribuição de notas (1..escalaMax) para o gráfico ──
  const distribuicao = new Map<number, number>()
  for (const n of notas) distribuicao.set(n, (distribuicao.get(n) || 0) + 1)
  const barNotas: BarRow[] = Array.from({ length: escalaMax }, (_, i) => {
    const nota = escalaMax - i // do maior para o menor
    const c = distribuicao.get(nota) || 0
    return { label: `${nota}${escalaMax <= 5 ? '★' : ''}`, value: c, display: c.toLocaleString('pt-BR') }
  })

  const barNps: BarRow[] = [
    { label: 'Promotores', value: promotores, display: promotores.toLocaleString('pt-BR') },
    { label: 'Neutros', value: neutros, display: neutros.toLocaleString('pt-BR') },
    { label: 'Detratores', value: detratores, display: detratores.toLocaleString('pt-BR') },
  ]

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Avaliações (NPS / CSAT)</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      {semFonte && (
        <div
          className="crm-note"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}
        >
          <i className="ti ti-hourglass" style={{ fontSize: 20, color: 'var(--brand-600)', marginTop: 2 }} />
          <div>
            <b>Relatório em preparação  sem fonte de dados ainda.</b>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
              Ainda não existe no backend uma tabela de <b>avaliações de cliente</b> (NPS / CSAT pós-sessão).
              Quando a coleta de avaliações for ligada (pesquisa de satisfação após o atendimento, nota e
              comentário por cliente), este relatório passará a exibir automaticamente: número de avaliações,
              nota média, % de promotores e detratores (NPS), distribuição de notas e a lista de avaliações
              por cliente, serviço e profissional  filtrados por período e unidade.
            </div>
          </div>
        </div>
      )}

      <RelFiltros periodo={sp.periodo || 'mes'} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/avaliacoes" />

      <RelKpis kpis={kpis} />

      {/* Métrica NPS consolidada (metric-box). Sem fonte, mostra "". */}
      <div className="rel-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="metric-box">
          <span>NPS (Promotores − Detratores)</span>
          <b>{total > 0 ? `${nps >= 0 ? '+' : ''}${nps.toFixed(0)}` : ''}</b>
        </div>
        <div className="metric-box gold">
          <span>Neutros</span>
          <b>{total > 0 ? neutros.toLocaleString('pt-BR') : ''}</b>
        </div>
        <div className="metric-box purple">
          <span>Escala detectada</span>
          <b>{total > 0 ? (escalaMax <= 5 ? '1 a 5 (estrelas)' : '0 a 10 (NPS)') : ''}</b>
        </div>
      </div>

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Distribuição de notas" icon="ti-chart-bar" rows={barNotas} emptyMsg="Sem avaliações no período." />
        <BarChart title="Classificação NPS" icon="ti-chart-pie" rows={barNps} emptyMsg="Sem avaliações no período." />
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-message-star" /> Avaliações
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{total.toLocaleString('pt-BR')} no período</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th className="num-r">Nota</th>
                <th>Comentário</th>
              </tr>
            </thead>
            <tbody>
              {total === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    {semFonte
                      ? 'Sem fonte de dados  a coleta de avaliações de cliente ainda não está ativa.'
                      : 'Nenhuma avaliação no período selecionado.'}
                  </td>
                </tr>
              )}
              {rows.map((r, i) => {
                const cls = classificaNps(r.nota, escalaMax)
                const stCls = cls === 'promotor' ? 'os-fechada' : cls === 'detrator' ? 'os-cancelada' : 'os-aberta'
                const n = Number(r.nota)
                const notaTxt = Number.isFinite(n) ? (escalaMax <= 5 ? `★ ${n}` : `${n}`) : ''
                return (
                  <tr key={r.id ?? i}>
                    <td>{dataBR(r.criado_em)}</td>
                    <td>
                      <span className="cli-name">{r.cliente_nome || ''}</span>
                    </td>
                    <td>{r.servico_nome || ''}</td>
                    <td>{r.profissional_nome || ''}</td>
                    <td className="num-r">
                      <span className={`os-st ${stCls}`}>{notaTxt}</span>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)', maxWidth: 320 }}>{r.comentario || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crm-note" style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 14 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--brand-600)' }} />
        <span>
          O <b>NPS</b> (Net Promoter Score) é calculado como % de promotores menos % de detratores. Na escala 1–5
          (estrelas / CSAT), nota 5 conta como promotor, 4 como neutro e ≤ 3 como detrator; na escala 0–10, ≥ 9
          promotor, 7–8 neutro e ≤ 6 detrator. Os números são escopados pela unidade ativa e pelo período
          selecionado assim que a fonte de dados de avaliações de cliente estiver disponível.
        </span>
      </div>
    </div>
  )
}
