'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarIndicacao, setStatusIndicado, enviarNovosAoCrm, salvarPremio,
  registrarSorteio, notificarGanhador, type IndicadoInput,
} from '@/app/(app)/indiques/actions'
import {
  IND_STATUS, IND_STATUS_COR, IND_ORIGENS, statusLabel, origemLabel,
  indLink, indMensagem, mesLabel, sorteioData, type IndStatus,
} from '@/lib/indiques'

export type Indicado = { id: string; nome: string | null; telefone: string | null; email: string | null; status: string | null; observacoes: string | null }
export type Indicacao = {
  id: string; indicador_nome: string | null; indicador_telefone: string | null; premio_descricao: string | null
  status: string | null; origem?: string | null; unidade_id: string | null; criado_em: string | null; indicacao_indicados: Indicado[]
}
type Unidade = { id: string; nome: string }
type Premio = { premio: string; valor_ref: string | null; observacao: string | null; meta_mensal: number; unidade_id: string | null } | null
type Sorteio = { id: string; ganhador_nome: string; ganhador_whats: string | null; ganhador_email: string | null; premio: string | null; notificado: boolean } | null

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600 }
const TODAS = '__todas__'

type Props = {
  indicacoes: Indicacao[]; unidades: Unidade[]; activeUnitId: string | null; activeUnitName: string
  uniNome: Record<string, string>; isAdmin: boolean; premio: Premio; metaMensal: number; ultimoSorteio: Sorteio
  migrationPendente: boolean; totalIndicacoesMes: number
}

// Achata os indicados em "leads" do Kanban (legado indKanbanLeads 8121).
type KLead = { id: string; nome: string; whats: string; status: IndStatus; por: string; origem: string; unidadeId: string | null }

