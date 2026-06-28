'use client'

import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PERIODOS } from '@/lib/periodo'
import { SITUACOES } from '@/lib/sac'

const CANAIS = ['Reclame Aqui', 'Blip', 'WhatsApp', 'Sults', 'Procon', 'Instagram', 'Manual', 'E-mail', 'Telefone', 'Formulário']
// Todas as 7 fases reais do enum (paridade com NovoChamado/ChamadosTabela/SacKanban).
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']

export function SacFiltros({ atendentes = [], motivos = [], unidades = [], children }: {
  atendentes?: { id: string; nome: string }[]; motivos?: string[]; unidades?: { id: string; nome: string }[]; children?: ReactNode
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
  const temFiltro = ['q', 'canal', 'fase', 'situacao', 'atendente', 'motivo', 'unidade', 'periodo'].some((k) => sp.get(k))

  return (
    <div className="cli-card" style={{ padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <i className="ti ti-headset" style={{ color: 'var(--brand-500)', fontSize: 18 }} /> <b>Chamados</b>
        </div>
        {children}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          defaultValue={sp.get('q') ?? ''} placeholder="Buscar cliente, protocolo..."
          onKeyDown={(e) => { if (e.key === 'Enter') setParams({ q: (e.target as HTMLInputElement).value }) }}
          style={{ ...sel, minWidth: 260 }}
        />
        {motivos.length > 0 && (
          <select value={sp.get('motivo') ?? ''} onChange={(e) => setParams({ motivo: e.target.value })} style={sel}>
            <option value="">Motivo (todos)</option>
            {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {atendentes.length > 0 && (
          <select value={sp.get('atendente') ?? ''} onChange={(e) => setParams({ atendente: e.target.value })} style={sel}>
            <option value="">Atendente (todos)</option>
            {atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
        {unidades.length > 0 && (
          <select value={sp.get('unidade') ?? ''} onChange={(e) => setParams({ unidade: e.target.value })} style={sel}>
            <option value="">Unidade (todas)</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <select value={sp.get('canal') ?? ''} onChange={(e) => setParams({ canal: e.target.value })} style={sel}>
          <option value="">Canal (todos)</option>
          {CANAIS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sp.get('situacao') ?? ''} onChange={(e) => setParams({ situacao: e.target.value })} style={sel}>
          <option value="">Status (todos)</option>
          {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sp.get('fase') ?? ''} onChange={(e) => setParams({ fase: e.target.value })} style={sel}>
          <option value="">Fase (todas)</option>
          {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
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
          <button className="btn btn-ghost" onClick={() => router.push('/sac/chamados')}><i className="ti ti-eraser" /> Limpar</button>
        )}
      </div>
    </div>
  )
}
