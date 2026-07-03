'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOC_TIPOS, mergeTemplate, franqueadoNome, type DocTipo } from '@/lib/juridico'
import type { ModeloRow } from '@/components/juridico/ModelosTab'
import {
  anexarDocumentoContratual,
  removerDocumentoContratual,
  enviarNotifManual,
} from '@/app/(app)/juridico/actions'

export type UnidadeJur = {
  id: string
  nome: string
  cnpj: string | null
  ativa: boolean
  docs: {
    contrato: { arquivo: string; data: string | null } | null
    pre: { arquivo: string; data: string | null } | null
    cof: { arquivo: string; data: string | null } | null
  }
}

type FiltroStatus = 'Todas' | 'Ativas' | 'Em teste' | 'Inativas'
const CHIPS: FiltroStatus[] = ['Todas', 'Ativas', 'Em teste', 'Inativas']

function statusUnidade(u: UnidadeJur): { label: string; bg: string; c: string } {
  // Unidades do lkii têm apenas o boolean `ativa` (não há "Em teste" no schema real).
  return u.ativa ? { label: 'Ativa', bg: '#E7F0EC', c: '#0f6b3a' } : { label: 'Inativa', bg: '#ECEAF2', c: '#5B5570' }
}

function DocPill({ d }: { d: { arquivo: string; data: string | null } | null }) {
  return d ? (
    <span className="wa-pill ok" title={`${d.arquivo}${d.data ? ' · ' + d.data : ''}`}>
      <i className="ti ti-paperclip" style={{ fontSize: 11 }} /> Anexado
    </span>
  ) : (
    <span className="wa-pill draft">Pendente</span>
  )
}

function dataBR(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('pt-BR')
}

