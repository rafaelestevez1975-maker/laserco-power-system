'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'

type Bar = { nome: string; n: number }
type Kpis = { total: number; concluidos: number; emAberto: number; slaViol: number; slaPct: number }
type AtendPerf = { nome: string; total: number; resolvidos: number; slaPct: number }
type Reembolso = { ref: string; cliente: string; unidade: string; valor: number; multa: boolean; pago: boolean }
type ReembResumo = { total: number; count: number; pagos: number }

// Presets de período — paridade com o helper compartilhado (@/lib/periodo) e com o legado
// (REL_PERIODS: Hoje/Ontem/Última semana/Mês atual/Mês passado/Período…). "Qualquer
// período" = "Tudo". Default da tela: "mes" (Mês atual), igual ao Dashboard.
const PERIOD_PILLS: [string, string][] = [
  ['', 'Tudo'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Última semana'],
  ['mes', 'Mês atual'], ['mes_passado', 'Mês passado'], ['custom', 'Período…'],
]

export function SacRelatorios({
  periodo, di, df, kpis, canais, fases, prioridades, motivos, porUnidade, mostrarUnidade, atendentes, reembolsos, reembResumo,
}: {
  periodo: string; di: string; df: string; kpis: Kpis
  canais: Bar[]; fases: Bar[]; prioridades: Bar[]; motivos: Bar[]; porUnidade: Bar[]
  mostrarUnidade: boolean; atendentes: AtendPerf[]; reembolsos: Reembolso[]; reembResumo: ReembResumo
}) {
  const router = useRouter()
  const sp = useSearchParams()

  function push(params: URLSearchParams) {
    const s = params.toString()
    router.push(s ? `/sac/relatorios?${s}` : '/sac/relatorios')
  }
  function setPeriodo(v: string) {
    const p = new URLSearchParams(sp.toString())
    p.set('periodo', v)
    if (v !== 'custom') { p.delete('di'); p.delete('df') }
    push(p)
  }
  function setData(key: 'di' | 'df', v: string) {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set(key, v); else p.delete(key)
    push(p)
  }

  function exportar() {
    const linhas: (string | number)[][] = [
      ['Métrica', 'Valor'],
      ['Total de chamados', kpis.total], ['Concluídos', kpis.concluidos], ['Em aberto', kpis.emAberto],
      ['SLA violado', kpis.slaViol], ['SLA cumprido (%)', `${kpis.slaPct}%`],
      [], ['Canal', 'Chamados'], ...canais.map((c) => [c.nome, c.n]),
      [], ['Fase', 'Chamados'], ...fases.map((f) => [f.nome, f.n]),
      [], ['Prioridade', 'Chamados'], ...prioridades.map((p) => [p.nome, p.n]),
      [], ['Motivo', 'Chamados'], ...motivos.map((m) => [m.nome, m.n]),
      ...(mostrarUnidade ? [[], ['Unidade (Top 10)', 'Chamados'], ...porUnidade.map((u) => [u.nome, u.n])] : []),
      [], ['Atendente', 'Chamados', 'Resolvidos', 'SLA cumprido %'], ...atendentes.map((a) => [a.nome, a.total, a.resolvidos, `${a.slaPct}%`]),
      [], ['Reembolso · Protocolo', 'Cliente', 'Unidade', 'Valor', 'Multa', 'Pagamento'],
      ...reembolsos.map((r) => [r.ref, r.cliente, r.unidade, moedaBR(r.valor), r.multa ? 'Sim' : 'Não', r.pago ? 'Pago' : 'Pendente']),
    ]
    const csv = linhas.map((l) => l.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `relatorio-sac-${periodo || 'tudo'}.csv`; a.click()
    URL.revokeObjectURL(a.href)
  }

  const dateInp: React.CSSProperties = { padding: 7, border: '1px solid var(--line)', borderRadius: 8 }

  return (
    <>
      <div className="rel-card" style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 280 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
            <i className="ti ti-calendar" /> Período
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PERIOD_PILLS.map(([v, label]) => (
              <button key={v} type="button" className={`sac-chip${periodo === v ? ' on' : ''}`} onClick={() => setPeriodo(v)}>{label}</button>
            ))}
          </div>
          {periodo === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input type="date" value={di} onChange={(e) => setData('di', e.target.value)} style={dateInp} />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>até</span>
              <input type="date" value={df} onChange={(e) => setData('df', e.target.value)} style={dateInp} />
            </div>
          )}
        </div>
        <button className="btn" onClick={exportar} style={{ alignSelf: 'flex-end' }}><i className="ti ti-download" /> Exportar CSV</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
        <div className="metric-box"><span>Total</span><b>{kpis.total.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Concluídos</span><b>{kpis.concluidos.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Em aberto</span><b>{kpis.emAberto.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box" title={`${kpis.slaViol.toLocaleString('pt-BR')} chamado(s) com SLA violado`}>
          <span>SLA cumprido</span><b style={{ color: kpis.slaPct >= 80 ? 'var(--green)' : kpis.slaPct >= 50 ? '#9A6700' : 'var(--red)' }}>{kpis.slaPct}%</b>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 18 }}>
        <CardBars title="Por canal" icon="ti-chart-bar" dados={canais} total={kpis.total} />
        <CardBars title="Por fase" icon="ti-layout-kanban" dados={fases} total={kpis.total} />
        <CardBars title="Por prioridade" icon="ti-flag" dados={prioridades.map((p) => ({ nome: p.nome.replace(/^\w/, (c) => c.toUpperCase()), n: p.n }))} total={kpis.total} />
        {motivos.length > 0 && <CardBars title="Por motivo (top)" icon="ti-list-details" dados={motivos} total={kpis.total} />}
      </div>

      {mostrarUnidade && (
        <div style={{ marginBottom: 18 }}>
          <CardBars title="Chamados por unidade (Top 10)" icon="ti-building" dados={porUnidade} total={kpis.total} larguraNome={180} />
        </div>
      )}

      {atendentes.length > 0 && (
        <div className="rel-card" style={{ padding: 16, marginBottom: 18 }}>
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

      <div className="rel-card" style={{ padding: 16, marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, marginBottom: 4 }}><i className="ti ti-cash" /> Reembolsos</h3>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>
          {reembResumo.count > 0
            ? <>{moedaBR(reembResumo.total)} em {reembResumo.count} solicitação(ões) · {reembResumo.pagos} paga(s)</>
            : 'Nenhum reembolso solicitado no período.'}
        </div>
        {reembolsos.length > 0 && (
          <table className="cli-table" style={{ fontSize: 13 }}>
            <thead><tr><th>Protocolo</th><th>Cliente</th><th>Unidade</th><th className="num-r">Valor</th><th>Multa</th><th>Pagamento</th></tr></thead>
            <tbody>
              {reembolsos.map((r, i) => (
                <tr key={`${r.ref}-${i}`}>
                  <td><b>{r.ref}</b></td>
                  <td>{r.cliente || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td>{r.unidade}</td>
                  <td className="num-r">{moedaBR(r.valor)}</td>
                  <td>{r.multa ? 'Sim' : <span style={{ color: 'var(--text-3)' }}>Não</span>}</td>
                  <td>{r.pago
                    ? <span style={{ color: '#0F6B3A', fontWeight: 700 }}>Pago</span>
                    : <span style={{ color: '#B7791F', fontWeight: 700 }}>Pendente</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
        <i className="ti ti-info-circle" /> Tempo médio de resposta/resolução ainda não é medido nos chamados importados — passa a aparecer conforme o SAC operar pelo sistema.
      </div>
    </>
  )
}

function CardBars({ title, icon, dados, total, larguraNome = 130 }: { title: string; icon: string; dados: Bar[]; total: number; larguraNome?: number }) {
  const max = Math.max(1, ...dados.map((d) => d.n))
  return (
    <div className="rel-card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 12 }}><i className={`ti ${icon}`} /> {title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dados.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sem dados no período.</div>}
        {dados.map((d) => {
          const pct = total ? Math.round((d.n / total) * 100) : 0
          return (
            <div key={d.nome} style={{ display: 'grid', gridTemplateColumns: `${larguraNome}px 1fr 74px`, alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5 }}>{d.nome}</span>
              <div style={{ background: 'var(--line)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${(d.n / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,var(--brand-400),var(--brand-600))' }} />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{d.n} <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>({pct}%)</span></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
