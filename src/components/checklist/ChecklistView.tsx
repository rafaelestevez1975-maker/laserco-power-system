'use client'

import { useMemo, useState } from 'react'
import { fmtValorInd, corNota, notaGeral, gargalos, type LinhaAvaliacao, type FunilSnapshot, type ChecklistMensal } from '@/lib/checklist'
import { dataBR } from '@/lib/fmt'
import { PlanosList, type PlanoRow } from './PlanosList'
import { PlanoModal, type SugestaoTarefa } from './PlanoModal'
import { ChecklistMensalView } from './ChecklistMensalView'

type Unidade = { id: string; nome: string }
type Kpis = { abertos: number; atrasados: number; concluidos: number; total: number }
type Tab = 'avaliacao' | 'mensal' | 'planos'

export function ChecklistView({
  linhas, snap, planos, kpis, mensal, podeEscrever, unidades, activeUnitId, activeUnitName,
}: {
  linhas: LinhaAvaliacao[]
  snap: FunilSnapshot | null
  planos: PlanoRow[]
  kpis: Kpis
  mensal: ChecklistMensal | null
  podeEscrever: boolean
  unidades: Unidade[]
  activeUnitId: string | null
  activeUnitName: string
}) {
  const [tab, setTab] = useState<Tab>('avaliacao')
  const [modal, setModal] = useState(false)

  const geral = useMemo(() => notaGeral(linhas), [linhas])
  const gargs = useMemo(() => gargalos(linhas), [linhas])

  // Sugestões de tarefa derivadas dos gargalos (indicador < 7) p/ pré-preencher o modal.
  const sugestoes: SugestaoTarefa[] = gargs.map((l) => ({
    titulo: `Melhorar ${l.ind.lab}`,
    categoria: l.ind.categoria,
    descricao: l.ind.act,
  }))

  const temSnap = !!snap

  const kpiCards: [string, number, string, string][] = [
    ['Planos abertos', kpis.abertos, 'ti-clipboard-list', 'var(--blue)'],
    ['Atrasados', kpis.atrasados, 'ti-clock-exclamation', 'var(--red)'],
    ['Concluídos', kpis.concluidos, 'ti-circle-check', 'var(--green)'],
    ['Total', kpis.total, 'ti-stack-2', 'var(--brand-500)'],
  ]

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}><i className="ti ti-checklist" style={{ color: 'var(--brand-500)' }} /> Checklist de Indicadores · PDCA</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
            Avaliação do funil e planos de ação  <b>{activeUnitName}</b>
          </p>
        </div>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => setModal(true)} disabled={unidades.length === 0}>
            <i className="ti ti-plus" /> Novo plano de ação
          </button>
        )}
      </div>

      {/* KPIs de planos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        {kpiCards.map(([label, val, icon, cor]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--surface)', color: cor, flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="rel-tabs" id="chkTabs">
        <div className={`rel-tab ${tab === 'avaliacao' ? 'active' : ''}`} onClick={() => setTab('avaliacao')}>
          <i className="ti ti-gauge" /> Avaliação do funil
        </div>
        <div className={`rel-tab ${tab === 'mensal' ? 'active' : ''}`} onClick={() => setTab('mensal')}>
          <i className="ti ti-clipboard-list" /> Mensal · PDCA
        </div>
        <div className={`rel-tab ${tab === 'planos' ? 'active' : ''}`} onClick={() => setTab('planos')}>
          <i className="ti ti-target-arrow" /> Planos de ação {planos.length > 0 && <span className="wa-pill draft" style={{ marginLeft: 4 }}>{planos.length}</span>}
        </div>
      </div>

      {tab === 'mensal' ? (
        <ChecklistMensalView mensal={mensal} activeUnitName={activeUnitName} />
      ) : tab === 'avaliacao' ? (
        <>
          <div className="rel-legend">
            <b>Checklist de Indicadores (funil)</b> · ciclo <b>PDCA</b>: <b>P</b>lanejar ações para subir os indicadores,
            <b> D</b>o executar com responsável e prazo, <b>C</b>hecar na reunião semanal, <b>A</b>gir conforme o resultado.
            Notas de 0 a 10 calculadas sobre <code>kpis_unidade_snapshot</code>; abaixo de 7 sugerem plano de ação.
          </div>

          {/* nota geral */}
          <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
            <div style={{ textAlign: 'center', minWidth: 90 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: corNota(geral), lineHeight: 1 }}>
                {geral != null ? geral.toFixed(1) : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>nota do funil</div>
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{activeUnitName}</h3>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                {temSnap
                  ? <>Snapshot {snap?.periodo ? `(${snap.periodo})` : ''} de <b>{dataBR(snap?.data_referencia)}</b> · {gargs.length} indicador(es) a melhorar</>
                  : 'Sem snapshot de indicadores para esta unidade ainda.'}
              </div>
            </div>
          </div>

          {!temSnap ? (
            <div className="rel-card" style={{ textAlign: 'center', padding: '34px 18px' }}>
              <i className="ti ti-chart-dots" style={{ fontSize: 30, color: 'var(--text-3)' }} />
              <p style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>Nenhum indicador coletado</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
                A coleta automática semanal (cron) ainda não rodou para esta unidade. Os planos de ação podem ser criados manualmente.
              </p>
            </div>
          ) : (
            <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="cli-scroll">
                <table className="cli-table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th className="num-r">Valor</th>
                      <th className="num-r">Meta</th>
                      <th className="num-r">Peso</th>
                      <th>Nota</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.ind.k}>
                        <td><span className="cli-name">{l.ind.lab}</span></td>
                        <td className="num-r">{fmtValorInd(l.ind, l.valor)}</td>
                        <td className="num-r" style={{ color: 'var(--text-3)' }}>{fmtValorInd(l.ind, l.ind.meta)}</td>
                        <td className="num-r" style={{ color: 'var(--text-3)' }}>{l.ind.peso}</td>
                        <td>
                          <span style={{ display: 'inline-block', minWidth: 42, textAlign: 'center', fontWeight: 800, color: '#fff', background: corNota(l.nota), borderRadius: 7, padding: '3px 8px' }}>
                            {l.nota != null ? l.nota.toFixed(1) : ''}
                          </span>
                        </td>
                        <td><span className={`wa-pill ${l.status.cls}`}>{l.status.label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {temSnap && gargs.length > 0 && podeEscrever && (
            <div className="sim-msg warn-msg" style={{ marginTop: 14, justifyContent: 'space-between', alignItems: 'center' }}>
              <span><i className="ti ti-target-arrow" /> {gargs.length} indicador(es) abaixo de 7  gere um plano de ação com tarefas sugeridas.</span>
              <button className="btn btn-primary" style={{ padding: '7px 14px' }} onClick={() => setModal(true)}>
                <i className="ti ti-player-play" /> Gerar plano
              </button>
            </div>
          )}
          {temSnap && gargs.length === 0 && (
            <div className="sim-msg ok" style={{ marginTop: 14 }}>
              <i className="ti ti-trophy" /> Todos os indicadores do funil estão dentro ou acima da meta. Manter o ritmo (Act).
            </div>
          )}
        </>
      ) : (
        <PlanosList planos={planos} podeEscrever={podeEscrever} />
      )}

      {modal && (
        <PlanoModal
          unidades={unidades}
          defaultUnitId={activeUnitId}
          sugestoes={sugestoes}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  )
}
