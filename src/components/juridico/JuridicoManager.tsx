'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dataBR } from '@/lib/fmt'
import {
  criarDocumento,
  atualizarDocumento,
  enviarDocumento,
  cancelarDocumento,
  type NovoDocumentoInput,
} from '@/app/(app)/juridico/actions'
import { SignatariosPanel } from '@/components/juridico/SignatariosPanel'

export type DocRow = {
  id: string
  titulo: string | null
  descricao: string | null
  arquivo_nome: string | null
  status: string | null
  prazo: string | null
  ordem_sequencial: boolean | null
  unidade_id: string | null
  unidade_nome: string
  enviado_em: string | null
  concluido_em: string | null
  cancelado_em: string | null
  motivo_cancelamento: string | null
  criado_em: string | null
  total_signatarios: number
  assinados: number
}

type Unidade = { id: string; nome: string }

type Props = {
  rows: DocRow[]
  carregouOk: boolean
  activeUnitId: string | null
  activeUnitName: string
  unidades: Unidade[]
  mostrarUnidade: boolean
  filtros: { status: string; q: string; unidade: string; di: string; df: string }
  kpis: { total: number; rascunho: number; andamento: number; concluido: number; expirado: number }
  page: number
  totalPages: number
  total: number
}

const STATUS_PILL: Record<string, { bg: string; c: string; t: string }> = {
  rascunho: { bg: '#EEF2F7', c: '#64748B', t: 'Rascunho' },
  em_andamento: { bg: '#E6F0FB', c: '#3D7FD1', t: 'Em andamento' },
  concluido: { bg: '#E7F0EC', c: '#15803D', t: 'Concluído' },
  cancelado: { bg: '#FBE9EB', c: '#D85563', t: 'Cancelado' },
  expirado: { bg: '#FBEFD9', c: '#9A6700', t: 'Expirado' },
}

function statusPill(s: string | null) {
  const p = STATUS_PILL[s || ''] || STATUS_PILL.rascunho
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p.bg, color: p.c }}>{p.t}</span>
}

