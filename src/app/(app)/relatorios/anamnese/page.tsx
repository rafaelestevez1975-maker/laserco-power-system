import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { dataBR } from '@/lib/fmt'
import { normalizarSecoes, resumoDocumento, type DocumentoRow } from '@/lib/anamnese'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'

export const dynamic = 'force-dynamic'

type SP = { tipo?: string }

/**
 * Relatório de Anamnese / Ficha Técnica  réplica do REL_DEFS.anamnese do legado
 * (legacy/index.html ~4425). No legado os KPIs ("488 preenchidos", "212 anamneses",
 * "14 pendentes de assinatura", "94% de preenchimento") e as linhas por cliente
 * (Data/Cliente/Documento/Profissional/Status) eram 100% MOCK  não há nenhuma
 * tabela de PREENCHIMENTOS por cliente no backend atual:
 *   documentos_preenchidos / documento_respostas / anamneses / fichas / assinaturas_documento
 *   → nenhuma existe (nenhum from('...') no código nem migration).
 *
 * A única fonte real é a tabela `documentos` (scripts/migrations/anamnese.sql), o
 * CATÁLOGO de fichas digitais (Anamnese, Termo de Sessão, Ficha Técnica, Consentimento
 * LGPD…) usado em /cadastros/anamnese. Este relatório, portanto, é o relatório do
 * catálogo de documentos por unidade  números reais (quantos documentos, ativos,
 * obrigatórios, perguntas, perguntas que inviabilizam)  e deixa explícito que o
 * acompanhamento de preenchimento POR CLIENTE ainda não tem fonte de dados.
 *
 * Colunas de `documentos` confirmadas em /cadastros/anamnese/page.tsx e na migration:
 *   id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo,
 *   unidades_ids (uuid[]), secoes (jsonb), criado_em, atualizado_em.
 * Escopo de unidade: NÃO há `unidade_id`; o vínculo é o array `unidades_ids`
 *   (NULL/{} = todas as unidades da rede) → filtramos em memória.
 * Escopo de empresa: garantido pela RLS (empresa_id) do Supabase.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  Ativo: { label: 'Ativo', cls: 'os-fechada' },
  Rascunho: { label: 'Rascunho', cls: 'os-aberta' },
  Inativo: { label: 'Inativo', cls: 'os-cancelada' },
}

export default async function RelAnamnesePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // ── Fonte real: catálogo de documentos (única tabela existente) ──
  // ROBUSTEZ: se a tabela não existir (migration não aplicada) → error → estado vazio.
  let tabelaAusente = false
  let rows: DocumentoRow[] = []
  {
    const { data, error } = await sb
      .from('documentos')
      .select('id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo, unidades_ids, secoes, atualizado_em')
      .order('atualizado_em', { ascending: false })
      .limit(1000)
    if (error) tabelaAusente = true
    else rows = (data ?? []) as DocumentoRow[]
  }

  // Escopo por unidade ativa: documentos sem vínculo (NULL/{}) valem p/ todas; senão precisa conter a unidade.
  const docs = (unidadeId
    ? rows.filter((d) => !d.unidades_ids || d.unidades_ids.length === 0 || d.unidades_ids.includes(unidadeId))
    : rows
  ).map((d) => ({ ...d, secoes: normalizarSecoes(d.secoes) }))

  // Tipos disponíveis (para o filtro por tipo de documento).
  const tiposDisponiveis = Array.from(new Set(docs.map((d) => d.tipo || 'Anamnese'))).sort()
  const tipoSel = sp.tipo && tiposDisponiveis.includes(sp.tipo) ? sp.tipo : ''
  const visiveis = tipoSel ? docs.filter((d) => (d.tipo || 'Anamnese') === tipoSel) : docs

  // ── KPIs reais do catálogo ──
  const total = visiveis.length
  const ativos = visiveis.filter((d) => (d.status || 'Ativo') === 'Ativo').length
  const obrigatorios = visiveis.filter((d) => d.obrigatorio).length
  let totalPerguntas = 0
  let totalInviabiliza = 0
  for (const d of visiveis) {
    const { perguntas, inviabiliza } = resumoDocumento(d.secoes)
    totalPerguntas += perguntas
    totalInviabiliza += inviabiliza
  }

  const kpis: RelKpi[] = [
    { label: 'Documentos', value: total.toLocaleString('pt-BR'), icon: 'ti-file-text' },
    { label: 'Ativos', value: ativos.toLocaleString('pt-BR'), icon: 'ti-clipboard-check', delta: total > 0 ? `${((ativos / total) * 100).toFixed(0)}% do catálogo` : undefined, deltaTone: 'up' },
    { label: 'Obrigatórios', value: obrigatorios.toLocaleString('pt-BR'), icon: 'ti-asterisk' },
    { label: 'Perguntas (total)', value: totalPerguntas.toLocaleString('pt-BR'), icon: 'ti-list-check' },
  ]

  // ── Breakdown por tipo (catálogo real) ──
  const porTipo = new Map<string, number>()
  for (const d of docs) {
    const k = d.tipo || 'Anamnese'
    porTipo.set(k, (porTipo.get(k) || 0) + 1)
  }
  const barTipo: BarRow[] = [...porTipo.entries()]
    .map(([k, v]) => ({ label: k, value: v, display: v.toLocaleString('pt-BR') }))
    .sort((a, b) => b.value - a.value)

  // ── Breakdown por status (catálogo real) ──
  const barStatus: BarRow[] = Object.keys(STATUS_META).map((k) => {
    const c = visiveis.filter((d) => (d.status || 'Ativo') === k).length
    return { label: STATUS_META[k].label, value: c, display: c.toLocaleString('pt-BR') }
  })

  const csvRows = visiveis.map((d) => {
    const { perguntas, inviabiliza } = resumoDocumento(d.secoes)
    return [
      d.nome || '',
      d.tipo || 'Anamnese',
      d.preenchimento || '',
      d.obrigatorio ? 'Sim' : 'Não',
      d.acumulativo ? 'Sim' : 'Não',
      STATUS_META[d.status || '']?.label ?? d.status ?? '',
      perguntas,
      inviabiliza,
      dataBR(d.atualizado_em),
    ]
  })

  const qsTipo = (t: string) => (t ? `?tipo=${encodeURIComponent(t)}` : '')

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Anamnese / Ficha Técnica</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          Catálogo de fichas digitais · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      {tabelaAusente && (
        <div
          className="crm-note"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}
        >
          <i className="ti ti-hourglass" style={{ fontSize: 20, color: 'var(--brand-600)', marginTop: 2 }} />
          <div>
            <b>Relatório em preparação  sem fonte de dados ainda.</b>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
              A tabela de documentos (anamnese / fichas digitais) ainda não existe no backend. Aplique a
              migration <code>scripts/migrations/anamnese.sql</code> no lkii para criar a tabela{' '}
              <code>documentos</code> e o catálogo de fichas. Assim que houver registros, este relatório
              passará a exibir os números reais por tipo, status e unidade.
            </div>
          </div>
        </div>
      )}

      {!tabelaAusente && (
        <>
          {/* Filtros simples (server-side via querystring): tipo de documento + exportação. */}
          <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginRight: 2 }}>
                Tipo
              </span>
              <Link
                href={`/relatorios/anamnese${qsTipo('')}`}
                className={`rel-tab${tipoSel === '' ? ' active' : ''}`}
                style={{ textDecoration: 'none' }}
              >
                Todos
              </Link>
              {tiposDisponiveis.map((t) => (
                <Link
                  key={t}
                  href={`/relatorios/anamnese${qsTipo(t)}`}
                  className={`rel-tab${tipoSel === t ? ' active' : ''}`}
                  style={{ textDecoration: 'none' }}
                >
                  {t}
                </Link>
              ))}
            </div>
            <ExportCsvButton
              filename={`anamnese${tipoSel ? `-${tipoSel}` : ''}`}
              headers={['Documento', 'Tipo', 'Preenchimento', 'Obrigatório', 'Acumulativo', 'Status', 'Perguntas', 'Inviabiliza', 'Atualizado em']}
              rows={csvRows}
            />
          </div>

          <RelKpis kpis={kpis} />

          {/* Métricas clínicas adicionais (metric-box)  perguntas que inviabilizam o procedimento. */}
          <div className="rel-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="metric-box">
              <span>Perguntas que inviabilizam o procedimento</span>
              <b>{totalInviabiliza.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box gold">
              <span>Documentos obrigatórios</span>
              <b>{obrigatorios.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box purple">
              <span>Média de perguntas por documento</span>
              <b>{total > 0 ? (totalPerguntas / total).toFixed(1).replace('.', ',') : '0'}</b>
            </div>
          </div>

          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <BarChart title="Documentos por tipo" icon="ti-files" rows={barTipo} emptyMsg="Sem documentos no catálogo." />
            <BarChart title="Por status" icon="ti-chart-pie" rows={barStatus} emptyMsg="Sem documentos." />
          </div>

          <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
              <span>
                <i className="ti ti-file-text" /> Fichas digitais{tipoSel ? ` · ${tipoSel}` : ''}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{visiveis.length.toLocaleString('pt-BR')} documento(s)</span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Tipo</th>
                    <th>Preenchimento</th>
                    <th>Status</th>
                    <th className="num-r">Perguntas</th>
                    <th className="num-r">Inviabiliza</th>
                    <th>Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum documento no catálogo{tipoSel ? ` para o tipo "${tipoSel}"` : ''}.
                      </td>
                    </tr>
                  )}
                  {visiveis.map((d) => {
                    const { perguntas, inviabiliza } = resumoDocumento(d.secoes)
                    const meta = STATUS_META[d.status || ''] ?? { label: d.status ?? '', cls: 'os-aberta' }
                    return (
                      <tr key={d.id}>
                        <td>
                          <span className="cli-name">{d.nome || ''}</span>
                          {d.obrigatorio && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--gold-600)', fontWeight: 700 }} title="Obrigatório">
                              <i className="ti ti-asterisk" />
                            </span>
                          )}
                          {d.acumulativo && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-3)' }} title="Acumulativo (acumula sessões)">
                              <i className="ti ti-stack-2" />
                            </span>
                          )}
                        </td>
                        <td>{d.tipo || 'Anamnese'}</td>
                        <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{d.preenchimento || ''}</td>
                        <td>
                          <span className={`os-st ${meta.cls}`}>{meta.label}</span>
                        </td>
                        <td className="num-r" style={{ fontWeight: 600 }}>{perguntas.toLocaleString('pt-BR')}</td>
                        <td className="num-r" style={{ color: inviabiliza > 0 ? 'var(--red, #d23b53)' : 'var(--text-3)' }}>
                          {inviabiliza.toLocaleString('pt-BR')}
                        </td>
                        <td>{dataBR(d.atualizado_em)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Nota honesta: o acompanhamento de PREENCHIMENTO por cliente não tem fonte de dados ainda. */}
          <div className="crm-note" style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
            <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--brand-600)' }} />
            <span>
              Este relatório mostra o <b>catálogo</b> de fichas digitais por unidade (números reais da tabela{' '}
              <code>documentos</code>). O acompanhamento de <b>preenchimento e assinatura por cliente</b>{' '}
              (quantas anamneses preenchidas, pendentes de assinatura, taxa de preenchimento) ainda não tem
              fonte de dados no backend  não existe tabela de preenchimentos. Assim que esses registros
              passarem a ser coletados, os KPIs por cliente serão adicionados aqui.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
