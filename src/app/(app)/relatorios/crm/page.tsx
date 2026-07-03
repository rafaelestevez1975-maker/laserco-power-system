import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de pull: leads são poucos por unidade/período, mas escopamos por pipeline='cliente'
// (separa CRM de clientes do funil de Expansão  migration 050) + unidade ativa + período.
const PULL_CAP = 8000
const PAGE = 1000
const LISTA_MAX = 300

// Rótulos amigáveis das origens do CHECK do banco (migration 015/050, ver crm/actions.ts).
const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Manual',
  formulario: 'Formulário',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  indicacao: 'Indicação',
  google: 'Google',
  outros: 'Outros',
  geolocalizado: 'Geolocalizado',
  site: 'Site',
}

const TEMP_LABEL: Record<string, string> = {
  gelado: 'Gelado',
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente',
  ardente: 'Ardente',
}

type LeadRow = {
  id: string
  nome: string | null
  origem: string | null
  servico_interesse: string | null
  valor_estimado: number | null
  etapa_id: string | null
  status: string | null
  temperatura: string | null
  criado_em: string | null
}

type EtapaRow = { id: string; nome: string | null; ordem: number | null }

// Builder estrutural mínimo (encadeável + paginável) p/ tipar sem `any`.
type SbQuery = {
  select: (cols: string) => SbQuery
  eq: (c: string, v: unknown) => SbQuery
  gte: (c: string, v: unknown) => SbQuery
  lt: (c: string, v: unknown) => SbQuery
  order: (c: string, o: { ascending: boolean }) => SbQuery
  range: (a: number, b: number) => Promise<{ data: unknown[] | null; error: unknown }>
}

/** Pagina leads do funil de cliente, escopados por unidade/período. Trata erro → vazio. */
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
      .select('id, nome, origem, servico_interesse, valor_estimado, etapa_id, status, temperatura, criado_em')
      .eq('pipeline', 'cliente') as unknown as SbQuery
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniTs) q = q.gte('criado_em', iniTs)
    if (fimTs) q = q.lt('criado_em', fimTs)
    const { data, error } = await q.order('criado_em', { ascending: false }).range(from, from + PAGE - 1)
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

