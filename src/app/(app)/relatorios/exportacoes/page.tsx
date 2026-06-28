import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { siteConfigurado } from '@/lib/supabase/site'
import { EXPORT_LIMIT } from '@/lib/exportacoes'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'

export const dynamic = 'force-dynamic'

/**
 * Relatório · Exportações — réplica do REL_DEFS.exportacoes do legado
 * (legacy/index.html ~4350: data-rep="exportacoes", "Relatório de Exportações").
 *
 * No legado os KPIs ("37 exportações", "35 concluídas", "1 em processamento",
 * "1 com erro") e as linhas (Data/Relatório/Usuário/Formato/Status) eram 100% MOCK:
 * pressupunham um HISTÓRICO/LOG de exportações que NÃO existe no backend atual.
 *
 * ROBUSTEZ: não há tabela de log de exportações no banco.
 *   grep -rliE "export_log|exportacoes_log|export_history" src → nada.
 *   A única tabela de auditoria é `audit_log` (genérica, não rastreia downloads CSV).
 * Portanto NÃO consultamos nenhum histórico de exportações (não dá p/ reproduzir
 * o log mock sem inventar dados).
 *
 * Em vez disso este relatório é um HUB/ATALHO read-only para a Central de
 * Exportações real (/exportacoes), que é onde o CSV é de fato gerado. Mostramos:
 *   - o que está disponível para exportar (datasets reais);
 *   - a CONTAGEM real de registros por dataset (count head:true, escopado pela
 *     unidade ativa nas tabelas que já são usadas em /exportacoes);
 *   - um Link destacado para abrir a Central de Exportações.
 *
 * Todas as contagens são defensivas: se a query falhar (error), a contagem fica
 * "indisponível" em vez de quebrar a tela.
 */

type Dataset = {
  key: string
  label: string
  icon: string
  desc: string
  /** Tabela real consultada para o count (null = fonte externa, sem count barato). */
  tabela: string | null
  /** Coluna de unidade para escopar o count quando há unidade ativa. */
  unidadeCol?: string
  /** Não respeita unidade ativa (fonte externa / rede inteira). */
  redeInteira?: boolean
}

// Datasets espelham os de /exportacoes (ExportacoesHub). Todas as tabelas abaixo
// já são consultadas em src/app/(app)/exportacoes/page.tsx — existência confirmada.
const DATASETS: Dataset[] = [
  { key: 'clientes', label: 'Clientes', icon: 'ti-users', desc: 'Nome, contato, CPF, cidade, pontos, créditos e status.', tabela: 'clientes', unidadeCol: 'unidade_origem_id' },
  { key: 'contas', label: 'Contas a pagar / receber', icon: 'ti-coins', desc: 'Lançamentos financeiros: valor, vencimento, status, categoria.', tabela: 'lancamentos_financeiros', unidadeCol: 'unidade_id' },
  { key: 'agendamentos', label: 'Agendamentos', icon: 'ti-calendar-event', desc: 'Cliente, serviço, profissional, horário e status.', tabela: 'agendamentos', unidadeCol: 'unidade_id' },
  { key: 'colaboradores', label: 'Colaboradores', icon: 'ti-id-badge-2', desc: 'Equipe: cargo, área, regime, admissão e status.', tabela: 'colaboradores', unidadeCol: 'unidade_id' },
  { key: 'chamados', label: 'Chamados SAC', icon: 'ti-headset', desc: 'Protocolo, cliente, canal, motivo, prioridade, fase e SLA.', tabela: 'sac_tickets', unidadeCol: 'unidade_id' },
  { key: 'leads', label: 'Leads do site', icon: 'ti-world-www', desc: 'Leads do lasercompany.com: nome, contato, área e origem.', tabela: 'site_leads', redeInteira: true },
]

