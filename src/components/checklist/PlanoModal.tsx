'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarPlano, type PlanoInput, type TarefaInput } from '@/app/(app)/checklist/actions'
import { CATEGORIAS_TAREFA } from '@/lib/checklist'

type Unidade = { id: string; nome: string }

/** Sugestão de tarefa vinda de um gargalo do funil (indicador < 7). */
export type SugestaoTarefa = { titulo: string; categoria: string; descricao: string }

type TarefaForm = TarefaInput & { _key: number }

let _seq = 1
function novaTarefa(seed?: Partial<TarefaInput>): TarefaForm {
  return { _key: _seq++, titulo: seed?.titulo ?? '', descricao: seed?.descricao ?? '', categoria: seed?.categoria ?? 'geral', prazo_dias: seed?.prazo_dias ?? 5 }
}

/** Segunda-feira da semana atual (YYYY-MM-DD). */
function inicioSemana(): string {
  const d = new Date()
  const dia = (d.getDay() + 6) % 7 // 0 = segunda
  d.setDate(d.getDate() - dia)
  return d.toISOString().slice(0, 10)
}
function fimSemana(ini: string): string {
  const d = new Date(ini + 'T00:00:00')
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}

export function PlanoModal({
  unidades, defaultUnitId, sugestoes, onClose,
}: {
  unidades: Unidade[]
  defaultUnitId: string | null
  sugestoes: SugestaoTarefa[]
  onClose: () => void
}) {
  const router = useRouter()
  const ini0 = inicioSemana()
  const [unidadeId, setUnidadeId] = useState(defaultUnitId ?? unidades[0]?.id ?? '')
  const [semIni, setSemIni] = useState(ini0)
  const [semFim, setSemFim] = useState(fimSemana(ini0))
  const [prioridade, setPrioridade] = useState('media')
  const [resumo, setResumo] = useState('')
  const [tarefas, setTarefas] = useState<TarefaForm[]>(
    sugestoes.length > 0 ? sugestoes.map((s) => novaTarefa(s)) : [novaTarefa()],
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  function setT(key: number, patch: Partial<TarefaForm>) {
    setTarefas((p) => p.map((t) => (t._key === key ? { ...t, ...patch } : t)))
  }
  function addTarefa() { setTarefas((p) => [...p, novaTarefa()]) }
  function delTarefa(key: number) { setTarefas((p) => (p.length > 1 ? p.filter((t) => t._key !== key) : p)) }

  function validar(): string | null {
    if (!unidadeId) return 'Selecione a unidade.'
    if (!semIni) return 'Informe o início da semana.'
    if (!semFim) return 'Informe o fim da semana.'
    if (semFim < semIni) return 'A data de fim não pode ser anterior ao início.'
    const validas = tarefas.filter((t) => (t.titulo || '').trim())
    if (validas.length === 0) return 'Adicione ao menos uma tarefa.'
    for (const t of validas) {
      if ((t.titulo || '').trim().length < 3) return 'Título de tarefa muito curto (mín. 3).'
      if (t.prazo_dias != null && t.prazo_dias !== undefined) {
        const n = Number(t.prazo_dias)
        if (!Number.isInteger(n) || n < 0 || n > 180) return 'Prazo deve ser entre 0 e 180 dias.'
      }
    }
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const v = validar()
    if (v) { setErr(v); return }
    setSaving(true)

    const input: PlanoInput = {
      unidade_id: unidadeId,
      semana_inicio: semIni,
      semana_fim: semFim,
      prioridade,
      resumo_executivo: resumo.trim() || null,
      tarefas: tarefas
        .filter((t) => (t.titulo || '').trim())
        .map((t) => ({
          titulo: t.titulo!.trim(),
          descricao: (t.descricao || '')?.toString().trim() || null,
          categoria: t.categoria || 'geral',
          prazo_dias: t.prazo_dias != null ? Number(t.prazo_dias) : null,
        })),
    }

    const res = await criarPlano(input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao criar plano.'); return }
    onClose()
    router.refresh()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 14, fontWeight: 700 }}>
          <i className="ti ti-target-arrow" /> Novo plano de ação
        </h3>

        {sugestoes.length > 0 && (
          <div className="sim-msg warn-msg" style={{ marginBottom: 14 }}>
            <i className="ti ti-bulb" />
            <span>{sugestoes.length} indicador(es) abaixo da meta  pré-preenchemos tarefas sugeridas (PDCA · Plan→Do). Ajuste como quiser.</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ gridColumn: unidades.length > 1 ? 'auto' : '1 / -1' }}>
            <label style={lbl}>Unidade <span style={{ color: 'var(--red)' }}>*</span></label>
            <select style={inp} value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              {unidades.length === 0 && <option value=""> nenhuma unidade </option>}
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Prioridade</label>
            <select style={inp} value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Semana  início <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} type="date" value={semIni} onChange={(e) => { setSemIni(e.target.value); if (e.target.value && (!semFim || semFim < e.target.value)) setSemFim(fimSemana(e.target.value)) }} />
          </div>
          <div>
            <label style={lbl}>Semana  fim <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} type="date" value={semFim} onChange={(e) => setSemFim(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Resumo executivo</label>
            <input style={inp} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Foco da semana (opcional)…" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px' }}>
          <label style={{ ...lbl, fontSize: 13 }}>Tarefas (PDCA)</label>
          <button type="button" className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={addTarefa}>
            <i className="ti ti-plus" /> Adicionar tarefa
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tarefas.map((t, i) => (
            <div key={t._key} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>#{i + 1}</span>
                <input
                  style={{ ...inp, flex: 1 }}
                  value={t.titulo ?? ''}
                  onChange={(e) => setT(t._key, { titulo: e.target.value })}
                  placeholder="Título da tarefa *"
                />
                {tarefas.length > 1 && (
                  <button type="button" className="btn btn-ghost" style={{ padding: '8px 10px' }} onClick={() => delTarefa(t._key)} title="Remover">
                    <i className="ti ti-x" style={{ color: 'var(--red)' }} />
                  </button>
                )}
              </div>
              <input
                style={{ ...inp, marginBottom: 8 }}
                value={(t.descricao as string) ?? ''}
                onChange={(e) => setT(t._key, { descricao: e.target.value })}
                placeholder="Descrição / como executar (opcional)"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...lbl, fontSize: 11 }}>Categoria</label>
                  <select style={inp} value={t.categoria ?? 'geral'} onChange={(e) => setT(t._key, { categoria: e.target.value })}>
                    {CATEGORIAS_TAREFA.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ width: 120 }}>
                  <label style={{ ...lbl, fontSize: 11 }}>Prazo (dias)</label>
                  <input
                    style={inp}
                    type="number"
                    min={0}
                    max={180}
                    value={t.prazo_dias ?? ''}
                    onChange={(e) => setT(t._key, { prazo_dias: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || unidades.length === 0}>
            {saving ? 'Criando…' : 'Criar plano'}
          </button>
        </div>
      </form>
    </div>
  )
}
