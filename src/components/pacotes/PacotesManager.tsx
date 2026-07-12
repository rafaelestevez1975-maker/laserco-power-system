'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import {
  criarPacote,
  editarPacote,
  togglePacoteAtivo,
  type PacoteInput,
  type ItemPacoteInput,
} from '@/app/(app)/pacotes/actions'
import {
  PAGAR_COMISSAO_OPCOES,
  COBERTURA_OPCOES,
  type PagarComissao,
  type CoberturaCreditos,
} from '@/lib/catalogo'

export type ServicoOpt = { id: string; nome: string; grupo: string | null }

export type ItemComNome = { servico_id: string; quantidade: number; servico_nome: string; grupo: string | null }

export type PacoteRow = {
  id: string
  nome: string
  descricao: string | null
  preco: number | null
  validade_dias: number | null
  cobertura_creditos: string | null
  desc_max: number | null
  pagar_comissao: string | null
  ativo: boolean | null
  criado_em: string | null
  itens: ItemComNome[]
}

/** Badge de timing de comissão  cores do legado (comTag). */
function ComTag({ v }: { v: string | null }) {
  const val = v || 'Execução'
  const bg = val === 'Não pagar' ? '#eeeeee' : val === 'Venda' ? '#E7EEFB' : '#E7F0EC'
  const c = val === 'Não pagar' ? '#777' : val === 'Venda' ? '#1E3A8A' : '#0F6B3A'
  return <span className="orig-tag" style={{ background: bg, color: c }}>{val}</span>
}

type Props = {
  pacotes: PacoteRow[]
  servicos: ServicoOpt[]
  podeEscrever: boolean
  kpis: { total: number; ativos: number; inativos: number }
  filtros: { q: string; ativo: string }
  page: number
  totalPages: number
  total: number
  temFiltro: boolean
}

const GROUP_ORDER = ['Depilação', 'Estético', 'Ultrassom']
function ordGrupo(g: string | null): number {
  const i = GROUP_ORDER.indexOf(g || '')
  return i < 0 ? 99 : i
}

