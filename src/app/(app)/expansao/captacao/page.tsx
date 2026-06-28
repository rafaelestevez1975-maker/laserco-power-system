import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { dataBR } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

/**
 * Expansão · Captação (Geo + Site) — relatório read-only.
 *
 * Intenção (legado expCaptacao ~8568): leads que entram automaticamente no funil de
 * franquia por *geolocalizado* (CRM) e pelo *cadastro do site* (webhook). Aqui mostramos
 * os KPIs de entrada (7 dias, por canal, total) e a entrada recente de leads.
 *
 * Fonte: crm_leads where pipeline='franquia' e origem in ('geolocalizado','site').
 * (Tabela/colunas confirmadas em src/app/(app)/expansao/page.tsx e relatorios/crm/page.tsx.)
 * Escopo: unidade ativa (quando houver) — admin/sem unidade vê todas.
 *
 * ROBUSTEZ: se a query falhar (RLS/coluna/tabela ausente), renderiza estado vazio (crm-note)
 * sem quebrar em runtime.
 */

const LIMITE = 500
const LISTA_MAX = 200

// Origens de captação automática (CHECK do banco — migration 015/050; ver crm/actions.ts).
const ORIGENS_CAPTACAO = ['geolocalizado', 'site'] as const

const ORIGEM_LABEL: Record<string, string> = {
  geolocalizado: 'Geolocalizado',
  site: 'Site',
}

type LeadRow = {
  id: string
  nome: string | null
  telefone: string | null
  email: string | null
  origem: string | null
  tipo_lead: string | null
  uf: string | null
  empresa: string | null
  status: string | null
  criado_em: string | null
}

const DIA_MS = 24 * 60 * 60 * 1000

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / DIA_MS))
}

function origemBadge(origem: string | null) {
  if (origem === 'geolocalizado') {
    return (
      <span className="os-st os-andamento">
        <i className="ti ti-map-pin" /> Geolocalizado
      </span>
    )
  }
  if (origem === 'site') {
    return (
      <span className="os-st os-fechada">
        <i className="ti ti-world" /> Site
      </span>
    )
  }
  return <span className="os-st">{ORIGEM_LABEL[origem || ''] ?? origem ?? '—'}</span>
}

function entradaTexto(dias: number | null): string {
  if (dias == null) return '—'
  if (dias === 0) return 'hoje'
  return `há ${dias} dia(s)`
}

export default async function ExpansaoCaptacaoPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // ── Leads de captação automática (Geo + Site) do funil de franquia ──
  let q = sb
    .from('crm_leads')
    .select('id, nome, telefone, email, origem, tipo_lead, uf, empresa, status, criado_em')
    .eq('pipeline', 'franquia')
    .in('origem', ORIGENS_CAPTACAO as unknown as string[])
    .order('criado_em', { ascending: false })
    .limit(LIMITE)
  if (unidadeId) q = q.eq('unidade_id', unidadeId)

  const { data, error } = await q

  // Estado robusto: query falhou (RLS/coluna/tabela) → renderiza vazio sem quebrar.
  const semFonte = !!error
  const rows = (semFonte ? [] : (data ?? [])) as LeadRow[]

  // ── KPIs de entrada ──
  const total = rows.length
  const geo = rows.filter((l) => l.origem === 'geolocalizado').length
  const site = rows.filter((l) => l.origem === 'site').length
  const novos7d = rows.filter((l) => {
    const d = diasDesde(l.criado_em)
    return d != null && d <= 7
  }).length

  // ── Distribuição por origem (Geo + Site) ──
  const porOrigem = ORIGENS_CAPTACAO.map((k) => ({
    origem: ORIGEM_LABEL[k],
    count: rows.filter((l) => l.origem === k).length,
  })).sort((a, b) => b.count - a.count)

  // ── Lista detalhada (mais recentes primeiro) ──
  const detalhe = rows.slice(0, LISTA_MAX)

  return (
    <div className="view active">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Expansão · Captação</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          Geo + Site · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="crm-note">
        <i className="ti ti-map-pin-share" /> Leads que entram automaticamente no funil de <b>franquia</b> por{' '}
        <b>geolocalizado</b> (CRM) e pelo <b>cadastro do site</b> (webhook). Cada novo lead aparece aqui e no funil de
        Expansão em <b>Novo Lead</b>.
      </div>

      {semFonte ? (
        <div className="rel-card" style={{ padding: '22px 18px' }}>
          <div className="crm-note" style={{ marginBottom: 0 }}>
            <i className="ti ti-database-off" /> Relatório em preparação — sem fonte de dados de captação disponível no
            momento (consulta indisponível para o seu perfil/unidade).
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '14px 0 18px' }}>
            <div className="metric-box">
              <span>Leads (7 dias)</span>
              <b>{novos7d.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box">
              <span>Via Geolocalizado</span>
              <b>{geo.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box">
              <span>Via Site</span>
              <b>{site.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box">
              <span>Total captado</span>
              <b>{total.toLocaleString('pt-BR')}</b>
            </div>
          </div>

          <div className="cli-card">
            <div className="rel-head" style={{ marginBottom: 12 }}>
              <span>
                <i className="ti ti-route" /> Entrada por origem
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                {total.toLocaleString('pt-BR')} no total
              </span>
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
                  {total === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead captado ainda.
                      </td>
                    </tr>
                  )}
                  {total > 0 &&
                    porOrigem.map((o) => (
                      <tr key={o.origem}>
                        <td>{o.origem}</td>
                        <td className="num-r" style={{ fontWeight: 600 }}>
                          {o.count.toLocaleString('pt-BR')}
                        </td>
                        <td className="num-r">{total > 0 ? ((o.count / total) * 100).toFixed(1) : '0,0'}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cli-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-head" style={{ padding: '14px 18px' }}>
              <span>
                <i className="ti ti-inbox" /> Entrada recente de leads (Geo + Site)
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {total.toLocaleString('pt-BR')} lead(s){detalhe.length < total ? ` · exibindo ${detalhe.length}` : ''}
              </span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Origem</th>
                    <th>Interesse</th>
                    <th>UF</th>
                    <th>Entrada</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum lead captado por Geolocalizado ou Site até o momento.
                      </td>
                    </tr>
                  )}
                  {detalhe.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="cli-name">{l.nome || l.empresa || '—'}</span>
                      </td>
                      <td>{l.telefone || '—'}</td>
                      <td>{origemBadge(l.origem)}</td>
                      <td>{l.tipo_lead || '—'}</td>
                      <td>{l.uf || '—'}</td>
                      <td>{entradaTexto(diasDesde(l.criado_em))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crm-note" style={{ marginTop: 14 }}>
            <i className="ti ti-plug-connected" /> Integração: o formulário do site envia cada lead via webhook e ele entra
            como origem <b>Site</b> no funil de Expansão. Leads <b>geolocalizados</b> vêm do CRM. Última entrada:{' '}
            <b>{rows[0]?.criado_em ? dataBR(rows[0].criado_em) : '—'}</b>.
          </div>
        </>
      )}
    </div>
  )
}
