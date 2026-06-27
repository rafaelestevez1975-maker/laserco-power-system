'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dataHoraBR, dataBR } from '@/lib/fmt'
import { STATUS_CAMPANHA, SEGMENTACAO_TIPOS, STATUS_PILL, STATUS_LABEL, SEG_LABEL } from '@/lib/marketing'
import {
  criarCampanha,
  atualizarCampanha,
  cancelarCampanha,
  type NovaCampanhaInput,
} from '@/app/(app)/marketing/actions'

export type CampanhaRow = {
  id: string
  nome: string
  descricao: string | null
  mensagem_base: string | null
  template_id: string | null
  template_nome: string | null
  segmentacao_tipo: string | null
  status: string
  agendado_para: string | null
  iniciado_em: string | null
  concluido_em: string | null
  ia_personalizar: boolean
  ia_instrucao: string | null
  enviados: number
  entregues: number
  lidos: number
  responderam: number
  falhou: number
  destinatarios: number
  unidade: string
}

export type TemplateOpt = { id: string; nome: string; finalidade: string; conteudo: string }

type Props = {
  campanhas: CampanhaRow[]
  templates: TemplateOpt[]
  podeEscrever: boolean
  activeUnitId: string | null
  activeUnitName: string
  filtros: { status: string; seg: string; q: string }
  kpis: { totalCampanhas: number; enviados: number; entregues: number; lidos: number; responderam: number }
  semTabela: boolean
  erro: string | null
}

function pct(part: number, total: number): string {
  if (!total) return '0%'
  return Math.round((part / total) * 100) + '%'
}

function StatusPill({ status }: { status: string }) {
  const [cls, lbl] = STATUS_PILL[status] ?? ['draft', status]
  return <span className={`wa-pill ${cls}`}>{lbl}</span>
}

