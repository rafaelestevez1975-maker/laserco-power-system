'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { moverTicketFase } from '@/app/(app)/sac/kanban/actions'
import { solicitarReembolso, criarAcordo } from '@/app/(app)/sac/actions'
import { moedaBR } from '@/lib/fmt'

export type Ticket = {
  id: string; numero: number | null; protocolo: string | null; nome_cliente: string | null
  cpf_cliente: string | null; email_cliente: string | null; telefone_cliente: string | null
  canal: string | null; motivo_label: string | null; prioridade: string | null; fase: string | null
  status: string | null; area_reclamada: string | null; observacoes: string | null
  valor_pago: number | null; valor_devolucao: number | null; sla_violado: boolean | null; criado_em: string | null
}

const FASES: { nome: string; cor: string }[] = [
  { nome: 'Novo', cor: '#8A2A41' },
  { nome: 'Contato com cliente', cor: '#3D7FD1' },
  { nome: 'Em pagamento', cor: '#E0922A' },
  { nome: 'Concluído', cor: '#1F9D6B' },
]
const prioColor = (p: string | null) => (p === 'alta' || p === 'critica' ? '#C2410C' : p === 'baixa' ? '#64748B' : '#9A6700')
const money = (v: number | null) => (v == null ? null : moedaBR(v))

