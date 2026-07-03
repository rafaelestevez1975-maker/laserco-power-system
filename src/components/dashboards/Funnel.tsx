/**
 * Funil de vendas em SVG  réplica do funnelSVG() do legado (legacy/index.html ~4458).
 * Server-safe (sem 'use client'): recebe estágios já calculados e desenha trapézios.
 * Cada estágio: { label, value, display, sub, color }.
 */

export type FunnelStage = {
  label: string
  /** valor numérico que dimensiona a largura do trapézio */
  value: number
  /** texto grande exibido no centro (ex.: "57.541") */
  display: string
  /** subtítulo (ex.: "42% dos agendamentos") */
  sub: string
  /** cor de preenchimento */
  color: string
}

type Props = {
  title: string
  sub?: string
  stages: FunnelStage[]
}

const W = 520
const SEG_H = 78
const GAP = 8
const MAX_W = 460
const MIN_W = 150

export function Funnel({ title, sub, stages }: Props) {
  const max = Math.max(stages[0]?.value ?? 1, 1)
  const wAt = (v: number) => MIN_W + (MAX_W - MIN_W) * (max > 0 ? v / max : 0)

  let y = 0
  const shapes = stages.map((s, i) => {
    const wTop = wAt(s.value)
    const next = stages[i + 1]
    const wBot = next ? wAt(next.value) : wTop * 0.86
    const x1 = (W - wTop) / 2
    const x2 = (W + wTop) / 2
    const x3 = (W + wBot) / 2
    const x4 = (W - wBot) / 2
    const yt = y
    const yb = y + SEG_H
    y += SEG_H + GAP
    return { s, x1, x2, x3, x4, yt, yb }
  })
  const totalH = y

  return (
    <div className="funnel-wrap">
      <h4>
        <i className="ti ti-filter-cog" /> {title}
      </h4>
      {sub && <div className="funnel-sub">{sub}</div>}
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        style={{ maxWidth: 560, display: 'block', margin: '0 auto' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {shapes.map(({ s, x1, x2, x3, x4, yt, yb }, i) => (
          <g key={s.label + i}>
            <polygon
              points={`${x1.toFixed(0)},${yt} ${x2.toFixed(0)},${yt} ${x3.toFixed(0)},${yb} ${x4.toFixed(0)},${yb}`}
              fill={s.color}
              stroke="#fff"
              strokeWidth={2}
            />
            <text x={W / 2} y={yt + SEG_H / 2 - 8} textAnchor="middle" fill="#fff" fontSize={13} fontWeight={700} fontFamily="Inter,sans-serif">
              {s.label}
            </text>
            <text x={W / 2} y={yt + SEG_H / 2 + 11} textAnchor="middle" fill="#fff" fontSize={17} fontWeight={800} fontFamily="'Playfair Display',serif">
              {s.display}
            </text>
            <text x={W / 2} y={yt + SEG_H / 2 + 27} textAnchor="middle" fill="#fff" fontSize={10.5} opacity={0.85} fontFamily="Inter,sans-serif">
              {s.sub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
