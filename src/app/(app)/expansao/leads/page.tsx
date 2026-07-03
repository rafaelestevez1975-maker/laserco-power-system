import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'
import { LeadsFiltros } from '@/components/expansao-leads/LeadsFiltros'

export const dynamic = 'force-dynamic'

type SP = {
  periodo?: string
  di?: string
  df?: string
  q?: string
  origem?: string
  temperatura?: string
  etapa?: string
}

// Teto de pull: paginamos para nunca estourar o limite padrão do PostgREST (1000) silenciosamente.
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
const ORIGEM_KEYS = Object.keys(ORIGEM_LABEL)

// Temperatura  legado EXP_TEMPS (8539): 5 níveis (ver expansao/actions.ts TEMPERATURAS).
const TEMP_LABEL: Record<string, string> = {
  gelado: 'Gelado',
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente',
  ardente: 'Ardente',
}
const TEMP_KEYS = Object.keys(TEMP_LABEL)
const TEMP_ICON: Record<string, string> = {
  gelado: 'ti-snowflake',
  frio: 'ti-snowflake',
  morno: 'ti-temperature',
  quente: 'ti-flame',
  ardente: 'ti-flame',
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
  telefone: string | null
  email: string | null
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

/** Pagina leads de franquia escopados por unidade/período + filtros server-side. Trata erro → vazio. */
async function pullLeads(
  sb: Awaited<ReturnType<typeof createClient>>,
  filtros: {
    unidadeId: string | null
    iniTs: string | null
    fimTs: string | null
    origem: string | null
    temperatura: string | null
    etapa: string | null
  },
): Promise<{ rows: LeadRow[]; capped: boolean; erro: boolean }> {
  const out: LeadRow[] = []
  let from = 0
  let capped = false
  for (;;) {
    let q = sb
      .from('crm_leads')
      .select(
        'id, nome, empresa, uf, origem, tipo_lead, valor_estimado, etapa_id, status, temperatura, telefone, email, criado_em',
      )
      .eq('pipeline', 'franquia') as unknown as SbQuery
    if (filtros.unidadeId) q = q.eq('unidade_id', filtros.unidadeId)
    if (filtros.iniTs) q = q.gte('criado_em', filtros.iniTs)
    if (filtros.fimTs) q = q.lt('criado_em', filtros.fimTs)
    if (filtros.origem) q = q.eq('origem', filtros.origem)
    if (filtros.temperatura) q = q.eq('temperatura', filtros.temperatura)
    if (filtros.etapa) q = q.eq('etapa_id', filtros.etapa)
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

export default async function ExpansaoLeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  const range = resolveRelRange(sp.periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // Filtros validados contra os valores conhecidos do CHECK do banco (evita query inútil).
  const fOrigem = sp.origem && ORIGEM_KEYS.includes(sp.origem) ? sp.origem : ''
  const fTemp = sp.temperatura && TEMP_KEYS.includes(sp.temperatura) ? sp.temperatura : ''
  const fEtapa = (sp.etapa || '').trim()
  const busca = (sp.q || '').trim().toLowerCase()

  // Etapas do funil de FRANQUIA (pipeline='franquia' separa do CRM de clientes  migration 050).
  // Se a coluna pipeline não existir (migration não aplicada), a query falha → estado sem fonte.
  const { data: etapasRaw, error: etapasErr } = await sb
    .from('crm_etapas')
    .select('id, nome, ordem')
    .eq('ativo', true)
    .eq('pipeline', 'franquia')
    .order('ordem', { ascending: true })

  const { rows, capped, erro } = await pullLeads(sb, {
    unidadeId,
    iniTs,
    fimTs,
    origem: fOrigem,
    temperatura: fTemp,
    etapa: fEtapa,
  })

  // Estado robusto: se qualquer query falhou (RLS/coluna/tabela), renderiza vazio sem quebrar.
  const semFonte = !!etapasErr || erro
  const etapas = (etapasErr ? [] : (etapasRaw ?? [])) as EtapaRow[]

  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome ?? '']))
  const nomeDe = (id: string | null) => (id ? nomeEtapa.get(id) ?? '' : '')

  // Busca textual aplicada sobre o lote já paginado (PostgREST .ilike não cobre múltiplas colunas
  // de forma simples; o lote é pequeno por unidade/período).
  const filtrados = busca
    ? rows.filter((l) => {
        const alvo = `${l.nome ?? ''} ${l.empresa ?? ''} ${l.tipo_lead ?? ''} ${l.email ?? ''} ${l.telefone ?? ''}`.toLowerCase()
        return alvo.includes(busca)
      })
    : rows

  // ── KPIs sobre o conjunto filtrado ──
  const total = filtrados.length
  const ehGanho = (l: LeadRow) =>
    nomeDe(l.etapa_id) === 'Convertido' ||
    nomeDe(l.etapa_id) === 'Fechado' ||
    l.status === 'convertido' ||
    l.status === 'ganho'
  const ehPerdido = (l: LeadRow) => nomeDe(l.etapa_id) === 'Perdido' || l.status === 'perdido'

  const qtdGanho = filtrados.filter(ehGanho).length
  const qtdPerdido = filtrados.filter(ehPerdido).length
  const qtdAtivos = filtrados.filter((l) => !ehGanho(l) && !ehPerdido(l)).length
  const valorTotal = filtrados.reduce((s, l) => s + (l.valor_estimado || 0), 0)
  const valorAtivos = filtrados
    .filter((l) => !ehGanho(l) && !ehPerdido(l))
    .reduce((s, l) => s + (l.valor_estimado || 0), 0)
  const quentes = filtrados.filter((l) => l.temperatura === 'quente' || l.temperatura === 'ardente').length

  const kpis: RelKpi[] = [
    {
      label: 'Leads',
      value: total.toLocaleString('pt-BR') + (capped ? '+' : ''),
      icon: 'ti-list-check',
      delta: `${qtdAtivos.toLocaleString('pt-BR')} em aberto`,
      deltaTone: 'flat',
    },
    {
      label: 'Quentes / ardentes',
      value: quentes.toLocaleString('pt-BR'),
      icon: 'ti-flame',
      delta: total > 0 ? `${((quentes / total) * 100).toFixed(0)}% do total` : '',
      deltaTone: quentes > 0 ? 'up' : 'flat',
    },
    {
      label: 'Valor estimado',
      value: moedaBR(valorTotal),
      icon: 'ti-businessplan',
      delta: `${moedaBR(valorAtivos)} em aberto`,
      deltaTone: 'flat',
    },
    {
      label: 'Ganhos / perdidos',
      value: `${qtdGanho.toLocaleString('pt-BR')} / ${qtdPerdido.toLocaleString('pt-BR')}`,
      icon: 'ti-target-arrow',
      delta: qtdGanho + qtdPerdido > 0 ? `${((qtdGanho / (qtdGanho + qtdPerdido)) * 100).toFixed(1)}% conversão` : 'sem fechados',
      deltaTone: qtdGanho > 0 ? 'up' : 'flat',
    },
  ]

  // Lista detalhada (mais recentes primeiro) + CSV.
  const detalhe = filtrados.slice(0, LISTA_MAX)
  const csvRows = detalhe.map((l) => [
    dataBR(l.criado_em),
    l.nome || '',
    l.empresa || '',
    l.uf || '',
    l.tipo_lead || '',
    ORIGEM_LABEL[l.origem || 'outros'] ?? l.origem ?? '',
    nomeDe(l.etapa_id),
    TEMP_LABEL[l.temperatura || ''] ?? '',
    l.telefone || '',
    l.email || '',
    Math.round(l.valor_estimado || 0),
  ])

  const origens: [string, string][] = ORIGEM_KEYS.map((k) => [k, ORIGEM_LABEL[k]])
  const temperaturas: [string, string][] = TEMP_KEYS.map((k) => [k, TEMP_LABEL[k]])
  const etapaOpts: [string, string][] = etapas.map((e) => [e.id, e.nome ?? ''])

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7ECFA', color: '#2f44a0' }}>
          <i className="ti ti-list-check" />
        </div>
        <div>
          <h2>Expansão · Leads</h2>
          <p>
            Lista de candidatos a franqueado (pipeline de <b>franquia</b>)  busca e filtros por origem, temperatura e etapa.
            Para a visão de funil consolidada, use <b>Expansão · Funil de Vendas</b>.
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
        <RelFiltros periodo={sp.periodo || 'mes'} di={sp.di || ''} df={sp.df || ''} basePath="/expansao/leads" />
        <ExportCsvButton
          filename={`expansao-leads-${sp.periodo || 'mes'}`}
          headers={['Criado em', 'Lead', 'Empresa', 'UF', 'Linha de oferta', 'Origem', 'Etapa', 'Temperatura', 'Telefone', 'E-mail', 'Valor estimado']}
          rows={csvRows}
        />
      </div>

      {semFonte ? (
        <div className="rel-card" style={{ padding: '22px 18px' }}>
          <div className="crm-note" style={{ marginBottom: 0 }}>
            <i className="ti ti-database-off" /> Relatório em preparação  sem fonte de dados de leads de Expansão disponível no
            momento (pipeline de franquia indisponível para o seu perfil/unidade ou migration ainda não aplicada).
          </div>
        </div>
      ) : (
        <>
          <LeadsFiltros
            basePath="/expansao/leads"
            periodo={sp.periodo || 'mes'}
            di={sp.di || ''}
            df={sp.df || ''}
            q={sp.q || ''}
            origem={fOrigem}
            temperatura={fTemp}
            etapa={fEtapa}
            origens={origens}
            temperaturas={temperaturas}
            etapas={etapaOpts}
          />

          {capped && (
            <div
              className="rel-card"
              style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '10px 14px' }}
            >
              <i className="ti ti-alert-triangle" /> Período/unidade muito amplos: exibindo os primeiros{' '}
              {PULL_CAP.toLocaleString('pt-BR')} leads. Refine o período/filtros para totais exatos.
            </div>
          )}

          <RelKpis kpis={kpis} />

          <div className="crm-note">
            <i className="ti ti-list-check" /> Cada linha é um <b>candidato a franqueado</b>. A <b>temperatura</b> indica o calor da
            negociação (do gelado ao ardente); a <b>etapa</b> mostra onde o lead está no funil de franquia.
          </div>

          <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
              <span>
                <i className="ti ti-users" /> Leads
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {total.toLocaleString('pt-BR')} lead(s)
                {detalhe.length < total ? ` · exibindo ${detalhe.length}` : ''}
              </span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Criado em</th>
                    <th>Lead</th>
                    <th>Contato</th>
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
                      <td colSpan={10} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                  {detalhe.map((l) => (
                    <tr key={l.id}>
                      <td>{dataBR(l.criado_em)}</td>
                      <td>
                        <span className="cli-name">{l.nome || ''}</span>
                      </td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                        {l.telefone || l.email ? (
                          <>
                            {l.telefone || ''}
                            {l.email ? (
                              <>
                                <br />
                                <span style={{ color: 'var(--text-3)' }}>{l.email}</span>
                              </>
                            ) : null}
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                      <td>{l.empresa || ''}</td>
                      <td>{l.uf || ''}</td>
                      <td>{l.tipo_lead || ''}</td>
                      <td>{ORIGEM_LABEL[l.origem || 'outros'] ?? l.origem ?? ''}</td>
                      <td>{nomeDe(l.etapa_id)}</td>
                      <td>
                        {l.temperatura ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <i className={`ti ${TEMP_ICON[l.temperatura] ?? 'ti-temperature'}`} />
                            {TEMP_LABEL[l.temperatura] ?? l.temperatura}
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="num-r" style={{ fontWeight: 600 }}>
                        {l.valor_estimado ? moedaBR(l.valor_estimado) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TODO(legado: CRM_LEADS ~4017 / EXP ~2550): responsável (join perfis_usuario), SLA/última
          interação e tags por lead quando essas colunas/relacionamentos forem expostos pelo backend. */}
    </div>
  )
}
