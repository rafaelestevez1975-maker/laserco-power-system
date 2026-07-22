'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarChamado } from '@/app/(app)/sac/actions'

type Unidade = { id: string; nome: string }
type Atendente = { id: string; nome: string }
const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const PRIOS: { k: string; l: string }[] = [
  { k: 'baixa', l: 'Baixa' }, { k: 'media', l: 'Média' }, { k: 'alta', l: 'Alta' }, { k: 'urgente', l: 'Crítica' },
]
const TIPOS = ['Franquia', 'Própria']
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
const hojeISO = () => new Date().toISOString().slice(0, 10)

export function NovoChamado({ unidades, atendentes, activeUnitId }: { unidades: Unidade[]; atendentes: Atendente[]; activeUnitId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({
    nome_cliente: '', cpf_cliente: '', telefone_cliente: '', email_cliente: '',
    canal: 'Manual', unidade_id: activeUnitId || '', tipo: 'Franquia', data_reclamacao: hojeISO(),
    motivo_label: '', prioridade: 'media',
    fase: 'Novo', atribuido_para: '', area_reclamada: '', valor_pago: '', valor_devolucao: '',
    multa_aplicada: false, pago: false, observacoes: '',
  })
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  // Campos/rótulos 1:1 com o legado sacForm (index.html:9234): grid de 3 colunas, label
  // 11px/600/muted, inputs com padding 8 e borda var(--line).
  const flab: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--muted)' }
  const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 }
  const fin: React.CSSProperties = { padding: 8, border: '1px solid var(--line)', borderRadius: 8 }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!f.nome_cliente.trim()) { setErr('Informe o nome do cliente.'); return }
    const email = f.email_cliente.trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('E-mail inválido.'); return }
    const cpfDig = f.cpf_cliente.replace(/\D/g, '')
    if (cpfDig && cpfDig.length !== 11) { setErr('CPF deve ter 11 dígitos.'); return }
    setSaving(true)
    const res = await criarChamado({
      nome_cliente: f.nome_cliente, cpf_cliente: f.cpf_cliente, telefone_cliente: f.telefone_cliente,
      email_cliente: f.email_cliente, canal: f.canal, unidade_id: f.unidade_id || null,
      tipo: f.tipo, data_reclamacao: f.data_reclamacao,
      motivo_label: f.motivo_label, prioridade: f.prioridade, fase: f.fase,
      atribuido_para: f.atribuido_para || null, area_reclamada: f.area_reclamada,
      valor_pago: f.valor_pago, valor_devolucao: f.valor_devolucao,
      multa_aplicada: f.multa_aplicada, pago: f.pago, observacoes: f.observacoes,
    })
    setSaving(false)
    if (!res.ok) setErr(res.error || 'Erro ao abrir chamado.')
    else { setOpen(false); router.refresh() }
  }

  // Modal "Novo chamado" 1:1 com o legado sacForm: classes modal-ov/modal, largura 840,
  // grid de 3 colunas com a mesma ordem de campos e rótulos do legado.
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><i className="ti ti-plus" /> Novo chamado</button>
      {open && (
        <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          {/* .modal do legacy.css fixa width:580px — só passar maxWidth não alarga nada e o
              grid de 3 colunas cortava os campos da direita. Precisa sobrescrever o width. */}
          <form onSubmit={submit} className="modal" style={{ width: 'min(1040px, 96vw)', maxWidth: 'min(1040px, 96vw)' }}>
            <div className="modal-head"><h3><i className="ti ti-headset" /> Novo chamado</h3><button type="button" className="modal-close" onClick={() => setOpen(false)}>×</button></div>
            <div className="modal-body" style={{ display: 'block' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div style={col}><label style={flab}>Nome do cliente *</label><input style={fin} value={f.nome_cliente} onChange={(e) => set('nome_cliente', e.target.value)} autoFocus /></div>
                <div style={col}><label style={flab}>CPF</label><input style={fin} value={f.cpf_cliente} onChange={(e) => set('cpf_cliente', e.target.value)} /></div>
                <div style={col}><label style={flab}>WhatsApp / Telefone</label><input style={fin} value={f.telefone_cliente} onChange={(e) => set('telefone_cliente', e.target.value)} /></div>
                <div style={col}><label style={flab}>E-mail</label><input style={fin} value={f.email_cliente} onChange={(e) => set('email_cliente', e.target.value)} /></div>
                <div style={col}><label style={flab}>Canal *</label>
                  <select style={fin} value={f.canal} onChange={(e) => set('canal', e.target.value)}>
                    {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={col}><label style={flab}>Unidade *</label>
                  <select style={fin} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
                    <option value=""> Sem unidade / central </option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </div>
                <div style={col}><label style={flab}>Tipo</label>
                  <select style={fin} value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={col}><label style={flab}>Motivo *</label><input style={fin} value={f.motivo_label} onChange={(e) => set('motivo_label', e.target.value)} placeholder="Ex.: Cobrança indevida" /></div>
                <div style={col}><label style={flab}>Prioridade</label>
                  <select style={fin} value={f.prioridade} onChange={(e) => set('prioridade', e.target.value)}>
                    {PRIOS.map((p) => <option key={p.k} value={p.k}>{p.l}</option>)}
                  </select>
                </div>
                <div style={col}><label style={flab}>Responsável</label>
                  <select style={fin} value={f.atribuido_para} onChange={(e) => set('atribuido_para', e.target.value)}>
                    <option value=""> Não atribuído</option>
                    {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
                <div style={col}><label style={flab}>Fase (Kanban)</label>
                  <select style={fin} value={f.fase} onChange={(e) => set('fase', e.target.value)}>
                    {FASES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div style={col}><label style={flab}>Data da reclamação *</label><input style={fin} type="date" value={f.data_reclamacao} onChange={(e) => set('data_reclamacao', e.target.value)} /></div>
                <div style={col}><label style={flab}>Serviço/pacote reclamado</label><input style={fin} value={f.area_reclamada} onChange={(e) => set('area_reclamada', e.target.value)} placeholder="Ex.: Pacote axila + virilha" /></div>
                <div style={col}><label style={flab}>Valor pago (R$)</label><input style={fin} inputMode="decimal" value={f.valor_pago} onChange={(e) => set('valor_pago', e.target.value)} placeholder="0,00" /></div>
                <div style={col}><label style={flab}>Reembolso solicitado (R$)</label><input style={fin} inputMode="decimal" value={f.valor_devolucao} onChange={(e) => set('valor_devolucao', e.target.value)} placeholder="0,00" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.multa_aplicada} onChange={(e) => set('multa_aplicada', e.target.checked)} /> Multa aplicada
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.pago} onChange={(e) => set('pago', e.target.checked)} /> Pagamento/reembolso realizado
                </label>
              </div>
              <div style={{ marginTop: 10, ...col }}><label style={flab}>Observações / tratativa</label><textarea rows={3} style={{ ...fin, resize: 'vertical' }} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
              {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}><i className="ti ti-check" /> {saving ? 'Abrindo…' : 'Salvar chamado'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
