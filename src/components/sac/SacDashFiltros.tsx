'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Filtros da Dashboard do SAC — paridade 1:1 com o legado (`sacDashboard`, legacy/index.html ~8985).
 * Card `rel-card` com duas colunas: Período (pílulas) + Atendente (pílulas).
 * - Período: pílulas Hoje/Ontem/Última semana/Mês atual/Mês passado/Período. Default "Mês atual".
 * - Atendente: multi-seleção "Todos" + N atendentes (SAC_DFILT.at é array no legado);
 *   os ids escolhidos vão como múltiplos ?atendente= na URL.
 */
const PERIOD_PILLS: [string, string][] = [
  ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Última semana'],
  ['mes', 'Mês atual'], ['mes_passado', 'Mês passado'], ['custom', 'Período'],
]

export function SacDashFiltros({ atendentes = [] }: { atendentes?: { id: string; nome: string }[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  // Período: sem ?periodo na URL => default "mes" (Mês atual), idêntico ao legado.
  const periodo = sp.get('periodo') ?? 'mes'
  const ats = sp.getAll('atendente').filter(Boolean)

  function push(params: URLSearchParams) {
    const s = params.toString()
    router.push(s ? `/sac?${s}` : '/sac')
  }

  function setPeriodo(v: string) {
    const p = new URLSearchParams(sp.toString())
    p.set('periodo', v)
    if (v !== 'custom') { p.delete('di'); p.delete('df') }
    push(p)
  }

  function setData(key: 'di' | 'df', v: string) {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set(key, v); else p.delete(key)
    push(p)
  }

  function toggleAtendente(id: string) {
    const p = new URLSearchParams(sp.toString())
    p.delete('atendente')
    const next = ats.includes(id) ? ats.filter((x) => x !== id) : [...ats, id]
    for (const a of next) p.append('atendente', a)
    push(p)
  }

  function todosAtendentes() {
    const p = new URLSearchParams(sp.toString())
    p.delete('atendente')
    push(p)
  }

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }
  const dateInp: React.CSSProperties = { padding: 7, border: '1px solid var(--line)', borderRadius: 8 }

  return (
    <div className="rel-card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={lbl}><i className="ti ti-calendar" /> Período</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PERIOD_PILLS.map(([v, label]) => (
              <button key={v} type="button" className={`sac-chip${periodo === v ? ' on' : ''}`} onClick={() => setPeriodo(v)}>{label}</button>
            ))}
          </div>
          {periodo === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input type="date" value={sp.get('di') ?? ''} onChange={(e) => setData('di', e.target.value)} style={dateInp} />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>até</span>
              <input type="date" value={sp.get('df') ?? ''} onChange={(e) => setData('df', e.target.value)} style={dateInp} />
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={lbl}><i className="ti ti-user-cog" /> Atendente</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" className={`sac-chip${ats.length === 0 ? ' on' : ''}`} onClick={todosAtendentes}>Todos</button>
            {atendentes.map((a) => (
              <button key={a.id} type="button" className={`sac-chip${ats.includes(a.id) ? ' on' : ''}`} onClick={() => toggleAtendente(a.id)}>{a.nome}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
