'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Unidade = { id: string; nome: string }

export function ClientesFiltros({ unidades = [] }: { unidades?: Unidade[] }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [aberto, setAberto] = useState(true)

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    p.delete('page') // qualquer mudança de filtro volta para a página 1
    router.push(`/clientes?${p.toString()}`)
  }

  /** Exporta a lista filtrada (mesmos filtros da URL) em CSV via endpoint server-side. */
  function exportar() {
    const p = new URLSearchParams(sp.toString())
    p.set('export', 'csv')
    window.open(`/clientes/export?${p.toString()}`, '_blank')
  }

  const sel: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff' }
  const ativo = sp.get('ativo') ?? 'sim'
  const temFiltro = ['q', 'verificado', 'genero', 'doc', 'bloqueado', 'app', 'cidade', 'estado', 'unidade'].some((k) => sp.get(k)) || ativo !== 'sim'

  return (
    <div className="fil-card" style={{ border: '1px solid var(--line)', borderRadius: 12, marginBottom: 14, background: 'var(--surface)' }}>
      <div
        onClick={() => setAberto((a) => !a)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', cursor: 'pointer', borderBottom: aberto ? '1px solid var(--line)' : 'none' }}
      >
        <h3 style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-2)' }}>
          <i className="ti ti-filter" /> Filtros {temFiltro && <span style={{ fontSize: 11, color: 'var(--brand-500)', fontWeight: 600 }}>(ativos)</span>}
        </h3>
        <i className={`ti ${aberto ? 'ti-minus' : 'ti-plus'}`} style={{ color: 'var(--text-3)' }} />
      </div>

      {aberto && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 14 }}>
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
          <select value={sp.get('genero') ?? ''} onChange={(e) => setParams({ genero: e.target.value })} style={sel}>
            <option value="">Gênero (todos)</option>
            <option value="female">Feminino</option>
            <option value="male">Masculino</option>
            <option value="other">Outro</option>
          </select>
          <select value={sp.get('doc') ?? ''} onChange={(e) => setParams({ doc: e.target.value })} style={sel}>
            <option value="">Documento (todos)</option>
            <option value="cpf">Com CPF</option>
            <option value="rg">Com RG</option>
            <option value="sem">Sem documento</option>
          </select>
          {/* Arquivos importados do BEMP: usa os contadores denormalizados (clientes.total_*) */}
          <select value={sp.get('arquivos') ?? ''} onChange={(e) => setParams({ arquivos: e.target.value })} style={sel} title="Fotos, anamneses e contratos assinados importados do BEMP">
            <option value="">Arquivos (todos)</option>
            <option value="com">Com fotos/documentos</option>
            <option value="contrato">Com contrato assinado</option>
            <option value="sem">Sem arquivos</option>
          </select>
          <select value={sp.get('bloqueado') ?? ''} onChange={(e) => setParams({ bloqueado: e.target.value })} style={sel}>
            <option value="">Bloqueado (todos)</option>
            <option value="sim">Bloqueados</option>
            <option value="nao">Não bloqueados</option>
          </select>
          <select value={sp.get('app') ?? ''} onChange={(e) => setParams({ app: e.target.value })} style={sel}>
            <option value="">App (todos)</option>
            <option value="sim">Com app</option>
            <option value="nao">Sem app</option>
          </select>
          {unidades.length > 0 && (
            <select value={sp.get('unidade') ?? ''} onChange={(e) => setParams({ unidade: e.target.value })} style={sel}>
              <option value="">Todas as unidades</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          )}
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

          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn" onClick={exportar} title="Exportar a lista filtrada em CSV"><i className="ti ti-download" /> Exportar</button>
            {temFiltro && (
              <button className="btn" onClick={() => router.push('/clientes')}><i className="ti ti-x" /> Limpar</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
