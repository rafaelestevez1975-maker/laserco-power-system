'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarMotivo, renomearMotivo, toggleMotivo, criarTag, renomearTag, toggleTag } from '@/app/(app)/sac/config/actions'

export type Motivo = { id: string; label: string; ativo: boolean; ordem: number }
export type Tag = { id: string; nome: string; cor: string | null; ativo: boolean }
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void

const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }
const corBox: React.CSSProperties = { width: 34, height: 34, padding: 0, border: '1px solid var(--line)', borderRadius: 8, flexShrink: 0 }

export function SacConfigManager({ motivos, tags, podeEditar }: { motivos: Motivo[]; tags: Tag[]; podeEditar: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run: Run = async (fn) => {
    setBusy(true); setErr('')
    const r = await fn()
    setBusy(false)
    if (!r.ok) setErr(r.error || 'Erro.'); else router.refresh()
  }

  return (
    <>
      {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 12 }}>{err}</div>}
      {!podeEditar && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>Você pode visualizar os catálogos; a edição é restrita a SAC/gestor/admin.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        <section className="lc-card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-list-details" /> Motivos de atendimento <span style={{ fontSize: 12, color: 'var(--text-3)' }}>({motivos.length})</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {motivos.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Nenhum motivo cadastrado.</div>}
            {motivos.map((m) => <MotivoRow key={m.id} m={m} podeEditar={podeEditar} busy={busy} run={run} />)}
          </div>
          {podeEditar && <AddRow placeholder="Novo motivo…" busy={busy} onAdd={(v) => run(() => criarMotivo(v))} />}
        </section>

        <section className="lc-card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-tags" /> Tags <span style={{ fontSize: 12, color: 'var(--text-3)' }}>({tags.length})</span></h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tags.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Nenhuma tag cadastrada.</div>}
            {tags.map((t) => <TagRow key={t.id} t={t} podeEditar={podeEditar} busy={busy} run={run} />)}
          </div>
          {podeEditar && <AddRow placeholder="Nova tag…" busy={busy} cor onAdd={(v, c) => run(() => criarTag(v, c || '#8A2A41'))} />}
        </section>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
        <i className="ti ti-info-circle" /> Motivos e tags alimentam o cadastro e a triagem dos chamados. Desativar (olho) preserva o histórico sem excluir.
      </div>
    </>
  )
}

function MotivoRow({ m, podeEditar, busy, run }: { m: Motivo; podeEditar: boolean; busy: boolean; run: Run }) {
  const [label, setLabel] = useState(m.label)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', opacity: m.ativo ? 1 : 0.55 }}>
      <input defaultValue={m.label} disabled={!podeEditar} onChange={(e) => setLabel(e.target.value)} style={inp} />
      {podeEditar && <button className="btn" disabled={busy || !label.trim() || label === m.label} onClick={() => run(() => renomearMotivo(m.id, label))}>Salvar</button>}
      {podeEditar && <button className="btn" disabled={busy} title={m.ativo ? 'Desativar' : 'Ativar'} onClick={() => run(() => toggleMotivo(m.id, !m.ativo))}><i className={`ti ${m.ativo ? 'ti-eye-off' : 'ti-eye'}`} /></button>}
    </div>
  )
}

function TagRow({ t, podeEditar, busy, run }: { t: Tag; podeEditar: boolean; busy: boolean; run: Run }) {
  const [nome, setNome] = useState(t.nome)
  const [cor, setCor] = useState(t.cor || '#8A2A41')
  const mudou = nome.trim() && (nome !== t.nome || cor !== (t.cor || '#8A2A41'))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto auto', gap: 8, alignItems: 'center', opacity: t.ativo ? 1 : 0.55 }}>
      <input type="color" value={cor} disabled={!podeEditar} onChange={(e) => setCor(e.target.value)} style={corBox} />
      <input defaultValue={t.nome} disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} style={inp} />
      {podeEditar && <button className="btn" disabled={busy || !mudou} onClick={() => run(() => renomearTag(t.id, nome, cor))}>Salvar</button>}
      {podeEditar && <button className="btn" disabled={busy} title={t.ativo ? 'Desativar' : 'Ativar'} onClick={() => run(() => toggleTag(t.id, !t.ativo))}><i className={`ti ${t.ativo ? 'ti-eye-off' : 'ti-eye'}`} /></button>}
    </div>
  )
}

function AddRow({ placeholder, busy, onAdd, cor = false }: { placeholder: string; busy: boolean; onAdd: (v: string, c?: string) => void; cor?: boolean }) {
  const [v, setV] = useState('')
  const [c, setC] = useState('#8A2A41')
  const add = () => { if (v.trim()) { onAdd(v.trim(), c); setV('') } }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {cor && <input type="color" value={c} onChange={(e) => setC(e.target.value)} style={corBox} />}
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} style={inp} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
      <button className="btn btn-primary" disabled={busy || !v.trim()} onClick={add}><i className="ti ti-plus" /> Adicionar</button>
    </div>
  )
}
