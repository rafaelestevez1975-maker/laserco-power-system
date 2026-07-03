'use client'

import { useState } from 'react'
import { criarPdi, salvarPdi, type PdiInput } from '@/app/(app)/rh/desempenho/actions'
import type { PdiRow, ColabOpt } from './tipos'

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

const STATUS: { k: string; l: string }[] = [
  { k: 'planejado', l: 'Planejado' },
  { k: 'em_andamento', l: 'Em andamento' },
  { k: 'concluido', l: 'Concluído' },
  { k: 'cancelado', l: 'Cancelado' },
]

type FormState = {
  colaborador_id: string
  titulo: string
  descricao: string
  prazo: string
  status: string
  progresso: string
}

function rowToForm(row?: PdiRow): FormState {
  return {
    colaborador_id: row?.colaborador_id ?? '',
    titulo: row?.titulo ?? '',
    descricao: row?.descricao ?? '',
    prazo: row?.prazo ?? '',
    status: row?.status ?? 'planejado',
    progresso: row?.progresso != null ? String(row.progresso) : '',
  }
}

/** Validação por campo no cliente (o servidor revalida). */
function validar(f: FormState): string | null {
  if (!f.colaborador_id) return 'Selecione o colaborador.'
  if (!f.titulo.trim()) return 'Informe o título do plano.'
  if (f.progresso.trim()) {
    const p = Number(f.progresso)
    if (!Number.isInteger(p) || p < 0 || p > 100) return 'Progresso deve ser inteiro entre 0 e 100.'
  }
  return null
}

export function PdiModal({ modo, row, colaboradores, onClose, onSaved }: {
  modo: 'novo' | 'editar'
  row?: PdiRow
  colaboradores: ColabOpt[]
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<FormState>(rowToForm(row))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  async function salvar() {
    const v = validar(f)
    if (v) { setErr(v); return }
    setBusy(true); setErr('')
    const input: PdiInput = {
      colaborador_id: f.colaborador_id,
      titulo: f.titulo,
      descricao: f.descricao || null,
      prazo: f.prazo || null,
      status: f.status || 'planejado',
      progresso: f.progresso.trim() ? Number(f.progresso) : 0,
    }
    const res = modo === 'novo' ? await criarPdi(input) : await salvarPdi(row!.id, input)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar PDI.'); return }
    onSaved()
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 520 }}>
        <div className="modal-head">
          <h3><i className="ti ti-target-arrow" /> {modo === 'novo' ? 'Novo plano de desenvolvimento (PDI)' : 'Editar PDI'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div className="mf">
            <label>Colaborador <span className="req">*</span></label>
            <select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)} disabled={modo === 'editar'}>
              <option value=""> Selecione </option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ''}</option>)}
            </select>
          </div>
          <div className="mf">
            <label>Título do plano <span className="req">*</span></label>
            <input style={inp} value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: Capacitação em vendas consultivas" />
          </div>
          <div className="mf">
            <label>Descrição / ações</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Objetivos, ações de desenvolvimento, recursos…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="mf">
              <label>Prazo</label>
              <input type="date" style={inp} value={f.prazo} onChange={(e) => set('prazo', e.target.value)} />
            </div>
            <div className="mf">
              <label>Status</label>
              <select style={inp} value={f.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}
              </select>
            </div>
            <div className="mf">
              <label>Progresso (%)</label>
              <input style={inp} inputMode="numeric" value={f.progresso} onChange={(e) => set('progresso', e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : modo === 'novo' ? 'Criar PDI' : 'Salvar alterações'}</button>
        </div>
      </div>
    </div>
  )
}
