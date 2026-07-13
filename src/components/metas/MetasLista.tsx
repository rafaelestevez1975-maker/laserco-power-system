'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import { criarMetaCatalogo, editarMetaCatalogo, toggleMetaAtiva, type MetaCatInput } from '@/app/(app)/cadastros/metas/actions'

/** Uma linha do catálogo `metas` já com o nome da unidade resolvido. */
export type MetaCatRow = {
  id: string
  nome: string | null
  indicador: string
  ciclo: string
  valor: number | null
  unidade_id: string | null
  unidadeNome: string | null
  ativo: boolean | null
}

export type UnidadeOpt = { id: string; nome: string }

/** Labels amigáveis (compartilhados com a page/export). */
export const INDICADOR_LBL: Record<string, string> = {
  agendamentos: 'Agendamentos',
  atendimentos: 'Atendimentos',
  faturamento_bruto: 'Faturamento Bruto',
  faturamento_valor: 'Faturamento (valor)',
  vendas: 'Vendas',
}
const INDICADORES = Object.keys(INDICADOR_LBL)

export const CICLO_LBL: Record<string, string> = { mensal: 'Mensal', semanal: 'Semanal' }
const CICLOS = Object.keys(CICLO_LBL)

/** Indicadores monetários → exibem R$; os demais são contagem. */
const MONETARIOS = new Set(['faturamento_bruto', 'faturamento_valor'])

