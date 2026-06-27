'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarCategoria,
  editarCategoria,
  alternarAtivoCategoria,
  type NovaCategoriaInput,
} from '@/app/(app)/catpag/actions'

export type CatRow = {
  id: string
  parent_id: string | null
  codigo: string | null
  nome: string
  tipo: string
  natureza: string | null
  aceita_lancamentos: boolean | null
  is_sistema: boolean | null
  ativo: boolean | null
}

type Tipo = 'despesa' | 'receita'

type Props = {
  tipo: Tipo
  rows: CatRow[]
  podeGerir: boolean
}

type FormState =
  | { modo: 'novo'; parentId: string | null; aceitaPadrao: boolean }
  | { modo: 'editar'; row: CatRow }

/** Monta a árvore (pais → filhos) ordenada por código/nome. */
function montarArvore(rows: CatRow[]): { grupos: CatRow[]; filhosDe: Record<string, CatRow[]> } {
  const byCodigo = (a: CatRow, b: CatRow) =>
    (a.codigo || '999').localeCompare(b.codigo || '999', 'pt-BR', { numeric: true }) ||
    a.nome.localeCompare(b.nome, 'pt-BR')
  const grupos = rows.filter((r) => !r.parent_id).sort(byCodigo)
  const filhosDe: Record<string, CatRow[]> = {}
  for (const r of rows) {
    if (r.parent_id) (filhosDe[r.parent_id] ||= []).push(r)
  }
  for (const k of Object.keys(filhosDe)) filhosDe[k].sort(byCodigo)
  return { grupos, filhosDe }
}

