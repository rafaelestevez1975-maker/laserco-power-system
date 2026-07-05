'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  criarCargo,
  alternarAtivoCargo,
  alternarBatePonto,
  excluirCargo,
} from '@/app/(app)/perfis/actions'

export type CargoRow = {
  id: string
  nome: string
  slug: string
  descricao: string | null
  is_sistema: boolean
  ativo: boolean
  atualizado_em: string | null
  bate_ponto?: boolean | null
}

type Props = {
  cargos: CargoRow[]
  sistemaCount: number
  empresaCount: number
  totalUsuariosVinc: number
  permPorCargo: Record<string, number>
  usuariosPorCargo: Record<string, number>
  isAdmin: boolean
  temBatePonto: boolean
}

function fmtData(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // timeZone fixo (BR): senão SSR (UTC) × cliente (BRT) divergem → hydration mismatch (#418).
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

export function PerfisLista({
  cargos, sistemaCount, empresaCount, totalUsuariosVinc,
  permPorCargo, usuariosPorCargo, isAdmin, temBatePonto,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  // Filtros (legado: select Ativo + input Nome). 'sim' = ativos | 'nao' = inativos | 'todos'.
  const [fAtivo, setFAtivo] = useState<'sim' | 'nao' | 'todos'>('sim')
  const [fNome, setFNome] = useState('')
  const [novoAberto, setNovoAberto] = useState(false)

  const filtrados = useMemo(() => {
    const termo = fNome.trim().toLowerCase()
    return cargos.filter((c) => {
      const ativo = c.ativo !== false
      if (fAtivo === 'sim' && !ativo) return false
      if (fAtivo === 'nao' && ativo) return false
      if (termo && !(`${c.nome} ${c.slug} ${c.descricao ?? ''}`.toLowerCase().includes(termo))) return false
      return true
    })
  }, [cargos, fAtivo, fNome])

  const sistema = filtrados.filter((c) => c.is_sistema)
  const empresa = filtrados.filter((c) => !c.is_sistema)

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(label); setMsg(null)
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setMsg({ tipo: 'err', texto: r.error || 'Falha na operação.' }); return }
    setMsg({ tipo: 'ok', texto: okMsg })
    router.refresh()
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-shield-lock" style={{ color: 'var(--brand-500)' }} /> Perfis de acesso
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
            Cada cargo concede permissões por <b>recurso × ação × escopo</b>. Abra um cargo para editar a matriz.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', alignSelf: 'center' }}>
          {!isAdmin && (
            <span className="os-st os-cancelada">
              <i className="ti ti-eye" /> Somente leitura
            </span>
          )}
          {isAdmin && (
            <Link className="btn" href="/perfis/matriz" title="Editar todos os cargos numa matriz única (recurso × ação × cargos)">
              <i className="ti ti-table" /> Matriz
            </Link>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setMsg(null); setNovoAberto(true) }}>
              <i className="ti ti-plus" /> Novo
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="modal-note" style={{
          marginBottom: 14,
          background: msg.tipo === 'ok' ? 'var(--green-bg, #E7F6EC)' : 'var(--red-bg, #FBE9E9)',
          color: msg.tipo === 'ok' ? 'var(--green, #15803D)' : 'var(--red, #B91C1C)',
        }}>
          <i className={`ti ${msg.tipo === 'ok' ? 'ti-circle-check' : 'ti-alert-circle'}`} /> {msg.texto}
        </div>
      )}

      {!temBatePonto && isAdmin && (
        <div className="modal-note" style={{ marginBottom: 14, background: 'var(--amber-bg, #FFF7E6)', color: 'var(--amber, #B45309)' }}>
          <i className="ti ti-info-circle" /> Aplique a migration <b>scripts/migrations/rbac.sql</b> no lkii para habilitar o toggle &quot;Bate ponto&quot;.
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Cargos cadastrados', cargos.length, 'ti-id-badge-2'],
          ['Cargos do sistema', sistemaCount, 'ti-lock'],
          ['Cargos da empresa', empresaCount, 'ti-building'],
          ['Vínculos de usuário', totalUsuariosVinc, 'ti-users'],
        ] as [string, number, string][]).map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      {/* Filtros (legado: select Ativo + input Nome) */}
      <div className="rel-card" style={{ marginBottom: 16, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
            <span>Ativo</span>
            <select value={fAtivo} onChange={(e) => setFAtivo(e.target.value as typeof fAtivo)}
              style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--line)', minWidth: 120 }}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)', flex: '1 1 220px' }}>
            <span>Nome</span>
            <input value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Buscar por nome ou descrição"
              style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--line)' }} />
          </label>
          {(fNome || fAtivo !== 'sim') && (
            <button className="btn btn-ghost" onClick={() => { setFNome(''); setFAtivo('sim') }}>
              <i className="ti ti-x" /> Limpar
            </button>
          )}
        </div>
      </div>

      <Secao titulo="Cargos do sistema" sub="Pré-definidos (RBAC base). Editáveis, exceto Super Admin." icon="ti-lock"
        cargos={sistema} permPorCargo={permPorCargo} usuariosPorCargo={usuariosPorCargo} isAdmin={isAdmin}
        temBatePonto={temBatePonto} busy={busy} run={run} />
      <Secao titulo="Cargos da empresa" sub="Criados/importados por empresa (ex.: BEMP)." icon="ti-building"
        cargos={empresa} permPorCargo={permPorCargo} usuariosPorCargo={usuariosPorCargo} isAdmin={isAdmin}
        temBatePonto={temBatePonto} busy={busy} run={run} />

      {filtrados.length === 0 && (
        <div className="rel-card" style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)' }}>
          <i className="ti ti-mood-empty" style={{ fontSize: 28 }} />
          <p style={{ marginTop: 8 }}>Nenhum perfil corresponde aos filtros.</p>
        </div>
      )}

      {novoAberto && <NovoPerfilModal onClose={() => setNovoAberto(false)} onCreated={() => { setNovoAberto(false); setMsg({ tipo: 'ok', texto: 'Perfil criado.' }); router.refresh() }} />}
    </div>
  )
}

