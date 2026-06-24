'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { darBaixaLancamento } from '@/app/(app)/financeiro/actions'

export type Lancamento = {
  id: string; descricao: string | null; valor: number | null; status: string | null
  data_vencimento: string | null; categoria: string | null; origem_ref_id: string | null
}

const money = (v: number | null) => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR')
const stPill = (s: string | null): React.CSSProperties =>
  s === 'pago' ? { background: '#E7F0EC', color: '#15803D' } : s === 'vencido' ? { background: '#FBE9EB', color: '#D85563' } : { background: '#FBEFD9', color: '#9A6700' }

export function FinContasPagar({ lancamentos }: { lancamentos: Lancamento[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function baixar(id: string) {
    setBusy(id); setMsg('')
    const res = await darBaixaLancamento(id)
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro ao dar baixa.')
    else { setMsg(res.concluiuChamado ? 'Baixa registrada  chamado do SAC concluído automaticamente.' : 'Baixa registrada.'); router.refresh() }
  }

  return (
    <div className="cli-card">
      {msg && <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</div>}
      <div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {lancamentos.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhuma conta a pagar. Reembolsos do SAC aparecem aqui ao serem lançados.</td></tr>
            )}
            {lancamentos.map((l) => (
              <tr key={l.id}>
                <td>{l.descricao || ''}{l.origem_ref_id && <span className="orig-tag" style={{ fontSize: 10, marginLeft: 6 }}>SAC</span>}</td>
                <td>{l.categoria || ''}</td>
                <td>{l.data_vencimento ? new Date(l.data_vencimento).toLocaleDateString('pt-BR') : ''}</td>
                <td><b>{money(l.valor)}</b></td>
                <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, ...stPill(l.status) }}>{(l.status || '').replace(/^\w/, (c) => c.toUpperCase())}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {l.status !== 'pago' && (
                    <button className="btn btn-primary" disabled={busy === l.id} onClick={() => baixar(l.id)} style={{ whiteSpace: 'nowrap' }}>
                      {busy === l.id ? '…' : <><i className="ti ti-check" /> Dar baixa</>}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
