/**
 * Dashboards de Vendas (admin) — réplica estrutural do buildDashb()/iframe do legado
 * (legacy/index.html ~4604). O legado embute `vendas-dashboards.html` num <iframe>.
 * Esse HTML externo NÃO faz parte deste app Next; mostramos a moldura fiel + estado honesto.
 * Server-safe (sem 'use client').
 */

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

      <div className="rel-card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '12px 16px' }}>
        <i className="ti ti-flask" /> No legado este painel é um <b>iframe externo</b> (<code>vendas-dashboards.html?pg={cfg.pg}</code>),
        gerado por uma ferramenta de BI fora deste sistema. A moldura abaixo reproduz a estrutura;
        o conteúdo será conectado quando a fonte de BI estiver disponível.
        {/* TODO(legado: buildDashb/vendas): embutir vendas-dashboards.html (pg=geral/mes/comparativo/historico)
            quando o artefato de BI for hospedado e a URL pública existir. */}
      </div>

      <div
        style={{
          height: 'calc(100vh - 250px)',
          minHeight: 480,
          border: '1px solid var(--line)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          background: 'var(--surface)',
          color: 'var(--text-3)',
        }}
      >
        <i className="ti ti-external-link" style={{ fontSize: 38 }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>Painel de BI externo</div>
        <div style={{ fontSize: 12.5 }}>
          Página: <code>{cfg.pg}</code> · fonte: <code>vendas-dashboards.html</code> (não hospedado neste app)
        </div>
      </div>
    </div>
  )
}
