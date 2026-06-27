'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dataHora } from '@/lib/fmt'

export type AuditRow = {
  id: string
  usuario_id: string | null
  acao: string | null
  recurso_id: string | null
  recurso_label: string | null
  resultado: string | null
  origem: string | null
  ip: string | null
  mensagem_erro: string | null
  dados_depois: unknown
  criado_em: string | null
  usuarioNome: string
}

type Props = {
  rows: AuditRow[]
  page: number
  totalPages: number
  total: number
  searchParams: Record<string, string | undefined>
}

function pilllResultado(r: string | null) {
  const ok = r === 'sucesso'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: ok ? '#E7F0EC' : '#FBE9EB', color: ok ? '#15803D' : '#D85563' }}>
      {ok ? 'Sucesso' : (r || 'erro')}
    </span>
  )
}

/** Constrói URL de paginação preservando os filtros atuais. */
function urlPagina(sp: Record<string, string | undefined>, pg: number): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k !== 'page' && v) p.set(k, v)
  }
  if (pg > 1) p.set('page', String(pg))
  const s = p.toString()
  return `/auditoria${s ? `?${s}` : ''}`
}

export function AuditoriaTabela({ rows, page, totalPages, total, searchParams }: Props) {
  const [aberto, setAberto] = useState<AuditRow | null>(null)

  return (
    <>
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>Data/hora</th>
                <th>Ação</th>
                <th>Recurso</th>
                <th style={{ width: 150 }}>Usuário</th>
                <th style={{ width: 90 }}>Origem</th>
                <th style={{ width: 100 }}>Resultado</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum evento de auditoria com esses filtros.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{dataHora(r.criado_em)}</td>
                  <td><code style={{ fontSize: 12 }}>{r.acao || '—'}</code></td>
                  <td style={{ fontSize: 12 }}>
                    {r.recurso_label || r.recurso_id || '—'}
                    {r.recurso_label && r.recurso_id && <span style={{ color: 'var(--text-3)' }}> · {r.recurso_id}</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.usuarioNome}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.origem || '—'}</td>
                  <td>{pilllResultado(r.resultado)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn" onClick={() => setAberto(r)} title="Ver detalhes"><i className="ti ti-eye" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cli-foot">
          <span>{total === 0 ? 'Nenhum registro' : `Página ${page} de ${totalPages} · ${total} registro(s)`}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {page > 1 ? (
                <Link className="btn" href={urlPagina(searchParams, page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>
              )}
              {page < totalPages ? (
                <Link className="btn" href={urlPagina(searchParams, page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Drawer/modal de detalhes (read-only) */}
      {aberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setAberto(null)}>
          <div onClick={(e) => e.stopPropagation()} className="modal" style={{ width: 560, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-head">
              <h3><i className="ti ti-history" /> Detalhe do evento</h3>
              <button type="button" className="btn" onClick={() => setAberto(null)}><i className="ti ti-x" /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 10, fontSize: 13 }}>
              <Linha rotulo="Data/hora" valor={dataHora(aberto.criado_em)} />
              <Linha rotulo="Ação" valor={aberto.acao || '—'} mono />
              <Linha rotulo="Recurso" valor={[aberto.recurso_label, aberto.recurso_id].filter(Boolean).join(' · ') || '—'} />
              <Linha rotulo="Usuário" valor={aberto.usuarioNome} />
              <Linha rotulo="Resultado" valor={aberto.resultado || '—'} />
              <Linha rotulo="Origem" valor={aberto.origem || '—'} />
              <Linha rotulo="IP" valor={aberto.ip || '—'} mono />
              {aberto.mensagem_erro && <Linha rotulo="Mensagem de erro" valor={aberto.mensagem_erro} />}
              {aberto.dados_depois != null && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Dados (depois)</div>
                  <pre style={{ background: 'var(--surface-2, #FAFAFB)', padding: 10, borderRadius: 8, fontSize: 11.5, overflow: 'auto', margin: 0 }}>
                    {JSON.stringify(aberto.dados_depois, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setAberto(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <span style={{ minWidth: 120, color: 'var(--text-3)', fontSize: 12 }}>{rotulo}</span>
      <span style={{ fontFamily: mono ? 'monospace' : undefined, fontSize: mono ? 12 : 13, wordBreak: 'break-all' }}>{valor}</span>
    </div>
  )
}
