'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarOrigem,
  salvarOrigem,
  toggleOrigemAtiva,
  excluirOrigem,
} from '@/app/(app)/cadastros/origens/actions'

export type OrigemRow = {
  id: string
  nome: string | null
  ativo: boolean | null
  auto: boolean | null
  campo: boolean | null
}

type Props = {
  origens: OrigemRow[]
  podeEscrever: boolean
  filtros: { ativo: string; nome: string }
  contador: { total: number; ativos: number }
  exibindo: number
  semTabela: boolean
}

export function OrigensManager({ origens, podeEscrever, filtros, contador, exibindo, semTabela }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<OrigemRow | null>(null)

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id); setMsg('')
    const res = await fn()
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro.')
    else router.refresh()
  }

  async function toggle(o: OrigemRow) {
    await run(o.id, () => toggleOrigemAtiva(o.id, o.ativo === false))
  }

  async function excluir(o: OrigemRow) {
    if (!confirm(`Excluir a origem "${o.nome}"?`)) return
    await run(o.id, () => excluirOrigem(o.id))
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-route" /> Origens/canais por onde o cliente chegou. Selecione a origem ao cadastrar o
        cliente e analise os canais nos relatórios.
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Novo
          </button>
        )}
      </div>

      {/* Filtros (form GET) — Ativo (Todos/Sim/Não) + busca por nome */}
      <form method="GET" action="/cadastros/origens" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Nome</label>
            <input name="nome" defaultValue={filtros.nome} placeholder="Nome" />
          </div>
          <div className="field">
            <label>Ativo</label>
            <select name="ativo" defaultValue={filtros.ativo}>
              <option value="Todos">Todos</option>
              <option value="Sim">Sim</option>
              <option value="Não">Não</option>
            </select>
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 8px' }}>{msg}</div>}

      {semTabela ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-database-off" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Tabela de origens não encontrada</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            Aplique a migration <code>scripts/migrations/anamnese.sql</code> no lkii para criar a tabela e o seed das origens.
          </p>
        </div>
      ) : (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ativo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {origens.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                      Nenhuma origem encontrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
                {origens.map((o) => {
                  const inativo = o.ativo === false
                  return (
                    <tr key={o.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                      <td>
                        <span className="cli-name">{o.nome}</span>
                        {o.auto && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            <i className="ti ti-map-pin" style={{ verticalAlign: -1, color: 'var(--brand-400)' }} /> Preenchido automaticamente quando o lead entra no CRM via geolocalização
                          </div>
                        )}
                        {o.campo && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            <i className="ti ti-forms" style={{ verticalAlign: -1, color: 'var(--brand-400)' }} /> Ao selecionar, abre campo para especificar
                          </div>
                        )}
                      </td>
                      <td>{inativo ? <span className="pill-no">Não</span> : <span className="pill-yes">Sim</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {podeEscrever ? (
                          <>
                            <span className="os-link" style={{ cursor: 'pointer' }} onClick={() => { setMsg(''); setEditRow(o) }}>
                              <i className="ti ti-edit" /> Editar
                            </span>
                            <span className="os-link" style={{ cursor: 'pointer', color: inativo ? 'var(--green)' : 'var(--amber)', marginLeft: 12, opacity: busy === o.id ? 0.5 : 1 }} onClick={() => busy !== o.id && toggle(o)}>
                              <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} /> {inativo ? 'Ativar' : 'Inativar'}
                            </span>
                            <span className="os-link" style={{ cursor: 'pointer', color: 'var(--red)', marginLeft: 12, opacity: busy === o.id ? 0.5 : 1 }} onClick={() => busy !== o.id && excluir(o)}>
                              <i className="ti ti-trash" /> Excluir
                            </span>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cli-foot">
            <span>
              {exibindo === contador.total
                ? `${contador.total} registros encontrados · ${contador.ativos} ativos`
                : `Exibindo ${exibindo} de ${contador.total} registros · ${contador.ativos} ativos`}
            </span>
          </div>
        </div>
      )}

      {novoOpen && <OrigemModal modo="novo" onClose={() => setNovoOpen(false)} onSaved={() => { setNovoOpen(false); router.refresh() }} />}
      {editRow && <OrigemModal modo="editar" row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); router.refresh() }} />}
    </div>
  )
}

function OrigemModal({ modo, row, onClose, onSaved }: {
  modo: 'novo' | 'editar'
  row?: OrigemRow
  onClose: () => void
  onSaved: () => void
}) {
  const [nome, setNome] = useState(row?.nome ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!nome.trim()) { setErr('Informe o nome da origem.'); return }
    setSaving(true)
    const res = modo === 'novo' ? await criarOrigem(nome.trim()) : await salvarOrigem(row!.id, nome.trim())
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, padding: 22, background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 14, fontWeight: 700 }}>
          <i className="ti ti-route" /> {modo === 'novo' ? 'Nova origem de cliente' : 'Editar origem de cliente'}
        </h3>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Nome <span style={{ color: 'var(--red)' }}>*</span></label>
        <input style={inp} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Indicação" />
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
