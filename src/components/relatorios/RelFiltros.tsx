'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'

/** Presets de período do relatório (espelha lib/periodo mas com defaults úteis p/ relatórios). */
export const REL_PERIODOS: [string, string][] = [
  ['mes', 'Mês atual'],
  ['mes_passado', 'Mês passado'],
  ['90d', 'Últimos 90 dias'],
  ['ano', 'Ano atual'],
  ['tudo', 'Todo o histórico'],
  ['custom', 'Período…'],
]

type Props = {
  /** valores atuais vindos da querystring */
  periodo: string
  di: string
  df: string
  basePath: string
}

/**
 * Filtro de período client-side: muda a querystring (?periodo=&di=&df=) e
 * navega — a página (Server Component) re-renderiza com os novos dados.
 */
export function RelFiltros({ periodo, di, df, basePath }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [p, setP] = useState(periodo || 'mes')
  const [dataI, setDataI] = useState(di)
  const [dataF, setDataF] = useState(df)

  function aplicar(nextP: string, nextDi: string, nextDf: string) {
    const sp = new URLSearchParams()
    if (nextP) sp.set('periodo', nextP)
    if (nextP === 'custom') {
      if (nextDi) sp.set('di', nextDi)
      if (nextDf) sp.set('df', nextDf)
    }
    const qs = sp.toString()
    router.push(`${basePath || pathname}${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <div>
        <label className="mf-l" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Período
        </label>
        <select
          className="mf"
          value={p}
          onChange={(e) => {
            const v = e.target.value
            setP(v)
            if (v !== 'custom') aplicar(v, dataI, dataF)
          }}
        >
          {REL_PERIODOS.map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </select>
      </div>

      {p === 'custom' && (
        <>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>De</label>
            <input className="mf" type="date" value={dataI} onChange={(e) => setDataI(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>Até</label>
            <input className="mf" type="date" value={dataF} onChange={(e) => setDataF(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="button" onClick={() => aplicar('custom', dataI, dataF)}>
            <i className="ti ti-filter" /> Aplicar
          </button>
        </>
      )}
    </div>
  )
}
