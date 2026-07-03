'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarForma,
  salvarForma,
  toggleFormaAtiva,
  type FormaInput,
} from '@/app/(app)/cadastros/formas-pagamento/actions'
import { ehRecorrente, TIPOS_PAGAMENTO, type TipoForma } from '@/lib/catalogo'

export type FormaRow = {
  id: string
  nome: string | null
  tipo: string | null
  taxa: number | null
  taxa_comissao: number | null
  ativo: boolean | null
  rec_modo: string | null
  rec_token: string | null
  rec_max_parc: number | null
  rec_min_parcela: number | null
  rec_base_royalties: string | null
}

type Props = {
  formas: FormaRow[]
  podeEscrever: boolean
  kpis: { total: number; ativos: number; cartoes: number }
  filtros: { ativo: string; nome: string }
  total: number
  vazio: boolean
}

function pct(v: number | null): string {
  return `${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function FormasPagamentoManager({ formas, podeEscrever, kpis, filtros, total, vazio }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<FormaRow | null>(null)

  async function toggle(r: FormaRow) {
    setBusy(r.id); setMsg('')
    const res = await toggleFormaAtiva(r.id, r.ativo === false)
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro ao alterar.')
    else router.refresh()
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-credit-card" /> Formas de pagamento da rede  defina tipo, taxa do adquirente e taxa a
        descontar na comissão. A forma <b>Crédito Recorrente</b> abre a integração PagoLivre.
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Formas cadastradas', kpis.total, 'ti-credit-card'],
          ['Ativas', kpis.ativos, 'ti-circle-check'],
          ['Cartão / Link', kpis.cartoes, 'ti-device-mobile'],
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Nova forma de pagamento
          </button>
        )}
      </div>

      {/* Filtros (form GET)  Ativo (Sim/Não/Todos) + busca por nome */}
      <form method="GET" action="/cadastros/formas-pagamento" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 12 }}>
          <div className="field">
            <label>Buscar por nome</label>
            <input name="nome" defaultValue={filtros.nome} placeholder="Ex.: Cartão de Crédito Visa" />
          </div>
          <div className="field">
            <label>Ativo</label>
            <select name="ativo" defaultValue={filtros.ativo}>
              <option value="Todos">Todos</option>
              <option value="Sim">Sim</option>
              <option value="Não">Não</option>
            </select>
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 8px' }}>{msg}</div>}

      {vazio ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-database-off" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Nenhuma forma de pagamento</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            Aplique a migration <code>scripts/migrations/catalogo.sql</code> no lkii para criar a tabela e o seed das
            formas, ou use o botão acima para cadastrar a primeira.
          </p>
        </div>
      ) : (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th className="num-r">Taxa (%)</th>
                  <th className="num-r">Taxa a descontar na comissão (%)</th>
                  <th>Ativo</th>
                  {podeEscrever && <th></th>}
                </tr>
              </thead>
              <tbody>
                {formas.length === 0 && (
                  <tr>
                    <td colSpan={podeEscrever ? 6 : 5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                      Nenhuma forma encontrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
                {formas.map((r) => {
                  const inativo = r.ativo === false
                  const rec = ehRecorrente(r.nome || '', r.tipo || '')
                  return (
                    <tr key={r.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                      <td>
                        <span className="cli-name">{r.nome || '(sem nome)'}</span>
                        {rec && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            <i className="ti ti-repeat" style={{ verticalAlign: -1, color: 'var(--brand-500)' }} /> PagoLivre · {r.rec_modo || 'Integrado'} · até {r.rec_max_parc ?? 12}x
                            {r.rec_token ? ' · token configurado' : ' · sem token'}
                          </div>
                        )}
                      </td>
                      <td><span className="orig-tag">{r.tipo || ''}</span></td>
                      <td className="num-r">{pct(r.taxa)}</td>
                      <td className="num-r">{pct(r.taxa_comissao)}</td>
                      <td>{inativo ? <span className="pill-no">Não</span> : <span className="pill-yes">Sim</span>}</td>
                      {podeEscrever && (
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn" style={{ marginRight: 6 }} title="Editar" onClick={() => { setMsg(''); setEditRow(r) }}>
                            <i className="ti ti-pencil" />
                          </button>
                          <button className="btn" disabled={busy === r.id} title={inativo ? 'Ativar' : 'Inativar'} onClick={() => toggle(r)}
                            style={{ color: inativo ? 'var(--green)' : 'var(--red)' }}>
                            {busy === r.id ? '…' : <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} />}
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
            <span>
              {formas.length === 0
                ? 'Nenhum registro'
                : formas.length === total
                  ? `Exibindo ${formas.length} forma(s)`
                  : `Exibindo ${formas.length} de ${total} forma(s)`}
            </span>
          </div>
        </div>
      )}

      {novoOpen && <FormaModal modo="novo" onClose={() => setNovoOpen(false)} onSaved={() => { setNovoOpen(false); router.refresh() }} />}
      {editRow && <FormaModal modo="editar" row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); router.refresh() }} />}
    </div>
  )
}

// ─────────────────────────── Modal (CRUD + bloco PagoLivre) ───────────────────────────

function FormaModal({ modo, row, onClose, onSaved }: {
  modo: 'novo' | 'editar'
  row?: FormaRow
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    nome: row?.nome ?? '',
    tipo: (TIPOS_PAGAMENTO.includes(row?.tipo as TipoForma) ? (row!.tipo as TipoForma) : 'Crédito') as TipoForma,
    taxa: row?.taxa != null ? String(row.taxa) : '0,00',
    taxa_comissao: row?.taxa_comissao != null ? String(row.taxa_comissao) : '0,00',
    ativo: row?.ativo !== false,
    rec_modo: (row?.rec_modo === 'Manual' ? 'Manual' : 'Integrado') as 'Integrado' | 'Manual',
    rec_token: row?.rec_token ?? '',
    rec_max_parc: row?.rec_max_parc != null ? String(row.rec_max_parc) : '12',
    rec_min_parcela: row?.rec_min_parcela != null ? String(row.rec_min_parcela) : '50,00',
    rec_base_royalties: (row?.rec_base_royalties === 'venda' ? 'venda' : 'recorrencia') as 'recorrencia' | 'venda',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const isRec = ehRecorrente(f.nome, f.tipo)
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }

  function num(s: string): number {
    return Number((s || '').replace(/\./g, '').replace(',', '.')) || 0
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Informe o nome da forma de pagamento.'); return }
    const taxa = num(f.taxa)
    if (taxa < 0 || taxa > 100) { setErr('Taxa deve estar entre 0% e 100%.'); return }
    const taxaC = num(f.taxa_comissao)
    if (taxaC < 0 || taxaC > 100) { setErr('Taxa a descontar na comissão deve estar entre 0% e 100%.'); return }

    const input: FormaInput = {
      nome: f.nome.trim(),
      tipo: f.tipo,
      taxa,
      taxa_comissao: taxaC,
      ativo: f.ativo,
    }
    if (ehRecorrente(f.nome, f.tipo)) {
      input.rec_modo = f.rec_modo
      input.rec_token = f.rec_token
      input.rec_max_parc = Math.min(12, Math.max(1, parseInt(f.rec_max_parc) || 12))
      input.rec_min_parcela = num(f.rec_min_parcela)
      input.rec_base_royalties = f.rec_base_royalties
    }

    setSaving(true)
    const res = modo === 'novo' ? await criarForma(input) : await salvarForma(row!.id, input)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, padding: 22, background: '#fff', borderRadius: 14, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 14, fontWeight: 700 }}>
          <i className="ti ti-credit-card" /> {modo === 'novo' ? 'Nova forma de pagamento' : 'Editar forma de pagamento'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>Nome <span style={{ color: 'var(--red)' }}>*</span></label>
            <input style={inp} value={f.nome} onChange={(e) => set('nome', e.target.value)} autoFocus placeholder="Ex.: 01 x Cartão de Crédito - Visa" />
          </div>
          <div>
            <label style={lbl}>Tipo</label>
            <select style={inp} value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoForma)}>
              {TIPOS_PAGAMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ativo</label>
            <select style={inp} value={f.ativo ? '1' : '0'} onChange={(e) => set('ativo', e.target.value === '1')}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Taxa (%)</label>
            <input style={inp} value={f.taxa} onChange={(e) => set('taxa', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div>
            <label style={lbl}>Taxa a descontar na comissão (%)</label>
            <input style={inp} value={f.taxa_comissao} onChange={(e) => set('taxa_comissao', e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
        </div>

        {/* Bloco Crédito Recorrente · integração PagoLivre */}
        {isRec && (
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 12 }}>
            <div style={{ color: 'var(--brand-600)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              <i className="ti ti-repeat" /> Crédito Recorrente · integração PagoLivre
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
              <i className="ti ti-info-circle" /> A venda no <b>crédito recorrente</b> pode ser reconhecida no relatório de
              vendas em <b>Visão Vendas</b> (valor integral no ato) e <b>Visão Recorrência</b> (parcela mês a mês  também
              base dos <b>royalties</b>). Não se aplica ao grupo <b>Ultrassom</b>.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Modo de operação</label>
                <select style={inp} value={f.rec_modo} onChange={(e) => set('rec_modo', e.target.value as 'Integrado' | 'Manual')}>
                  <option value="Integrado">Integrado</option>
                  <option value="Manual">Manual</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Parceiro / Gateway</label>
                <input style={{ ...inp, background: 'var(--surface-2)' }} value="PagoLivre" readOnly />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Token de integração (PagoLivre) <span style={{ color: 'var(--red)' }}>*</span></label>
                <input style={inp} value={f.rec_token} onChange={(e) => set('rec_token', e.target.value)} placeholder="Cole aqui o token do parceiro PagoLivre" />
              </div>
              <div>
                <label style={lbl}>Parcelamento máximo (até 12x)</label>
                <input style={inp} type="number" min={1} max={12} value={f.rec_max_parc} onChange={(e) => set('rec_max_parc', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Valor mínimo por parcela (R$)</label>
                <input style={inp} value={f.rec_min_parcela} onChange={(e) => set('rec_min_parcela', e.target.value)} inputMode="decimal" placeholder="50,00" />
              </div>
              <div>
                <label style={lbl}>Base dos royalties</label>
                <select style={inp} value={f.rec_base_royalties} onChange={(e) => set('rec_base_royalties', e.target.value as 'recorrencia' | 'venda')}>
                  <option value="recorrencia">Recorrência (parcela mês a mês)</option>
                  <option value="venda">Venda (valor integral)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Grupos não elegíveis</label>
                <input style={{ ...inp, background: 'var(--surface-2)' }} value="Ultrassom (todo o grupo)" readOnly />
              </div>
            </div>
          </div>
        )}

        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
