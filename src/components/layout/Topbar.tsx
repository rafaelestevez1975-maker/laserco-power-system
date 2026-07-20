'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { titleFor } from '@/lib/menu'
import { NotificacoesSino } from './NotificacoesSino'
import { definirPresencaSac } from '@/app/(app)/sac/atendentes/actions'
import type { SessionUser, Unidade } from './AppShell'

export function Topbar({
  user, units, activeUnitId, activeUnitName, podeVender = false, onOpenMenu,
}: {
  user: SessionUser
  units: Unidade[]
  activeUnitId: string | null
  activeUnitName: string
  podeVender?: boolean
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

      {/* Nova Venda mora aqui (saiu do menu lateral em 17/07): abre o PDV. */}
      {podeVender && (
        <Link href="/pdv" className="btn btn-primary" style={{ padding: '7px 14px', textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Abrir o PDV e registrar uma venda">
          <i className="ti ti-shopping-cart" /> <span className="hidden-xs">Nova Venda</span>
        </Link>
      )}

      <div className="role-wrap">
        <div className="role-pill" style={{ cursor: 'default' }}>
          <i className="ti ti-user-shield" /> <span style={{ textTransform: 'capitalize' }}>{user.papel.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Seletor de unidade: some p/ quem tem uma loja só (o franqueado continua vendo apenas
          a sua, motivo da remoção em 03/07) e volta para admin/franqueadora, que precisa
          filtrar entre as unidades. Grava o cookie lc_unit → activeUnitId em getSessionContext. */}
      {units.length > 1 && (
        <div className="role-wrap" style={{ position: 'relative' }}>
          <div className="role-pill" onClick={() => setUnitOpen((v) => !v)} style={{ cursor: 'pointer' }} title="Filtrar por unidade">
            <i className="ti ti-building-store" />
            <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeUnitName}</span>
            <i className="ti ti-chevron-down" style={{ fontSize: 13 }} />
          </div>
          {unitOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setUnitOpen(false)} />
              <div className="role-dd" style={{ display: 'block', right: 0, top: 'calc(100% + 6px)', zIndex: 50, maxHeight: 380, overflowY: 'auto', minWidth: 240 }}>
                <div className="dd-head">Filtrar por unidade</div>
                <div className="role-opt" onClick={() => selectUnit(null)} style={{ fontWeight: activeUnitId ? 400 : 700 }}>
                  <i className="ti ti-world" /> Todas as unidades
                </div>
                {units.map((u) => (
                  <div key={u.id} className="role-opt" onClick={() => selectUnit(u.id)} style={{ fontWeight: activeUnitId === u.id ? 700 : 400 }}>
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
                  <span><i className="ti ti-circle-filled" style={{ color: online ? 'var(--green)' : 'var(--text-3)', fontSize: 10 }} /> {online ? 'Online' : 'Offline'}  atendimento</span>
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
