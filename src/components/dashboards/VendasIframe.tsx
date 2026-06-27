/**
 * Dashboards de Vendas (admin) — réplica do buildDashb()/iframe do legado
 * (legacy/index.html ~4604). Embute `vendas-dashboards.html` (hospedado em public/)
 * via <iframe> com showPage(pg), botões Atualizar e Abrir em nova aba (VendasFrame).
 * Server-safe (a interatividade do iframe está no client VendasFrame).
 */
import { VendasFrame } from '@/components/dashboards/VendasFrame'

export const VENDAS_PAGES: Record<string, { titulo: string; sub: string; pg: string }> = {
  'vendas-geral': { titulo: 'Vendas · Visão Geral', sub: 'Panorama consolidado de vendas da rede', pg: 'geral' },
  'vendas-mes': { titulo: 'Vendas · Mês Atual', sub: 'Desempenho do mês corrente', pg: 'mes' },
  'vendas-comparativo': { titulo: 'Vendas · Comparativo', sub: 'Comparação entre períodos e unidades', pg: 'comparativo' },
  'vendas-historico': { titulo: 'Vendas · Histórico', sub: 'Série histórica de vendas', pg: 'historico' },
}

export function VendasIframe({ slug, podeVer }: { slug: string; podeVer: boolean }) {
  const cfg = VENDAS_PAGES[slug] ?? VENDAS_PAGES['vendas-geral']

  if (!podeVer) {
    return (
      <div className="view active">
        <div className="rel-card" style={{ textAlign: 'center', padding: 40 }}>
          <i className="ti ti-lock" style={{ fontSize: 34, color: 'var(--text-3)' }} />
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '12px 0 6px' }}>Acesso restrito</h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
            Os dashboards de Vendas são exclusivos da administração da franqueadora.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{cfg.titulo}</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{cfg.sub}</span>
        <span className="os-st os-aberta" style={{ marginLeft: 4 }}>ADMIN</span>
      </div>

      <VendasFrame pg={cfg.pg} />
    </div>
  )
}
