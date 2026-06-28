'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { moedaBR, dataBR } from '@/lib/fmt'
import {
  novoLancamento,
  registrarPagamento,
  editarLancamento,
  type NovoLancamentoInput,
} from '@/app/(app)/contas/actions'

export type Categoria = {
  id: string
  parent_id: string | null
  codigo: string | null
  nome: string
  tipo: string
  aceita_lancamentos: boolean | null
  ativo: boolean | null
}

export type LancRow = {
  id: string
  descricao: string | null
  valor: number | null
  status: string | null
  data_vencimento: string | null
  data_pagamento: string | null
  categoria_id: string | null
  unidade_id?: string | null
  forma_pagamento: string | null
  fornecedor?: string | null
  observacao: string | null
  tipo: string | null
  categoria?: string
  unidade?: string
  statusEfetivo?: 'pago' | 'pendente' | 'atrasado'
}

type Aba = 'pagar' | 'receber'

type Props = {
  aba: Aba
  tipo: 'receita' | 'despesa'
  rows: LancRow[]
  categorias: Categoria[]
  podeEscrever: boolean
  activeUnitId: string | null
  activeUnitName: string
  unidades: { id: string; nome: string }[]
  mostrarUnidade: boolean
  filtros: { status: string; categoria: string; fornecedor: string; unidade: string; di: string; df: string }
  kpis: { previsto: number; realizado: number; emAberto: number; atrasado: number }
  page: number
  totalPages: number
  total: number
  kpiCapped: boolean
}

const STATUS_PILL: Record<string, { bg: string; c: string; t: string }> = {
  pago: { bg: '#E7F0EC', c: '#15803D', t: 'Pago' },
  atrasado: { bg: '#FBE9EB', c: '#D85563', t: 'Atrasado' },
  pendente: { bg: '#FBEFD9', c: '#9A6700', t: 'Em aberto' },
}

/** Rótulo da categoria com indentação por nível (codigo "4.1" => 1 nível). */
function rotuloCat(c: Categoria): string {
  const niveis = (c.codigo || '').split('.').length - 1
  const prefixo = niveis > 0 ? '— '.repeat(niveis) : ''
  return `${prefixo}${c.codigo ? c.codigo + ' · ' : ''}${c.nome}`
}

