import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de pull: paginamos para nunca estourar 1000 linhas (limite padrão do PostgREST)
// silenciosamente. Leads de franquia são poucos por unidade/período.
const PULL_CAP = 8000
const PAGE = 1000

// Cores das linhas de oferta  espelha o legado EXP_TIPOS (legacy/index.html ~8537):
// Ultracell/Quanta são as máquinas da rede; Franquia é a modalidade de franqueamento.
const TIPO_COR: Record<string, string> = {
  Ultracell: '#2f44a0',
  Quanta: '#0d9488',
  Franquia: '#b7791f',
  'Ultracell Pro': '#3f5bd6',
  'Quanta Light': '#06b6d4',
}
const COR_FALLBACK = '#64748b'
const corDe = (tipo: string) => TIPO_COR[tipo] ?? COR_FALLBACK

type LeadRow = {
  tipo_lead: string | null
  valor_estimado: number | null
  status: string | null
  etapa_id: string | null
  temperatura: string | null
}

type EtapaRow = { id: string; nome: string | null }

// Builder estrutural mínimo (encadeável + paginável) p/ tipar sem `any`.
type SbQuery = {
  select: (cols: string) => SbQuery
  eq: (c: string, v: unknown) => SbQuery
  gte: (c: string, v: unknown) => SbQuery
  lt: (c: string, v: unknown) => SbQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: unknown }>
}

/** Pagina leads de franquia escopados por unidade/período (só os campos do agrupamento). Trata erro → vazio. */
async function pullLeads(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null,
  iniTs: string | null,
  fimTs: string | null,
): Promise<{ rows: LeadRow[]; capped: boolean; erro: boolean }> {
  const out: LeadRow[] = []
  let from = 0
  let capped = false
  for (;;) {
    let q = sb
      .from('crm_leads')
      .select('tipo_lead, valor_estimado, status, etapa_id, temperatura')
      .eq('pipeline', 'franquia') as unknown as SbQuery
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniTs) q = q.gte('criado_em', iniTs)
    if (fimTs) q = q.lt('criado_em', fimTs)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) return { rows: [], capped: false, erro: true }
    const batch = (data ?? []) as LeadRow[]
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

