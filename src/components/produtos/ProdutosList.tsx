'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import { toggleProdutoAtivo } from '@/app/(app)/produtos/actions'
import { ProdutoModal } from './ProdutoModal'

export type ProdutoRow = {
  id: string
  nome: string | null
  grupo: string | null
  descricao: string | null
  preco_padrao: number | null
  desc_max: number | null
  custo: number | null
  estoque_atual: number | null
  estoque_minimo: number | null
  feedstock: boolean | null
  default_product: boolean | null
  ativo: boolean | null
}

type Props = {
  produtos: ProdutoRow[]
  grupos: string[]
  page: number
  totalPages: number
  total: number
  searchParams: Record<string, string | undefined>
  podeEscrever: boolean
}

export function ProdutosList({ produtos, grupos, page, totalPages, total, searchParams, podeEscrever }: Props) {
  const router = useRouter()
  const [editRow, setEditRow] = useState<ProdutoRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const urlComPagina = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') sp.set(k, v)
    }
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return `/produtos${s ? `?${s}` : ''}`
  }

  async function alternar(p: ProdutoRow) {
    setBusy(p.id); setMsg('')
    const r = await toggleProdutoAtivo(p.id, p.ativo === false)
    setBusy(null)
    if (!r.ok) setMsg(r.error || 'Erro ao alterar.')
    else router.refresh()
  }

  return (
    <>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 8px' }}>{msg}</div>}

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Grupo</th>
                <th className="num-r">Preço</th>
                <th className="num-r">Desc. Máx</th>
                <th className="num-r">Custo</th>
                <th className="num-r">Estoque</th>
                <th>Insumo</th>
                <th>Status</th>
                {podeEscrever && <th></th>}
              </tr>
            </thead>
            <tbody>
              {produtos.length === 0 && (
                <tr>
                  <td colSpan={podeEscrever ? 9 : 8} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum produto encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
              {produtos.map((p) => {
                const inativo = p.ativo === false
                const baixo = (p.estoque_minimo ?? 0) > 0 && (p.estoque_atual ?? 0) <= (p.estoque_minimo ?? 0)
                return (
                  <tr key={p.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                    <td>
                      <span className="cli-name">{p.nome || '(sem nome)'}</span>
                      {p.default_product && (
                        <span className="orig-tag" style={{ marginLeft: 6, background: '#E7EEFB', color: '#1E3A8A' }} title="Produto padrão da rede">
                          <i className="ti ti-star" /> Padrão
                        </span>
                      )}
                      {p.descricao && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.descricao}</div>}
                    </td>
                    <td>{p.grupo ? <span className="orig-tag">{p.grupo}</span> : <span className="muted"></span>}</td>
                    <td className="num-r"><b>{moedaBR(p.preco_padrao)}</b></td>
                    <td className="num-r">{p.desc_max != null && p.desc_max > 0 ? `${p.desc_max.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : <span className="muted"></span>}</td>
                    <td className="num-r">{p.custo != null ? moedaBR(p.custo) : <span className="muted"></span>}</td>
                    <td className="num-r">
                      {(p.estoque_atual ?? 0).toLocaleString('pt-BR')}
                      {baixo && (
                        <span className="orig-tag" style={{ marginLeft: 6, background: '#FBE9EB', color: '#D85563' }} title={`Estoque mínimo: ${p.estoque_minimo}`}>
                          <i className="ti ti-alert-triangle" /> baixo
                        </span>
                      )}
                    </td>
                    <td>{p.feedstock ? <span className="pill-yes">Sim</span> : <span className="pill-no">Não</span>}</td>
                    <td>{inativo ? <span className="os-st os-cancelada">Inativo</span> : <span className="os-st os-fechada">Ativo</span>}</td>
                    {podeEscrever && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn" style={{ marginRight: 6 }} onClick={() => { setMsg(''); setEditRow(p) }} title="Editar">
                          <i className="ti ti-pencil" />
                        </button>
                        <button className="btn" disabled={busy === p.id} onClick={() => alternar(p)} title={inativo ? 'Ativar' : 'Inativar'}
                          style={{ color: inativo ? 'var(--green)' : 'var(--red)' }}>
                          {busy === p.id ? '…' : <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} />}
                        </button>
                      </td>
                    )}
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

      {editRow && <ProdutoModal modo="editar" row={editRow} grupos={grupos} onClose={() => setEditRow(null)} />}
    </>
  )
}
