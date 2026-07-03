'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR, dataBR } from '@/lib/fmt'
import { criarMeta, salvarMeta, excluirMeta, atualizarRealizado, type MetaInput } from '@/app/(app)/cadastros/metas/actions'

export type MetaRow = {
  id: string
  colaborador_id: string
  colaboradorNome: string
  indicador: string
  unidade_medida: string | null
  valor_alvo: number | null
  valor_realizado: number | null
  peso: number | null
  periodo_inicio: string | null
  periodo_fim: string | null
  status: string | null
}

export type ColabOpt = { id: string; nome: string; cargo: string | null }

const INDICADOR_LBL: Record<string, string> = {
  venda: 'Venda',
  agendamentos: 'Agendamentos',
  clientes_novos: 'Clientes novos (25%)',
  indicacoes: 'Indicações',
  sessoes: 'Sessões',
}
const INDICADORES = Object.keys(INDICADOR_LBL)
const UNIDADE_MEDIDA: Record<string, string> = { venda: 'R$', agendamentos: 'agend.', clientes_novos: 'aval.', indicacoes: 'ind.', sessoes: 'sess.' }

/** Formata alvo/realizado conforme o indicador (R$ para venda, número p/ o resto). */
function fmtVal(indicador: string, v: number | null): string {
  if (v == null) return ''
  if (indicador === 'venda') return moedaBR(v)
  return v.toLocaleString('pt-BR') + (UNIDADE_MEDIDA[indicador] ? ` ${UNIDADE_MEDIDA[indicador]}` : '')
}

type FormState = {
  colaborador_id: string
  indicador: string
  valor_alvo: string
  valor_realizado: string
  peso: string
  periodo_inicio: string
  periodo_fim: string
  status: string
}

function rowToForm(row?: MetaRow): FormState {
  return {
    colaborador_id: row?.colaborador_id ?? '',
    indicador: row?.indicador ?? 'venda',
    valor_alvo: row?.valor_alvo != null ? String(row.valor_alvo) : '',
    valor_realizado: row?.valor_realizado != null ? String(row.valor_realizado) : '',
    peso: row?.peso != null ? String(row.peso) : '',
    periodo_inicio: row?.periodo_inicio ?? '',
    periodo_fim: row?.periodo_fim ?? '',
    status: row?.status ?? 'ativa',
  }
}

