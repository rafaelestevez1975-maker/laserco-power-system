'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submeterProva } from '@/app/(app)/universidade/actions'
import { UNI_NOTA_MIN, type Questao } from '@/lib/marketing'
import type { Trilha, ProgressoUsuario } from './tipos'

/**
 * Visão do ALUNO (rota /universidade): trilhas por cargo, player Bunny, provas por etapa
 * e prova final que libera o certificado. Sem YouTube — o player usa só `bunnyEmbed`.
 */

type QuizCtx = { trilha: Trilha; etapaId: string; etapaKey: string; nome: string; prova: Questao[] } | null

export function AlunoTrilhas(props: { trilhas: Trilha[]; meuProgresso: ProgressoUsuario; migrationPendente: boolean }) {
  const { trilhas, meuProgresso, migrationPendente } = props
  const router = useRouter()
  const [trAberta, setTrAberta] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<QuizCtx>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(''), 4000) }
  const doneCount = (tr: Trilha) => tr.etapas.filter((e) => meuProgresso[`${tr.id}:${e.ordem}`]?.concluido).length
  const aberta = trAberta ? trilhas.find((t) => t.id === trAberta) ?? null : null

  return (
    <>
      {migrationPendente && (
        <div className="rel-legend" style={{ background: 'var(--amber-bg, #FFF7E6)', border: '1px solid var(--amber)', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Aplique a migration <b>scripts/migrations/marketing.sql</b> no lkii para ativar a Universidade Corporativa (trilhas, provas e notas).
        </div>
      )}

      {msg && <div className="rel-legend" style={{ marginBottom: 10 }}><i className="ti ti-info-circle" /> {msg}</div>}

      {trilhas.length === 0 && !migrationPendente && (
        <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 34 }}>
          <i className="ti ti-school" style={{ fontSize: 28 }} /><p style={{ marginTop: 8 }}>Nenhuma trilha cadastrada ainda.</p>
        </div>
      )}

      {aberta ? (
        <TrilhaDetalhe
          tr={aberta}
          meuProgresso={meuProgresso}
          doneCount={doneCount}
          onVoltar={() => setTrAberta(null)}
          onProva={(etapaId, etapaKey, nome, prova) => setQuiz({ trilha: aberta, etapaId, etapaKey, nome, prova })}
        />
      ) : trilhas.length > 0 && (
        <>
          <div className="rel-legend">Cada cargo tem a sua <b>trilha de vídeos</b> (hospedados no <b>Bunny</b>). Ao final de cada etapa há uma <b>prova escrita</b>, e uma <b>prova final</b> libera o certificado. <b>Só com o curso online concluído</b> o colaborador evolui no treinamento presencial.</div>
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
                      <span><i className="ti ti-writing" /> {tr.etapas.length + (tr.final ? 1 : 0)} provas</span>
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
      )}

      {quiz && (
        <QuizModal
          ctx={quiz}
          onClose={() => setQuiz(null)}
          busy={busy}
          onSubmit={async (respostas) => {
            setBusy(true)
            const r = await submeterProva({ trilhaId: quiz.trilha.id, etapaId: quiz.etapaId, etapaKey: quiz.etapaKey, respostas })
            setBusy(false)
            setQuiz(null)
            if (!r.ok) { flash(r.error || 'Erro ao enviar prova.'); return }
            if (r.aprovado) flash(`Aprovado! Nota ${r.nota?.toFixed(1)}.`)
            else flash(`Nota ${r.nota?.toFixed(1)} abaixo de ${UNI_NOTA_MIN.toFixed(1).replace('.', ',')}, refaça a prova.`)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

// ───────────────────────────── Detalhe da trilha ─────────────────────────────

function VideoBox({ embed, titulo, small }: { embed: string | null; titulo: string; small?: boolean }) {
  const w = small ? 160 : 220, h = small ? 90 : 124
  if (embed) {
    return (
      <iframe
        src={embed}
        title={titulo}
        loading="lazy"
        onClick={(ev) => ev.stopPropagation()}
        allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
        allowFullScreen
        style={{ width: w, height: h, borderRadius: 8, background: '#000', border: 0, flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{ width: w, height: h, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-3)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 11, textAlign: 'center' }}>
      <span><i className="ti ti-video-off" style={{ fontSize: 18 }} /><br />Vídeo em breve</span>
    </div>
  )
}

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
          <div key={e.id} className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: done ? 'var(--green)' : 'var(--surface-2)', color: done ? '#fff' : 'var(--text-2)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
              {done ? <i className="ti ti-check" /> : i + 1}
            </div>
            <VideoBox embed={e.bunnyEmbed} titulo={e.nome} small />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.nome}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{done ? `Concluído · nota ${p?.nota ?? ''}` : `Assista (${e.min} min) e faça a prova da etapa`}</div>
            </div>
            <button className={`btn ${done ? 'btn-ghost' : 'btn-primary'}`} style={{ padding: '8px 12px' }} onClick={() => onProva(e.id, String(e.ordem), `Prova · etapa ${i + 1} · ${tr.nome}`, e.prova)}>
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
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Prova final · {tr.nome}</div>
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
  const semQuestoes = ctx.prova.length === 0

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rel-card" style={{ width: 'min(640px,100%)', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-writing" /> {ctx.nome}</span>
          <i className="ti ti-x" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        <div style={{ marginTop: 10 }}>
          {semQuestoes ? (
            <div className="rel-legend" style={{ marginBottom: 10 }}>Esta prova ainda não tem questões cadastradas.</div>
          ) : ctx.prova.map((q, qi) => (
            <div key={qi} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>{qi + 1}. {q.q}</div>
              {q.opts.map((o, oi) => (
                <label key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name={`uq${qi}`} checked={resp[qi] === oi} onChange={() => setResp((r) => r.map((v, i) => (i === qi ? oi : v)))} /> {o}
                </label>
              ))}
            </div>
          ))}
          {!semQuestoes && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>Nota mínima para aprovação: {UNI_NOTA_MIN.toFixed(1).replace('.', ',')}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Fechar</button>
            <button className="btn btn-primary" onClick={() => onSubmit(resp)} disabled={busy || semQuestoes || resp.some((v) => v < 0)}><i className="ti ti-send" /> {busy ? 'Enviando…' : 'Enviar prova'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
