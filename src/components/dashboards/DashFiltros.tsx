'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { REL_PERIODOS_FULL, FUNIL_TIPO_UNI } from '@/lib/dashboards'

export type UnidadeOpt = { id: string; nome: string }
export type ExportRow = (string | number)[]

type Props = {
  /** valores atuais vindos da querystring */
  periodo: string
  di: string
  df: string
  basePath: string
  /** unidades disponíveis para o select (vazio = oculta o select) */
  unidades?: UnidadeOpt[]
  /** unidade selecionada na querystring (?unidade=)  'todas' = sem filtro */
  unidade?: string
  /** quando true, mostra também o select 'Tipo de unidade' (funil) */
  tipoUni?: boolean
  /** tipo de unidade atual (?tipoUni=) */
  tipoUniVal?: string
  /** dados p/ exportar CSV (header + linhas). Sem dados → botão Exportar oculto. */
  exportData?: { nome: string; header: string[]; rows: ExportRow[] }
}

/**
 * Filtro dos DASHBOARDS  réplica do bloco de filtros do buildDashb() do legado
 * (legacy/index.html ~4611): Período (8 presets) + Unidade + [Tipo de unidade no funil]
 * + ações Pesquisar/Exportar. Muda a querystring e navega (a página RSC re-renderiza).
 */
export function DashFiltros({
  periodo,
  di,
  df,
  basePath,
  unidades = [],
  unidade = 'todas',
  tipoUni = false,
  tipoUniVal = 'ambas',
  exportData,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [p, setP] = useState(periodo || 'mes')
  const [dataI, setDataI] = useState(di)
  const [dataF, setDataF] = useState(df)
  const [uni, setUni] = useState(unidade || 'todas')
  const [tipo, setTipo] = useState(tipoUniVal || 'ambas')

  function aplicar(nextP: string, nextUni: string, nextTipo: string, nextDi: string, nextDf: string) {
    const sp = new URLSearchParams()
    if (nextP) sp.set('periodo', nextP)
    if (nextP === 'custom') {
      if (nextDi) sp.set('di', nextDi)
      if (nextDf) sp.set('df', nextDf)
    }
    if (nextUni && nextUni !== 'todas') sp.set('unidade', nextUni)
    if (tipoUni && nextTipo && nextTipo !== 'ambas') sp.set('tipoUni', nextTipo)
    const qs = sp.toString()
    router.push(`${basePath || pathname}${qs ? `?${qs}` : ''}`)
  }

  function exportarCSV() {
    if (!exportData || exportData.rows.length === 0) return
    const esc = (s: string | number) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const linhas = exportData.rows.map((r) => r.map(esc).join(';'))
    const csv = '﻿' + [exportData.header.map(esc).join(';'), ...linhas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportData.nome}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const lblStyle: React.CSSProperties = { display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }

  return (
    <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <div>
        <label className="mf-l" style={lblStyle}>Período</label>
        <select
          className="mf"
          value={p}
          onChange={(e) => {
            const v = e.target.value
            setP(v)
            if (v !== 'custom') aplicar(v, uni, tipo, dataI, dataF)
          }}
        >
          {REL_PERIODOS_FULL.map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
      </div>

      {unidades.length > 0 && (
        <div>
          <label style={lblStyle}>Unidade</label>
          <select
            className="mf"
            value={uni}
            onChange={(e) => {
              const v = e.target.value
              setUni(v)
              aplicar(p, v, tipo, dataI, dataF)
            }}
          >
            <option value="todas">Todas as unidades</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      )}

      {tipoUni && (
        <div>
          <label style={lblStyle}>Tipo de unidade</label>
          <select
            className="mf"
            value={tipo}
            onChange={(e) => {
              const v = e.target.value
              setTipo(v)
              aplicar(p, uni, v, dataI, dataF)
            }}
          >
            {FUNIL_TIPO_UNI.map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </div>
      )}

      {p === 'custom' && (
        <>
          <div>
            <label style={lblStyle}>De</label>
            <input className="mf" type="date" value={dataI} onChange={(e) => setDataI(e.target.value)} />
          </div>
          <div>
            <label style={lblStyle}>Até</label>
            <input className="mf" type="date" value={dataF} onChange={(e) => setDataF(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="button" onClick={() => aplicar('custom', uni, tipo, dataI, dataF)}>
            <i className="ti ti-search" /> Pesquisar
          </button>
        </>
      )}

      {exportData && exportData.rows.length > 0 && (
        <button className="btn btn-ghost" type="button" onClick={exportarCSV} style={{ marginLeft: 'auto' }} title="Exportar os dados do dashboard em CSV">
          <i className="ti ti-download" /> Exportar
        </button>
      )}
    </div>
  )
}
