'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarChamado } from '@/app/(app)/sac/actions'

type Unidade = { id: string; nome: string }
const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']

export function NovoChamado({ unidades, activeUnitId }: { unidades: Unidade[]; activeUnitId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({
    nome_cliente: '', cpf_cliente: '', telefone_cliente: '', email_cliente: '',
    canal: 'Manual', unidade_id: activeUnitId || '', motivo_label: '', prioridade: 'media', observacoes: '',
  })
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setSaving(true)
    const res = await criarChamado({ ...f, unidade_id: f.unidade_id || null })
    setSaving(false)
    if (!res.ok) setErr(res.error || 'Erro ao abrir chamado.')
    else { setOpen(false); router.refresh() }
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><i className="ti ti-plus" /> Novo chamado</button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setOpen(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="lc-card" style={{ width: '100%', maxWidth: 480, padding: 22, background: '#fff', maxHeight: '88vh', overflow: 'auto' }}>
            <h3 className="lc-title" style={{ fontSize: 18, marginBottom: 14 }}>Abrir chamado</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Cliente *</label><input style={inp} value={f.nome_cliente} onChange={(e) => set('nome_cliente', e.target.value)} autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 12, fontWeight: 600 }}>CPF</label><input style={inp} value={f.cpf_cliente} onChange={(e) => set('cpf_cliente', e.target.value)} /></div>
                <div><label style={{ fontSize: 12, fontWeight: 600 }}>Telefone</label><input style={inp} value={f.telefone_cliente} onChange={(e) => set('telefone_cliente', e.target.value)} /></div>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>E-mail</label><input style={inp} value={f.email_cliente} onChange={(e) => set('email_cliente', e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ fontSize: 12, fontWeight: 600 }}>Canal</label>
                  <select style={inp} value={f.canal} onChange={(e) => set('canal', e.target.value)}>
                    {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize: 12, fontWeight: 600 }}>Prioridade</label>
                  <select style={inp} value={f.prioridade} onChange={(e) => set('prioridade', e.target.value)}>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Motivo / assunto</label><input style={inp} value={f.motivo_label} onChange={(e) => set('motivo_label', e.target.value)} placeholder="Ex.: Cobrança indevida" /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Unidade</label>
                <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
                  <option value="">— Sem unidade / central —</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Observações</label><textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></div>
            </div>
            {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Abrindo…' : 'Abrir chamado'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
