'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarMotivo, renomearMotivo, toggleMotivo, criarTag, renomearTag, toggleTag } from '@/app/(app)/sac/config/actions'

export type Motivo = { id: string; label: string; ativo: boolean; ordem: number }
export type Tag = { id: string; nome: string; cor: string | null; ativo: boolean }
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void

const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }
const corBox: React.CSSProperties = { width: 34, height: 34, padding: 0, border: '1px solid var(--line)', borderRadius: 8, flexShrink: 0 }
const chip: React.CSSProperties = { fontSize: 12, background: 'var(--surface-2, #f4eef0)', border: '1px solid var(--line)', padding: '3px 10px', borderRadius: 20 }

// Paridade com o legado (sacConfig): canais e integrações exibidos no Config do SAC.
const CANAIS_SAC = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const INTEGRACOES_SAC: { n: string; ic: string; on: boolean }[] = [
  { n: 'BLIP', ic: 'ti-message-chatbot', on: false },
  { n: 'Sults', ic: 'ti-building-store', on: false },
  { n: 'Reclame Aqui', ic: 'ti-message-report', on: false },
  { n: 'Procon', ic: 'ti-scale', on: false },
  { n: 'Instagram Direct', ic: 'ti-brand-instagram', on: false },
]

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginTop: 16 }}>
        <section className="lc-card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-alarm" /> SLA de atendimento</h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontSize: 26 }}>48</b><span style={{ color: 'var(--text-2)' }}>horas corridas</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Prazo para resolução antes de marcar o chamado como <b>“Em atraso”</b>. Regra da rede (definida com o cliente). Tornar configurável por unidade exige uma tabela de parâmetros do SAC.</p>
        </section>

        <section className="lc-card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-plug" /> Canais ativos</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CANAIS_SAC.map((c) => <span key={c} style={chip}>{c}</span>)}
          </div>
        </section>

        <section className="lc-card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-puzzle" /> Integrações</h3>
          <div>
            {INTEGRACOES_SAC.map((it) => (
              <div key={it.n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span><i className={`ti ${it.ic}`} style={{ color: 'var(--brand-500)', marginRight: 8 }} />{it.n}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: it.on ? '#0F6B3A' : '#999' }}>{it.on ? 'Conectado' : 'Desativado'}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>Conexões reais dependem das credenciais de cada serviço.</p>
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
