'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Barra de abas da Universidade — cada aba é uma ROTA REAL (Link), não useState.
 * Recarregar a página mantém a aba (é a URL). "Gerenciar" só aparece p/ quem pode gerir.
 */
const BASE: { href: string; label: string; icon: string }[] = [
  { href: '/universidade', label: 'Trilhas', icon: 'ti-school' },
  { href: '/universidade/alunos', label: 'Alunos & Notas', icon: 'ti-users' },
  { href: '/universidade/dashboards', label: 'Dashboards', icon: 'ti-chart-bar' },
]

export function UniNav({ podeGerir }: { podeGerir: boolean }) {
  const pathname = usePathname()
  const tabs = podeGerir ? [...BASE, { href: '/universidade/gerenciar', label: 'Gerenciar', icon: 'ti-settings' }] : BASE
  const isActive = (href: string) => (href === '/universidade' ? pathname === '/universidade' : pathname.startsWith(href))

  return (
    <div className="rel-tabs" style={{ marginBottom: 14, display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
      {tabs.map((t) => {
        const active = isActive(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            className="btn"
            style={{
              border: 'none', borderBottom: active ? '2px solid var(--brand-500)' : '2px solid transparent',
              borderRadius: 0, background: 'none', color: active ? 'var(--brand-500)' : 'var(--text-2)',
              fontWeight: active ? 700 : 500, textDecoration: 'none',
            }}
          >
            <i className={`ti ${t.icon}`} /> {t.label}
          </Link>
        )
      })}
    </div>
  )
}
