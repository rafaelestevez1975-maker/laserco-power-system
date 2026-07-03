import Link from 'next/link'

export type SegOpt = { slug: string; label: string; icon: string }

/**
 * Segment control (3 vias) server-safe  réplica do .seg do legado (renderFunil L4484).
 * Cada botão é um Link que troca ?<param>= mantendo o resto da querystring.
 */
export function SegToggle({
  options,
  active,
  param,
  query,
  basePath,
}: {
  options: SegOpt[]
  active: string
  param: string
  query: Record<string, string | undefined>
  basePath: string
}) {
  function hrefFor(slug: string): string {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (k === param) continue
      if (v != null && v !== '') sp.set(k, v)
    }
    if (slug) sp.set(param, slug)
    const qs = sp.toString()
    return `${basePath}${qs ? `?${qs}` : ''}`
  }
  // .seg estiliza <button>; aqui usamos <Link> (anchor) → replicamos inline o visual on/off.
  return (
    <div className="seg" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', padding: 3 }}>
      {options.map((o) => {
        const on = o.slug === active
        return (
          <Link
            key={o.slug}
            href={hrefFor(o.slug)}
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 16px',
              borderRadius: 8,
              color: on ? 'var(--brand-500)' : 'var(--text-2)',
              background: on ? '#fff' : 'transparent',
              boxShadow: on ? '0 1px 4px rgba(46,26,71,.12)' : 'none',
            }}
          >
            <i className={`ti ${o.icon}`} /> {o.label}
          </Link>
        )
      })}
    </div>
  )
}
