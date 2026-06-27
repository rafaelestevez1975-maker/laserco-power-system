'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarServico, salvarServico, type ServicoInput } from '@/app/(app)/servicos/actions'
import { PAGAR_COMISSAO_OPCOES, type PagarComissao } from '@/lib/catalogo'
import type { ServicoRow } from './ServicosList'

type FormState = {
  nome: string
  grupo: string
  descricao: string
  duracao_min: string
  preco_padrao: string
  desc_max: string
  pagar_comissao: PagarComissao
  comissionavel: boolean
  dynamic_price: boolean
  ativo: boolean
}

function rowToForm(row?: ServicoRow): FormState {
  return {
    nome: row?.nome ?? '',
    grupo: row?.grupo ?? '',
    descricao: row?.descricao ?? '',
    duracao_min: row?.duracao_min != null ? String(row.duracao_min) : '',
    preco_padrao: row?.preco_padrao != null ? String(row.preco_padrao) : '',
    desc_max: row?.desc_max != null ? String(row.desc_max) : '',
    pagar_comissao: (PAGAR_COMISSAO_OPCOES.includes(row?.pagar_comissao as PagarComissao) ? row!.pagar_comissao : 'Execução') as PagarComissao,
    comissionavel: row?.comissionavel ?? false,
    dynamic_price: row?.dynamic_price ?? false,
    ativo: row?.ativo !== false,
  }
}

/** Parse "1.234,56" ou "1234.56" → number; "" → null. */
function parseNum(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN as unknown as number
}

export function ServicoModal({
  modo, row, grupos, onClose,
}: { modo: 'novo' | 'editar'; row?: ServicoRow; grupos: string[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<FormState>(rowToForm(row))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [novoGrupo, setNovoGrupo] = useState(row?.grupo && !grupos.includes(row.grupo) ? true : false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  /** validação client-side por campo (espelha o servidor) */
  function validar(): string | null {
    const nome = f.nome.trim()
    if (!nome) return 'Informe o nome do serviço.'
    if (nome.length < 2) return 'Nome muito curto.'
    const preco = parseNum(f.preco_padrao)
    if (preco != null) {
      if (!Number.isFinite(preco)) return 'Preço inválido.'
      if (preco < 0) return 'O preço não pode ser negativo.'
    }
    const dur = f.duracao_min.trim()
    if (dur) {
      const d = Number(dur)
      if (!Number.isInteger(d)) return 'Duração deve ser em minutos inteiros.'
      if (d < 0) return 'A duração não pode ser negativa.'
      if (d > 1440) return 'Duração muito longa (máx. 24h).'
    }
    const dm = parseNum(f.desc_max)
    if (dm != null) {
      if (!Number.isFinite(dm)) return 'Desconto máximo inválido.'
      if (dm < 0 || dm > 100) return 'O desconto máximo deve estar entre 0% e 100%.'
    }
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)

    const input: ServicoInput = {
      nome: f.nome.trim(),
      grupo: f.grupo.trim() || null,
      descricao: f.descricao.trim() || null,
      duracao_min: f.duracao_min.trim() ? Number(f.duracao_min) : null,
      preco_padrao: parseNum(f.preco_padrao) ?? 0,
      desc_max: parseNum(f.desc_max) ?? 0,
      pagar_comissao: f.pagar_comissao,
      comissionavel: f.comissionavel,
      dynamic_price: f.dynamic_price,
      ativo: f.ativo,
    }

    const res = modo === 'novo' ? await criarServico(input) : await salvarServico(row!.id, input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar serviço.'); return }
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
          <i className="ti ti-sparkles" /> {modo === 'novo' ? 'Novo serviço' : 'Editar serviço'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Nome <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus placeholder="Ex.: Depilação - Axilas" />
          </div>

          <div>
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
            <label style={lbl}>Duração (min)</label>
            <input style={inp} value={f.duracao_min} onChange={(e) => set('duracao_min', e.target.value)} inputMode="numeric" placeholder="30" />
          </div>

          <div>
            <label style={lbl}>Preço padrão (R$)</label>
            <input style={inp} value={f.preco_padrao} onChange={(e) => set('preco_padrao', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>

          <div>
            <label style={lbl}>Desc. Máx (%)</label>
            <input style={inp} value={f.desc_max} onChange={(e) => set('desc_max', e.target.value)} inputMode="decimal" placeholder="0,00" title="Desconto máximo permitido neste serviço (teto do PDV/parcerias)" />
          </div>

          <div>
            <label style={lbl}>Pagar comissão</label>
            <select style={inp} value={f.pagar_comissao} onChange={(e) => set('pagar_comissao', e.target.value as PagarComissao)}>
              {PAGAR_COMISSAO_OPCOES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={f.dynamic_price} onChange={(e) => set('dynamic_price', e.target.checked)} style={{ width: 'auto' }} />
              Preço dinâmico
            </label>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Descrição</label>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={f.comissionavel} onChange={(e) => set('comissionavel', e.target.checked)} style={{ width: 'auto' }} />
              Comissionável
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
            {saving ? 'Salvando…' : modo === 'novo' ? 'Cadastrar serviço' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Botão + modal de novo serviço (usado no topo da página). */
export function ServicoModalNovo({ grupos }: { grupos: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}><i className="ti ti-plus" /> Novo serviço</button>
      {open && <ServicoModal modo="novo" grupos={grupos} onClose={() => setOpen(false)} />}
    </>
  )
}
