'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarPermissoesCargo, aplicarPreset, ESCOPOS, type Escopo, type CellChange } from '@/app/(app)/perfis/actions'

export type Recurso = { id: string; modulo: string; nome: string; descricao: string | null }
export type Acao = { id: string; descricao: string }
/** célula `${recurso}|${acao}` → escopo concedido (ou ausente = sem permissão). */
export type GridState = Record<string, Escopo | undefined>

const ESCOPO_LABEL: Record<Escopo, string> = {
  proprio: 'Próprio',
  unidade: 'Unidade',
  empresa: 'Empresa',
  global: 'Global',
}
const ESCOPO_COR: Record<Escopo, string> = {
  proprio: '#6B7280',
  unidade: '#2563EB',
  empresa: '#7C3AED',
  global: '#8A2A41',
}
const NENHUM = '—'

const ACAO_ICON: Record<string, string> = {
  ler: 'ti-eye',
  criar: 'ti-plus',
  editar: 'ti-edit',
  deletar: 'ti-trash',
  aprovar: 'ti-check',
  exportar: 'ti-file-export',
  admin: 'ti-settings',
}

type Props = {
  cargoId: string
  recursos: Recurso[]
  acoes: Acao[]
  inicial: GridState
  paresExistentes: string[]
  podeEditar: boolean
}

