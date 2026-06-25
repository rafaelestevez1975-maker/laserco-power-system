'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { distribuirFila } from '@/app/(app)/sac/atendentes/actions'

export type AtendenteRow = {
  id: string; nome: string; papel: string; cargo: string | null; area: string | null
  unidadeNome: string | null; email: string | null; ativo: boolean; conversas: number; tickets: number
}

const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })

export function AtendentesManager({ atendentes, filaConversas, filaTickets, podeDistribuir }: {
  atendentes: AtendenteRow[]; filaConversas: number; filaTickets: number; podeDistribuir: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function distribuir() {
    setBusy(true); setMsg('')
    const r = await distribuirFila()
    setBusy(false)
    if (!r.ok) { setMsg(r.error || 'Erro ao distribuir.'); return }
    setMsg(`Distribuído: ${r.conversas} conversa(s) entre ${r.atendentes} atendente(s) por menor carga.`)
    router.refresh()
  }

  return (
    <>
      <div className="rel-acts" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 14px', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          <i className="ti ti-inbox" /> Fila de atendimento: <b>{filaConversas}</b> conversa(s) aguardando humano · <b>{filaTickets}</b> chamado(s) sem atendente
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</span>}
          {podeDistribuir && (
            <button className="btn btn-primary" disabled={busy || filaConversas === 0} onClick={distribuir} title={filaConversas === 0 ? 'Sem conversas na fila' : 'Atribui as conversas em espera ao atendente de menor carga'}>
              {busy ? 'Distribuindo…' : <><i className="ti ti-arrows-shuffle" /> Distribuir conversas igualmente</>}
            </button>
          )}
        </div>
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>Atendente</th><th>Cargo (RH)</th><th>Papel</th><th>Unidade</th><th>Conversas</th><th>Chamados</th><th>Carga</th><th>Status</th></tr>
            </thead>
            <tbody>
              {atendentes.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum atendente SAC ativo. Cadastre colaboradores com papel SAC.</td></tr>
              )}
              {atendentes.map((a) => {
                const carga = a.conversas + a.tickets
                return (
                  <tr key={a.id}>
                    <td><b>{a.nome}</b>{a.email && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.email}</div>}</td>
                    <td>{a.cargo || <span style={{ color: 'var(--text-3)' }}>— sem ficha RH</span>}{a.area && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.area}</div>}</td>
                    <td><span style={pill('#EFE9F7', '#6b1f3a')}>{a.papel}</span></td>
                    <td>{a.unidadeNome || <span style={{ color: 'var(--text-3)' }}>Rede</span>}</td>
                    <td style={{ textAlign: 'center' }}>{a.conversas}</td>
                    <td style={{ textAlign: 'center' }}>{a.tickets}</td>
                    <td style={{ textAlign: 'center' }}><b style={{ color: carga === 0 ? 'var(--green)' : carga > 8 ? '#C2410C' : 'var(--brand-600)' }}>{carga}</b></td>
                    <td><span style={a.ativo ? pill('#E7F0EC', '#15803D') : pill('#FBE9EB', '#D85563')}>{a.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-info-circle" /> Atendente = colaborador com papel SAC (a mesma pessoa de Colaboradores / RH). A distribuição atribui a fila ao atendente de menor carga.
      </div>
    </>
  )
}
