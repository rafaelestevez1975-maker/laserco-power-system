'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  salvarTrilha, adicionarEtapa, salvarEtapa, excluirEtapa,
  iniciarUploadVideoTus, removerVideoEtapa,
} from '@/app/(app)/universidade/actions'
import type { Questao } from '@/lib/marketing'
import type { TrilhaEdit, EtapaEdit } from './tipos'

/**
 * Admin — EDITOR de UMA trilha (rota /universidade/gerenciar/[id]). A trilha é carregada
 * do servidor pela page; aqui só a interatividade.
 *
 * Correções sobre a versão antiga:
 *  - A prova é MULTI-PERGUNTA: o estado local é o ARRAY inteiro de questões e "Salvar prova"
 *    grava o array completo (nunca reduz a 1 pergunta).
 *  - Salvar nome/minutos preserva a prova já gravada (passa etapa.prova), sem resetar nada.
 *  - Vídeo só pelo Bunny (upload TUS direto do navegador). Sem campo de YouTube.
 */

const inp: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 7, padding: '7px 9px', fontSize: 13, fontFamily: 'inherit', width: '100%' }

export function TrilhaEditor({ trilha }: { trilha: TrilhaEdit }) {
  const router = useRouter()
  const [nome, setNome] = useState(trilha.nome)
  const [role, setRole] = useState(trilha.role)
  const [prazo, setPrazo] = useState(trilha.prazo)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 4000) }

  async function salvarDados() {
    setBusy(true)
    const r = await salvarTrilha(trilha.id, { nome, role, prazo, cor: trilha.cor })
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro ao salvar a trilha.')
    else { flash('Trilha salva.'); router.refresh() }
  }

  async function addEtapa() {
    setBusy(true)
    const r = await adicionarEtapa(trilha.id)
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro ao adicionar etapa.')
    else router.refresh()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Link className="os-link" href="/universidade/gerenciar"><i className="ti ti-arrow-left" /> Voltar às trilhas</Link>
      </div>

      {msg && <div className="rel-legend" style={{ marginBottom: 10 }}><i className="ti ti-info-circle" /> {msg}</div>}

      {/* Dados da trilha */}
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-school" /> Dados da trilha</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 10 }}>
          <label style={{ fontSize: 12 }}>Nome<input style={inp} value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarDados} /></label>
          <label style={{ fontSize: 12 }}>Cargo<input style={inp} value={role} onChange={(e) => setRole(e.target.value)} onBlur={salvarDados} /></label>
          <label style={{ fontSize: 12 }}>Prazo<input style={inp} value={prazo} onChange={(e) => setPrazo(e.target.value)} onBlur={salvarDados} /></label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-primary" style={{ padding: '7px 14px' }} disabled={busy} onClick={salvarDados}><i className="ti ti-device-floppy" /> Salvar dados</button>
        </div>
      </div>

      {/* Etapas / vídeos */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '6px 0 10px' }}><i className="ti ti-player-play" /> Vídeos / etapas</div>
      {trilha.etapas.length === 0 && (
        <div className="rel-legend" style={{ marginBottom: 10 }}>Nenhuma etapa ainda. Clique em <b>Adicionar vídeo/etapa</b>.</div>
      )}
      {trilha.etapas.map((e, i) => (
        <EtapaEditorRow key={e.id} etapa={e} indice={i + 1} setBusy={setBusy} flash={flash} busy={busy} />
      ))}
      <button className="btn btn-ghost" style={{ marginTop: 6 }} disabled={busy} onClick={addEtapa}>
        <i className="ti ti-plus" /> Adicionar vídeo/etapa
      </button>

      {/* Prova final */}
      <div style={{ fontSize: 13, fontWeight: 700, margin: '20px 0 10px' }}><i className="ti ti-certificate" /> Prova final</div>
      {trilha.final ? (
        <EtapaEditorRow etapa={trilha.final} isFinal setBusy={setBusy} flash={flash} busy={busy} />
      ) : (
        <div className="rel-legend">Esta trilha ainda não tem prova final.</div>
      )}
    </>
  )
}

// ───────────────────────────── Etapa (vídeo + prova) ─────────────────────────────