export function PermissoesGrid({ cargoId, recursos, acoes, inicial, paresExistentes, podeEditar }: Props) {
  const router = useRouter()
  const [state, setState] = useState<GridState>(inicial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({})

  const paresSet = useMemo(() => new Set(paresExistentes), [paresExistentes])
  const cellKey = (r: string, a: string) => `${r}|${a}`

  // Módulos (grupos de recursos), na ordem em que vieram (já ordenados por módulo).
  const modulos = useMemo(() => {
    const out: { modulo: string; recursos: Recurso[] }[] = []
    for (const r of recursos) {
      const last = out[out.length - 1]
      if (last && last.modulo === r.modulo) last.recursos.push(r)
      else out.push({ modulo: r.modulo, recursos: [r] })
    }
    return out
  }, [recursos])

  // Diff vs estado inicial → o que mandar pro servidor.
  const changes: CellChange[] = useMemo(() => {
    const all = new Set([...Object.keys(inicial), ...Object.keys(state)])
    const diff: CellChange[] = []
    for (const k of all) {
      const antes = inicial[k]
      const agora = state[k]
      if (antes !== agora) {
        const [recurso_id, acao_id] = k.split('|')
        diff.push({ recurso_id, acao_id, escopo: agora ?? null })
      }
    }
    return diff
  }, [inicial, state])

  const sujo = changes.length > 0
  const totalConcedidas = Object.values(state).filter(Boolean).length

  function setCell(r: string, a: string, escopo: Escopo | '') {
    setMsg(null)
    setState((prev) => {
      const next = { ...prev }
      const k = cellKey(r, a)
      if (escopo === '') delete next[k]
      else next[k] = escopo
      return next
    })
  }

  /** Liga/desliga a linha inteira de um recurso num escopo (todas as ações existentes). */
  function setLinha(recursoId: string, escopo: Escopo | '') {
    setMsg(null)
    setState((prev) => {
      const next = { ...prev }
      for (const a of acoes) {
        if (!paresSet.has(cellKey(recursoId, a.id))) continue
        const k = cellKey(recursoId, a.id)
        if (escopo === '') delete next[k]
        else next[k] = escopo
      }
      return next
    })
  }

  async function salvar() {
    if (!sujo) return
    setBusy(true); setMsg(null)
    const r = await salvarPermissoesCargo(cargoId, changes)
    setBusy(false)
    if (!r.ok) { setMsg({ tipo: 'err', texto: r.error || 'Falha ao salvar.' }); return }
    setMsg({ tipo: 'ok', texto: `Permissões salvas: +${r.gravadas ?? 0} concedida(s), −${r.removidas ?? 0} removida(s).` })
    router.refresh()
  }

  async function preset(p: 'leitura_total' | 'limpar', escopo?: Escopo) {
    setBusy(true); setMsg(null)
    const r = await aplicarPreset(cargoId, p, escopo)
    setBusy(false)
    if (!r.ok) { setMsg({ tipo: 'err', texto: r.error || 'Falha no preset.' }); return }
    setMsg({ tipo: 'ok', texto: 'Preset aplicado.' })
    router.refresh()
  }

  function descartar() {
    setState(inicial)
    setMsg(null)
  }

  return (
    <>
      {/* Legenda + ações em barra fixa-ish */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5 }}>
          <span style={{ color: 'var(--text-3)' }}>Escopo:</span>
          {ESCOPOS.map((e) => (
            <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: ESCOPO_COR[e], display: 'inline-block' }} />
              <span style={{ color: 'var(--text-2)' }}>{ESCOPO_LABEL[e]}</span>
            </span>
          ))}
          <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>· {totalConcedidas} concedida(s)</span>
        </div>

        {podeEditar && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" disabled={busy} onClick={() => preset('leitura_total', 'unidade')} title="Concede 'ler' (Unidade) em todos os recursos">
              <i className="ti ti-eye" /> Leitura total
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => { if (confirm('Remover TODAS as permissões deste cargo?')) preset('limpar') }} title="Remove todas as permissões do cargo">
              <i className="ti ti-eraser" /> Limpar tudo
            </button>
            <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
            <button className="btn btn-ghost" disabled={busy || !sujo} onClick={descartar}>
              <i className="ti ti-arrow-back-up" /> Descartar
            </button>
            <button className="btn btn-primary" disabled={busy || !sujo} onClick={salvar}>
              <i className="ti ti-device-floppy" /> {busy ? 'Salvando…' : sujo ? `Salvar (${changes.length})` : 'Salvar'}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div
          className="modal-note"
          style={{
            marginBottom: 12,
            background: msg.tipo === 'ok' ? 'var(--green-bg, #E7F6EC)' : 'var(--red-bg, #FBE9E9)',
            color: msg.tipo === 'ok' ? 'var(--green, #15803D)' : 'var(--red, #B91C1C)',
          }}
        >
          <i className={`ti ${msg.tipo === 'ok' ? 'ti-circle-check' : 'ti-alert-circle'}`} /> {msg.texto}
        </div>
      )}
      {sujo && podeEditar && (
        <div style={{ fontSize: 11.5, color: 'var(--amber, #B45309)', marginBottom: 10 }}>
          <i className="ti ti-pencil" /> {changes.length} alteração(ões) não salva(s).
        </div>
      )}

      <div className="cli-card">
        <div className="cli-scroll" style={{ maxHeight: '70vh' }}>
          <table className="cli-table" style={{ minWidth: 920 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)', zIndex: 2, minWidth: 230 }}>Recurso</th>
                {acoes.map((a) => (
                  <th key={a.id} title={a.descricao} style={{ textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                    <i className={`ti ${ACAO_ICON[a.id] ?? 'ti-point'}`} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    {a.id}
                  </th>
                ))}
                {podeEditar && <th style={{ textAlign: 'center', minWidth: 96 }}>Linha</th>}
              </tr>
            </thead>
            <tbody>
              {modulos.map((m) => {
                const aberto = !colapsados[m.modulo]
                return (
                  <ModuloBloco
                    key={m.modulo}
                    modulo={m.modulo}
                    recursos={m.recursos}
                    acoes={acoes}
                    aberto={aberto}
                    onToggle={() => setColapsados((p) => ({ ...p, [m.modulo]: aberto }))}
                    state={state}
                    paresSet={paresSet}
                    podeEditar={podeEditar}
                    busy={busy}
                    setCell={setCell}
                    setLinha={setLinha}
                    colSpanTotal={acoes.length + 1 + (podeEditar ? 1 : 0)}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
        <i className="ti ti-info-circle" /> Cada célula concede a ação no escopo escolhido. O escopo é hierárquico:
        <b> Global</b> {'>'} <b>Empresa</b> {'>'} <b>Unidade</b> {'>'} <b>Próprio</b>. Selecione <b>{NENHUM}</b> para revogar.
      </p>
    </>
  )
}

function ModuloBloco({
  modulo, recursos, acoes, aberto, onToggle, state, paresSet, podeEditar, busy, setCell, setLinha, colSpanTotal,
}: {
  modulo: string
  recursos: Recurso[]
  acoes: Acao[]
  aberto: boolean
  onToggle: () => void
  state: GridState
  paresSet: Set<string>
  podeEditar: boolean
  busy: boolean
  setCell: (r: string, a: string, e: Escopo | '') => void
  setLinha: (r: string, e: Escopo | '') => void
  colSpanTotal: number
}) {
  const concedidasNoModulo = recursos.reduce((acc, r) => {
    for (const a of acoes) if (state[`${r.id}|${a.id}`]) acc++
    return acc
  }, 0)

  return (
    <>
      <tr style={{ background: 'var(--brand-50, #F7E7EB)', cursor: 'pointer' }} onClick={onToggle}>
        <td colSpan={colSpanTotal} style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: 12.5 }}>
          <i className={`ti ${aberto ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {modulo}
          <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
            {recursos.length} recurso(s){concedidasNoModulo ? ` · ${concedidasNoModulo} concedida(s)` : ''}
          </span>
        </td>
      </tr>
      {aberto && recursos.map((r) => (
        <RecursoRow
          key={r.id}
          recurso={r}
          acoes={acoes}
          state={state}
          paresSet={paresSet}
          podeEditar={podeEditar}
          busy={busy}
          setCell={setCell}
          setLinha={setLinha}
        />
      ))}
    </>
  )
}

function RecursoRow({
  recurso, acoes, state, paresSet, podeEditar, busy, setCell, setLinha,
}: {
  recurso: Recurso
  acoes: Acao[]
  state: GridState
  paresSet: Set<string>
  podeEditar: boolean
  busy: boolean
  setCell: (r: string, a: string, e: Escopo | '') => void
  setLinha: (r: string, e: Escopo | '') => void
}) {
  return (
    <tr>
      <td style={{ position: 'sticky', left: 0, background: 'var(--surface, #fff)', zIndex: 1 }}>
        <span className="cli-name" style={{ fontWeight: 600, fontSize: 12.5 }}>{recurso.nome}</span>
        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'monospace' }}>{recurso.id}</span>
      </td>
      {acoes.map((a) => {
        const existe = paresSet.has(`${recurso.id}|${a.id}`)
        const val = state[`${recurso.id}|${a.id}`] ?? ''
        return (
          <td key={a.id} style={{ textAlign: 'center', padding: '4px 6px' }}>
            {existe ? (
              <EscopoSelect
                value={val}
                disabled={!podeEditar || busy}
                onChange={(e) => setCell(recurso.id, a.id, e)}
              />
            ) : (
              <span style={{ color: 'var(--text-3)', fontSize: 11 }} title="Sem permissão cadastrada para este par">·</span>
            )}
          </td>
        )
      })}
      {podeEditar && (
        <td style={{ textAlign: 'center', padding: '4px 6px' }}>
          <EscopoSelect
            value=""
            placeholder="Linha…"
            disabled={busy}
            onChange={(e) => setLinha(recurso.id, e)}
          />
        </td>
      )}
    </tr>
  )
}

function EscopoSelect({
  value, onChange, disabled, placeholder,
}: {
  value: Escopo | ''
  onChange: (e: Escopo | '') => void
  disabled?: boolean
  placeholder?: string
}) {
  const cor = value ? ESCOPO_COR[value as Escopo] : 'var(--text-3)'
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Escopo | '')}
      style={{
        fontSize: 11.5,
        padding: '3px 4px',
        borderRadius: 6,
        border: `1px solid ${value ? cor : 'var(--line)'}`,
        color: value ? cor : 'var(--text-3)',
        fontWeight: value ? 600 : 400,
        background: 'var(--surface, #fff)',
        cursor: disabled ? 'default' : 'pointer',
        minWidth: 78,
      }}
    >
      <option value="">{placeholder ?? NENHUM}</option>
      {ESCOPOS.map((e) => (
        <option key={e} value={e}>{ESCOPO_LABEL[e]}</option>
      ))}
    </select>
  )
}
