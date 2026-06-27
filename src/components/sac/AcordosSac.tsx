'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { validarAcordo } from '@/app/(app)/sac/actions'
import { moedaBR, dataBR } from '@/lib/fmt'

export type Parcela = { id: string; n: number; vencimento: string | null; valor: number | null; pago: boolean | null }
export type Acordo = { id: string; cliente: string | null; valor_total: number | null; n_parcelas: number | null; status: string | null; criado_em: string | null; parcelas: Parcela[] }

const ST: Record<string, { bg: string; c: string; t: string }> = {
  aguardando_ok: { bg: '#FBEFD9', c: '#9A6700', t: 'Aguardando OK' },
  validado: { bg: '#E6F0FB', c: '#3D7FD1', t: 'Validado' },
  pago: { bg: '#E7F0EC', c: '#15803D', t: 'Pago' },
  cancelado: { bg: '#FBE9EB', c: '#D85563', t: 'Cancelado' },
}

export function AcordosSac({ acordos, podeValidar }: { acordos: Acordo[]; podeValidar: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  async function validar(id: string) {
    setBusy(id); setMsg('')
    const r = await validarAcordo(id)
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro ao validar.'); return }
    setMsg('Acordo validado — parcelas lançadas em Contas a Pagar.'); router.refresh()
  }

  if (acordos.length === 0) return null

  return (
    <div style={{ marginBottom: 22 }}>
      <h3 className="lc-title" style={{ fontSize: 15, marginBottom: 8 }}><i className="ti ti-calendar-dollar" /> Acordos parcelados</h3>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Cliente</th><th>Valor total</th><th>Parcelas</th><th>Criado</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {acordos.map((a) => {
                const p = ST[a.status || 'aguardando_ok'] || ST.aguardando_ok
                const pagas = a.parcelas.filter((x) => x.pago).length
                return (
                  <Fragment key={a.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setAberto(aberto === a.id ? null : a.id)}>
                      <td><b>{a.cliente || 'Cliente'}</b></td>
                      <td><b>{moedaBR(a.valor_total)}</b></td>
                      <td>{pagas}/{a.n_parcelas} paga(s)</td>
                      <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{dataBR(a.criado_em)}</td>
                      <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p.bg, color: p.c }}>{p.t}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {a.status === 'aguardando_ok' && podeValidar && (
                          <button className="btn btn-primary" disabled={busy === a.id} onClick={(e) => { e.stopPropagation(); validar(a.id) }}>{busy === a.id ? '…' : <><i className="ti ti-check" /> Validar</>}</button>
                        )}
                        <i className={`ti ${aberto === a.id ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ marginLeft: 8, color: 'var(--text-3)' }} />
                      </td>
                    </tr>
                    {aberto === a.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--surface-2)', padding: '8px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {a.parcelas.map((pc) => (
                              <div key={pc.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 90px', gap: 8, fontSize: 12.5, alignItems: 'center' }}>
                                <span>Parc. {pc.n}</span>
                                <span style={{ color: 'var(--text-2)' }}>vence {dataBR(pc.vencimento)}</span>
                                <span><b>{moedaBR(pc.valor)}</b></span>
                                <span style={{ color: pc.pago ? '#15803D' : '#9A6700', fontWeight: 700 }}>{pc.pago ? '✓ paga' : 'pendente'}</span>
                              </div>
                            ))}
                            {a.status === 'aguardando_ok' && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>As parcelas viram lançamentos em Contas a Pagar quando o gestor validar.</div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
