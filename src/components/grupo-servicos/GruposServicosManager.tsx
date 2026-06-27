'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarGrupo, renomearGrupo, toggleGrupoAtivo } from '@/app/(app)/cadastros/grupo-servicos/actions'

export type GrupoRow = {
  id: string
  nome: string | null
  ativo: boolean | null
  servicos: number // nº de serviços nesse grupo (count)
}

type Props = {
  grupos: GrupoRow[]
  podeEscrever: boolean
  vazio: boolean
}

export function GruposServicosManager({ grupos, podeEscrever, vazio }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  async function salvarNovo() {
    if (!novoNome.trim()) { setMsg('Informe o nome do grupo.'); return }
    setBusy('novo'); setMsg('')
    const r = await criarGrupo(novoNome.trim())
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro ao criar grupo.'); return }
    setNovoOpen(false); setNovoNome(''); router.refresh()
  }

  async function salvarEdicao(g: GrupoRow) {
    if (!editNome.trim()) { setMsg('Informe o novo nome.'); return }
    setBusy(g.id); setMsg('')
    const r = await renomearGrupo(g.id, g.nome || '', editNome.trim())
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro ao renomear.'); return }
    setEditId(null); router.refresh()
  }

  async function toggle(g: GrupoRow) {
    setBusy(g.id); setMsg('')
    const r = await toggleGrupoAtivo(g.id, g.ativo === false)
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro ao alterar.'); return }
    router.refresh()
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-list-details" /> Grupos de serviços da rede — organizam o catálogo (Depilação, Estético,
        Ultrassom…). Renomear um grupo atualiza todos os serviços vinculados.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Novo grupo de serviços
          </button>
        )}
      </div>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 8px' }}>{msg}</div>}

      {vazio ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-database-off" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Nenhum grupo de serviços</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            Aplique a migration <code>scripts/migrations/catalogo.sql</code> no lkii para criar a tabela e o seed dos
            grupos, ou use o botão acima para cadastrar o primeiro.
          </p>
        </div>
      ) : (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th className="num-r">Serviços</th>
                  <th>Ativo</th>
                  {podeEscrever && <th></th>}
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const inativo = g.ativo === false
                  const editando = editId === g.id
                  return (
                    <tr key={g.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                      <td>
                        {editando ? (
                          <input
                            autoFocus
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicao(g) }}
                            style={{ width: '100%', maxWidth: 280, padding: '6px 9px', border: '1px solid var(--line-strong)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }}
                          />
                        ) : (
                          <span className="cli-name">{g.nome || '(sem nome)'}</span>
                        )}
                      </td>
                      <td className="num-r">{g.servicos.toLocaleString('pt-BR')}</td>
                      <td>{inativo ? <span className="pill-no">Não</span> : <span className="pill-yes">Sim</span>}</td>
                      {podeEscrever && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {editando ? (
                            <>
                              <button className="btn btn-primary" style={{ marginRight: 6 }} disabled={busy === g.id} onClick={() => salvarEdicao(g)}>
                                {busy === g.id ? '…' : <><i className="ti ti-check" /> Salvar</>}
                              </button>
                              <button className="btn" onClick={() => setEditId(null)}><i className="ti ti-x" /></button>
                            </>
                          ) : (
                            <>
                              <button className="btn" style={{ marginRight: 6 }} title="Renomear" onClick={() => { setMsg(''); setEditId(g.id); setEditNome(g.nome || '') }}>
                                <i className="ti ti-pencil" />
                              </button>
                              <button className="btn" disabled={busy === g.id} title={inativo ? 'Ativar' : 'Inativar'} onClick={() => toggle(g)}
                                style={{ color: inativo ? 'var(--green)' : 'var(--red)' }}>
                                {busy === g.id ? '…' : <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} />}
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cli-foot">
            <span>{`${grupos.length} grupo(s) · ${grupos.filter((g) => g.ativo !== false).length} ativo(s)`}</span>
          </div>
        </div>
      )}

      {novoOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setNovoOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, padding: 22, background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
            <h3 style={{ fontSize: 17, marginBottom: 12, fontWeight: 700 }}><i className="ti ti-list-details" /> Novo grupo de serviços</h3>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Nome <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              autoFocus
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') salvarNovo() }}
              placeholder="Ex.: Depilação"
              style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginTop: 4 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setNovoOpen(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={busy === 'novo'} onClick={salvarNovo}>{busy === 'novo' ? 'Salvando…' : 'Criar grupo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
