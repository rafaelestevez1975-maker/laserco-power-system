'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const CANAIS = ['Reclame Aqui', 'Blip', 'WhatsApp', 'Sults', 'Procon', 'Instagram', 'Manual', 'E-mail']
const FASES = ['Novo', 'Contato com cliente', 'Em pagamento', 'Concluído']
const PERIODOS: [string, string][] = [
  ['', 'Qualquer período'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Última semana'],
  ['mes', 'Mês atual'], ['mes_passado', 'Mês passado'], ['custom', 'Período…'],
]

export function SacFiltros({ atendentes = [], motivos = [], unidades = [] }: {
  atendentes?: { id: string; nome: string }[]; motivos?: string[]; unidades?: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) { if (v) p.set(k, v); else p.delete(k) }
    p.delete('page') // qualquer mudança de filtro volta para a página 1
    router.push(`/sac/chamados?${p.toString()}`)
  }

  const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const periodo = sp.get('periodo') ?? ''
  const temFiltro = ['q', 'canal', 'fase', 'atendente', 'motivo', 'unidade', 'periodo'].some((k) => sp.get(k))

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }}>
      <input
        defaultValue={sp.get('q') ?? ''} placeholder="🔎 Cliente, protocolo, CPF ou telefone..."
        onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value }) }}
        style={{ ...sel, minWidth: 230 }}
      />
      <select value={sp.get('canal') ?? ''} onChange={(e) => setParams({ canal: e.target.value })} style={sel}>
        <option value="">Todos os canais</option>
        {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={sp.get('fase') ?? ''} onChange={(e) => setParams({ fase: e.target.value })} style={sel}>
        <option value="">Todas as fases</option>
        {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      {motivos.length > 0 && (
        <select value={sp.get('motivo') ?? ''} onChange={(e) => setParams({ motivo: e.target.value })} style={sel}>
          <option value="">Todos os motivos</option>
          {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      )}
      {atendentes.length > 0 && (
        <select value={sp.get('atendente') ?? ''} onChange={(e) => setParams({ atendente: e.target.value })} style={sel}>
          <option value="">Todos os atendentes</option>
          {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      )}
      {unidades.length > 0 && (
        <select value={sp.get('unidade') ?? ''} onChange={(e) => setParams({ unidade: e.target.value })} style={sel}>
          <option value="">Todas as unidades</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      )}
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
      {temFiltro && (
        <button className="btn" onClick={() => router.push('/sac/chamados')}><i className="ti ti-x" /> Limpar</button>
      )}
    </div>
  )
}