export function ContasManager(props: Props) {
  const { aba, tipo, rows, categorias, podeEscrever, activeUnitId, activeUnitName, unidades, mostrarUnidade, filtros, kpis, page, totalPages, total, kpiCapped } = props
  const router = useRouter()

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<LancRow | null>(null)

  // Só subcategorias (folhas) aceitam lançamentos — usadas no <select> do form.
  const catsFolha = useMemo(() => categorias.filter((c) => c.aceita_lancamentos !== false), [categorias])

  const ehReceber = aba === 'receber'
  const acaoLabel = ehReceber ? 'Registrar recebimento' : 'Dar baixa'

  // ── URLs preservando filtros ──
  function urlCom(extra: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    p.set('aba', aba)
    if (filtros.status) p.set('status', filtros.status)
    if (filtros.categoria) p.set('categoria', filtros.categoria)
    if (filtros.fornecedor) p.set('fornecedor', filtros.fornecedor)
    if (filtros.unidade) p.set('unidade', filtros.unidade)
    if (filtros.di) p.set('di', filtros.di)
    if (filtros.df) p.set('df', filtros.df)
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === '' || v === null) p.delete(k)
      else p.set(k, String(v))
    }
    const s = p.toString()
    return `/contas${s ? `?${s}` : ''}`
  }
  const urlAba = (a: Aba) => `/contas?aba=${a}` // troca de aba zera filtros/página
  const urlPagina = (pg: number) => urlCom({ page: pg > 1 ? pg : undefined })

  async function baixar(id: string) {
    setBusy(id)
    setMsg('')
    const r = await registrarPagamento(id)
    setBusy(null)
    if (!r.ok) setMsg(r.error || 'Erro ao registrar.')
    else {
      setMsg(ehReceber ? 'Recebimento registrado.' : 'Baixa registrada.')
      router.refresh()
    }
  }

  const temFiltro = !!(filtros.status || filtros.categoria || filtros.fornecedor || filtros.unidade || filtros.di || filtros.df)

  // Export CSV (legado: botão "Exportar" do view-contas) — exporta a PÁGINA atual
  // já carregada (mesmo filtro do servidor). Gera e baixa client-side, sem libs.
  function exportarCSV() {
    setMsg('')
    if (rows.length === 0) { setMsg('Nada para exportar com os filtros atuais.'); return }
    const head = ['Descrição', 'Fornecedor', 'Categoria', 'Unidade', 'Vencimento', 'Pagamento', 'Valor', 'Status']
    const esc = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`
    const linhas = rows.map((r) => [
      r.descricao ?? '',
      r.fornecedor ?? '',
      r.categoria ?? '',
      r.unidade ?? '',
      r.data_vencimento ? dataBR(r.data_vencimento) : '',
      r.data_pagamento ? dataBR(r.data_pagamento) : '',
      (r.valor ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      (r.statusEfetivo || r.status || ''),
    ].map((c) => esc(String(c))).join(';'))
    const csv = '﻿' + [head.map(esc).join(';'), ...linhas].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contas-${aba}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-building-store" /> Contas a pagar e a receber da unidade{' '}
        <b>{activeUnitName}</b>
        {!activeUnitId && ' (todas as unidades — selecione uma no topo para lançar)'}.
      </div>

      {/* Abas Pagar | Receber */}
      <div className="seg" style={{ marginBottom: 16 }}>
        <Link href={urlAba('pagar')} className={`seg-btn${aba === 'pagar' ? ' active' : ''}`}>
          <i className="ti ti-arrow-up-right" /> Contas a pagar
        </Link>
        <Link href={urlAba('receber')} className={`seg-btn${aba === 'receber' ? ' active' : ''}`}>
          <i className="ti ti-arrow-down-left" /> Contas a receber
        </Link>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box">
          <span>Total previsto</span>
          <b>{moedaBR(kpis.previsto)}</b>
        </div>
        <div className="metric-box">
          <span>{ehReceber ? 'Recebido' : 'Pago / realizado'}</span>
          <b style={{ color: '#15803D' }}>{moedaBR(kpis.realizado)}</b>
        </div>
        <div className="metric-box">
          <span>Em aberto</span>
          <b style={{ color: '#9A6700' }}>{moedaBR(kpis.emAberto)}</b>
        </div>
        <div className="metric-box">
          <span>Atrasado</span>
          <b style={{ color: '#D85563' }}>{moedaBR(kpis.atrasado)}</b>
        </div>
      </div>
      {kpiCapped && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 10 }}>
          <i className="ti ti-info-circle" /> Volume muito alto: os totais consideram os primeiros 100 mil lançamentos do filtro. Refine o período para valores exatos.
        </div>
      )}

      {/* Ações + Filtros (form GET → server re-renderiza) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever ? (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }} disabled={!activeUnitId} title={!activeUnitId ? 'Selecione uma unidade no topo' : undefined}>
            <i className="ti ti-plus" /> Novo lançamento
          </button>
        ) : null}
      </div>

      <form method="GET" action="/contas" className="rel-card" style={{ marginBottom: 14 }}>
        <input type="hidden" name="aba" value={aba} />
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue={filtros.status}>
              <option value="">Todos</option>
              <option value="pendente">Em aberto</option>
              <option value="atrasado">Atrasado</option>
              <option value="pago">{ehReceber ? 'Recebido' : 'Pago'}</option>
            </select>
          </div>
          <div className="field">
            <label>Categoria</label>
            <select name="categoria" defaultValue={filtros.categoria}>
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id} disabled={c.aceita_lancamentos === false}>
                  {rotuloCat(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Fornecedor</label>
            <input name="fornecedor" defaultValue={filtros.fornecedor} placeholder="Nome do fornecedor" />
          </div>
          {mostrarUnidade && (
            <div className="field">
              <label>Unidade (nosso × franquia)</label>
              <select name="unidade" defaultValue={filtros.unidade}>
                <option value="">Todas (rede + lojas)</option>
                <option value="franqueadora">Franqueadora / rede (nosso)</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Vencimento de</label>
            <input type="date" name="di" defaultValue={filtros.di} />
          </div>
          <div className="field">
            <label>Vencimento até</label>
            <input type="date" name="df" defaultValue={filtros.df} />
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
          {temFiltro && (
            <Link href={urlAba(aba)} className="btn"><i className="ti ti-x" /> Limpar</Link>
          )}
          {/* Exportar (legado: botão "Exportar" do view-contas) — CSV da página atual. */}
          <button type="button" className="btn" onClick={exportarCSV} title="Exportar os lançamentos exibidos em CSV">
            <i className="ti ti-download" /> Exportar CSV
          </button>
        </div>
      </form>

      {msg && (
        <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list" /> {total} lançamento(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      {/* Tabela */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Fornecedor</th>
                <th>Categoria</th>
                {mostrarUnidade && <th>Unidade</th>}
                <th>Vencimento</th>
                <th className="num-r">Valor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={mostrarUnidade ? 8 : 7} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum lançamento {ehReceber ? 'a receber' : 'a pagar'}
                    {temFiltro ? ' com esses filtros' : ' nesta unidade'}.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const eff = r.statusEfetivo || 'pendente'
                const pill = STATUS_PILL[eff] || STATUS_PILL.pendente
                return (
                  <tr key={r.id}>
                    <td>{r.descricao || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.fornecedor || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.categoria || '—'}</td>
                    {mostrarUnidade && (
                      <td style={{ fontSize: 12, color: r.unidade_id ? 'var(--text-2)' : 'var(--brand-600)', fontWeight: r.unidade_id ? 400 : 600 }}>
                        {r.unidade || '—'}
                      </td>
                    )}
                    <td>{dataBR(r.data_vencimento)}</td>
                    <td className="num-r"><b>{moedaBR(r.valor)}</b></td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: pill.bg, color: pill.c }}>
                        {pill.t}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {podeEscrever && (
                        <>
                          <button className="btn" style={{ marginRight: 6 }} onClick={() => { setMsg(''); setEditRow(r) }}>
                            <i className="ti ti-pencil" />
                          </button>
                          {r.status !== 'pago' && (
                            <button className="btn btn-primary" disabled={busy === r.id} onClick={() => baixar(r.id)}>
                              {busy === r.id ? '…' : (<><i className="ti ti-check" /> {acaoLabel}</>)}
                            </button>
                          )}
                        </>
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
              {page > 1 ? (
                <Link className="btn" href={urlPagina(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>
              )}
              {page < totalPages ? (
                <Link className="btn" href={urlPagina(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
              ) : (
                <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Novo lançamento */}
      {novoOpen && (
        <LancamentoForm
          modo="novo"
          aba={aba}
          tipo={tipo}
          catsFolha={catsFolha}
          activeUnitId={activeUnitId}
          onClose={() => setNovoOpen(false)}
          onSaved={(m) => { setNovoOpen(false); setMsg(m); router.refresh() }}
        />
      )}

      {/* Modal Editar */}
      {editRow && (
        <LancamentoForm
          modo="editar"
          aba={aba}
          tipo={tipo}
          catsFolha={catsFolha}
          activeUnitId={activeUnitId}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={(m) => { setEditRow(null); setMsg(m); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Form (modal) ───────────────────────────

function LancamentoForm(props: {
  modo: 'novo' | 'editar'
  aba: Aba
  tipo: 'receita' | 'despesa'
  catsFolha: Categoria[]
  activeUnitId: string | null
  row?: LancRow
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { modo, aba, tipo, catsFolha, activeUnitId, row, onClose, onSaved } = props
  const hoje = new Date().toISOString().slice(0, 10)

  const [f, setF] = useState({
    descricao: row?.descricao ?? '',
    valor: row?.valor != null ? String(row.valor) : '',
    categoria_id: row?.categoria_id ?? (catsFolha[0]?.id ?? ''),
    data_vencimento: row?.data_vencimento ?? hoje,
    forma_pagamento: row?.forma_pagamento ?? '',
    fornecedor: row?.fornecedor ?? '',
    observacao: row?.observacao ?? '',
    jaPago: false,
  })
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const titulo = modo === 'novo'
    ? aba === 'receber' ? 'Novo recebível' : 'Nova conta a pagar'
    : 'Editar lançamento'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    // validação por campo no cliente (o servidor revalida)
    if (!f.descricao.trim()) { setErr('Informe a descrição.'); return }
    const valorNum = Number(f.valor.replace(',', '.'))
    if (!f.valor.trim() || !Number.isFinite(valorNum)) { setErr('Informe um valor numérico.'); return }
    if (valorNum <= 0) { setErr('O valor deve ser maior que zero.'); return }
    if (!f.categoria_id) { setErr('Selecione a categoria.'); return }
    if (!f.data_vencimento) { setErr('Informe o vencimento.'); return }

    setSaving(true)
    let r
    if (modo === 'novo') {
      const input: NovoLancamentoInput = {
        tipo,
        descricao: f.descricao,
        valor: valorNum,
        categoria_id: f.categoria_id,
        data_vencimento: f.data_vencimento,
        status: f.jaPago ? 'pago' : 'pendente',
        forma_pagamento: f.forma_pagamento || null,
        fornecedor: f.fornecedor || null,
        observacao: f.observacao || null,
        unidade_id: activeUnitId,
      }
      r = await novoLancamento(input)
    } else {
      r = await editarLancamento({
        id: row!.id,
        tipo,
        descricao: f.descricao,
        valor: valorNum,
        categoria_id: f.categoria_id,
        data_vencimento: f.data_vencimento,
        forma_pagamento: f.forma_pagamento || null,
        fornecedor: f.fornecedor || null,
        observacao: f.observacao || null,
      })
    }
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved(modo === 'novo' ? 'Lançamento criado.' : 'Lançamento atualizado.')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal" style={{ width: 520 }}>
        <div className="modal-head">
          <h3><i className={`ti ${aba === 'receber' ? 'ti-arrow-down-left' : 'ti-arrow-up-right'}`} /> {titulo}</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Descrição <span className="req">*</span></label>
            <input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder={aba === 'receber' ? 'Ex.: Mensalidade cliente X' : 'Ex.: Aluguel maio'} autoFocus />
          </div>
          <div className="mf">
            <label>Valor (R$) <span className="req">*</span></label>
            <input value={f.valor} onChange={(e) => set('valor', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="mf">
            <label>Vencimento <span className="req">*</span></label>
            <input type="date" value={f.data_vencimento} onChange={(e) => set('data_vencimento', e.target.value)} />
          </div>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Categoria <span className="req">*</span></label>
            <select value={f.categoria_id} onChange={(e) => set('categoria_id', e.target.value)}>
              <option value="">Selecione…</option>
              {catsFolha.map((c) => (
                <option key={c.id} value={c.id}>{rotuloCat(c)}</option>
              ))}
            </select>
          </div>
          <div className="mf">
            <label>Forma de pagamento</label>
            <select value={f.forma_pagamento} onChange={(e) => set('forma_pagamento', e.target.value)}>
              <option value="">—</option>
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartao_credito">Cartão de crédito</option>
              <option value="cartao_debito">Cartão de débito</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
            </select>
          </div>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Fornecedor</label>
            <input value={f.fornecedor} onChange={(e) => set('fornecedor', e.target.value)} placeholder={aba === 'receber' ? 'Pagador / origem (opcional)' : 'Nome do fornecedor (opcional)'} />
          </div>
          {modo === 'novo' && (
            <div className="mf" style={{ gridColumn: '1 / -1', justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.jaPago} onChange={(e) => set('jaPago', e.target.checked)} style={{ width: 'auto' }} />
                {aba === 'receber' ? 'Já recebido' : 'Já pago'}
              </label>
            </div>
          )}
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Observação</label>
            <textarea value={f.observacao} onChange={(e) => set('observacao', e.target.value)} style={{ minHeight: 60 }} />
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
