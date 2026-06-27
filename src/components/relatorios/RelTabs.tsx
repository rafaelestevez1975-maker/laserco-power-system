import Link from 'next/link'

/** Abas de navegação entre os relatórios funcionais (dado real). */
export const REL_TABS: { slug: string; label: string; icon: string }[] = [
  { slug: 'faturamento', label: 'Faturamento', icon: 'ti-cash' },
  { slug: 'financeiro', label: 'Financeiro (DRE)', icon: 'ti-report-money' },
  { slug: 'agendamentos', label: 'Agendamentos', icon: 'ti-calendar-stats' },
  { slug: 'clientes', label: 'Clientes', icon: 'ti-users' },
]

/** Monta querystring ignorando valores nulos/undefined (evita "?periodo=undefined"). */
export function relQuery(sp: Record<string, string | undefined> | undefined): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (v != null && v !== '') out.set(k, v)
  }
  return out.toString()
}

/** Mantém a querystring (período) ao trocar de aba. */
export function RelTabs({ active, query = '' }: { active: string; query?: string }) {
  const qs = query ? `?${query}` : ''
  return (
    <div className="rel-tabs">
      {REL_TABS.map((t) => (
        <Link key={t.slug} href={`/relatorios/${t.slug}${qs}`} className={`rel-tab${t.slug === active ? ' active' : ''}`} style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className={`ti ${t.icon}`} /> {t.label}
        </Link>
      ))}
    </div>
  )
}
