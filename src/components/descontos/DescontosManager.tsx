'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  criarDesconto,
  editarDesconto,
  alternarAtivoDesconto,
  type DescontoInput,
} from '@/app/(app)/descontos/actions'
import { TIPOS_DESCONTO, type TipoDesconto } from '@/app/(app)/descontos/constants'
import { dataBR } from '@/lib/fmt'

export type DescontoRow = {
  id: string
  nome: string
  tipo: string | null
  valor: number | null
  pct_servico: number | null
  pct_produto: number | null
  pct_pacote: number | null
  data_expiracao: string | null
  ativo: boolean | null
  criado_em: string | null
}

type Props = {
  rows: DescontoRow[]
  podeGerir: boolean
  filtroNome: string
  filtroAtivo: string // '' | 'sim' | 'nao'
}

/** "5,00%" (2 casas, pt-BR) ou "—" quando null/undefined. */
function pct(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

export function DescontosManager({ rows, podeGerir, filtroNome, filtroAtivo }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<DescontoRow | null>(null)
  const [busca, setBusca] = useState(filtroNome)

  const ativos = rows.filter((r) => r.ativo !== false).length
  const temFiltro = !!(filtroNome || filtroAtivo)

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    const s = p.toString()
    router.push(`/descontos${s ? `?${s}` : ''}`)
  }

  const exportHref = `/descontos/export${sp.toString() ? `?${sp.toString()}` : ''}`

  async function toggle(r: DescontoRow) {
    setBusy(r.id); setMsg('')
    const res = await alternarAtivoDesconto(r.id, !(r.ativo !== false))
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro ao alterar.')
    else { setMsg(r.ativo !== false ? 'Desconto inativado.' : 'Desconto reativado.'); router.refresh() }
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-discount" /> Descontos e parcerias  regras reutilizáveis (percentual ou valor fixo)
        aplicáveis em vendas e pacotes.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box"><span>Total cadastrado</span><b>{rows.length}</b></div>
        <div className="metric-box"><span>Ativos</span><b style={{ color: '#15803D' }}>{ativos}</b></div>
      </div>

      <div className="rel-card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 600, fontSize: 13 }}>
          <i className="ti ti-filter" /> Filtros
          {temFiltro && (
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '4px 10px' }} onClick={() => { setBusca(''); router.push('/descontos') }}>
              <i className="ti ti-x" /> Limpar
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Nome / Parceria</label>
            <form onSubmit={(e) => { e.preventDefault(); setParams({ q: busca.trim() }) }}>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onBlur={() => { if (busca.trim() !== filtroNome) setParams({ q: busca.trim() }) }}
                placeholder="Buscar por nome…"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 12.5, background: '#fff', fontFamily: 'inherit' }}
              />
            </form>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Ativo</label>
            <select value={filtroAtivo} onChange={(e) => setParams({ ativo: e.target.value })} style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 12.5, background: '#fff', fontFamily: 'inherit' }}>
              <option value="">Todos</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <a className="btn" href={exportHref} target="_blank" title="Exportar a lista em CSV"><i className="ti ti-download" /> Exportar</a>
        {podeGerir && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Novo desconto
          </button>
        )}
      </div>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>}

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Nome / Parceria</th>
                <th style={{ width: 110 }}>Tipo</th>
                <th className="num-r" style={{ width: 90 }}>Serviço</th>
                <th className="num-r" style={{ width: 90 }}>Produto</th>
                <th className="num-r" style={{ width: 90 }}>Pacote</th>
                <th style={{ width: 110 }}>Expiração</th>
                <th style={{ width: 100 }}>Situação</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-discount-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum desconto ou parceria cadastrado ainda.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const ativa = r.ativo !== false
                return (
                  <tr key={r.id}>
                    <td><b>{r.nome}</b></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.tipo === 'percentual' ? 'Percentual' : r.tipo === 'valor' ? 'Valor fixo' : (r.tipo || '')}</td>
                    <td className="num-r">{pct(r.pct_servico)}</td>
                    <td className="num-r">{pct(r.pct_produto)}</td>
                    <td className="num-r">{pct(r.pct_pacote)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.data_expiracao ? dataBR(r.data_expiracao) : '—'}</td>
                    <td>
                      {ativa
                        ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#E7F0EC', color: '#15803D' }}>Ativo</span>
                        : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#F1F1F3', color: '#6B7280' }}>Inativo</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {podeGerir && (
                        <>
                          <button className="btn" style={{ marginRight: 6 }} onClick={() => { setMsg(''); setEditRow(r) }} title="Editar"><i className="ti ti-pencil" /></button>
                          <button className="btn" disabled={busy === r.id} onClick={() => toggle(r)} title={ativa ? 'Inativar' : 'Reativar'}>
                            {busy === r.id ? '…' : <i className={`ti ${ativa ? 'ti-eye-off' : 'ti-eye'}`} />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="cli-foot"><span>{rows.length} desconto(s)</span></div>
      </div>

      {novoOpen && (
        <DescontoForm onClose={() => setNovoOpen(false)} onSaved={(m) => { setNovoOpen(false); setMsg(m); router.refresh() }} />
      )}
      {editRow && (
        <DescontoForm row={editRow} onClose={() => setEditRow(null)} onSaved={(m) => { setEditRow(null); setMsg(m); router.refresh() }} />
      )}
    </div>
  )
}