export function PacotesManager(props: Props) {
  const { pacotes, servicos, podeEscrever, kpis, filtros, page, totalPages, total, temFiltro } = props
  const router = useRouter()

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<PacoteRow | null>(null)

  function urlCom(extra: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    if (filtros.q) p.set('q', filtros.q)
    if (filtros.ativo && filtros.ativo !== 'sim') p.set('ativo', filtros.ativo)
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === '' || v === null) p.delete(k)
      else p.set(k, String(v))
    }
    const s = p.toString()
    return `/pacotes${s ? `?${s}` : ''}`
  }
  const urlPagina = (pg: number) => urlCom({ page: pg > 1 ? pg : undefined })

  async function toggle(p: PacoteRow) {
    setBusy(p.id)
    setMsg('')
    const r = await togglePacoteAtivo(p.id, !p.ativo)
    setBusy(null)
    if (!r.ok) setMsg(r.error || 'Erro ao alterar.')
    else {
      setMsg(p.ativo ? 'Pacote inativado.' : 'Pacote reativado.')
      router.refresh()
    }
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-package" /> Pacotes de serviços da rede  combine serviços e sessões, defina preço e validade.
        Disponíveis em todas as unidades.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Total de pacotes', kpis.total, 'ti-package'],
          ['Ativos', kpis.ativos, 'ti-circle-check'],
          ['Inativos', kpis.inativos, 'ti-ban'],
        ] as [string, number, string][]).map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Novo pacote
          </button>
        )}
      </div>

      {/* Filtros (form GET) */}
      <form method="GET" action="/pacotes" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Buscar por nome</label>
            <input name="q" defaultValue={filtros.q} placeholder="Ex.: Depilação Corpo Todo" />
          </div>
          <div className="field">
            <label>Situação</label>
            <select name="ativo" defaultValue={filtros.ativo}>
              <option value="sim">Ativos</option>
              <option value="nao">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
          {temFiltro && <Link href="/pacotes" className="btn"><i className="ti ti-x" /> Limpar</Link>}
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>}

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list" /> {total} pacote(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      {/* Tabela */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Pacote</th>
                <th>Composição</th>
                <th>Cobertura</th>
                <th className="num-r">Validade</th>
                <th className="num-r">Preço</th>
                <th className="num-r">Desc. Máx</th>
                <th>Pagar comissão</th>
                <th>Ativo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pacotes.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum pacote{temFiltro ? ' com esses filtros' : ' cadastrado'}.
                    {podeEscrever && !temFiltro && ' Clique em “Novo pacote” para criar o primeiro.'}
                  </td>
                </tr>
              )}
              {pacotes.map((p) => {
                const totalSessoes = p.itens.reduce((a, c) => a + (c.quantidade || 0), 0)
                return (
                  <tr key={p.id} style={p.ativo ? undefined : { opacity: 0.55 }}>
                    <td style={{ maxWidth: 380 }}>
                      <span className="cli-name">{p.nome}</span>
                      {p.descricao && <div title={p.descricao} style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao}</div>}
                    </td>
                    <td style={{ color: 'var(--text-2)', fontSize: 12, whiteSpace: 'normal', maxWidth: 320 }}>
                      {p.itens.length === 0 ? (
                        ''
                      ) : (
                        <>
                          <i className="ti ti-list-check" style={{ verticalAlign: -1 }} /> {p.itens.length} serviço(s) · {totalSessoes} sessão(ões)
                          <div style={{ marginTop: 2 }}>
                            {p.itens.slice(0, 3).map((it) => `${it.servico_nome} (${it.quantidade}x)`).join(', ')}
                            {p.itens.length > 3 ? ` +${p.itens.length - 3}` : ''}
                          </div>
                        </>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-2)', fontSize: 12, whiteSpace: 'normal', maxWidth: 150 }}>{p.cobertura_creditos || 'Qualquer unidade'}</td>
                    <td className="num-r">{p.validade_dias != null ? `${p.validade_dias} dias` : ''}</td>
                    <td className="num-r"><b>{moedaBR(p.preco)}</b></td>
                    <td className="num-r">{p.desc_max != null && p.desc_max > 0 ? `${p.desc_max.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : <span className="muted"></span>}</td>
                    <td><ComTag v={p.pagar_comissao} /></td>
                    <td>{p.ativo ? <span className="pill-yes">Sim</span> : <span className="pill-no">Não</span>}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {podeEscrever && (
                        <>
                          <button className="btn" style={{ marginRight: 6 }} title="Editar" onClick={() => { setMsg(''); setEditRow(p) }}>
                            <i className="ti ti-pencil" />
                          </button>
                          <button className="btn" disabled={busy === p.id} title={p.ativo ? 'Inativar' : 'Reativar'} onClick={() => toggle(p)}>
                            {busy === p.id ? '…' : <i className={`ti ${p.ativo ? 'ti-ban' : 'ti-circle-check'}`} style={{ color: p.ativo ? 'var(--red)' : 'var(--green)' }} />}
                          </button>
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

      {novoOpen && (
        <PacoteForm
          modo="novo"
          servicos={servicos}
          onClose={() => setNovoOpen(false)}
          onSaved={(m) => { setNovoOpen(false); setMsg(m); router.refresh() }}
        />
      )}
      {editRow && (
        <PacoteForm
          modo="editar"
          servicos={servicos}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={(m) => { setEditRow(null); setMsg(m); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Form (modal) ───────────────────────────

type LinhaItem = { servico_id: string; quantidade: string }

function PacoteForm(props: {
  modo: 'novo' | 'editar'
  servicos: ServicoOpt[]
  row?: PacoteRow
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { modo, servicos, row, onClose, onSaved } = props

  const [f, setF] = useState({
    nome: row?.nome ?? '',
    descricao: row?.descricao ?? '',
    preco: row?.preco != null ? String(row.preco) : '',
    validade_dias: row?.validade_dias != null ? String(row.validade_dias) : '365',
    cobertura_creditos: (COBERTURA_OPCOES.includes(row?.cobertura_creditos as CoberturaCreditos) ? row!.cobertura_creditos : 'Qualquer unidade') as CoberturaCreditos,
    desc_max: row?.desc_max != null ? String(row.desc_max) : '',
    pagar_comissao: (PAGAR_COMISSAO_OPCOES.includes(row?.pagar_comissao as PagarComissao) ? row!.pagar_comissao : 'Execução') as PagarComissao,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))

  const [itens, setItens] = useState<LinhaItem[]>(
    row && row.itens.length
      ? row.itens.map((it) => ({ servico_id: it.servico_id, quantidade: String(it.quantidade) }))
      : [{ servico_id: servicos[0]?.id ?? '', quantidade: '1' }],
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Serviços agrupados por grupo (optgroup)  usa a mesma ordem do legado.
  const grupos = useMemo(() => {
    const m = new Map<string, ServicoOpt[]>()
    for (const s of servicos) {
      const g = s.grupo || 'Outros'
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(s)
    }
    return [...m.entries()].sort((a, b) => ordGrupo(a[0]) - ordGrupo(b[0]) || a[0].localeCompare(b[0]))
  }, [servicos])

  function addLinha() {
    setItens((p) => [...p, { servico_id: servicos[0]?.id ?? '', quantidade: '1' }])
  }
  function removeLinha(idx: number) {
    setItens((p) => p.filter((_, i) => i !== idx))
  }
  function setLinha(idx: number, k: keyof LinhaItem, v: string) {
    setItens((p) => p.map((l, i) => (i === idx ? { ...l, [k]: v } : l)))
  }

  const totalSessoes = itens.reduce((a, l) => a + (parseInt(l.quantidade) || 0), 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Informe o nome do pacote.'); return }
    if (f.nome.trim().length < 3) { setErr('Nome muito curto.'); return }
    const precoNum = Number(f.preco.replace(',', '.'))
    if (!f.preco.trim() || !Number.isFinite(precoNum) || precoNum < 0) { setErr('Informe um preço válido (R$).'); return }
    const valNum = f.validade_dias.trim() === '' ? null : Number(f.validade_dias)
    if (valNum != null && (!Number.isInteger(valNum) || valNum < 0)) { setErr('Validade em dias inválida.'); return }
    const descNum = f.desc_max.trim() === '' ? 0 : Number(f.desc_max.replace(',', '.'))
    if (!Number.isFinite(descNum) || descNum < 0 || descNum > 100) { setErr('O desconto máximo deve estar entre 0% e 100%.'); return }

    const limpos = itens.filter((l) => l.servico_id)
    if (limpos.length === 0) { setErr('Adicione ao menos um serviço.'); return }
    const ids = limpos.map((l) => l.servico_id)
    if (new Set(ids).size !== ids.length) { setErr('Há serviços repetidos. Junte as sessões em uma linha.'); return }
    const itensInput: ItemPacoteInput[] = []
    for (const l of limpos) {
      const q = parseInt(l.quantidade)
      if (!Number.isFinite(q) || q < 1) { setErr('Cada serviço precisa de 1 sessão ou mais.'); return }
      itensInput.push({ servico_id: l.servico_id, quantidade: q })
    }

    const payload: PacoteInput = {
      nome: f.nome,
      descricao: f.descricao || null,
      preco: precoNum,
      validade_dias: valNum,
      cobertura_creditos: f.cobertura_creditos,
      desc_max: descNum,
      pagar_comissao: f.pagar_comissao,
      itens: itensInput,
    }
    setSaving(true)
    const r = modo === 'novo' ? await criarPacote(payload) : await editarPacote(row!.id, payload)
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved(modo === 'novo' ? 'Pacote criado.' : 'Pacote atualizado.')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal" style={{ width: 680, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-head">
          <h3><i className="ti ti-package" /> {modo === 'novo' ? 'Novo pacote' : 'Editar pacote'}</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Nome <span className="req">*</span></label>
            <input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Pacote Depilação Corpo Todo" autoFocus />
          </div>
          <div className="mf">
            <label>Preço (R$) <span className="req">*</span></label>
            <input value={f.preco} onChange={(e) => set('preco', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="mf">
            <label>Validade em dias</label>
            <input value={f.validade_dias} onChange={(e) => set('validade_dias', e.target.value)} inputMode="numeric" placeholder="365" />
          </div>
          <div className="mf">
            <label>Cobertura de créditos</label>
            <select value={f.cobertura_creditos} onChange={(e) => set('cobertura_creditos', e.target.value as CoberturaCreditos)}>
              {COBERTURA_OPCOES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="mf">
            <label>Desconto máximo (%)</label>
            <input value={f.desc_max} onChange={(e) => set('desc_max', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Pagar comissão</label>
            <select value={f.pagar_comissao} onChange={(e) => set('pagar_comissao', e.target.value as PagarComissao)}>
              {PAGAR_COMISSAO_OPCOES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
              Quando a comissão deste pacote é paga: na <b>venda</b>, na <b>execução</b> das sessões, ou <b>não pagar</b>.
            </div>
          </div>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Descrição</label>
            <textarea value={f.descricao} onChange={(e) => set('descricao', e.target.value)} style={{ minHeight: 50 }} placeholder="Opcional" />
          </div>

          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Serviços do pacote <span className="req">*</span>  combine um ou mais serviços, cada um com uma ou mais sessões</label>
            {servicos.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--red)' }}>Nenhum serviço ativo cadastrado. Cadastre serviços antes de montar um pacote.</div>
            ) : (
              <div style={{ marginTop: 6 }}>
                {itens.map((l, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <select value={l.servico_id} onChange={(e) => setLinha(idx, 'servico_id', e.target.value)} style={{ flex: 1, minWidth: 0 }}>
                      <option value="">Selecione…</option>
                      {grupos.map(([g, items]) => (
                        <optgroup key={g} label={g}>
                          {items.map((s) => (<option key={s.id} value={s.id}>{s.nome}</option>))}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={l.quantidade}
                      onChange={(e) => setLinha(idx, 'quantidade', e.target.value)}
                      style={{ width: 90 }}
                      title="Número de sessões"
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>sessão(ões)</span>
                    <button type="button" className="btn" onClick={() => removeLinha(idx)} disabled={itens.length === 1} title="Remover serviço">
                      <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost" onClick={addLinha} style={{ marginTop: 4 }}>
                  <i className="ti ti-plus" /> Adicionar serviço
                </button>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                  {itens.filter((l) => l.servico_id).length} serviço(s) · {totalSessoes} sessão(ões) no total
                </div>
              </div>
            )}
          </div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, padding: '0 22px' }}>{err}</p>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || servicos.length === 0}>{saving ? 'Salvando…' : 'Salvar pacote'}</button>
        </div>
      </form>
    </div>
  )
}
