import Link from 'next/link'

export type SegOpt = { slug: string; label: string; icon: string }

/**
 * Segment control (3 vias) server-safe — réplica do .seg do legado (renderFunil L4484).
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
  return (
    <div className="seg" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Link
          key={o.slug}
          href={hrefFor(o.slug)}
          className={o.slug === active ? 'on' : ''}
          style={{ textDecoration: 'none' }}
        >
          <i className={`ti ${o.icon}`} /> {o.label}
        </Link>
      ))}
    </div>
  )
}
