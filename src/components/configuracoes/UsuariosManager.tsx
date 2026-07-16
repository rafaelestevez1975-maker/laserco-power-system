'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { criarUsuario, trocarCargoUsuario, definirAtivoUsuario, redefinirSenhaUsuario } from '@/app/(app)/configuracoes/usuarios/actions'

export type UsuarioRow = {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  papel: string | null
  cargoId: string | null
  cargoNome: string | null
  unidadeNome: string | null
  ativo: boolean | null
  status: string | null
}
export type CargoOpt = { id: string; nome: string; sistema: boolean }
type Unidade = { id: string; nome: string }

/** Senha forte aleatória (mesma ideia do SAC: fácil de regenerar). */
function gerarSenha(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  const arr = new Uint32Array(12)
  crypto.getRandomValues(arr)
  for (let i = 0; i < 12; i++) s += abc[arr[i] % abc.length]
  return s
}

export function UsuariosManager({ usuarios, cargos, unidades, isAdmin }: {
  usuarios: UsuarioRow[]; cargos: CargoOpt[]; unidades: Unidade[]; isAdmin: boolean
}) {
  const router = useRouter()
  const [novoOpen, setNovoOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [q, setQ] = useState('')
  const [fAtivo, setFAtivo] = useState<'sim' | 'nao' | 'todos'>('sim')

  const filtrados = useMemo(() => usuarios.filter((u) => {
    if (fAtivo === 'sim' && u.ativo === false) return false
    if (fAtivo === 'nao' && u.ativo !== false) return false
    if (q) {
      const t = q.toLowerCase()
      return (u.nome || '').toLowerCase().includes(t) || (u.email || '').toLowerCase().includes(t) || (u.cargoNome || '').toLowerCase().includes(t)
    }
    return true
  }), [usuarios, q, fAtivo])

  const ativos = usuarios.filter((u) => u.ativo !== false).length

  async function toggle(u: UsuarioRow) {
    setBusy(u.id); setMsg(null)
    const r = await definirAtivoUsuario(u.id, u.ativo === false)
    setBusy(null)
    if (!r.ok) setMsg({ tipo: 'erro', texto: r.error || 'Erro.' })
    else { setMsg({ tipo: 'ok', texto: u.ativo === false ? 'Usuário reativado.' : 'Acesso inativado.' }); router.refresh() }
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 19, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-user-cog" style={{ color: 'var(--brand-500)' }} /> Usuários do sistema
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, maxWidth: 720 }}>
            Crie um usuário e escolha o <b>perfil de acesso</b> — ele define o que a pessoa vê e faz no
            sistema (SAC, Universidade, Operação…). Um lugar só para todos os departamentos.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setMsg(null); setNovoOpen(true) }}>
            <i className="ti ti-user-plus" /> Novo usuário
          </button>
        )}
      </div>

      {msg && (
        <div className="modal-note" style={{ margin: '10px 0', background: msg.tipo === 'ok' ? '#E7F6EC' : '#FBE9E9', color: msg.tipo === 'ok' ? '#15803D' : '#B91C1C', padding: '9px 13px', borderRadius: 8, fontSize: 13 }}>
          <i className={`ti ${msg.tipo === 'ok' ? 'ti-circle-check' : 'ti-alert-circle'}`} /> {msg.texto}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '14px 0 16px' }}>
        <div className="metric-box"><span>Usuários</span><b>{usuarios.length.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Ativos</span><b style={{ color: 'var(--green)' }}>{ativos.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Perfis de acesso</span><b>{cargos.length.toLocaleString('pt-BR')}</b></div>
      </div>

      {/* Filtros */}
      <div className="rel-card" style={{ marginBottom: 14, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)', flex: '1 1 240px' }}>
          <span>Buscar</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, e-mail ou perfil de acesso" style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
          <span>Status</span>
          <select value={fAtivo} onChange={(e) => setFAtivo(e.target.value as typeof fAtivo)} style={{ padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)' }}>
            <option value="sim">Ativos</option>
            <option value="nao">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-users" /> {filtrados.length} usuário(s)
      </div>

      {/* Tabela */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil de acesso</th>
                <th>Unidade</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', padding: 34, color: 'var(--text-3)' }}>
                  <i className="ti ti-user-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} /> Nenhum usuário.
                </td></tr>
              )}
              {filtrados.map((u) => (
                <tr key={u.id} style={{ opacity: u.ativo === false ? 0.55 : 1 }}>
                  <td><span className="cli-name">{u.nome || '(sem nome)'}</span></td>
                  <td style={{ fontSize: 12.5 }}>{u.email || <span className="muted"></span>}</td>
                  <td>
                    {isAdmin
                      ? <SelectCargo u={u} cargos={cargos} onDone={(m) => { setMsg(m); router.refresh() }} />
                      : (u.cargoNome ? <span className="orig-tag">{u.cargoNome}</span> : <span className="muted">—</span>)}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{u.unidadeNome || <span className="muted">Rede</span>}</td>
                  <td>{u.ativo === false ? <span className="os-st os-cancelada">Inativo</span> : <span className="os-st os-fechada">Ativo</span>}</td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <ResetSenha u={u} onDone={(m) => setMsg(m)} />
                      <button className="btn" disabled={busy === u.id} onClick={() => toggle(u)} title={u.ativo === false ? 'Reativar' : 'Inativar'}
                        style={{ color: u.ativo === false ? 'var(--green)' : 'var(--red)', marginLeft: 6 }}>
                        {busy === u.id ? '…' : <i className={`ti ${u.ativo === false ? 'ti-rotate-clockwise' : 'ti-ban'}`} />}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {novoOpen && (
        <NovoUsuarioModal cargos={cargos} unidades={unidades}
          onClose={() => setNovoOpen(false)}
          onCriado={() => { setNovoOpen(false); setMsg({ tipo: 'ok', texto: 'Usuário criado. Ele já pode entrar com o e-mail e a senha.' }); router.refresh() }} />
      )}
    </div>
  )
}

/** Troca de perfil de acesso inline (na própria linha). */
function SelectCargo({ u, cargos, onDone }: { u: UsuarioRow; cargos: CargoOpt[]; onDone: (m: { tipo: 'ok' | 'erro'; texto: string }) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <select value={u.cargoId ?? ''} disabled={busy}
      onChange={async (e) => {
        const cid = e.target.value; if (!cid || cid === u.cargoId) return
        setBusy(true)
        const r = await trocarCargoUsuario(u.id, cid)
        setBusy(false)
        onDone(r.ok ? { tipo: 'ok', texto: 'Perfil de acesso atualizado.' } : { tipo: 'erro', texto: r.error || 'Erro.' })
      }}
      style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12.5, maxWidth: 220 }}>
      <option value="">— sem perfil —</option>
      {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.sistema ? ' (sistema)' : ''}</option>)}
    </select>
  )
}