export function JuridicoManager(props: Props) {
  const { rows, carregouOk, activeUnitId, activeUnitName, unidades, mostrarUnidade, filtros, kpis, page, totalPages, total } = props
  const router = useRouter()

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<DocRow | null>(null)
  const [signRow, setSignRow] = useState<DocRow | null>(null)

  const temFiltro = !!(filtros.status || filtros.q || filtros.unidade || filtros.di || filtros.df)

  function urlCom(extra: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    if (filtros.status) p.set('status', filtros.status)
    if (filtros.q) p.set('q', filtros.q)
    if (filtros.unidade) p.set('unidade', filtros.unidade)
    if (filtros.di) p.set('di', filtros.di)
    if (filtros.df) p.set('df', filtros.df)
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === '' || v === null) p.delete(k)
      else p.set(k, String(v))
    }
    const s = p.toString()
    return `/juridico${s ? `?${s}` : ''}`
  }
  const urlPagina = (pg: number) => urlCom({ page: pg > 1 ? pg : undefined })

  async function enviar(d: DocRow) {
    setBusy(d.id); setMsg(''); setErr('')
    const r = await enviarDocumento(d.id)
    setBusy(null)
    if (!r.ok) setErr(r.error || 'Erro ao enviar.')
    else { setMsg('Documento enviado para assinatura.'); router.refresh() }
  }

  async function cancelar(d: DocRow) {
    const motivo = window.prompt(`Cancelar o documento "${d.titulo || ''}"? Informe o motivo (opcional):`, '')
    if (motivo === null) return
    setBusy(d.id); setMsg(''); setErr('')
    const r = await cancelarDocumento(d.id, motivo || undefined)
    setBusy(null)
    if (!r.ok) setErr(r.error || 'Erro ao cancelar.')
    else { setMsg('Documento cancelado.'); router.refresh() }
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-gavel" /> Documentos contratuais e assinaturas da unidade <b>{activeUnitName}</b>
        {!activeUnitId && ' (todas as unidades — selecione uma no topo para vincular um documento a ela)'}. Acesso restrito a administradores.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box"><span>Documentos</span><b>{kpis.total}</b></div>
        <div className="metric-box"><span>Rascunhos</span><b style={{ color: '#64748B' }}>{kpis.rascunho}</b></div>
        <div className="metric-box"><span>Em andamento</span><b style={{ color: '#3D7FD1' }}>{kpis.andamento}</b></div>
        <div className="metric-box"><span>Concluídos</span><b style={{ color: '#15803D' }}>{kpis.concluido}</b></div>
        <div className="metric-box"><span>Expirados</span><b style={{ color: '#9A6700' }}>{kpis.expirado}</b></div>
      </div>

      {/* Ação */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn btn-primary" onClick={() => { setMsg(''); setErr(''); setNovoOpen(true) }}>
          <i className="ti ti-plus" /> Novo documento
        </button>
      </div>

      {/* Filtros (form GET → server re-renderiza) */}
      <form method="GET" action="/juridico" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue={filtros.status}>
              <option value="">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluido">Concluído</option>
              <option value="cancelado">Cancelado</option>
              <option value="expirado">Expirado</option>
            </select>
          </div>
          <div className="field">
            <label>Buscar</label>
            <input name="q" defaultValue={filtros.q} placeholder="Título, descrição ou arquivo" />
          </div>
          {mostrarUnidade && (
            <div className="field">
              <label>Unidade</label>
              <select name="unidade" defaultValue={filtros.unidade}>
                <option value="">Todas</option>
                {unidades.map((u) => (<option key={u.id} value={u.id}>{u.nome}</option>))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Prazo de</label>
            <input type="date" name="di" defaultValue={filtros.di} />
          </div>
          <div className="field">
            <label>Prazo até</label>
            <input type="date" name="df" defaultValue={filtros.df} />
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
          {temFiltro && (<Link href="/juridico" className="btn"><i className="ti ti-x" /> Limpar</Link>)}
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>}
      {err && <div className="crm-note" style={{ background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 8 }}><i className="ti ti-alert-triangle" /> {err}</div>}

      {!carregouOk && (
        <div className="crm-note" style={{ background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar os documentos (sem permissão ou erro de conexão). Tente novamente.
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list" /> {total} documento(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      {/* Tabela */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Documento</th>
                {mostrarUnidade && <th>Unidade</th>}
                <th>Status</th>
                <th>Signatários</th>
                <th>Prazo</th>
                <th>Criado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {carregouOk && rows.length === 0 && (
                <tr>
                  <td colSpan={mostrarUnidade ? 7 : 6} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-file-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum documento {temFiltro ? 'com esses filtros' : 'cadastrado nesta unidade'}.
                  </td>
                </tr>
              )}
              {rows.map((d) => {
                const podeEnviar = d.status === 'rascunho'
                const podeCancelar = d.status !== 'concluido' && d.status !== 'cancelado'
                return (
                  <tr key={d.id}>
                    <td>
                      <b>{d.titulo || '—'}</b>
                      {d.arquivo_nome && <div style={{ fontSize: 11, color: 'var(--text-3)' }}><i className="ti ti-paperclip" /> {d.arquivo_nome}</div>}
                      {d.status === 'cancelado' && d.motivo_cancelamento && (
                        <div style={{ fontSize: 11, color: 'var(--red)' }}>Motivo: {d.motivo_cancelamento}</div>
                      )}
                    </td>
                    {mostrarUnidade && (
                      <td style={{ fontSize: 12, color: d.unidade_id ? 'var(--text-2)' : 'var(--brand-600)', fontWeight: d.unidade_id ? 400 : 600 }}>
                        {d.unidade_nome}
                      </td>
                    )}
                    <td>{statusPill(d.status)}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {d.total_signatarios === 0
                        ? <span style={{ color: 'var(--text-3)' }}>nenhum</span>
                        : <span>{d.assinados}/{d.total_signatarios} assinaram</span>}
                    </td>
                    <td>{d.prazo ? dataBR(d.prazo) : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{dataBR(d.criado_em)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn" style={{ marginRight: 6 }} title="Signatários" onClick={() => { setMsg(''); setErr(''); setSignRow(d) }}>
                        <i className="ti ti-users" /> {d.total_signatarios}
                      </button>
                      {d.status === 'rascunho' && (
                        <button className="btn" style={{ marginRight: 6 }} title="Editar" onClick={() => { setMsg(''); setErr(''); setEditRow(d) }}>
                          <i className="ti ti-pencil" />
                        </button>
                      )}
                      {podeEnviar && (
                        <button className="btn btn-primary" style={{ marginRight: 6 }} disabled={busy === d.id} onClick={() => enviar(d)}>
                          {busy === d.id ? '…' : (<><i className="ti ti-send" /> Enviar</>)}
                        </button>
                      )}
                      {podeCancelar && (
                        <button className="btn" disabled={busy === d.id} title="Cancelar" onClick={() => cancelar(d)}>
                          <i className="ti ti-x" style={{ color: 'var(--red)' }} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="cli-foot">
          <span>{total === 0 ? 'Nenhum registro' : `Exibindo página ${page} de ${totalPages} · ${total} registro(s)`}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {page > 1
                ? <Link className="btn" href={urlPagina(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
                : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>}
              {page < totalPages
                ? <Link className="btn" href={urlPagina(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
                : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>}
            </div>
          )}
        </div>
      </div>

      {/* Modal Novo / Editar */}
      {(novoOpen || editRow) && (
        <DocumentoForm
          modo={editRow ? 'editar' : 'novo'}
          row={editRow ?? undefined}
          activeUnitId={activeUnitId}
          unidades={unidades}
          mostrarUnidade={mostrarUnidade}
          onClose={() => { setNovoOpen(false); setEditRow(null) }}
          onSaved={(m) => { setNovoOpen(false); setEditRow(null); setMsg(m); router.refresh() }}
        />
      )}

      {/* Modal Signatários */}
      {signRow && (
        <SignatariosPanel
          doc={signRow}
          onClose={() => setSignRow(null)}
          onChanged={() => { router.refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Form (modal) ───────────────────────────

function DocumentoForm(props: {
  modo: 'novo' | 'editar'
  row?: DocRow
  activeUnitId: string | null
  unidades: Unidade[]
  mostrarUnidade: boolean
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { modo, row, activeUnitId, unidades, mostrarUnidade, onClose, onSaved } = props

  const [f, setF] = useState({
    titulo: row?.titulo ?? '',
    descricao: row?.descricao ?? '',
    arquivo_nome: row?.arquivo_nome ?? '',
    prazo: row?.prazo ?? '',
    ordem_sequencial: row?.ordem_sequencial ?? false,
    unidade_id: row?.unidade_id ?? activeUnitId ?? '',
  })
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.titulo.trim()) { setErr('Informe o título do documento.'); return }

    setSaving(true)
    let r
    if (modo === 'novo') {
      const input: NovoDocumentoInput = {
        titulo: f.titulo,
        descricao: f.descricao || undefined,
        arquivo_nome: f.arquivo_nome || undefined,
        prazo: f.prazo || null,
        ordem_sequencial: f.ordem_sequencial,
        unidade_id: f.unidade_id || activeUnitId || null,
      }
      r = await criarDocumento(input)
    } else {
      r = await atualizarDocumento({
        id: row!.id,
        titulo: f.titulo,
        descricao: f.descricao,
        arquivo_nome: f.arquivo_nome,
        prazo: f.prazo || null,
        ordem_sequencial: f.ordem_sequencial,
        unidade_id: f.unidade_id || null,
      })
    }
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved(modo === 'novo' ? 'Documento criado (rascunho).' : 'Documento atualizado.')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="modal" style={{ width: 560 }}>
        <div className="modal-head">
          <h3><i className="ti ti-file-certificate" /> {modo === 'novo' ? 'Novo documento' : 'Editar documento'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="mf"><label>Título <span className="req">*</span></label>
            <input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex.: Contrato de Franquia · Unidade Centro" autoFocus />
          </div>
          <div className="mf"><label>Descrição</label>
            <textarea value={f.descricao} onChange={(e) => set('descricao', e.target.value)} style={{ minHeight: 60, resize: 'vertical' }} placeholder="Detalhes do documento (opcional)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf"><label>Nome do arquivo</label>
              <input value={f.arquivo_nome} onChange={(e) => set('arquivo_nome', e.target.value)} placeholder="contrato_franquia.pdf" />
            </div>
            <div className="mf"><label>Prazo de assinatura</label>
              <input type="date" value={f.prazo} onChange={(e) => set('prazo', e.target.value)} />
            </div>
          </div>
          {mostrarUnidade && (
            <div className="mf"><label>Unidade</label>
              <select value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
                <option value="">Franqueadora / rede</option>
                {unidades.map((u) => (<option key={u.id} value={u.id}>{u.nome}</option>))}
              </select>
            </div>
          )}
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.ordem_sequencial} onChange={(e) => set('ordem_sequencial', e.target.checked)} style={{ width: 'auto' }} />
            Assinatura em ordem sequencial (um signatário por vez)
          </label>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            <i className="ti ti-info-circle" /> O documento é criado como <b>rascunho</b>. Adicione os signatários e depois clique em <b>Enviar</b> para iniciar a coleta de assinaturas.
          </div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, padding: '0 22px' }}>{err}</p>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
