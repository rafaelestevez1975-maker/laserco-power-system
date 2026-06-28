'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarChamado, solicitarReembolso, criarAcordo } from '@/app/(app)/sac/actions'
import { buscarClientePorContato, type ClienteResumo } from '@/app/(app)/sac/triagem/actions'
import { moedaBR, dataBR } from '@/lib/fmt'
import { calcReembolso, primeiroPagamentoValido, MSG_DIA15, lerObsMeta, situacaoChamado, type Situacao } from '@/lib/sac'

export type ChamadoRow = {
  id: string; numero: number | null; protocolo: string | null; nome_cliente: string | null; telefone_cliente: string | null
  email_cliente: string | null; cpf_cliente: string | null; canal: string | null; unidade_id: string | null
  motivo_label: string | null; prioridade: string | null; fase: string | null; sla_violado: boolean | null
  atribuido_para: string | null; observacoes: string | null
  area_reclamada?: string | null; valor_pago?: number | null; valor_devolucao?: number | null
  multa_aplicada?: boolean | null; pago?: boolean | null; criado_em?: string | null
}
type Atend = { id: string; nome: string }
type Unidade = { id: string; nome: string }

const PRIORIDADES: { k: string; l: string }[] = [
  { k: 'baixa', l: 'Baixa' }, { k: 'media', l: 'Média' }, { k: 'alta', l: 'Alta' }, { k: 'urgente', l: 'Crítica' },
]
const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const TIPOS = ['Franquia', 'Própria']
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
const cap = (s: string | null) => (s || '').replace(/^\w/, (c) => c.toUpperCase())
const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color, display: 'inline-block', whiteSpace: 'nowrap' })
// Cores idênticas ao SAC_PRIOS do legado (index.html:8905): baixa azul, média marrom, alta laranja, crítica vermelho.
const prioPill = (p: string | null) => (p === 'urgente' ? pill('#FBE6E6', '#B91C1C') : p === 'alta' ? pill('#FCEBE0', '#C2410C') : p === 'baixa' ? pill('#E7EEFB', '#2563EB') : pill('#FBF3E2', '#B7791F'))
const fasePill = (f: string | null) => (f === 'Concluído' ? pill('#E7F0EC', '#15803D') : f === 'Em pagamento' ? pill('#FBEFD9', '#9A6700') : (f || '').startsWith('Aguardando') ? pill('#EEF2F7', '#64748B') : f && f.includes('Contato') ? pill('#E6F0FB', '#3D7FD1') : pill('#F7E7EB', '#8A2A41'))
const sitPill = (s: Situacao) => (s === 'Concluído' ? pill('#E7F0EC', '#0F6B3A') : s === 'Em atraso' ? pill('#FBE6E6', '#B91C1C') : pill('#E7EEFB', '#1E3A8A'))
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

export function ChamadosTabela({ tickets, atendentes, motivos, uniNome, unidades }: {
  tickets: ChamadoRow[]; atendentes: Atend[]; motivos: string[]; uniNome: Record<string, string>; unidades: Unidade[]
}) {
  const [edit, setEdit] = useState<ChamadoRow | null>(null)
  const router = useRouter()
  const atNome = (id: string | null) => (id ? (atendentes.find((a) => a.id === id)?.nome ?? '—') : '—')

  return (
    <>
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>Protocolo</th><th>Cliente</th><th>Canal</th><th>Unidade</th><th>Atendente</th><th>Motivo</th><th>Prioridade</th><th>Fase</th><th>Status</th><th>SLA</th><th></th></tr>
            </thead>
            <tbody>
              {tickets.length === 0 && <tr><td colSpan={11} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum chamado para os filtros selecionados.</td></tr>}
              {tickets.map((t) => {
                const tipo = lerObsMeta(t.observacoes).tipo
                const sit = situacaoChamado(t.fase, t.sla_violado)
                return (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(t)} title="Clique para editar">
                    <td><b>{t.protocolo || `SAC-${t.numero ?? ''}`}</b></td>
                    <td>{t.nome_cliente || ''}{t.telefone_cliente && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.telefone_cliente}</div>}</td>
                    <td>{t.canal || ''}</td>
                    <td>{t.unidade_id ? (uniNome[t.unidade_id] ?? '') : <span style={{ color: 'var(--text-3)' }}>Central</span>}{tipo && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{tipo}</div>}</td>
                    <td>{t.atribuido_para ? atNome(t.atribuido_para) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                    <td>{t.motivo_label || ''}</td>
                    <td><span style={prioPill(t.prioridade)}>{PRIORIDADES.find((x) => x.k === t.prioridade)?.l ?? cap(t.prioridade)}</span></td>
                    <td><span style={fasePill(t.fase)}>{t.fase || ''}</span></td>
                    <td><span style={sitPill(sit)}>{sit}</span></td>
                    <td>{t.sla_violado ? <span style={pill('#FBE9EB', '#D85563')}><i className="ti ti-alarm" /> Violado</span> : <span style={pill('#E7F0EC', '#15803D')}>OK</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }} title="Editar chamado" onClick={(e) => { e.stopPropagation(); setEdit(t) }}><i className="ti ti-edit" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <EditModal t={edit} atendentes={atendentes} motivos={motivos} unidades={unidades} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh() }} />}
    </>
  )
}

