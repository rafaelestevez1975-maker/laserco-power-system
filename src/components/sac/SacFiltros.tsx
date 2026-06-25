'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const CANAIS = ['Reclame Aqui', 'Blip', 'WhatsApp', 'Sults', 'Procon', 'Instagram', 'Manual', 'E-mail']
const FASES = ['Novo', 'Contato com cliente', 'Em pagamento', 'Concluído']

export function SacFiltros({ atendentes = [] }: { atendentes?: { id: string; nome: string }[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  function setParam(k: string, v: string) {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set(k, v); else p.delete(k)
    p.delete('page') // qualquer mudança de filtro volta para a página 1
    router.push(`/sac/chamados?${p.toString()}`)
  }

  const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const temFiltro = sp.get('q') || sp.get('canal') || sp.get('fase') || sp.get('atendente')

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 14px' }}>
      <input
        defaultValue={sp.get('q') ?? ''} placeholder="🔎 Cliente, protocolo, CPF ou telefone..."
        onKeyDown={(e) => { if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value) }}
        style={{ ...sel, minWidth: 250 }}
      />
      <select value={sp.get('canal') ?? ''} onChange={(e) => setParam('canal', e.target.value)} style={sel}>
        <option value="">Todos os canais</option>
        {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={sp.get('fase') ?? ''} onChange={(e) => setParam('fase', e.target.value)} style={sel}>
        <option value="">Todas as fases</option>
        {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      {atendentes.length > 0 && (
        <select value={sp.get('atendente') ?? ''} onChange={(e) => setParam('atendente', e.target.value)} style={sel}>
          <option value="">Todos os atendentes</option>
          {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      )}
      {temFiltro && (
        <button className="btn" onClick={() => router.push('/sac/chamados')}><i className="ti ti-x" /> Limpar</button>
      )}
    </div>
  )
}
