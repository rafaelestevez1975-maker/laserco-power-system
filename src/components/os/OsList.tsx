'use client'

import { useState } from 'react'
import Link from 'next/link'
import { moedaBR, dataHoraBR } from '@/lib/fmt'
import { OsDetalheModal } from './OsDetalheModal'

export type OsRow = {
  id: string
  numero: number | null
  status: string
  origem: string | null
  total: number | null
  valor_pago: number | null
  valor_pendente: number | null
  desconto_total: number | null
  observacao: string | null
  criado_em: string | null
  fechada_em: string | null
  cancelada_em: string | null
  cliente_id: string | null
  clienteNome: string | null
  responsavelNome: string | null
}

export type ServicoOpt = { id: string; nome: string; preco: number }

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', fechada: 'Fechada', cancelada: 'Cancelada' }
const STATUS_CLASS: Record<string, string> = { aberta: 'os-aberta', fechada: 'os-fechada', cancelada: 'os-cancelada' }
const ORIGEM_LABEL: Record<string, string> = {
  avulsa: 'Avulsa', agendamento: 'Agendamento', pacote: 'Pacote', assinatura: 'Assinatura', interna: 'Interna', multa_assinatura: 'Multa',
}

type Props = {
  rows: OsRow[]
  page: number
  totalPages: number
  total: number
  searchParams: Record<string, string | undefined>
  podeEscrever: boolean
  activeUnitId: string | null
  servicos: ServicoOpt[]
}

export function OsList({ rows, page, totalPages, total, searchParams, podeEscrever, activeUnitId, servicos }: Props) {
  const [verRow, setVerRow] = useState<OsRow | null>(null)

  const urlComPagina = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') sp.set(k, v)
    }
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return `/os${s ? `?${s}` : ''}`
  }

  return (
    <>
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Cliente</th>
                <th>Origem</th>
                <th>Criação</th>
                <th>Status</th>
                <th className="num-r">Desconto</th>
                <th className="num-r">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-clipboard-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhuma ordem de serviço para os filtros selecionados.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className="orig-tag">#{r.numero ?? ''}</span></td>
                  <td>
                    <span className="cli-name">{r.clienteNome || <span className="muted"> sem cliente </span>}</span>
                    {r.responsavelNome && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>por {r.responsavelNome}</div>}
                  </td>
                  <td><span className="orig-tag">{ORIGEM_LABEL[r.origem || ''] || r.origem || ''}</span></td>
                  <td style={{ fontSize: 12.5 }}>{dataHoraBR(r.criado_em)}</td>
                  <td><span className={`os-st ${STATUS_CLASS[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                  <td className="num-r">{r.desconto_total ? moedaBR(r.desconto_total) : <span className="muted"></span>}</td>
                  <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(r.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="os-link" onClick={() => setVerRow(r)} style={{ cursor: 'pointer' }}>
                      <i className="ti ti-eye" /> Visualizar
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cli-foot">
          <span>{total === 0 ? 'Nenhum registro' : `Exibindo página ${page} de ${totalPages} · ${total} OS`}</span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {page > 1
                ? <Link className="btn" href={urlComPagina(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
                : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>}
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Página {page.toLocaleString('pt-BR')} de {totalPages.toLocaleString('pt-BR')}</span>
              {page < totalPages
                ? <Link className="btn" href={urlComPagina(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
                : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>}
            </div>
          )}
        </div>
      </div>

      {verRow && (
        <OsDetalheModal
          os={verRow}
          podeEscrever={podeEscrever}
          activeUnitId={activeUnitId}
          servicos={servicos}
          onClose={() => setVerRow(null)}
        />
      )}
    </>
  )
}