function Secao({
  titulo, sub, icon, cargos, permPorCargo, usuariosPorCargo, isAdmin, temBatePonto, busy, run,
}: {
  titulo: string; sub: string; icon: string
  cargos: CargoRow[]
  permPorCargo: Record<string, number>
  usuariosPorCargo: Record<string, number>
  isAdmin: boolean
  temBatePonto: boolean
  busy: string | null
  run: (label: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => void
}) {
  if (cargos.length === 0) return null
  const ativos = cargos.filter((c) => c.ativo !== false).length
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
        <i className={`ti ${icon}`} style={{ color: 'var(--brand-500)' }} /> {titulo}
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>({cargos.length})</span>
      </h3>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>{sub}</p>
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Cargo</th>
                <th>Descrição</th>
                <th className="num-r">Permissões</th>
                <th className="num-r">Usuários</th>
                <th>Última atualização</th>
                <th>Status</th>
                <th>Bate ponto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargos.map((c) => {
                const nPerm = permPorCargo[c.id] ?? 0
                const nUsr = usuariosPorCargo[c.id] ?? 0
                const protegido = c.slug === 'super_admin'
                const ativo = c.ativo !== false
                const batePonto = c.bate_ponto !== false
                const podeMexer = isAdmin && !protegido
                return (
                  <tr key={c.id} style={{ opacity: ativo ? 1 : 0.55 }}>
                    <td>
                      <span className="cli-name" style={{ fontWeight: 600 }}>
                        {protegido && <i className="ti ti-lock" style={{ color: 'var(--brand-500)', marginRight: 6, verticalAlign: '-2px' }} title="Protegido" />}
                        {c.nome}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{c.slug}</span>
                    </td>
                    <td style={{ maxWidth: 320, fontSize: 12.5, color: 'var(--text-2)' }}>{c.descricao || <span className="muted"></span>}</td>
                    <td className="num-r"><b>{nPerm.toLocaleString('pt-BR')}</b></td>
                    <td className="num-r">
                      <span title={`${nUsr} usuário(s) com este cargo`} style={{ fontWeight: nUsr ? 600 : 400, color: nUsr ? 'var(--text)' : 'var(--text-3)' }}>
                        {nUsr.toLocaleString('pt-BR')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtData(c.atualizado_em)}</td>
                    <td>
                      {ativo
                        ? <span className="os-st os-fechada">Ativo</span>
                        : <span className="os-st os-cancelada">Inativo</span>}
                    </td>
                    <td>
                      {podeMexer && temBatePonto ? (
                        <button
                          className="btn btn-ghost"
                          disabled={busy === `ponto-${c.id}`}
                          title="Define se este perfil bate ponto"
                          onClick={() => run(`ponto-${c.id}`, () => alternarBatePonto(c.id), batePonto ? `${c.nome}: não bate ponto.` : `${c.nome}: bate ponto.`)}
                          style={{ padding: '2px 8px', fontSize: 12, color: batePonto ? 'var(--green, #15803D)' : 'var(--text-3)' }}
                        >
                          <i className={`ti ${batePonto ? 'ti-map-pin-check' : 'ti-map-pin-off'}`} /> {batePonto ? 'Sim' : 'Não'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: batePonto ? 'var(--green, #15803D)' : 'var(--text-3)' }}>
                          <i className={`ti ${batePonto ? 'ti-map-pin-check' : 'ti-map-pin-off'}`} /> {batePonto ? 'Sim' : 'Não'}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <Link className="btn" href={`/perfis/${c.id}`} style={{ marginRight: 8 }}>
                        <i className={`ti ${podeMexer ? 'ti-edit' : 'ti-eye'}`} /> {podeMexer ? 'Editar' : 'Ver'}
                      </Link>
                      {podeMexer && (
                        <>
                          <button
                            className="btn btn-ghost"
                            disabled={busy === `ativo-${c.id}`}
                            onClick={() => run(`ativo-${c.id}`, () => alternarAtivoCargo(c.id), ativo ? `Perfil inativado: ${c.nome}.` : `Perfil reativado: ${c.nome}.`)}
                            style={{ marginRight: 6, color: ativo ? 'var(--amber, #B45309)' : 'var(--green, #15803D)' }}
                          >
                            <i className={`ti ${ativo ? 'ti-ban' : 'ti-rotate-clockwise'}`} /> {ativo ? 'Inativar' : 'Ativar'}
                          </button>
                          {!c.is_sistema && (
                            <button
                              className="btn btn-ghost"
                              disabled={busy === `del-${c.id}`}
                              onClick={() => { if (confirm(`Excluir o perfil de acesso "${c.nome}"?`)) run(`del-${c.id}`, () => excluirCargo(c.id), 'Perfil excluído.') }}
                              style={{ color: 'var(--red, #B91C1C)' }}
                            >
                              <i className="ti ti-trash" /> Excluir
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="cli-foot" style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-3)' }}>
          {cargos.length} registro(s) · {ativos} ativo(s)
        </div>
      </div>
    </section>
  )
}

function NovoPerfilModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [batePonto, setBatePonto] = useState(true)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setErro(null)
    if (nome.trim().length < 2) { setErro('Informe o nome do perfil (mín. 2 caracteres).'); return }
    setBusy(true)
    const r = await criarCargo({ nome: nome.trim(), descricao: descricao.trim() || undefined, ativo, batePonto })
    setBusy(false)
    if (!r.ok) { setErro(r.error || 'Falha ao criar perfil.'); return }
    onCreated()
  }

  return (
    <div role="dialog" aria-modal style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div className="cli-card" style={{ width: 'min(520px, 100%)', padding: 20, background: 'var(--surface, #fff)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <i className="ti ti-shield-plus" style={{ color: 'var(--brand-500)' }} /> Novo perfil de acesso
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
          Crie o perfil e depois abra-o para configurar as permissões (recurso × ação × escopo).
        </p>

        {erro && (
          <div className="modal-note" style={{ marginBottom: 12, background: 'var(--red-bg, #FBE9E9)', color: 'var(--red, #B91C1C)' }}>
            <i className="ti ti-alert-circle" /> {erro}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Nome do perfil *</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus maxLength={80}
            placeholder="Ex.: Consultora de Vendas"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--line)' }} />
        </label>

        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
          <span style={{ display: 'block', marginBottom: 4 }}>Descrição</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200}
            placeholder="Acesso por área…"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--line)' }} />
        </label>

        <div style={{ display: 'flex', gap: 18, marginBottom: 18, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
            <span>Ativo</span>
            <select value={ativo ? 'sim' : 'nao'} onChange={(e) => setAtivo(e.target.value === 'sim')}
              style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--line)' }}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-2)' }}>
            <span>Bate ponto</span>
            <select value={batePonto ? 'sim' : 'nao'} onChange={(e) => setBatePonto(e.target.value === 'sim')}
              style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--line)' }}>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={busy}>
            <i className="ti ti-device-floppy" /> {busy ? 'Criando…' : 'Criar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}
