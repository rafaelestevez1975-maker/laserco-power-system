import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { dataBR } from '@/lib/fmt'
import { STATUS_PILL, SEG_LABEL } from '@/lib/marketing'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

// Teto de campanhas listadas — o volume por unidade é baixo (espelha LIMITE de /marketing).
const LIMITE = 300

// Fonte real: campanhas_whatsapp (Disparos WhatsApp API). Colunas confirmadas em
// src/app/(app)/marketing/page.tsx e marketing/actions.ts (introspecção dos CHECKs em lib/marketing).
type CampDb = {
  id: string
  nome: string | null
  template_nome: string | null
  segmentacao_tipo: string | null
  status: string | null
  concluido_em: string | null
  criado_em: string | null
  total_destinatarios: number | null
  total_enviados: number | null
  total_entregues: number | null
  total_lidos: number | null
  total_responderam: number | null
  total_falhou: number | null
  unidade_id: string | null
}

function pct(parte: number, total: number): string {
  return total > 0 ? ((parte / total) * 100).toFixed(1) : '0,0'
}

export default async function RelWhatsappPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Campanhas são geralmente recentes → janela ampla por padrão ('90d').
  const periodo = sp.periodo || '90d'
  const range = resolveRelRange(periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Consulta robusta: se a tabela não existir / der erro, cai p/ estado vazio ──
  let q = sb
    .from('campanhas_whatsapp')
    .select(
      'id, nome, template_nome, segmentacao_tipo, status, concluido_em, criado_em, total_destinatarios, total_enviados, total_entregues, total_lidos, total_responderam, total_falhou, unidade_id',
    )
    .order('criado_em', { ascending: false })
    .limit(LIMITE)
  if (unidadeId) q = q.eq('unidade_id', unidadeId)
  if (iniTs) q = q.gte('criado_em', iniTs)
  if (fimTs) q = q.lt('criado_em', fimTs)

  const { data, error } = await q
  const semFonte = !!error
  const campanhas = (semFonte ? [] : ((data as CampDb[] | null) ?? []))

  // ── Agregados ──
  let destinatarios = 0, enviados = 0, entregues = 0, lidos = 0, responderam = 0, falhou = 0
  const porStatus = new Map<string, number>()
  for (const c of campanhas) {
    destinatarios += c.total_destinatarios ?? 0
    enviados += c.total_enviados ?? 0
    entregues += c.total_entregues ?? 0
    lidos += c.total_lidos ?? 0
    responderam += c.total_responderam ?? 0
    falhou += c.total_falhou ?? 0
    const st = c.status ?? 'rascunho'
    porStatus.set(st, (porStatus.get(st) ?? 0) + 1)
  }
  const totalCampanhas = campanhas.length
  const taxaEntrega = pct(entregues, enviados)
  const taxaLeitura = pct(lidos, entregues)
  const taxaResposta = pct(responderam, entregues)

  // Gráfico: campanhas por status (rótulo legível via STATUS_PILL[status][1]).
  const barStatus: BarRow[] = [...porStatus.entries()]
    .map(([st, n]) => ({ label: STATUS_PILL[st]?.[1] ?? st, value: n, display: n.toLocaleString('pt-BR') }))
    .sort((a, b) => b.value - a.value)

  // Gráfico: funil de mensagens (enviadas → entregues → lidas → respondidas).
  const barFunil: BarRow[] = [
    { label: 'Enviadas', value: enviados, display: enviados.toLocaleString('pt-BR') },
    { label: 'Entregues', value: entregues, display: entregues.toLocaleString('pt-BR') },
    { label: 'Lidas', value: lidos, display: lidos.toLocaleString('pt-BR') },
    { label: 'Respondidas', value: responderam, display: responderam.toLocaleString('pt-BR') },
  ]

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7F9EE', color: '#1a8a4f' }}>
          <i className="ti ti-brand-whatsapp" />
        </div>
        <div>
          <h2>Mensagens WhatsApp API</h2>
          <p>
            Disparos por campanha — enviadas, entregues, lidas e respondidas ·{' '}
            {range.label} · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
          </p>
        </div>
      </div>

      <RelFiltros periodo={periodo} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/whatsapp" />

      {semFonte ? (
        <div className="crm-note">
          <i className="ti ti-info-circle" /> Relatório em preparação: a fonte de dados de mensagens
          WhatsApp ainda não está disponível neste ambiente. Assim que as campanhas começarem a ser
          registradas, os números aparecerão aqui automaticamente.
        </div>
      ) : (
        <>
          {/* ── KPIs (metric-box) ── */}
          <div className="metas-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <div className="metric-box">
              <span>Campanhas</span>
              <b>{totalCampanhas.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box gold">
              <span>Mensagens enviadas</span>
              <b>{enviados.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box">
              <span>Taxa de entrega</span>
              <b>{taxaEntrega}%</b>
            </div>
            <div className="metric-box purple">
              <span>Taxa de leitura</span>
              <b>{taxaLeitura}%</b>
            </div>
          </div>

          <div className="metas-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <div className="metric-box">
              <span>Destinatários</span>
              <b>{destinatarios.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box">
              <span>Entregues</span>
              <b>{entregues.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box purple">
              <span>Respostas ({taxaResposta}%)</span>
              <b>{responderam.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box">
              <span>Falhas</span>
              <b>{falhou.toLocaleString('pt-BR')}</b>
            </div>
          </div>

          {/* ── Gráficos ── */}
          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <BarChart title="Funil de mensagens" icon="ti-filter" rows={barFunil} emptyMsg="Sem mensagens no período." />
            <BarChart title="Campanhas por status" icon="ti-chart-pie" rows={barStatus} emptyMsg="Sem campanhas no período." />
          </div>

          {/* ── Tabela de campanhas ── */}
          <div className="cli-card">
            <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
              <span>
                <i className="ti ti-table" /> Campanhas de WhatsApp
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                {totalCampanhas.toLocaleString('pt-BR')} no período
              </span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Status</th>
                    <th>Segmentação</th>
                    <th className="num-r">Enviadas</th>
                    <th className="num-r">Entregues</th>
                    <th className="num-r">Lidas</th>
                    <th className="num-r">Respostas</th>
                    <th className="num-r">Falhas</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {totalCampanhas === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhuma campanha de WhatsApp no período selecionado.
                      </td>
                    </tr>
                  )}
                  {campanhas.map((c) => {
                    const st = c.status ?? 'rascunho'
                    const pill = STATUS_PILL[st] ?? ['draft', st]
                    const env = c.total_enviados ?? 0
                    const ent = c.total_entregues ?? 0
                    const lid = c.total_lidos ?? 0
                    return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.nome || c.template_nome || 'Campanha'}</td>
                        <td>
                          <span className={`wa-pill ${pill[0]}`}>{pill[1]}</span>
                        </td>
                        <td>{SEG_LABEL[c.segmentacao_tipo ?? ''] ?? (c.segmentacao_tipo || '—')}</td>
                        <td className="num-r">{env.toLocaleString('pt-BR')}</td>
                        <td className="num-r">
                          {ent.toLocaleString('pt-BR')}
                          {env > 0 && <span style={{ color: 'var(--text-3)', fontSize: 11 }}> ({pct(ent, env)}%)</span>}
                        </td>
                        <td className="num-r">
                          {lid.toLocaleString('pt-BR')}
                          {ent > 0 && <span style={{ color: 'var(--text-3)', fontSize: 11 }}> ({pct(lid, ent)}%)</span>}
                        </td>
                        <td className="num-r">{(c.total_responderam ?? 0).toLocaleString('pt-BR')}</td>
                        <td className="num-r">{(c.total_falhou ?? 0).toLocaleString('pt-BR')}</td>
                        <td>{dataBR(c.concluido_em || c.criado_em)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {totalCampanhas > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--line)' }}>
                      <td style={{ fontWeight: 800 }} colSpan={3}>
                        Total
                      </td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{enviados.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{entregues.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{lidos.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{responderam.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{falhou.toLocaleString('pt-BR')}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="crm-note">
            <i className="ti ti-info-circle" /> Os números refletem os contadores agregados de cada
            campanha (campanhas_whatsapp). Use o filtro de período para ajustar a janela e troque a
            unidade ativa no topo do sistema para segmentar por unidade.
          </div>
        </>
      )}
    </div>
  )
}