// ─────────────────────── Modal "Notificar · Unidade" ───────────────────────
function NotificarModal({
  unidade,
  modelos,
  onClose,
}: {
  unidade: UnidadeJur
  modelos: ModeloRow[]
  onClose: () => void
}) {
  const router = useRouter()
  const franq = franqueadoNome(null)
  const cnpj = unidade.cnpj ?? ''
  const ctx = { unidade: unidade.nome, franqueado: franq, cnpj }
  const [idx, setIdx] = useState(0)
  const t = modelos[idx]
  const [assunto, setAssunto] = useState(t ? mergeTemplate(t.assunto, ctx) : '')
  const [corpo, setCorpo] = useState(t ? mergeTemplate(t.corpo, ctx) : '')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Ao trocar o modelo, refaz o merge (jurFill 5006).
  function trocarModelo(i: number) {
    setIdx(i)
    const m = modelos[i]
    setAssunto(m ? mergeTemplate(m.assunto, ctx) : '')
    setCorpo(m ? mergeTemplate(m.corpo, ctx) : '')
  }

  async function enviar() {
    setBusy(true)
    setErro(null)
    const r = await enviarNotifManual({ unidadeId: unidade.id, unidadeNome: unidade.nome, assunto, corpo })
    setBusy(false)
    if (!r.ok) { setErro(r.error || 'Falha ao enviar.'); return }
    onClose()
    router.refresh()
  }

  return (
    <div
      className="modal-backdrop open"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-card" style={{ background: 'var(--surface, #fff)', borderRadius: 14, width: 'min(640px,96vw)', maxHeight: '92vh', overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>
            <i className="ti ti-mail-forward" /> Notificar · {unidade.nome}
          </h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '5px 8px' }}><i className="ti ti-x" /></button>
        </div>

        <div className="mf full" style={{ marginBottom: 8 }}>
          <label>Modelo</label>
          <select value={idx} onChange={(e) => trocarModelo(Number(e.target.value))} disabled={busy || modelos.length === 0}>
            {modelos.length === 0 && <option>Nenhum modelo cadastrado</option>}
            {modelos.map((m, i) => <option key={m.id} value={i}>{m.nome}</option>)}
          </select>
        </div>
        <div className="mf full" style={{ marginBottom: 8 }}>
          <label>Para</label>
          <input value={`${unidade.nome} · ${franq}`} readOnly />
        </div>
        <div className="mf full" style={{ marginBottom: 8 }}>
          <label>Assunto</label>
          <input value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={busy} />
        </div>
        <div className="mf full">
          <label>Corpo</label>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={10}
            disabled={busy}
            style={{ width: '100%', border: '1px solid var(--line-strong)', borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical' }}
          />
        </div>

        {erro && <div className="sim-msg err" style={{ marginTop: 8 }}><i className="ti ti-alert-triangle" /> {erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary" onClick={enviar} disabled={busy}>
            <i className="ti ti-mail-forward" /> Enviar por e-mail
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────── Detalhe da unidade (3 cards) ───────────────────────
function UnidadeDetalhe({
  unidade,
  onVoltar,
  onNotificar,
}: {
  unidade: UnidadeJur
  onVoltar: () => void
  onNotificar: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<DocTipo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function anexar(tipo: DocTipo, file: File | null) {
    if (!file) return
    if (!/\.pdf$/i.test(file.name)) { setErro('O documento deve ser um PDF.'); return }
    setBusy(tipo)
    setErro(null)
    const r = await anexarDocumentoContratual({ unidadeId: unidade.id, tipo, arquivo: file.name })
    setBusy(null)
    if (!r.ok) setErro(r.error || 'Falha ao anexar.')
    else router.refresh()
  }

  async function remover(tipo: DocTipo) {
    if (!confirm('Remover este documento?')) return
    setBusy(tipo)
    setErro(null)
    const r = await removerDocumentoContratual(unidade.id, tipo)
    setBusy(null)
    if (!r.ok) setErro(r.error || 'Falha ao remover.')
    else router.refresh()
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <span className="os-link" style={{ cursor: 'pointer' }} onClick={onVoltar}>
          <i className="ti ti-arrow-left" /> Voltar
        </span>
      </div>

      <div className="rel-card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 9, background: '#F7E7EB', color: 'var(--brand-600)' }}>
          <i className="ti ti-building-store" />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>{unidade.nome}</h3>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            Franqueado(a): {franqueadoNome(null)}{unidade.cnpj ? ` · CNPJ ${unidade.cnpj}` : ''}
          </div>
        </div>
        <button className="btn btn-primary" onClick={onNotificar}>
          <i className="ti ti-mail-forward" /> Enviar notificação
        </button>
      </div>

      {erro && <div className="sim-msg err" style={{ marginBottom: 10 }}><i className="ti ti-alert-triangle" /> {erro}</div>}

      <div className="disp-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {DOC_TIPOS.map((dt) => {
          const v = unidade.docs[dt.tipo]
          return (
            <div key={dt.tipo} className="disp-card" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
              <div className="dc-h" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="dc-ic" style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 8, background: '#F7E7EB', color: 'var(--brand-600)' }}>
                  <i className={`ti ${dt.icone}`} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="dc-tt" style={{ fontWeight: 700, fontSize: 13.5 }}>{dt.nome}</div>
                  <div className="dc-st" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {v ? `${v.arquivo}${v.data ? ' · ' + dataBR(v.data) : ''}` : 'Nenhum arquivo anexado'}
                  </div>
                </div>
                {v ? <span className="wa-pill ok">Anexado</span> : <span className="wa-pill draft">Pendente</span>}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <label className="btn btn-ghost" style={{ padding: '7px 10px', flex: 1, cursor: 'pointer', justifyContent: 'center', opacity: busy === dt.tipo ? 0.6 : 1 }}>
                  <i className="ti ti-paperclip" /> {v ? 'Substituir' : 'Anexar'}
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    disabled={busy === dt.tipo}
                    onChange={(e) => anexar(dt.tipo, e.target.files?.[0] ?? null)}
                  />
                </label>
                {v && (
                  <button className="btn btn-ghost" style={{ padding: '7px 10px' }} disabled={busy === dt.tipo} onClick={() => remover(dt.tipo)} title="Remover">
                    <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────── Aba Unidades & documentos ───────────────────────
export function UnidadesTab({
  unidades,
  modelos,
  migrationPendente,
}: {
  unidades: UnidadeJur[]
  modelos: ModeloRow[]
  migrationPendente: boolean
}) {
  const [filtro, setFiltro] = useState<FiltroStatus>('Todas')
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const [notificar, setNotificar] = useState<string | null>(null)

  const lista = useMemo(
    () =>
      unidades.filter((u) => {
        if (filtro === 'Todas') return true
        if (filtro === 'Ativas') return u.ativa
        if (filtro === 'Inativas') return !u.ativa
        return false // "Em teste" não existe no schema real → lista vazia
      }),
    [unidades, filtro],
  )

  const uniDet = unidades.find((u) => u.id === detalhe) ?? null
  const uniNotif = unidades.find((u) => u.id === notificar) ?? null

  if (uniDet) {
    return (
      <>
        <UnidadeDetalhe
          unidade={uniDet}
          onVoltar={() => setDetalhe(null)}
          onNotificar={() => setNotificar(uniDet.id)}
        />
        {uniNotif && <NotificarModal unidade={uniNotif} modelos={modelos} onClose={() => setNotificar(null)} />}
      </>
    )
  }

  return (
    <div>
      <div className="rel-legend">
        Selecione a unidade (filtre por <b>ativa</b>, em teste ou <b>inativa</b>) para anexar os documentos contratuais {' '}
        <b>Contrato de Franquia</b>, <b>Pré-contrato</b> e <b>COF</b>  e emitir notificações.
      </div>

      <div className="dash-filter" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="flabel" style={{ fontSize: 12, color: 'var(--text-2)' }}>Status</span>
        {CHIPS.map((c) => (
          <div key={c} className={`chip ${c === filtro ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFiltro(c)}>
            {c}
          </div>
        ))}
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Status</th>
                <th>Contrato</th>
                <th>Pré-contrato</th>
                <th>COF</th>
                <th className="num-r">Docs</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)' }}>Nenhuma unidade neste filtro.</td></tr>
              ) : (
                lista.map((u) => {
                  const tot = [u.docs.contrato, u.docs.pre, u.docs.cof].filter(Boolean).length
                  const st = statusUnidade(u)
                  return (
                    <tr key={u.id}>
                      <td>
                        <span className="cli-name">
                          <i className="ti ti-building-store" style={{ color: 'var(--brand-500)', marginRight: 7, verticalAlign: -2 }} />
                          {u.nome}
                        </span>
                      </td>
                      <td><span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: st.bg, color: st.c }}>{st.label}</span></td>
                      <td><DocPill d={u.docs.contrato} /></td>
                      <td><DocPill d={u.docs.pre} /></td>
                      <td><DocPill d={u.docs.cof} /></td>
                      <td className="num-r">{tot}/3</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="os-link" style={{ cursor: 'pointer' }} onClick={() => setDetalhe(u.id)}>
                          <i className="ti ti-folder" /> Documentos
                        </span>
                        {' · '}
                        <span className="os-link" style={{ cursor: 'pointer' }} onClick={() => setNotificar(u.id)}>
                          <i className="ti ti-mail-forward" /> Notificar
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {migrationPendente && (
        <div className="sim-msg" style={{ marginTop: 12, background: 'var(--surface-2)' }}>
          <i className="ti ti-info-circle" /> Anexos de documentos exigem a migration aplicada.
        </div>
      )}

      {uniNotif && <NotificarModal unidade={uniNotif} modelos={modelos} onClose={() => setNotificar(null)} />}
    </div>
  )
}
