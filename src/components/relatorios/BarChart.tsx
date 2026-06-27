/**
 * Gráfico de barras CSS puro — réplica do barChart()/dashWidget() do legado
 * (legacy/index.html ~4440/4444). Server-safe (sem 'use client').
 * Cada barra: [label, valorNumérico, displayOpcional].
 */
import { moedaBR } from '@/lib/fmt'

export type BarRow = {
  label: string
  /** valor numérico para dimensionar a barra */
  value: number
  /** texto exibido à direita (default: value formatado) */
  display?: string
}

type Props = {
  title: string
  icon?: string
  rows: BarRow[]
  /** barras douradas (g) — usado para valores R$ no legado */
  gold?: boolean
  /** formata o display como moeda quando display não vier */
  asMoeda?: boolean
  /** mensagem quando não há linhas */
  emptyMsg?: string
}

export function BarChart({ title, icon = 'ti-chart-bar', rows, gold = false, asMoeda = false, emptyMsg = 'Sem dados no período.' }: Props) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div className="dash-w">
      <h4>
        <i className={`ti ${icon}`} /> {title}
      </h4>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '8px 0' }}>{emptyMsg}</div>
      ) : (
        rows.map((r) => {
          const disp = r.display ?? (asMoeda ? moedaBR(r.value) : r.value.toLocaleString('pt-BR'))
          return (
            <div className="bar-row" key={r.label}>
              <span className="bar-lbl" title={r.label}>
                {r.label}
              </span>
              <div className="bar-track">
                <div className={`bar-fill${gold ? ' g' : ''}`} style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
              </div>
              <span className="bar-val">{disp}</span>
            </div>
          )
        })
      )}
    </div>
  )
}
