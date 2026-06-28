'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { moverTicketFase, gerarPedidoCancelamento } from '@/app/(app)/sac/kanban/actions'
import { solicitarReembolso, criarAcordo } from '@/app/(app)/sac/actions'
import { buscarClientePorContato, type ClienteResumo } from '@/app/(app)/sac/triagem/actions'
import { moedaBR, dataHora } from '@/lib/fmt'
import { calcReembolso, primeiroPagamentoValido, MSG_DIA15, situacaoChamado } from '@/lib/sac'

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
  { nome: 'Contato com unidade', cor: '#2563EB' },
  { nome: 'Aguardando cliente', cor: '#9A6700' },
  { nome: 'Aguardando retorno interno', cor: '#64748B' },
  { nome: 'Em pagamento', cor: '#E0922A' },
  { nome: 'Concluído', cor: '#1F9D6B' },
]
// Paridade visual com o legado (SAC_PRIOS / sacBadgePrio, index.html:8905,8960): rótulo
// formatado (Baixa/Média/Alta/Crítica) + cor de texto e fundo próprios por prioridade.
const PRIO: Record<string, { l: string; c: string; b: string }> = {
  baixa: { l: 'Baixa', c: '#2563EB', b: '#E7EEFB' },
  media: { l: 'Média', c: '#B7791F', b: '#FBF3E2' },
  alta: { l: 'Alta', c: '#C2410C', b: '#FCEBE0' },
  critica: { l: 'Crítica', c: '#B91C1C', b: '#FBE6E6' },
  urgente: { l: 'Crítica', c: '#B91C1C', b: '#FBE6E6' },
}
const prioInfo = (p: string | null) => PRIO[(p || '').toLowerCase()] || PRIO.media
// Paridade com sacBadgeStatus (index.html:8961). Situação derivada de fase + SLA (lib/sac).
const STATUS_COR: Record<string, { c: string; b: string }> = {
  'Em andamento': { c: '#1E3A8A', b: '#E7EEFB' },
  'Concluído': { c: '#0F6B3A', b: '#E7F0EC' },
  'Em atraso': { c: '#B91C1C', b: '#FBE6E6' },
}
const money = (v: number | null) => (v == null ? null : moedaBR(v))

