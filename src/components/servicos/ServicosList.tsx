'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import { toggleServicoAtivo } from '@/app/(app)/servicos/actions'
import { ServicoModal } from './ServicoModal'

export type ServicoRow = {
  id: string
  nome: string | null
  grupo: string | null
  descricao: string | null
  duracao_min: number | null
  preco_padrao: number | null
  desc_max: number | null
  pagar_comissao: string | null
  comissionavel: boolean | null
  dynamic_price: boolean | null
  ativo: boolean | null
}

/** Badge de timing de comissão — cores do legado (comTag). */
export function ComTag({ v }: { v: string | null }) {
  const val = v || 'Execução'
  const bg = val === 'Não pagar' ? '#eeeeee' : val === 'Venda' ? '#E7EEFB' : '#E7F0EC'
  const c = val === 'Não pagar' ? '#777' : val === 'Venda' ? '#1E3A8A' : '#0F6B3A'
  return <span className="orig-tag" style={{ background: bg, color: c }}>{val}</span>
}

type Props = {
  servicos: ServicoRow[]
  grupos: string[]
  page: number
  totalPages: number
  total: number
  searchParams: Record<string, string | undefined>
  podeEscrever: boolean
}

/** 30 → "30 min"; 90 → "1h30". */
function fmtDur(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function ServicosList({ servicos, grupos, page, totalPages, total, searchParams, podeEscrever }: Props) {
  const router = useRouter()
  const [editRow, setEditRow] = useState<ServicoRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const urlComPagina = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') sp.set(k, v)
    }
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return `/servicos${s ? `?${s}` : ''}`
  }

  async function alternar(s: ServicoRow) {
    setBusy(s.id); setMsg('')
    const r = await toggleServicoAtivo(s.id, s.ativo === false)
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
                <th>Serviço</th>
                <th>Grupo</th>
                <th className="num-r">Duração</th>
                <th className="num-r">Preço</th>
                <th className="num-r">Desc. Máx</th>
                <th>Comissão</th>
                <th>Pagar comissão</th>
                <th>Status</th>
                {podeEscrever && <th></th>}
              </tr>
            </thead>
            <tbody>
              {servicos.length === 0 && (
                <tr>
                  <td colSpan={podeEscrever ? 9 : 8} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum serviço encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
              {servicos.map((s) => {
                const inativo = s.ativo === false
                return (
                  <tr key={s.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                    <td>
                      <span className="cli-name">{s.nome || '(sem nome)'}</span>
                      {s.descricao && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.descricao}</div>
                      )}
                    </td>
                    <td>{s.grupo ? <span className="orig-tag">{s.grupo}</span> : <span className="muted">—</span>}</td>
                    <td className="num-r">{fmtDur(s.duracao_min)}</td>
                    <td className="num-r">
                      <b>{moedaBR(s.preco_padrao)}</b>
                      {s.dynamic_price && (
                        <span className="orig-tag" style={{ marginLeft: 6, background: '#E7EEFB', color: '#1E3A8A' }} title="Preço dinâmico">din.</span>
                      )}
                    </td>
                    <td className="num-r">{s.desc_max != null && s.desc_max > 0 ? `${s.desc_max.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : <span className="muted">—</span>}</td>
                    <td>{s.comissionavel ? <span className="pill-yes">Sim</span> : <span className="pill-no">Não</span>}</td>
                    <td><ComTag v={s.pagar_comissao} /></td>
                    <td>{inativo ? <span className="os-st os-cancelada">Inativo</span> : <span className="os-st os-fechada">Ativo</span>}</td>
                    {podeEscrever && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn" style={{ marginRight: 6 }} onClick={() => { setMsg(''); setEditRow(s) }} title="Editar">
                          <i className="ti ti-pencil" />
                        </button>
                        <button className="btn" disabled={busy === s.id} onClick={() => alternar(s)} title={inativo ? 'Ativar' : 'Inativar'}
                          style={{ color: inativo ? 'var(--green)' : 'var(--red)' }}>
                          {busy === s.id ? '…' : <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} />}
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

      {editRow && (
        <ServicoModal modo="editar" row={editRow} grupos={grupos} onClose={() => setEditRow(null)} />
      )}
    </>
  )
}