function EtapaEditorRow(props: { etapa: EtapaEdit; indice?: number; isFinal?: boolean; setBusy: (b: boolean) => void; flash: (t: string) => void; busy: boolean }) {
  const { etapa, indice, isFinal, setBusy, flash, busy } = props
  const router = useRouter()
  const [nome, setNome] = useState(etapa.nome)
  const [min, setMin] = useState(etapa.min)
  const [uploading, setUploading] = useState(false)
  const [prog, setProg] = useState(0)

  // Salva o array de prova COMPLETO junto com nome/minutos atuais. `prova` sempre explícito:
  //  - blur de nome/minutos → passa a prova JÁ gravada (etapa.prova), preservando as questões;
  //  - "Salvar prova" (ProvaEditor) → passa o array editado inteiro.
  async function persistir(prova: Questao[]): Promise<{ ok: boolean; error?: string }> {
    setBusy(true)
    const r = await salvarEtapa({ id: etapa.id, ordem: etapa.ordem, nome, yt: etapa.yt, min, prova, is_final: etapa.is_final })
    setBusy(false)
    if (r.ok) router.refresh()
    return r
  }

  async function salvarCampos() {
    const r = await persistir(etapa.prova)
    if (!r.ok) flash(r.error || 'Erro ao salvar a etapa.')
  }

  // Upload DIRETO do navegador → Bunny (TUS): aguenta vídeo grande sem bater no limite de body
  // do servidor. A assinatura vem do servidor (a chave nunca vai pro cliente).
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

  async function excluir() {
    if (!window.confirm('Excluir esta etapa (vídeo + prova)?')) return
    setBusy(true)
    const r = await excluirEtapa(etapa.id)
    setBusy(false)
    if (!r.ok) flash(r.error || 'Erro ao excluir.'); else router.refresh()
  }

  return (
    <div className="rel-card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, background: isFinal ? 'var(--amber)' : 'var(--brand-500)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
          {isFinal ? <i className="ti ti-certificate" /> : indice}
        </span>
        <input style={{ ...inp, fontWeight: 600 }} value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvarCampos} placeholder={isFinal ? 'Título da prova final' : 'Título da etapa'} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input style={{ ...inp, width: 66, fontSize: 12 }} type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} onBlur={salvarCampos} title="minutos" />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>min</span>
        </div>
      </div>

      {/* Vídeo (Bunny) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', flexWrap: 'wrap' }}>
        {etapa.bunny_guid ? (
          <>
            {etapa.bunnyEmbed && (
              <iframe
                src={etapa.bunnyEmbed}
                title={etapa.nome}
                loading="lazy"
                allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture"
                allowFullScreen
                style={{ width: 200, height: 112, borderRadius: 8, background: '#000', border: 0, flexShrink: 0 }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--green)', fontWeight: 600 }}><i className="ti ti-circle-check" /> Vídeo enviado ✓ (Bunny)</span>
              <button className="btn btn-ghost" style={{ color: 'var(--red)', padding: '5px 10px', alignSelf: 'flex-start' }} disabled={uploading || busy} onClick={removerVideo}>
                <i className="ti ti-trash" /> {uploading ? 'Removendo…' : 'Remover vídeo'}
              </button>
            </div>
          </>
        ) : (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)', flexWrap: 'wrap', cursor: uploading ? 'default' : 'pointer' }}>
            <span className="btn btn-ghost" style={{ padding: '6px 12px', pointerEvents: 'none' }}>
              <i className="ti ti-cloud-upload" /> {uploading ? `Enviando… ${prog}%` : (isFinal ? 'Enviar vídeo (opcional)' : 'Enviar vídeo (Bunny)')}
            </span>
            <input type="file" accept="video/*" disabled={uploading || busy} style={{ display: 'none' }}
              onChange={(ev) => { const f = ev.target.files?.[0]; if (f) enviarVideo(f); ev.target.value = '' }} />
          </label>
        )}
      </div>

      {/* Prova (multi-pergunta) */}
      <ProvaEditor inicial={etapa.prova} onSalvar={persistir} flash={flash} busy={busy} />

      {!isFinal && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <button className="btn btn-ghost" style={{ color: 'var(--red)', padding: '5px 10px' }} disabled={busy} onClick={excluir}>
            <i className="ti ti-trash" /> Excluir etapa
          </button>
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Prova multi-pergunta ─────────────────────────────

type QLocal = { q: string; opts: string[]; c: number }

function normalizar(inicial: Questao[]): QLocal[] {
  if (!inicial.length) return [{ q: '', opts: ['', ''], c: 0 }]
  return inicial.map((x) => ({ q: x.q, opts: x.opts.length >= 2 ? [...x.opts] : [...x.opts, '', ''].slice(0, 2), c: x.c }))
}

/** Limpa/valida: descarta opções vazias (mantendo a correta), e questões sem enunciado ou com < 2 opções. */
function limpar(qs: QLocal[]): Questao[] {
  const out: Questao[] = []
  for (const q of qs) {
    const pergunta = q.q.trim()
    const kept = q.opts.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o)
    if (!pergunta || kept.length < 2) continue
    let c = kept.findIndex((x) => x.i === q.c)
    if (c < 0) c = 0
    out.push({ q: pergunta, opts: kept.map((x) => x.o), c })
  }
  return out
}