/** Formata o valor conforme o indicador (R$ p/ faturamento, número p/ o resto). */
export function fmtValor(indicador: string, v: number | null | undefined): string {
  if (v == null) return ''
  return MONETARIOS.has(indicador) ? moedaBR(v) : Number(v).toLocaleString('pt-BR')
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong,#ccc)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

type FormState = { nome: string; indicador: string; ciclo: string; unidade_id: string; valor: string; ativo: boolean }

function rowToForm(row?: MetaCatRow): FormState {
  return {
    nome: row?.nome ?? '',
    indicador: row?.indicador ?? 'agendamentos',
    ciclo: row?.ciclo ?? 'mensal',
    unidade_id: row?.unidade_id ?? '',
    valor: row?.valor != null ? String(row.valor) : '',
    ativo: row?.ativo !== false,
  }
}

function MetaModal({ modo, row, unidades, onClose }: { modo: 'novo' | 'editar'; row?: MetaCatRow; unidades: UnidadeOpt[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<FormState>(rowToForm(row))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  function validar(): string | null {
    if (!f.nome.trim()) return 'Informe o nome da meta.'
    if (!f.indicador) return 'Selecione o indicador.'
    if (!f.ciclo) return 'Selecione o ciclo.'
    const n = Number(f.valor.replace(/\./g, '').replace(',', '.'))
    if (!f.valor.trim() || !Number.isFinite(n)) return 'Informe o valor da meta.'
    if (n < 0) return 'O valor não pode ser negativo.'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)
    const input: MetaCatInput = {
      nome: f.nome.trim(),
      indicador: f.indicador,
      ciclo: f.ciclo,
      unidade_id: f.unidade_id || null,
      valor: Number(f.valor.replace(/\./g, '').replace(',', '.')),
      ativo: f.ativo,
    }
    const res = modo === 'novo' ? await criarMetaCatalogo(input) : await editarMetaCatalogo(row!.id, input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar meta.'); return }
    onClose()
    router.refresh()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 14, fontWeight: 700 }}>
          <i className="ti ti-target" /> {modo === 'novo' ? 'Nova meta' : 'Editar meta'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Nome <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus placeholder="Ex.: Meta - GR3" />
          </div>
          <div>
            <label style={lbl}>Indicador <span style={{ color: 'var(--red)' }}>*</span></label>
            <select style={inp} value={f.indicador} onChange={(e) => set('indicador', e.target.value)}>
              {INDICADORES.map((i) => <option key={i} value={i}>{INDICADOR_LBL[i]}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ciclo <span style={{ color: 'var(--red)' }}>*</span></label>
            <select style={inp} value={f.ciclo} onChange={(e) => set('ciclo', e.target.value)}>
              {CICLOS.map((c) => <option key={c} value={c}>{CICLO_LBL[c]}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Unidade</label>
            <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Valor {MONETARIOS.has(f.indicador) ? '(R$)' : ''} <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} value={f.valor} onChange={(e) => set('valor', e.target.value)} inputMode="decimal" placeholder="0" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <input id="meta-ativo" type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} />
            <label htmlFor="meta-ativo" style={{ ...lbl, cursor: 'pointer' }}>Meta ativa</label>
          </div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : modo === 'novo' ? 'Cadastrar meta' : 'Salvar alterações'}</button>
        </div>
      </form>
    </div>
  )
}

export function MetasLista({ metas, unidades, podeEscrever }: { metas: MetaCatRow[]; unidades: UnidadeOpt[]; podeEscrever: boolean }) {
  const router = useRouter()
  const [modal, setModal] = useState<{ modo: 'novo' | 'editar'; row?: MetaCatRow } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  // Filtros
  const [fAtivo, setFAtivo] = useState<'sim' | 'nao' | 'todos'>('todos')
  const [fNome, setFNome] = useState('')
  const [fIndicador, setFIndicador] = useState('')
  const [fCiclo, setFCiclo] = useState('')

  const filtradas = useMemo(() => {
    const nq = fNome.trim().toLowerCase()
    return metas.filter((m) => {
      if (fAtivo === 'sim' && m.ativo === false) return false
      if (fAtivo === 'nao' && m.ativo !== false) return false
      if (fIndicador && m.indicador !== fIndicador) return false
      if (fCiclo && m.ciclo !== fCiclo) return false
      if (nq && !(m.nome ?? '').toLowerCase().includes(nq)) return false
      return true
    })
  }, [metas, fAtivo, fNome, fIndicador, fCiclo])

  async function toggle(m: MetaCatRow) {
    setBusy(m.id); setErro('')
    const res = await toggleMetaAtiva(m.id, m.ativo === false)
    setBusy(null)
    if (!res.ok) { setErro(res.error || 'Erro ao alterar.'); return }
    router.refresh()
  }

  const exportHref = () => {
    const p = new URLSearchParams()
    if (fAtivo !== 'todos') p.set('ativo', fAtivo)
    if (fNome.trim()) p.set('q', fNome.trim())
    if (fIndicador) p.set('indicador', fIndicador)
    if (fCiclo) p.set('ciclo', fCiclo)
    const qs = p.toString()
    return `/cadastros/metas/export${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <a className="btn" href={exportHref()} target="_blank" rel="noreferrer" title="Exportar a lista em CSV"><i className="ti ti-download" /> Exportar</a>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setErro(''); setModal({ modo: 'novo' }) }}>
            <i className="ti ti-plus" /> Nova meta
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="cli-card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <div>
            <label style={lbl}>Ativo</label>
            <select style={inp} value={fAtivo} onChange={(e) => setFAtivo(e.target.value as 'sim' | 'nao' | 'todos')}>
              <option value="todos">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Nome</label>
            <input style={inp} value={fNome} onChange={(e) => setFNome(e.target.value)} placeholder="Buscar por nome…" />
          </div>
          <div>
            <label style={lbl}>Indicador</label>
            <select style={inp} value={fIndicador} onChange={(e) => setFIndicador(e.target.value)}>
              <option value="">Todos</option>
              {INDICADORES.map((i) => <option key={i} value={i}>{INDICADOR_LBL[i]}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ciclo</label>
            <select style={inp} value={fCiclo} onChange={(e) => setFCiclo(e.target.value)}>
              <option value="">Todos</option>
              {CICLOS.map((c) => <option key={c} value={c}>{CICLO_LBL[c]}</option>)}
            </select>
          </div>
        </div>
      </div>

      {erro && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{erro}</p>}

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Indicador</th>
                <th>Ciclo</th>
                <th className="num-r">Valor</th>
                <th>Unidade</th>
                <th>Ativo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                    Nenhuma meta encontrada.
                  </td>
                </tr>
              )}
              {filtradas.map((m) => {
                const inativo = m.ativo === false
                return (
                  <tr key={m.id} style={{ opacity: inativo ? 0.55 : 1, ...(busy === m.id ? { opacity: 0.4 } : {}) }}>
                    <td><span className="cli-name">{m.nome}</span></td>
                    <td>{INDICADOR_LBL[m.indicador] ?? m.indicador}</td>
                    <td>{CICLO_LBL[m.ciclo] ?? m.ciclo}</td>
                    <td className="num-r">{fmtValor(m.indicador, m.valor)}</td>
                    <td>{m.unidadeNome ?? 'Todas'}</td>
                    <td>{inativo ? <span className="pill-no">Não</span> : <span className="pill-yes">Sim</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {podeEscrever ? (
                        <>
                          <span className="os-link" style={{ cursor: 'pointer' }} onClick={() => { setErro(''); setModal({ modo: 'editar', row: m }) }}>
                            <i className="ti ti-edit" /> Editar
                          </span>
                          <span className="os-link" style={{ cursor: 'pointer', color: inativo ? 'var(--green)' : 'var(--amber)', marginLeft: 12, opacity: busy === m.id ? 0.5 : 1 }} onClick={() => busy !== m.id && toggle(m)}>
                            <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} /> {inativo ? 'Ativar' : 'Inativar'}
                          </span>
                        </>
                      ) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}></span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="cli-foot"><span>{filtradas.length} de {metas.length} meta(s)</span></div>
      </div>

      {modal && <MetaModal modo={modal.modo} row={modal.row} unidades={unidades} onClose={() => setModal(null)} />}
    </div>
  )
}
