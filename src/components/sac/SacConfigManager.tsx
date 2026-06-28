'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarMotivo, renomearMotivo, toggleMotivo, criarTag, renomearTag, toggleTag, salvarSlaHoras } from '@/app/(app)/sac/config/actions'

export type Motivo = { id: string; label: string; ativo: boolean; ordem: number }
export type Tag = { id: string; nome: string; cor: string | null; ativo: boolean }
export type CanalUso = { nome: string; n: number }
type Run = (fn: () => Promise<{ ok: boolean; error?: string }>) => void

const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }
const corBox: React.CSSProperties = { width: 34, height: 34, padding: 0, border: '1px solid var(--line)', borderRadius: 8, flexShrink: 0 }
const chip: React.CSSProperties = { fontSize: 12, background: 'var(--surface-2, #f4eef0)', border: '1px solid var(--line)', padding: '3px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }

// Integrações exibidas no Config do SAC (paridade com o legado SAC_CFG.integr, index.html 8913).
// Mantemos nomes e ícones do legado. NÃO há fonte real de estado de conexão (não existe tabela
// de credenciais/integrações no backend), então NÃO exibimos "Conectado" falso: o estado honesto
// é "Não configurado" até que a integração tenha persistência real. Ver notes/pendentes.
const INTEGRACOES_SAC: { n: string; ic: string }[] = [
  { n: 'BLIP (chatbot WhatsApp)', ic: 'ti-brand-whatsapp' },
  { n: 'Sults (franqueadora)', ic: 'ti-building' },
  { n: 'Reclame Aqui', ic: 'ti-message-report' },
  { n: 'Procon', ic: 'ti-gavel' },
  { n: 'Instagram Direct', ic: 'ti-brand-instagram' },
]

export function SacConfigManager({ motivos, tags, slaHoras, canais, unidadeAtiva, podeEditar }: { motivos: Motivo[]; tags: Tag[]; slaHoras: number; canais: CanalUso[]; unidadeAtiva: string; podeEditar: boolean }) {
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
      {/* Header idêntico ao legado (sacConfig 9147): card .rel-card "Configurações do SAC"
          com ícone ti-settings brand-500. */}
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <b><i className="ti ti-settings" style={{ color: 'var(--brand-500)' }} /> Configurações do SAC</b>
      </div>

      {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 12 }}>{err}</div>}
      {!podeEditar && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>Você pode visualizar os catálogos; a edição é restrita a SAC/gestor/admin.</div>}

      {/* Ordem do legado (sacConfig): SLA → Canais ativos → Integrações → Motivos. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        <SlaCard slaHoras={slaHoras} podeEditar={podeEditar} busy={busy} run={run} />

        <CanaisCard canais={canais} unidadeAtiva={unidadeAtiva} />
      </div>

      <section className="lc-card" style={{ padding: 16, marginTop: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-puzzle" /> Integrações</h3>
        <div>
          {INTEGRACOES_SAC.map((it) => (
            <div key={it.n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <span><i className={`ti ${it.ic}`} style={{ color: 'var(--brand-500)', marginRight: 8 }} />{it.n}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#999' }}>Não configurado</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>As integrações exigem credenciais e uma área de conexão própria, ainda não disponível neste módulo. Os chamados desses canais já podem ser registrados manualmente ou pela importação de planilha.</p>
      </section>

      {/* Motivos de reclamação (último no legado) + Tags (catálogo extra do Next.js, agrupado aqui). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginTop: 16 }}>
        <section className="lc-card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-list-details" /> Motivos de reclamação <span style={{ fontSize: 12, color: 'var(--text-3)' }}>({motivos.length})</span></h3>
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
        <i className="ti ti-info-circle" /> Os <b>motivos</b> alimentam o cadastro/edição e os filtros dos chamados. As <b>tags</b> compõem o catálogo de classificação do SAC. Desativar (olho) preserva o histórico sem excluir.
      </div>
    </>
  )
}

// SLA de atendimento (horas): paridade com o legado (SAC_CFG.slaHoras=48 · index.html 9149).
// Input numérico persistido em sac_premiacao_config.pesos.slaHoras; usado para marcar "Em atraso".
function SlaCard({ slaHoras, podeEditar, busy, run }: { slaHoras: number; podeEditar: boolean; busy: boolean; run: Run }) {
  const [h, setH] = useState(String(slaHoras))
  const num = Math.round(Number(h) || 0)
  const mudou = num >= 1 && num <= 1000 && num !== slaHoras
  return (
    <section className="lc-card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}><i className="ti ti-alarm" /> SLA de atendimento</h3>
      <label style={{ fontSize: 12, color: 'var(--text-3)' }}>Prazo (horas) para resolução antes de marcar o chamado como <b>“Em atraso”</b></label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <input type="number" min={1} max={1000} value={h} disabled={!podeEditar} onChange={(e) => setH(e.target.value)} style={{ ...inp, maxWidth: 120 }} />
        <span style={{ color: 'var(--text-2)', fontSize: 13 }}>horas corridas</span>
        {podeEditar && <button className="btn btn-primary" disabled={busy || !mudou} onClick={() => run(() => salvarSlaHoras(num))}>Salvar</button>}
      </div>
    </section>
  )
}

// Canais ativos: derivado do USO REAL em sac_tickets (count por canal, escopado pela unidade).
// Substitui a lista estática do legado por contagens reais — canal "em uso" aparece com o nº de
// chamados; os demais ficam atenuados como "sem chamados".
function CanaisCard({ canais, unidadeAtiva }: { canais: CanalUso[]; unidadeAtiva: string }) {
  const emUso = canais.filter((c) => c.n > 0)
  const semUso = canais.filter((c) => c.n === 0)
  return (
    <section className="lc-card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}><i className="ti ti-plug" /> Canais ativos <span style={{ fontSize: 12, color: 'var(--text-3)' }}>({emUso.length})</span></h3>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>Canais com chamados registrados em <b>{unidadeAtiva}</b>.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {emUso.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nenhum chamado registrado ainda.</span>}
        {emUso.map((c) => (
          <span key={c.nome} style={chip}>{c.nome}<b style={{ color: 'var(--brand-600)' }}>{c.n}</b></span>
        ))}
      </div>
      {semUso.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {semUso.map((c) => (
            <span key={c.nome} style={{ ...chip, opacity: 0.55 }}>{c.nome}</span>
          ))}
        </div>
      )}
      {semUso.length > 0 && <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Os canais atenuados ainda não têm chamados; ficam disponíveis na abertura de chamado.</p>}
    </section>
  )
}

function MotivoRow({ m, podeEditar, busy, run }: { m: Motivo; podeEditar: boolean; busy: boolean; run: Run }) {
  const [label, setLabel] = useState(m.label)
  const mudou = !!label.trim() && label !== m.label
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', opacity: m.ativo ? 1 : 0.55 }}>
      <input value={label} disabled={!podeEditar} onChange={(e) => setLabel(e.target.value)} style={inp} />
      {podeEditar && <button className="btn" disabled={busy || !mudou} onClick={() => run(() => renomearMotivo(m.id, label))}>Salvar</button>}
      {podeEditar && <button className="btn" disabled={busy} title={m.ativo ? 'Desativar' : 'Ativar'} onClick={() => run(() => toggleMotivo(m.id, !m.ativo))}><i className={`ti ${m.ativo ? 'ti-eye-off' : 'ti-eye'}`} /></button>}
    </div>
  )
}

function TagRow({ t, podeEditar, busy, run }: { t: Tag; podeEditar: boolean; busy: boolean; run: Run }) {
  const [nome, setNome] = useState(t.nome)
  const [cor, setCor] = useState(t.cor || '#8A2A41')
  const mudou = !!nome.trim() && (nome !== t.nome || cor !== (t.cor || '#8A2A41'))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto auto', gap: 8, alignItems: 'center', opacity: t.ativo ? 1 : 0.55 }}>
      <input type="color" value={cor} disabled={!podeEditar} onChange={(e) => setCor(e.target.value)} style={corBox} />
      <input value={nome} disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} style={inp} />
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
