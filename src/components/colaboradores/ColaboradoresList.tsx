'use client'

import Link from 'next/link'
import { waHref, digitos, dataBR } from '@/lib/fmt'
import { cargoLabel, regimeLabel } from './labels'

export type ColaboradorRow = {
  id: string
  nome: string | null
  cpf: string | null
  telefone: string | null
  email: string | null
  cargo: string | null
  area: string | null
  departamento: string | null
  regime: string | null
  tipo: string | null
  status: string | null
  data_admissao: string | null
}

/** "555199..." → "(51) 99999-9999" (best-effort). */
function fmtTel(raw: string | null): string {
  const d = digitos(raw).replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw || ''
}

/** "12345678901" → "123.456.789-01". */
function fmtCpf(raw: string | null): string {
  const d = digitos(raw)
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return raw || ''
}

type Props = {
  colaboradores: ColaboradorRow[]
  page: number
  totalPages: number
  basePath: string
  searchParams: Record<string, string | undefined>
}

export function ColaboradoresList({ colaboradores, page, totalPages, basePath, searchParams }: Props) {
  const urlComPagina = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== 'page') sp.set(k, v)
    }
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return `${basePath}${s ? `?${s}` : ''}`
  }

  return (
    <>
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cargo</th>
                <th>Área / Depto</th>
                <th>Regime</th>
                <th>Telefone</th>
                <th>Admissão</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {colaboradores.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)' }}>
                    Nenhum colaborador encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
              {colaboradores.map((c) => {
                const wa = waHref(c.telefone)
                const local = [c.area, c.departamento].filter(Boolean).join(' / ')
                const inativo = c.status === 'inativo'
                const iniciais = (c.nome || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
                return (
                  <tr key={c.id} style={{ opacity: inativo ? 0.6 : 1 }}>
                    <td>
                      <Link href={`/colaboradores/${c.id}`} className="cli-name" style={{ textDecoration: 'none', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{iniciais || '?'}</span>
                        {c.nome || '(sem nome)'}
                      </Link>
                    </td>
                    <td><span className="orig-tag">{cargoLabel(c.cargo)}</span></td>
                    <td>{local || <span className="muted">—</span>}</td>
                    <td>{regimeLabel(c.regime)}</td>
                    <td>
                      {fmtTel(c.telefone) || <span className="muted">—</span>}
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener" className="wa-link" title="Enviar mensagem no WhatsApp" onClick={(e) => e.stopPropagation()}>
                          <i className="ti ti-brand-whatsapp wa" />
                        </a>
                      )}
                    </td>
                    <td>{dataBR(c.data_admissao) || <span className="muted">—</span>}</td>
                    <td>
                      {inativo
                        ? <span className="os-st os-cancelada">Inativo</span>
                        : <span className="os-st os-fechada">Ativo</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 14 }}>
          {page > 1
            ? <Link className="btn" href={urlComPagina(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
            : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>}
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Página {page.toLocaleString('pt-BR')} de {totalPages.toLocaleString('pt-BR')}</span>
          {page < totalPages
            ? <Link className="btn" href={urlComPagina(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
            : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>}
        </div>
      )}
    </>
  )
}
