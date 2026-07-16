import type { AlunoRow, Trilha } from './tipos'

/**
 * Dashboards da Universidade (rota /universidade/dashboards): KPIs + barras.
 * Componente puro de renderização (sem hooks) — pode rodar como server component.
 */

function bar(rows: [string, number, string?][], max: number) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(([label, val, disp], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 130, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'var(--surface-2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${max ? Math.round((val / max) * 100) : 0}%`, background: 'var(--brand-500)' }} /></span>
          <span style={{ width: 40, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{disp ?? val}</span>
        </div>
      ))}
    </div>
  )
}

export function UniDashboards({ alunos, trilhas }: { alunos: AlunoRow[]; trilhas: Trilha[] }) {
  const comNota = alunos.filter((a) => a.nota > 0)
  const notaMediaGeral = comNota.length ? (comNota.reduce((s, a) => s + a.nota, 0) / comNota.length) : 0
  const concl = alunos.filter((a) => a.status === 'Concluído').length
  const taxaConcl = alunos.length ? Math.round((concl / alunos.length) * 100) : 0
  const porTrilha: [string, number, string][] = trilhas.map((t) => {
    const al = alunos.filter((a) => a.trilhaId === t.id && a.nota > 0)
    const m = al.length ? al.reduce((s, a) => s + a.nota, 0) / al.length : 0
    return [t.role, Math.round(m * 10) / 10, m.toFixed(1)] as [string, number, string]
  }).filter((x) => x[1] > 0)
  const rank: [string, number, string][] = [...comNota].sort((a, b) => b.nota - a.nota).slice(0, 8).map((a) => [a.nome, a.nota, a.nota.toFixed(1)])
  const maxTr = Math.max(10, ...porTrilha.map((x) => x[1]))
  const maxRk = Math.max(10, ...rank.map((x) => x[1]))
  const emCurso = alunos.filter((a) => a.status === 'Em curso').length

  const kpis: [string, string, string][] = [
    ['Nota média geral', notaMediaGeral.toFixed(1), 'ti-star'],
    ['Taxa de conclusão', `${taxaConcl}%`, 'ti-percentage'],
    ['Trilhas ativas', String(trilhas.length), 'ti-school'],
    ['Certificados emitidos', String(concl), 'ti-certificate'],
  ]
  return (
    <>
      <div className="rel-legend">Indicadores da Universidade: <b>nota média</b>, <b>taxa de conclusão</b>, desempenho por trilha e ranking de alunos.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, margin: '12px 0 16px' }}>
        {kpis.map(([l, v, ic]) => (
          <div key={l} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className={`ti ${ic}`} style={{ fontSize: 18, color: 'var(--brand-500)' }} />
            <span><span style={{ display: 'block', fontSize: 11, color: 'var(--text-2)' }}>{l}</span><b style={{ fontSize: 18 }}>{v}</b></span>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <div className="rel-card"><div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-chart-bar" /> Nota média por trilha</span></div><div style={{ marginTop: 12 }}>{porTrilha.length ? bar(porTrilha, maxTr) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Sem dados.</span>}</div></div>
        <div className="rel-card"><div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-trophy" /> Ranking de alunos (nota)</span></div><div style={{ marginTop: 12 }}>{rank.length ? bar(rank, maxRk) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Sem dados.</span>}</div></div>
        <div className="rel-card"><div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-chart-pie" /> Conclusão por status</span></div><div style={{ marginTop: 12 }}>{bar([['Concluído', concl, String(concl)], ['Em curso', emCurso, String(emCurso)]], Math.max(1, alunos.length))}</div></div>
      </div>
    </>
  )
}
