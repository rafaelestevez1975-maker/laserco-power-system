import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de pull: leads de franquia são poucos por unidade/período, mas paginamos
// para nunca estourar 1000 linhas (limite padrão do PostgREST) silenciosamente.
const PULL_CAP = 8000
const PAGE = 1000
const LISTA_MAX = 300

// Rótulos amigáveis das origens do CHECK do banco (migration 050; ver expansao/actions.ts ORIGENS).
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

// Temperatura  legado EXP_TEMPS (8539): 5 níveis.
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
  empresa: string | null
  uf: string | null
  origem: string | null
  tipo_lead: string | null
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

/** Pagina leads do funil de franquia, escopados por unidade/período. Trata erro → vazio. */
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
      .select('id, nome, empresa, uf, origem, tipo_lead, valor_estimado, etapa_id, status, temperatura, criado_em')
      .eq('pipeline', 'franquia') as unknown as SbQuery
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

export default async function ExpansaoFunilPage({ searchParams }: { searchParams: Promise<SP> }) {
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
    .select('id, nome, ordem')
    .eq('ativo', true)
    .eq('pipeline', 'franquia')
    .order('ordem', { ascending: true })

  const { rows, capped, erro } = await pullLeads(sb, unidadeId, iniTs, fimTs)

  // Estado robusto: se qualquer query falhou (RLS/coluna/tabela), renderiza vazio sem quebrar.
  const semFonte = !!etapasErr || erro
  const etapas = (etapasErr ? [] : (etapasRaw ?? [])) as EtapaRow[]

  // ── Nome da etapa por id; etapas "terminais" do funil de franquia (até a COF/fechamento) ──
  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome ?? '']))
  const nomeDe = (id: string | null) => (id ? nomeEtapa.get(id) ?? '' : '')
  const ehGanho = (l: LeadRow) =>
    nomeDe(l.etapa_id) === 'Convertido' ||
    nomeDe(l.etapa_id) === 'Fechado' ||
    l.status === 'convertido' ||
    l.status === 'ganho'
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
  const receitaPrevista = rows.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  // Conversão = ganhos / (ganhos + perdidos)  fechados; espelha o KPI do board (/expansao).
  const conv = qtdGanho + qtdPerdido > 0 ? (qtdGanho / (qtdGanho + qtdPerdido)) * 100 : 0

  // ── Distribuição por etapa (na ordem do funil) com valor previsto por etapa ──
  const porEtapaQtd = new Map<string, number>()
  const porEtapaVal = new Map<string, number>()
  for (const l of rows) {
    const k = l.etapa_id ?? ''
    porEtapaQtd.set(k, (porEtapaQtd.get(k) || 0) + 1)
    porEtapaVal.set(k, (porEtapaVal.get(k) || 0) + (l.valor_estimado || 0))
  }
  const linhasEtapa = etapas.map((e) => ({
    id: e.id,
    nome: e.nome ?? '',
    count: porEtapaQtd.get(e.id) || 0,
    valor: porEtapaVal.get(e.id) || 0,
  }))
  const semEtapaQtd = porEtapaQtd.get('') || 0
  const semEtapaVal = porEtapaVal.get('') || 0

  // ── Distribuição por linha de oferta (tipo_lead)  Ultracell, Quanta, Franquia… ──
  const porTipo = new Map<string, number>()
  for (const l of rows) {
    const k = l.tipo_lead || ''
    porTipo.set(k, (porTipo.get(k) || 0) + 1)
  }
  const linhasTipo = [...porTipo.entries()].map(([k, v]) => ({ tipo: k, count: v })).sort((a, b) => b.count - a.count)

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
  const barTipo: BarRow[] = linhasTipo.slice(0, 10).map((t) => ({ label: t.tipo, value: t.count, display: t.count.toLocaleString('pt-BR') }))

  const kpis: RelKpi[] = [
    { label: 'Leads no funil', value: qtdAtivos.toLocaleString('pt-BR') + (capped ? '+' : ''), icon: 'ti-affiliate', delta: `${total.toLocaleString('pt-BR')} no período`, deltaTone: 'flat' },
    { label: 'Em negociação', value: moedaBR(valorNeg), icon: 'ti-businessplan', delta: `${qtdAtivos.toLocaleString('pt-BR')} lead(s) abertos`, deltaTone: 'flat' },
    { label: 'Taxa de conversão', value: `${conv.toFixed(1)}%`, icon: 'ti-percentage', delta: `${qtdGanho.toLocaleString('pt-BR')} ganho · ${qtdPerdido.toLocaleString('pt-BR')} perdido`, deltaTone: conv >= 30 ? 'up' : conv > 0 ? 'flat' : 'down' },
    { label: 'Receita prevista', value: moedaBR(receitaPrevista), icon: 'ti-cash', delta: `${moedaBR(valorGanho)} já ganho`, deltaTone: valorGanho > 0 ? 'up' : 'flat' },
  ]

  // Lista detalhada (mais recentes primeiro) + CSV.
  const detalhe = rows.slice(0, LISTA_MAX)
  const csvRows = detalhe.map((l) => [
    dataBR(l.criado_em),
    l.nome || '',
    l.empresa || '',
    l.uf || '',
    l.tipo_lead || '',
    ORIGEM_LABEL[l.origem || 'outros'] ?? l.origem ?? '',
    nomeDe(l.etapa_id),
    TEMP_LABEL[l.temperatura || ''] ?? '',
    Math.round(l.valor_estimado || 0),
  ])

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7ECFA', color: '#2f44a0' }}>
          <i className="ti ti-map-pin-plus" />
        </div>
        <div>
          <h2>Expansão · Funil de Vendas</h2>
          <p>
            CRM de captação e qualificação de candidatos a franqueado  Ultracell, Quanta e Franquia. Pipeline até a <b>COF</b>{' '}
            (Circular de Oferta de Franquia) e fechamento.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="crm-note">
        <i className="ti ti-affiliate" /> Funil de <b>franquias</b> (pipeline de expansão): distribuição por etapa, linha de oferta e origem.
        A <b>taxa de conversão</b> é fechados ÷ (fechados + perdidos); leads abertos contam como em negociação.
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <RelFiltros periodo={sp.periodo || 'mes'} di={sp.di || ''} df={sp.df || ''} basePath="/expansao/funil" />
        <ExportCsvButton
          filename={`expansao-funil-${sp.periodo || 'mes'}`}
          headers={['Criado em', 'Lead', 'Empresa', 'UF', 'Linha de oferta', 'Origem', 'Etapa', 'Temperatura', 'Valor estimado']}
          rows={csvRows}
        />
      </div>

      {semFonte ? (
        <div className="rel-card" style={{ padding: '22px 18px' }}>
          <div className="crm-note" style={{ marginBottom: 0 }}>
            <i className="ti ti-database-off" /> Relatório em preparação  sem fonte de dados do funil de Expansão disponível no momento
            (pipeline de franquia indisponível para o seu perfil/unidade ou migration ainda não aplicada).
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
            <BarChart title="Leads por linha de oferta" icon="ti-building-store" rows={barTipo} emptyMsg="Sem leads no período." />
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
                    <th className="num-r">Valor previsto</th>
                    <th className="num-r">% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {total === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead no período selecionado.
                      </td>
                    </tr>
                  )}
                  {total > 0 &&
                    linhasEtapa.map((e) => (
                      <tr key={e.id}>
                        <td>{e.nome}</td>
                        <td className="num-r" style={{ fontWeight: 600 }}>{e.count.toLocaleString('pt-BR')}</td>
                        <td className="num-r">{e.valor > 0 ? moedaBR(e.valor) : ''}</td>
                        <td className="num-r">{total > 0 ? ((e.count / total) * 100).toFixed(1) : '0,0'}%</td>
                      </tr>
                    ))}
                  {total > 0 && semEtapaQtd > 0 && (
                    <tr style={{ opacity: 0.75 }}>
                      <td><em>Sem etapa</em></td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{semEtapaQtd.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{semEtapaVal > 0 ? moedaBR(semEtapaVal) : ''}</td>
                      <td className="num-r">{((semEtapaQtd / total) * 100).toFixed(1)}%</td>
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
                <i className="ti ti-users" /> Candidatos a franqueado no período
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
                    <th>Empresa</th>
                    <th>UF</th>
                    <th>Linha</th>
                    <th>Origem</th>
                    <th>Etapa</th>
                    <th>Temperatura</th>
                    <th className="num-r">Valor estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum candidato registrado no período selecionado.
                      </td>
                    </tr>
                  )}
                  {detalhe.map((l) => (
                    <tr key={l.id}>
                      <td>{dataBR(l.criado_em)}</td>
                      <td>
                        <span className="cli-name">{l.nome || ''}</span>
                      </td>
                      <td>{l.empresa || ''}</td>
                      <td>{l.uf || ''}</td>
                      <td>{l.tipo_lead || ''}</td>
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

      {/* TODO(legado: relExp ~4327 / EXP ~2550): tempo médio até a COF e cohort de conversão por
          linha de oferta quando houver histórico de movimentações de etapa persistido. */}
    </div>
  )
}
