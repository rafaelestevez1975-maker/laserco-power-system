'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  criarMotivo,
  salvarMotivo,
  toggleMotivoAtivo,
  excluirMotivo,
  salvarNoshowConfig,
  type NoshowConfig,
} from '@/app/(app)/cadastros/motivos/actions'

export type MotivoRow = {
  id: string
  nome: string | null
  sistema: boolean | null
  ativo: boolean | null
}

export type NoshowRow = {
  ativa: boolean | null
  primeira_apos: string | null
  max_mensagens: number | null
  intervalo: string | null
  mensagem: string | null
  regra_reagenda: boolean | null
  regra_exclui: boolean | null
  regra_oculta: boolean | null
}

type Props = {
  motivos: MotivoRow[]
  podeEscrever: boolean
  contador: { total: number; sistema: number }
  noshow: NoshowRow | null
  semTabela: boolean
  filtroNome: string
  filtroAtivo: string // '' | 'sim' | 'nao'
}

const MSG_PADRAO = 'Olá {cliente}! 💙 Notamos que você não compareceu à sua sessão de {serviço} hoje às {hora}. Aconteceu algo? Temos horários disponíveis e adoraríamos remarcar para você. É só responder aqui que reagendamos na hora! 😊'

export function MotivosManager({ motivos, podeEscrever, contador, noshow, semTabela, filtroNome, filtroAtivo }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<MotivoRow | null>(null)
  const [busca, setBusca] = useState(filtroNome)

  const temFiltro = !!(filtroNome || filtroAtivo)
  const exportHref = `/cadastros/motivos/export${sp.toString() ? `?${sp.toString()}` : ''}`

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    const s = p.toString()
    router.push(`/cadastros/motivos${s ? `?${s}` : ''}`)
  }

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id); setMsg('')
    const res = await fn()
    setBusy(null)
    if (!res.ok) setMsg(res.error || 'Erro.')
    else router.refresh()
  }

  async function toggle(m: MotivoRow) {
    await run(m.id, () => toggleMotivoAtivo(m.id, m.ativo === false))
  }

  async function excluir(m: MotivoRow) {
    if (!confirm(`Excluir o motivo "${m.nome}"?`)) return
    await run(m.id, () => excluirMotivo(m.id))
  }

  return (
    <div className="view active">
      {!semTabela && (
        <div className="rel-card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontWeight: 600, fontSize: 13 }}>
            <i className="ti ti-filter" /> Filtros
            {temFiltro && (
              <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '4px 10px' }} onClick={() => { setBusca(''); router.push('/cadastros/motivos') }}>
                <i className="ti ti-x" /> Limpar
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Nome</label>
              <form onSubmit={(e) => { e.preventDefault(); setParams({ q: busca.trim() }) }}>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onBlur={() => { if (busca.trim() !== filtroNome) setParams({ q: busca.trim() }) }}
                  placeholder="Buscar por nome…"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 12.5, background: '#fff', fontFamily: 'inherit' }}
                />
              </form>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Ativo</label>
              <select value={filtroAtivo} onChange={(e) => setParams({ ativo: e.target.value })} style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 12.5, background: '#fff', fontFamily: 'inherit' }}>
                <option value="">Todos</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <a className="btn" href={exportHref} target="_blank" title="Exportar a lista em CSV"><i className="ti ti-download" /> Exportar</a>
        {podeEscrever && (
          <button className="btn btn-primary" onClick={() => { setMsg(''); setNovoOpen(true) }}>
            <i className="ti ti-plus" /> Novo motivo
          </button>
        )}
      </div>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 8px' }}>{msg}</div>}

      {semTabela ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-database-off" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Tabela de motivos não encontrada</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            Aplique a migration <code>scripts/migrations/anamnese.sql</code> no lkii para criar a tabela e o seed dos motivos.
          </p>
        </div>
      ) : (
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Tipo</th>
                  <th>Ativo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {motivos.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                      Nenhum motivo cadastrado.
                    </td>
                  </tr>
                )}
                {motivos.map((m) => {
                  const inativo = m.ativo === false
                  const sistema = !!m.sistema
                  return (
                    <tr key={m.id} style={{ opacity: inativo ? 0.55 : 1 }}>
                      <td>
                        <span className="cli-name">
                          {sistema && <i className="ti ti-lock" style={{ color: 'var(--brand-400)', marginRight: 7, verticalAlign: -2 }} title="Pré-cadastrado pelo sistema" />}
                          {m.nome}
                        </span>
                      </td>
                      <td>
                        {sistema
                          ? <span className="os-st" style={{ background: '#F7E7EB', color: 'var(--brand-600)' }}>Padrão do sistema</span>
                          : <span className="orig-tag">Personalizado</span>}
                      </td>
                      <td>{inativo ? <span className="pill-no">Não</span> : <span className="pill-yes">Sim</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {podeEscrever ? (
                          <>
                            <span className="os-link" style={{ cursor: 'pointer' }} onClick={() => { setMsg(''); setEditRow(m) }}>
                              <i className="ti ti-edit" /> Editar
                            </span>
                            <span className="os-link" style={{ cursor: 'pointer', color: inativo ? 'var(--green)' : 'var(--amber)', marginLeft: 12, opacity: busy === m.id ? 0.5 : 1 }} onClick={() => busy !== m.id && toggle(m)}>
                              <i className={`ti ${inativo ? 'ti-rotate-clockwise' : 'ti-ban'}`} /> {inativo ? 'Ativar' : 'Inativar'}
                            </span>
                            {!sistema && (
                              <span className="os-link" style={{ cursor: 'pointer', color: 'var(--red)', marginLeft: 12, opacity: busy === m.id ? 0.5 : 1 }} onClick={() => busy !== m.id && excluir(m)}>
                                <i className="ti ti-trash" /> Excluir
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: 12 }}></span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="cli-foot">
            <span>{contador.total} registros encontrados · {contador.sistema} pré-cadastrados pelo sistema</span>
          </div>
        </div>
      )}

      {/* Automação de não comparecimento (WhatsApp) */}
      {!semTabela && <NoshowBlock noshow={noshow} podeEscrever={podeEscrever} />}

      {novoOpen && <MotivoModal modo="novo" onClose={() => setNovoOpen(false)} onSaved={() => { setNovoOpen(false); router.refresh() }} />}
      {editRow && <MotivoModal modo="editar" row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); router.refresh() }} />}
    </div>
  )
}

