'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { dataBR } from '@/lib/fmt'
import { adicionarSignatario, removerSignatario } from '@/app/(app)/juridico/actions'
import type { DocRow } from '@/components/juridico/JuridicoManager'

type SigRow = {
  id: string
  nome: string | null
  email: string | null
  cpf: string | null
  papel_signatario: string | null
  ordem: number | null
  status: string | null
  visualizado_em: string | null
}

const SIG_PILL: Record<string, { bg: string; c: string; t: string }> = {
  pendente: { bg: '#FBEFD9', c: '#9A6700', t: 'Pendente' },
  visualizado: { bg: '#E6F0FB', c: '#3D7FD1', t: 'Visualizou' },
  assinado: { bg: '#E7F0EC', c: '#15803D', t: 'Assinou' },
  recusado: { bg: '#FBE9EB', c: '#D85563', t: 'Recusou' },
}

function sigPill(s: string | null) {
  const p = SIG_PILL[s || ''] || SIG_PILL.pendente
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p.bg, color: p.c }}>{p.t}</span>
}

export function SignatariosPanel({ doc, onClose, onChanged }: { doc: DocRow; onClose: () => void; onChanged: () => void }) {
  const [sigs, setSigs] = useState<SigRow[] | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [novo, setNovo] = useState({ nome: '', email: '', cpf: '', papel_signatario: '' })
  const set = (k: keyof typeof novo, v: string) => setNovo((p) => ({ ...p, [k]: v }))

  const editavel = doc.status === 'rascunho'

  const carregar = useCallback(async () => {
    setLoadErr(false)
    const sb = createClient()
    const { data, error } = await sb
      .from('signatarios_documento')
      .select('id, nome, email, cpf, papel_signatario, ordem, status, visualizado_em')
      .eq('documento_id', doc.id)
      .order('ordem', { ascending: true })
    if (error) { setLoadErr(true); setSigs([]); return }
    setSigs((data ?? []) as SigRow[])
  }, [doc.id])

  useEffect(() => { void carregar() }, [carregar])

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!novo.nome.trim()) { setErr('Informe o nome do signatário.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo.email.trim())) { setErr('Informe um e-mail válido.'); return }
    setBusy('novo')
    const r = await adicionarSignatario({
      documento_id: doc.id,
      nome: novo.nome,
      email: novo.email,
      cpf: novo.cpf || undefined,
      papel_signatario: novo.papel_signatario || undefined,
    })
    setBusy(null)
    if (!r.ok) { setErr(r.error || 'Erro ao adicionar.'); return }
    setNovo({ nome: '', email: '', cpf: '', papel_signatario: '' })
    await carregar()
    onChanged()
  }

  async function remover(id: string) {
    setErr('')
    setBusy(id)
    const r = await removerSignatario(id)
    setBusy(null)
    if (!r.ok) { setErr(r.error || 'Erro ao remover.'); return }
    await carregar()
    onChanged()
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 620 }}>
        <div className="modal-head">
          <h3><i className="ti ti-users" /> Signatários · {doc.titulo || 'Documento'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="crm-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}><i className="ti ti-alert-triangle" /> {err}</div>}
          {loadErr && <div className="crm-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}><i className="ti ti-alert-triangle" /> Não foi possível carregar os signatários.</div>}

          {!editavel && (
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              <i className="ti ti-lock" /> O documento não está mais em rascunho  a lista de signatários é somente leitura.
            </div>
          )}

          <div className="cli-card">
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr><th>#</th><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th>{editavel && <th></th>}</tr>
                </thead>
                <tbody>
                  {sigs === null && <tr><td colSpan={editavel ? 6 : 5} style={{ padding: 18, color: 'var(--text-3)' }}>Carregando…</td></tr>}
                  {sigs !== null && sigs.length === 0 && (
                    <tr><td colSpan={editavel ? 6 : 5} style={{ padding: 18, color: 'var(--text-3)', textAlign: 'center' }}>
                      <i className="ti ti-user-off" style={{ fontSize: 20, display: 'block', marginBottom: 6 }} />
                      Nenhum signatário. Adicione abaixo.
                    </td></tr>
                  )}
                  {(sigs ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>{s.ordem ?? ''}</td>
                      <td><b>{s.nome || ''}</b>{s.cpf && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>CPF {s.cpf}</div>}</td>
                      <td style={{ fontSize: 12 }}>{s.email || ''}</td>
                      <td style={{ fontSize: 12 }}>{s.papel_signatario || <span style={{ color: 'var(--text-3)' }}></span>}</td>
                      <td>{sigPill(s.status)}{s.visualizado_em && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>visto {dataBR(s.visualizado_em)}</div>}</td>
                      {editavel && (
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn" disabled={busy === s.id} title="Remover" onClick={() => remover(s.id)}>
                            <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {editavel && (
            <form onSubmit={adicionar} style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b style={{ fontSize: 13 }}><i className="ti ti-user-plus" style={{ color: 'var(--brand-500)' }} /> Adicionar signatário</b>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mf"><label>Nome <span className="req">*</span></label>
                  <input value={novo.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="mf"><label>E-mail <span className="req">*</span></label>
                  <input value={novo.email} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" inputMode="email" />
                </div>
                <div className="mf"><label>CPF</label>
                  <input value={novo.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="Somente números (opcional)" inputMode="numeric" />
                </div>
                <div className="mf"><label>Papel</label>
                  <input value={novo.papel_signatario} onChange={(e) => set('papel_signatario', e.target.value)} placeholder="Ex.: Franqueado, Testemunha" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={busy === 'novo'}>
                  {busy === 'novo' ? 'Adicionando…' : (<><i className="ti ti-plus" /> Adicionar</>)}
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
