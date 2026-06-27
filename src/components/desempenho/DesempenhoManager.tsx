'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dataBR } from '@/lib/fmt'
import {
  excluirAvaliacao,
  excluirPdi,
  atualizarProgressoPdi,
} from '@/app/(app)/rh/desempenho/actions'
import type { AvaliacaoRow, PdiRow, MetaResumo, ColabOpt, DesempenhoKpis } from './tipos'
import { AvaliacaoModal } from './AvaliacaoModal'
import { PdiModal } from './PdiModal'

type Aba = 'avaliacoes' | 'pdi' | 'metas'

type Props = {
  avaliacoes: AvaliacaoRow[]
  pdis: PdiRow[]
  metas: MetaResumo[]
  colaboradores: ColabOpt[]
  podeEscrever: boolean
  activeUnitName: string
  kpis: DesempenhoKpis
}

const INDICADOR_LBL: Record<string, string> = {
  venda: 'Venda',
  agendamentos: 'Agendamentos',
  clientes_novos: 'Clientes novos',
  indicacoes: 'Indicações',
  sessoes: 'Sessões',
}

const PDI_STATUS_LBL: Record<string, string> = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

/** Cor da pílula conforme a nota (0–5): verde ≥4, âmbar ≥3, vermelho abaixo. */
function notaPill(n: number | null): React.CSSProperties {
  const base: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }
  if (n == null) return { ...base, background: '#EEF2F7', color: '#64748B' }
  if (n >= 4) return { ...base, background: '#E7F0EC', color: '#15803D' }
  if (n >= 3) return { ...base, background: '#FBEFD9', color: '#9A6700' }
  return { ...base, background: '#FBE9EB', color: '#D85563' }
}

const fmtNota = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))

