'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MENU, isGroup, ehFuncional, type Badge, type Group, type Item, type Leaf } from '@/lib/menu'

function leafActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')
}

/** Usuário tem o recurso exigido? Sufixo '.' = prefixo (qualquer recurso do módulo). */
function hasPerm(perm: string, recursos: string[]) {
  return perm.endsWith('.') ? recursos.some((r) => r.startsWith(perm)) : recursos.includes(perm)
}

/** Regra de visibilidade: admin_geral vê tudo; senão, exige o recurso (ou nenhum = visível). */
function canSee(item: Item, isAdmin: boolean, recursos: string[]) {
  if (isAdmin) return true
  if (item.perm) return hasPerm(item.perm, recursos)
  if ('admin' in item && item.admin) return false // admin-only sem recurso mapeado
  return true
}

function BadgeTag({ badge }: { badge: Badge }) {
  const admin = badge === 'ADMIN'
  return (
    <span className="badge" style={admin ? { background: 'var(--brand-500)', color: '#fff' } : undefined}>
      {badge}
    </span>
  )
}

export function Sidebar({
  isAdmin, recursos, onNavigate,
}: { isAdmin: boolean; recursos: string[]; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="nav">
      {MENU.map((section, si) => {
        const items = section.items.filter((i) => canSee(i, isAdmin, recursos))
        if (items.length === 0) return null
        return (
          <div key={si}>
            <div className="nav-section">{section.title}</div>
            {items.map((item) =>
              isGroup(item) ? (
                <GroupEntry key={item.key} group={item} pathname={pathname} isAdmin={isAdmin} recursos={recursos} onNavigate={onNavigate} />
              ) : (
                <LeafLink key={item.href} leaf={item} pathname={pathname} onNavigate={onNavigate} />
              ),
            )}
          </div>
        )
      })}
    </nav>
  )
}

function LeafLink({ leaf, pathname, onNavigate }: { leaf: Leaf; pathname: string; onNavigate?: () => void }) {
  const func = ehFuncional(leaf.href)
  return (
    <Link href={leaf.href} prefetch={false} onClick={onNavigate} className={`nav-item ${leafActive(leaf.href, pathname) ? 'active' : ''} ${func ? '' : 'inativo'}`}>
      <i className={`ti ${leaf.icon} lead`} />
      {leaf.label}
      {func ? (leaf.badge && <BadgeTag badge={leaf.badge} />) : <span className="em-breve">prévia</span>}
    </Link>
  )
}

function GroupEntry({
  group, pathname, isAdmin, recursos, onNavigate,
}: { group: Group; pathname: string; isAdmin: boolean; recursos: string[]; onNavigate?: () => void }) {
  const children = group.children.filter((c) => canSee(c, isAdmin, recursos))
  const childActive = children.some((c) => leafActive(c.href, pathname))
  const grupoFunc = children.some((c) => ehFuncional(c.href)) // grupo "aceso" se tiver ao menos 1 filho funcional
  const [open, setOpen] = useState(childActive)
  if (children.length === 0) return null

  return (
    <>
      <div className={`nav-item ${open ? 'open' : ''} ${grupoFunc ? '' : 'inativo'}`} onClick={() => setOpen((v) => !v)}>
        <i className={`ti ${group.icon} lead`} />
        {group.label}
        {group.badge && <BadgeTag badge={group.badge} />}
        <i className="ti ti-chevron-right chev" />
      </div>
      <div className={`submenu ${open ? 'open' : ''}`}>
        {children.map((c) => {
          const func = ehFuncional(c.href)
          return (
            <Link key={c.href} href={c.href} prefetch={false} onClick={onNavigate} className={`sub-item ${leafActive(c.href, pathname) ? 'active' : ''} ${func ? '' : 'inativo'}`}>
              <i className={`ti ${c.icon}`} />
              {c.label}
              {func ? (c.badge && <BadgeTag badge={c.badge} />) : <span className="em-breve">prévia</span>}
            </Link>
          )
        })}
      </div>
    </>
  )
}
