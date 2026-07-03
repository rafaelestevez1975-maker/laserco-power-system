'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import { gerarFolha, alterarStatusFolha } from '@/app/(app)/rh/folha/actions'

export type FolhaRow = {
  id: string
  colaborador_id: string
  colaboradorNome: string
  cargo: string | null
  competencia: string
  salario_bruto: number
  inss: number
  irrf: number
  fgts: number
  outros_proventos: number
  outros_descontos: number
  decimo_terceiro: number
  salario_liquido: number
  status: string
}

type Props = {
  rows: FolhaRow[]
  competencia: string
  competencias: string[]
  podeGerir: boolean
  activeUnitId: string | null
  activeUnitName: string
  semDados: boolean
  kpis: { bruto: number; liquido: number; inss: number; irrf: number; fgts: number; total13: number }
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  aberta: { bg: '#FEF3C7', color: '#A16207', label: 'Aberta' },
  fechada: { bg: '#E0E7FF', color: '#3730A3', label: 'Fechada' },
  paga: { bg: '#E7F0EC', color: '#15803D', label: 'Paga' },
}

export function FolhaView(props: Props) {
  const { rows, competencia, competencias, podeGerir, activeUnitId, activeUnitName, semDados, kpis } = props
  const router = useRouter()
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [comp, setComp] = useState(competencia)
  const [holerite, setHolerite] = useState<FolhaRow | null>(null)

  function trocarComp(c: string) {
    setComp(c)
    router.push(`/rh/folha?comp=${c}`)
  }

  async function gerar(decimo: boolean) {
    setMsg(''); setErro(''); setBusy(true)
    const r = await gerarFolha(comp, activeUnitId, decimo)
    setBusy(false)
    if (!r.ok) { setErro(r.error || 'Erro ao gerar a folha.'); return }
    setMsg(`Folha de ${comp} gerada para ${r.gerados} colaborador(es)${decimo ? ' (com 13º)' : ''}.`)
    router.refresh()
  }

  async function mudarStatus(id: string, status: 'aberta' | 'fechada' | 'paga') {
    setMsg(''); setErro('')
    const r = await alterarStatusFolha(id, status)
    if (!r.ok) { setErro(r.error || 'Erro ao alterar o status.'); return }
    router.refresh()
  }

  return (
    <div>
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="mf" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Competência</label>
            <select value={comp} onChange={(e) => trocarComp(e.target.value)} style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }}>
              {competencias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{activeUnitName}</span>
          {podeGerir && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => gerar(false)}>
                <i className="ti ti-refresh" /> {busy ? 'Gerando…' : 'Gerar folha do mês'}
              </button>
              <button className="btn" disabled={busy} onClick={() => gerar(true)} title="Inclui o 13º salário no líquido">
                <i className="ti ti-gift" /> Gerar com 13º
              </button>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
          Cálculo automático sobre o salário bruto do cadastro: INSS e IRRF progressivos (2025), FGTS 8% (depósito) e 13º.
        </div>
      </div>

      {(msg || erro) && (
        <div style={{ fontSize: 12.5, margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, background: erro ? 'var(--red-bg)' : '#E7F0EC', color: erro ? 'var(--red)' : '#15803D' }}>
          {erro || msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, margin: '0 0 16px' }}>
        <div className="metric-box"><span>Salário bruto</span><b>{moedaBR(kpis.bruto)}</b></div>
        <div className="metric-box"><span>INSS</span><b style={{ color: '#D85563' }}>{moedaBR(kpis.inss)}</b></div>
        <div className="metric-box"><span>IRRF</span><b style={{ color: '#D85563' }}>{moedaBR(kpis.irrf)}</b></div>
        <div className="metric-box"><span>FGTS (8%)</span><b style={{ color: 'var(--text-2)' }}>{moedaBR(kpis.fgts)}</b></div>
        <div className="metric-box"><span>13º</span><b style={{ color: 'var(--brand-600)' }}>{moedaBR(kpis.total13)}</b></div>
        <div className="metric-box"><span>Líquido</span><b style={{ color: '#15803D' }}>{moedaBR(kpis.liquido)}</b></div>
      </div>

      {semDados && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '10px 14px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
          <i className="ti ti-database-off" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            Sem folha gerada nesta competência. {podeGerir ? 'Clique em "Gerar folha do mês".' : 'Aguarde o RH gerar a folha.'} Se a tabela não existir, aplique a migration <b>scripts/migrations/rh.sql</b> no lkii.
          </span>
        </div>
      )}

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th className="num-r">Bruto</th>
                <th className="num-r">INSS</th>
                <th className="num-r">IRRF</th>
                <th className="num-r">FGTS</th>
                <th className="num-r">13º</th>
                <th className="num-r">Líquido</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 36, color: 'var(--text-3)' }}>
                  <i className="ti ti-cash-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} /> Nenhuma folha nesta competência.
                </td></tr>
              )}
              {rows.map((r) => {
                const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.aberta
                return (
                  <tr key={r.id}>
                    <td><b>{r.colaboradorNome}</b>{r.cargo ? <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{r.cargo}</span> : null}</td>
                    <td className="num-r">{moedaBR(r.salario_bruto)}</td>
                    <td className="num-r" style={{ color: '#D85563' }}>{moedaBR(r.inss)}</td>
                    <td className="num-r" style={{ color: '#D85563' }}>{moedaBR(r.irrf)}</td>
                    <td className="num-r" style={{ color: 'var(--text-3)' }}>{moedaBR(r.fgts)}</td>
                    <td className="num-r">{r.decimo_terceiro ? moedaBR(r.decimo_terceiro) : ''}</td>
                    <td className="num-r"><b style={{ color: '#15803D' }}>{moedaBR(r.salario_liquido)}</b></td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span></td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn" onClick={() => setHolerite(r)} title="Ver holerite"><i className="ti ti-file-invoice" /></button>
                      {podeGerir && r.status === 'aberta' && <button className="btn" style={{ marginLeft: 6 }} onClick={() => mudarStatus(r.id, 'fechada')} title="Fechar">Fechar</button>}
                      {podeGerir && r.status === 'fechada' && <button className="btn" style={{ marginLeft: 6 }} onClick={() => mudarStatus(r.id, 'paga')} title="Marcar paga">Pagar</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {holerite && (
        <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) setHolerite(null) }}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-head">
              <h3><i className="ti ti-file-invoice" /> Holerite · {holerite.competencia}</h3>
              <button className="btn" onClick={() => setHolerite(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{holerite.colaboradorNome}{holerite.cargo ? ` · ${holerite.cargo}` : ''}</div>
              <Linha label="Salário bruto" valor={holerite.salario_bruto} />
              {holerite.outros_proventos > 0 && <Linha label="Outros proventos" valor={holerite.outros_proventos} />}
              {holerite.decimo_terceiro > 0 && <Linha label="13º salário" valor={holerite.decimo_terceiro} />}
              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '6px 0' }} />
              <Linha label="INSS" valor={-holerite.inss} desc />
              <Linha label="IRRF" valor={-holerite.irrf} desc />
              {holerite.outros_descontos > 0 && <Linha label="Outros descontos" valor={-holerite.outros_descontos} desc />}
              <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '6px 0' }} />
              <Linha label="Salário líquido" valor={holerite.salario_liquido} forte />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>FGTS depositado (não desconta do líquido): {moedaBR(holerite.fgts)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Linha({ label, valor, desc, forte }: { label: string; valor: number; desc?: boolean; forte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: forte ? 15 : 13, fontWeight: forte ? 700 : 400 }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span style={{ color: desc ? '#D85563' : forte ? '#15803D' : 'var(--text-1)' }}>{moedaBR(valor)}</span>
    </div>
  )
}
