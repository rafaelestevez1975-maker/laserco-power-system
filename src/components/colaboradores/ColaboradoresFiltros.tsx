'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { PERFIL_LABELS } from './labels'

export function ColaboradoresFiltros({ areas }: { areas: string[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    p.delete('page') // qualquer mudança de filtro volta para a página 1
    router.push(`/colaboradores?${p.toString()}`)
  }

  /** Exporta a lista filtrada (mesmos filtros da URL) em CSV via endpoint server-side. */
  function exportar() {
    const p = new URLSearchParams(sp.toString())
    p.delete('page')
    window.open(`/colaboradores/export?${p.toString()}`, '_blank')
  }

  const selSt: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const status = sp.get('status') ?? 'ativo'
  const temFiltro = ['q', 'regime', 'cargo', 'area'].some((k) => sp.get(k)) || status !== 'ativo'

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }}>
      <input
        defaultValue={sp.get('q') ?? ''}
        placeholder="🔎 Nome, CPF, telefone, e-mail ou cargo..."
        onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value }) }}
        style={{ ...selSt, minWidth: 260 }}
      />
      <select value={status} onChange={(e) => setParams({ status: e.target.value })} style={selSt}>
        <option value="ativo">Ativos</option>
        <option value="inativo">Inativos</option>
        <option value="">Todos</option>
      </select>
      <select value={sp.get('regime') ?? ''} onChange={(e) => setParams({ regime: e.target.value })} style={selSt}>
        <option value="">Regime (todos)</option>
        <option value="clt">CLT</option>
        <option value="pj">PJ</option>
      </select>
      <select value={sp.get('cargo') ?? ''} onChange={(e) => setParams({ cargo: e.target.value })} style={selSt}>
        <option value="">Perfil de acesso (todos)</option>
        {Object.entries(PERFIL_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {areas.length > 0 && (
        <select value={sp.get('area') ?? ''} onChange={(e) => setParams({ area: e.target.value })} style={selSt}>
          <option value="">Área (todas)</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <button className="btn" onClick={exportar} title="Exportar a lista filtrada em CSV"><i className="ti ti-download" /> Exportar</button>
        {temFiltro && (
          <button className="btn" onClick={() => router.push('/colaboradores')}><i className="ti ti-x" /> Limpar</button>
        )}
      </div>
    </div>
  )
}