export default async function RelCrmPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  const range = resolveRelRange(sp.periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // Etapas do funil de cliente (para nomear/ordenar; pipeline='cliente' separa do funil de Expansão).
  const { data: etapasRaw, error: etapasErr } = await sb
    .from('crm_etapas')
    .select('id, nome, ordem')
    .eq('ativo', true)
    .eq('pipeline', 'cliente')
    .order('ordem', { ascending: true })
  const etapas = (etapasErr ? [] : (etapasRaw ?? [])) as EtapaRow[]

  const { rows, capped, erro } = await pullLeads(sb, unidadeId, iniTs, fimTs)

  // Estado robusto: se a query falhou (RLS/coluna/tabela), renderiza vazio sem quebrar.
  const semFonte = erro

  // ── Nome da etapa por id; etapas "terminais" do funil padrão Laser&Co ──
  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome ?? '']))
  const nomeDe = (id: string | null) => (id ? nomeEtapa.get(id) ?? '' : '')
  const ehGanho = (l: LeadRow) => nomeDe(l.etapa_id) === 'Convertido' || l.status === 'convertido' || l.status === 'ganho'
  const ehPerdido = (l: LeadRow) => nomeDe(l.etapa_id) === 'Perdido' || l.status === 'perdido'

  const total = rows.length
  const ganhos = rows.filter(ehGanho)
  const perdidos = rows.filter(ehPerdido)
  const ativos = rows.filter((l) => !ehGanho(l) && !ehPerdido(l))

  const qtdGanho = ganhos.length
  const qtdPerdido = perdidos.length
  const qtdAtivos = ativos.length
  const valorNeg = ativos.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  const valorGanho = ganhos.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  // Conversão = ganhos / (ganhos + perdidos)  fechados; espelha o KPI do board (/crm).
  const conv = qtdGanho + qtdPerdido > 0 ? (qtdGanho / (qtdGanho + qtdPerdido)) * 100 : 0

  // ── Distribuição por etapa (na ordem do funil) ──
  const porEtapa = new Map<string, number>()
  for (const l of rows) porEtapa.set(l.etapa_id ?? '', (porEtapa.get(l.etapa_id ?? '') || 0) + 1)
  const linhasEtapa = etapas.map((e) => ({ id: e.id, nome: e.nome ?? '', count: porEtapa.get(e.id) || 0 }))
  const semEtapa = porEtapa.get('') || 0

  // ── Distribuição por origem ──
  const porOrigem = new Map<string, number>()
  for (const l of rows) {
    const k = l.origem || 'outros'
    porOrigem.set(k, (porOrigem.get(k) || 0) + 1)
  }
  const linhasOrigem = [...porOrigem.entries()]
    .map(([k, v]) => ({ origem: ORIGEM_LABEL[k] ?? k, count: v }))
    .sort((a, b) => b.count - a.count)

  const barEtapa: BarRow[] = linhasEtapa.map((e) => ({ label: e.nome, value: e.count, display: e.count.toLocaleString('pt-BR') }))
  const barOrigem: BarRow[] = linhasOrigem.slice(0, 10).map((o) => ({ label: o.origem, value: o.count, display: o.count.toLocaleString('pt-BR') }))

  const kpis: RelKpi[] = [
    { label: 'Leads no período', value: total.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-affiliate' },
    { label: 'Em negociação', value: qtdAtivos.toLocaleString('pt-BR'), icon: 'ti-progress', delta: moedaBR(valorNeg) + ' em pipeline', deltaTone: 'flat' },
    { label: 'Convertidos', value: qtdGanho.toLocaleString('pt-BR'), icon: 'ti-circle-check', delta: moedaBR(valorGanho) + ' ganho', deltaTone: 'up' },
    { label: 'Taxa de conversão', value: `${conv.toFixed(1)}%`, icon: 'ti-percentage', delta: `${qtdPerdido.toLocaleString('pt-BR')} perdido(s)`, deltaTone: conv >= 30 ? 'up' : conv > 0 ? 'flat' : 'down' },
  ]

  // Lista detalhada (mais recentes primeiro) + CSV.
  const detalhe = rows.slice(0, LISTA_MAX)
  const csvRows = detalhe.map((l) => [
    dataBR(l.criado_em),
    l.nome || '',
    ORIGEM_LABEL[l.origem || 'outros'] ?? l.origem ?? '',
    nomeDe(l.etapa_id),
    TEMP_LABEL[l.temperatura || ''] ?? '',
    Math.round(l.valor_estimado || 0),
  ])

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>CRM</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="crm-note">
        <i className="ti ti-affiliate" /> Funil de <b>clientes</b> da unidade (origem, etapa e conversão). A <b>taxa de conversão</b> é
        convertidos ÷ (convertidos + perdidos); leads abertos contam como em negociação.
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={sp.periodo || 'mes'} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/crm" />
        <ExportCsvButton filename={`crm-${sp.periodo || 'mes'}`} headers={['Criado em', 'Lead', 'Origem', 'Etapa', 'Temperatura', 'Valor estimado']} rows={csvRows} />
      </div>

      {semFonte ? (
        <div className="rel-card" style={{ padding: '22px 18px' }}>
          <div className="crm-note" style={{ marginBottom: 0 }}>
            <i className="ti ti-database-off" /> Relatório em preparação  sem fonte de dados de CRM disponível no momento (consulta indisponível para o seu perfil/unidade).
          </div>
        </div>
      ) : (
        <>
          {capped && (
            <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}>
              <i className="ti ti-alert-triangle" /> Período/unidade muito amplos: agregando os primeiros {PULL_CAP.toLocaleString('pt-BR')} leads. Refine o período para totais exatos.
            </div>
          )}

          <RelKpis kpis={kpis} />

          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <BarChart title="Leads por etapa do funil" icon="ti-layout-kanban" rows={barEtapa} emptyMsg="Sem leads no período." />
            <BarChart title="Leads por origem" icon="ti-affiliate" rows={barOrigem} emptyMsg="Sem leads no período." />
          </div>

          <div className="rel-card">
            <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
              <span>
                <i className="ti ti-table" /> Funil por etapa
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{total.toLocaleString('pt-BR')} no período</span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Etapa</th>
                    <th className="num-r">Leads</th>
                    <th className="num-r">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {total === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead no período selecionado.
                      </td>
                    </tr>
                  )}
                  {total > 0 &&
                    linhasEtapa.map((e) => (
                      <tr key={e.id}>
                        <td>{e.nome}</td>
                        <td className="num-r" style={{ fontWeight: 600 }}>{e.count.toLocaleString('pt-BR')}</td>
                        <td className="num-r">{total > 0 ? ((e.count / total) * 100).toFixed(1) : '0,0'}%</td>
                      </tr>
                    ))}
                  {total > 0 && semEtapa > 0 && (
                    <tr style={{ opacity: 0.75 }}>
                      <td><em>Sem etapa</em></td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{semEtapa.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{((semEtapa / total) * 100).toFixed(1)}%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rel-card">
            <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
              <span>
                <i className="ti ti-affiliate" /> Origem dos leads
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{linhasOrigem.length} origem(ns)</span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th className="num-r">Leads</th>
                    <th className="num-r">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasOrigem.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead no período selecionado.
                      </td>
                    </tr>
                  )}
                  {linhasOrigem.map((o) => (
                    <tr key={o.origem}>
                      <td>{o.origem}</td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{o.count.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{total > 0 ? ((o.count / total) * 100).toFixed(1) : '0,0'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
              <span>
                <i className="ti ti-users" /> Leads no período
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {total.toLocaleString('pt-BR')} lead(s){detalhe.length < total ? ` · exibindo ${detalhe.length}` : ''}
              </span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Criado em</th>
                    <th>Lead</th>
                    <th>Origem</th>
                    <th>Etapa</th>
                    <th>Temperatura</th>
                    <th className="num-r">Valor estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead registrado no período selecionado.
                      </td>
                    </tr>
                  )}
                  {detalhe.map((l) => (
                    <tr key={l.id}>
                      <td>{dataBR(l.criado_em)}</td>
                      <td>
                        <span className="cli-name">{l.nome || ''}</span>
                      </td>
                      <td>{ORIGEM_LABEL[l.origem || 'outros'] ?? l.origem ?? ''}</td>
                      <td>{nomeDe(l.etapa_id)}</td>
                      <td>{TEMP_LABEL[l.temperatura || ''] ?? ''}</td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{l.valor_estimado ? moedaBR(l.valor_estimado) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TODO(legado: relCRM ~4256): cohort de conversão por origem (ganhos÷leads por canal) e
          tempo médio no funil quando houver histórico de movimentações de etapa persistido. */}
    </div>
  )
}