export function CategoriasManager({ tipo, rows, podeGerir }: Props) {
  const router = useRouter()
  const ehPagar = tipo === 'despesa'
  const titulo = ehPagar ? 'Categorias de contas a pagar' : 'Categorias de contas a receber'
  const corTipo = ehPagar ? 'var(--red, #D85563)' : 'var(--green, #15803D)'

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [verInativas, setVerInativas] = useState(false)

  const visiveis = useMemo(
    () => (verInativas ? rows : rows.filter((r) => r.ativo !== false)),
    [rows, verInativas],
  )
  const { grupos, filhosDe } = useMemo(() => montarArvore(visiveis), [visiveis])
  const gruposParaSelect = useMemo(
    () => rows.filter((r) => !r.parent_id && r.ativo !== false).sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '', 'pt-BR', { numeric: true })),
    [rows],
  )

  const totalItens = rows.filter((r) => r.aceita_lancamentos !== false).length
  const totalGrupos = rows.filter((r) => !r.parent_id).length

  async function toggle(r: CatRow) {
    if (r.is_sistema) { setMsg('Categoria do sistema é protegida (não pode ser inativada).'); return }
    setBusy(r.id); setMsg('')
    const res = await alternarAtivoCategoria(r.id, !(r.ativo !== false), tipo)
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro ao alterar.')
    else { setMsg(r.ativo !== false ? 'Categoria inativada.' : 'Categoria reativada.'); router.refresh() }
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-category" /> {titulo} — árvore <b>grupo → itens</b>. Os itens (folhas) são os que
        recebem lançamentos no contas a {ehPagar ? 'pagar' : 'receber'}.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box"><span>Grupos</span><b>{totalGrupos}</b></div>
        <div className="metric-box"><span>Itens (aceitam lançamento)</span><b>{totalItens}</b></div>
        <div className="metric-box"><span>Total de categorias</span><b>{rows.length}</b></div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={verInativas} onChange={(e) => setVerInativas(e.target.checked)} style={{ width: 'auto' }} />
          Mostrar inativas
        </label>
        {podeGerir && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => { setMsg(''); setForm({ modo: 'novo', parentId: null, aceitaPadrao: false }) }}>
              <i className="ti ti-folder-plus" /> Novo grupo
            </button>
            <button className="btn btn-primary" onClick={() => { setMsg(''); setForm({ modo: 'novo', parentId: gruposParaSelect[0]?.id ?? null, aceitaPadrao: true }) }} disabled={gruposParaSelect.length === 0} title={gruposParaSelect.length === 0 ? 'Crie um grupo primeiro' : undefined}>
              <i className="ti ti-plus" /> Nova categoria
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>}

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Código</th>
                <th>Categoria</th>
                <th style={{ width: 130 }}>Tipo</th>
                <th style={{ width: 110 }}>Situação</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhuma categoria {verInativas ? '' : 'ativa '}cadastrada.
                  </td>
                </tr>
              )}
              {grupos.map((g) => (
                <GrupoBloco
                  key={g.id}
                  grupo={g}
                  filhos={filhosDe[g.id] ?? []}
                  corTipo={corTipo}
                  podeGerir={podeGerir}
                  busy={busy}
                  onEdit={(row) => { setMsg(''); setForm({ modo: 'editar', row }) }}
                  onAddFilho={(parentId) => { setMsg(''); setForm({ modo: 'novo', parentId, aceitaPadrao: true }) }}
                  onToggle={toggle}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="cli-foot">
          <span>{rows.length} categoria(s) · {totalGrupos} grupo(s)</span>
        </div>
      </div>

      {form && (
        <CategoriaForm
          tipo={tipo}
          state={form}
          grupos={gruposParaSelect}
          onClose={() => setForm(null)}
          onSaved={(m) => { setForm(null); setMsg(m); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Bloco grupo + filhos ───────────────────────────

function GrupoBloco(props: {
  grupo: CatRow
  filhos: CatRow[]
  corTipo: string
  podeGerir: boolean
  busy: string | null
  onEdit: (r: CatRow) => void
  onAddFilho: (parentId: string) => void
  onToggle: (r: CatRow) => void
}) {
  const { grupo, filhos, corTipo, podeGerir, busy, onEdit, onAddFilho, onToggle } = props
  return (
    <>
      <tr style={{ background: 'var(--surface-2, #FAFAFB)' }}>
        <td style={{ fontWeight: 700, color: 'var(--text-2)' }}>{grupo.codigo || '—'}</td>
        <td>
          <span style={{ fontWeight: 700 }}>{grupo.nome}</span>
          {grupo.is_sistema && <BadgeSistema />}
        </td>
        <td><span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Grupo</span></td>
        <td><Situacao ativo={grupo.ativo !== false} /></td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <Acoes row={grupo} podeGerir={podeGerir} busy={busy} corTipo={corTipo} onEdit={onEdit} onAddFilho={onAddFilho} onToggle={onToggle} ehGrupo />
        </td>
      </tr>
      {filhos.map((f) => (
        <tr key={f.id}>
          <td style={{ color: 'var(--text-3)' }}>{f.codigo || '—'}</td>
          <td style={{ paddingLeft: 26 }}>
            <i className="ti ti-corner-down-right" style={{ color: 'var(--text-3)', marginRight: 6 }} />
            {f.nome}
            {f.is_sistema && <BadgeSistema />}
            {f.aceita_lancamentos === false && <span style={{ fontSize: 11, color: 'var(--text-3)' }}> · subgrupo</span>}
          </td>
          <td><span style={{ fontSize: 11.5, color: corTipo, fontWeight: 600 }}>{f.aceita_lancamentos !== false ? 'Item' : 'Subgrupo'}</span></td>
          <td><Situacao ativo={f.ativo !== false} /></td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <Acoes row={f} podeGerir={podeGerir} busy={busy} corTipo={corTipo} onEdit={onEdit} onAddFilho={onAddFilho} onToggle={onToggle} />
          </td>
        </tr>
      ))}
    </>
  )
}

function BadgeSistema() {
  return (
    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#EEF2FF', color: '#4338CA', textTransform: 'uppercase', letterSpacing: 0.3 }} title="Categoria padrão do sistema (protegida)">
      sistema
    </span>
  )
}

function Situacao({ ativo }: { ativo: boolean }) {
  return ativo
    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#E7F0EC', color: '#15803D' }}>Ativa</span>
    : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#F1F1F3', color: '#6B7280' }}>Inativa</span>
}

function Acoes(props: {
  row: CatRow
  podeGerir: boolean
  busy: string | null
  corTipo: string
  ehGrupo?: boolean
  onEdit: (r: CatRow) => void
  onAddFilho: (parentId: string) => void
  onToggle: (r: CatRow) => void
}) {
  const { row, podeGerir, busy, ehGrupo, onEdit, onAddFilho, onToggle } = props
  if (!podeGerir) return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
  if (row.is_sistema) {
    // Sistema: só permitimos adicionar filho a um grupo de sistema (não editar/inativar o próprio).
    return ehGrupo
      ? <button className="btn" onClick={() => onAddFilho(row.id)} title="Adicionar item neste grupo"><i className="ti ti-plus" /></button>
      : <span title="Categoria do sistema (protegida)" style={{ fontSize: 11, color: 'var(--text-3)' }}><i className="ti ti-lock" /> protegida</span>
  }
  const ativa = row.ativo !== false
  return (
    <>
      {ehGrupo && <button className="btn" style={{ marginRight: 6 }} onClick={() => onAddFilho(row.id)} title="Adicionar item"><i className="ti ti-plus" /></button>}
      <button className="btn" style={{ marginRight: 6 }} onClick={() => onEdit(row)} title="Editar"><i className="ti ti-pencil" /></button>
      <button className="btn" disabled={busy === row.id} onClick={() => onToggle(row)} title={ativa ? 'Inativar' : 'Reativar'}>
        {busy === row.id ? '…' : <i className={`ti ${ativa ? 'ti-eye-off' : 'ti-eye'}`} />}
      </button>
    </>
  )
}

// ─────────────────────────── Form (modal) ───────────────────────────

function CategoriaForm(props: {
  tipo: Tipo
  state: FormState
  grupos: CatRow[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { tipo, state, grupos, onClose, onSaved } = props
  const editando = state.modo === 'editar'
  const row = editando ? state.row : null
  // Em "novo grupo" parentId = null; em "nova categoria" parentId já vem definido.
  const parentInicial = state.modo === 'novo' ? state.parentId : (row?.parent_id ?? null)

  const [f, setF] = useState({
    nome: row?.nome ?? '',
    codigo: row?.codigo ?? '',
    parent_id: parentInicial ?? '',
    aceita_lancamentos: editando ? row!.aceita_lancamentos !== false : (state.modo === 'novo' ? state.aceitaPadrao : true),
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const ehGrupoRaiz = !f.parent_id
  const titulo = editando ? 'Editar categoria' : ehGrupoRaiz ? 'Novo grupo' : 'Nova categoria'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Informe o nome.'); return }
    if (f.codigo && !/^[0-9.]+$/.test(f.codigo.trim())) { setErr('Código deve conter apenas números e pontos.'); return }

    setSaving(true)
    let res
    if (editando) {
      res = await editarCategoria({
        id: row!.id,
        tipo,
        nome: f.nome,
        codigo: f.codigo || null,
        aceita_lancamentos: !!f.aceita_lancamentos,
      })
    } else {
      const input: NovaCategoriaInput = {
        tipo,
        nome: f.nome,
        parent_id: f.parent_id || null,
        codigo: f.codigo || null,
        // grupo raiz nunca aceita lançamento; item/folha aceita conforme checkbox
        aceita_lancamentos: ehGrupoRaiz ? false : !!f.aceita_lancamentos,
      }
      res = await criarCategoria(input)
    }
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved(editando ? 'Categoria atualizada.' : ehGrupoRaiz ? 'Grupo criado.' : 'Categoria criada.')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal" style={{ width: 480 }}>
        <div className="modal-head">
          <h3><i className="ti ti-category" /> {titulo}</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
          {!editando && (
            <div className="mf">
              <label>Grupo pai</label>
              <select value={f.parent_id} onChange={(e) => set('parent_id', e.target.value)}>
                <option value="">— Sem pai (grupo raiz) —</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.codigo ? g.codigo + ' · ' : ''}{g.nome}</option>
                ))}
              </select>
            </div>
          )}
          <div className="mf">
            <label>Nome <span className="req">*</span></label>
            <input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder={ehGrupoRaiz ? 'Ex.: Despesas com Pessoal' : 'Ex.: Vale-transporte'} autoFocus maxLength={120} />
          </div>
          <div className="mf">
            <label>Código (opcional)</label>
            <input value={f.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="Ex.: 4.8" inputMode="decimal" />
          </div>
          {!ehGrupoRaiz && (
            <div className="mf">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.aceita_lancamentos} onChange={(e) => set('aceita_lancamentos', e.target.checked)} style={{ width: 'auto' }} />
                Aceita lançamentos (é um item, não um subgrupo)
              </label>
            </div>
          )}
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