export function IndiquesManager(props: Props) {
  const { indicacoes, unidades, activeUnitId, activeUnitName, uniNome, isAdmin, premio, ultimoSorteio, migrationPendente, totalIndicacoesMes } = props
  const router = useRouter()
  const [tab, setTab] = useState<'lista' | 'sorteio' | 'premio'>('lista')
  const [filtroUni, setFiltroUni] = useState<string>(activeUnitId || TODAS)
  const [nova, setNova] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const uniNomeSel = filtroUni === TODAS ? activeUnitName : (uniNome[filtroUni] ?? activeUnitName)
  const link = indLink(uniNomeSel)
  const premioNome = premio?.premio || '1 Rejuvenescimento Facial 4D (sessão completa)'

  // Filtra indicações pela unidade do filtro local.
  const indFiltradas = useMemo(
    () => (filtroUni === TODAS ? indicacoes : indicacoes.filter((i) => i.unidade_id === filtroUni)),
    [indicacoes, filtroUni],
  )

  const leads: KLead[] = useMemo(() => {
    const out: KLead[] = []
    indFiltradas.forEach((r) => (r.indicacao_indicados ?? []).forEach((x) => out.push({
      id: x.id, nome: x.nome || '', whats: x.telefone || '', status: statusLabel(x.status),
      por: r.indicador_nome || '', origem: r.origem || 'balcao', unidadeId: r.unidade_id,
    })))
    return out
  }, [indFiltradas])

  // KPIs do legado (indListaHTML 8124-8141).
  const totalIndicados = leads.length
  const trabalhados = leads.filter((x) => x.status !== 'Novo').length
  const fechados = leads.filter((x) => x.status === 'Fechado').length
  // "Indicadores no mês" = nº de indicações (cabeças). Sem filtro de unidade usa o COUNT
  // real do servidor (não cai no teto de 500 da lista); com filtro local conta o array.
  const indicadoresMes = filtroUni === TODAS ? totalIndicacoesMes : indFiltradas.length

  // Dashboard de gestão (indMetaSync 8100 / indDashHTML 8107).
  const metaMes = premio?.meta_mensal ?? props.metaMensal ?? 60
  const metaDia = Math.ceil(metaMes / 30)
  const diaAtual = new Date().getDate() || 1
  const mediaDia = totalIndicados / diaAtual
  const projecao = Math.round(mediaDia * 30)
  const pctMeta = metaMes ? Math.round((totalIndicados / metaMes) * 100) : 0

  async function copiar(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    setMsg(ok); setTimeout(() => setMsg(''), 2500)
  }

  async function onEnviarCrm() {
    setBusy(true); setMsg('')
    const r = await enviarNovosAoCrm(filtroUni === TODAS ? null : filtroUni)
    setBusy(false)
    if (!r.ok) setMsg(r.error || 'Erro.')
    else { setMsg(`${r.enviados ?? 0} lead(s) enviados ao CRM (quadro Gestão Indicações).`); router.refresh() }
  }

  async function onSetStatus(id: string, label: string) {
    const r = await setStatusIndicado(id, label)
    if (!r.ok) setMsg(r.error || 'Erro.'); else router.refresh()
  }

  return (
    <>
      {migrationPendente && (
        <div className="rel-legend" style={{ background: 'var(--amber-bg, #FFF7E6)', border: '1px solid var(--amber)', marginBottom: 12 }}>
          <i className="ti ti-alert-triangle" /> Aplique a migration <b>scripts/migrations/indiques.sql</b> no lkii para ativar Prêmio do mês, Sorteio e os campos CPF/origem.
        </div>
      )}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, borderBottom: '1px solid var(--line)' }}>
        {([['lista', 'Indicações (Kanban)', 'ti-layout-kanban'], ['sorteio', 'Sorteio', 'ti-confetti'], ['premio', 'Prêmio & Link', 'ti-gift']] as const).map(([k, label, ic]) => (
          <button key={k} onClick={() => setTab(k)} className="btn" style={{
            border: 'none', borderBottom: tab === k ? '2px solid var(--brand-500)' : '2px solid transparent',
            borderRadius: 0, background: 'none', color: tab === k ? 'var(--brand-500)' : 'var(--text-2)', fontWeight: tab === k ? 700 : 500,
          }}><i className={`ti ${ic}`} /> {label}</button>
        ))}
      </div>

      {msg && <div className="rel-legend" style={{ marginBottom: 10 }}><i className="ti ti-info-circle" /> {msg}</div>}

      {tab === 'lista' && (
        <>
          {/* Dashboard de gestão */}
          <div className="rel-card" style={{ marginBottom: 14 }}>
            <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-chart-bar" /> Dashboard de Gestão de Indiques · {mesLabel()}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginTop: 12 }}>
              {([['Indiques no mês', String(totalIndicados), 'ti-user-heart'], ['Meta mensal', String(metaMes), 'ti-target'], ['Meta diária', `${metaDia}/dia`, 'ti-calendar-stats'], ['Média/dia atual', String(Math.round(mediaDia)), 'ti-calendar-check'], ['Projeção do mês', String(projecao), 'ti-trending-up'], ['% da meta', `${pctMeta}%`, 'ti-percentage']] as const).map(([l, v, ic]) => (
                <div key={l} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className={`ti ${ic}`} style={{ fontSize: 18, color: 'var(--brand-500)' }} />
                  <span><span style={{ display: 'block', fontSize: 11, color: 'var(--text-2)' }}>{l}</span><b style={{ fontSize: 17 }}>{v}</b></span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <BarRow label="Meta mensal" value={metaMes} max={Math.max(metaMes, projecao, totalIndicados, 1)} />
              <BarRow label="Realizado" value={totalIndicados} max={Math.max(metaMes, projecao, totalIndicados, 1)} cor="var(--green)" />
              <BarRow label="Projeção" value={projecao} max={Math.max(metaMes, projecao, totalIndicados, 1)} cor="var(--amber)" />
            </div>
          </div>

          {/* Filtro de unidade + período */}
          <div className="rel-card" style={{ marginBottom: 12 }}>
            <div className="rel-card-h"><span><i className="ti ti-filter" /> Período: <b>{mesLabel()}</b></span></div>
            <div style={{ marginTop: 10, maxWidth: 320 }}>
              <label style={lbl}>Unidade</label>
              <select style={inp} value={filtroUni} onChange={(e) => setFiltroUni(e.target.value)}>
                <option value={TODAS}>Todas as unidades</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>

          {/* KPIs do legado */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 12 }}>
            {([['Leads indicados', String(totalIndicados), 'ti-users'], ['Sendo trabalhados', `${trabalhados}/${totalIndicados}`, 'ti-progress-check'], ['Fechados', String(fechados), 'ti-circle-check'], ['Indicadores no mês', String(indicadoresMes), 'ti-user-heart']] as const).map(([l, v, ic]) => (
              <div key={l} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: '#F7E7EB', color: 'var(--brand-500)', flexShrink: 0 }}><i className={`ti ${ic}`} style={{ fontSize: 19 }} /></span>
                <span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{l}</span><b style={{ fontSize: 20 }}>{v}</b></span>
              </div>
            ))}
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '0 0 12px' }}>
            <button className="btn btn-primary" onClick={() => setNova(true)}><i className="ti ti-user-plus" /> Novo indique</button>
            <button className="btn btn-ghost" onClick={() => copiar(link, 'Link de indicação copiado — compartilhe em grupos e redes sociais.')}><i className="ti ti-link" /> Copiar link de indicação</button>
            <button className="btn btn-ghost" disabled={busy} onClick={onEnviarCrm}><i className="ti ti-affiliate" /> {busy ? 'Enviando…' : 'Enviar novos ao CRM'}</button>
          </div>
          <div className="rel-legend" style={{ marginBottom: 12 }}>
            <i className="ti ti-link" /> Link compartilhável: <b>{link}</b> — cada indicado que entrar vira um <b>lead novo</b> no quadro, registrando <b>quem indicou</b> para as automações.
          </div>

          {/* Kanban dos indicados por status */}
          {leads.length === 0 ? (
            <div className="rel-card" style={{ textAlign: 'center', color: 'var(--text-3)', padding: 30 }}>Nenhuma indicação neste mês para o filtro selecionado.</div>
          ) : (
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
              {IND_STATUS.map((st) => {
                const items = leads.filter((x) => x.status === st)
                return (
                  <div key={st} style={{ minWidth: 235, flex: '0 0 235px', background: 'var(--surface-2)', borderRadius: 11, padding: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: IND_STATUS_COR[st], marginRight: 6 }} />{st}</span>
                      <span style={{ color: 'var(--text-3)' }}>{items.length}</span>
                    </div>
                    {items.map((x) => {
                      const o = origemLabel(x.origem)
                      return (
                        <div key={x.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 9, padding: '9px 10px', marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{x.nome}</div>
                          {x.whats && <div style={{ fontSize: 11, color: 'var(--text-3)' }}><i className="ti ti-brand-whatsapp" style={{ color: '#25D366', verticalAlign: -1 }} /> {x.whats}</div>}
                          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}><i className="ti ti-user-heart" style={{ color: 'var(--gold-600)', verticalAlign: -1 }} /> Indicado por <b>{x.por}</b></div>
                          <div style={{ marginTop: 3 }}><span className="orig-tag" style={{ fontSize: 10, background: o.cor + '1a', color: o.cor }}><i className={`ti ${o.icon}`} /> {o.label}</span></div>
                          <select value={x.status} onChange={(e) => onSetStatus(x.id, e.target.value)} style={{ marginTop: 7, width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: 5, fontSize: 11, fontFamily: 'inherit' }}>
                            {IND_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )
                    })}
                    {items.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-3)', padding: 10, textAlign: 'center' }}>—</div>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'sorteio' && (
        <SorteioTab leads={leads} unidades={unidades} filtroUni={filtroUni} setFiltroUni={setFiltroUni} uniNomeSel={uniNomeSel} premioNome={premioNome} ultimoSorteio={ultimoSorteio} />
      )}

      {tab === 'premio' && (
        <PremioTab isAdmin={isAdmin} premio={premio} link={link} uniNomeSel={uniNomeSel} premioNome={premioNome} filtroUni={filtroUni} copiar={copiar} />
      )}

      {nova && <NovaIndicacao unidades={unidades} activeUnitId={activeUnitId} link={link} onClose={() => setNova(false)} onSaved={() => { setNova(false); router.refresh() }} />}
    </>
  )
}

function BarRow({ label, value, max, cor }: { label: string; value: number; max: number; cor?: string }) {
  const pct = Math.round((value / (max || 1)) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ width: 90, fontSize: 11.5, color: 'var(--text-2)' }}>{label}</span>
      <div style={{ flex: 1, height: 10, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor || 'var(--brand-500)' }} />
      </div>
      <b style={{ width: 36, textAlign: 'right', fontSize: 12 }}>{value}</b>
    </div>
  )
}

// ─────────────────────────── Sorteio (animação) ───────────────────────────

function SorteioTab({
  leads, unidades, filtroUni, setFiltroUni, uniNomeSel, premioNome, ultimoSorteio,
}: { leads: { nome: string; whats: string }[]; unidades: Unidade[]; filtroUni: string; setFiltroUni: (v: string) => void; uniNomeSel: string; premioNome: string; ultimoSorteio: Sorteio }) {
  const router = useRouter()
  // Pool dedup por nome+whats (legado indParticipantes 8223). Usa os indicadores via leads? Não:
  // o legado sorteia entre quem INDICOU; aqui usamos os indicados disponíveis no filtro.
  const pool = useMemo(() => {
    const seen = new Set<string>(); const out: { nome: string; whats: string }[] = []
    leads.forEach((x) => { const k = x.nome + x.whats; if (x.nome && !seen.has(k)) { seen.add(k); out.push({ nome: x.nome, whats: x.whats }) } })
    return out
  }, [leads])

  const [display, setDisplay] = useState('Pronto para sortear ✨')
  const [running, setRunning] = useState(false)
  const [won, setWon] = useState(false)
  const [winner, setWinner] = useState<{ nome: string; whats: string } | null>(null)
  const [savedId, setSavedId] = useState<string | null>(ultimoSorteio?.id ?? null)
  const [notificado, setNotificado] = useState(ultimoSorteio?.notificado ?? false)
  const [err, setErr] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function sortear() {
    setErr('')
    if (running) return
    if (pool.length < 2) { setErr('São necessários ao menos 2 participantes no mês.'); return }
    setRunning(true); setWon(false); setWinner(null)
    const w = pool[Math.floor(Math.random() * pool.length)]
    let t = 55, elapsed = 0; const total = 4300
    const tick = () => {
      const r = pool[Math.floor(Math.random() * pool.length)]
      setDisplay(r.nome)
      elapsed += t
      if (elapsed < total) { t = t * 1.09; timer.current = setTimeout(tick, t) }
      else reveal(w)
    }
    tick()
  }

  async function reveal(w: { nome: string; whats: string }) {
    setRunning(false); setDisplay(w.nome); setWon(true); setWinner(w)
    const r = await registrarSorteio({
      unidade_id: filtroUni === TODAS ? null : filtroUni,
      ganhador_nome: w.nome, ganhador_whats: w.whats, premio: premioNome,
    })
    if (r.ok && r.id) { setSavedId(r.id); setNotificado(false); router.refresh() }
    else if (!r.ok) setErr(r.error || '')
  }

  async function notificar() {
    if (!savedId) { setErr('Realize o sorteio primeiro.'); return }
    const r = await notificarGanhador(savedId)
    if (r.ok) { setNotificado(true); router.refresh() } else setErr(r.error || '')
  }

  return (
    <>
      <div className="rel-legend">Sorteio entre <b>todos que indicaram no mês</b> ({mesLabel()}). Selecione a unidade, clique em <b>Sortear</b> e transmita ao vivo no Instagram. O sistema rola pelos nomes e destaca o(a) ganhador(a).</div>
      <div className="rel-card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 14px' }}>
        <div style={{ minWidth: 240, flex: 1 }}>
          <label style={lbl}>Unidade do sorteio</label>
          <select style={inp} value={filtroUni} onChange={(e) => setFiltroUni(e.target.value)}>
            <option value={TODAS}>Rede inteira (todas)</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}><i className="ti ti-users" /> <b>{pool.length}</b> participantes · prêmio: <b>{premioNome}</b></div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto', padding: '11px 22px', fontSize: 15 }} disabled={running} onClick={sortear}><i className="ti ti-confetti" /> Sortear</button>
      </div>
      {err && <div className="rel-legend" style={{ color: 'var(--red)', marginBottom: 10 }}><i className="ti ti-alert-triangle" /> {err}</div>}

      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18, padding: '46px 24px', textAlign: 'center',
        background: 'linear-gradient(135deg,#3A0F19 0%,#6E2032 45%,#A8455C 100%)', color: '#fff',
        boxShadow: won ? '0 0 60px 6px rgba(224,178,82,.55)' : '0 18px 50px rgba(42,10,17,.35)',
        transition: 'box-shadow .6s',
      }}>
        <div style={{ fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', opacity: .8 }}>Indicação Premiada · {mesLabel()}</div>
        <div style={{ fontSize: 15, opacity: .92, marginTop: 6 }}>🎁 {premioNome}</div>
        <div style={{ fontWeight: 800, fontSize: 'clamp(30px,6vw,64px)', margin: '26px 0 10px', minHeight: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', textShadow: '0 4px 24px rgba(0,0,0,.3)' }}>{display}</div>
        <div style={{ fontSize: 14, opacity: .85 }} dangerouslySetInnerHTML={{ __html: won ? '🎉 <b>GANHADOR(A) DO MÊS!</b>' : running ? 'Sorteando…' : 'Clique em <b>Sortear</b> para começar' }} />
      </div>

      {won && winner && (
        <div className="rel-card" style={{ border: '1.5px solid var(--gold-400)', background: 'var(--gold-soft)', marginTop: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--gold-500)', color: '#3A2A06' }}><i className="ti ti-trophy" /></div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12, color: 'var(--gold-600)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>Ganhador(a) · {mesLabel()}</div>
              <div style={{ fontSize: 19, fontWeight: 800 }}>{winner.nome}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}><i className="ti ti-brand-whatsapp" style={{ color: '#25D366' }} /> {winner.whats} · {uniNomeSel}</div>
            </div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--text-3)' }}>Prêmio</div><div style={{ fontWeight: 700, color: 'var(--gold-600)' }}>{premioNome}</div></div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="btn btn-primary" disabled={notificado} onClick={notificar}><i className="ti ti-send" /> {notificado ? 'Notificado ✓' : 'Notificar ganhador(a) (e-mail + WhatsApp)'}</button>
            <button className="btn btn-ghost" onClick={sortear}><i className="ti ti-refresh" /> Sortear de novo</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────── Prêmio & Link ───────────────────────────

function PremioTab({
  isAdmin, premio, link, uniNomeSel, premioNome, filtroUni, copiar,
}: { isAdmin: boolean; premio: Premio; link: string; uniNomeSel: string; premioNome: string; filtroUni: string; copiar: (t: string, ok: string) => void }) {
  const router = useRouter()
  const [f, setF] = useState({ premio: premio?.premio || premioNome, valor_ref: premio?.valor_ref || '', observacao: premio?.observacao || '', meta_mensal: String(premio?.meta_mensal ?? 60) })
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const data = sorteioData()
  const msg = indMensagem(premioNome, data, uniNomeSel, link)

  async function salvar() {
    setSaving(true); setErr('')
    const r = await salvarPremio({
      unidade_id: filtroUni === TODAS ? null : filtroUni,
      premio: f.premio, valor_ref: f.valor_ref, observacao: f.observacao,
      meta_mensal: Number(f.meta_mensal) || 60,
    })
    setSaving(false)
    if (!r.ok) setErr(r.error || 'Erro.'); else router.refresh()
  }

  return (
    <>
      <div className="rel-legend">Cada unidade tem um <b>link próprio</b> da indicação premiada. As listas começam no <b>dia 1</b> e fecham no <b>último dia do mês</b>; o sorteio é no <b>dia 1 do mês seguinte às 18h</b> na rede social da unidade.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
        <div className="rel-card">
          <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-gift" /> Prêmio do mês {isAdmin ? '(admin)' : ''}</span></div>
          {isAdmin ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <div><label style={lbl}>Prêmio sorteado</label><input style={inp} value={f.premio} onChange={(e) => set('premio', e.target.value)} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={lbl}>Valor de referência</label><input style={inp} value={f.valor_ref} onChange={(e) => set('valor_ref', e.target.value)} placeholder="R$ 1.199" /></div>
                <div><label style={lbl}>Meta mensal</label><input style={inp} type="number" min={1} value={f.meta_mensal} onChange={(e) => set('meta_mensal', e.target.value)} /></div>
              </div>
              <div><label style={lbl}>Observação</label><input style={inp} value={f.observacao} onChange={(e) => set('observacao', e.target.value)} /></div>
              {err && <p style={{ color: 'var(--red)', fontSize: 12.5 }}>{err}</p>}
              <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={saving} onClick={salvar}><i className="ti ti-device-floppy" /> {saving ? 'Salvando…' : 'Salvar prêmio'}</button>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="metric-box" style={{ marginBottom: 8 }}><span>Prêmio</span><b>{premioNome}</b></div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Valor de referência: <b>{premio?.valor_ref || '—'}</b></div>
            </div>
          )}
          <div className="rel-legend" style={{ marginTop: 12 }}><i className="ti ti-calendar-event" /> Sorteio do mês: <b>{data} às 18h</b> · ao vivo no Instagram da {uniNomeSel}.</div>
        </div>

        <div className="rel-card">
          <div className="rel-card-h" style={{ cursor: 'default' }}><span><i className="ti ti-link" /> Link compartilhável da unidade</span></div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', margin: '10px 0 8px' }}>{link}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => copiar(link, 'Link copiado.')}><i className="ti ti-copy" /> Copiar link</button>
            <button className="btn btn-ghost" onClick={() => copiar(msg, 'Mensagem copiada.')}><i className="ti ti-brand-whatsapp" /> Copiar mensagem</button>
          </div>
          <div className="rel-card" style={{ marginTop: 12, background: 'linear-gradient(135deg,var(--brand-600),var(--brand-400))', color: '#fff', padding: 16 }}>
            <div style={{ fontSize: 11, opacity: .85, textTransform: 'uppercase', letterSpacing: 1 }}>Indicação Premiada · {uniNomeSel}</div>
            <div style={{ fontSize: 17, fontWeight: 800, margin: '6px 0' }}>Indique e concorra a<br />{premioNome}</div>
            <div style={{ fontSize: 12, opacity: .9 }}>Sorteio {data} · 18h · Instagram</div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────── Modal Novo indique ───────────────────────────

function NovaIndicacao({ unidades, activeUnitId, link, onClose, onSaved }: { unidades: Unidade[]; activeUnitId: string | null; link: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ indicador_nome: '', indicador_telefone: '', indicador_cpf: '', origem: 'balcao', unidade_id: activeUnitId || '' })
  const [indicados, setIndicados] = useState<IndicadoInput[]>([{ nome: '', telefone: '' }, { nome: '', telefone: '' }, { nome: '', telefone: '' }])
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('')
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))
  const setInd = (i: number, k: string, v: string) => setIndicados((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!f.indicador_nome.trim()) { setErr('Informe quem indicou.'); return }
    if (!f.unidade_id) { setErr('Selecione a unidade da indicação.'); return }
    // Legado: ao menos 3 indicados com NOME (telefone opcional).
    const validos = indicados.filter((i) => i.nome.trim())
    if (validos.length < 3) { setErr('Informe ao menos 3 pessoas indicadas (nome obrigatório; WhatsApp opcional).'); return }
    setSaving(true)
    const res = await criarIndicacao({ ...f, unidade_id: f.unidade_id || null, indicados })
    setSaving(false)
    if (!res.ok) setErr(res.error || 'Erro.'); else onSaved()
  }

  return (
    <Modal onClose={onClose} title="Novo indique">
      <div className="rel-legend" style={{ marginBottom: 10 }}><i className="ti ti-info-circle" /> Cada indicado entra como <b>lead novo</b> no Kanban e no CRM, registrando <b>quem indicou</b> (para as automações) e a <b>origem</b>.</div>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Quem está indicando *</label><input style={inp} value={f.indicador_nome} onChange={(e) => set('indicador_nome', e.target.value)} autoFocus /></div>
          <div><label style={lbl}>WhatsApp de quem indica</label><input style={inp} value={f.indicador_telefone} onChange={(e) => set('indicador_telefone', e.target.value)} placeholder="(00) 00000-0000" /></div>
          <div><label style={lbl}>CPF (opcional)</label><input style={inp} value={f.indicador_cpf} onChange={(e) => set('indicador_cpf', e.target.value)} placeholder="000.000.000-00" /></div>
          <div><label style={lbl}>Origem da indicação</label>
            <select style={inp} value={f.origem} onChange={(e) => set('origem', e.target.value)}>
              {IND_ORIGENS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div><label style={lbl}>Unidade *</label>
          <select style={inp} value={f.unidade_id} onChange={(e) => set('unidade_id', e.target.value)}>
            <option value="">— Selecione —</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>Pessoas indicadas (3 a 5)</div>
        {indicados.map((ind, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <input style={inp} placeholder={`Nome do indicado ${i + 1}${i < 3 ? ' *' : ' (opcional)'}`} value={ind.nome} onChange={(e) => setInd(i, 'nome', e.target.value)} />
            <input style={inp} placeholder="WhatsApp (opcional)" value={ind.telefone ?? ''} onChange={(e) => setInd(i, 'telefone', e.target.value)} />
          </div>
        ))}
        {indicados.length < 5 && <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={() => setIndicados((p) => [...p, { nome: '', telefone: '' }])}><i className="ti ti-plus" /> Adicionar indicado</button>}
        <div className="rel-legend" style={{ marginTop: 4 }}><i className="ti ti-link" /> Link p/ compartilhar: <b>{link}</b></div>
        {err && <p style={{ color: 'var(--red)', fontSize: 12.5 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Registrar indique'}</button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="lc-card" style={{ width: '100%', maxWidth: 640, padding: 22, background: '#fff', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="lc-title" style={{ fontSize: 18, marginBottom: 14 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}
