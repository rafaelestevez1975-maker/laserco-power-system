'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function ProdutosFiltros({ grupos }: { grupos: string[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    p.delete('page')
    router.push(`/produtos?${p.toString()}`)
  }

  /** Exporta a lista filtrada (mesmos filtros da URL) em CSV via endpoint server-side. */
  function exportar() {
    const p = new URLSearchParams(sp.toString())
    p.set('export', 'csv')
    window.open(`/produtos/export?${p.toString()}`, '_blank')
  }

  const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const ativo = sp.get('ativo') ?? 'sim'
  const grupo = sp.get('grupo') ?? ''
  const insumo = sp.get('insumo') ?? ''
  const temFiltro = !!sp.get('q') || !!grupo || !!insumo || ativo !== 'sim'

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }}>
      <input
        defaultValue={sp.get('q') ?? ''}
        placeholder="🔎 Nome ou descrição do produto..."
        onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value }) }}
        style={{ ...sel, minWidth: 260 }}
      />
      {grupos.length > 0 && (
        <select value={grupo} onChange={(e) => setParams({ grupo: e.target.value })} style={sel}>
          <option value="">Todos os grupos</option>
          {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      )}
      <select value={ativo} onChange={(e) => setParams({ ativo: e.target.value })} style={sel}>
        <option value="sim">Ativos</option>
        <option value="nao">Inativos</option>
        <option value="">Todos</option>
      </select>
      <select value={insumo} onChange={(e) => setParams({ insumo: e.target.value })} style={sel}>
        <option value="">Insumo (todos)</option>
        <option value="sim">É insumo</option>
        <option value="nao">Não é insumo</option>
      </select>
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <button className="btn" onClick={exportar} title="Exportar a lista filtrada em CSV"><i className="ti ti-download" /> Exportar</button>
        {temFiltro && (
          <button className="btn" onClick={() => router.push('/produtos')}><i className="ti ti-x" /> Limpar</button>
        )}
      </div>
    </div>
  )
}
