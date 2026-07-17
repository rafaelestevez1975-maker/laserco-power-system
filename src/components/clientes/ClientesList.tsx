'use client'

import Link from 'next/link'
import { moedaBR, waHref, digitos } from '@/lib/fmt'

export type ClienteRow = {
  id: string
  nome: string | null
  telefone: string | null
  cpf: string | null
  email: string | null
  genero: string | null
  cidade: string | null
  estado: string | null
  saldo_pontos: number | null
  saldo_creditos: number | null
  ativo: boolean | null
  verificado: boolean | null
  // Contadores denormalizados (trigger em clientes_documentos) — fotos/contratos do BEMP.
  total_documentos?: number | null
  total_contratos?: number | null
}

const GENERO_LABEL: Record<string, string> = { female: 'Feminino', male: 'Masculino', other: 'Outro' }
const generoLabel = (g: string | null) => (g ? (GENERO_LABEL[g] || g) : '')

/** "555199..." → "(51) 99999-9999" (best-effort; mantém o que não bate o padrão). */
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
  clientes: ClienteRow[]
  page: number
  totalPages: number
  basePath: string
  searchParams: Record<string, string | undefined>
}

export function ClientesList({ clientes, page, totalPages, basePath, searchParams }: Props) {
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
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Documento</th>
                <th>Gênero</th>
                <th>Cidade / UF</th>
                <th className="num-r">Pontos / Créditos</th>
                <th>Ativo</th>
                <th>Verif.</th>
                <th>Arquivos</th>
                <th>Ficha</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)' }}>
                    Nenhum cliente encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
              {clientes.map((c) => {
                const wa = waHref(c.telefone)
                const local = [c.cidade, c.estado].filter(Boolean).join(' / ')
                return (
                  <tr key={c.id} style={{ opacity: c.ativo === false ? 0.6 : 1 }}>
                    <td>
                      {/* os-link: cor da marca + sublinhado no hover — deixa claro que abre a ficha */}
                      <Link href={`/clientes/${c.id}`} className="os-link" title="Abrir ficha do cliente">
                        {c.nome || '(sem nome)'}
                      </Link>
                    </td>
                    <td>
                      {fmtTel(c.telefone) || <span className="muted"></span>}
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener" className="wa-link" title="Enviar mensagem no WhatsApp" onClick={(e) => e.stopPropagation()}>
                          <i className="ti ti-brand-whatsapp wa" />
                        </a>
                      )}
                    </td>
                    <td>{c.email || <span className="muted"></span>}</td>
                    <td>{fmtCpf(c.cpf) || <span className="muted"></span>}</td>
                    <td>{generoLabel(c.genero) || <span className="muted"></span>}</td>
                    <td>{local || <span className="muted"></span>}</td>
                    <td className="num-r">
                      <span style={{ fontWeight: 600 }}>{(c.saldo_pontos ?? 0).toLocaleString('pt-BR')} pts</span>
                      <span style={{ color: 'var(--text-3)' }}> · </span>
                      <span>{moedaBR(c.saldo_creditos)}</span>
                    </td>
                    <td>
                      {c.ativo === false
                        ? <span className="os-st os-cancelada">Não</span>
                        : <span className="os-st os-fechada">Sim</span>}
                    </td>
                    <td>
                      {c.verificado
                        ? <span className="os-st os-fechada">Sim</span>
                        : <span className="os-st os-cancelada">Não</span>}
                    </td>
                    {/* Fotos/contratos importados do BEMP — leva direto para a aba Documentos */}
                    <td>
                      {(c.total_documentos ?? 0) > 0 ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, whiteSpace: 'nowrap' }}>
                          <span title={`${c.total_documentos} arquivo(s)`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-2)' }}>
                            <i className="ti ti-photo" /> {c.total_documentos}
                          </span>
                          {(c.total_contratos ?? 0) > 0 && (
                            <span title={`${c.total_contratos} contrato(s) assinado(s)`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--red)' }}>
                              <i className="ti ti-file-type-pdf" /> {c.total_contratos}
                            </span>
                          )}
                        </span>
                      ) : <span className="muted">—</span>}
                    </td>
                    {/* Ação explícita: abre a ficha (dados, agendamentos, OS, fotos e contratos) */}
                    <td>
                      <Link href={`/clientes/${c.id}`} className="os-link" title="Abrir ficha: dados, agendamentos, fotos e contratos" style={{ whiteSpace: 'nowrap' }}>
                        <i className="ti ti-folder-open" /> Abrir
                      </Link>
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
