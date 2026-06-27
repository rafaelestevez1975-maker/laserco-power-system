'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function ClientesFiltros() {
  const router = useRouter()
  const sp = useSearchParams()

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    p.delete('page') // qualquer mudança de filtro volta para a página 1
    router.push(`/clientes?${p.toString()}`)
  }

  const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const ativo = sp.get('ativo') ?? 'sim'
  const temFiltro = ['q', 'verificado', 'cidade', 'estado'].some((k) => sp.get(k)) || ativo !== 'sim'

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }}>
      <input
        defaultValue={sp.get('q') ?? ''}
        placeholder="🔎 Nome, CPF, telefone ou e-mail..."
        onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value }) }}
        style={{ ...sel, minWidth: 240 }}
      />
      <select value={ativo} onChange={(e) => setParams({ ativo: e.target.value })} style={sel}>
        <option value="sim">Ativos</option>
        <option value="nao">Inativos</option>
        <option value="">Todos</option>
      </select>
      <select value={sp.get('verificado') ?? ''} onChange={(e) => setParams({ verificado: e.target.value })} style={sel}>
        <option value="">Verificação (todos)</option>
        <option value="sim">Verificados</option>
        <option value="nao">Não verificados</option>
      </select>
      <input
        defaultValue={sp.get('cidade') ?? ''}
        placeholder="Cidade"
        onKeyDown={(e) => { if (e.key === 'Enter') setParams({ cidade: (e.target as HTMLInputElement).value }) }}
        style={{ ...sel, minWidth: 130 }}
      />
      <input
        defaultValue={sp.get('estado') ?? ''}
        placeholder="Estado / UF"
        onKeyDown={(e) => { if (e.key === 'Enter') setParams({ estado: (e.target as HTMLInputElement).value }) }}
        style={{ ...sel, minWidth: 120 }}
      />
      {temFiltro && (
        <button className="btn" onClick={() => router.push('/clientes')}><i className="ti ti-x" /> Limpar</button>
      )}
    </div>
  )
}
