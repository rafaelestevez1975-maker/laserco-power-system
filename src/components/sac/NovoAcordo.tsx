'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { criarAcordoAvulso } from '@/app/(app)/sac/actions'
import { moedaBR, dataBR } from '@/lib/fmt'

type Unidade = { id: string; nome: string }
export type ChamadoOpcao = { id: string; rotulo: string; cliente: string; valorSugerido: number | null }

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }
const lab: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }

function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

export function NovoAcordo({ unidades, chamados }: { unidades: Unidade[]; chamados: ChamadoOpcao[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ ticketId: '', cliente: '', unidade_id: '', valorTotal: '', nParcelas: '3', data1: '', observacao: '' })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  // sacAcChamPick: ao escolher um chamado, auto-preenche cliente + valor sugerido (devolução).
  function pickChamado(id: string) {
    const c = chamados.find((x) => x.id === id)
    setF((p) => ({
      ...p, ticketId: id,
      cliente: c?.cliente || p.cliente,
      valorTotal: c?.valorSugerido != null ? String(c.valorSugerido).replace('.', ',') : p.valorTotal,
    }))
  }

  const total = Number((f.valorTotal || '').replace(/\./g, '').replace(',', '.')) || 0
  const n = Math.min(24, Math.max(1, Math.round(Number(f.nParcelas) || 1)))
  const diaOk = !f.data1 || Number(f.data1.slice(8, 10)) > 15
  const preview = useMemo(() => {
    if (!(total > 0) || !f.data1) return [] as { n: number; venc: string; valor: number }[]
    const d1 = new Date(f.data1)
    if (isNaN(d1.getTime())) return []
    const base = Math.floor((total / n) * 100) / 100
    return Array.from({ length: n }, (_, i) => ({
      n: i + 1,
      venc: addMonths(d1, i).toISOString().slice(0, 10),
      valor: i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base,
    }))
  }, [total, n, f.data1])

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!f.cliente.trim()) { setErr('Informe o cliente.'); return }
    if (!(total > 0)) { setErr('Valor total deve ser maior que zero.'); return }
    if (!f.data1) { setErr('Informe a data do 1º pagamento.'); return }
    if (!diaOk) { setErr('A data do 1º pagamento deve ser após o dia 15.'); return }
    setSaving(true)
    const r = await criarAcordoAvulso({ ticketId: f.ticketId || null, cliente: f.cliente, unidade_id: f.unidade_id || null, valorTotal: total, nParcelas: n, data1: f.data1, observacao: f.observacao })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao criar acordo.'); return }
    setOpen(false); setF({ ticketId: '', cliente: '', unidade_id: '', valorTotal: '', nParcelas: '3', data1: '', observacao: '' }); router.refresh()
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => { setErr(''); setOpen(true) }}><i className="ti ti-plus" /> Novo acordo</button>
      {open && (
        <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <form onSubmit={submit} className="modal" style={{ width: 560 }}>
            <div className="modal-head"><h3><i className="ti ti-calendar-dollar" /> Novo acordo de pagamento</h3><button type="button" className="modal-close" onClick={() => setOpen(false)}>×</button></div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {err && <div className="modal-note" style={{ gridColumn: '1 / -1', background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Chamado vinculado (opcional)</label>
                <select style={inp} value={f.ticketId} onChange={(e) => pickChamado(e.target.value)}>
                  <option value=""> Acordo avulso (sem chamado)</option>
                  {chamados.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Cliente *</label><input style={inp} value={f.cliente} onChange={(e) => set('cliente', e.target.value)} autoFocus /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Unidade</label>
                <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
                  <option value=""> Franqueadora / sem unidade</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div><label style={lab}>Valor total (R$) *</label><input style={inp} inputMode="decimal" value={f.valorTotal} onChange={(e) => set('valorTotal', e.target.value)} placeholder="0,00" /></div>
              <div><label style={lab}>Nº de parcelas (1–24)</label><input style={inp} type="number" min={1} max={24} value={f.nParcelas} onChange={(e) => set('nParcelas', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Data do 1º pagamento (sempre após o dia 15) *</label>
                <input style={{ ...inp, maxWidth: 220 }} type="date" value={f.data1} onChange={(e) => set('data1', e.target.value)} />
                {!diaOk && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>A data do 1º pagamento deve ser após o dia 15.</div>}
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Observação ao credor (opcional)</label><textarea style={{ ...inp, minHeight: 54, resize: 'vertical' }} value={f.observacao} onChange={(e) => set('observacao', e.target.value)} placeholder="Motivo, andamento, etc.  fica visível no card do acordo." /></div>

              {preview.length > 0 && (
                <div style={{ gridColumn: '1 / -1', border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Prévia das parcelas</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {preview.map((p) => (
                      <div key={p.n} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto', gap: 8, fontSize: 12.5 }}>
                        <span>Parc. {p.n}</span><span style={{ color: 'var(--text-2)' }}>vence {dataBR(p.venc)}</span><b>{moedaBR(p.valor)}</b>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}><i className="ti ti-info-circle" /> Entra como <b>Aguardando OK do gestor</b>. Após validar, é espelhado em Contas a Pagar.</div>
                </div>
              )}
            </div>
            <div className="modal-foot"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Criando…' : 'Criar acordo'}</button></div>
          </form>
        </div>
      )}
    </>
  )
}
