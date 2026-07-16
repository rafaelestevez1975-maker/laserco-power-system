'use client'

import { useState } from 'react'
import type { AlunoRow } from './tipos'

/**
 * Alunos & Notas (rota /universidade/alunos): quem assistiu, progresso, notas, prazo e status.
 * Alunos com curso concluído podem ter o certificado gerado (HTML/PDF).
 */

function notaPill(n: number) {
  const cor = n >= 9 ? 'var(--green)' : n >= 7 ? 'var(--amber)' : 'var(--red)'
  return <span className="wa-pill" style={{ background: 'var(--surface-2)', color: cor, fontWeight: 700 }}>{n.toFixed(1)}</span>
}

export function AlunosNotas({ alunos }: { alunos: AlunoRow[] }) {
  const [msg, setMsg] = useState('')
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000) }

  const concl = alunos.filter((a) => a.status === 'Concluído').length
  const curso = alunos.filter((a) => a.status === 'Em curso').length
  const atras = alunos.filter((a) => a.prazo === 'Atrasado').length
  const kpis: [string, string, string][] = [
    ['Alunos', String(alunos.length), 'ti-users'],
    ['Concluíram', String(concl), 'ti-certificate'],
    ['Em curso', String(curso), 'ti-player-play'],
    ['Atrasados', String(atras), 'ti-clock'],
  ]
  return (
    <>
      <div className="rel-legend">Painel geral de alunos: <b>quem assistiu</b>, progresso, <b>notas das provas</b>, prazo e status. Alunos com curso <b>concluído</b> podem ter o <b>certificado</b> gerado (HTML/PDF).</div>
      {msg && <div className="rel-legend" style={{ margin: '10px 0' }}><i className="ti ti-info-circle" /> {msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, margin: '12px 0 16px' }}>
        {kpis.map(([l, v, ic]) => (
          <div key={l} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className={`ti ${ic}`} style={{ fontSize: 18, color: 'var(--brand-500)' }} />
            <span><span style={{ display: 'block', fontSize: 11, color: 'var(--text-2)' }}>{l}</span><b style={{ fontSize: 18 }}>{v}</b></span>
          </div>
        ))}
      </div>
      {alunos.length === 0 ? (
        <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 30 }}>Ainda não há progresso de alunos registrado.</div>
      ) : (
        <div className="cli-card"><div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Colaborador</th><th>Cargo</th><th>Trilha</th><th>Progresso</th><th>Nota</th><th>Prazo</th><th>Status</th><th>Certificado</th></tr></thead>
            <tbody>
              {alunos.map((a, i) => (
                <tr key={a.perfilId + a.trilhaId + i}>
                  <td><span className="cli-name">{a.nome}</span></td>
                  <td>{a.cargo}</td>
                  <td>{a.trilhaNome}</td>
                  <td style={{ minWidth: 120 }}>
                    <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${a.prog}%`, background: 'var(--brand-500)' }} /></div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 2 }}>{a.prog}%</div>
                  </td>
                  <td>{a.nota ? notaPill(a.nota) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td>{a.prazo === 'Atrasado' ? <span className="wa-pill" style={{ background: 'var(--red-bg, #FDECEC)', color: 'var(--red)' }}>Atrasado</span> : <span className="wa-pill ok">No prazo</span>}</td>
                  <td>{a.status === 'Concluído' ? <span className="wa-pill done">Concluído</span> : <span className="wa-pill run">Em curso</span>}</td>
                  <td>{a.status === 'Concluído' ? <span className="os-link" onClick={() => gerarCertificado(a, flash)}><i className="ti ti-certificate" /> Gerar certificado</span> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </>
  )
}

// ───────────────────────────── Certificado (uniCert 5999) ─────────────────────────────

function gerarCertificado(a: AlunoRow, flash: (t: string) => void) {
  const cod = 'LC-' + new Date().getFullYear() + '-' + String(1000 + Math.abs(hash(a.perfilId + a.trilhaId)) % 9000).slice(0, 4)
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado · ${a.nome} · Laser&Co</title>
  <style>*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',Arial,sans-serif;color:#241b33}
  .cert{width:1040px;max-width:100%;margin:24px auto;background:#fff;border:14px solid #6A1B9A;border-radius:8px;padding:54px 64px;position:relative;text-align:center}
  .cert::after{content:'';position:absolute;inset:14px;border:2px solid #C9A227;border-radius:4px;pointer-events:none}
  .lg{font-size:34px;font-weight:800;color:#6A1B9A;letter-spacing:.5px}.lg span{color:#C9A227}
  h1{font-size:30px;margin:26px 0 6px;letter-spacing:3px;color:#3a2b53}
  .sub{font-size:14px;color:#777;letter-spacing:2px;text-transform:uppercase}
  .nome{font-size:36px;font-weight:800;margin:26px 0 6px;color:#1c1430}
  .txt{font-size:16px;color:#444;line-height:1.7;max-width:720px;margin:10px auto}
  .trilha{font-weight:700;color:#6A1B9A}
  .meta{display:flex;justify-content:center;gap:46px;margin:30px 0 8px;font-size:13px;color:#555}
  .meta b{display:block;font-size:18px;color:#1c1430}
  .sigs{display:flex;justify-content:space-around;margin-top:50px}
  .sig{width:280px;border-top:1.5px solid #999;padding-top:8px;font-size:13px;color:#555}
  .cod{position:absolute;bottom:22px;right:30px;font-size:11px;color:#999}
  @media print{body{margin:0}.cert{border-width:14px;margin:0}.noprint{display:none}}</style></head><body>
  <div class="cert">
    <div class="lg">Laser<span>&amp;Co</span> · Universidade Corporativa</div>
    <h1>CERTIFICADO</h1><div class="sub">de conclusão de curso</div>
    <div class="txt" style="margin-top:24px">Certificamos que</div>
    <div class="nome">${a.nome}</div>
    <div class="txt">concluiu com aproveitamento a trilha <span class="trilha">${a.trilhaNome}</span> da Universidade Corporativa Laser&amp;Co, cumprindo todas as etapas, vídeos e avaliações exigidas.</div>
    <div class="meta"><div>Cargo<b>${a.cargo}</b></div><div>Nota final<b>${(a.nota || 0).toFixed(1)}</b></div><div>Conclusão<b>${new Date().toLocaleDateString('pt-BR')}</b></div></div>
    <div class="sigs"><div class="sig">Coordenação · Universidade Laser&amp;Co</div><div class="sig">Diretoria</div></div>
    <div class="cod">Código de validação: ${cod}</div>
  </div>
  <div class="noprint" style="text-align:center;margin:16px"><button onclick="window.print()" style="background:#6A1B9A;color:#fff;border:0;padding:11px 24px;border-radius:8px;font-size:14px;cursor:pointer">Imprimir / Salvar como PDF</button></div>
  </body></html>`
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const aa = document.createElement('a')
    aa.href = url; aa.download = 'certificado-' + a.nome.toLowerCase().replace(/[^a-z]+/g, '-') + '.html'
    document.body.appendChild(aa); aa.click(); aa.remove(); URL.revokeObjectURL(url)
  } catch { /* ignore */ }
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
  flash(`Certificado gerado para ${a.nome}.`)
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return h
}
