'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarChamado } from '@/app/(app)/sac/actions'
import { buscarClientePorContato, type ClienteResumo } from '@/app/(app)/sac/triagem/actions'
import { moedaBR } from '@/lib/fmt'

export type ChamadoRow = {
  id: string; numero: number | null; protocolo: string | null; nome_cliente: string | null; telefone_cliente: string | null
  email_cliente: string | null; cpf_cliente: string | null; canal: string | null; unidade_id: string | null
  motivo_label: string | null; prioridade: string | null; fase: string | null; sla_violado: boolean | null
  atribuido_para: string | null; observacoes: string | null
  area_reclamada?: string | null; valor_pago?: number | null; valor_devolucao?: number | null
  multa_aplicada?: boolean | null; pago?: boolean | null
}
type Atend = { id: string; nome: string }

const PRIORIDADES: { k: string; l: string }[] = [
  { k: 'baixa', l: 'Baixa' }, { k: 'media', l: 'Média' }, { k: 'alta', l: 'Alta' }, { k: 'urgente', l: 'Crítica' },
]
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
const cap = (s: string | null) => (s || '').replace(/^\w/, (c) => c.toUpperCase())
const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })
const prioPill = (p: string | null) => (p === 'alta' || p === 'urgente' ? pill('#FCEBE0', '#C2410C') : p === 'baixa' ? pill('#EEF2F7', '#64748B') : pill('#FBEFD9', '#9A6700'))
const fasePill = (f: string | null) => (f === 'Concluído' ? pill('#E7F0EC', '#15803D') : f === 'Em pagamento' ? pill('#FBEFD9', '#9A6700') : (f || '').startsWith('Aguardando') ? pill('#EEF2F7', '#64748B') : f && f.includes('Contato') ? pill('#E6F0FB', '#3D7FD1') : pill('#F7E7EB', '#8A2A41'))
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

export function ChamadosTabela({ tickets, atendentes, motivos, uniNome }: {
  tickets: ChamadoRow[]; atendentes: Atend[]; motivos: string[]; uniNome: Record<string, string>
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
              <tr><th>Protocolo</th><th>Cliente</th><th>Canal</th><th>Unidade</th><th>Atendente</th><th>Motivo</th><th>Prioridade</th><th>Fase</th><th>SLA</th></tr>
            </thead>
            <tbody>
              {tickets.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum chamado para os filtros selecionados.</td></tr>}
              {tickets.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(t)} title="Clique para editar">
                  <td><b>{t.protocolo || `SAC-${t.numero ?? ''}`}</b></td>
                  <td>{t.nome_cliente || ''}{t.telefone_cliente && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.telefone_cliente}</div>}</td>
                  <td>{t.canal || ''}</td>
                  <td>{t.unidade_id ? (uniNome[t.unidade_id] ?? '') : ''}</td>
                  <td>{t.atribuido_para ? atNome(t.atribuido_para) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td>{t.motivo_label || ''}</td>
                  <td><span style={prioPill(t.prioridade)}>{cap(t.prioridade)}</span></td>
                  <td><span style={fasePill(t.fase)}>{t.fase || ''}</span></td>
                  <td>{t.sla_violado ? <span style={pill('#FBE9EB', '#D85563')}><i className="ti ti-alarm" /> Violado</span> : <span style={pill('#E7F0EC', '#15803D')}>OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <EditModal t={edit} atendentes={atendentes} motivos={motivos} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh() }} />}
    </>
  )
}

function EditModal({ t, atendentes, motivos, onClose, onSaved }: { t: ChamadoRow; atendentes: Atend[]; motivos: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nome_cliente: t.nome_cliente || '', telefone_cliente: t.telefone_cliente || '', email_cliente: t.email_cliente || '', cpf_cliente: t.cpf_cliente || '',
    motivo_label: t.motivo_label || '', prioridade: t.prioridade || 'media', fase: t.fase || 'Novo', atribuido_para: t.atribuido_para || '', observacoes: t.observacoes || '',
    area_reclamada: t.area_reclamada || '', valor_pago: t.valor_pago != null ? String(t.valor_pago) : '', valor_devolucao: t.valor_devolucao != null ? String(t.valor_devolucao) : '',
    multa_aplicada: !!t.multa_aplicada, pago: !!t.pago,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ficha, setFicha] = useState<ClienteResumo | null>(null)
  const [fichaBusy, setFichaBusy] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const motOpts = [...new Set([t.motivo_label, ...motivos].filter(Boolean))] as string[]

  async function buscarFicha() {
    setFichaBusy(true)
    const r = await buscarClientePorContato(f.telefone_cliente, f.cpf_cliente)
    setFichaBusy(false)
    setFicha(r)
  }

  async function salvar() {
    if (!f.nome_cliente.trim()) { setErr('Informe o nome do cliente.'); return }
    setBusy(true); setErr('')
    const r = await atualizarChamado(t.id, { ...f, atribuido_para: f.atribuido_para || null })
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-head"><h3><i className="ti ti-edit" /> Editar {t.protocolo || `SAC-${t.numero ?? ''}`}</h3><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}
          <div className="mf"><label>Cliente</label><input style={inp} value={f.nome_cliente} onChange={(e) => set('nome_cliente', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Telefone</label><input style={inp} value={f.telefone_cliente} onChange={(e) => set('telefone_cliente', e.target.value)} /></div>
            <div className="mf"><label>E-mail</label><input style={inp} value={f.email_cliente} onChange={(e) => set('email_cliente', e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>CPF</label><input style={inp} value={f.cpf_cliente} onChange={(e) => set('cpf_cliente', e.target.value)} /></div>
            <div className="mf"><label>Motivo</label>
              <select style={inp} value={f.motivo_label} onChange={(e) => set('motivo_label', e.target.value)}>
                <option value="">—</option>{motOpts.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
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
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}><i className="ti ti-info-circle" /> O cálculo de reembolso por saldo de sessões é feito no <b>Kanban</b> do chamado (ao mover para “Em pagamento”).</div>
              </div>
            )}
          </div>
          <div className="mf"><label>Observações</label><textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
      </div>
    </div>
  )
}