// ─────────────────────── Automação de não comparecimento ───────────────────────

function NoshowBlock({ noshow, podeEscrever }: { noshow: NoshowRow | null; podeEscrever: boolean }) {
  const router = useRouter()
  const [cfg, setCfg] = useState<NoshowConfig>({
    ativa: noshow?.ativa ?? true,
    primeira_apos: noshow?.primeira_apos ?? '2 horas',
    max_mensagens: noshow?.max_mensagens ?? 2,
    intervalo: noshow?.intervalo ?? '2 horas',
    mensagem: noshow?.mensagem ?? MSG_PADRAO,
    regra_reagenda: noshow?.regra_reagenda ?? true,
    regra_exclui: noshow?.regra_exclui ?? true,
    regra_oculta: noshow?.regra_oculta ?? true,
  })
  const set = <K extends keyof NoshowConfig>(k: K, v: NoshowConfig[K]) => setCfg((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }
  const rule: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, marginBottom: 8, fontSize: 13, color: 'var(--text-2)' }

  async function salvar() {
    setSaving(true); setErr(''); setOk(false)
    const res = await salvarNoshowConfig(cfg)
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    setOk(true)
    router.refresh()
  }

  return (
    <div className="rel-card" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
        <i className="ti ti-brand-whatsapp" style={{ color: '#25D366' }} /> Automação de não comparecimento (WhatsApp)
      </h3>

      <label style={{ ...rule, background: '#F7E7EB', borderColor: 'var(--brand-300)' }}>
        <input type="checkbox" checked={cfg.ativa} disabled={!podeEscrever} onChange={(e) => set('ativa', e.target.checked)} style={{ marginTop: 3 }} />
        <span><b>Ativar automação de não comparecimento</b>  quando o cliente não comparece, o sistema dispara mensagens automáticas oferecendo o reagendamento.</span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, margin: '12px 0' }}>
        <div className="field">
          <label>Enviar 1ª mensagem após a sessão</label>
          <input style={inp} value={cfg.primeira_apos} disabled={!podeEscrever} onChange={(e) => set('primeira_apos', e.target.value)} />
        </div>
        <div className="field">
          <label>Máximo de mensagens no dia</label>
          <input style={inp} type="number" min={1} max={10} value={cfg.max_mensagens} disabled={!podeEscrever} onChange={(e) => set('max_mensagens', Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Intervalo entre mensagens</label>
          <input style={inp} value={cfg.intervalo} disabled={!podeEscrever} onChange={(e) => set('intervalo', e.target.value)} />
        </div>
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <label>Mensagem automática (WhatsApp)  variáveis: {'{cliente}'} {'{serviço}'} {'{hora}'}</label>
        <textarea style={{ ...inp, minHeight: 90, lineHeight: 1.6 }} value={cfg.mensagem} disabled={!podeEscrever} onChange={(e) => set('mensagem', e.target.value)} />
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-2)', margin: '6px 0 8px' }}>Regras de tratamento</div>
      <label style={rule}>
        <input type="checkbox" checked={cfg.regra_reagenda} disabled={!podeEscrever} onChange={(e) => set('regra_reagenda', e.target.checked)} style={{ marginTop: 3 }} />
        <span>Se o cliente <b>responder</b> à mensagem, o atendimento é <b>reagendado automaticamente</b>.</span>
      </label>
      <label style={rule}>
        <input type="checkbox" checked={cfg.regra_exclui} disabled={!podeEscrever} onChange={(e) => set('regra_exclui', e.target.checked)} style={{ marginTop: 3 }} />
        <span>Se não comparecer e <b>não responder</b> até o fim do dia, o agendamento é <b>excluído</b> e o <b>não comparecimento é computado nos dashboards</b>.</span>
      </label>
      <label style={rule}>
        <input type="checkbox" checked={cfg.regra_oculta} disabled={!podeEscrever} onChange={(e) => set('regra_oculta', e.target.checked)} style={{ marginTop: 3 }} />
        <span><b>Não exibir na agenda do dia seguinte</b> clientes que não compareceram no dia anterior.</span>
      </label>

      {/* Fluxo automático (mesmos passos do legado) */}
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-2)', margin: '18px 0 8px' }}>Fluxo automático</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>
        {[
          ['ti-calendar-x', 'var(--amber)', 'Não compareceu', 'Cliente não comparece no horário da sessão.'],
          ['ti-brand-whatsapp', '#25D366', '+2h · 1ª mensagem', 'WhatsApp informando o não comparecimento e oferecendo remarcação.'],
          ['ti-brand-whatsapp', '#25D366', '+2h · 2ª mensagem', 'Segunda (e última) tentativa do dia.'],
          ['ti-calendar-check', 'var(--blue, #0ea5e9)', 'Respondeu', 'Reagenda automaticamente.'],
          ['ti-trash', 'var(--red)', 'Sem resposta', 'Exclui o agendamento e computa o não comparecimento no dashboard.'],
        ].map(([ic, color, titulo, desc], i) => (
          <div key={i} style={{ flex: '1 1 160px', minWidth: 150, border: '1px solid var(--line)', borderRadius: 9, padding: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>
              <i className={`ti ${ic}`} style={{ color: color as string }} /> {titulo}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{desc}</div>
          </div>
        ))}
      </div>

      {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 12 }}>{err}</p>}
      {ok && <p style={{ color: 'var(--green)', fontSize: 12.5, marginTop: 12 }}>Automação salva.</p>}

      {podeEscrever && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>
            <i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar automação'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── Modal de motivo (CRUD) ───────────────────────────

function MotivoModal({ modo, row, onClose, onSaved }: {
  modo: 'novo' | 'editar'
  row?: MotivoRow
  onClose: () => void
  onSaved: () => void
}) {
  const [nome, setNome] = useState(row?.nome ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid var(--line-strong)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!nome.trim()) { setErr('Informe o nome do motivo.'); return }
    setSaving(true)
    const res = modo === 'novo' ? await criarMotivo(nome.trim()) : await salvarMotivo(row!.id, nome.trim())
    setSaving(false)
    if (!res.ok) { setErr(res.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, padding: 22, background: '#fff', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.25)' }}>
        <h3 style={{ fontSize: 18, marginBottom: 14, fontWeight: 700 }}>
          <i className="ti ti-circle-x" /> {modo === 'novo' ? 'Novo motivo de cancelamento' : 'Editar motivo de cancelamento'}
        </h3>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Nome <span style={{ color: 'var(--red)' }}>*</span></label>
        <input style={inp} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Insatisfação com o serviço" />
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