function ProvaEditor(props: { inicial: Questao[]; onSalvar: (prova: Questao[]) => Promise<{ ok: boolean; error?: string }>; flash: (t: string) => void; busy: boolean }) {
  const { inicial, onSalvar, flash, busy } = props
  const uid = useId()
  const [qs, setQs] = useState<QLocal[]>(() => normalizar(inicial))
  const [salvando, setSalvando] = useState(false)

  const upd = (fn: (arr: QLocal[]) => QLocal[]) => setQs((prev) => fn(prev.map((q) => ({ q: q.q, opts: [...q.opts], c: q.c }))))

  const setPergunta = (qi: number, v: string) => upd((arr) => { arr[qi].q = v; return arr })
  const setOpcao = (qi: number, oi: number, v: string) => upd((arr) => { arr[qi].opts[oi] = v; return arr })
  const setCorreta = (qi: number, oi: number) => upd((arr) => { arr[qi].c = oi; return arr })
  const addOpcao = (qi: number) => upd((arr) => { arr[qi].opts.push(''); return arr })
  const removeOpcao = (qi: number, oi: number) => upd((arr) => {
    if (arr[qi].opts.length <= 2) return arr
    arr[qi].opts.splice(oi, 1)
    if (arr[qi].c === oi) arr[qi].c = 0
    else if (arr[qi].c > oi) arr[qi].c -= 1
    return arr
  })
  const addPergunta = () => upd((arr) => { arr.push({ q: '', opts: ['', ''], c: 0 }); return arr })
  const removePergunta = (qi: number) => upd((arr) => { arr.splice(qi, 1); return arr })

  async function salvar() {
    const prova = limpar(qs)
    if (!prova.length) { flash('Adicione ao menos uma pergunta com enunciado e 2 opções.'); return }
    setSalvando(true)
    const r = await onSalvar(prova)
    setSalvando(false)
    if (!r.ok) flash(r.error || 'Erro ao salvar a prova.')
    else flash(`Prova salva (${prova.length} pergunta${prova.length > 1 ? 's' : ''}).`)
  }

  const disabled = busy || salvando

  return (
    <div style={{ display: 'grid', gap: 10, padding: 10, background: 'var(--surface-2)', borderRadius: 8, marginTop: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}><i className="ti ti-writing" /> Prova — {qs.length} pergunta{qs.length !== 1 ? 's' : ''}</div>

      {qs.map((q, qi) => (
        <div key={qi} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', paddingTop: 8 }}>{qi + 1}.</span>
            <textarea style={{ ...inp, minHeight: 42, resize: 'vertical' }} value={q.q} onChange={(e) => setPergunta(qi, e.target.value)} placeholder="Enunciado da pergunta" />
            <button className="btn btn-ghost" style={{ color: 'var(--red)', padding: '5px 8px', flexShrink: 0 }} disabled={disabled} title="Remover pergunta" onClick={() => removePergunta(qi)}>
              <i className="ti ti-x" />
            </button>
          </div>

          <div style={{ display: 'grid', gap: 6, paddingLeft: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Marque a opção <b>correta</b>:</div>
            {q.opts.map((o, oi) => (
              <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="radio" name={`c-${uid}-${qi}`} checked={q.c === oi} onChange={() => setCorreta(qi, oi)} title="Opção correta" style={{ flexShrink: 0 }} />
                <input style={{ ...inp, flex: 1, fontSize: 12.5 }} value={o} onChange={(e) => setOpcao(qi, oi, e.target.value)} placeholder={`Opção ${oi + 1}`} />
                <button className="btn btn-ghost" style={{ padding: '4px 7px', flexShrink: 0, color: q.opts.length <= 2 ? 'var(--text-3)' : 'var(--red)' }} disabled={disabled || q.opts.length <= 2} title="Remover opção" onClick={() => removeOpcao(qi, oi)}>
                  <i className="ti ti-minus" />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, justifySelf: 'flex-start' }} disabled={disabled} onClick={() => addOpcao(qi)}>
              <i className="ti ti-plus" /> opção
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ padding: '6px 12px' }} disabled={disabled} onClick={addPergunta}>
          <i className="ti ti-plus" /> Adicionar pergunta
        </button>
        <button className="btn btn-primary" style={{ padding: '6px 14px' }} disabled={disabled} onClick={salvar}>
          <i className="ti ti-device-floppy" /> {salvando ? 'Salvando…' : 'Salvar prova'}
        </button>
      </div>
    </div>
  )
}
