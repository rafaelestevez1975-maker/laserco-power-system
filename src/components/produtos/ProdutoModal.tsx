'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarProduto, salvarProduto, type ProdutoInput } from '@/app/(app)/produtos/actions'
import type { ProdutoRow } from './ProdutosList'

type FormState = {
  nome: string
  grupo: string
  descricao: string
  preco_padrao: string
  desc_max: string
  custo: string
  estoque_atual: string
  estoque_minimo: string
  feedstock: boolean
  ativo: boolean
}

function rowToForm(row?: ProdutoRow): FormState {
  return {
    nome: row?.nome ?? '',
    grupo: row?.grupo ?? '',
    descricao: row?.descricao ?? '',
    preco_padrao: row?.preco_padrao != null ? String(row.preco_padrao) : '',
    desc_max: row?.desc_max != null ? String(row.desc_max) : '',
    custo: row?.custo != null ? String(row.custo) : '',
    estoque_atual: row?.estoque_atual != null ? String(row.estoque_atual) : '',
    estoque_minimo: row?.estoque_minimo != null ? String(row.estoque_minimo) : '',
    feedstock: row?.feedstock ?? false,
    ativo: row?.ativo !== false,
  }
}

/** Parse "1.234,56" ou "1234.56" → number; "" → null; inválido → NaN. */
function parseNum(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : (NaN as unknown as number)
}

/** Inteiro a partir de string; "" → null; inválido → NaN. */
function parseInt0(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) ? n : (NaN as unknown as number)
}

export function ProdutoModal({
  modo, row, grupos, onClose,
}: { modo: 'novo' | 'editar'; row?: ProdutoRow; grupos: string[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<FormState>(rowToForm(row))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [novoGrupo, setNovoGrupo] = useState(row?.grupo && !grupos.includes(row.grupo) ? true : false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  function validar(): string | null {
    const nome = f.nome.trim()
    if (!nome) return 'Informe o nome do produto.'
    if (nome.length < 2) return 'Nome muito curto.'
    const preco = parseNum(f.preco_padrao)
    if (preco != null && (!Number.isFinite(preco) || preco < 0)) return 'Preço inválido.'
    const dm = parseNum(f.desc_max)
    if (dm != null && (!Number.isFinite(dm) || dm < 0 || dm > 100)) return 'O desconto máximo deve estar entre 0% e 100%.'
    const custo = parseNum(f.custo)
    if (custo != null && (!Number.isFinite(custo) || custo < 0)) return 'Custo inválido.'
    const ea = parseInt0(f.estoque_atual)
    if (ea != null && (!Number.isInteger(ea) || ea < 0)) return 'Estoque atual inválido.'
    const em = parseInt0(f.estoque_minimo)
    if (em != null && (!Number.isInteger(em) || em < 0)) return 'Estoque mínimo inválido.'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)

    const input: ProdutoInput = {
      nome: f.nome.trim(),
      grupo: f.grupo.trim() || null,
      descricao: f.descricao.trim() || null,
      preco_padrao: parseNum(f.preco_padrao) ?? 0,
      desc_max: parseNum(f.desc_max) ?? 0,
      custo: parseNum(f.custo),
      estoque_atual: parseInt0(f.estoque_atual) ?? 0,
      estoque_minimo: parseInt0(f.estoque_minimo) ?? 0,
      feedstock: f.feedstock,
      ativo: f.ativo,
    }

    const res = modo === 'novo' ? await criarProduto(input) : await salvarProduto(row!.id, input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar produto.'); return }
    onClose()
    router.refresh()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 14, fontWeight: 700 }}>
          <i className="ti ti-package" /> {modo === 'novo' ? 'Novo produto' : 'Editar produto'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Nome <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus placeholder="Ex.: PDRN + Exossomos" />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Grupo</label>
            {novoGrupo ? (
              <input style={inp} value={f.grupo} onChange={(e) => set('grupo', e.target.value)} placeholder="Novo grupo…" />
            ) : (
              <select style={inp} value={f.grupo} onChange={(e) => {
                if (e.target.value === '__novo__') { setNovoGrupo(true); set('grupo', '') }
                else set('grupo', e.target.value)
              }}>
                <option value="">— Sem grupo —</option>
                {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
                <option value="__novo__">+ Novo grupo…</option>
              </select>
            )}
          </div>

          <div>
            <label style={lbl}>Preço de venda (R$)</label>
            <input style={inp} value={f.preco_padrao} onChange={(e) => set('preco_padrao', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div>
            <label style={lbl}>Custo (R$)</label>
            <input style={inp} value={f.custo} onChange={(e) => set('custo', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>

          <div>
            <label style={lbl}>Desc. Máx (%)</label>
            <input style={inp} value={f.desc_max} onChange={(e) => set('desc_max', e.target.value)} inputMode="decimal" placeholder="0,00" title="Desconto máximo permitido neste produto" />
          </div>

          <div>
            <label style={lbl}>Estoque atual</label>
            <input style={inp} value={f.estoque_atual} onChange={(e) => set('estoque_atual', e.target.value)} inputMode="numeric" placeholder="0" />
          </div>
          <div>
            <label style={lbl}>Estoque mínimo</label>
            <input style={inp} value={f.estoque_minimo} onChange={(e) => set('estoque_minimo', e.target.value)} inputMode="numeric" placeholder="0" />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Descrição</label>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={f.feedstock} onChange={(e) => set('feedstock', e.target.checked)} style={{ width: 'auto' }} />
              Insumo
            </label>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} style={{ width: 'auto' }} />
              Ativo
            </label>
          </div>
        </div>

        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando…' : modo === 'novo' ? 'Cadastrar produto' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Botão + modal de novo produto (usado no topo da página). */
export function ProdutoModalNovo({ grupos }: { grupos: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><i className="ti ti-plus" /> Novo produto</button>
      {open && <ProdutoModal modo="novo" grupos={grupos} onClose={() => setOpen(false)} />}
    </>
  )
}
