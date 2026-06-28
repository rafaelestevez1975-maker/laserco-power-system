'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { validarAcordo, salvarObsCredor } from '@/app/(app)/sac/actions'
import { moedaBR, dataBR } from '@/lib/fmt'
import { lerObsCredor } from '@/lib/sac'

export type Parcela = { id: string; n: number; vencimento: string | null; valor: number | null; pago: boolean | null }
export type Acordo = {
  id: string; ticket_id: string | null; cliente: string | null; valor_total: number | null
  n_parcelas: number | null; status: string | null; observacao: string | null; criado_em: string | null; parcelas: Parcela[]
}

const ST: Record<string, { bg: string; c: string; t: string }> = {
  aguardando_ok: { bg: '#FBEFD9', c: '#9A6700', t: 'Aguardando OK' },
  validado: { bg: '#E6F0FB', c: '#3D7FD1', t: 'Validado' },
  pago: { bg: '#E7F0EC', c: '#15803D', t: 'Pago' },
  cancelado: { bg: '#FBE9EB', c: '#D85563', t: 'Cancelado' },
}

export function AcordosSac({ acordos, totalAcordos, podeValidar }: { acordos: Acordo[]; totalAcordos: number; podeValidar: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [obsDe, setObsDe] = useState<Acordo | null>(null)

  async function validar(id: string) {
    setBusy(id); setMsg('')
    const r = await validarAcordo(id)
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro ao validar.'); return }
    setMsg('Acordo validado — parcelas lançadas em Contas a Pagar.'); router.refresh()
  }

  // Linha-resumo (KPI) do legado: "N acordo(s) · X aguardando OK · total R$ Y".
  const aguardando = acordos.filter((a) => (a.status || 'aguardando_ok') === 'aguardando_ok').length
  const totalValor = acordos.reduce((s, a) => s + (a.valor_total || 0), 0)
  const truncado = totalAcordos > acordos.length

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <h3 className="lc-title" style={{ fontSize: 15, margin: 0 }}><i className="ti ti-calendar-dollar" /> Acordos parcelados</h3>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {totalAcordos} acordo(s) · {aguardando} aguardando OK do gestor · total {moedaBR(totalValor)}{truncado ? ` (somando os ${acordos.length} carregados)` : ''}
        </span>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}

      {acordos.length === 0 ? (
        <div className="cli-card" style={{ textAlign: 'center', padding: 30 }}>
          <i className="ti ti-cash-off" style={{ fontSize: 30, color: 'var(--text-3)' }} />
          <p style={{ fontWeight: 600, margin: '8px 0 0' }}>Nenhum acordo de pagamento lançado.</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Crie um acordo a partir de um chamado de reembolso ou pelo botão “Novo acordo”.</p>
        </div>
      ) : (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead><tr><th>Cliente</th><th>Valor total</th><th>Parcelas</th><th>Criado</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {acordos.map((a) => {
                  const p = ST[a.status || 'aguardando_ok'] || ST.aguardando_ok
                  const pagas = a.parcelas.filter((x) => x.pago).length
                  const oc = lerObsCredor(a.observacao)
                  return (
                    <Fragment key={a.id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setAberto(aberto === a.id ? null : a.id)}>
                        <td>
                          <b>{a.cliente || 'Cliente'}</b>
                          {!a.ticket_id && <span style={{ fontSize: 10.5, marginLeft: 6, color: 'var(--text-3)' }}>(avulso)</span>}
                          {oc.texto && <i className="ti ti-message-circle" title="Há observação ao credor" style={{ fontSize: 12, marginLeft: 6, color: '#9A6700' }} />}
                        </td>
                        <td><b>{moedaBR(a.valor_total)}</b></td>
                        <td>{pagas}/{a.n_parcelas} paga(s)</td>
                        <td style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{dataBR(a.criado_em)}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p.bg, color: p.c }}>{p.t}</span></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {a.status === 'aguardando_ok' && podeValidar && (
                            <button className="btn btn-primary" disabled={busy === a.id} onClick={(e) => { e.stopPropagation(); validar(a.id) }}>{busy === a.id ? '…' : <><i className="ti ti-check" /> Validar</>}</button>
                          )}
                          {(a.status === 'validado' || a.status === 'pago') && podeValidar && (
                            <button className="btn" style={{ marginLeft: 6 }} onClick={(e) => { e.stopPropagation(); setMsg(''); setObsDe(a) }}><i className="ti ti-message-plus" /> Observação ao credor</button>
                          )}
                          <i className={`ti ${aberto === a.id ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ marginLeft: 8, color: 'var(--text-3)' }} />
                        </td>
                      </tr>
                      {(aberto === a.id || oc.texto) && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--surface-2)', padding: '8px 14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {oc.texto && (
                                <div style={{ background: '#FBF3E2', border: '1px solid #F0E0B8', borderRadius: 8, padding: 8, fontSize: 12, color: '#8A6D1F', marginBottom: aberto === a.id ? 6 : 0 }}>
                                  <i className="ti ti-info-circle" /> <b>Observação ao credor:</b> {oc.texto}{oc.dataPrev ? <> · Previsão: <b>{oc.dataPrev}</b></> : null}
                                </div>
                              )}
                              {aberto === a.id && (
                                <>
                                  {a.parcelas.map((pc) => (
                                    <div key={pc.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 90px', gap: 8, fontSize: 12.5, alignItems: 'center' }}>
                                      <span>Parc. {pc.n}</span>
                                      <span style={{ color: 'var(--text-2)' }}>vence {dataBR(pc.vencimento)}</span>
                                      <span><b>{moedaBR(pc.valor)}</b></span>
                                      <span style={{ color: pc.pago ? '#15803D' : '#9A6700', fontWeight: 700 }}>{pc.pago ? '✓ paga' : 'pendente'}</span>
                                    </div>
                                  ))}
                                  {a.status === 'aguardando_ok' && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>As parcelas viram lançamentos em Contas a Pagar quando o gestor validar.</div>}
                                  {(a.status === 'validado' || a.status === 'pago') && (
                                    <div style={{ fontSize: 11.5, color: '#1E3A8A', fontWeight: 600, marginTop: 4 }}>
                                      <i className="ti ti-arrows-transfer-up" /> Espelhado em Contas a Pagar ({pagas}/{a.n_parcelas} pagas)
                                    </div>
                                  )}
                                </>
                              )}
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
      )}

      {obsDe && <ObsCredorModal acordo={obsDe} onClose={() => setObsDe(null)} onSaved={(m) => { setMsg(m); setObsDe(null); router.refresh() }} />}
    </div>
  )
}

function ObsCredorModal({ acordo, onClose, onSaved }: { acordo: Acordo; onClose: () => void; onSaved: (msg: string) => void }) {
  const atual = lerObsCredor(acordo.observacao)
  const [texto, setTexto] = useState(atual.texto)
  const [dataPrev, setDataPrev] = useState(atual.dataPrev)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }
  const lab: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setSaving(true)
    const r = await salvarObsCredor(acordo.id, texto, dataPrev)
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved('Observação ao credor registrada (visível a todos).')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={salvar} className="modal" style={{ width: 520 }}>
        <div className="modal-head"><h3><i className="ti ti-message-plus" /> Observação ao credor</h3><button type="button" className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Acordo de <b>{acordo.cliente || 'Cliente'}</b> · {moedaBR(acordo.valor_total)}. Esta nota fica visível a todos no card do acordo.</div>
          <div><label style={lab}>Observação (motivo de não pagamento, andamento, etc.)</label>
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
          </div>
          <div><label style={lab}>Possível data de atualização ao credor (Previsão)</label>
            <input style={{ ...inp, maxWidth: 220 }} type="date" value={dataPrev} onChange={(e) => setDataPrev(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar observação'}</button></div>
      </form>
    </div>
  )
}
