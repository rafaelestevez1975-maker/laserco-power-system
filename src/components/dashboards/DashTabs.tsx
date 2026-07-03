import Link from 'next/link'
import { getSessionContext } from '@/lib/session'

/** Abas de navegação entre os dashboards funcionais (dado real do lkii).
 *  `perm` = prefixo de recurso exigido (mesma convenção do menu lateral). */
export const DASH_TABS: { slug: string; label: string; icon: string; perm: string }[] = [
  { slug: 'gerencial', label: 'Gerencial', icon: 'ti-chart-pie', perm: 'comercial.' },
  { slug: 'financeiro', label: 'Financeiro', icon: 'ti-report-money', perm: 'financeiro.' },
  { slug: 'funil', label: 'Funil de Vendas', icon: 'ti-filter-cog', perm: 'comercial.' },
]

/** Monta querystring ignorando valores nulos/undefined (evita "?periodo=undefined"). */
export function dashQuery(sp: Record<string, string | undefined> | undefined): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (v != null && v !== '') out.set(k, v)
  }
  return out.toString()
}

/** Mantém a querystring (período) ao trocar de dashboard. Abas seguem o RBAC do menu:
 *  perfil só-financeiro NÃO vê Gerencial/Funil (feedback 03/07)  admin vê tudo. */
export async function DashTabs({ active, query = '' }: { active: string; query?: string }) {
  const qs = query ? `?${query}` : ''
  const ctx = await getSessionContext() // memoizado por request  sem round-trip extra
  const pode = (perm: string) => !ctx || ctx.isAdmin || ctx.recursos.some((r) => r.startsWith(perm))
  const tabs = DASH_TABS.filter((t) => t.slug === active || pode(t.perm))
  return (
    <div className="rel-tabs">
      {tabs.map((t) => (
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
