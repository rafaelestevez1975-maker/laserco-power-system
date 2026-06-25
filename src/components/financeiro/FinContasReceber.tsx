'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { receberLancamento } from '@/app/(app)/financeiro/actions'
import { moedaBR, dataBR } from '@/lib/fmt'

export type Recebivel = {
  id: string; descricao: string | null; valor: number | null; status: string | null
  data_vencimento: string | null; categoria: string | null
}

const stPill = (s: string | null) =>
  s === 'pago' ? { bg: '#E7F0EC', c: '#15803D', t: 'Recebido' } : s === 'vencido' ? { bg: '#FBE9EB', c: '#D85563', t: 'Vencido' } : { bg: '#FBEFD9', c: '#9A6700', t: 'A receber' }

export function FinContasReceber({ itens, podeReceber }: { itens: Recebivel[]; podeReceber: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function receber(id: string) {
    setBusy(id); setMsg('')
    const r = await receberLancamento(id)
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro ao registrar.'); return }
    setMsg('Recebimento registrado.'); router.refresh()
  }

  return (
    <>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {itens.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum recebível nesta página.</td></tr>
              )}
              {itens.map((i) => {
                const p = stPill(i.status)
                return (
                  <tr key={i.id}>
                    <td>{i.descricao || ''}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.categoria || ''}</td>
                    <td><b>{moedaBR(i.valor)}</b></td>
                    <td>{dataBR(i.data_vencimento)}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p.bg, color: p.c }}>{p.t}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      {i.status !== 'pago' && podeReceber && (
                        <button className="btn btn-primary" disabled={busy === i.id} onClick={() => receber(i.id)}>{busy === i.id ? '…' : <><i className="ti ti-cash" /> Registrar recebimento</>}</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
