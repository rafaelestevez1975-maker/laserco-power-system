'use client'

import { useState } from 'react'
import { SEG_CAMPOS, segLabel, type SegCriterio } from '@/lib/automacoes'

/**
 * Segmentador de base (legado segModal 6678 / SEG_CAMPOS 6645).
 * Combina vários critérios. Ao confirmar, chama onApply(criterios) e o servidor
 * conta DE VERDADE os contatos na base de clientes (não mostramos mais a
 * estimativa fabricada do legado — 1248 × fatores fixos — que não batia com o real).
 * Os valores de serviço/unidade vêm de dados reais.
 */
export function SegmentadorModal({
  open, titulo, aplicarLabel, servicos, unidades, onClose, onApply, busy,
}: {
  open: boolean; titulo: string; aplicarLabel: string; servicos: string[]; unidades: string[]
  onClose: () => void; onApply: (criterios: SegCriterio[]) => void; busy?: boolean
}) {
  const [crit, setCrit] = useState<SegCriterio[]>([{ campo: 'verificado', op: 'é', valor: 'Sim' }])

  if (!open) return null
  const st: React.CSSProperties = { padding: '7px 8px', border: '1px solid var(--line-strong, #ddd)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5 }

  function setCampo(i: number, k: string) {
    const def = SEG_CAMPOS[k]
    const next = [...crit]
    next[i] = { campo: k, op: def.ops[0], valor: def.vals ? def.vals[0] : '' }
    setCrit(next)
  }
  function setOp(i: number, v: string) { const n = [...crit]; n[i].op = v; setCrit(n) }
  function setVal(i: number, v: string) { const n = [...crit]; n[i].valor = v; setCrit(n) }
  function add() { setCrit([...crit, { campo: 'contratou', op: '=', valor: servicos[0] ?? '' }]) }
  function del(i: number) {
    const n = crit.filter((_, idx) => idx !== i)
    setCrit(n.length ? n : [{ campo: 'verificado', op: 'é', valor: 'Sim' }])
  }

  function valEl(c: SegCriterio, i: number) {
    const def = SEG_CAMPOS[c.campo]
    if (def.type === 'sel') return <select style={{ ...st, flex: 1 }} value={c.valor} onChange={(e) => setVal(i, e.target.value)}>{def.vals!.map((v) => <option key={v}>{v}</option>)}</select>
    if (def.type === 'serv') return <select style={{ ...st, flex: 1 }} value={c.valor} onChange={(e) => setVal(i, e.target.value)}>{servicos.map((v) => <option key={v}>{v}</option>)}</select>
    if (def.type === 'uni') return <select style={{ ...st, flex: 1 }} value={c.valor} onChange={(e) => setVal(i, e.target.value)}>{unidades.map((v) => <option key={v}>{v}</option>)}</select>
    if (def.type === 'num') return <input type="number" placeholder="0" style={{ ...st, flex: 1 }} value={c.valor} onChange={(e) => setVal(i, e.target.value)} />
    return <input placeholder="digite…" style={{ ...st, flex: 1 }} value={c.valor} onChange={(e) => setVal(i, e.target.value)} />
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'var(--surface, #fff)', width: 720, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: 15, margin: 0 }}><i className="ti ti-filter-cog" /> {titulo}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', background: 'var(--surface-2)', padding: 10, borderRadius: 9, marginBottom: 12 }}>
            <i className="ti ti-info-circle" /> Combine <b>vários critérios</b> para filtrar a base — ex.: <i>Verificado = Sim</i> + <i>Contratou = Depilação Virilha</i> + <i>NÃO contratou = Clareamento Virilha</i> + <i>Gasto maior que 500</i>.
          </div>
          {crit.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <select style={{ ...st, minWidth: 170 }} value={c.campo} onChange={(e) => setCampo(i, e.target.value)}>
                {Object.entries(SEG_CAMPOS).map(([k, def]) => <option key={k} value={k}>{def.l}</option>)}
              </select>
              <select style={st} value={c.op} onChange={(e) => setOp(i, e.target.value)}>
                {SEG_CAMPOS[c.campo].ops.map((o) => <option key={o}>{o}</option>)}
              </select>
              {valEl(c, i)}
              <button onClick={() => del(i)} title="Remover critério" style={{ border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface-2)', cursor: 'pointer', padding: '6px 8px' }}><i className="ti ti-trash" style={{ color: 'var(--red)' }} /></button>
            </div>
          ))}
          <button className="btn" onClick={add} style={{ marginTop: 2 }}><i className="ti ti-plus" /> Adicionar critério</button>
          <div style={{ marginTop: 14, fontWeight: 700, fontSize: 13, color: 'var(--text-2)' }}><i className="ti ti-users" /> O total real de clientes do segmento é calculado ao gerar a base.</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{segLabel(crit)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => onApply(crit)}><i className="ti ti-check" /> {aplicarLabel}</button>
        </div>
      </div>
    </div>
  )
}