function MetaModal({ modo, row, colaboradores, onClose }: { modo: 'novo' | 'editar'; row?: MetaRow; colaboradores: ColabOpt[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<FormState>(rowToForm(row))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong,#ccc)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  function validar(): string | null {
    if (!f.colaborador_id) return 'Selecione o colaborador.'
    if (!f.indicador) return 'Informe o indicador.'
    const alvo = Number(f.valor_alvo)
    if (!f.valor_alvo.trim() || !Number.isFinite(alvo)) return 'Informe o valor da meta (alvo).'
    if (alvo < 0) return 'A meta não pode ser negativa.'
    if (f.indicador === 'venda' && alvo < 100000) return 'Meta de venda mensal mínima é 100.000 (R$).'
    if (f.peso.trim()) {
      const p = Number(f.peso)
      if (!Number.isInteger(p) || p < 0 || p > 100) return 'Peso deve ser inteiro entre 0 e 100.'
    }
    if (f.periodo_inicio && f.periodo_fim && f.periodo_inicio > f.periodo_fim) return 'O início não pode ser depois do fim.'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)
    const input: MetaInput = {
      colaborador_id: f.colaborador_id,
      indicador: f.indicador,
      unidade_medida: UNIDADE_MEDIDA[f.indicador] ?? null,
      valor_alvo: Number(f.valor_alvo),
      valor_realizado: f.valor_realizado.trim() ? Number(f.valor_realizado) : 0,
      peso: f.peso.trim() ? Number(f.peso) : null,
      periodo_inicio: f.periodo_inicio || null,
      periodo_fim: f.periodo_fim || null,
      status: f.status || 'ativa',
    }
    const res = modo === 'novo' ? await criarMeta(input) : await salvarMeta(row!.id, input)
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
            <label style={lbl}>Colaborador <span style={{ color: 'var(--red)' }}>*</span></label>
            <select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)} disabled={modo === 'editar'}>
              <option value=""> Selecione </option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Indicador <span style={{ color: 'var(--red)' }}>*</span></label>
            <select style={inp} value={f.indicador} onChange={(e) => set('indicador', e.target.value)}>
              {INDICADORES.map((i) => <option key={i} value={i}>{INDICADOR_LBL[i]}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Meta / alvo ({UNIDADE_MEDIDA[f.indicador] ?? ''}) <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} value={f.valor_alvo} onChange={(e) => set('valor_alvo', e.target.value)} inputMode="numeric" placeholder={f.indicador === 'venda' ? '100000' : '0'} />
          </div>
          <div>
            <label style={lbl}>Realizado</label>
            <input style={inp} value={f.valor_realizado} onChange={(e) => set('valor_realizado', e.target.value)} inputMode="numeric" placeholder="0" />
          </div>
          <div>
            <label style={lbl}>Peso (0–100)</label>
            <input style={inp} value={f.peso} onChange={(e) => set('peso', e.target.value)} inputMode="numeric" placeholder="" />
          </div>
          <div>
            <label style={lbl}>Início do período</label>
            <input type="date" style={inp} value={f.periodo_inicio} onChange={(e) => set('periodo_inicio', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Fim do período</label>
            <input type="date" style={inp} value={f.periodo_fim} onChange={(e) => set('periodo_fim', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Status</label>
            <select style={inp} value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ativa">Ativa</option>
              <option value="pausada">Pausada</option>
              <option value="concluida">Concluída</option>
            </select>
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

export function MetasColaboradorCrud({ metas, colaboradores, podeEscrever }: { metas: MetaRow[]; colaboradores: ColabOpt[]; podeEscrever: boolean }) {
  const router = useRouter()
  const [modal, setModal] = useState<{ modo: 'novo' | 'editar'; row?: MetaRow } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  async function onExcluir(row: MetaRow) {
    if (!confirm(`Excluir a meta de ${INDICADOR_LBL[row.indicador] ?? row.indicador} de ${row.colaboradorNome}?`)) return
    setBusy(row.id); setErro('')
    const res = await excluirMeta(row.id)
    setBusy(null)
    if (!res.ok) { setErro(res.error || 'Erro ao excluir.'); return }
    router.refresh()
  }

  async function onRealizado(row: MetaRow) {
    const atual = row.valor_realizado ?? 0
    const v = prompt(`Atualizar realizado de ${INDICADOR_LBL[row.indicador] ?? row.indicador}  ${row.colaboradorNome}:`, String(atual))
    if (v == null) return
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) { setErro('Valor de realizado inválido.'); return }
    setBusy(row.id); setErro('')
    const res = await atualizarRealizado(row.id, n)
    setBusy(null)
    if (!res.ok) { setErro(res.error || 'Erro ao atualizar.'); return }
    router.refresh()
  }

  return (
    <div className="doc-card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}><i className="ti ti-list-check" /> Metas por colaborador</h3>
        {podeEscrever && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal({ modo: 'novo' })}><i className="ti ti-plus" /> Nova meta</button>
        )}
      </div>

      {erro && <p style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 10 }}>{erro}</p>}

      {metas.length === 0 ? (
        <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <i className="ti ti-target-off" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
          Nenhuma meta de colaborador cadastrada {colaboradores.length === 0 ? ' e não há colaboradores ativos na unidade.' : 'ainda.'}
          {podeEscrever && colaboradores.length > 0 && <div style={{ marginTop: 10 }}><button className="btn btn-primary" onClick={() => setModal({ modo: 'novo' })}><i className="ti ti-plus" /> Cadastrar a primeira meta</button></div>}
        </div>
      ) : (
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Colaborador</th><th>Indicador</th><th className="num-r">Meta</th><th className="num-r">Realizado</th><th>Atingido</th><th>Período</th><th>Status</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => {
                const alvo = m.valor_alvo ?? 0
                const real = m.valor_realizado ?? 0
                const pct = alvo > 0 ? Math.round((real / alvo) * 100) : 0
                const ok = pct >= 100
                return (
                  <tr key={m.id} style={busy === m.id ? { opacity: 0.5 } : undefined}>
                    <td><span className="cli-name">{m.colaboradorNome}</span></td>
                    <td>{INDICADOR_LBL[m.indicador] ?? m.indicador}</td>
                    <td className="num-r">{fmtVal(m.indicador, m.valor_alvo)}</td>
                    <td className="num-r">{fmtVal(m.indicador, m.valor_realizado)}</td>
                    <td><span className={`os-st ${ok ? 'os-fechada' : 'os-aberta'}`}>{pct}%</span></td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{m.periodo_inicio ? `${dataBR(m.periodo_inicio)} → ${m.periodo_fim ? dataBR(m.periodo_fim) : '...'}` : ''}</td>
                    <td><span className="os-st">{m.status ?? 'ativa'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {podeEscrever ? (
                        <>
                          <span className="os-link" onClick={() => onRealizado(m)} title="Atualizar realizado"><i className="ti ti-pencil-plus" /> Realizado</span>
                          <span className="os-link" style={{ marginLeft: 12 }} onClick={() => setModal({ modo: 'editar', row: m })}><i className="ti ti-edit" /> Editar</span>
                          <span className="os-link" style={{ color: 'var(--red)', marginLeft: 12 }} onClick={() => onExcluir(m)}><i className="ti ti-trash" /> Excluir</span>
                        </>
                      ) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}></span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="cli-foot"><span>{metas.length} meta(s) de colaborador</span></div>

      {modal && <MetaModal modo={modal.modo} row={modal.row} colaboradores={colaboradores} onClose={() => setModal(null)} />}
    </div>
  )
}