function EditModal({ t, atendentes, motivos, unidades, onClose, onSaved }: { t: ChamadoRow; atendentes: Atend[]; motivos: string[]; unidades: Unidade[]; onClose: () => void; onSaved: () => void }) {
  const meta = lerObsMeta(t.observacoes)
  const [f, setF] = useState({
    nome_cliente: t.nome_cliente || '', telefone_cliente: t.telefone_cliente || '', email_cliente: t.email_cliente || '', cpf_cliente: t.cpf_cliente || '',
    canal: t.canal || 'Manual', unidade_id: t.unidade_id || '', tipo: meta.tipo || '', data_reclamacao: meta.dataRecl || '',
    motivo_label: t.motivo_label || '', prioridade: t.prioridade || 'media', fase: t.fase || 'Novo', atribuido_para: t.atribuido_para || '', observacoes: meta.texto || '',
    area_reclamada: t.area_reclamada || '', valor_pago: t.valor_pago != null ? String(t.valor_pago) : '', valor_devolucao: t.valor_devolucao != null ? String(t.valor_devolucao) : '',
    multa_aplicada: !!t.multa_aplicada, pago: !!t.pago,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ficha, setFicha] = useState<ClienteResumo | null>(null)
  const [fichaBusy, setFichaBusy] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const motOpts = [...new Set([t.motivo_label, ...motivos].filter(Boolean))] as string[]
  const canalOpts = [...new Set([t.canal, ...CANAIS].filter(Boolean))] as string[]

  async function buscarFicha() {
    setFichaBusy(true)
    const r = await buscarClientePorContato(f.telefone_cliente, f.cpf_cliente)
    setFichaBusy(false)
    setFicha(r)
  }

  async function salvar() {
    if (!f.nome_cliente.trim()) { setErr('Informe o nome do cliente.'); return }
    setBusy(true); setErr('')
    const r = await atualizarChamado(t.id, {
      nome_cliente: f.nome_cliente, telefone_cliente: f.telefone_cliente, email_cliente: f.email_cliente, cpf_cliente: f.cpf_cliente,
      canal: f.canal, unidade_id: f.unidade_id || null, tipo: f.tipo, data_reclamacao: f.data_reclamacao,
      motivo_label: f.motivo_label, prioridade: f.prioridade, fase: f.fase, atribuido_para: f.atribuido_para || null, observacoes: f.observacoes,
      area_reclamada: f.area_reclamada, valor_pago: f.valor_pago, valor_devolucao: f.valor_devolucao,
      multa_aplicada: f.multa_aplicada, pago: f.pago,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 620, maxHeight: '92vh', overflow: 'auto' }}>
        <div className="modal-head"><h3><i className="ti ti-headset" /> Editar {t.protocolo || `SAC-${t.numero ?? ''}`}</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div className="mf"><label>Cliente</label><input style={inp} value={f.nome_cliente} onChange={(e) => set('nome_cliente', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Telefone</label><input style={inp} value={f.telefone_cliente} onChange={(e) => set('telefone_cliente', e.target.value)} /></div>
            <div className="mf"><label>E-mail</label><input style={inp} value={f.email_cliente} onChange={(e) => set('email_cliente', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="mf"><label>CPF</label><input style={inp} value={f.cpf_cliente} onChange={(e) => set('cpf_cliente', e.target.value)} /></div>
            <div className="mf"><label>Canal</label>
              <select style={inp} value={f.canal} onChange={(e) => set('canal', e.target.value)}>{canalOpts.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div className="mf"><label>Motivo</label>
              <select style={inp} value={f.motivo_label} onChange={(e) => set('motivo_label', e.target.value)}>
                <option value="">—</option>{motOpts.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Unidade</label>
              <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
                <option value="">Central / sem unidade</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div className="mf"><label>Tipo da unidade</label>
              <select style={inp} value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                <option value="">—</option>{TIPOS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="mf"><label>Data da reclamação</label><input style={inp} type="date" value={f.data_reclamacao} onChange={(e) => set('data_reclamacao', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Prioridade</label>
              <select style={inp} value={f.prioridade} onChange={(e) => set('prioridade', e.target.value)}>{PRIORIDADES.map((p) => <option key={p.k} value={p.k}>{p.l}</option>)}</select>
            </div>
            <div className="mf"><label>Fase</label>
              <select style={inp} value={f.fase} onChange={(e) => set('fase', e.target.value)}>{FASES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            </div>
            <div className="mf"><label>Atendente</label>
              <select style={inp} value={f.atribuido_para} onChange={(e) => set('atribuido_para', e.target.value)}>
                <option value="">Sem atendente</option>{atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="mf"><label>Serviço / pacote reclamado</label><input style={inp} value={f.area_reclamada} onChange={(e) => set('area_reclamada', e.target.value)} placeholder="Ex.: Pacote axila + virilha" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Valor pago (R$)</label><input style={inp} inputMode="decimal" value={f.valor_pago} onChange={(e) => set('valor_pago', e.target.value)} placeholder="0,00" /></div>
            <div className="mf"><label>Reembolso solicitado (R$)</label><input style={inp} inputMode="decimal" value={f.valor_devolucao} onChange={(e) => set('valor_devolucao', e.target.value)} placeholder="0,00" /></div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={f.multa_aplicada} onChange={(e) => set('multa_aplicada', e.target.checked)} /> Multa aplicada</label>
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={f.pago} onChange={(e) => set('pago', e.target.checked)} /> Pagamento/reembolso realizado</label>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <b style={{ fontSize: 13 }}><i className="ti ti-id-badge-2" style={{ color: 'var(--brand-500)' }} /> Ficha do cliente no sistema</b>
              <button type="button" className="btn" disabled={fichaBusy} onClick={buscarFicha}><i className="ti ti-search" /> {fichaBusy ? 'Buscando…' : 'Buscar contratos, pagamentos e sessões'}</button>
            </div>
            {ficha && !ficha.achou && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6 }}>Cliente não encontrado pelo CPF/telefone informado (ou sem permissão para ver a ficha).</div>}
            {ficha?.achou && (
              <div style={{ marginTop: 8, fontSize: 12.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 14px' }}>
                <span><b>{ficha.nome}</b>{ficha.cidade ? ` · ${ficha.cidade}/${ficha.estado ?? ''}` : ''}</span>
                <span>{ficha.ativo ? '🟢 Ativo' : '⚪ Inativo'}{ficha.verificado ? ' · verificado' : ''}</span>
                <span>Agendamentos: <b>{ficha.agendamentos ?? 0}</b></span>
                <span>Sessões concluídas: <b>{ficha.concluidos ?? 0}</b></span>
                <span>Total gasto: <b>{moedaBR(ficha.totalGasto)}</b></span>
                <span>Créditos: <b>{moedaBR(ficha.saldoCreditos)}</b></span>
                {(ficha.totalGasto ?? 0) > 0 && (
                  <button type="button" className="btn" style={{ gridColumn: '1 / -1', marginTop: 4 }} onClick={() => set('valor_pago', String(ficha.totalGasto))}>
                    <i className="ti ti-arrow-down" /> Usar total gasto como “Valor pago” ({moedaBR(ficha.totalGasto)})
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="mf"><label>Observações</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>

          <Reembolso t={t} ficha={ficha} valorPagoForm={f.valor_pago} onDone={onSaved} />
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
      </div>
    </div>
  )
}

// Calculadora automática de cancelamento e reembolso (paridade com o legado sacReembRender/sacCalcReembolso),
// usando as actions reais (solicitarReembolso → Contas a Pagar / criarAcordo → parcelado aguardando OK do gestor).
function Reembolso({ t, ficha, valorPagoForm, onDone }: { t: ChamadoRow; ficha: ClienteResumo | null; valorPagoForm: string; onDone: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [modo, setModo] = useState<'vista' | 'parcelado'>('vista')
  const [valorPago, setValorPago] = useState(valorPagoForm || (t.valor_pago != null ? String(t.valor_pago) : ''))
  const [sessoesContr, setSessoesContr] = useState('')
  const [sessoesFeitas, setSessoesFeitas] = useState('')
  const [multa, setMulta] = useState('30')
  const [isentar, setIsentar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  const vp = Number(String(valorPago).replace(/\./g, '').replace(',', '.')) || 0
  const pctMulta = isentar ? 0 : Number(multa) || 0
  const contrNum = Math.max(0, Math.floor(Number(sessoesContr) || 0))
  const feitasNum = Math.max(0, Math.floor(Number(sessoesFeitas) || 0))
  const temSessoes = contrNum > 0
  const R = calcReembolso(vp, temSessoes ? contrNum : 1, temSessoes ? feitasNum : 0, pctMulta, isentar)
  const reembolso = R.fim

  const [vAcordo, setVAcordo] = useState('')
  const [nParc, setNParc] = useState('3')
  const [data1, setData1] = useState('')
  const vAc = Number(String(vAcordo).replace(/\./g, '').replace(',', '.')) || 0
  const nP = Math.min(24, Math.max(1, Number(nParc) || 1))
  const valorParcela = Math.round((vAc / nP) * 100) / 100
  const data1Valida = !data1 || primeiroPagamentoValido(data1)
  const money = (v: number | null) => (v == null ? '' : moedaBR(v))

  function usarFicha() {
    if (!ficha?.achou) return
    setModo('vista')
    setValorPago(String(Math.round((ficha.totalGasto ?? 0) * 100) / 100))
    setSessoesContr(String(ficha.agendamentos ?? 0))
    setSessoesFeitas(String(ficha.concluidos ?? 0))
  }

  async function lancar() {
    setMsg(''); setErro(''); setSaving(true)
    const resumo = temSessoes
      ? `Reembolso por saldo de sessões: ${R.restantes} restante(s) × ${moedaBR(R.vSess)} = ${moedaBR(R.saldo)}${R.multa > 0 ? ` − multa ${pctMulta}% (${moedaBR(R.multa)})` : ' (sem multa)'} = ${moedaBR(R.fim)}.`
      : `Reembolso à vista${R.multa > 0 ? ` − multa ${pctMulta}%` : ' (sem multa)'} = ${moedaBR(R.fim)}.`
    const res = await solicitarReembolso(t.id, reembolso, pctMulta, resumo)
    setSaving(false)
    if (!res.ok) setErro(res.error || 'Erro ao lançar.')
    else { setMsg('Reembolso lançado no Financeiro (Contas a Pagar) e chamado movido para “Em pagamento”.'); onDone() }
  }

  async function criarAc() {
    setMsg(''); setErro('')
    if (!(vAc > 0)) { setErro('Informe o valor total do acordo.'); return }
    if (!data1) { setErro('Informe a data do 1º pagamento.'); return }
    if (!primeiroPagamentoValido(data1)) { setErro(MSG_DIA15); return }
    setSaving(true)
    const res = await criarAcordo(t.id, vAc, nP, data1)
    setSaving(false)
    if (!res.ok) setErro(res.error || 'Erro ao criar acordo.')
    else { setMsg('Acordo criado (aguardando OK do gestor). Acompanhe em SAC · Pagamentos.'); onDone() }
  }

  const cell: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

  return (
    <div style={{ borderTop: '2px solid var(--line)', paddingTop: 12 }}>
      <button type="button" className="btn" onClick={() => setAberto((v) => !v)} style={{ width: '100%', justifyContent: 'space-between' }}>
        <span><i className="ti ti-receipt-refund" style={{ color: 'var(--brand-500)' }} /> Cancelamento e reembolso — cálculo automático</span>
        <i className={`ti ti-chevron-${aberto ? 'up' : 'down'}`} />
      </button>

      {aberto && (
        <div style={{ marginTop: 12 }}>
          {ficha?.achou && (ficha.agendamentos ?? 0) > 0 && (
            <button type="button" className="btn" style={{ marginBottom: 10, fontSize: 12 }} onClick={usarFicha}>
              <i className="ti ti-calculator" /> Usar dados do contrato ({ficha.concluidos}/{ficha.agendamentos} sessões · {money(ficha.totalGasto ?? 0)})
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" className={`btn ${modo === 'vista' ? 'btn-primary' : ''}`} onClick={() => { setModo('vista'); setMsg(''); setErro('') }}>À vista</button>
            <button type="button" className={`btn ${modo === 'parcelado' ? 'btn-primary' : ''}`} onClick={() => { setModo('parcelado'); setMsg(''); setErro('') }}>Acordo parcelado</button>
          </div>

          {modo === 'vista' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="mf"><label>Valor pago (R$)</label><input style={cell} value={valorPago} onChange={(e) => setValorPago(e.target.value)} placeholder="0,00" /></div>
                <div className="mf"><label>Multa (%)</label><input style={{ ...cell, opacity: isentar ? 0.5 : 1 }} value={multa} onChange={(e) => setMulta(e.target.value)} disabled={isentar} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                <div className="mf"><label>Sessões contratadas</label><input style={cell} type="number" min={0} value={sessoesContr} onChange={(e) => setSessoesContr(e.target.value)} placeholder="ex.: 10" /></div>
                <div className="mf"><label>Sessões já feitas</label><input style={cell} type="number" min={0} value={sessoesFeitas} onChange={(e) => setSessoesFeitas(e.target.value)} placeholder="ex.: 3" /></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, margin: '8px 0' }}>
                <input type="checkbox" checked={isentar} onChange={(e) => setIsentar(e.target.checked)} /> Rescisão por nossa culpa (ex.: fechamento de unidade) — sem multa
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
              {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{erro}</p>}
              {msg && <p style={{ fontSize: 12.5, color: 'var(--brand-600)', marginTop: 8 }}>{msg}</p>}
              <button type="button" className="btn btn-primary" disabled={saving || reembolso <= 0} onClick={lancar} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
                {saving ? 'Lançando…' : <><i className="ti ti-businessplan" /> Gerar pedido de cancelamento e lançar reembolso</>}
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="mf"><label>Valor total (R$)</label><input style={cell} value={vAcordo} onChange={(e) => setVAcordo(e.target.value)} placeholder="0,00" /></div>
                <div className="mf"><label>Parcelas</label><input style={cell} type="number" min={1} max={24} value={nParc} onChange={(e) => setNParc(e.target.value)} /></div>
                <div className="mf"><label>1º pagamento</label><input style={cell} type="date" value={data1} onChange={(e) => setData1(e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 8, marginTop: 8 }}>
                <span style={{ fontSize: 13 }}>{nP}x de</span>
                <b style={{ fontSize: 18, color: 'var(--brand-600)' }}>{money(valorParcela)}</b>
              </div>
              {!data1Valida && <p style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}><i className="ti ti-alert-triangle" /> {MSG_DIA15}</p>}
              {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{erro}</p>}
              {msg && <p style={{ fontSize: 12.5, color: 'var(--brand-600)', marginTop: 8 }}>{msg}</p>}
              <button type="button" className="btn btn-primary" disabled={saving || vAc <= 0 || !data1Valida} onClick={criarAc} style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
                {saving ? 'Criando…' : <><i className="ti ti-calendar-dollar" /> Criar acordo parcelado (aguardando OK do gestor)</>}
              </button>
            </>
          )}
          {t.criado_em && <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}><i className="ti ti-clock" /> Chamado aberto em {dataBR(t.criado_em)}.</p>}
        </div>
      )}
    </div>
  )
}
