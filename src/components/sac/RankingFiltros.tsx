'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Filtro de período do Ranking/Premiação do SAC. Recorta as métricas por mês (default)
 * para que o card "Destaque do mês" e a coluna Prêmio sejam honestos  paridade com o
 * recorte temporal do Dashboard do SAC (SacDashFiltros). Pílulas `sac-chip`, empurra
 * ?periodo (+ ?di/?df no custom) para /sac/ranking.
 */
const PERIOD_PILLS: [string, string][] = [
  ['', 'Tudo'], ['hoje', 'Hoje'], ['semana', 'Última semana'],
  ['mes', 'Mês atual'], ['mes_passado', 'Mês passado'], ['custom', 'Período'],
]

export function RankingFiltros() {
  const router = useRouter()
  const sp = useSearchParams()
  // Default "mes" (Mês atual)  coerente com o rótulo "Destaque do mês".
  const periodo = sp.get('periodo') ?? 'mes'

  function push(params: URLSearchParams) {
    const s = params.toString()
    router.push(s ? `/sac/ranking?${s}` : '/sac/ranking')
  }

  function setPeriodo(v: string) {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set('periodo', v); else p.delete('periodo')
    if (v !== 'custom') { p.delete('di'); p.delete('df') }
    push(p)
  }

  function setData(key: 'di' | 'df', v: string) {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set(key, v); else p.delete(key)
    push(p)
  }

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }
  const dateInp: React.CSSProperties = { padding: 7, border: '1px solid var(--line)', borderRadius: 8 }

  return (
    <div className="rel-card" style={{ marginBottom: 14 }}>
      <div style={lbl}><i className="ti ti-calendar" /> Período da premiação</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PERIOD_PILLS.map(([v, label]) => (
          <button key={v} type="button" className={`sac-chip${periodo === v ? ' on' : ''}`} onClick={() => setPeriodo(v)}>{label}</button>
        ))}
      </div>
      {periodo === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <input type="date" value={sp.get('di') ?? ''} onChange={(e) => setData('di', e.target.value)} style={dateInp} />
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>até</span>
          <input type="date" value={sp.get('df') ?? ''} onChange={(e) => setData('df', e.target.value)} style={dateInp} />
        </div>
      )}
    </div>
  )
}
