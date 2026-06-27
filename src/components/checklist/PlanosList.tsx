'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { dataBR } from '@/lib/fmt'
import { toggleTarefa, definirStatusPlano } from '@/app/(app)/checklist/actions'

export type TarefaRow = {
  id: string
  plano_id: string
  titulo: string
  descricao: string | null
  categoria: string | null
  ordem: number | null
  prazo_dias: number | null
  concluida: boolean
  concluida_em: string | null
}

export type PlanoRow = {
  id: string
  unidade_id: string
  unidade_nome: string | null
  semana_inicio: string | null
  semana_fim: string | null
  status: string
  prioridade: string | null
  resumo_executivo: string | null
  diagnostico_ia: string | null
  cumprimento_pct: number | null
  concluido_em: string | null
  gerado_em: string | null
  tarefas: TarefaRow[]
}

const PRIORIDADE_PILL: Record<string, { cls: string; label: string }> = {
  alta: { cls: 'crit', label: 'Alta' },
  media: { cls: 'pend', label: 'Média' },
  baixa: { cls: 'ok', label: 'Baixa' },
}

const STATUS_PILL: Record<string, { cls: string; label: string }> = {
  ativo: { cls: 'os-aberta', label: 'Ativo' },
  concluido: { cls: 'os-fechada', label: 'Concluído' },
  arquivado: { cls: 'os-cancelada', label: 'Arquivado' },
}

function estaAtrasado(p: PlanoRow): boolean {
  if (p.status !== 'ativo' || !p.semana_fim) return false
  const fim = new Date(p.semana_fim + 'T23:59:59')
  return !isNaN(fim.getTime()) && fim.getTime() < Date.now()
}

function PlanoCard({ plano, podeEscrever }: { plano: PlanoRow; podeEscrever: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(plano.status === 'ativo')

  const tarefas = [...plano.tarefas].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  const total = tarefas.length
  const feitas = tarefas.filter((t) => t.concluida).length
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0
  const prio = PRIORIDADE_PILL[plano.prioridade || 'media'] ?? PRIORIDADE_PILL.media
  const st = STATUS_PILL[plano.status] ?? { cls: 'os-aberta', label: plano.status }
  const atrasado = estaAtrasado(plano)

  function onToggle(t: TarefaRow) {
    if (!podeEscrever || pending) return
    setErr('')
    start(async () => {
      const res = await toggleTarefa(t.id, plano.id, !t.concluida)
      if (!res.ok) setErr(res.error || 'Erro ao atualizar tarefa.')
      else router.refresh()
    })
  }

  function onConcluirPlano() {
    if (!podeEscrever || pending) return
    setErr('')
    start(async () => {
      const novo = plano.status === 'concluido' ? 'ativo' : 'concluido'
      const res = await definirStatusPlano(plano.id, novo)
      if (!res.ok) setErr(res.error || 'Erro ao atualizar plano.')
      else router.refresh()
    })
  }

  return (
    <div className="rel-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, opacity: pending ? 0.7 : 1 }}>
      <div
        className="rel-card-h"
        style={{ padding: '14px 18px', background: 'var(--surface-2)', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <i className={`ti ti-${open ? 'chevron-down' : 'chevron-right'}`} style={{ color: 'var(--text-3)' }} />
          <i className="ti ti-target-arrow flt" />
          <b style={{ fontSize: 14 }}>
            Semana {dataBR(plano.semana_inicio)} – {dataBR(plano.semana_fim)}
          </b>
          {plano.unidade_nome && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>· {plano.unidade_nome}</span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`wa-pill ${prio.cls}`}>{prio.label}</span>
          <span className={`os-st ${st.cls}`} style={{ fontSize: 11 }}>{st.label}</span>
          {atrasado && <span className="os-st os-cancelada" style={{ fontSize: 11 }}><i className="ti ti-clock-exclamation" /> Atrasado</span>}
        </span>
      </div>

      {open && (
        <div style={{ padding: '14px 18px' }}>
          {plano.resumo_executivo && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>{plano.resumo_executivo}</p>
          )}
          {plano.diagnostico_ia && (
            <div className="rel-legend" style={{ marginBottom: 12 }}>
              <i className="ti ti-bulb" /> {plano.diagnostico_ia}
            </div>
          )}

          {/* barra de progresso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 8, background: 'var(--line)', borderRadius: 20, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--green)' : 'var(--brand-500)', transition: '.2s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', minWidth: 96, textAlign: 'right' }}>
              {feitas}/{total} tarefas · {pct}%
            </span>
          </div>

          {total === 0 ? (
            <div className="gs-empty">Nenhuma tarefa neste plano.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tarefas.map((t) => (
                <label
                  key={t.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                    border: '1px solid var(--line)', borderRadius: 9, background: t.concluida ? 'var(--green-bg)' : 'var(--surface)',
                    cursor: podeEscrever ? 'pointer' : 'default',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={t.concluida}
                    disabled={!podeEscrever || pending}
                    onChange={() => onToggle(t)}
                    style={{ width: 'auto', marginTop: 2, accentColor: 'var(--brand-500)' }}
                  />
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: t.concluida ? 'line-through' : 'none', color: t.concluida ? 'var(--text-3)' : 'var(--text)' }}>
                      {t.titulo}
                    </span>
                    {t.descricao && (
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{t.descricao}</span>
                    )}
                    <span style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {t.categoria && <span className="wa-pill draft">{t.categoria}</span>}
                      {t.prazo_dias != null && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}><i className="ti ti-clock" /> {t.prazo_dias}d</span>
                      )}
                      {t.concluida && t.concluida_em && (
                        <span style={{ fontSize: 11, color: 'var(--green)' }}><i className="ti ti-check" /> {dataBR(t.concluida_em)}</span>
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

          {podeEscrever && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-ghost" onClick={onConcluirPlano} disabled={pending}>
                {plano.status === 'concluido'
                  ? <><i className="ti ti-rotate" /> Reabrir plano</>
                  : <><i className="ti ti-circle-check" /> Concluir plano</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PlanosList({ planos, podeEscrever }: { planos: PlanoRow[]; podeEscrever: boolean }) {
  if (planos.length === 0) {
    return (
      <div className="rel-card" style={{ textAlign: 'center', padding: '34px 18px' }}>
        <i className="ti ti-clipboard-off" style={{ fontSize: 30, color: 'var(--text-3)' }} />
        <p style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>Nenhum plano de ação ainda</p>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
          Avalie os indicadores do funil e crie um plano com as tarefas da semana.
        </p>
      </div>
    )
  }
  return (
    <div>
      {planos.map((p) => (
        <PlanoCard key={p.id} plano={p} podeEscrever={podeEscrever} />
      ))}
    </div>
  )
}