export function SacKanban({ tickets: ticketsProp, totais, erro }: { tickets: Ticket[]; totais?: Record<string, number>; erro?: string | null }) {
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>(ticketsProp)
  const [detail, setDetail] = useState<Ticket | null>(null)
  const [moving, setMoving] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  useEffect(() => setTickets(ticketsProp), [ticketsProp])

  async function moveTo(id: string, fase: string) {
    const t = tickets.find((x) => x.id === id)
    if (!t || (t.fase || 'Novo') === fase) return
    setAviso(null)
    setTickets((prev) => prev.map((x) => (x.id === id ? { ...x, fase } : x)))
    setMoving(true)
    const res = await moverTicketFase(id, fase)
    setMoving(false)
    if (!res.ok) { setTickets(ticketsProp); setAviso(res.error || 'Não foi possível mover o chamado.') }
    else router.refresh()
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id)
    const fase = e.over ? String(e.over.id) : null
    if (!fase) return
    await moveTo(id, fase)
  }

  if (erro) {
    return (
      <div className="rel-card" style={{ padding: 24, textAlign: 'center' }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 30, color: '#B91C1C' }} />
        <p style={{ fontWeight: 700, margin: '10px 0 2px' }}>Não foi possível carregar o Kanban</p>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{erro}</p>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => router.refresh()}><i className="ti ti-refresh" /> Tentar novamente</button>
      </div>
    )
  }

  return (
    <>
      {(moving || aviso) && (
        <div style={{ position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 200, padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 14px rgba(0,0,0,.15)', background: aviso ? '#FBE6E6' : '#fff', color: aviso ? '#B91C1C' : 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {moving ? <><i className="ti ti-loader" /> Movendo chamado…</> : <><i className="ti ti-alert-triangle" /> {aviso}</>}
        </div>
      )}
      <div className="rel-card" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b><i className="ti ti-layout-kanban" style={{ color: 'var(--brand-500)' }} /> Quadro de atendimentos</b>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Clique em → para avançar a fase</span>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {FASES.map((f) => (
            <Col key={f.nome} fase={f} total={totais?.[f.nome]} tickets={tickets.filter((t) => (t.fase || 'Novo') === f.nome)} onOpen={setDetail} onAdvance={moveTo} />
          ))}
        </div>
      </DndContext>
      {detail && <TicketModal t={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

// Coluna idêntica ao legado (sacKanban, index.html:9051): caixa surface-2 de 230px,
// cabeçalho em brand-600 SEM bolinha + contador brand-500. (Antes reusava as classes do
// Kanban do CRM — .kan-col 272px com bolinha colorida — o que divergia do index.)
function Col({ fase, tickets, total, onOpen, onAdvance }: { fase: { nome: string; cor: string }; tickets: Ticket[]; total?: number; onOpen: (t: Ticket) => void; onAdvance: (id: string, fase: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.nome })
  const totalReal = total ?? tickets.length
  const capado = total != null && total > tickets.length
  return (
    <div style={{ minWidth: 230, flex: '0 0 230px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 12, padding: '4px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--brand-600)' }}>
        {fase.nome}
        <span style={{ background: 'var(--brand-500)', color: '#fff', borderRadius: 20, padding: '0 7px', fontSize: 10 }}>{totalReal}</span>
      </div>
      {capado && <div style={{ fontSize: 10, color: 'var(--text-3)', padding: '0 6px 4px' }}>mostrando {tickets.length} mais recentes</div>}
      <div ref={setNodeRef} style={{ minHeight: 24, ...(isOver ? { outline: '2px dashed var(--brand-400)', outlineOffset: -4, borderRadius: 8 } : {}) }}>
        {tickets.map((t) => <Card key={t.id} t={t} onOpen={onOpen} onAdvance={onAdvance} />)}
      </div>
    </div>
  )
}

// Card idêntico ao legado (index.html:9052-9053): id · nome · "motivo · canal" e, no rodapé,
// badge de prioridade + seta "→" para avançar a fase (ou check verde na última fase).
function Card({ t, onOpen, onAdvance }: { t: Ticket; onOpen: (t: Ticket) => void; onAdvance: (id: string, fase: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id })
  const pi = prioInfo(t.prioridade)
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px,${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1, cursor: 'grab',
    background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${pi.c}`,
    borderRadius: 9, padding: 8, marginTop: 7,
  }
  const idx = FASES.findIndex((f) => f.nome === (t.fase || 'Novo'))
  const next = idx >= 0 && idx < FASES.length - 1 ? FASES[idx + 1].nome : null
  const motivoCanal = [t.motivo_label, t.canal].filter(Boolean).join(' · ')
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={() => onOpen(t)}>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.protocolo || `SAC-${t.numero}`}</div>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{t.nome_cliente || 'Cliente'}</div>
      {motivoCanal && <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0' }}>{motivoCanal}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: pi.b, color: pi.c }}>{pi.l}</span>
        {next ? (
          <button className="btn btn-ghost" style={{ padding: '2px 7px', fontSize: 11 }} title={`Avançar para ${next}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAdvance(t.id, next) }}>→</button>
        ) : (
          <i className="ti ti-circle-check" style={{ color: '#0F6B3A' }} />
        )}
      </div>
    </div>
  )
}

function TicketModal({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const router = useRouter()
  const [valorPago, setValorPago] = useState(t.valor_pago != null ? String(t.valor_pago) : '')
  const [sessoesContr, setSessoesContr] = useState('')
  const [sessoesFeitas, setSessoesFeitas] = useState('')
  const [multa, setMulta] = useState('30')
  const [isentar, setIsentar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const vp = Number(String(valorPago).replace(/\./g, '').replace(',', '.')) || 0
  const pctMulta = isentar ? 0 : Number(multa) || 0
  const contrNum = Math.max(0, Math.floor(Number(sessoesContr) || 0))
  const feitasNum = Math.max(0, Math.floor(Number(sessoesFeitas) || 0))
  // Sem sessões informadas → degrada para "valor pago − multa" (contr=1, feitas=0).
  const temSessoes = contrNum > 0
  const R = calcReembolso(vp, temSessoes ? contrNum : 1, temSessoes ? feitasNum : 0, pctMulta, isentar)
  const reembolso = R.fim

  const [modo, setModo] = useState<'vista' | 'parcelado'>('vista')
  const [vAcordo, setVAcordo] = useState('')
  const [nParc, setNParc] = useState('3')
  const [data1, setData1] = useState('')
  const vAc = Number(String(vAcordo).replace(/\./g, '').replace(',', '.')) || 0
  const nP = Math.min(24, Math.max(1, Number(nParc) || 1))
  const valorParcela = Math.round((vAc / nP) * 100) / 100
  const data1Valida = !data1 || primeiroPagamentoValido(data1)

  const [ficha, setFicha] = useState<ClienteResumo | null>(null)
  const [buscandoFicha, setBuscandoFicha] = useState(false)
  const sessRestantes = ficha?.achou ? Math.max(0, (ficha.agendamentos ?? 0) - (ficha.concluidos ?? 0)) : 0
  const valorSessao = ficha?.achou && (ficha.agendamentos ?? 0) > 0 ? Math.round(((ficha.totalGasto ?? 0) / (ficha.agendamentos ?? 1)) * 100) / 100 : 0

  async function buscarFicha() {
    setBuscandoFicha(true)
    const r = await buscarClientePorContato(t.telefone_cliente, t.cpf_cliente)
    setBuscandoFicha(false)
    setFicha(r)
  }

  async function lancar() {
    setMsg(''); setSaving(true)
    const resumo = temSessoes
      ? `Reembolso por saldo de sessões: ${R.restantes} restante(s) × ${moedaBR(R.vSess)} = ${moedaBR(R.saldo)}${R.multa > 0 ? ` − multa ${pctMulta}% (${moedaBR(R.multa)})` : ' (sem multa)'} = ${moedaBR(R.fim)}.`
      : `Reembolso à vista${R.multa > 0 ? ` − multa ${pctMulta}%` : ' (sem multa)'} = ${moedaBR(R.fim)}.`
    const res = await solicitarReembolso(t.id, reembolso, pctMulta, resumo)
    setSaving(false)
    if (!res.ok) setMsg(res.error || 'Erro ao lançar.')
    else { setMsg('Reembolso lançado no Financeiro (Contas a Pagar) e chamado movido para "Em pagamento".'); router.refresh() }
  }

  // Paridade sacGerarPedido (legacy:9225): registra o PEDIDO de cancelamento na ficha do
  // chamado (motivo=Reembolso, fase=Em pagamento, anota observações) SEM lançar no Financeiro.
  async function gerarPedido() {
    setMsg(''); setSaving(true)
    const res = await gerarPedidoCancelamento(t.id, reembolso, temSessoes ? R.restantes : 0, R.multa > 0)
    setSaving(false)
    if (!res.ok) setMsg(res.error || 'Erro ao gerar o pedido.')
    else { setMsg('Pedido de cancelamento gerado e anexado à ficha. Chamado movido para "Em pagamento". Agora lance o reembolso no Financeiro.'); router.refresh() }
  }

  async function criarAc() {
    setMsg('')
    if (!(vAc > 0)) { setMsg('Informe o valor total do acordo.'); return }
    if (!data1) { setMsg('Informe a data do 1º pagamento.'); return }
    if (!primeiroPagamentoValido(data1)) { setMsg(MSG_DIA15); return }
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
        {row('Prioridade', <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: prioInfo(t.prioridade).b, color: prioInfo(t.prioridade).c }}>{prioInfo(t.prioridade).l}</span>)}
        {row('Situação', (() => { const s = situacaoChamado(t.fase, t.sla_violado); const c = STATUS_COR[s]; return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: c.b, color: c.c }}>{s}</span> })())}
        {row('SLA', t.sla_violado ? '⏰ Violado' : 'OK')}
        {row('Valor pago', money(t.valor_pago))}
        {row('Devolução', money(t.valor_devolucao))}
        {row('Aberto em', dataHora(t.criado_em) || null)}
        {t.observacoes && <div style={{ marginTop: 10 }}><div style={{ color: 'var(--text-2)', fontSize: 12, marginBottom: 3 }}>Observações</div><div style={{ fontSize: 13, background: 'var(--surface-2)', padding: 10, borderRadius: 8 }}>{t.observacoes}</div></div>}

        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={buscandoFicha} onClick={buscarFicha}><i className="ti ti-id-badge-2" /> {buscandoFicha ? 'Buscando…' : 'Buscar ficha do cliente'}</button>
          {ficha && !ficha.achou && <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6 }}>Cliente não localizado no cadastro (CPF/telefone) ou sem permissão.</p>}
          {ficha?.achou && (
            <div style={{ marginTop: 8, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{ficha.nome}{ficha.ativo ? ' · ativo' : ''}{ficha.cidade ? ` · ${ficha.cidade}/${ficha.estado ?? ''}` : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 4 }}>
                <span>Agendamentos: <b>{ficha.agendamentos}</b></span>
                <span>Sessões feitas: <b>{ficha.concluidos}</b></span>
                <span>Sessões restantes: <b>{sessRestantes}</b></span>
                <span>Total gasto: <b>{money(ficha.totalGasto ?? 0)}</b></span>
                <span>Créditos: <b>{money(ficha.saldoCreditos ?? 0)}</b></span>
                <span>Valor/sessão: <b>{money(valorSessao)}</b></span>
              </div>
              {(ficha.agendamentos ?? 0) > 0 && (
                <button className="btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => {
                  setModo('vista')
                  setValorPago(String(Math.round((ficha.totalGasto ?? 0) * 100) / 100))
                  setSessoesContr(String(ficha.agendamentos ?? 0))
                  setSessoesFeitas(String(ficha.concluidos ?? 0))
                }}>
                  <i className="ti ti-calculator" /> Usar dados do contrato ({ficha.concluidos}/{ficha.agendamentos} sessões · {money(ficha.totalGasto ?? 0)})
                </button>
              )}
            </div>
          )}
        </div>

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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Sessões contratadas</label>
                  <input type="number" min={0} value={sessoesContr} onChange={(e) => setSessoesContr(e.target.value)} placeholder="ex.: 10"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Sessões já feitas</label>
                  <input type="number" min={0} value={sessoesFeitas} onChange={(e) => setSessoesFeitas(e.target.value)} placeholder="ex.: 3"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, margin: '8px 0' }}>
                <input type="checkbox" checked={isentar} onChange={(e) => setIsentar(e.target.checked)} /> Isentar multa (rescisão por nossa culpa)
              </label>
              {temSessoes ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 12px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: 10, fontSize: 12.5 }}>
                  <span>Total pago</span><b style={{ textAlign: 'right' }}>{money(vp)}</b>
                  <span>Valor por sessão ({contrNum} sessões)</span><span style={{ textAlign: 'right' }}>{money(R.vSess)}</span>
                  <span>Sessões já feitas ({feitasNum}) — abatidas</span><span style={{ textAlign: 'right', color: '#B91C1C' }}>− {money(R.consumido)}</span>
                  <span>Saldo das {R.restantes} sessões restantes</span><b style={{ textAlign: 'right' }}>{money(R.saldo)}</b>
                  <span>Multa de rescisão{isentar ? ' (isenta)' : ` ${pctMulta}%`}</span><span style={{ textAlign: 'right', color: '#B91C1C' }}>− {money(R.multa)}</span>
                  <span style={{ fontWeight: 800, borderTop: '1px solid var(--line)', paddingTop: 5, marginTop: 3 }}>Valor a reembolsar</span>
                  <b style={{ textAlign: 'right', fontWeight: 800, borderTop: '1px solid var(--line)', paddingTop: 5, marginTop: 3, color: 'var(--brand-600)' }}>{money(R.fim)}</b>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ fontSize: 13 }}>Reembolso ao cliente</span>
                  <b style={{ fontSize: 18, color: 'var(--brand-600)' }}>{money(reembolso)}</b>
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}><i className="ti ti-info-circle" /> A multa incide só sobre o saldo das sessões não usadas; as feitas são abatidas. Informe as sessões (ou use “dados do contrato”) para o cálculo por saldo.</p>
              {msg && <p style={{ fontSize: 12.5, color: 'var(--brand-600)', marginTop: 8 }}>{msg}</p>}
              <button className="btn" disabled={saving || reembolso <= 0} onClick={gerarPedido} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
                {saving ? 'Processando…' : <><i className="ti ti-file-text" /> Gerar pedido de cancelamento</>}
              </button>
              <button className="btn btn-primary" disabled={saving || reembolso <= 0} onClick={lancar} style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}>
                {saving ? 'Lançando…' : <><i className="ti ti-businessplan" /> Lançar reembolso no Financeiro</>}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}><i className="ti ti-info-circle" /> "Gerar pedido" anexa o pedido de cancelamento à ficha e abre o fluxo (sem mexer no Financeiro). "Lançar reembolso" cria a despesa em Contas a Pagar.</p>
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
              {!data1Valida && <p style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}><i className="ti ti-alert-triangle" /> {MSG_DIA15}</p>}
              {msg && <p style={{ fontSize: 12.5, color: 'var(--brand-600)', marginTop: 8 }}>{msg}</p>}
              <button className="btn btn-primary" disabled={saving || vAc <= 0 || !data1Valida} onClick={criarAc} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
                {saving ? 'Criando…' : <><i className="ti ti-calendar-dollar" /> Criar acordo (aguardando OK do gestor)</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
