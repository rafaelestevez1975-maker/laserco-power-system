'use client'

import { useRouter } from 'next/navigation'

type Bar = { nome: string; n: number }
type Kpis = { total: number; concluidos: number; emAberto: number; sla: number; slaPct: number }
type AtendPerf = { nome: string; total: number; resolvidos: number; slaPct: number }

const PERIODOS: [string, string][] = [['30d', 'Últimos 30 dias'], ['mes', 'Este mês'], ['tudo', 'Tudo']]

export function SacRelatorios({ periodo, kpis, canais, fases, prioridades, motivos, atendentes }: {
  periodo: string; kpis: Kpis; canais: Bar[]; fases: Bar[]; prioridades: Bar[]; motivos: Bar[]; atendentes: AtendPerf[]
}) {
  const router = useRouter()

  function exportar() {
    const linhas: (string | number)[][] = [
      ['Métrica', 'Valor'],
      ['Total de chamados', kpis.total], ['Concluídos', kpis.concluidos], ['Em aberto', kpis.emAberto],
      ['SLA violado', kpis.sla], ['SLA violado (%)', `${kpis.slaPct}%`],
      [], ['Canal', 'Chamados'], ...canais.map((c) => [c.nome, c.n]),
      [], ['Fase', 'Chamados'], ...fases.map((f) => [f.nome, f.n]),
      [], ['Prioridade', 'Chamados'], ...prioridades.map((p) => [p.nome, p.n]),
      [], ['Motivo', 'Chamados'], ...motivos.map((m) => [m.nome, m.n]),
      [], ['Atendente', 'Chamados', 'Resolvidos', 'SLA cumprido %'], ...atendentes.map((a) => [a.nome, a.total, a.resolvidos, `${a.slaPct}%`]),
    ]
    const csv = linhas.map((l) => l.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `relatorio-sac-${periodo}.csv`; a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="rel-acts" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODOS.map(([k, label]) => (
            <button key={k} className={`btn ${periodo === k ? 'btn-primary' : ''}`} onClick={() => router.push(`/sac/relatorios?periodo=${k}`)}>{label}</button>
          ))}
        </div>
        <button className="btn" onClick={exportar}><i className="ti ti-download" /> Exportar CSV</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        <div className="metric-box"><span>Total</span><b>{kpis.total.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Concluídos</span><b>{kpis.concluidos.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Em aberto</span><b>{kpis.emAberto.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>SLA violado ({kpis.slaPct}%)</span><b>{kpis.sla.toLocaleString('pt-BR')}</b></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 18 }}>
        <CardBars title="Por canal" icon="ti-chart-bar" dados={canais} />
        <CardBars title="Por fase" icon="ti-layout-kanban" dados={fases} />
        <CardBars title="Por prioridade" icon="ti-flag" dados={prioridades.map((p) => ({ nome: p.nome.replace(/^\w/, (c) => c.toUpperCase()), n: p.n }))} />
        {motivos.length > 0 && <CardBars title="Por motivo (top)" icon="ti-list-details" dados={motivos} />}
      </div>

      {atendentes.length > 0 && (
        <div className="rel-card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}><i className="ti ti-users" /> Performance por atendente</h3>
          <table className="cli-table" style={{ fontSize: 13 }}>
            <thead><tr><th>Atendente</th><th className="num-r">Chamados</th><th className="num-r">Resolvidos</th><th className="num-r">SLA cumprido</th></tr></thead>
            <tbody>
              {atendentes.map((a) => (
                <tr key={a.nome}>
                  <td><b>{a.nome}</b></td>
                  <td className="num-r">{a.total}</td>
                  <td className="num-r">{a.resolvidos}</td>
                  <td className="num-r" style={{ color: a.slaPct >= 80 ? 'var(--green)' : a.slaPct >= 50 ? '#9A6700' : 'var(--red)', fontWeight: 700 }}>{a.total ? `${a.slaPct}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
        <i className="ti ti-info-circle" /> Tempo médio de resposta/resolução ainda não é medido nos chamados importados — passa a aparecer conforme o SAC operar pelo sistema.
      </div>
    </>
  )
}

function CardBars({ title, icon, dados }: { title: string; icon: string; dados: Bar[] }) {
  const max = Math.max(1, ...dados.map((d) => d.n))
  return (
    <div className="rel-card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 12 }}><i className={`ti ${icon}`} /> {title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dados.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sem dados no período.</div>}
        {dados.map((d) => (
          <div key={d.nome} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 46px', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12.5 }}>{d.nome}</span>
            <div style={{ background: 'var(--line)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
              <div style={{ width: `${(d.n / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--brand-400),var(--brand-600))' }} />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{d.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
