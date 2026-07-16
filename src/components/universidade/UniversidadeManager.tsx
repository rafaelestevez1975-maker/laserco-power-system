'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  submeterProva, criarTrilha, salvarTrilha, excluirTrilha,
  adicionarEtapa, salvarEtapa, excluirEtapa,
  iniciarUploadVideoTus, removerVideoEtapa,
} from '@/app/(app)/universidade/actions'
import { ytUrl, UNI_NOTA_MIN, type Questao } from '@/lib/marketing'

// ── Tipos vindos de uni_trilhas / uni_etapas / uni_progresso ──
// bunny_guid: id do vídeo no Bunny Stream (null = usa o YouTube via yt).
// bunnyEmbed: URL do player iframe já resolvida no servidor (não expõe a AccessKey).
export type Etapa = { id: string; ordem: number; nome: string; yt: string | null; bunny_guid: string | null; bunnyEmbed: string | null; min: number; prova: Questao[] }
export type ProvaFinal = { id: string; nome: string; prova: Questao[] }
export type Trilha = { id: string; slug: string; nome: string; role: string; cor: string; prazo: string; etapas: Etapa[]; final: ProvaFinal | null }
export type ProgressoUsuario = Record<string, { concluido: boolean; nota: number | null }> // key 'trilhaId:etapaKey'
export type AlunoRow = { perfilId: string; nome: string; cargo: string; trilhaId: string; trilhaNome: string; prog: number; nota: number; prazo: string; status: string }

type Props = {
  /** true p/ admin_geral OU quem tem o cargo "Admin Universidade" (recurso treinamento.curso). */
  podeGerir: boolean
  migrationPendente: boolean
  trilhas: Trilha[]
  meuProgresso: ProgressoUsuario
  alunos: AlunoRow[]
  abaInicial?: 'trilhas' | 'alunos' | 'dash' | 'gerenciar'
}

type Tab = 'trilhas' | 'alunos' | 'dash' | 'gerenciar'
type QuizCtx = { trilha: Trilha; etapaId: string; etapaKey: string; nome: string; prova: Questao[] } | null

const TABS: [Tab, string, string][] = [
  ['trilhas', 'Trilhas', 'ti-school'],
  ['alunos', 'Alunos & Notas', 'ti-users'],
  ['dash', 'Dashboards', 'ti-chart-bar'],
  ['gerenciar', 'Gerenciar', 'ti-settings'],
]

