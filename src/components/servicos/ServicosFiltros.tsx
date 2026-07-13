'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function ServicosFiltros({ grupos }: { grupos: string[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    p.delete('page') // qualquer mudança de filtro volta para a página 1
    router.push(`/servicos?${p.toString()}`)
  }

  /** Exporta a lista filtrada (mesmos filtros da URL) em CSV via endpoint server-side. */
  function exportar() {
    const p = new URLSearchParams(sp.toString())
    p.set('export', 'csv')
    window.open(`/servicos/export?${p.toString()}`, '_blank')
  }

  const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const ativo = sp.get('ativo') ?? 'sim'
  const grupo = sp.get('grupo') ?? ''
  const tipoPreco = sp.get('tipo_preco') ?? ''
  const comiss = sp.get('comiss') ?? ''
  const temFiltro = !!sp.get('q') || !!grupo || ativo !== 'sim' || !!tipoPreco || !!comiss

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }}>
      <input
        defaultValue={sp.get('q') ?? ''}
        placeholder="🔎 Nome ou descrição do serviço..."
        onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value }) }}
        style={{ ...sel, minWidth: 260 }}
      />
      <select value={grupo} onChange={(e) => setParams({ grupo: e.target.value })} style={sel}>
        <option value="">Todos os grupos</option>
        {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <select value={ativo} onChange={(e) => setParams({ ativo: e.target.value })} style={sel}>
        <option value="sim">Ativos</option>
        <option value="nao">Inativos</option>
        <option value="">Todos</option>
      </select>
      <select value={tipoPreco} onChange={(e) => setParams({ tipo_preco: e.target.value })} style={sel} title="Tipo de preço">
        <option value="">Todos os preços</option>
        <option value="fixo">Fixo</option>
        <option value="variavel">Variável</option>
        <option value="gratuito">Gratuito</option>
      </select>
      <select value={comiss} onChange={(e) => setParams({ comiss: e.target.value })} style={sel} title="Comissionável">
        <option value="">Comissionável: Todos</option>
        <option value="sim">Comissionável: Sim</option>
        <option value="nao">Comissionável: Não</option>
      </select>
      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        <button className="btn" onClick={exportar} title="Exportar a lista filtrada em CSV"><i className="ti ti-download" /> Exportar</button>
        {temFiltro && (
          <button className="btn" onClick={() => router.push('/servicos')}><i className="ti ti-x" /> Limpar</button>
        )}
      </div>
    </div>
  )
}
