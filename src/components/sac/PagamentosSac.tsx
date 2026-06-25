'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { darBaixaLancamento } from '@/app/(app)/financeiro/actions'
import { moedaBR, dataBR } from '@/lib/fmt'

export type Reembolso = {
  id: string; descricao: string | null; valor: number | null; status: string | null
  data_vencimento: string | null; data_pagamento: string | null; observacao: string | null; origem_ref_id: string | null
}

const stPill = (s: string | null) =>
  s === 'pago' ? { bg: '#E7F0EC', c: '#15803D', t: 'Pago' } : s === 'vencido' ? { bg: '#FBE9EB', c: '#D85563', t: 'Vencido' } : { bg: '#FBEFD9', c: '#9A6700', t: 'Pendente' }

export function PagamentosSac({ itens, podeBaixar }: { itens: Reembolso[]; podeBaixar: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const totalPend = itens.filter((i) => i.status !== 'pago').reduce((s, i) => s + (i.valor || 0), 0)
  const totalPago = itens.filter((i) => i.status === 'pago').reduce((s, i) => s + (i.valor || 0), 0)

  async function baixar(id: string) {
    if (!confirm('Confirmar baixa deste reembolso? O chamado vinculado será concluído automaticamente.')) return
    setBusy(id); setMsg('')
    const r = await darBaixaLancamento(id)
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro ao dar baixa.'); return }
    setMsg(r.concluiuChamado ? 'Reembolso pago e chamado concluído.' : 'Reembolso pago.')
    router.refresh()
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '4px 0 16px' }}>
        <div className="metric-box"><span>Reembolsos pendentes</span><b>{moedaBR(totalPend)}</b></div>
        <div className="metric-box"><span>Já pagos</span><b>{moedaBR(totalPago)}</b></div>
        <div className="metric-box"><span>Total de solicitações</span><b>{itens.length}</b></div>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Reembolso</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Observação</th><th></th></tr></thead>
            <tbody>
              {itens.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum reembolso solicitado ainda. Eles aparecem aqui quando o SAC lança um reembolso (no Kanban do chamado).</td></tr>
              )}
              {itens.map((i) => {
                const p = stPill(i.status)
                return (
                  <tr key={i.id}>
                    <td>{i.descricao || ''}</td>
                    <td><b>{moedaBR(i.valor)}</b></td>
                    <td>{dataBR(i.data_vencimento)}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p.bg, color: p.c }}>{p.t}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{i.observacao || ''}</td>
                    <td style={{ textAlign: 'right' }}>
                      {i.status !== 'pago' && podeBaixar && (
                        <button className="btn btn-primary" disabled={busy === i.id} onClick={() => baixar(i.id)}>{busy === i.id ? '…' : <><i className="ti ti-cash" /> Dar baixa</>}</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-info-circle" /> Espelho do Financeiro (Contas a Pagar) filtrado nos reembolsos do SAC. Dar baixa marca como pago e conclui o chamado vinculado.
      </div>
    </>
  )
}
