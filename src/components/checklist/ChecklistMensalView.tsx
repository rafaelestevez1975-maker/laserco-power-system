'use client'

import { useState } from 'react'
import type { ChecklistMensal } from '@/lib/checklist'

/**
 * Aba "Mensal · PDCA"  Check List Mensal de Indicadores (modelo SULTS).
 * Espelha chkMensal do legado (legacy ~6114-6166): 6 seções, ~26 questões com
 * itens auto-preenchidos pelos dados da rede/unidade, tabela Questão/Resposta/
 * Avaliação/Pontos, pontuação 340 + % e planos de ação gerados automaticamente.
 */
function ConfPill({ conf }: { conf: boolean | null }) {
  if (conf == null) return <span className="os-st">N/A</span>
  return <span className={`os-st ${conf ? 'os-fechada' : 'os-cancelada'}`}>{conf ? 'Conforme' : 'Não conforme'}</span>
}

export function ChecklistMensalView({ mensal, activeUnitName }: { mensal: ChecklistMensal | null; activeUnitName: string }) {
  const [aviso, setAviso] = useState<string | null>(null)

  if (!mensal) {
    return (
      <div className="rel-card" style={{ textAlign: 'center', padding: '34px 18px' }}>
        <i className="ti ti-clipboard-list" style={{ fontSize: 30, color: 'var(--text-3)' }} />
        <p style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>Sem snapshot para o checklist mensal</p>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
          O Check List Mensal de Indicadores (PDCA) é preenchido automaticamente pelos dados da unidade.
          Selecione uma unidade com indicadores coletados.
        </p>
      </div>
    )
  }

  const kpis: [string, string, string][] = [
    ['Pontuação', `${mensal.pontos} de ${mensal.total}`, 'ti-award'],
    ['Desempenho', `${mensal.pct}%`, 'ti-percentage'],
    ['Indicadores a melhorar', String(mensal.planos.length), 'ti-target-arrow'],
    ['Ciclo', 'PDCA mensal', 'ti-refresh'],
  ]

  return (
    <>
      <div className="rel-legend">
        <b>Check List Mensal de Indicadores  Franquias e Próprias</b> · unidade <b>{activeUnitName}</b> · referente aos
        últimos 30 dias. Segue o ciclo <b>PDCA</b>: <b>P</b>lanejar o plano de ação para subir os indicadores,
        <b> D</b>o executar com responsável e meta, <b>C</b>hecar na reunião semanal, <b>A</b>gir conforme o resultado.
        As questões marcadas{' '}
        <span className="os-st os-andamento" style={{ fontSize: 10 }}><i className="ti ti-bolt" style={{ fontSize: 11 }} /> auto</span>{' '}
        são <b>preenchidas automaticamente</b> pelos dados da rede/unidade.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 14px' }}>
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

      <div className="rel-acts" style={{ margin: '0 0 14px', display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={() => setAviso('Checklist mensal aplicado  planos de ação enviados para a unidade. (Envio por e-mail/WhatsApp depende da automação semanal.)')}>
          <i className="ti ti-player-play" /> Aplicar e enviar planos de ação
        </button>
        <button className="btn btn-ghost" onClick={() => setAviso('Exportação em PDF do checklist mensal: disponível na automação semanal (cron).')}>
          <i className="ti ti-download" /> Exportar PDF
        </button>
      </div>

      {aviso && (
        <div className="sim-msg ok" style={{ marginBottom: 14 }}>
          <i className="ti ti-info-circle" /> {aviso}
        </div>
      )}

      {/* Seções */}
      {mensal.secoes.map((sec) => (
        <div key={sec.titulo} className="rel-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
          <div className="rel-card-h" style={{ padding: '13px 18px', background: '#F7E7EB' }}>
            <span style={{ color: 'var(--brand-600)' }}><i className="ti ti-clipboard-list flt" /> {sec.titulo}</span>
          </div>
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Questão</th>
                  <th>Resposta</th>
                  <th>Avaliação</th>
                  <th className="num-r">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {sec.questoes.map((q) => (
                  <tr key={q.num}>
                    <td style={{ maxWidth: 520 }}>
                      <b>{q.num}</b> {q.txt}
                      {q.auto && (
                        <span className="os-st os-andamento" style={{ fontSize: 10, marginLeft: 6 }}>
                          <i className="ti ti-bolt" style={{ fontSize: 11 }} /> auto
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}><b>{q.resp}</b></td>
                    <td><ConfPill conf={q.conf} /></td>
                    <td className="num-r">
                      {q.pts == null ? (
                        <span style={{ color: 'var(--text-3)' }}>N/A</span>
                      ) : (
                        <><b>{q.pts[0]}</b> de {q.pts[1]}</>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Planos de ação automáticos */}
      {mensal.planos.length > 0 ? (
        <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="rel-card-h" style={{ padding: '14px 18px', background: 'var(--amber-bg)' }}>
            <span style={{ color: '#8a5a12' }}>
              <i className="ti ti-target-arrow flt" /> Planos de ação gerados automaticamente ({mensal.planos.length})  indicadores a melhorar
            </span>
          </div>
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Indicador</th>
                  <th>Ação (PDCA · Plan→Do)</th>
                  <th>Situação</th>
                  <th>Responsável</th>
                  <th>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {mensal.planos.map((p) => (
                  <tr key={p.indicador}>
                    <td><b>{p.indicador}</b></td>
                    <td style={{ maxWidth: 420, color: 'var(--text-2)' }}>{p.acao}</td>
                    <td>{p.situacao}</td>
                    <td>{p.responsavel}</td>
                    <td>Próx. reunião semanal</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="sim-msg ok">
          <i className="ti ti-trophy" /> Todos os indicadores da unidade estão dentro ou acima da média da rede. Manter o ritmo (Act).
        </div>
      )}
    </>
  )
}
