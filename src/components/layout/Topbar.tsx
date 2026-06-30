'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { titleFor } from '@/lib/menu'
import { NotificacoesSino } from './NotificacoesSino'
import { definirPresencaSac } from '@/app/(app)/sac/atendentes/actions'
import type { SessionUser, Unidade } from './AppShell'

export function Topbar({
  user, units, activeUnitId, activeUnitName, onOpenMenu,
}: {
  user: SessionUser
  units: Unidade[]
  activeUnitId: string | null
  activeUnitName: string
  onOpenMenu: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { icon, title } = titleFor(pathname)
  const [userOpen, setUserOpen] = useState(false)
  const [unitOpen, setUnitOpen] = useState(false)
  const [online, setOnline] = useState(!!user.sacOnline)
  const [presBusy, setPresBusy] = useState(false)

  async function logout() {
    const sb = createClient()
    await sb.auth.signOut()
    window.location.href = '/login'
  }

  // Toggle de presença SAC: online recebe conversas automaticamente, offline não.
  async function togglePresenca(e: React.MouseEvent) {
    e.stopPropagation()
    setPresBusy(true)
    const novo = !online
    const r = await definirPresencaSac(novo)
    setPresBusy(false)
    if (r.ok) { setOnline(novo); router.refresh() }
  }

  function selectUnit(id: string | null) {
    document.cookie = `lc_unit=${id ?? ''};path=/;max-age=${id ? 31536000 : 0}`
    window.location.reload()
  }

  return (
    <header className="topbar">
      <button className="icon-btn mob-menu" onClick={onOpenMenu} title="Menu"><i className="ti ti-menu-2" /></button>

      <div className="page-title"><i className={`ti ${icon}`} /> {title}</div>

      <div className="gsearch">
        <i className="ti ti-search" />
        <input placeholder="Buscar clientes, OS, chamados, comunicados…" autoComplete="off" />
      </div>

      <div className="topbar-spacer" />

      <div className="role-wrap">
        <div className="role-pill" style={{ cursor: 'default' }}>
          <i className="ti ti-user-shield" /> <span style={{ textTransform: 'capitalize' }}>{user.papel.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Seletor de unidade ativa — escondido no SAC (centralizado na franqueadora, sem franquia) */}
      {user.papel !== 'sac' && (
      <div className="unit-wrap" style={{ position: 'relative' }}>
        <div className="unit-pill" onClick={() => setUnitOpen((v) => !v)}>
          <i className="ti ti-building-store" /> <span>{activeUnitName}</span> <i className="ti ti-chevron-down" />
        </div>
        {unitOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setUnitOpen(false)} />
            <div className="unit-dd" style={{ display: 'block', zIndex: 50 }}>
              <div className="dd-head">Unidades da rede ({units.length})</div>
              {user.isAdmin && (
                <div className={`unit-opt ${!activeUnitId ? 'active' : ''}`} onClick={() => selectUnit(null)}>
                  <i className="ti ti-building-store" /> Todas as unidades
                </div>
              )}
              {units.map((u) => (
                <div key={u.id} className={`unit-opt ${u.id === activeUnitId ? 'active' : ''}`} onClick={() => selectUnit(u.id)}>
                  <i className="ti ti-building-store" /> {u.nome}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      )}

      <NotificacoesSino />

      <div className="user" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setUserOpen((v) => !v)}>
        <div className="avatar" style={{ position: 'relative' }}>{user.iniciais}
          {user.papel === 'sac' && <span title={online ? 'Online' : 'Offline'} style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: online ? 'var(--green)' : 'var(--text-3)', border: '2px solid var(--surface)' }} />}
        </div>
        <div>
          <div className="uname">{user.nome}</div>
          <div className="urole" style={{ textTransform: 'capitalize' }}>{user.papel.replace('_', ' ')}</div>
        </div>
        {userOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setUserOpen(false)} />
            <div className="role-dd" style={{ display: 'block', right: 0, top: 'calc(100% + 6px)', zIndex: 50 }}>
              <div className="dd-head">{user.email}</div>
              {user.papel === 'sac' && (
                <div className="role-opt" onClick={togglePresenca} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span><i className="ti ti-circle-filled" style={{ color: online ? 'var(--green)' : 'var(--text-3)', fontSize: 10 }} /> {online ? 'Online' : 'Offline'} — atendimento</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-600)' }}>{presBusy ? '…' : (online ? 'Ficar offline' : 'Ficar online')}</span>
                </div>
              )}
              <div className="role-opt" style={{ color: 'var(--red)' }} onClick={logout}>
                <i className="ti ti-logout" style={{ color: 'var(--red)' }} /> Sair
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
