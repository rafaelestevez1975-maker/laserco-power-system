/**
 * KPIs de relatório  réplica do relKpis() do legado (legacy/index.html ~4218).
 * Server-safe (sem 'use client'): só markup, recebe valores já formatados.
 */

export type RelKpi = {
  /** rótulo curto (UPPERCASE no CSS) */
  label: string
  /** valor JÁ formatado (ex.: "R$ 12.944" ou "57.541") */
  value: string
  /** ícone Tabler, ex.: "ti-cash" */
  icon: string
  /** delta opcional (ex.: "+12% vs mês anterior") */
  delta?: string
  /** cor do delta: positivo/negativo/neutro */
  deltaTone?: 'up' | 'down' | 'flat'
}

export function RelKpis({ kpis }: { kpis: RelKpi[] }) {
  return (
    <div className="rel-kpis">
      {kpis.map((k) => (
        <div className="rel-kpi" key={k.label}>
          <div className="rk-ic">
            <i className={`ti ${k.icon}`} />
          </div>
          <div>
            <div className="rk-v">{k.value}</div>
            <div className="rk-l">{k.label}</div>
            {k.delta && (
              <div
                style={{
                  fontSize: 11.5,
                  marginTop: 3,
                  fontWeight: 600,
                  color:
                    k.deltaTone === 'up'
                      ? 'var(--green, #1f9d55)'
                      : k.deltaTone === 'down'
                        ? 'var(--red, #d23b53)'
                        : 'var(--text-3)',
                }}
              >
                {k.delta}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