export function UniversidadeManager(props: Props) {
  const { podeGerir, migrationPendente, trilhas, meuProgresso, alunos, abaInicial } = props
  const router = useRouter()
  // A aba inicial vem dos sub-itens do menu lateral (/universidade?aba=…). Só admin/gestor abre "Gerenciar".
  const [tab, setTab] = useState<Tab>(abaInicial && (abaInicial !== 'gerenciar' || podeGerir) ? abaInicial : 'trilhas')
  const [trAberta, setTrAberta] = useState<string | null>(null) // detalhe de trilha
  const [quiz, setQuiz] = useState<QuizCtx>(null)
  const [editTr, setEditTr] = useState<string | null>(null) // editor (gerenciar)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(''), 4000) }
  const doneCount = (tr: Trilha) => tr.etapas.filter((e) => meuProgresso[`${tr.id}:${e.ordem}`]?.concluido).length

  return (
    <>
      {migrationPendente && (
        <div className="rel-legend" style={{ background: 'var(--amber-bg, #FFF7E6)', border: '1px solid var(--amber)', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Aplique a migration <b>scripts/migrations/marketing.sql</b> no lkii para ativar a Universidade Corporativa (trilhas, provas e notas).
        </div>
      )}

      {/* Abas */}
      <div id="uniTabsN" className="rel-tabs" style={{ marginBottom: 14, display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        {TABS.map(([k, label, ic]) => (
          <button key={k} onClick={() => { setTab(k); setTrAberta(null); setEditTr(null) }} className="btn" style={{
            border: 'none', borderBottom: tab === k ? '2px solid var(--brand-500)' : '2px solid transparent',
            borderRadius: 0, background: 'none', color: tab === k ? 'var(--brand-500)' : 'var(--text-2)', fontWeight: tab === k ? 700 : 500,
          }}><i className={`ti ${ic}`} /> {label}</button>
        ))}
      </div>

      {msg && <div className="rel-legend" style={{ marginBottom: 10 }}><i className="ti ti-info-circle" /> {msg}</div>}

      {trilhas.length === 0 && !migrationPendente && (
        <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 34 }}>
          <i className="ti ti-school" style={{ fontSize: 28 }} /><p style={{ marginTop: 8 }}>Nenhuma trilha cadastrada. {podeGerir ? 'Crie a primeira na aba Gerenciar.' : ''}</p>
        </div>
      )}

      {/* ─── TRILHAS ─── */}
      {tab === 'trilhas' && (trAberta ? (
        <TrilhaDetalhe
          tr={trilhas.find((t) => t.id === trAberta)!}
          meuProgresso={meuProgresso}
          doneCount={doneCount}
          onVoltar={() => setTrAberta(null)}
          onProva={(etapaId, etapaKey, nome, prova) => setQuiz({ trilha: trilhas.find((t) => t.id === trAberta)!, etapaId, etapaKey, nome, prova })}
        />
      ) : (
        <>
          <div className="rel-legend">Cada cargo tem a sua <b>trilha de vídeos</b> (links não listados do YouTube, sem custo). Ao final de cada etapa há uma <b>prova escrita</b>, e uma <b>prova final</b> libera o certificado. <b>Só com o curso online concluído</b> o colaborador evolui no treinamento presencial.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14, marginTop: 14 }}>
            {trilhas.map((tr) => {
              const dn = doneCount(tr), pc = tr.etapas.length ? Math.round((dn / tr.etapas.length) * 100) : 0
              return (
                <div key={tr.id} onClick={() => setTrAberta(tr.id)} style={{ cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
                  <div style={{ background: `linear-gradient(135deg, ${tr.cor}, ${tr.cor}cc)`, color: '#fff', padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', opacity: 0.9 }}>{tr.role}</div>
                    <h4 style={{ fontSize: 16, marginTop: 4 }}>{tr.nome}</h4>
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--text-2)', flexWrap: 'wrap' }}>
                      <span><i className="ti ti-player-play" /> <b>{tr.etapas.length}</b> vídeos</span>
                      <span><i className="ti ti-writing" /> {tr.etapas.length + 1} provas</span>
                      <span><i className="ti ti-clock" /> {tr.prazo}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'var(--surface-2)', marginTop: 10, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${pc}%`, background: tr.cor }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>{dn}/{tr.etapas.length} etapas · {pc}%</div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ))}

      {/* ─── ALUNOS & NOTAS ─── */}
      {tab === 'alunos' && <AlunosNotas alunos={alunos} onCertificado={(a) => gerarCertificado(a, flash)} />}

      {/* ─── DASHBOARDS ─── */}
      {tab === 'dash' && <Dashboards alunos={alunos} trilhas={trilhas} />}

      {/* ─── GERENCIAR ─── */}
      {tab === 'gerenciar' && (
        !podeGerir ? (
          <div className="rel-legend"><i className="ti ti-shield-lock" /> A gestão de trilhas, vídeos e provas é restrita a <b>administradores</b> e ao <b>Admin Universidade</b>.</div>
        ) : editTr ? (
          <GerenciarEditor tr={trilhas.find((t) => t.id === editTr)!} onVoltar={() => { setEditTr(null); router.refresh() }} setBusy={setBusy} flash={flash} busy={busy} />
        ) : (
          <Gerenciar trilhas={trilhas} onEditar={setEditTr} onNova={async () => {
            setBusy(true); const r = await criarTrilha({ nome: 'Nova trilha', role: 'Novo cargo', prazo: '30 dias' }); setBusy(false)
            if (!r.ok) flash(r.error || 'Erro.'); else { if (r.id) setEditTr(r.id); router.refresh() }
          }} onExcluir={async (id, nome) => {
            if (!window.confirm(`Excluir a trilha "${nome}"?`)) return
            setBusy(true); const r = await excluirTrilha(id); setBusy(false)
            if (!r.ok) flash(r.error || 'Erro.'); else router.refresh()
          }} busy={busy} />
        )
      )}

      {/* Modal de prova */}
      {quiz && (
        <QuizModal
          ctx={quiz}
          onClose={() => setQuiz(null)}
          onSubmit={async (respostas) => {
            setBusy(true)
            const r = await submeterProva({ trilhaId: quiz.trilha.id, etapaId: quiz.etapaId, etapaKey: quiz.etapaKey, respostas })
            setBusy(false)
            setQuiz(null)
            if (!r.ok) { flash(r.error || 'Erro ao enviar prova.'); return }
            if (r.aprovado) flash(`Aprovado! Nota ${r.nota?.toFixed(1)}.`)
            else flash(`Nota ${r.nota?.toFixed(1)}  abaixo de ${UNI_NOTA_MIN.toFixed(1).replace('.', ',')}, refaça a prova.`)
            router.refresh()
          }}
          busy={busy}
        />
      )}
    </>
  )
}

// ───────────────────────────── Detalhe da trilha ─────────────────────────────

function TrilhaDetalhe(props: {
  tr: Trilha; meuProgresso: ProgressoUsuario; doneCount: (tr: Trilha) => number
  onVoltar: () => void; onProva: (etapaId: string, etapaKey: string, nome: string, prova: Questao[]) => void
}) {
  const { tr, meuProgresso, doneCount, onVoltar, onProva } = props
  const dn = doneCount(tr), pc = tr.etapas.length ? Math.round((dn / tr.etapas.length) * 100) : 0
  const allDone = tr.etapas.length > 0 && dn === tr.etapas.length
  const finalDone = meuProgresso[`${tr.id}:final`]?.concluido

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <span className="os-link" onClick={onVoltar}><i className="ti ti-arrow-left" /> Voltar às trilhas</span>
      </div>
      <div className="rel-card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16, background: `linear-gradient(135deg, ${tr.cor}15, transparent)` }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: tr.cor, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22 }}><i className="ti ti-school" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: tr.cor }}>{tr.role}</div>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{tr.nome}</h3>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Prazo para concluir: <b>{tr.prazo}</b> · progresso {pc}%</div>
        </div>
      </div>

      {tr.etapas.map((e, i) => {
        const p = meuProgresso[`${tr.id}:${e.ordem}`]
        const done = !!p?.concluido
        return (
          <div key={e.id} className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, opacity: 1 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: done ? 'var(--green)' : 'var(--surface-2)', color: done ? '#fff' : 'var(--text-2)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
              {done ? <i className="ti ti-check" /> : i + 1}
            </div>
            {e.bunnyEmbed ? (
              <iframe
                src={e.bunnyEmbed}
                title={e.nome}
                loading="lazy"
                onClick={(ev) => ev.stopPropagation()}
                allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
                allowFullScreen
                style={{ width: 160, height: 90, borderRadius: 8, background: '#000', border: 0, flexShrink: 0 }}
              />
            ) : (
              <a href={ytUrl(e.yt)} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} style={{ width: 96, height: 56, borderRadius: 8, background: '#000', color: '#fff', display: 'grid', placeItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
                <span style={{ textAlign: 'center' }}><i className="ti ti-brand-youtube" style={{ fontSize: 18, color: '#ff0000' }} /><br /><span style={{ fontSize: 9 }}>YouTube · {e.min} min</span></span>
              </a>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.nome}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{done ? `Concluído · nota ${p?.nota ?? ''}` : 'Assista e faça a prova da etapa'}</div>
            </div>
            <button className={`btn ${done ? 'btn-ghost' : 'btn-primary'}`} style={{ padding: '8px 12px' }} onClick={() => onProva(e.id, String(e.ordem), `Prova  etapa ${i + 1} · ${tr.nome}`, e.prova)}>
              <i className="ti ti-writing" /> {done ? 'Refazer' : 'Prova'}
            </button>
          </div>
        )
      })}

      {!allDone && (
        <div className="rel-legend" style={{ background: 'var(--amber-bg, #FFF7E6)', border: '1px solid var(--amber)', marginBottom: 10 }}>
          <i className="ti ti-lock" /> Conclua todas as etapas para liberar a <b>prova final</b>.
        </div>
      )}

      {tr.final && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: allDone ? 1 : 0.55 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: finalDone ? 'var(--gold-600, var(--amber))' : 'var(--surface-2)', color: finalDone ? '#fff' : 'var(--text-2)', display: 'grid', placeItems: 'center' }}><i className="ti ti-certificate" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Prova final  {tr.nome}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{finalDone ? `Aprovado · nota ${meuProgresso[`${tr.id}:final`]?.nota ?? ''} · curso concluído ✅ libera presencial` : 'Avaliação final do conteúdo'}</div>
          </div>
          <button className={`btn ${allDone ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '8px 12px' }} disabled={!allDone} onClick={() => tr.final && onProva(tr.final.id, 'final', `Prova final · ${tr.nome}`, tr.final.prova)}>
            <i className="ti ti-certificate" /> Prova final
          </button>
        </div>
      )}
    </>
  )
}

// ───────────────────────────── Modal de prova ─────────────────────────────

function QuizModal(props: { ctx: NonNullable<QuizCtx>; onClose: () => void; onSubmit: (respostas: number[]) => void; busy: boolean }) {
  const { ctx, onClose, onSubmit, busy } = props
  const [resp, setResp] = useState<number[]>(() => ctx.prova.map(() => -1))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rel-card" style={{ width: 'min(640px,100%)', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-writing" /> {ctx.nome}</span>
          <i className="ti ti-x" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        <div style={{ marginTop: 10 }}>
          {ctx.prova.map((q, qi) => (
            <div key={qi} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{qi + 1}. {q.q}</div>
              {q.opts.map((o, oi) => (
                <label key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name={`uq${qi}`} checked={resp[qi] === oi} onChange={() => setResp((r) => r.map((v, i) => (i === qi ? oi : v)))} /> {o}
                </label>
              ))}
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>Nota mínima para aprovação: {UNI_NOTA_MIN.toFixed(1).replace('.', ',')}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Fechar</button>
            <button className="btn btn-primary" onClick={() => onSubmit(resp)} disabled={busy || resp.some((v) => v < 0)}><i className="ti ti-send" /> {busy ? 'Enviando…' : 'Enviar prova'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────── Alunos & Notas ─────────────────────────────

function notaPill(n: number) {
  const cor = n >= 9 ? 'var(--green)' : n >= 7 ? 'var(--amber)' : 'var(--red)'
  return <span className="wa-pill" style={{ background: 'var(--surface-2)', color: cor, fontWeight: 700 }}>{n.toFixed(1)}</span>
}

function AlunosNotas(props: { alunos: AlunoRow[]; onCertificado: (a: AlunoRow) => void }) {
  const { alunos, onCertificado } = props
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '12px 0 16px' }}>
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
                  <td>{a.nota ? notaPill(a.nota) : <span style={{ color: 'var(--text-3)' }}></span>}</td>
                  <td>{a.prazo === 'Atrasado' ? <span className="wa-pill" style={{ background: 'var(--red-bg, #FDECEC)', color: 'var(--red)' }}>Atrasado</span> : <span className="wa-pill ok">No prazo</span>}</td>
                  <td>{a.status === 'Concluído' ? <span className="wa-pill done">Concluído</span> : <span className="wa-pill run">Em curso</span>}</td>
                  <td>{a.status === 'Concluído' ? <span className="os-link" onClick={() => onCertificado(a)}><i className="ti ti-certificate" /> Gerar certificado</span> : <span style={{ color: 'var(--text-3)' }}></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </>
  )
}

// ───────────────────────────── Dashboards ─────────────────────────────

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

function Dashboards(props: { alunos: AlunoRow[]; trilhas: Trilha[] }) {
  const { alunos, trilhas } = props
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

  const kpis: [string, string, string][] = [
    ['Nota média geral', notaMediaGeral.toFixed(1), 'ti-star'],
    ['Taxa de conclusão', `${taxaConcl}%`, 'ti-percentage'],
    ['Trilhas ativas', String(trilhas.length), 'ti-school'],
    ['Certificados emitidos', String(concl), 'ti-certificate'],
  ]
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
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
        <div className="rel-card"><div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-chart-pie" /> Conclusão por status</span></div><div style={{ marginTop: 12 }}>{bar([['Concluído', concl, String(concl)], ['Em curso', alunos.filter((a) => a.status === 'Em curso').length, String(alunos.filter((a) => a.status === 'Em curso').length)]], Math.max(1, alunos.length))}</div></div>
      </div>
    </>
  )
}

// ───────────────────────────── Gerenciar (lista + editor) ─────────────────────────────

function Gerenciar(props: { trilhas: Trilha[]; onEditar: (id: string) => void; onNova: () => void; onExcluir: (id: string, nome: string) => void; busy: boolean }) {
  const { trilhas, onEditar, onNova, onExcluir, busy } = props
  return (
    <>
      <div className="rel-legend">Crie e edite as <b>trilhas por cargo</b>, adicione/edite <b>vídeos</b> (cole o link não listado do YouTube), monte as <b>provas</b> e defina o <b>prazo</b>. As mudanças refletem na hora na aba Trilhas.</div>
      <div className="rel-acts" style={{ justifyContent: 'flex-end', margin: '6px 0 14px' }}>
        <button className="btn btn-primary" onClick={onNova} disabled={busy}><i className="ti ti-plus" /> Nova trilha</button>
      </div>
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text-2)' }}>
          <i className="ti ti-brand-youtube" style={{ color: '#c4302b', fontSize: 18 }} />
          <span>No YouTube, suba o vídeo como <b>&quot;Não listado&quot;</b> (unlisted)  não aparece em buscas e é <b>gratuito</b>. Cole o link/ID aqui na etapa.</span>
        </div>
      </div>
      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Trilha</th><th>Cargo</th><th className="num-r">Etapas</th><th>Prazo</th><th>Ações</th></tr></thead>
          <tbody>
            {trilhas.map((tr) => (
              <tr key={tr.id}>
                <td><span className="cli-name">{tr.nome}</span></td>
                <td>{tr.role}</td>
                <td className="num-r">{tr.etapas.length}</td>
                <td>{tr.prazo}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span className="os-link" onClick={() => onEditar(tr.id)}><i className="ti ti-edit" /> Editar vídeos/provas</span>
                  {' · '}<span className="os-link" style={{ color: 'var(--red)' }} onClick={() => onExcluir(tr.id, tr.nome)}><i className="ti ti-trash" /></span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  )
}

const inp: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 7, padding: '7px 9px', fontSize: 13, fontFamily: 'inherit', width: '100%' }

function GerenciarEditor(props: { tr: Trilha; onVoltar: () => void; setBusy: (b: boolean) => void; flash: (t: string) => void; busy: boolean }) {
  const { tr, onVoltar, setBusy, flash, busy } = props
  const router = useRouter()
  const [nome, setNome] = useState(tr.nome)
  const [role, setRole] = useState(tr.role)
  const [prazo, setPrazo] = useState(tr.prazo)

  async function salvarDados() {
    setBusy(true); const r = await salvarTrilha(tr.id, { nome, role, prazo }); setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else { flash('Trilha atualizada.'); router.refresh() }
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}><span className="os-link" onClick={onVoltar}><i className="ti ti-arrow-left" /> Voltar</span></div>
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}><span>Dados da trilha</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 10 }}>
          <label style={{ fontSize: 12 }}>Nome<input style={inp} value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarDados} /></label>
          <label style={{ fontSize: 12 }}>Cargo<input style={inp} value={role} onChange={(e) => setRole(e.target.value)} onBlur={salvarDados} /></label>
          <label style={{ fontSize: 12 }}>Prazo<input style={inp} value={prazo} onChange={(e) => setPrazo(e.target.value)} onBlur={salvarDados} /></label>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0 10px' }}>Vídeos / etapas</div>
      {tr.etapas.map((e) => <EtapaEditor key={e.id} etapa={e} setBusy={setBusy} flash={flash} busy={busy} />)}

      <button className="btn btn-ghost" style={{ marginTop: 6 }} disabled={busy} onClick={async () => {
        setBusy(true); const r = await adicionarEtapa(tr.id); setBusy(false)
        if (!r.ok) flash(r.error || 'Erro.'); else router.refresh()
      }}><i className="ti ti-plus" /> Adicionar vídeo/etapa</button>
    </>
  )
}

function EtapaEditor(props: { etapa: Etapa; setBusy: (b: boolean) => void; flash: (t: string) => void; busy: boolean }) {
  const { etapa, setBusy, flash, busy } = props
  const router = useRouter()
  const [nome, setNome] = useState(etapa.nome)
  const [yt, setYt] = useState(etapa.yt || '')
  const [min, setMin] = useState(etapa.min)
  const q0 = etapa.prova[0]
  const [pergunta, setPergunta] = useState(q0?.q || '')
  const [opcoes, setOpcoes] = useState((q0?.opts || []).join(';'))
  const [edProva, setEdProva] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [prog, setProg] = useState(0)

  // Upload DIRETO do navegador → Bunny (TUS): aguenta vídeo grande de treinamento sem bater no
  // limite de body do servidor. A assinatura vem do servidor (a chave nunca vai pro cliente).
  async function enviarVideo(file: File) {
    setUploading(true); setProg(0)
    try {
      const init = await iniciarUploadVideoTus(etapa.id, nome || etapa.nome || 'Aula')
      if (!init.ok) { flash(init.error || 'Erro ao iniciar o envio.'); setUploading(false); return }
      const { Upload } = await import('tus-js-client')
      await new Promise<void>((resolve, reject) => {
        const up = new Upload(file, {
          endpoint: init.endpoint,
          retryDelays: [0, 2000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: init.signature,
            AuthorizationExpire: String(init.expiration),
            VideoId: init.guid,
            LibraryId: init.libraryId,
          },
          metadata: { filetype: file.type || 'video/mp4', title: nome || etapa.nome || 'Aula' },
          onError: (e) => reject(e),
          onProgress: (sent, total) => setProg(total ? Math.round((sent / total) * 100) : 0),
          onSuccess: () => resolve(),
        })
        up.start()
      })
      flash('Vídeo enviado ✓ (processando no Bunny)')
      router.refresh()
    } catch (err) {
      flash('Falha no envio do vídeo: ' + ((err as Error).message || 'erro'))
    } finally {
      setUploading(false); setProg(0)
    }
  }
  async function removerVideo() {
    if (!window.confirm('Remover o vídeo do Bunny desta etapa?')) return
    setUploading(true)
    const r = await removerVideoEtapa(etapa.id)
    setUploading(false)
    if (!r.ok) flash(r.error || 'Erro.'); else { flash('Vídeo removido.'); router.refresh() }
  }

  async function salvar(extraProva?: Questao[]) {
    setBusy(true)
    const prova = extraProva ?? etapa.prova
    const r = await salvarEtapa({ id: etapa.id, ordem: etapa.ordem, nome, yt, min, prova })
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro.'); else router.refresh()
  }
  async function salvarProva() {
    const arr = opcoes.split(';').map((s) => s.trim()).filter(Boolean)
    if (!pergunta.trim() || arr.length < 2) { flash('Informe a pergunta e ao menos 2 opções (a correta primeiro).'); return }
    await salvar([{ q: pergunta.trim(), opts: arr, c: 0 }])
    setEdProva(false)
  }

  return (
    <div className="rel-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'grid', gap: 7 }}>
        <input style={{ ...inp, fontWeight: 600 }} value={nome} onChange={(e) => setNome(e.target.value)} onBlur={() => salvar()} placeholder="Título da etapa" />
        {/* Vídeo pelo Bunny Stream (prioritário sobre o YouTube). */}
        {etapa.bunny_guid ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--green)', padding: '4px 0' }}>
            <i className="ti ti-circle-check" /> Vídeo enviado (Bunny) ✓
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', color: 'var(--red)', padding: '4px 8px' }} disabled={uploading || busy} onClick={removerVideo}>
              <i className="ti ti-trash" /> {uploading ? 'Removendo…' : 'Remover vídeo'}
            </button>
          </div>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)', flexWrap: 'wrap' }}>
            <i className="ti ti-cloud-upload" /> {uploading ? `Enviando… ${prog}%` : 'Enviar vídeo (Bunny)'}
            <input type="file" accept="video/*" disabled={uploading || busy} style={{ fontSize: 12 }}
              onChange={(ev) => { const f = ev.target.files?.[0]; if (f) enviarVideo(f); ev.target.value = '' }} />
          </label>
        )}
        <div style={{ display: 'flex', gap: 7 }}>
          <input style={{ ...inp, flex: 1, fontSize: 12 }} value={yt} onChange={(e) => setYt(e.target.value)} onBlur={() => salvar()} placeholder="Link ou ID do YouTube (alternativa ao Bunny)" />
          <input style={{ ...inp, width: 70, fontSize: 12 }} type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} onBlur={() => salvar()} title="minutos" /> <span style={{ alignSelf: 'center', fontSize: 12 }}>min</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
          <i className="ti ti-writing" /> {etapa.prova.length} questão(ões) na prova · <span className="os-link" onClick={() => setEdProva((v) => !v)}>editar prova</span>
        </div>
        {edProva && (
          <div style={{ display: 'grid', gap: 6, padding: 8, background: 'var(--surface-2)', borderRadius: 8 }}>
            <input style={inp} value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Pergunta da prova" />
            <input style={inp} value={opcoes} onChange={(e) => setOpcoes(e.target.value)} placeholder="Opções separadas por ; (a correta primeiro)" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="btn btn-ghost" onClick={() => setEdProva(false)} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarProva} disabled={busy}>Salvar prova</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
        <button className="btn btn-ghost" style={{ color: 'var(--red)' }} disabled={busy} title="Excluir etapa" onClick={async () => {
          if (!window.confirm('Excluir esta etapa?')) return
          setBusy(true); const r = await excluirEtapa(etapa.id); setBusy(false)
          if (!r.ok) flash(r.error || 'Erro.'); else router.refresh()
        }}><i className="ti ti-trash" /></button>
      </div>
    </div>
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