export default async function RelExportacoesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const escopoUnidade = !!unidadeId

  // Count real por dataset (head:true → só o total, nunca puxa linhas). Defensivo:
  // qualquer erro vira null ("indisponível") em vez de derrubar a página.
  async function contar(d: Dataset): Promise<number | null> {
    if (!d.tabela) return null
    try {
      let q = sb.from(d.tabela).select('id', { count: 'exact', head: true })
      if (unidadeId && d.unidadeCol && !d.redeInteira) q = q.eq(d.unidadeCol, unidadeId)
      const { count, error } = await q
      return error ? null : count ?? 0
    } catch {
      return null
    }
  }

  const counts = await Promise.all(DATASETS.map((d) => contar(d)))
  const linhas = DATASETS.map((d, i) => ({ ...d, count: counts[i] }))

  // KPIs agregados (só os datasets escopáveis por unidade entram no "total exportável").
  const escopaveis = linhas.filter((l) => !l.redeInteira)
  const totalRegistros = escopaveis.reduce((a, l) => a + (l.count ?? 0), 0)
  const fontesDisponiveis = linhas.filter((l) => l.count != null && l.count > 0).length
  const fontesVazias = linhas.filter((l) => l.count === 0).length
  const fontesIndisponiveis = linhas.filter((l) => l.count == null).length

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Exportações</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {escopoUnidade ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      {/* HUB: este relatório aponta para a Central de Exportações (onde o CSV é gerado). */}
      <div
        className="crm-note"
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}
      >
        <i className="ti ti-download" style={{ fontSize: 20, color: 'var(--brand-600)', marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <b>Central de Exportações.</b>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>
            Não existe ainda um histórico de exportações no backend (downloads não são
            registrados). Abaixo está o que pode ser exportado em <b>CSV</b> (separador{' '}
            <code>;</code>, compatível com Excel pt-BR), com a contagem real de registros
            por fonte — escopada pela unidade ativa: <b>{escopoUnidade ? ctx?.activeUnitName : 'Todas as unidades'}</b>.
            {' '}Limite de <b>{EXPORT_LIMIT.toLocaleString('pt-BR')}</b> linhas por arquivo.
          </div>
          <div style={{ marginTop: 10 }}>
            <Link href="/exportacoes" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-file-download" /> Abrir Central de Exportações
            </Link>
          </div>
        </div>
      </div>

      {/* KPIs (metric-box) — visão consolidada das fontes exportáveis. */}
      <div className="rel-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="metric-box">
          <span>Registros exportáveis (unidade)</span>
          <b>{totalRegistros.toLocaleString('pt-BR')}</b>
        </div>
        <div className="metric-box gold">
          <span>Fontes com dados</span>
          <b>{fontesDisponiveis.toLocaleString('pt-BR')}</b>
        </div>
        <div className="metric-box purple">
          <span>Fontes vazias</span>
          <b>{fontesVazias.toLocaleString('pt-BR')}</b>
        </div>
        <div className="metric-box">
          <span>Contagem indisponível</span>
          <b>{fontesIndisponiveis.toLocaleString('pt-BR')}</b>
        </div>
      </div>

      {/* Tabela de datasets disponíveis para exportação. */}
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Fontes disponíveis para exportação
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{linhas.length} fonte(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Fonte de dados</th>
                <th>Descrição</th>
                <th>Escopo</th>
                <th className="num-r">Registros</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const vazio = l.count === 0
                const indisp = l.count == null
                const stCls = indisp ? 'os-aberta' : vazio ? 'os-cancelada' : 'os-fechada'
                const stTxt = indisp ? 'Indisponível' : vazio ? 'Sem registros' : 'Pronta'
                return (
                  <tr key={l.key}>
                    <td>
                      <span className="cli-name" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <i className={`ti ${l.icon}`} style={{ color: 'var(--brand-500)' }} /> {l.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)', maxWidth: 360 }}>{l.desc}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      {l.redeInteira ? 'Rede inteira (fonte externa)' : escopoUnidade ? 'Unidade ativa' : 'Todas as unidades'}
                    </td>
                    <td className="num-r" style={{ fontWeight: 600 }}>
                      {l.count != null ? l.count.toLocaleString('pt-BR') : '—'}
                    </td>
                    <td>
                      <span className={`os-st ${stCls}`}>{stTxt}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crm-note" style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 16, color: 'var(--brand-600)', marginTop: 2 }} />
        <span>
          As contagens são reais (count direto no banco) e respeitam a unidade ativa nas
          fontes que têm vínculo de unidade. Os <b>Leads do site</b> são da rede inteira
          {siteConfigurado() ? ' (integração externa ativa).' : ' (fallback local).'}{' '}
          A geração e o download do CSV acontecem na{' '}
          <Link href="/exportacoes" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>Central de Exportações</Link>.
          Quando passar a existir um registro de exportações (quem exportou, quando, qual
          arquivo), este relatório poderá exibir esse histórico automaticamente.
        </span>
      </div>
    </div>
  )
}
