'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarIndicacao, atualizarIndicado, type IndicadoInput } from '@/app/(app)/indiques/actions'

export type Indicado = { id: string; nome: string | null; telefone: string | null; email: string | null; status: string | null; observacoes: string | null }
export type Indicacao = {
  id: string; indicador_nome: string | null; indicador_telefone: string | null; premio_descricao: string | null
  status: string | null; unidade_id: string | null; criado_em: string | null; indicacao_indicados: Indicado[]
}
type Unidade = { id: string; nome: string }

const STATUS = ['pendente', 'contatado', 'respondeu', 'agendou', 'compareceu', 'comprou', 'desistiu']
const cor: Record<string, string> = { pendente: '#9A6700', contatado: '#3D7FD1', respondeu: '#3D7FD1', agendou: '#8A2A41', compareceu: '#0e7490', comprou: '#15803D', desistiu: '#D85563' }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }

export function IndiquesManager({ indicacoes, unidades, activeUnitId, uniNome }: { indicacoes: Indicacao[]; unidades: Unidade[]; activeUnitId: string | null; uniNome: Record<string, string> }) {
  const router = useRouter()
  const [nova, setNova] = useState(false)
  const [aberta, setAberta] = useState<Indicacao | null>(null)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '4px 0 12px' }}>
        <button className="btn btn-primary" onClick={() => setNova(true)}><i className="ti ti-plus" /> Nova indicação</button>
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Indicador</th><th>Contato</th><th>Unidade</th><th>Indicados</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {indicacoes.length === 0 && <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhuma indicação ainda. Registre a primeira ou conecte a ponte do site.</td></tr>}
              {indicacoes.map((ind) => (
                <tr key={ind.id}>
                  <td><b>{ind.indicador_nome || ''}</b></td>
                  <td>{ind.indicador_telefone || ''}</td>
                  <td>{ind.unidade_id ? (uniNome[ind.unidade_id] ?? '') : ''}</td>
                  <td>{ind.indicacao_indicados?.length ?? 0}</td>
                  <td><span className="orig-tag" style={{ fontSize: 11 }}>{ind.status || 'ativa'}</span></td>
                  <td style={{ textAlign: 'right' }}><button className="btn" onClick={() => setAberta(ind)}><i className="ti ti-arrow-right" /> Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nova && <NovaIndicacao unidades={unidades} activeUnitId={activeUnitId} onClose={() => setNova(false)} onSaved={() => { setNova(false); router.refresh() }} />}
      {aberta && <AbrirLead indicacao={aberta} onClose={() => setAberta(null)} onSaved={() => router.refresh()} />}
    </>
  )
}

function NovaIndicacao({ unidades, activeUnitId, onClose, onSaved }: { unidades: Unidade[]; activeUnitId: string | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ indicador_nome: '', indicador_telefone: '', indicador_email: '', premio_descricao: '', unidade_id: activeUnitId || '' })
  const [indicados, setIndicados] = useState<IndicadoInput[]>([{ nome: '', telefone: '' }, { nome: '', telefone: '' }, { nome: '', telefone: '' }])
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const setInd = (i: number, k: string, v: string) => setIndicados((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!f.indicador_nome.trim()) { setErr('Informe quem indicou.'); return }
    if (!f.unidade_id) { setErr('Selecione a unidade da indicação.'); return }
    const validos = indicados.filter((i) => i.nome.trim() && (i.telefone ?? '').trim())
    if (validos.length < 3) { setErr('Preencha nome e WhatsApp de pelo menos 3 indicados (a campanha exige de 3 a 5).'); return }
    setSaving(true)
    const res = await criarIndicacao({ ...f, unidade_id: f.unidade_id || null, indicados })
    setSaving(false)
    if (!res.ok) setErr(res.error || 'Erro.'); else onSaved()
  }

  return (
    <Modal onClose={onClose} title="Nova indicação">
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <div><label style={lbl}>Quem indicou *</label><input style={inp} value={f.indicador_nome} onChange={(e) => set('indicador_nome', e.target.value)} autoFocus /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Telefone</label><input style={inp} value={f.indicador_telefone} onChange={(e) => set('indicador_telefone', e.target.value)} /></div>
          <div><label style={lbl}>E-mail</label><input style={inp} value={f.indicador_email} onChange={(e) => set('indicador_email', e.target.value)} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Prêmio do mês</label><input style={inp} value={f.premio_descricao} onChange={(e) => set('premio_descricao', e.target.value)} placeholder="Ex.: Sessão de ultrassom" /></div>
          <div><label style={lbl}>Unidade</label>
            <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
              <option value=""> Selecione </option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>Indicados (3 a 5)</div>
        {indicados.map((ind, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input style={inp} placeholder={`Nome do indicado ${i + 1}`} value={ind.nome} onChange={(e) => setInd(i, 'nome', e.target.value)} />
            <input style={inp} placeholder="WhatsApp" value={ind.telefone ?? ''} onChange={(e) => setInd(i, 'telefone', e.target.value)} />
          </div>
        ))}
        {indicados.length < 5 && <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={() => setIndicados((p) => [...p, { nome: '', telefone: '' }])}><i className="ti ti-plus" /> Adicionar indicado</button>}
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Registrar indicação'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AbrirLead({ indicacao, onClose, onSaved }: { indicacao: Indicacao; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal onClose={onClose} title={`Indicação de ${indicacao.indicador_nome || ''}`}>
      {indicacao.premio_descricao && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 10 }}>Prêmio: {indicacao.premio_descricao}</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {(indicacao.indicacao_indicados ?? []).map((ind) => <IndicadoRow key={ind.id} ind={ind} onSaved={onSaved} />)}
        {(indicacao.indicacao_indicados ?? []).length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Sem indicados.</div>}
      </div>
    </Modal>
  )
}

function IndicadoRow({ ind, onSaved }: { ind: Indicado; onSaved: () => void }) {
  const [status, setStatus] = useState(ind.status || 'pendente')
  const [obs, setObs] = useState(ind.observacoes || '')
  const [saving, setSaving] = useState(false)
  async function salvar() {
    setSaving(true); await atualizarIndicado(ind.id, status, obs); setSaving(false); onSaved()
  }
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <b style={{ flex: 1 }}>{ind.nome || ''}</b>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{ind.telefone}</span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor[status] || '#999' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 8, alignItems: 'center' }}>
        <select style={inp} value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <input style={inp} placeholder="Andamento / observação" value={obs} onChange={(e) => setObs(e.target.value)} />
        <button className="btn btn-primary" disabled={saving} onClick={salvar}>{saving ? '…' : 'Salvar'}</button>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600 }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="lc-card" style={{ width: '100%', maxWidth: 520, padding: 22, background: '#fff', maxHeight: '88vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="lc-title" style={{ fontSize: 18, marginBottom: 14 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}
