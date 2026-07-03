'use client'

import { useState } from 'react'
import { criarAvaliacao, salvarAvaliacao, type AvaliacaoInput } from '@/app/(app)/rh/desempenho/actions'
import type { AvaliacaoRow, ColabOpt } from './tipos'

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

type FormState = {
  colaborador_id: string
  periodo: string
  nota_produtividade: string
  nota_qualidade: string
  nota_comportamento: string
  nota_trabalho_equipe: string
  nota_geral: string
  observacoes: string
}

function rowToForm(row?: AvaliacaoRow): FormState {
  const s = (n: number | null | undefined) => (n != null ? String(n) : '')
  return {
    colaborador_id: row?.colaborador_id ?? '',
    periodo: row?.periodo ?? '',
    nota_produtividade: s(row?.nota_produtividade),
    nota_qualidade: s(row?.nota_qualidade),
    nota_comportamento: s(row?.nota_comportamento),
    nota_trabalho_equipe: s(row?.nota_trabalho_equipe),
    nota_geral: s(row?.nota_geral),
    observacoes: row?.observacoes ?? '',
  }
}

const NOTAS: { k: keyof FormState; l: string }[] = [
  { k: 'nota_produtividade', l: 'Produtividade' },
  { k: 'nota_qualidade', l: 'Qualidade' },
  { k: 'nota_comportamento', l: 'Comportamento' },
  { k: 'nota_trabalho_equipe', l: 'Trabalho em equipe' },
]

/** Validação por campo no cliente (o servidor revalida). */
function validar(f: FormState): string | null {
  if (!f.colaborador_id) return 'Selecione o colaborador.'
  if (!f.periodo.trim()) return 'Informe o período (ex.: 2026-Q2).'
  for (const { k, l } of NOTAS) {
    const v = (f[k] as string).trim()
    if (v) {
      const n = Number(v.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0 || n > 5) return `${l} deve ser um número entre 0 e 5.`
    }
  }
  if (f.nota_geral.trim()) {
    const n = Number(f.nota_geral.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 5) return 'Nota geral deve ser entre 0 e 5.'
  }
  return null
}

export function AvaliacaoModal({ modo, row, colaboradores, onClose, onSaved }: {
  modo: 'novo' | 'editar'
  row?: AvaliacaoRow
  colaboradores: ColabOpt[]
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<FormState>(rowToForm(row))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))

  // Prévia da nota geral (média das notas preenchidas) quando o campo está vazio.
  const mediaPreview = (() => {
    const vals = NOTAS.map(({ k }) => (f[k] as string).trim()).filter(Boolean).map((v) => Number(v.replace(',', '.'))).filter(Number.isFinite)
    return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
  })()

  async function salvar() {
    const v = validar(f)
    if (v) { setErr(v); return }
    setBusy(true); setErr('')
    const input: AvaliacaoInput = {
      colaborador_id: f.colaborador_id,
      periodo: f.periodo,
      nota_produtividade: f.nota_produtividade || null,
      nota_qualidade: f.nota_qualidade || null,
      nota_comportamento: f.nota_comportamento || null,
      nota_trabalho_equipe: f.nota_trabalho_equipe || null,
      nota_geral: f.nota_geral || null,
      observacoes: f.observacoes || null,
    }
    const res = modo === 'novo' ? await criarAvaliacao(input) : await salvarAvaliacao(row!.id, input)
    setBusy(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar avaliação.'); return }
    onSaved()
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-head">
          <h3><i className="ti ti-star" /> {modo === 'novo' ? 'Nova avaliação de desempenho' : 'Editar avaliação'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
            <div className="mf">
              <label>Colaborador <span className="req">*</span></label>
              <select style={inp} value={f.colaborador_id} onChange={(e) => set('colaborador_id', e.target.value)} disabled={modo === 'editar'}>
                <option value=""> Selecione </option>
                {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` · ${c.cargo}` : ''}</option>)}
              </select>
            </div>
            <div className="mf">
              <label>Período <span className="req">*</span></label>
              <input style={inp} value={f.periodo} onChange={(e) => set('periodo', e.target.value)} placeholder="2026-Q2" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {NOTAS.map(({ k, l }) => (
              <div className="mf" key={k}>
                <label>{l} (0–5)</label>
                <input style={inp} inputMode="decimal" value={f[k] as string} onChange={(e) => set(k, e.target.value as FormState[typeof k])} placeholder="0–5" />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <div className="mf">
              <label>Nota geral (0–5)</label>
              <input style={inp} inputMode="decimal" value={f.nota_geral} onChange={(e) => set('nota_geral', e.target.value)} placeholder={mediaPreview != null ? `Média: ${mediaPreview}` : '0–5'} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', paddingBottom: 8 }}>
              {f.nota_geral.trim() ? '' : mediaPreview != null ? <><i className="ti ti-info-circle" /> Vazio = usa a média ({mediaPreview}).</> : 'Preencha as notas para calcular a média.'}
            </div>
          </div>
          <div className="mf">
            <label>Observações</label>
            <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Pontos fortes, pontos a desenvolver, feedback…" />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : modo === 'novo' ? 'Registrar avaliação' : 'Salvar alterações'}</button>
        </div>
      </div>
    </div>
  )
}
