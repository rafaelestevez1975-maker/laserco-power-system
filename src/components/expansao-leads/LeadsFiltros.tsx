'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Opt = [string, string]

type Props = {
  basePath: string
  /** querystring atual (preserva periodo/di/df ao aplicar) */
  periodo: string
  di: string
  df: string
  /** valores atuais dos filtros desta tela */
  q: string
  origem: string
  temperatura: string
  etapa: string
  /** opções dinâmicas vindas do servidor */
  origens: Opt[]
  temperaturas: Opt[]
  etapas: Opt[]
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  color: 'var(--text-3)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '.4px',
}

/**
 * Filtros da lista de leads de Expansão (origem, temperatura, etapa, busca por texto).
 * Muda a querystring e navega — a página (Server Component) re-renderiza com os dados filtrados.
 * O período (periodo/di/df) é preservado para não conflitar com o RelFiltros ao lado.
 */
export function LeadsFiltros({
  basePath,
  periodo,
  di,
  df,
  q,
  origem,
  temperatura,
  etapa,
  origens,
  temperaturas,
  etapas,
}: Props) {
  const router = useRouter()
  const [busca, setBusca] = useState(q)
  const [org, setOrg] = useState(origem)
  const [tmp, setTmp] = useState(temperatura)
  const [etp, setEtp] = useState(etapa)

  function navegar(next: { q?: string; origem?: string; temperatura?: string; etapa?: string }) {
    const sp = new URLSearchParams()
    if (periodo) sp.set('periodo', periodo)
    if (periodo === 'custom') {
      if (di) sp.set('di', di)
      if (df) sp.set('df', df)
    }
    const nq = next.q ?? busca
    const norg = next.origem ?? org
    const ntmp = next.temperatura ?? tmp
    const netp = next.etapa ?? etp
    if (nq.trim()) sp.set('q', nq.trim())
    if (norg) sp.set('origem', norg)
    if (ntmp) sp.set('temperatura', ntmp)
    if (netp) sp.set('etapa', netp)
    const qs = sp.toString()
    router.push(`${basePath}${qs ? `?${qs}` : ''}`)
  }

  function limpar() {
    setBusca('')
    setOrg('')
    setTmp('')
    setEtp('')
    const sp = new URLSearchParams()
    if (periodo) sp.set('periodo', periodo)
    if (periodo === 'custom') {
      if (di) sp.set('di', di)
      if (df) sp.set('df', df)
    }
    const qs = sp.toString()
    router.push(`${basePath}${qs ? `?${qs}` : ''}`)
  }

  const temFiltro = !!(busca.trim() || org || tmp || etp)

  return (
    <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 220px', minWidth: 180 }}>
        <label style={labelStyle}>Buscar</label>
        <input
          className="mf"
          style={{ width: '100%' }}
          type="search"
          value={busca}
          placeholder="Nome, empresa, linha…"
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navegar({})
          }}
        />
      </div>

      <div>
        <label style={labelStyle}>Origem</label>
        <select
          className="mf"
          value={org}
          onChange={(e) => {
            setOrg(e.target.value)
            navegar({ origem: e.target.value })
          }}
        >
          <option value="">Todas</option>
          {origens.map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Temperatura</label>
        <select
          className="mf"
          value={tmp}
          onChange={(e) => {
            setTmp(e.target.value)
            navegar({ temperatura: e.target.value })
          }}
        >
          <option value="">Todas</option>
          {temperaturas.map(([val, lbl]) => (
            <option key={val} value={val}>
              {lbl}
            </option>
          ))}
        </select>
      </div>

      {etapas.length > 0 && (
        <div>
          <label style={labelStyle}>Etapa</label>
          <select
            className="mf"
            value={etp}
            onChange={(e) => {
              setEtp(e.target.value)
              navegar({ etapa: e.target.value })
            }}
          >
            <option value="">Todas</option>
            {etapas.map(([val, lbl]) => (
              <option key={val} value={val}>
                {lbl}
              </option>
            ))}
          </select>
        </div>
      )}

      <button className="btn btn-primary" type="button" onClick={() => navegar({})}>
        <i className="ti ti-filter" /> Filtrar
      </button>
      {temFiltro && (
        <button className="btn btn-ghost" type="button" onClick={limpar}>
          <i className="ti ti-x" /> Limpar
        </button>
      )}
    </div>
  )
}