export function DesempenhoManager(props: Props) {
  const { avaliacoes, pdis, metas, colaboradores, podeEscrever, activeUnitName, kpis } = props
  const router = useRouter()

  const [aba, setAba] = useState<Aba>('avaliacoes')
  const [busca, setBusca] = useState('')
  const [filtroColab, setFiltroColab] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('') // PDI
  const [busy, setBusy] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [modalAval, setModalAval] = useState<{ modo: 'novo' | 'editar'; row?: AvaliacaoRow } | null>(null)
  const [modalPdi, setModalPdi] = useState<{ modo: 'novo' | 'editar'; row?: PdiRow } | null>(null)

  const q = busca.trim().toLowerCase()

  const avaliacoesFiltradas = useMemo(() => avaliacoes.filter((a) => {
    if (filtroColab && a.colaborador_id !== filtroColab) return false
    if (q && !(`${a.colaboradorNome} ${a.periodo ?? ''}`.toLowerCase().includes(q))) return false
    return true
  }), [avaliacoes, filtroColab, q])

  const pdisFiltrados = useMemo(() => pdis.filter((p) => {
    if (filtroColab && p.colaborador_id !== filtroColab) return false
    if (filtroStatus && (p.status ?? '') !== filtroStatus) return false
    if (q && !(`${p.colaboradorNome} ${p.titulo ?? ''}`.toLowerCase().includes(q))) return false
    return true
  }), [pdis, filtroColab, filtroStatus, q])

  const metasFiltradas = useMemo(() => metas.filter((m) => {
    if (filtroColab && m.colaborador_id !== filtroColab) return false
    if (q && !(`${m.colaboradorNome} ${m.indicador ?? ''}`.toLowerCase().includes(q))) return false
    return true
  }), [metas, filtroColab, q])

  const temFiltro = !!(q || filtroColab || filtroStatus)

  async function onExcluirAval(row: AvaliacaoRow) {
    if (!confirm(`Excluir a avaliação de ${row.colaboradorNome} (${row.periodo ?? 'período'})?`)) return
    setBusy(row.id); setErro('')
    const res = await excluirAvaliacao(row.id)
    setBusy(null)
    if (!res.ok) { setErro(res.error || 'Erro ao excluir avaliação.'); return }
    router.refresh()
  }

  async function onExcluirPdi(row: PdiRow) {
    if (!confirm(`Excluir o PDI "${row.titulo ?? ''}" de ${row.colaboradorNome}?`)) return
    setBusy(row.id); setErro('')
    const res = await excluirPdi(row.id)
    setBusy(null)
    if (!res.ok) { setErro(res.error || 'Erro ao excluir PDI.'); return }
    router.refresh()
  }

  async function onProgresso(row: PdiRow) {
    const atual = row.progresso ?? 0
    const v = prompt(`Atualizar progresso (%) do PDI "${row.titulo ?? ''}" — ${row.colaboradorNome}:`, String(atual))
    if (v == null) return
    const n = Number(v.replace('%', '').trim())
    if (!Number.isInteger(n) || n < 0 || n > 100) { setErro('Progresso deve ser inteiro entre 0 e 100.'); return }
    setBusy(row.id); setErro('')
    const res = await atualizarProgressoPdi(row.id, n)
    setBusy(null)
    if (!res.ok) { setErro(res.error || 'Erro ao atualizar progresso.'); return }
    router.refresh()
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-chart-bar" /> Gestão de desempenho da unidade <b>{activeUnitName}</b> — avaliações, planos de desenvolvimento (PDI) e acompanhamento de metas individuais.
      </div>

      {/* KPIs reais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box">
          <span>Avaliações no período</span>
          <b>{kpis.avaliacoes.toLocaleString('pt-BR')}</b>
        </div>
        <div className="metric-box">
          <span>Nota média</span>
          <b style={{ color: kpis.notaMedia == null ? 'var(--text-3)' : kpis.notaMedia >= 4 ? '#15803D' : kpis.notaMedia >= 3 ? '#9A6700' : '#D85563' }}>
            {kpis.notaMedia == null ? '—' : kpis.notaMedia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
          </b>
        </div>
        <div className="metric-box">
          <span>PDIs em andamento</span>
          <b>{kpis.pdisAtivos.toLocaleString('pt-BR')}</b>
        </div>
        <div className="metric-box">
          <span>Sem avaliação</span>
          <b style={{ color: kpis.semAvaliacao > 0 ? '#9A6700' : '#15803D' }}>{kpis.semAvaliacao.toLocaleString('pt-BR')}</b>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>de {kpis.colaboradores} colaborador(es)</span>
        </div>
      </div>

      {/* Abas */}
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={`seg-btn${aba === 'avaliacoes' ? ' active' : ''}`} onClick={() => { setAba('avaliacoes'); setErro('') }}>
          <i className="ti ti-star" /> Avaliações ({avaliacoes.length})
        </button>
        <button className={`seg-btn${aba === 'pdi' ? ' active' : ''}`} onClick={() => { setAba('pdi'); setErro('') }}>
          <i className="ti ti-target-arrow" /> PDI ({pdis.length})
        </button>
        <button className={`seg-btn${aba === 'metas' ? ' active' : ''}`} onClick={() => { setAba('metas'); setErro('') }}>
          <i className="ti ti-trophy" /> Metas ({metas.length})
        </button>
      </div>

      {/* Filtros + ação */}
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: aba === 'pdi' ? '1.4fr 1fr 1fr auto' : '1.6fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div className="field">
            <label>Buscar</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={aba === 'avaliacoes' ? 'Colaborador ou período…' : aba === 'pdi' ? 'Colaborador ou título…' : 'Colaborador ou indicador…'} />
          </div>
          <div className="field">
            <label>Colaborador</label>
            <select value={filtroColab} onChange={(e) => setFiltroColab(e.target.value)}>
              <option value="">Todos</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          {aba === 'pdi' && (
            <div className="field">
              <label>Status</label>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(PDI_STATUS_LBL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {temFiltro && (
              <button type="button" className="btn" onClick={() => { setBusca(''); setFiltroColab(''); setFiltroStatus('') }}>
                <i className="ti ti-x" /> Limpar
              </button>
            )}
            {podeEscrever && aba === 'avaliacoes' && (
              <button type="button" className="btn btn-primary" disabled={colaboradores.length === 0} onClick={() => { setErro(''); setModalAval({ modo: 'novo' }) }}>
                <i className="ti ti-plus" /> Nova avaliação
              </button>
            )}
            {podeEscrever && aba === 'pdi' && (
              <button type="button" className="btn btn-primary" disabled={colaboradores.length === 0} onClick={() => { setErro(''); setModalPdi({ modo: 'novo' }) }}>
                <i className="ti ti-plus" /> Novo PDI
              </button>
            )}
          </div>
        </div>
      </div>

      {erro && (
        <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12.5 }}>
          {erro}
        </div>
      )}

      {/* ── Aba Avaliações ── */}
      {aba === 'avaliacoes' && (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Colaborador</th><th>Período</th>
                  <th className="num-r">Produtiv.</th><th className="num-r">Qualidade</th><th className="num-r">Comport.</th><th className="num-r">Equipe</th>
                  <th>Nota geral</th><th>Data</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {avaliacoesFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                      <i className="ti ti-star-off" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
                      {colaboradores.length === 0
                        ? 'Nenhum colaborador ativo nesta unidade.'
                        : temFiltro
                          ? 'Nenhuma avaliação para os filtros selecionados.'
                          : 'Nenhuma avaliação de desempenho registrada ainda.'}
                      {podeEscrever && colaboradores.length > 0 && !temFiltro && (
                        <div style={{ marginTop: 12 }}>
                          <button className="btn btn-primary" onClick={() => setModalAval({ modo: 'novo' })}><i className="ti ti-plus" /> Registrar a primeira avaliação</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {avaliacoesFiltradas.map((a) => (
                  <tr key={a.id} style={busy === a.id ? { opacity: 0.5 } : undefined}>
                    <td><b>{a.colaboradorNome}</b></td>
                    <td>{a.periodo || '—'}</td>
                    <td className="num-r">{fmtNota(a.nota_produtividade)}</td>
                    <td className="num-r">{fmtNota(a.nota_qualidade)}</td>
                    <td className="num-r">{fmtNota(a.nota_comportamento)}</td>
                    <td className="num-r">{fmtNota(a.nota_trabalho_equipe)}</td>
                    <td><span style={notaPill(a.nota_geral)}>{fmtNota(a.nota_geral)}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{dataBR(a.criado_em) || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {podeEscrever ? (
                        <>
                          <span className="os-link" onClick={() => { setErro(''); setModalAval({ modo: 'editar', row: a }) }}><i className="ti ti-edit" /> Editar</span>
                          <span className="os-link" style={{ color: 'var(--red)', marginLeft: 12 }} onClick={() => onExcluirAval(a)}><i className="ti ti-trash" /> Excluir</span>
                        </>
                      ) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cli-foot"><span>{avaliacoesFiltradas.length} avaliação(ões){temFiltro ? ' (filtrado)' : ''}</span></div>
        </div>
      )}

      {/* ── Aba PDI ── */}
      {aba === 'pdi' && (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr><th>Colaborador</th><th>Plano (PDI)</th><th>Prazo</th><th>Progresso</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {pdisFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                      <i className="ti ti-target-off" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
                      {colaboradores.length === 0
                        ? 'Nenhum colaborador ativo nesta unidade.'
                        : temFiltro
                          ? 'Nenhum PDI para os filtros selecionados.'
                          : 'Nenhum plano de desenvolvimento (PDI) cadastrado ainda.'}
                      {podeEscrever && colaboradores.length > 0 && !temFiltro && (
                        <div style={{ marginTop: 12 }}>
                          <button className="btn btn-primary" onClick={() => setModalPdi({ modo: 'novo' })}><i className="ti ti-plus" /> Criar o primeiro PDI</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {pdisFiltrados.map((p) => {
                  const prog = p.progresso ?? 0
                  return (
                    <tr key={p.id} style={busy === p.id ? { opacity: 0.5 } : undefined}>
                      <td><b>{p.colaboradorNome}</b></td>
                      <td>
                        <span className="cli-name">{p.titulo || '—'}</span>
                        {p.descricao && <div style={{ fontSize: 11.5, color: 'var(--text-3)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao}</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{p.prazo ? dataBR(p.prazo) : '—'}</td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 4, background: '#EEF2F7', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, prog)}%`, height: '100%', background: prog >= 100 ? '#15803D' : 'var(--brand-500)' }} />
                          </div>
                          <span style={{ fontSize: 11.5, color: 'var(--text-2)', minWidth: 30, textAlign: 'right' }}>{prog}%</span>
                        </div>
                      </td>
                      <td><span className={`os-st ${p.status === 'concluido' ? 'os-fechada' : p.status === 'cancelado' ? 'os-cancelada' : 'os-aberta'}`}>{PDI_STATUS_LBL[p.status ?? ''] ?? (p.status ?? 'planejado')}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {podeEscrever ? (
                          <>
                            <span className="os-link" onClick={() => onProgresso(p)} title="Atualizar progresso"><i className="ti ti-pencil-plus" /> Progresso</span>
                            <span className="os-link" style={{ marginLeft: 12 }} onClick={() => { setErro(''); setModalPdi({ modo: 'editar', row: p }) }}><i className="ti ti-edit" /> Editar</span>
                            <span className="os-link" style={{ color: 'var(--red)', marginLeft: 12 }} onClick={() => onExcluirPdi(p)}><i className="ti ti-trash" /> Excluir</span>
                          </>
                        ) : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cli-foot"><span>{pdisFiltrados.length} PDI(s){temFiltro ? ' (filtrado)' : ''}</span></div>
        </div>
      )}

      {/* ── Aba Metas (resumo — CRUD em Cadastros · Metas) ── */}
      {aba === 'metas' && (
        <div className="cli-card">
          <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '10px 14px 0' }}>
            <i className="ti ti-info-circle" /> Resumo das metas individuais. O cadastro/edição completo fica em <b>Cadastros · Metas</b>.
          </div>
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr><th>Colaborador</th><th>Indicador</th><th className="num-r">Meta</th><th className="num-r">Realizado</th><th>Atingido</th><th>Status</th></tr>
              </thead>
              <tbody>
                {metasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                      <i className="ti ti-trophy-off" style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
                      {colaboradores.length === 0
                        ? 'Nenhum colaborador ativo nesta unidade.'
                        : temFiltro
                          ? 'Nenhuma meta para os filtros selecionados.'
                          : 'Nenhuma meta individual cadastrada. Cadastre em Cadastros · Metas.'}
                    </td>
                  </tr>
                )}
                {metasFiltradas.map((m) => {
                  const alvo = m.valor_alvo ?? 0
                  const real = m.valor_realizado ?? 0
                  const pct = alvo > 0 ? Math.round((real / alvo) * 100) : 0
                  const ok = pct >= 100
                  return (
                    <tr key={m.id}>
                      <td><b>{m.colaboradorNome}</b></td>
                      <td>{INDICADOR_LBL[m.indicador ?? ''] ?? (m.indicador || '—')}</td>
                      <td className="num-r">{alvo.toLocaleString('pt-BR')}</td>
                      <td className="num-r">{real.toLocaleString('pt-BR')}</td>
                      <td><span className={`os-st ${ok ? 'os-fechada' : 'os-aberta'}`}>{pct}%</span></td>
                      <td><span className="os-st">{m.status ?? 'ativa'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cli-foot"><span>{metasFiltradas.length} meta(s){temFiltro ? ' (filtrado)' : ''} · {kpis.metasBatidas} batida(s)</span></div>
        </div>
      )}

      {modalAval && (
        <AvaliacaoModal
          modo={modalAval.modo}
          row={modalAval.row}
          colaboradores={colaboradores}
          onClose={() => setModalAval(null)}
          onSaved={() => { setModalAval(null); router.refresh() }}
        />
      )}
      {modalPdi && (
        <PdiModal
          modo={modalPdi.modo}
          row={modalPdi.row}
          colaboradores={colaboradores}
          onClose={() => setModalPdi(null)}
          onSaved={() => { setModalPdi(null); router.refresh() }}
        />
      )}
    </div>
  )
}
