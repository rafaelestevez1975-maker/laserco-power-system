'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { editarUnidade, toggleAtivaUnidade, criarUnidade, removerUnidade } from '@/app/(app)/unidades/actions'

export type UnidadeRow = {
  id: string
  nome: string | null
  cnpj: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  ativa: boolean | null
  bemp_salon_id: number | null
}

type Props = {
  rows: UnidadeRow[]
  kpis: { total: number; ativas: number; inativas: number }
  ufs: string[]
  podeGerir: boolean
  filtros: { q: string; uf: string; status: string }
  page: number
  totalPages: number
  total: number
}

export function UnidadesManager({ rows, kpis, ufs, podeGerir, filtros, page, totalPages, total }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [editRow, setEditRow] = useState<UnidadeRow | null>(null)
  const [novaOpen, setNovaOpen] = useState(false)

  function urlCom(extra: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    if (filtros.q) p.set('q', filtros.q)
    if (filtros.uf) p.set('uf', filtros.uf)
    if (filtros.status) p.set('status', filtros.status)
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === '' || v === null) p.delete(k)
      else p.set(k, String(v))
    }
    const s = p.toString()
    return `/unidades${s ? `?${s}` : ''}`
  }
  const urlPagina = (pg: number) => urlCom({ page: pg > 1 ? pg : undefined })
  const temFiltro = !!(filtros.q || filtros.uf || filtros.status)

  /** Exporta a lista filtrada (mesmos filtros) em CSV via endpoint server-side. */
  function exportar() {
    const p = new URLSearchParams()
    if (filtros.q) p.set('q', filtros.q)
    if (filtros.uf) p.set('uf', filtros.uf)
    if (filtros.status) p.set('status', filtros.status)
    const s = p.toString()
    window.open(`/unidades/export${s ? `?${s}` : ''}`, '_blank')
  }

  async function toggle(u: UnidadeRow) {
    setBusy(u.id)
    setMsg('')
    const r = await toggleAtivaUnidade(u.id, !u.ativa)
    setBusy(null)
    if (!r.ok) setMsg(r.error || 'Erro ao alterar status.')
    else {
      setMsg(!u.ativa ? `Unidade ativada: ${u.nome}.` : `Unidade inativada  acesso do franqueado cortado: ${u.nome}.`)
      router.refresh()
    }
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-buildings" style={{ color: 'var(--brand-500)' }} /> Todas as unidades
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
            Rede completa de unidades. Editar dados e ativar/inativar é restrito à franqueadora.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!podeGerir && (
            <span className="os-st os-cancelada"><i className="ti ti-eye" /> Somente leitura</span>
          )}
          <button className="btn" onClick={exportar} title="Exportar a lista filtrada em CSV">
            <i className="ti ti-download" /> Exportar
          </button>
          {podeGerir && (
            <button className="btn btn-primary" onClick={() => { setMsg(''); setNovaOpen(true) }}>
              <i className="ti ti-plus" /> Nova unidade
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box"><span>Total de unidades</span><b>{kpis.total.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Ativas</span><b style={{ color: 'var(--green)' }}>{kpis.ativas.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Inativas</span><b style={{ color: 'var(--red)' }}>{kpis.inativas.toLocaleString('pt-BR')}</b></div>
      </div>
      {/* TODO(legado: buildUnidades)  KPI "Em teste" e seção Escritórios: schema só tem boolean `ativa`. */}

      {/* Filtros (GET → server re-renderiza) */}
      <form method="GET" action="/unidades" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Buscar</label>
            <input name="q" defaultValue={filtros.q} placeholder="Nome, cidade ou CNPJ" />
          </div>
          <div className="field">
            <label>Estado (UF)</label>
            <select name="uf" defaultValue={filtros.uf}>
              <option value="">Todos</option>
              {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue={filtros.status}>
              <option value="">Todos</option>
              <option value="ativa">Ativas</option>
              <option value="inativa">Inativas</option>
            </select>
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
          {temFiltro && <Link href="/unidades" className="btn"><i className="ti ti-x" /> Limpar</Link>}
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>}

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list" /> {total.toLocaleString('pt-BR')} unidade(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      {/* Tabela */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Cidade / UF</th>
                <th>CNPJ</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-building-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhuma unidade {temFiltro ? 'com esses filtros' : 'encontrada'}.
                  </td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} style={{ opacity: u.ativa === false ? 0.6 : 1 }}>
                  <td>
                    <span className="cli-name" style={{ fontWeight: 600 }}>
                      <i className="ti ti-building-store" style={{ color: 'var(--brand-500)', marginRight: 8, verticalAlign: '-2px' }} />
                      {u.nome || ''}
                    </span>
                    {u.endereco && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)', marginTop: 3, maxWidth: 360 }}>
                        <i className="ti ti-map-pin" /> {u.endereco}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {u.cidade || <span className="muted"></span>}{u.estado ? ` / ${u.estado}` : ''}
                  </td>
                  <td style={{ fontSize: 12 }}>{u.cnpj || <span className="muted"></span>}</td>
                  <td>
                    {u.ativa === false
                      ? <span className="os-st os-cancelada"><i className="ti ti-ban" /> Inativa</span>
                      : <span className="os-st os-fechada"><i className="ti ti-circle-check" /> Ativa</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {podeGerir ? (
                      <>
                        <button className="btn" style={{ marginRight: 6 }} onClick={() => { setMsg(''); setEditRow(u) }}>
                          <i className="ti ti-pencil" /> Editar
                        </button>
                        <button
                          className="btn"
                          style={{ marginRight: 6, color: 'var(--red)' }}
                          disabled={busy === u.id}
                          title="Remover (só sem histórico; com histórico use Inativar)"
                          onClick={async () => {
                            if (!window.confirm(`Remover a unidade "${u.nome}"? Só é possível se ela não tiver histórico — senão use Inativar.`)) return
                            setMsg('')
                            const r = await removerUnidade(u.id)
                            setMsg(r.ok ? `Unidade removida: ${u.nome}.` : (r.error || 'Não foi possível remover.'))
                            if (r.ok) router.refresh()
                          }}
                        >
                          <i className="ti ti-trash" />
                        </button>
                        <button
                          className={`btn ${u.ativa === false ? 'btn-primary' : ''}`}
                          disabled={busy === u.id}
                          onClick={() => toggle(u)}
                        >
                          {busy === u.id ? '…' : (u.ativa === false ? (<><i className="ti ti-circle-check" /> Ativar</>) : (<><i className="ti ti-ban" /> Inativar</>))}
                        </button>
                      </>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cli-foot">
          <span>{total === 0 ? 'Nenhum registro' : `Exibindo página ${page} de ${totalPages} · ${total.toLocaleString('pt-BR')} unidade(s)`}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {page > 1 ? (
                <Link className="btn" href={urlPagina(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>
              )}
              {page < totalPages ? (
                <Link className="btn" href={urlPagina(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>
              )}
            </div>
          )}
        </div>
      </div>

      {novaOpen && <NovaUnidadeModal onClose={() => setNovaOpen(false)} onCriada={(nome) => { setNovaOpen(false); setMsg(`Unidade criada: ${nome} (centro de custo do financeiro provisionado).`); router.refresh() }} />}
      {editRow && (
        <EditarUnidadeForm
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={(m) => { setEditRow(null); setMsg(m); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Modal Editar ───────────────────────────

function EditarUnidadeForm({ row, onClose, onSaved }: { row: UnidadeRow; onClose: () => void; onSaved: (msg: string) => void }) {
  const [f, setF] = useState({
    nome: row.nome ?? '',
    cnpj: row.cnpj ?? '',
    endereco: row.endereco ?? '',
    cidade: row.cidade ?? '',
    estado: row.estado ?? '',
    cep: row.cep ?? '',
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Informe o nome da unidade.'); return }
    if (f.estado.trim() && f.estado.trim().length !== 2) { setErr('UF deve ter 2 letras (ex.: SP).'); return }
    setSaving(true)
    const r = await editarUnidade({
      id: row.id,
      nome: f.nome,
      cnpj: f.cnpj || null,
      endereco: f.endereco || null,
      cidade: f.cidade || null,
      estado: f.estado || null,
      cep: f.cep || null,
    })
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved('Unidade atualizada.')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal" style={{ width: 560 }}>
        <div className="modal-head">
          <h3><i className="ti ti-building-store" /> Editar unidade</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Nome <span className="req">*</span></label>
            <input value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
          </div>
          <div className="mf">
            <label>CNPJ</label>
            <input value={f.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
          </div>
          <div className="mf">
            <label>CEP</label>
            <input value={f.cep} onChange={(e) => set('cep', e.target.value)} />
          </div>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Endereço</label>
            <input value={f.endereco} onChange={(e) => set('endereco', e.target.value)} />
          </div>
          <div className="mf">
            <label>Cidade</label>
            <input value={f.cidade} onChange={(e) => set('cidade', e.target.value)} />
          </div>
          <div className="mf">
            <label>UF</label>
            <input value={f.estado} onChange={(e) => set('estado', e.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
          </div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, padding: '0 22px' }}>{err}</p>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}


// ── Modal: criar unidade (pedido 03/07) — provisiona o centro de custo do financeiro junto. ──
function NovaUnidadeModal({ onClose, onCriada }: { onClose: () => void; onCriada: (nome: string) => void }) {
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [estado, setEstado] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [tipo, setTipo] = useState<'franquia' | 'propria'>('franquia')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  async function salvar() {
    setErro(''); setSaving(true)
    const r = await criarUnidade({ nome, cidade, estado, cnpj, tipoLoja: tipo })
    setSaving(false)
    if (!r.ok) { setErro(r.error || 'Não foi possível criar a unidade.'); return }
    onCriada(nome.trim())
  }
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5 }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface, #fff)', borderRadius: 14, width: 'min(460px,100%)', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b><i className="ti ti-building-store" /> Nova unidade</b>
          <button className="btn" style={{ padding: '4px 8px' }} onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div><label style={lbl}>Nome da unidade *</label><input style={inp} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Campinas - Iguatemi" autoFocus /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}><label style={lbl}>Cidade</label><input style={inp} value={cidade} onChange={(e) => setCidade(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>UF</label><input style={inp} value={estado} onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lbl}>CNPJ</label><input style={inp} value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Tipo</label>
              <select style={{ ...inp, background: '#fff' }} value={tipo} onChange={(e) => setTipo(e.target.value as 'franquia' | 'propria')}>
                <option value="franquia">Franquia (paga royalty)</option>
                <option value="propria">Loja própria (sem royalty)</option>
              </select>
            </div>
          </div>
          {erro && <div style={{ color: 'var(--red)', fontSize: 13 }}><i className="ti ti-alert-triangle" /> {erro}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvar} disabled={saving || !nome.trim()}>{saving ? 'Criando…' : <><i className="ti ti-check" /> Criar unidade</>}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
