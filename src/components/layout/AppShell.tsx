'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export type SessionUser = {
  nome: string
  email: string
  iniciais: string
  papel: string
  isAdmin: boolean
}
export type Unidade = { id: string; nome: string }

export function AppShell({
  user, recursos, units, activeUnitId, activeUnitName, children,
}: {
  user: SessionUser
  recursos: string[]
  units: Unidade[]
  activeUnitId: string | null
  activeUnitName: string
  children: React.ReactNode
}) {
  const [mobOpen, setMobOpen] = useState(false)

  return (
    <div className="app">
      <aside className={`sidebar ${mobOpen ? 'mob-open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">
            <div className="brand-mark">L</div>
            <div className="brand-name">
              <div className="t1">Laser&amp;Co</div>
              <div className="t2">Power System</div>
            </div>
          </div>
        </div>
        <Sidebar isAdmin={user.isAdmin} recursos={recursos} onNavigate={() => setMobOpen(false)} />
        <div className="sidebar-foot"><i className="ti ti-settings" /> Configurações &amp; suporte</div>
      </aside>

      <div className={`mob-backdrop ${mobOpen ? 'open' : ''}`} onClick={() => setMobOpen(false)} />

      <div className="main">
        <Topbar
          user={user}
          units={units}
          activeUnitId={activeUnitId}
          activeUnitName={activeUnitName}
          onOpenMenu={() => setMobOpen(true)}
        />
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
