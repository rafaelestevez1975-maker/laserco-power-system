'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { atribuirCargoUsuario, removerCargoUsuario } from '@/app/(app)/perfis/actions'

export type VinculoRow = {
  perfilId: string
  nome: string
  email: string | null
  ativo: boolean
  expiraEm: string | null
}
export type UsuarioOpcao = { id: string; nome: string; email: string | null }

type Props = {
  cargoId: string
  vinculos: VinculoRow[]
  opcoes: UsuarioOpcao[]
  podeEditar: boolean
}

/** Gestão dos vínculos usuário↔cargo (usuario_cargos): atribuir / remover. */
export function VinculosUsuario({ cargoId, vinculos, opcoes, podeEditar }: Props) {
  const router = useRouter()
  const [sel, setSel] = useState('')
  const [busca, setBusca] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)

  const opcoesFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return opcoes.slice(0, 50)
    return opcoes.filter((o) => `${o.nome} ${o.email ?? ''}`.toLowerCase().includes(t)).slice(0, 50)
  }, [opcoes, busca])

  async function atribuir() {
    if (!sel) { setMsg({ tipo: 'err', texto: 'Selecione um usuário.' }); return }
    setBusy('add'); setMsg(null)
    const r = await atribuirCargoUsuario({ cargoId, perfilId: sel })
    setBusy(null)
    if (!r.ok) { setMsg({ tipo: 'err', texto: r.error || 'Falha ao atribuir.' }); return }
    setSel(''); setBusca('')
    setMsg({ tipo: 'ok', texto: 'Perfil atribuído ao usuário.' })
    router.refresh()
  }

  async function remover(perfilId: string, nome: string) {
    if (!confirm(`Remover o perfil de "${nome}"?`)) return
    setBusy(`del-${perfilId}`); setMsg(null)
    const r = await removerCargoUsuario({ cargoId, perfilId })
    setBusy(null)
    if (!r.ok) { setMsg({ tipo: 'err', texto: r.error || 'Falha ao remover.' }); return }
    setMsg({ tipo: 'ok', texto: 'Vínculo removido.' })
    router.refresh()
  }

  return (
    <div className="rel-card" style={{ marginBottom: 18, padding: 16 }}>
      <h3 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <i className="ti ti-users" style={{ color: 'var(--brand-500)' }} /> Usuários com este perfil
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>({vinculos.length})</span>
      </h3>

      {msg && (
        <div className="modal-note" style={{
          marginBottom: 12,
          background: msg.tipo === 'ok' ? 'var(--green-bg, #E7F6EC)' : 'var(--red-bg, #FBE9E9)',
          color: msg.tipo === 'ok' ? 'var(--green, #15803D)' : 'var(--red, #B91C1C)',
        }}>
          <i className={`ti ${msg.tipo === 'ok' ? 'ti-circle-check' : 'ti-alert-circle'}`} /> {msg.texto}
        </div>
      )}

      {podeEditar && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--text-2)', flex: '1 1 200px' }}>
            <span style={{ display: 'block', marginBottom: 4 }}>Buscar usuário</span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou e-mail"
              style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }} />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-2)', flex: '1 1 220px' }}>
            <span style={{ display: 'block', marginBottom: 4 }}>Usuário</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)}
              style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }}>
              <option value="">Selecione…</option>
              {opcoesFiltradas.map((o) => (
                <option key={o.id} value={o.id}>{o.nome}{o.email ? ` · ${o.email}` : ''}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={atribuir} disabled={busy === 'add' || !sel}>
            <i className="ti ti-user-plus" /> {busy === 'add' ? 'Atribuindo…' : 'Atribuir'}
          </button>
        </div>
      )}

      {vinculos.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          <i className="ti ti-info-circle" /> Nenhum usuário com este perfil.
        </p>
      ) : (
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Status</th>
                {podeEditar && <th />}
              </tr>
            </thead>
            <tbody>
              {vinculos.map((v) => (
                <tr key={v.perfilId} style={{ opacity: v.ativo ? 1 : 0.55 }}>
                  <td className="cli-name" style={{ fontWeight: 600 }}>{v.nome}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{v.email || <span className="muted">—</span>}</td>
                  <td>
                    {v.ativo
                      ? <span className="os-st os-fechada">Ativo</span>
                      : <span className="os-st os-cancelada">Inativo</span>}
                  </td>
                  {podeEditar && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost" disabled={busy === `del-${v.perfilId}`}
                        onClick={() => remover(v.perfilId, v.nome)} style={{ color: 'var(--red, #B91C1C)' }}>
                        <i className="ti ti-user-minus" /> Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
