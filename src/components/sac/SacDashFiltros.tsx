'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { PERIODOS } from '@/lib/periodo'

export function SacDashFiltros({ atendentes = [] }: { atendentes?: { id: string; nome: string }[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) { if (v) p.set(k, v); else p.delete(k) }
    router.push(`/sac?${p.toString()}`)
  }

  const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const periodo = sp.get('periodo') ?? ''
  const temFiltro = !!(sp.get('periodo') || sp.get('atendente'))

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 16px' }}>
      <select value={periodo} onChange={(e) => setParams({ periodo: e.target.value, ...(e.target.value !== 'custom' ? { di: '', df: '' } : {}) })} style={sel}>
        {PERIODOS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      {periodo === 'custom' && (
        <>
          <input type="date" value={sp.get('di') ?? ''} onChange={(e) => setParams({ di: e.target.value })} style={sel} />
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>até</span>
          <input type="date" value={sp.get('df') ?? ''} onChange={(e) => setParams({ df: e.target.value })} style={sel} />
        </>
      )}
      {atendentes.length > 0 && (
        <select value={sp.get('atendente') ?? ''} onChange={(e) => setParams({ atendente: e.target.value })} style={sel}>
          <option value="">Todos os atendentes</option>
          {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      )}
      {temFiltro && <button className="btn" onClick={() => router.push('/sac')}><i className="ti ti-x" /> Limpar</button>}
    </div>
  )
}
