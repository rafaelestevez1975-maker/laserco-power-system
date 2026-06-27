'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PERIODOS, type PeriodoKey } from '@/lib/agenda'

/**
 * Filtro de período do dashboard (espelha dashPerSel + dashPerChange/dashPerCustom do legado).
 * Atualiza a querystring (?per=…&di=…&df=…); a página é Server Component e recalcula.
 */
export function DashFiltro({ per, di, df }: { per: PeriodoKey; di: string; df: string }) {
  const router = useRouter()
  const [ini, setIni] = useState(di)
  const [fim, setFim] = useState(df)
  const custom = per === 'periodo'

  function aplicar(p: PeriodoKey) {
    if (p === 'periodo') {
      // só navega quando ambas as datas estão preenchidas (regra do legado: d1->d2 obrigatório)
      if (ini && fim) router.push(`/?per=periodo&di=${ini}&df=${fim}`)
      else router.push('/?per=periodo')
      return
    }
    router.push(`/?per=${p}`)
  }

  const inpDate: React.CSSProperties = { padding: 7, border: '1px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13 }

  return (
    <div className="dash-filter" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className="ti ti-calendar" /> Período
      </span>
      <select
        value={per}
        onChange={(e) => aplicar(e.target.value as PeriodoKey)}
        style={{ padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: '#fff', fontWeight: 600, color: 'var(--text)' }}
      >
        {PERIODOS.map((p) => <option key={p.val} value={p.val}>{p.label}</option>)}
      </select>
      {custom && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} onBlur={() => { if (ini && fim) router.push(`/?per=periodo&di=${ini}&df=${fim}`) }} style={inpDate} />
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} onBlur={() => { if (ini && fim) router.push(`/?per=periodo&di=${ini}&df=${fim}`) }} style={inpDate} />
          <button className="btn" onClick={() => { if (ini && fim) router.push(`/?per=periodo&di=${ini}&df=${fim}`) }} disabled={!ini || !fim} style={{ padding: '6px 10px' }}>
            <i className="ti ti-filter" /> Aplicar
          </button>
        </span>
      )}
    </div>
  )
}
