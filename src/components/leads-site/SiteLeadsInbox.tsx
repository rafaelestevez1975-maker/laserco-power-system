'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { rotearSiteLead } from '@/app/(app)/leads-site/actions'

export type SiteLead = {
  id: string
  tipo: string
  nome: string
  email: string | null
  contato: string | null
  area: string | null
  mensagem: string | null
  origem: string | null
  quando: string | null
  routed: boolean
  destino: string | null
  unidadeLabel?: string | null
  sugestaoUnidadeId?: string | null
}
export type Unidade = { id: string; nome: string }

const TIPO_DESTINO: Record<string, 'SAC' | 'CRM' | 'RH'> = { sac: 'SAC', curriculo: 'RH' }
const destinoDe = (t: string) => TIPO_DESTINO[t.toLowerCase()] ?? 'CRM'

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, string> = {
    sac: 'var(--red)', oferta: 'var(--brand-500)', avaliacao: 'var(--brand-500)',
    agendamento: 'var(--brand-500)', franquia: 'var(--gold-600)', curriculo: 'var(--blue)', indicacao: 'var(--green)',
  }
  const c = map[tipo.toLowerCase()] ?? 'var(--text-3)'
  return <span style={{ background: c, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase' }}>{tipo || ''}</span>
}

export function SiteLeadsInbox({ leads, unidades, activeUnitId }: { leads: SiteLead[]; unidades: Unidade[]; activeUnitId: string | null }) {
  const router = useRouter()
  const [unit, setUnit] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [bulk, setBulk] = useState(false)
  const [msg, setMsg] = useState('')

  // ── Filtros (client-side, instantâneos sobre os leads carregados) ──
  const [fTipo, setFTipo] = useState('')
  const [fStatus, setFStatus] = useState('') // '' | 'pendente' | 'roteado'
  const [fBusca, setFBusca] = useState('')
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')

  const tipos = useMemo(
    () => Array.from(new Set(leads.map((l) => l.tipo).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [leads],
  )

  const filtered = useMemo(() => {
    const q = fBusca.trim().toLowerCase()
    return leads.filter((l) => {
      if (fTipo && l.tipo.toLowerCase() !== fTipo.toLowerCase()) return false
      if (fStatus === 'pendente' && l.routed) return false
      if (fStatus === 'roteado' && !l.routed) return false
      if (q) {
        const hay = `${l.nome} ${l.email ?? ''} ${l.contato ?? ''} ${l.mensagem ?? ''} ${l.area ?? ''} ${l.origem ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (fDe || fAte) {
        if (!l.quando) return false
        const dia = l.quando.slice(0, 10)
        if (fDe && dia < fDe) return false
        if (fAte && dia > fAte) return false
      }
      return true
    })
  }, [leads, fTipo, fStatus, fBusca, fDe, fAte])

  const temFiltro = !!(fTipo || fStatus || fBusca.trim() || fDe || fAte)
  function limpar() { setFTipo(''); setFStatus(''); setFBusca(''); setFDe(''); setFAte('') }

  async function rotear(id: string, sugestao?: string | null) {
    const u = unit[id] || sugestao || activeUnitId || ''
    if (!u) { setMsg('Selecione a unidade de destino primeiro.'); return }
    setBusy(id); setMsg('')
    const res = await rotearSiteLead(id, u)
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro ao rotear.')
    else { setMsg(`Lead roteado para ${res.destino}.`); router.refresh() }
  }

  /** Roteia TODOS os pendentes de uma vez: cada lead vai para o destino do seu tipo
   *  (SAC/CRM/RH) na unidade sugerida pelo site (ou a unidade ativa). */
  async function rotearTodos() {
    const pend = filtered.filter((l) => !l.routed)
    if (!pend.length) return
    if (!confirm(`Rotear automaticamente ${pend.length} lead(s)? Cada um vai para o destino do seu tipo (SAC/CRM/RH), na unidade sugerida pelo site.`)) return
    setBulk(true); setMsg('Roteando…')
    let ok = 0, pulados = 0
    for (const l of pend) {
      const u = unit[l.id] || l.sugestaoUnidadeId || activeUnitId || ''
      const res = await rotearSiteLead(l.id, u)
      if (res.ok) ok++; else pulados++
    }
    setBulk(false)
    setMsg(`Roteados automaticamente: ${ok}.${pulados ? ` Não roteados (revise manualmente — sem unidade ou já roteado): ${pulados}.` : ''}`)
    router.refresh()
  }

  const pendentes = filtered.filter((l) => !l.routed).length

  return (
    <div className="rel-card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="ti ti-inbox" style={{ color: 'var(--brand-500)' }} />
        <b>Caixa de entrada do site</b>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {pendentes} pendente(s) · {filtered.length}{temFiltro ? ` de ${leads.length}` : ''} lead(s)
        </span>
        {msg && <span style={{ fontSize: 12.5, color: 'var(--brand-600)' }}>{msg}</span>}
        {pendentes > 0 && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={bulk} onClick={rotearTodos}>
            {bulk ? 'Roteando…' : <><i className="ti ti-rocket" /> Rotear {temFiltro ? 'os filtrados' : 'automaticamente'} ({pendentes})</>}
          </button>
        )}
      </div>

      {/* Barra de filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2, #faf7f8)' }}>
        <div style={{ flex: '1 1 200px', minWidth: 160 }}>
          <input value={fBusca} onChange={(e) => setFBusca(e.target.value)} placeholder="Buscar nome, e-mail, telefone, mensagem…"
            style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }} />
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }}>
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="roteado">Roteados</option>
        </select>
        <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 2 }}>De
          <input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 2 }}>Até
          <input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }} />
        </label>
        {temFiltro && <button className="btn" onClick={limpar}><i className="ti ti-x" /> Limpar</button>}
      </div>

      {leads.length === 0 && <div style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>Nenhum lead do site na caixa de entrada.</div>}
      {leads.length > 0 && filtered.length === 0 && <div style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>Nenhum lead com esses filtros. <button className="btn" onClick={limpar} style={{ marginLeft: 6 }}>Limpar filtros</button></div>}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filtered.map((l) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 320px', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
            <TipoBadge tipo={l.tipo} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{l.nome}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {l.contato && <span><i className="ti ti-brand-whatsapp" /> {l.contato}</span>}
                {l.email && <span><i className="ti ti-mail" /> {l.email}</span>}
                {l.area && <span>· {l.area}</span>}
                {l.quando && <span>· {new Date(l.quando).toLocaleDateString('pt-BR')}</span>}
              </div>
              {l.mensagem && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>“{l.mensagem}”</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
              {l.routed ? (
                <span className="os-st" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
                  <i className="ti ti-check" /> Roteado → {l.destino}
                </span>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      value={unit[l.id] ?? l.sugestaoUnidadeId ?? activeUnitId ?? ''}
                      onChange={(e) => setUnit((p) => ({ ...p, [l.id]: e.target.value }))}
                      style={{ width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5 }}
                    >
                      <option value="">Unidade…</option>
                      {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                    {l.sugestaoUnidadeId && !unit[l.id] && <div style={{ fontSize: 10.5, color: 'var(--green)', marginTop: 2 }}>✨ sugerida pelo site{l.unidadeLabel ? `: ${l.unidadeLabel}` : ''}</div>}
                  </div>
                  <button className="btn btn-primary" disabled={busy === l.id} onClick={() => rotear(l.id, l.sugestaoUnidadeId)} style={{ whiteSpace: 'nowrap' }}>
                    {busy === l.id ? '…' : <><i className="ti ti-arrow-right" /> {destinoDe(l.tipo)}</>}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