function DescontoForm({ row, onClose, onSaved }: { row?: DescontoRow; onClose: () => void; onSaved: (m: string) => void }) {
  const editando = !!row
  const [f, setF] = useState({
    nome: row?.nome ?? '',
    tipo: (row?.tipo === 'valor' ? 'valor' : 'percentual') as TipoDesconto,
    valor: row?.valor != null ? String(row.valor) : '',
    ativo: row ? row.ativo !== false : true,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Informe o nome.'); return }
    const valorNum = Number(f.valor.replace(',', '.'))
    if (!f.valor.trim() || !Number.isFinite(valorNum)) { setErr('Informe um valor numérico.'); return }
    if (valorNum <= 0) { setErr('O valor deve ser maior que zero.'); return }
    if (f.tipo === 'percentual' && valorNum > 100) { setErr('Percentual não pode passar de 100%.'); return }

    setSaving(true)
    const base: DescontoInput = { nome: f.nome, tipo: f.tipo, valor: valorNum, ativo: f.ativo }
    const res = editando ? await editarDesconto({ id: row!.id, ...base }) : await criarDesconto(base)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved(editando ? 'Desconto atualizado.' : 'Desconto criado.')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal" style={{ width: 460 }}>
        <div className="modal-head">
          <h3><i className="ti ti-discount" /> {editando ? 'Editar desconto' : 'Novo desconto'}</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
          <div className="mf">
            <label>Nome / Parceria <span className="req">*</span></label>
            <input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Parceria Academia MoveFit" autoFocus maxLength={120} />
          </div>
          <div className="mf">
            <label>Tipo <span className="req">*</span></label>
            <select value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoDesconto)}>
              {TIPOS_DESCONTO.map((t) => (
                <option key={t} value={t}>{t === 'percentual' ? 'Percentual (%)' : 'Valor fixo (R$)'}</option>
              ))}
            </select>
          </div>
          <div className="mf">
            <label>{f.tipo === 'percentual' ? 'Percentual (%)' : 'Valor (R$)'} <span className="req">*</span></label>
            <input value={f.valor} onChange={(e) => set('valor', e.target.value)} inputMode="decimal" placeholder={f.tipo === 'percentual' ? 'Ex.: 15' : 'Ex.: 50,00'} />
          </div>
          <div className="mf">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} style={{ width: 'auto' }} />
              Ativo
            </label>
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
