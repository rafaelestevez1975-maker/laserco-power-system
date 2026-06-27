'use client'

import { useEffect, useState } from 'react'
import { carregarServicosColaborador, salvarServicosColaborador, type ServicoOpcao } from '@/app/(app)/colaboradores/actions'

/** Ordem dos grupos igual ao legado GRP_ORDER (Depilação, Estético, Ultrassom). */
const GRP_ORDER = ['Depilação', 'Estético', 'Ultrassom']

/**
 * "Serviços que o colaborador executa" — grupos colapsáveis com checkbox por serviço,
 * marcar grupo inteiro e marcar todos os serviços ativos. Fiel a colabServRender do
 * legado (~7120). Persiste em colaborador_servicos (action salvarServicosColaborador).
 */
export function ColabServicos({ colaboradorId, podeEscrever }: { colaboradorId: string; podeEscrever: boolean }) {
  const [servicos, setServicos] = useState<ServicoOpcao[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [tabelaPronta, setTabelaPronta] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const res = await carregarServicosColaborador(colaboradorId)
      if (!vivo) return
      if (!res.ok) { setErro(res.error); setCarregando(false); return }
      setServicos(res.servicos)
      setSel(new Set(res.selecionados))
      setTabelaPronta(res.tabelaPronta)
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [colaboradorId])

  // Agrupa por grupo, ordenando pelos grupos conhecidos primeiro.
  const grupos = (() => {
    const g: Record<string, ServicoOpcao[]> = {}
    for (const s of servicos) (g[s.grupo] = g[s.grupo] || []).push(s)
    const keys = Object.keys(g).sort((a, b) => {
      const ia = GRP_ORDER.indexOf(a), ib = GRP_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
    })
    return keys.map((k) => ({ grupo: k, itens: g[k] }))
  })()

  const allIds = servicos.map((s) => s.id)
  const todosMarcados = allIds.length > 0 && allIds.every((id) => sel.has(id))

  function toggleItem(id: string) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleGrupo(grupo: string, on: boolean) {
    const ids = (grupos.find((x) => x.grupo === grupo)?.itens ?? []).map((s) => s.id)
    setSel((prev) => { const n = new Set(prev); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n })
  }
  function toggleTodos(on: boolean) {
    setSel(on ? new Set(allIds) : new Set())
  }
  function toggleAberto(grupo: string) {
    setAbertos((prev) => { const n = new Set(prev); n.has(grupo) ? n.delete(grupo) : n.add(grupo); return n })
  }

  async function salvar() {
    setErro(''); setMsg(''); setSalvando(true)
    const res = await salvarServicosColaborador(colaboradorId, [...sel])
    setSalvando(false)
    if (!res.ok) { setErro(res.error || 'Erro ao salvar serviços.'); return }
    setMsg('Serviços salvos.')
  }

  if (carregando) return <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Carregando serviços…</p>

  if (!tabelaPronta) {
    return (
      <div className="rel-legend">
        <i className="ti ti-info-circle" /> A persistência de serviços por colaborador requer a migration <code>scripts/migrations/comissoes.sql</code> no lkii.
      </div>
    )
  }

  if (servicos.length === 0) {
    return <div className="rel-legend"><i className="ti ti-info-circle" /> Nenhum serviço ativo cadastrado para selecionar.</div>
  }

  return (
    <div>
      <label className="rule-item" style={{ margin: '6px 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <input type="checkbox" disabled={!podeEscrever} checked={todosMarcados} onChange={(e) => toggleTodos(e.target.checked)} />
        <span><b>Marcar todos os serviços</b> (todos os serviços ativos do sistema)</span>
      </label>

      {grupos.map(({ grupo, itens }) => {
        const ids = itens.map((s) => s.id)
        const grpAll = ids.length > 0 && ids.every((id) => sel.has(id))
        const aberto = abertos.has(grupo)
        return (
          <div key={grupo} style={{ marginBottom: 8, border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-2)', padding: '8px 11px', cursor: 'pointer' }} onClick={() => toggleAberto(grupo)}>
              <input type="checkbox" disabled={!podeEscrever} checked={grpAll} onClick={(e) => e.stopPropagation()} onChange={(e) => toggleGrupo(grupo, e.target.checked)} />
              <b>{grupo}</b>
              <span style={{ color: 'var(--text-3)', fontWeight: 500, fontSize: 12 }}>· {itens.length} serviço(s)</span>
              <i className="ti ti-chevron-down" style={{ marginLeft: 'auto', transition: 'transform .2s', transform: aberto ? 'rotate(180deg)' : 'none' }} />
            </div>
            {aberto && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '3px 14px', padding: '10px 12px' }}>
                {itens.map((s) => (
                  <label key={s.id} className="rule-item" style={{ margin: 0, fontSize: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <input type="checkbox" disabled={!podeEscrever} checked={sel.has(s.id)} onChange={() => toggleItem(s.id)} />
                    <span>{s.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
        Cada grupo abre em lista suspensa. Marque o grupo inteiro ou selecione serviço a serviço.
      </div>

      {msg && <p style={{ color: '#15803D', background: '#E7F0EC', borderRadius: 8, padding: '8px 11px', fontSize: 12.5, marginTop: 10 }}><i className="ti ti-check" /> {msg}</p>}
      {erro && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}><i className="ti ti-alert-triangle" /> {erro}</p>}

      {podeEscrever && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            <i className="ti ti-device-floppy" /> {salvando ? 'Salvando…' : 'Salvar serviços'}
          </button>
        </div>
      )}
    </div>
  )
}
