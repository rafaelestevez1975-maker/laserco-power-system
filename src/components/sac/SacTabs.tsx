'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Barra de abas do SAC  paridade 1:1 com o legado (index.html: SAC_PAGES 8963 + sacTabsBar 8966).
 *  Mesma ordem, rótulos, ícones e classes (.sac-tabs / .sac-tab / .sac-tab.on). A aba ativa é
 *  derivada da rota atual. No legado a chave 'premiacao' aponta para a aba "Ranking" → /sac/ranking.
 *  prefetch={false} para não recriar a tempestade de prefetch do sidebar (ver lentidao-modo-dev). */
const SAC_TABS: { href: string; label: string; icon: string }[] = [
  { href: '/sac', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { href: '/sac/chamados', label: 'Chamados', icon: 'ti-headset' },
  { href: '/sac/kanban', label: 'Kanban', icon: 'ti-layout-kanban' },
  { href: '/sac/triagem', label: 'Triagem WhatsApp', icon: 'ti-brand-whatsapp' },
  { href: '/sac/relatorios', label: 'Relatórios', icon: 'ti-chart-bar' },
  { href: '/sac/atendentes', label: 'Atendentes', icon: 'ti-users' },
  { href: '/sac/ranking', label: 'Ranking', icon: 'ti-trophy' },
  { href: '/sac/importar', label: 'Importar Leads', icon: 'ti-file-import' },
  { href: '/sac/config', label: 'Configurações', icon: 'ti-settings' },
  { href: '/sac/pagamentos', label: 'Pagamentos', icon: 'ti-cash' },
]

export function SacTabs() {
  const pathname = usePathname()
  const ativo = (href: string) =>
    href === '/sac' ? pathname === '/sac' : pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="sac-tabs">
      {SAC_TABS.map((t) => (
        <Link key={t.href} href={t.href} prefetch={false} className={`sac-tab${ativo(t.href) ? ' on' : ''}`}>
          <i className={`ti ${t.icon}`} /> {t.label}
        </Link>
      ))}
    </div>
  )
}
