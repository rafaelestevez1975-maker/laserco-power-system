'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  IMPL_WF, IMPL_ST, pillSituacao, implDiff, diasAteInauguracao, implTotals,
  progressoEtapa, etapaAtual, tarefasPorResponsavel,
  type EtapaImpl, type ProjetoImpl,
} from '@/lib/implantacao'
import {
  salvarProjeto, definirSituacao, editarTarefa, adicionarTarefa, excluirTarefa,
  editarEtapa, adicionarEtapa, excluirEtapa,
} from '@/app/(app)/implantacao/actions'

/**
 * Implantação de Unidade  paridade com implRender do legado (legacy ~4853-4890):
 * cabeçalho editável, 4 KPIs, barra de progresso geral + 2 gráficos de barra,
 * etapas com tabela de tarefas (admin/gestor editam descrição/responsável/duração
 * e adicionam/excluem; todos atualizam a situação).
 */
function BarChart({ data }: { data: Array<[string, number, string]> }) {
  const max = Math.max(1, ...data.map((d) => d[1]))
  if (data.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sem dados.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map(([lab, val, txt]) => (
        <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 110, fontSize: 11.5, color: 'var(--text-2)', textAlign: 'right', flexShrink: 0 }}>{lab}</span>
          <div style={{ flex: 1, height: 18, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(val / max) * 100}%`, background: 'var(--brand-500)', borderRadius: 6 }} />
          </div>
          <span style={{ width: 46, fontSize: 11.5, fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>{txt}</span>
        </div>
      ))}
    </div>
  )
}

export function ImplantacaoView({
  projeto, etapas, podeEditar, semTabela, activeUnitName,
}: {
  projeto: ProjetoImpl | null
  etapas: EtapaImpl[]
  podeEditar: boolean
  semTabela: boolean
  activeUnitName: string
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // form local do cabeçalho (controlado, salva no blur/botão)
  const [nome, setNome] = useState(projeto?.nome ?? '')
  const [inicio, setInicio] = useState(projeto?.inicio ?? '')
  const [inauguracao, setInauguracao] = useState(projeto?.inauguracao ?? '')

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErro(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) setErro(r.error || 'Falha na operação.')
      else router.refresh()
    })
  }

  // Empty-state: migration ausente OU sem projeto.
  if (semTabela || !projeto) {
    return (
      <div className="view active">
        <h2 style={{ fontSize: 19, fontWeight: 800, marginBottom: 14 }}>
          <i className="ti ti-building-store" style={{ color: 'var(--brand-500)' }} /> Implantação de Unidade
        </h2>
        <div className="rel-card" style={{ textAlign: 'center', padding: '34px 18px' }}>
          <i className="ti ti-database-off" style={{ fontSize: 30, color: 'var(--text-3)' }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>
            {semTabela ? 'Tabela de implantação não encontrada' : 'Nenhum projeto de implantação'}
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
            Aplique a migration <code>scripts/migrations/implantacao.sql</code> no lkii para criar o fluxo
            padrão (5 etapas · 65 tarefas) e o projeto demo.
          </p>
        </div>
      </div>
    )
  }

  const { tot, done } = implTotals(etapas)
  const pc = tot > 0 ? Math.round((done / tot) * 100) : 0
  const prazo = implDiff(inicio || null, inauguracao || null)
  const dias = diasAteInauguracao(inauguracao || null)
  const fase = etapaAtual(etapas)

  const kpis: [string, string, string][] = [
    ['Progresso geral', pc + '%', 'ti-progress'],
    ['Tarefas concluídas', `${done} / ${tot}`, 'ti-checks'],
    ['Etapa atual', fase ? fase.cod : '', 'ti-flag'],
    ['Dias até inauguração', dias != null ? String(dias) : '', 'ti-calendar-event'],
  ]

  const chartFases: Array<[string, number, string]> = etapas.map((e) => {
    const p = progressoEtapa(e)
    return [e.cod, p, p + '%']
  })
  const chartResp: Array<[string, number, string]> = tarefasPorResponsavel(etapas).map(([k, v]) => [k, v, String(v)])

  const dirty = nome !== (projeto.nome ?? '') || inicio !== (projeto.inicio ?? '') || inauguracao !== (projeto.inauguracao ?? '')

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>
            <i className="ti ti-building-store" style={{ color: 'var(--brand-500)' }} /> Implantação de Unidade
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
            Fluxo de implantação em <b>5 etapas</b> e {tot} tarefas, do início à inauguração  <b>{activeUnitName}</b>
          </p>
        </div>
        {podeEditar && (
          <button className="btn btn-primary" disabled={pending} onClick={() => run(() => adicionarEtapa(projeto.id))}>
            <i className="ti ti-plus" /> Nova fase
          </button>
        )}
      </div>

      <div className="rel-legend">
        {podeEditar
          ? 'Tudo editável: edite tarefas, responsáveis, durações, etapas e datas.'
          : 'Administradores e gestores editam o fluxo; demais perfis acompanham e atualizam a situação.'}
      </div>

      {erro && (
        <div className="sim-msg warn-msg" style={{ marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> {erro}
        </div>
      )}

      {/* Cabeçalho do projeto */}
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, alignItems: 'end' }}>
          <div className="mf">
            <label style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Unidade / Projeto</label>
            <input value={nome} disabled={!podeEditar} onChange={(e) => setNome(e.target.value)}
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '7px 9px', fontSize: 13 }} />
          </div>
          <div className="mf">
            <label style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Início da implantação</label>
            <input type="date" value={inicio} disabled={!podeEditar} onChange={(e) => setInicio(e.target.value)}
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '7px 9px', fontSize: 13 }} />
          </div>
          <div className="mf">
            <label style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Inauguração (projetada)</label>
            <input type="date" value={inauguracao} disabled={!podeEditar} onChange={(e) => setInauguracao(e.target.value)}
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '7px 9px', fontSize: 13 }} />
          </div>
          <div className="mf">
            <label style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Prazo total</label>
            <input value={prazo != null ? `${prazo} dias` : ''} disabled
              style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '7px 9px', fontSize: 13, background: 'var(--surface-2)' }} />
          </div>
        </div>
        {podeEditar && dirty && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn btn-primary" disabled={pending}
              onClick={() => run(() => salvarProjeto({ projetoId: projeto.id, nome, inicio: inicio || null, inauguracao: inauguracao || null }))}>
              <i className="ti ti-device-floppy" /> Salvar cabeçalho
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        {kpis.map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--surface)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 18 }}>{val}</b>
            </span>
          </div>
        ))}
      </div>

      {/* Progresso geral + gráficos */}
      <div className="rel-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>
          <span>{nome}{inicio && inauguracao ? ` · ${inicio} → ${inauguracao}` : ''}</span>
          <span>{pc}%</span>
        </div>
        <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${pc}%`, background: pc === 100 ? 'var(--green)' : 'var(--brand-500)', borderRadius: 6 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}><i className="ti ti-list-check" /> Progresso por etapa</div>
            <BarChart data={chartFases} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}><i className="ti ti-users" /> Tarefas por responsável</div>
            <BarChart data={chartResp} />
          </div>
        </div>
      </div>

      {/* Etapas */}
      {etapas.map((e) => {
        const fpc = progressoEtapa(e)
        const d = e.tarefas.filter((t) => t.situacao === 'Concluído').length
        return (
          <div key={e.id} className="rel-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ display: 'grid', placeItems: 'center', background: fpc === 100 ? 'var(--green)' : 'var(--brand-500)', color: '#fff', width: 42, height: 42, borderRadius: 11, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{e.cod}</span>
              <div style={{ flex: 1 }}>
                <input defaultValue={e.nome} disabled={!podeEditar}
                  onBlur={(ev) => { if (podeEditar && ev.target.value.trim() !== e.nome) run(() => editarEtapa(e.id, ev.target.value)) }}
                  style={{ width: '100%', border: 'none', borderBottom: '1px dashed var(--line)', fontSize: 14, fontWeight: 700, padding: '4px 0', background: 'transparent' }} />
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{d} de {e.tarefas.length} tarefas · {fpc}%</div>
              </div>
              {podeEditar && (
                <button className="btn-ghost" title="Excluir etapa" disabled={pending}
                  onClick={() => { if (confirm(`Excluir a etapa ${e.cod} e suas tarefas?`)) run(() => excluirEtapa(e.id)) }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--red)' }}>
                  <i className="ti ti-trash" />
                </button>
              )}
            </div>

            <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
              <span style={{ display: 'block', height: '100%', width: `${fpc}%`, background: fpc === 100 ? 'var(--green)' : 'var(--brand-500)', borderRadius: 6 }} />
            </div>

            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tarefa</th>
                    <th>Responsável</th>
                    <th>Duração</th>
                    <th>Situação</th>
                    {podeEditar && <th />}
                  </tr>
                </thead>
                <tbody>
                  {e.tarefas.map((t) => (
                    <tr key={t.id}>
                      <td style={{ color: 'var(--text-3)', fontWeight: 700 }}>{t.cod}</td>
                      <td>
                        <input defaultValue={t.descricao} disabled={!podeEditar}
                          onBlur={(ev) => { if (podeEditar && ev.target.value.trim() !== t.descricao) run(() => editarTarefa({ tarefaId: t.id, descricao: ev.target.value })) }}
                          style={{ width: '100%', minWidth: 240, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px', fontSize: 12.5 }} />
                      </td>
                      <td>
                        <select defaultValue={t.responsavel} disabled={!podeEditar}
                          onChange={(ev) => run(() => editarTarefa({ tarefaId: t.id, responsavel: ev.target.value }))}
                          style={{ border: '1px solid var(--line)', borderRadius: 7, padding: 6, fontSize: 12 }}>
                          {IMPL_WF.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <input type="number" min={1} defaultValue={t.duracao_dias} disabled={!podeEditar}
                          onBlur={(ev) => { const n = Number(ev.target.value); if (podeEditar && n !== t.duracao_dias) run(() => editarTarefa({ tarefaId: t.id, duracao_dias: n })) }}
                          style={{ width: 58, border: '1px solid var(--line)', borderRadius: 7, padding: 6, fontSize: 12.5 }} /> d
                      </td>
                      <td>
                        <select defaultValue={t.situacao}
                          onChange={(ev) => run(() => definirSituacao(t.id, ev.target.value))}
                          style={{ border: '1px solid var(--line)', borderRadius: 7, padding: 6, fontSize: 12 }}>
                          {IMPL_ST.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <span className={`wa-pill ${pillSituacao(t.situacao)}`} style={{ marginLeft: 6 }}>{t.situacao}</span>
                      </td>
                      {podeEditar && (
                        <td>
                          <button title="Excluir tarefa" disabled={pending}
                            onClick={() => run(() => excluirTarefa(t.id))}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--red)' }}>
                            <i className="ti ti-trash" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {podeEditar && (
              <button className="btn btn-ghost" disabled={pending} style={{ marginTop: 10, padding: '7px 11px' }}
                onClick={() => run(() => adicionarTarefa(e.id))}>
                <i className="ti ti-plus" /> Adicionar tarefa
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