function ResetSenha({ u, onDone }: { u: UsuarioRow; onDone: (m: { tipo: 'ok' | 'erro'; texto: string }) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <button className="btn" disabled={busy} title="Redefinir senha"
      onClick={async () => {
        const nova = gerarSenha()
        if (!window.confirm(`Redefinir a senha de ${u.nome}?\n\nNova senha: ${nova}\n\nAnote e envie ao usuário. Ele poderá trocá-la depois.`)) return
        setBusy(true)
        const r = await redefinirSenhaUsuario(u.id, nova)
        setBusy(false)
        onDone(r.ok ? { tipo: 'ok', texto: `Senha redefinida para ${u.nome}: ${nova}` } : { tipo: 'erro', texto: r.error || 'Erro.' })
      }}>
      {busy ? '…' : <i className="ti ti-key" />}
    </button>
  )
}

function NovoUsuarioModal({ cargos, unidades, onClose, onCriado }: {
  cargos: CargoOpt[]; unidades: Unidade[]; onClose: () => void; onCriado: () => void
}) {
  const [f, setF] = useState({ nome: '', email: '', senha: gerarSenha(), telefone: '', cargoId: '', unidadeId: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))

  async function salvar() {
    setErr('')
    if (!f.nome.trim()) return setErr('Informe o nome.')
    if (!f.email.trim()) return setErr('Informe o e-mail.')
    if (!f.cargoId) return setErr('Escolha o perfil de acesso.')
    setBusy(true)
    const r = await criarUsuario({ nome: f.nome, email: f.email, senha: f.senha, telefone: f.telefone, cargoId: f.cargoId, unidadeId: f.unidadeId || null })
    setBusy(false)
    if (!r.ok) return setErr(r.error || 'Não foi possível criar.')
    onCriado()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }
  const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 4 }

  return (
    <div className="modal-back" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div className="modal" style={{ background: 'var(--surface,#fff)', borderRadius: 14, width: 'min(560px,100%)', maxHeight: '92vh', overflow: 'auto', padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}><i className="ti ti-user-plus" style={{ color: 'var(--brand-500)' }} /> Novo usuário</h3>
          <button className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={lbl}>Nome completo *</label>
            <input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus placeholder="Ex.: Maria Souza" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>E-mail (login) *</label>
              <input style={inp} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="maria@lasercompany.com" />
            </div>
            <div>
              <label style={lbl}>Telefone</label>
              <input style={inp} value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="(11) 90000-0000" />
            </div>
          </div>
          <div>
            <label style={lbl}>Perfil de acesso * <span style={{ color: 'var(--text-3)' }}>— define o que ele acessa</span></label>
            <select style={inp} value={f.cargoId} onChange={(e) => set('cargoId', e.target.value)}>
              <option value="">Selecione…</option>
              <optgroup label="Perfis da operação">
                {cargos.filter((c) => !c.sistema).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
              <optgroup label="Perfis internos (sistema)">
                {cargos.filter((c) => c.sistema).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label style={lbl}>Unidade <span style={{ color: 'var(--text-3)' }}>— deixe em branco para acesso à rede</span></label>
            <select style={inp} value={f.unidadeId} onChange={(e) => set('unidadeId', e.target.value)}>
              <option value="">Rede (todas as unidades)</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Senha inicial</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inp, fontFamily: 'monospace' }} value={f.senha} onChange={(e) => set('senha', e.target.value)} />
              <button className="btn" type="button" onClick={() => set('senha', gerarSenha())} title="Gerar outra"><i className="ti ti-refresh" /></button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Anote e envie ao usuário. Ele entra com o e-mail e esta senha.</span>
          </div>
        </div>

        {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}><i className="ti ti-alert-circle" /> {err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={busy}>{busy ? 'Criando…' : 'Criar usuário'}</button>
        </div>
      </div>
    </div>
  )
}