export function CampanhasWhatsapp(props: Props) {
  const { campanhas, templates, podeEscrever, activeUnitId, activeUnitName, filtros, kpis, semTabela, erro } = props
  const router = useRouter()

  const [novoOpen, setNovoOpen] = useState(false)
  const [editRow, setEditRow] = useState<CampanhaRow | null>(null)
  const [reportRow, setReportRow] = useState<CampanhaRow | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const temFiltro = !!(filtros.status || filtros.seg || filtros.q)
  const taxaLeitura = pct(kpis.lidos, kpis.entregues)

  function urlCom(extra: Record<string, string | undefined>): string {
    const p = new URLSearchParams()
    if (filtros.status) p.set('status', filtros.status)
    if (filtros.seg) p.set('seg', filtros.seg)
    if (filtros.q) p.set('q', filtros.q)
    for (const [k, v] of Object.entries(extra)) {
      if (!v) p.delete(k)
      else p.set(k, v)
    }
    const s = p.toString()
    return `/marketing${s ? `?${s}` : ''}`
  }

  async function cancelar(id: string) {
    setBusy(id)
    setMsg('')
    const r = await cancelarCampanha(id)
    setBusy(null)
    if (!r.ok) setMsg(r.error || 'Erro ao cancelar.')
    else {
      setMsg('Campanha cancelada.')
      router.refresh()
    }
  }

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-ad-2" /> Campanhas de WhatsApp da unidade <b>{activeUnitName}</b>
        {!activeUnitId && ' (todas as unidades — selecione uma no topo para criar campanhas)'}.
      </div>

      {/* Erro de carga (tabela inexistente ou falha de leitura) */}
      {semTabela && (
        <div className="rel-card" style={{ background: 'var(--amber-bg)', borderColor: 'var(--amber)', color: 'var(--amber)' }}>
          <i className="ti ti-database-off" /> O módulo de campanhas ainda não está disponível neste ambiente (tabela não encontrada).
        </div>
      )}
      {erro && !semTabela && (
        <div className="rel-card" style={{ background: 'var(--red-bg)', borderColor: 'var(--red)', color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar as campanhas: {erro}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        <div className="metric-box"><span>Campanhas</span><b>{kpis.totalCampanhas}</b></div>
        <div className="metric-box"><span>Mensagens enviadas</span><b>{kpis.enviados.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Taxa de leitura</span><b>{taxaLeitura}</b></div>
        <div className="metric-box"><span>Respostas</span><b>{kpis.responderam.toLocaleString('pt-BR')}</b></div>
      </div>

      {/* Ação principal */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        {podeEscrever && (
          <button
            className="btn btn-primary"
            disabled={!activeUnitId || semTabela}
            title={!activeUnitId ? 'Selecione uma unidade no topo' : undefined}
            onClick={() => { setMsg(''); setNovoOpen(true) }}
          >
            <i className="ti ti-plus" /> Nova campanha
          </button>
        )}
      </div>

      {/* Filtros (form GET → server re-renderiza) */}
      <form method="GET" action="/marketing" className="rel-card" style={{ marginBottom: 14 }}>
        <div className="rel-card-h" style={{ cursor: 'default' }}>
          <span><i className="ti ti-filter flt" /> Filtros</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 12 }}>
          <div className="mf">
            <label>Status</label>
            <select name="status" defaultValue={filtros.status}>
              <option value="">Todos</option>
              {STATUS_CAMPANHA.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
              ))}
            </select>
          </div>
          <div className="mf">
            <label>Público-alvo</label>
            <select name="seg" defaultValue={filtros.seg}>
              <option value="">Todos</option>
              {SEGMENTACAO_TIPOS.map((s) => (
                <option key={s} value={s}>{SEG_LABEL[s] ?? s}</option>
              ))}
            </select>
          </div>
          <div className="mf">
            <label>Buscar</label>
            <input name="q" defaultValue={filtros.q} placeholder="Nome da campanha…" />
          </div>
        </div>
        <div className="rel-acts" style={{ marginTop: 12, display: 'flex', gap: 10 }}>
          <button type="submit" className="btn btn-primary"><i className="ti ti-search" /> Pesquisar</button>
          {temFiltro && <Link href="/marketing" className="btn"><i className="ti ti-x" /> Limpar</Link>}
        </div>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', margin: '0 0 8px' }}>{msg}</div>}

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-speakerphone" /> {campanhas.length} campanha(s){temFiltro ? ' (filtrado)' : ''}
      </div>

      {/* Tabela */}
      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Unidade</th>
                <th>Público-alvo</th>
                <th>Status</th>
                <th className="num-r">Enviadas</th>
                <th className="num-r">Lidas</th>
                <th className="num-r">Respostas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {campanhas.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                    <i className="ti ti-speakerphone" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                    {temFiltro
                      ? 'Nenhuma campanha com esses filtros.'
                      : 'Nenhuma campanha ainda. Crie a primeira para disparar mensagens segmentadas pela base da unidade.'}
                  </td>
                </tr>
              )}
              {campanhas.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="cli-name">{c.nome}</span>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      {c.status === 'agendada' && c.agendado_para
                        ? `Agendada · ${dataHoraBR(c.agendado_para)}`
                        : c.concluido_em
                          ? `Concluída · ${dataBR(c.concluido_em)}`
                          : c.template_nome
                            ? `Template: ${c.template_nome}`
                            : 'Mensagem livre'}
                    </div>
                  </td>
                  <td>{c.unidade}</td>
                  <td><span className="orig-tag">{SEG_LABEL[c.segmentacao_tipo ?? ''] ?? (c.segmentacao_tipo || '—')}</span></td>
                  <td><StatusPill status={c.status} /></td>
                  <td className="num-r">{c.enviados || ''}</td>
                  <td className="num-r">{c.lidos || ''}</td>
                  <td className="num-r">{c.responderam || ''}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="os-link" onClick={() => setReportRow(c)} style={{ marginRight: 12 }}>
                      <i className="ti ti-report" /> Relatório
                    </span>
                    {podeEscrever && c.status !== 'concluida' && c.status !== 'processando' && (
                      <button className="btn" style={{ marginRight: 6 }} onClick={() => { setMsg(''); setEditRow(c) }} title="Editar">
                        <i className="ti ti-pencil" />
                      </button>
                    )}
                    {podeEscrever && (c.status === 'rascunho' || c.status === 'agendada') && (
                      <button className="btn" disabled={busy === c.id} onClick={() => cancelar(c.id)} title="Cancelar">
                        {busy === c.id ? '…' : <i className="ti ti-x" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {novoOpen && (
        <CampanhaForm
          modo="novo"
          templates={templates}
          onClose={() => setNovoOpen(false)}
          onSaved={(m) => { setNovoOpen(false); setMsg(m); router.refresh() }}
        />
      )}
      {editRow && (
        <CampanhaForm
          modo="editar"
          row={editRow}
          templates={templates}
          onClose={() => setEditRow(null)}
          onSaved={(m) => { setEditRow(null); setMsg(m); router.refresh() }}
        />
      )}
      {reportRow && <ReportModal c={reportRow} onClose={() => setReportRow(null)} />}
    </div>
  )
}

// ─────────────────────────── Form (modal criar/editar) ───────────────────────────

function CampanhaForm(props: {
  modo: 'novo' | 'editar'
  row?: CampanhaRow
  templates: TemplateOpt[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { modo, row, templates, onClose, onSaved } = props

  const [f, setF] = useState({
    nome: row?.nome ?? '',
    descricao: row?.descricao ?? '',
    mensagem_base: row?.mensagem_base ?? '',
    template_id: row?.template_id ?? '',
    segmentacao_tipo: row?.segmentacao_tipo ?? 'manual',
    status: row?.status ?? 'rascunho',
    agendado_para: row?.agendado_para ? toLocalInput(row.agendado_para) : '',
    ia_personalizar: row?.ia_personalizar ?? false,
    ia_instrucao: row?.ia_instrucao ?? '',
  })
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const agendar = f.status === 'agendada'

  function aplicarTemplate(id: string) {
    set('template_id', id)
    const t = templates.find((x) => x.id === id)
    if (t && !f.mensagem_base.trim()) set('mensagem_base', t.conteudo)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!f.nome.trim()) { setErr('Dê um nome à campanha.'); return }
    if (!f.mensagem_base.trim()) { setErr('Escreva a mensagem da campanha.'); return }
    if (!f.segmentacao_tipo) { setErr('Selecione o público-alvo.'); return }
    if (agendar && !f.agendado_para) { setErr('Informe a data/hora do agendamento.'); return }

    setSaving(true)
    let r
    if (modo === 'novo') {
      const input: NovaCampanhaInput = {
        nome: f.nome,
        descricao: f.descricao || undefined,
        mensagem_base: f.mensagem_base,
        template_id: f.template_id || null,
        segmentacao_tipo: f.segmentacao_tipo,
        status: agendar ? 'agendada' : 'rascunho',
        agendado_para: agendar ? f.agendado_para : null,
        ia_personalizar: f.ia_personalizar,
        ia_instrucao: f.ia_instrucao || undefined,
      }
      r = await criarCampanha(input)
    } else {
      r = await atualizarCampanha({
        id: row!.id,
        nome: f.nome,
        descricao: f.descricao,
        mensagem_base: f.mensagem_base,
        template_id: f.template_id || null,
        segmentacao_tipo: f.segmentacao_tipo,
        status: f.status,
        agendado_para: agendar ? f.agendado_para : null,
        ia_personalizar: f.ia_personalizar,
        ia_instrucao: f.ia_instrucao,
      })
    }
    setSaving(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved(modo === 'novo' ? 'Campanha criada.' : 'Campanha atualizada.')
  }

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} className="modal" style={{ width: 560 }}>
        <div className="modal-head">
          <h3><i className="ti ti-ad-2" /> {modo === 'novo' ? 'Nova campanha' : 'Editar campanha'}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="modal-note" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{err}</div>}

          <div className="mf full">
            <label>Nome <span className="req">*</span></label>
            <input value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Reativação Ultrassom 8 meses" autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="mf">
              <label>Público-alvo <span className="req">*</span></label>
              <select value={f.segmentacao_tipo} onChange={(e) => set('segmentacao_tipo', e.target.value)}>
                {SEGMENTACAO_TIPOS.map((s) => (
                  <option key={s} value={s}>{SEG_LABEL[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div className="mf">
              <label>Template (opcional)</label>
              <select value={f.template_id} onChange={(e) => aplicarTemplate(e.target.value)}>
                <option value="">— Mensagem livre —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}{t.finalidade ? ` · ${t.finalidade}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mf full">
            <label>Mensagem <span className="req">*</span></label>
            <textarea
              value={f.mensagem_base}
              onChange={(e) => set('mensagem_base', e.target.value)}
              style={{ minHeight: 90, resize: 'vertical' }}
              placeholder="Olá {nome}! Sentimos sua falta…"
            />
          </div>

          <div className="mf full">
            <label>Descrição interna</label>
            <input value={f.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Anotação para a equipe (opcional)" />
          </div>

          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={agendar} onChange={(e) => set('status', e.target.checked ? 'agendada' : 'rascunho')} style={{ width: 'auto' }} />
            Agendar disparo
          </label>
          {agendar && (
            <div className="mf full">
              <label>Data e hora do disparo <span className="req">*</span></label>
              <input type="datetime-local" value={f.agendado_para} onChange={(e) => set('agendado_para', e.target.value)} />
            </div>
          )}

          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.ia_personalizar} onChange={(e) => set('ia_personalizar', e.target.checked)} style={{ width: 'auto' }} />
            Personalizar mensagem por IA (por destinatário)
          </label>
          {f.ia_personalizar && (
            <div className="mf full">
              <label>Instrução para a IA</label>
              <textarea
                value={f.ia_instrucao}
                onChange={(e) => set('ia_instrucao', e.target.value)}
                style={{ minHeight: 60, resize: 'vertical' }}
                placeholder="Ex.: tom acolhedor, citar o serviço que o cliente já fez e oferecer 15% de retorno."
              />
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}

// ─────────────────────────── Relatório (modal) ───────────────────────────

function ReportModal({ c, onClose }: { c: CampanhaRow; onClose: () => void }) {
  const funnel = useMemo<[string, number][]>(
    () => [
      ['Destinatários', c.destinatarios],
      ['Enviadas', c.enviados],
      ['Entregues', c.entregues],
      ['Lidas', c.lidos],
      ['Respostas', c.responderam],
    ],
    [c],
  )
  const base = c.destinatarios || c.enviados || 0

  return (
    <div className="modal-ov open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-head">
          <h3><i className="ti ti-report" /> {c.nome}</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            {c.unidade} · {SEG_LABEL[c.segmentacao_tipo ?? ''] ?? (c.segmentacao_tipo || 'público')} · <StatusPill status={c.status} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            <div className="metric-box"><span>Enviadas</span><b>{c.enviados}</b></div>
            <div className="metric-box"><span>Entregues</span><b>{c.entregues} ({pct(c.entregues, c.enviados)})</b></div>
            <div className="metric-box"><span>Lidas</span><b>{c.lidos} ({pct(c.lidos, c.entregues)})</b></div>
            <div className="metric-box"><span>Respostas</span><b>{c.responderam}</b></div>
            <div className="metric-box"><span>Falhas</span><b>{c.falhou}</b></div>
            <div className="metric-box"><span>Taxa resposta</span><b>{pct(c.responderam, c.entregues)}</b></div>
          </div>

          {/* Funil simples (barras proporcionais ao topo) */}
          <div className="rel-card" style={{ margin: 0 }}>
            <div className="rel-card-h" style={{ cursor: 'default', marginBottom: 8 }}>
              <span><i className="ti ti-filter flt" /> Funil da campanha</span>
            </div>
            {base === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                Sem dados de disparo ainda — o funil aparece quando a campanha for enviada.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {funnel.map(([label, v]) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span>{label}</span>
                      <b>{v} ({pct(v, base)})</b>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 20, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: pct(v, base), background: 'linear-gradient(135deg,var(--brand-500),var(--brand-600))' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {c.mensagem_base && (
            <div className="crm-note" style={{ whiteSpace: 'pre-wrap' }}>
              <i className="ti ti-message-2" /> {c.mensagem_base}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

/** ISO (UTC) -> valor de <input type="datetime-local"> no fuso local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const off = d.getTimezoneOffset()
  const local = new Date(d.getTime() - off * 60000)
  return local.toISOString().slice(0, 16)
}