export default async function ExpansaoTiposPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  const range = resolveRelRange(sp.periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // Etapas do funil de FRANQUIA (pipeline='franquia' separa do CRM de clientes  migration 050).
  // Se a coluna pipeline não existir (migration não aplicada), a query falha → estado sem fonte.
  const { data: etapasRaw, error: etapasErr } = await sb
    .from('crm_etapas')
    .select('id, nome')
    .eq('ativo', true)
    .eq('pipeline', 'franquia')

  const { rows, capped, erro } = await pullLeads(sb, unidadeId, iniTs, fimTs)

  // Estado robusto: se qualquer query falhou (RLS/coluna/tabela), renderiza vazio sem quebrar.
  const semFonte = !!etapasErr || erro
  const etapas = (etapasErr ? [] : (etapasRaw ?? [])) as EtapaRow[]

  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome ?? '']))
  const nomeDe = (id: string | null) => (id ? nomeEtapa.get(id) ?? '' : '')
  const ehGanho = (l: LeadRow) =>
    nomeDe(l.etapa_id) === 'Convertido' ||
    nomeDe(l.etapa_id) === 'Fechado' ||
    l.status === 'convertido' ||
    l.status === 'ganho'
  const ehPerdido = (l: LeadRow) => nomeDe(l.etapa_id) === 'Perdido' || l.status === 'perdido'

  // ── Agregação por Tipo de Lead (linha de oferta) ──
  type Agg = { tipo: string; total: number; ganhos: number; perdidos: number; quentes: number; valor: number }
  const porTipo = new Map<string, Agg>()
  for (const l of rows) {
    const k = (l.tipo_lead || '').trim() || 'Sem tipo'
    let a = porTipo.get(k)
    if (!a) {
      a = { tipo: k, total: 0, ganhos: 0, perdidos: 0, quentes: 0, valor: 0 }
      porTipo.set(k, a)
    }
    a.total += 1
    a.valor += l.valor_estimado || 0
    if (ehGanho(l)) a.ganhos += 1
    else if (ehPerdido(l)) a.perdidos += 1
    if (l.temperatura === 'quente' || l.temperatura === 'ardente') a.quentes += 1
  }
  const linhasTipo = [...porTipo.values()].sort((a, b) => b.total - a.total)

  // ── KPIs ──
  const total = rows.length
  const valorTotal = rows.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  const tiposDistintos = linhasTipo.length
  const tipoTop = linhasTipo[0]

  const kpis: RelKpi[] = [
    {
      label: 'Tipos de lead',
      value: tiposDistintos.toLocaleString('pt-BR'),
      icon: 'ti-tag',
      delta: 'linhas de oferta em uso',
      deltaTone: 'flat',
    },
    {
      label: 'Leads classificados',
      value: total.toLocaleString('pt-BR') + (capped ? '+' : ''),
      icon: 'ti-list-check',
      delta: `${range.label}`,
      deltaTone: 'flat',
    },
    {
      label: 'Linha mais ativa',
      value: tipoTop ? tipoTop.tipo : '',
      icon: 'ti-trophy',
      delta: tipoTop ? `${tipoTop.total.toLocaleString('pt-BR')} lead(s)` : 'sem leads',
      deltaTone: tipoTop ? 'up' : 'flat',
    },
    {
      label: 'Valor estimado',
      value: moedaBR(valorTotal),
      icon: 'ti-businessplan',
      delta: 'somatório do período',
      deltaTone: 'flat',
    },
  ]

  const barTipo: BarRow[] = linhasTipo
    .slice(0, 10)
    .map((t) => ({ label: t.tipo, value: t.total, display: t.total.toLocaleString('pt-BR') }))

  const csvRows = linhasTipo.map((t) => [
    t.tipo,
    t.total,
    total > 0 ? `${((t.total / total) * 100).toFixed(1)}%` : '0,0%',
    t.ganhos,
    t.perdidos,
    t.quentes,
    Math.round(t.valor),
  ])

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7ECFA', color: '#2f44a0' }}>
          <i className="ti ti-tag" />
        </div>
        <div>
          <h2>Expansão · Tipo de Lead</h2>
          <p>
            Distribuição dos candidatos a franqueado por <b>linha de oferta</b>  Ultracell e Quanta são as máquinas da rede;{' '}
            <b>Franquia</b> é a modalidade de franqueamento. Cada tipo segmenta o funil e os gráficos de Expansão.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div
        className="rel-card"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <RelFiltros periodo={sp.periodo || 'mes'} di={sp.di || ''} df={sp.df || ''} basePath="/expansao/tipos" />
        <ExportCsvButton
          filename={`expansao-tipos-${sp.periodo || 'mes'}`}
          headers={['Tipo de Lead', 'Leads', '% do total', 'Ganhos', 'Perdidos', 'Quentes/ardentes', 'Valor estimado']}
          rows={csvRows}
        />
      </div>

      {semFonte ? (
        <div className="rel-card" style={{ padding: '22px 18px' }}>
          <div className="crm-note" style={{ marginBottom: 0 }}>
            <i className="ti ti-database-off" /> Relatório em preparação  sem fonte de dados de tipos de lead de Expansão
            disponível no momento (pipeline de franquia indisponível para o seu perfil/unidade ou migration ainda não
            aplicada).
          </div>
        </div>
      ) : (
        <>
          {capped && (
            <div
              className="rel-card"
              style={{
                background: 'var(--gold-soft)',
                borderColor: 'var(--gold-400)',
                fontSize: 12.5,
                color: 'var(--text-2)',
                padding: '10px 14px',
              }}
            >
              <i className="ti ti-alert-triangle" /> Período/unidade muito amplos: agregando os primeiros{' '}
              {PULL_CAP.toLocaleString('pt-BR')} leads. Refine o período para totais exatos.
            </div>
          )}

          <RelKpis kpis={kpis} />

          <div className="crm-note">
            <i className="ti ti-tag" /> O <b>Tipo de Lead</b> é a linha de oferta de cada candidato (campo{' '}
            <code>tipo_lead</code> do funil de franquia). Esta visão é somente leitura  para editar tipos por lead, use{' '}
            <b>Expansão · Leads</b>.
          </div>

          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <BarChart title="Leads por tipo de lead" icon="ti-tag" rows={barTipo} emptyMsg="Sem leads no período." />
          </div>

          <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
              <span>
                <i className="ti ti-table" /> Tipos de lead
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {tiposDistintos.toLocaleString('pt-BR')} tipo(s) · {total.toLocaleString('pt-BR')} lead(s)
              </span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Tipo de Lead</th>
                    <th className="num-r">Leads</th>
                    <th className="num-r">% do total</th>
                    <th className="num-r">Ganhos</th>
                    <th className="num-r">Perdidos</th>
                    <th className="num-r">Quentes/ardentes</th>
                    <th className="num-r">Valor estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasTipo.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead de franquia no período selecionado.
                      </td>
                    </tr>
                  )}
                  {linhasTipo.map((t) => (
                    <tr key={t.tipo}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 4,
                              background: corDe(t.tipo),
                              display: 'inline-block',
                              flexShrink: 0,
                            }}
                          />
                          <span className="cli-name">{t.tipo}</span>
                        </span>
                      </td>
                      <td className="num-r" style={{ fontWeight: 600 }}>
                        {t.total.toLocaleString('pt-BR')}
                      </td>
                      <td className="num-r">{total > 0 ? ((t.total / total) * 100).toFixed(1) : '0,0'}%</td>
                      <td className="num-r">{t.ganhos.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{t.perdidos.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{t.quentes.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 600 }}>
                        {t.valor > 0 ? moedaBR(t.valor) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TODO(legado: expTipos ~8640): catálogo editável de tipos (cor própria + CRUD) quando houver
          tabela dedicada de tipos de lead no backend; hoje a fonte é o campo tipo_lead de crm_leads. */}
    </div>
  )
}