export function SacKanban({ tickets: ticketsProp }: { tickets: Ticket[] }) {
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>(ticketsProp)
  const [detail, setDetail] = useState<Ticket | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  useEffect(() => setTickets(ticketsProp), [ticketsProp])

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    const fase = e.over ? String(e.over.id) : null
    if (!fase) return
    const t = tickets.find((x) => x.id === id)
    if (!t || t.fase === fase) return
    setTickets((prev) => prev.map((x) => (x.id === id ? { ...x, fase } : x)))
    const res = await moverTicketFase(id, fase)
    if (!res.ok) { setTickets(ticketsProp); alert(res.error || 'Não foi possível mover.') }
    else router.refresh()
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {FASES.map((f) => (
            <Col key={f.nome} fase={f} tickets={tickets.filter((t) => (t.fase || 'Novo') === f.nome)} onOpen={setDetail} />
          ))}
        </div>
      </DndContext>
      {detail && <TicketModal t={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

function Col({ fase, tickets, onOpen }: { fase: { nome: string; cor: string }; tickets: Ticket[]; onOpen: (t: Ticket) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.nome })
  return (
    <div className="kan-col">
      <div className="kan-head"><span className="dot" style={{ background: fase.cor }} /><span className="t">{fase.nome}</span><span className="cnt">{tickets.length}</span></div>
      <div ref={setNodeRef} className="kan-body" style={isOver ? { outline: '2px dashed var(--brand-400)', outlineOffset: -4, borderRadius: 8 } : undefined}>
        {tickets.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-3)' }}>Sem chamados</div>}
        {tickets.map((t) => <Card key={t.id} t={t} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

function Card({ t, onOpen }: { t: Ticket; onOpen: (t: Ticket) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id })
  const style: React.CSSProperties = { transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined, opacity: isDragging ? 0.5 : 1, cursor: 'grab' }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="lead-card" onClick={() => onOpen(t)}>
      <div className="lc-top">
        <span className="lc-name">{t.nome_cliente || 'Cliente'}</span>
        {t.sla_violado && <span title="SLA violado">⏰</span>}
      </div>
      {t.motivo_label && <div className="lc-serv">{t.motivo_label}</div>}
      <div className="lc-meta">
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.protocolo || `SAC-${t.numero}`}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.canal && <span className="orig-tag" style={{ fontSize: 10 }}>{t.canal}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, color: prioColor(t.prioridade) }}>{(t.prioridade || '').toUpperCase()}</span>
        </span>
      </div>
    </div>
  )
}

function TicketModal({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const router = useRouter()
  const [valorPago, setValorPago] = useState(t.valor_pago != null ? String(t.valor_pago) : '')
  const [multa, setMulta] = useState('30')
  const [isentar, setIsentar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const vp = Number(String(valorPago).replace(/\./g, '').replace(',', '.')) || 0
  const pctMulta = isentar ? 0 : Number(multa) || 0
  const reembolso = Math.max(0, Math.round(vp * (1 - pctMulta / 100) * 100) / 100)

  const [modo, setModo] = useState<'vista' | 'parcelado'>('vista')
  const [vAcordo, setVAcordo] = useState('')
  const [nParc, setNParc] = useState('3')
  const [data1, setData1] = useState('')
  const vAc = Number(String(vAcordo).replace(/\./g, '').replace(',', '.')) || 0
  const nP = Math.min(24, Math.max(1, Number(nParc) || 1))
  const valorParcela = Math.round((vAc / nP) * 100) / 100

  async function lancar() {
    setMsg(''); setSaving(true)
    const res = await solicitarReembolso(t.id, reembolso, pctMulta)
    setSaving(false)
    if (!res.ok) setMsg(res.error || 'Erro ao lançar.')
    else { setMsg('Reembolso lançado no Financeiro (Contas a Pagar) e chamado movido para "Em pagamento".'); router.refresh() }
  }

  async function criarAc() {
    setMsg('')
    if (!(vAc > 0)) { setMsg('Informe o valor total do acordo.'); return }
    if (!data1) { setMsg('Informe a data do 1º pagamento.'); return }
    setSaving(true)
    const res = await criarAcordo(t.id, vAc, nP, data1)
    setSaving(false)
    if (!res.ok) setMsg(res.error || 'Erro ao criar acordo.')
    else { setMsg('Acordo criado (aguardando OK do gestor). Acompanhe em SAC · Pagamentos.'); router.refresh() }
  }

  const row = (label: string, val: React.ReactNode) => val ? (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span><span>{val}</span>
    </div>
  ) : null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="lc-card" style={{ width: '100%', maxWidth: 520, padding: 22, background: '#fff', maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h3 className="lc-title" style={{ fontSize: 18 }}>{t.protocolo || `SAC-${t.numero}`}</h3>
          <span className="orig-tag" style={{ fontSize: 11 }}>{t.fase}</span>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        {row('Cliente', t.nome_cliente)}
        {row('CPF', t.cpf_cliente)}
        {row('Telefone', t.telefone_cliente)}
        {row('E-mail', t.email_cliente)}
        {row('Canal', t.canal)}
        {row('Motivo', t.motivo_label)}
        {row('Área', t.area_reclamada)}
        {row('Prioridade', t.prioridade)}
        {row('Status', t.status)}
        {row('SLA', t.sla_violado ? '⏰ Violado' : 'OK')}
        {row('Valor pago', money(t.valor_pago))}
        {row('Devolução', money(t.valor_devolucao))}
        {row('Aberto em', t.criado_em ? new Date(t.criado_em).toLocaleString('pt-BR') : null)}
        {t.observacoes && <div style={{ marginTop: 10 }}><div style={{ color: 'var(--text-2)', fontSize: 12, marginBottom: 3 }}>Observações</div><div style={{ fontSize: 13, background: 'var(--surface-2)', padding: 10, borderRadius: 8 }}>{t.observacoes}</div></div>}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}><i className="ti ti-cash" /> Reembolso / Acordo</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className={`btn ${modo === 'vista' ? 'btn-primary' : ''}`} onClick={() => { setModo('vista'); setMsg('') }}>À vista</button>
            <button className={`btn ${modo === 'parcelado' ? 'btn-primary' : ''}`} onClick={() => { setModo('parcelado'); setMsg('') }}>Acordo parcelado</button>
          </div>

          {modo === 'vista' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Valor pago (R$)</label>
                  <input value={valorPago} onChange={(e) => setValorPago(e.target.value)} placeholder="0,00"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Multa (%)</label>
                  <input value={multa} onChange={(e) => setMulta(e.target.value)} disabled={isentar}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, opacity: isentar ? 0.5 : 1 }} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, margin: '8px 0' }}>
                <input type="checkbox" checked={isentar} onChange={(e) => setIsentar(e.target.checked)} /> Isentar multa (rescisão por nossa culpa)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8 }}>
                <span style={{ fontSize: 13 }}>Reembolso ao cliente</span>
                <b style={{ fontSize: 18, color: 'var(--brand-600)' }}>{money(reembolso)}</b>
              </div>
              {msg && <p style={{ fontSize: 12.5, color: 'var(--brand-600)', marginTop: 8 }}>{msg}</p>}
              <button className="btn btn-primary" disabled={saving || reembolso <= 0} onClick={lancar} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
                {saving ? 'Lançando…' : <><i className="ti ti-businessplan" /> Lançar reembolso no Financeiro</>}
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Valor total (R$)</label>
                  <input value={vAcordo} onChange={(e) => setVAcordo(e.target.value)} placeholder="0,00"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Parcelas</label>
                  <input type="number" min={1} max={24} value={nParc} onChange={(e) => setNParc(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>1º pagamento</label>
                  <input type="date" value={data1} onChange={(e) => setData1(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8, marginTop: 8 }}>
                <span style={{ fontSize: 13 }}>{nP}x de</span>
                <b style={{ fontSize: 18, color: 'var(--brand-600)' }}>{money(valorParcela)}</b>
              </div>
              {msg && <p style={{ fontSize: 12.5, color: 'var(--brand-600)', marginTop: 8 }}>{msg}</p>}
              <button className="btn btn-primary" disabled={saving || vAc <= 0} onClick={criarAc} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
                {saving ? 'Criando…' : <><i className="ti ti-calendar-dollar" /> Criar acordo (aguardando OK do gestor)</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
