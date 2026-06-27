'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { moedaBR } from '@/lib/fmt'
import {
  criarPlano,
  editarPlano,
  togglePlanoAtivo,
  type PlanoInput,
  type ItemPlanoInput,
} from '@/app/(app)/planos/actions'

export type ServicoOpt = { id: string; nome: string; grupo: string | null }

export type ItemComNome = { servico_id: string; quantidade_mensal: number; servico_nome: string; grupo: string | null }

export type PlanoRow = {
  id: string
  nome: string
  descricao: string | null
  valor_mensal: number | null
  valor_adesao: number | null
  duracao_meses: number | null
  beneficios: string[] | null
  ativo: boolean | null
  criado_em: string | null
  itens: ItemComNome[]
}

type Props = {
  planos: PlanoRow[]
  servicos: ServicoOpt[]
  podeEscrever: boolean
  kpis: { total: number; ativos: number; ticketMedio: number }
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

export function PlanosManager(props: Props) {
  const { planos, servicos, podeEscrever, kpis, filtros, page, totalPages, total, temFiltro } = props
  const router = useRouter()

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<PlanoRow | null>(null)

  function urlCom(extra: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    if (filtros.q) p.set('q', filtros.q)
    if (filtros.ativo && filtros.ativo !== 'sim') p.set('ativo', filtros.ativo)
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === '' || v === null) p.delete(k)
      else p.set(k, String(v))
    }
    const s = p.toString()
    return `/planos${s ? `?${s}` : ''}`
  }
  const urlPagina = (pg: number) => urlCom({ page: pg > 1 ? pg : undefined })

  async function toggle(p: PlanoRow) {
    setBusy(p.id)
    setMsg('')
    const r = await togglePlanoAtivo(p.id, !p.ativo)
    setBusy(null)
    if (!r.ok) setMsg(r.error || 'Erro ao alterar.')
    else {
      setMsg(p.ativo ? 'Plano inativado.' : 'Plano reativado.')
      router.refresh()
    }
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-id-badge-2" /> Planos de assinatura da rede (Bronze, Prata, Ouro…) — adesão, mensalidade,
        duração, serviços incluídos e benefícios.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Planos cadastrados', kpis.total.toLocaleString('pt-BR'), 'ti-id-badge-2'],
          ['Ativos', kpis.ativos.toLocaleString('pt-BR'), 'ti-circle-check'],
          ['Ticket médio (mensal)', moedaBR(kpis.ticketMedio), 'ti-receipt'],
        ] as [string, string, string][]).map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val}</b>
            </span>
          </div>
        ))}
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Novo plano
          </button>
        )}
      </div>

      {/* Filtros */}
      <form method="GET" action="/planos" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Buscar por nome</label>
            <input name="q" defaultValue={filtros.q} placeholder="Ex.: Plano Ouro" />
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
          {temFiltro && <Link href="/planos" className="btn"><i className="ti ti-x" /> Limpar</Link>}
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>}

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list" /> {total} plano(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      {/* Tabela */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Plano</th>
                <th className="num-r">Adesão</th>
                <th className="num-r">Mensalidade</th>
                <th className="num-r">Duração</th>
                <th>Incluído</th>
                <th>Ativo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {planos.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    Nenhum plano{temFiltro ? ' com esses filtros' : ' cadastrado'}.
                    {podeEscrever && !temFiltro && ' Clique em “Novo plano” para criar o primeiro.'}
                  </td>
                </tr>
              )}
              {planos.map((p) => {
                const benef = (p.beneficios ?? []).filter(Boolean)
                return (
                  <tr key={p.id} style={p.ativo ? undefined : { opacity: 0.55 }}>
                    <td>
                      <span className="cli-name">{p.nome}</span>
                      {p.descricao && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.descricao}</div>}
                      {benef.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          <i className="ti ti-gift" style={{ verticalAlign: -1 }} /> {benef.slice(0, 3).join(' · ')}{benef.length > 3 ? ` +${benef.length - 3}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="num-r">{p.valor_adesao ? moedaBR(p.valor_adesao) : <span className="orig-tag">Sem adesão</span>}</td>
                    <td className="num-r"><b>{moedaBR(p.valor_mensal)}</b></td>
                    <td className="num-r">{p.duracao_meses != null ? `${p.duracao_meses} m` : '—'}</td>
                    <td style={{ color: 'var(--text-2)', fontSize: 12, whiteSpace: 'normal', maxWidth: 260 }}>
                      {p.itens.length === 0 ? (
                        '—'
                      ) : (
                        <>
                          <i className="ti ti-list-check" style={{ verticalAlign: -1 }} /> {p.itens.length} serviço(s)/mês
                          <div style={{ marginTop: 2 }}>
                            {p.itens.slice(0, 3).map((it) => `${it.servico_nome} (${it.quantidade_mensal}x)`).join(', ')}
                            {p.itens.length > 3 ? ` +${p.itens.length - 3}` : ''}
                          </div>
                        </>
                      )}
                    </td>
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
        <PlanoForm
          modo="novo"
          servicos={servicos}
          onClose={() => setNovoOpen(false)}
          onSaved={(m) => { setNovoOpen(false); setMsg(m); router.refresh() }}
        />
      )}
      {editRow && (
        <PlanoForm
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

type LinhaItem = { servico_id: string; quantidade_mensal: string }

function PlanoForm(props: {
  modo: 'novo' | 'editar'
  servicos: ServicoOpt[]
  row?: PlanoRow
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { modo, servicos, row, onClose, onSaved } = props

  const [f, setF] = useState({
    nome: row?.nome ?? '',
    descricao: row?.descricao ?? '',
    valor_mensal: row?.valor_mensal != null ? String(row.valor_mensal) : '',
    valor_adesao: row?.valor_adesao != null ? String(row.valor_adesao) : '',
    duracao_meses: row?.duracao_meses != null ? String(row.duracao_meses) : '',
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const [beneficios, setBeneficios] = useState<string[]>(
    row && row.beneficios && row.beneficios.length ? [...row.beneficios] : [''],
  )
  const [itens, setItens] = useState<LinhaItem[]>(
    row && row.itens.length
      ? row.itens.map((it) => ({ servico_id: it.servico_id, quantidade_mensal: String(it.quantidade_mensal) }))
      : [],
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const grupos = useMemo(() => {
    const m = new Map<string, ServicoOpt[]>()
    for (const s of servicos) {
      const g = s.grupo || 'Outros'
      if (!m.has(g)) m.set(g, [])
      m.get(g)!.push(s)
    }
    return [...m.entries()].sort((a, b) => ordGrupo(a[0]) - ordGrupo(b[0]) || a[0].localeCompare(b[0]))
  }, [servicos])

  function setBenef(i: number, v: string) { setBeneficios((p) => p.map((b, idx) => (idx === i ? v : b))) }
  function addBenef() { setBeneficios((p) => [...p, '']) }
  function removeBenef(i: number) { setBeneficios((p) => (p.length === 1 ? [''] : p.filter((_, idx) => idx !== i))) }

  function addLinha() { setItens((p) => [...p, { servico_id: servicos[0]?.id ?? '', quantidade_mensal: '1' }]) }
  function removeLinha(idx: number) { setItens((p) => p.filter((_, i) => i !== idx)) }
  function setLinha(idx: number, k: keyof LinhaItem, v: string) {
    setItens((p) => p.map((l, i) => (i === idx ? { ...l, [k]: v } : l)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Informe o nome do plano.'); return }
    if (f.nome.trim().length < 3) { setErr('Nome muito curto.'); return }
    const vmNum = Number(f.valor_mensal.replace(',', '.'))
    if (!f.valor_mensal.trim() || !Number.isFinite(vmNum) || vmNum < 0) { setErr('Informe a mensalidade (R$).'); return }
    const vaNum = f.valor_adesao.trim() === '' ? 0 : Number(f.valor_adesao.replace(',', '.'))
    if (!Number.isFinite(vaNum) || vaNum < 0) { setErr('Valor de adesão inválido.'); return }
    const durNum = f.duracao_meses.trim() === '' ? null : Number(f.duracao_meses)
    if (durNum != null && (!Number.isInteger(durNum) || durNum < 0)) { setErr('Duração (meses) inválida.'); return }

    // Serviços incluídos (opcionais)
    const limpos = itens.filter((l) => l.servico_id)
    const ids = limpos.map((l) => l.servico_id)
    if (new Set(ids).size !== ids.length) { setErr('Há serviços repetidos. Junte as sessões/mês em uma linha.'); return }
    const itensInput: ItemPlanoInput[] = []
    for (const l of limpos) {
      const q = parseInt(l.quantidade_mensal)
      if (!Number.isFinite(q) || q < 1) { setErr('Cada serviço incluído precisa de 1 sessão/mês ou mais.'); return }
      itensInput.push({ servico_id: l.servico_id, quantidade_mensal: q })
    }

    const payload: PlanoInput = {
      nome: f.nome,
      descricao: f.descricao || null,
      valor_mensal: vmNum,
      valor_adesao: vaNum,
      duracao_meses: durNum,
      beneficios: beneficios.map((b) => b.trim()).filter(Boolean),
      itens: itensInput,
    }
    setSaving(true)
    const r = modo === 'novo' ? await criarPlano(payload) : await editarPlano(row!.id, payload)
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved(modo === 'novo' ? 'Plano criado.' : 'Plano atualizado.')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="modal" style={{ width: 680, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-head">
          <h3><i className="ti ti-id-badge-2" /> {modo === 'novo' ? 'Novo plano de assinatura' : 'Editar plano'}</h3>
          <button type="button" className="btn" onClick={onClose}><i className="ti ti-x" /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Nome <span className="req">*</span></label>
            <input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Plano Ouro - PDRN e Laser" autoFocus />
          </div>
          <div className="mf">
            <label>Adesão (R$)</label>
            <input value={f.valor_adesao} onChange={(e) => set('valor_adesao', e.target.value)} inputMode="decimal" placeholder="0,00 = sem adesão" />
          </div>
          <div className="mf">
            <label>Mensalidade (R$) <span className="req">*</span></label>
            <input value={f.valor_mensal} onChange={(e) => set('valor_mensal', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="mf">
            <label>Duração (meses)</label>
            <input value={f.duracao_meses} onChange={(e) => set('duracao_meses', e.target.value)} inputMode="numeric" placeholder="ex.: 12" />
          </div>
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Descrição</label>
            <textarea value={f.descricao} onChange={(e) => set('descricao', e.target.value)} style={{ minHeight: 46 }} placeholder="Opcional" />
          </div>

          {/* Benefícios (text[]) */}
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Benefícios — descontos, brindes, vantagens do plano</label>
            <div style={{ marginTop: 6 }}>
              {beneficios.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input value={b} onChange={(e) => setBenef(i, e.target.value)} placeholder="Ex.: 15% de desconto em serviços avulsos" style={{ flex: 1, minWidth: 0 }} />
                  <button type="button" className="btn" onClick={() => removeBenef(i)} title="Remover benefício">
                    <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={addBenef} style={{ marginTop: 4 }}>
                <i className="ti ti-plus" /> Adicionar benefício
              </button>
            </div>
          </div>

          {/* Serviços incluídos (plano_assinatura_servicos) */}
          <div className="mf full" style={{ gridColumn: '1 / -1' }}>
            <label>Serviços incluídos por mês — opcional (sessões inclusas na mensalidade)</label>
            {servicos.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nenhum serviço ativo cadastrado.</div>
            ) : (
              <div style={{ marginTop: 6 }}>
                {itens.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Nenhum serviço incluído — o plano pode ser só de benefícios/descontos.</div>
                )}
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
                      value={l.quantidade_mensal}
                      onChange={(e) => setLinha(idx, 'quantidade_mensal', e.target.value)}
                      style={{ width: 90 }}
                      title="Sessões por mês"
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>sessão(ões)/mês</span>
                    <button type="button" className="btn" onClick={() => removeLinha(idx)} title="Remover serviço">
                      <i className="ti ti-trash" style={{ color: 'var(--red)' }} />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost" onClick={addLinha} style={{ marginTop: 4 }}>
                  <i className="ti ti-plus" /> Adicionar serviço incluído
                </button>
              </div>
            )}
          </div>
        </div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, padding: '0 22px' }}>{err}</p>}
        {/* TODO(legado: buildPlanos): campo "Pagar comissão" (regra/percentual na mensalidade) — sem coluna no schema lkii. */}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar plano'}</button>
        </div>
      </form>
    </div>
  )
}
