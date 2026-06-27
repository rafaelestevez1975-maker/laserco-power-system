import Link from 'next/link'

/** Abas de navegação entre os dashboards funcionais (dado real do lkii). */
export const DASH_TABS: { slug: string; label: string; icon: string }[] = [
  { slug: 'gerencial', label: 'Gerencial', icon: 'ti-chart-pie' },
  { slug: 'financeiro', label: 'Financeiro', icon: 'ti-report-money' },
  { slug: 'funil', label: 'Funil de Vendas', icon: 'ti-filter-cog' },
]

/** Monta querystring ignorando valores nulos/undefined (evita "?periodo=undefined"). */
export function dashQuery(sp: Record<string, string | undefined> | undefined): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (v != null && v !== '') out.set(k, v)
  }
  return out.toString()
}

/** Mantém a querystring (período) ao trocar de dashboard. */
export function DashTabs({ active, query = '' }: { active: string; query?: string }) {
  const qs = query ? `?${query}` : ''
  return (
    <div className="rel-tabs">
      {DASH_TABS.map((t) => (
        <Link
          key={t.slug}
          href={`/dashboards/${t.slug}${qs}`}
          className={`rel-tab${t.slug === active ? ' active' : ''}`}
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <i className={`ti ${t.icon}`} /> {t.label}
        </Link>
      ))}
    </div>
  )
}
