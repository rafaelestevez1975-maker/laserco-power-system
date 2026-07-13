'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type Opt = { id: string; nome: string }

/**
 * Filtros extensos da lista de OS (período de criação, status, cliente, colaborador, origem).
 * Tudo via querystring → server re-renderiza com os filtros aplicados (server-side).
 */
export function OsFiltros({ clientes, colaboradores }: { clientes: Opt[]; colaboradores: Opt[] }) {
  const router = useRouter()
  const sp = useSearchParams()

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    p.delete('page')
    router.push(`/os?${p.toString()}`)
  }

  /** Exporta a lista filtrada (mesmos filtros da URL) em CSV via endpoint server-side. */
  function exportar() {
    const p = new URLSearchParams(sp.toString())
    p.delete('page')
    window.open(`/os/export?${p.toString()}`, '_blank')
  }

  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 12.5, background: '#fff', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }

  const status = sp.get('status') ?? ''
  const cliente = sp.get('cliente') ?? ''
  const colaborador = sp.get('colaborador') ?? ''
  const origem = sp.get('origem') ?? ''
  const di = sp.get('di') ?? ''
  const df = sp.get('df') ?? ''
  const temFiltro = !!(status || cliente || colaborador || origem || di || df)

  return (
    <div className="rel-card" style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 600, fontSize: 13 }}>
        <i className="ti ti-filter" /> Filtros
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" style={{ padding: '4px 10px' }} onClick={exportar} title="Exportar a lista filtrada em CSV">
            <i className="ti ti-download" /> Exportar
          </button>
          {temFiltro && (
            <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => router.push('/os')}>
              <i className="ti ti-x" /> Limpar
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        <div>
          <label style={lbl}>Criada a partir de</label>
          <input type="date" value={di} onChange={(e) => setParams({ di: e.target.value })} style={{ ...inp, width: '100%' }} />
        </div>
        <div>
          <label style={lbl}>Criada até</label>
          <input type="date" value={df} onChange={(e) => setParams({ df: e.target.value })} style={{ ...inp, width: '100%' }} />
        </div>
        <div>
          <label style={lbl}>Status</label>
          <select value={status} onChange={(e) => setParams({ status: e.target.value })} style={{ ...inp, width: '100%' }}>
            <option value="">Todos</option>
            <option value="aberta">Aberta</option>
            <option value="fechada">Fechada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Origem</label>
          <select value={origem} onChange={(e) => setParams({ origem: e.target.value })} style={{ ...inp, width: '100%' }}>
            <option value="">Todas</option>
            <option value="avulsa">Avulsa</option>
            <option value="agendamento">Agendamento</option>
            <option value="pacote">Pacote</option>
            <option value="assinatura">Assinatura</option>
            <option value="interna">Interna</option>
            <option value="multa_assinatura">Multa de assinatura</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Cliente</label>
          <select value={cliente} onChange={(e) => setParams({ cliente: e.target.value })} style={{ ...inp, width: '100%' }}>
            <option value="">Todos</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Colaborador (criou)</label>
          <select value={colaborador} onChange={(e) => setParams({ colaborador: e.target.value })} style={{ ...inp, width: '100%' }}>
            <option value="">Todos</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
