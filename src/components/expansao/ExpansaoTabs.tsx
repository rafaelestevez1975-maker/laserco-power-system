'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { moedaBR, dataBR } from '@/lib/fmt'
import { ExpansaoBoard } from './ExpansaoBoard'
import { simularLeadFranquia } from '@/app/(app)/expansao/actions'
import {
  type ExpEtapa, type ExpLead, type ExpUnidade, TIPOS_LEAD, TEMPERATURAS, corTipo, metaTemp,
} from './types'

type TabKey = 'dashboard' | 'captacao' | 'funil' | 'leads' | 'conversas' | 'tipos'

const TABS: { k: TabKey; label: string; icon: string }[] = [
  { k: 'dashboard', label: 'Dashboard', icon: 'ti-chart-pie' },
  { k: 'captacao', label: 'Captação', icon: 'ti-map-pin-share' },
  { k: 'funil', label: 'Funil', icon: 'ti-filter-cog' },
  { k: 'leads', label: 'Leads', icon: 'ti-list-check' },
  { k: 'conversas', label: 'Conversas', icon: 'ti-brand-whatsapp' },
  { k: 'tipos', label: 'Tipos', icon: 'ti-tag' },
]

// Endpoint do webhook do formulário do site (legado expCaptacao 8579).
const ENDPOINT_WEBHOOK = 'POST https://api.laserco.com.br/leads/site'

// Quantos dias um lead permanece "novo" (não visto) — legado EXP_LEADS novo: dias<=2.
function diasDesde(criadoEm: string | null): number {
  if (!criadoEm) return 9999
  const ms = Date.now() - new Date(criadoEm).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export function ExpansaoTabs({
  migracaoOk, etapas, leads, totalLeads, totaisPorEtapa, leadsCapped, unidades, activeUnitId, isAdmin,
}: {
  migracaoOk: boolean
  etapas: ExpEtapa[]
  leads: ExpLead[]
  totalLeads: number
  totaisPorEtapa: Record<string, number>
  leadsCapped: boolean
  unidades: ExpUnidade[]
  activeUnitId: string | null
  isAdmin: boolean
}) {
  const [tab, setTab] = useState<TabKey>('dashboard')

  const nomeEtapa = useMemo(() => new Map(etapas.map((e) => [e.id, e.nome])), [etapas])

  return (
    <div>
      <div className="rel-tabs" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <div key={t.k} className={`rel-tab ${t.k === tab ? 'active' : ''}`} onClick={() => setTab(t.k)} style={{ cursor: 'pointer' }}>
            <i className={`ti ${t.icon}`} /> {t.label}
          </div>
        ))}
        <Link href="/expansao/disparos" className="rel-tab" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
          <i className="ti ti-send" /> Disparos <i className="ti ti-external-link" style={{ fontSize: 11 }} />
        </Link>
      </div>

      {!migracaoOk && <MigrationBanner />}

      {tab === 'dashboard' && <Dashboard leads={leads} etapas={etapas} nomeEtapa={nomeEtapa} totalLeads={totalLeads} totaisPorEtapa={totaisPorEtapa} leadsCapped={leadsCapped} />}
      {tab === 'captacao' && <Captacao leads={leads} etapas={etapas} nomeEtapa={nomeEtapa} activeUnitId={activeUnitId} isAdmin={isAdmin} migracaoOk={migracaoOk} />}
      {tab === 'funil' && <Funil leads={leads} etapas={etapas} totaisPorEtapa={totaisPorEtapa} leadsCapped={leadsCapped} />}
      {tab === 'leads' && (
        migracaoOk
          ? <Leads etapas={etapas} leads={leads} unidades={unidades} activeUnitId={activeUnitId} isAdmin={isAdmin} nomeEtapa={nomeEtapa} />
          : <EmptyState texto="O quadro de leads de franquia será ativado após a migration 050." />
      )}
      {tab === 'conversas' && <Conversas />}
      {tab === 'tipos' && <Tipos leads={leads} />}
    </div>
  )
}

function MigrationBanner() {
  return (
    <div className="rel-legend" style={{ background: 'var(--amber)' + '22', color: 'var(--text)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <i className="ti ti-alert-triangle" style={{ color: 'var(--amber)', fontSize: 18 }} />
      <span><b>Aplique a migration 050 para ativar a Expansão.</b> Rode <code>scripts/migrations/050_expansao_pipeline.sql</code> no banco lkii para criar o pipeline de franquia (coluna <code>pipeline</code>, etapas e leads demo). Enquanto isso, a tela funciona em modo vazio.</span>
    </div>
  )
}

function EmptyState({ texto }: { texto: string }) {
  return (
    <div className="rel-card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
      <i className="ti ti-mood-empty" style={{ fontSize: 30 }} />
      <p style={{ margin: '8px 0 0', fontWeight: 600 }}>Sem dados ainda</p>
      <p style={{ fontSize: 13 }}>{texto}</p>
    </div>
  )
}

// ─── KPI helper (classe .kpi do tema) ───
function Kpi({ label, value, icon, cor }: { label: string; value: string; icon: string; cor?: string }) {
  return (
    <div className="kpi">
      <div className="kicon" style={{ background: (cor || 'var(--brand-500)') + '22', color: cor || 'var(--brand-500)' }}><i className={`ti ${icon}`} /></div>
      <div className="klabel">{label}</div>
      <div className="kvalue">{value}</div>
    </div>
  )
}

// ─── Barra horizontal simples (gráfico do dashboard) ───
function BarList({ rows }: { rows: { label: string; valor: number; cor?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.valor))
  if (rows.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sem dados.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 150, fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
          <div style={{ flex: 1, background: 'var(--line)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ height: 22, width: `${Math.round((r.valor / max) * 100)}%`, background: r.cor || 'var(--brand-500)', borderRadius: 7, minWidth: r.valor ? 6 : 0 }} />
          </div>
          <div style={{ width: 34, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{r.valor}</div>
        </div>
      ))}
    </div>
  )
}

function badgeEtapa(et: ExpEtapa | undefined, nome: string) {
  if (!et) return <span style={{ fontSize: 12 }}>{nome || '—'}</span>
  return <span className="os-st" style={{ background: et.cor + '22', color: et.cor }}>{et.nome}</span>
}

// ─── DASHBOARD ───
function Dashboard({ leads, etapas, nomeEtapa, totalLeads, totaisPorEtapa, leadsCapped }: {
  leads: ExpLead[]; etapas: ExpEtapa[]; nomeEtapa: Map<string, string>
  totalLeads: number; totaisPorEtapa: Record<string, number>; leadsCapped: boolean
}) {
  // total REAL (count exato) — não o tamanho do array capado.
  const total = totalLeads
  const nomeDe = (id: string | null) => (id ? nomeEtapa.get(id) ?? '' : '')
  // contagem exata por etapa (count exato) — somada por nome de etapa.
  const totalEtapaNome = (nome: string) => etapas.filter((e) => e.nome === nome).reduce((s, e) => s + (totaisPorEtapa[e.id] ?? 0), 0)
  const fechados = totalEtapaNome('Fechado')
  const perdidos = totalEtapaNome('Perdido')
  const reuniao = totalEtapaNome('Reunião Agendada')
  // Legado expDashboard (8614): quentes = temp 'quente' OU 'ardente'. (amostra capada)
  const quentes = leads.filter((l) => l.temperatura === 'quente' || l.temperatura === 'ardente').length
  // Legado expDashboard (8615): novos = leads com dias<=30. (amostra capada)
  const novos30 = leads.filter((l) => diasDesde(l.criado_em) <= 30).length
  const ativos = total - fechados - perdidos
  // Legado expDashboard (8615): conv = fechados / total. (sobre o total REAL)
  const conv = total > 0 ? Math.round((fechados / total) * 100) : 0

  // Funil por etapa usa a CONTAGEM EXATA por etapa (não o array capado).
  const funilRows = etapas.filter((e) => e.nome !== 'Perdido').map((e) => ({
    label: e.nome, valor: totaisPorEtapa[e.id] ?? 0, cor: e.cor,
  }))
  // Tipo e origem só temos sobre a amostra (não há count exato por tipo/origem aqui).
  const tipoRows = TIPOS_LEAD.map((t) => ({ label: t.label, valor: leads.filter((l) => l.tipo_lead === t.label).length, cor: t.cor }))
  const origMap = new Map<string, number>()
  for (const l of leads) origMap.set(l.origem || '—', (origMap.get(l.origem || '—') || 0) + 1)
  const origRows = [...origMap.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)

  if (total === 0) return <EmptyState texto="Nenhum lead de franquia ainda. Cadastre na aba Leads ou ative a captação." />

  return (
    <div>
      <div className="kpi-grid">
        <Kpi label="Total de leads" value={total.toLocaleString('pt-BR')} icon="ti-users" />
        <Kpi label="Fechados" value={`${fechados.toLocaleString('pt-BR')} (${conv}%)`} icon="ti-circle-check" cor="#10b981" />
        <Kpi label="Reunião agendada" value={reuniao.toLocaleString('pt-BR')} icon="ti-calendar-event" cor="#8b5cf6" />
        <Kpi label="Leads quentes" value={`${quentes.toLocaleString('pt-BR')}${leadsCapped ? '+' : ''}`} icon="ti-flame" cor="#ef4444" />
      </div>
      <div className="kpi-grid">
        <Kpi label="Novos (30 dias)" value={`${novos30.toLocaleString('pt-BR')}${leadsCapped ? '+' : ''}`} icon="ti-user-plus" cor="#0ea5e9" />
        <Kpi label="Perdidos" value={perdidos.toLocaleString('pt-BR')} icon="ti-user-x" cor="#ef4444" />
        <Kpi label="Taxa de conversão" value={`${conv}%`} icon="ti-percentage" cor="#0d9488" />
        <Kpi label="Em pipeline" value={ativos.toLocaleString('pt-BR')} icon="ti-progress-check" />
      </div>

      {leadsCapped && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
          <i className="ti ti-info-circle" /> Total e funil consideram todos os {total.toLocaleString('pt-BR')} leads. Gráficos por <b>tipo</b>/<b>origem</b>, <b>quentes</b> e <b>novos</b> usam a amostra dos {leads.length.toLocaleString('pt-BR')} mais recentes.
        </div>
      )}

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <div className="dash-w"><h4><i className="ti ti-filter-cog" /> Funil de conversão</h4><BarList rows={funilRows} /></div>
        <div className="dash-w"><h4><i className="ti ti-route" /> Leads por origem{leadsCapped ? ' (amostra)' : ''}</h4><BarList rows={origRows} /></div>
        <div className="dash-w"><h4><i className="ti ti-tag" /> Leads por tipo (produto){leadsCapped ? ' (amostra)' : ''}</h4><BarList rows={tipoRows} /></div>
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-list flt" /> Últimos leads</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Lead</th><th>Empresa / UF</th><th>Tipo</th><th>Origem</th><th>Etapa</th><th>Temperatura</th><th>Valor est.</th><th>Entrada</th></tr></thead>
            <tbody>
              {leads.slice(0, 10).map((l) => {
                const tmp = metaTemp(l.temperatura)
                const et = etapas.find((e) => e.id === l.etapa_id)
                return (
                  <tr key={l.id}>
                    <td><span style={{ fontWeight: 600 }}>{l.nome || '—'}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{[l.empresa, l.uf].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{l.tipo_lead ? <span className="os-st" style={{ background: corTipo(l.tipo_lead) + '22', color: corTipo(l.tipo_lead) }}>{l.tipo_lead}</span> : '—'}</td>
                    <td>{l.origem || '—'}</td>
                    <td>{badgeEtapa(et, nomeDe(l.etapa_id))}</td>
                    <td>{l.temperatura ? <span className="os-st" style={{ background: tmp.cor + '22', color: tmp.cor }}>{tmp.label}</span> : '—'}</td>
                    <td>{l.valor_estimado ? moedaBR(l.valor_estimado) : '—'}</td>
                    <td>{dataBR(l.criado_em)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── CAPTAÇÃO ───
function Captacao({
  leads, etapas, nomeEtapa, activeUnitId, isAdmin, migracaoOk,
}: {
  leads: ExpLead[]; etapas: ExpEtapa[]; nomeEtapa: Map<string, string>
  activeUnitId: string | null; isAdmin: boolean; migracaoOk: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; txt: string } | null>(null)

  const geo = leads.filter((l) => l.origem === 'geolocalizado')
  const site = leads.filter((l) => l.origem === 'site')
  // Legado expCaptacao (8571): "novos" = leads com dias<=7.
  const sete = leads.filter((l) => diasDesde(l.criado_em) <= 7)
  // Legado expCaptacao (8574): "Novos não vistos" = leads ainda na etapa "Novo Lead" e recém-chegados (dias<=2).
  const naoVistos = leads.filter((l) => diasDesde(l.criado_em) <= 2 && nomeEtapa.get(l.etapa_id || '') === 'Novo Lead')
  const recentes = sete.slice(0, 20)

  const podeSimular = isAdmin || !!activeUnitId

  async function simular() {
    setBusy(true); setMsg(null)
    const r = await simularLeadFranquia(activeUnitId || '')
    setBusy(false)
    if (!r.ok) { setMsg({ tipo: 'erro', txt: r.error || 'Erro ao simular lead.' }); return }
    setMsg({ tipo: 'ok', txt: `Novo lead recebido via ${r.origem === 'geolocalizado' ? 'geolocalização' : 'site'}.` })
    router.refresh()
  }

  function copiarEndpoint() {
    const endpoint = ENDPOINT_WEBHOOK.replace(/^POST\s+/, '')
    navigator.clipboard?.writeText(endpoint).then(
      () => setMsg({ tipo: 'ok', txt: 'Endpoint copiado.' }),
      () => setMsg({ tipo: 'erro', txt: 'Não foi possível copiar.' }),
    )
  }

  return (
    <div>
      <div className="rel-legend">
        Leads que entram automaticamente por <b>geolocalização</b> (CRM) e pelo <b>cadastro do site</b>. O formulário do site integra direto aqui via <b>webhook</b> — cada novo lead cai no funil em <b>Novo Lead</b> e gera notificação no menu Expansão.
      </div>
      <div className="kpi-grid">
        <Kpi label="Leads (7 dias)" value={String(sete.length)} icon="ti-user-plus" />
        <Kpi label="Via geolocalizado" value={String(geo.length)} icon="ti-map-pin" cor="#0ea5e9" />
        <Kpi label="Via site" value={String(site.length)} icon="ti-world" cor="#10b981" />
        <Kpi label="Novos não vistos" value={String(naoVistos.length)} icon="ti-bell" cor="#f59e0b" />
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <div className="dash-w">
          <h4><i className="ti ti-plug-connected" /> Integração com o site (webhook)</h4>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>Cole este endpoint no formulário do site (Webhook / Zapier / API):</div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 11.5, margin: '8px 0', wordBreak: 'break-all' }}>{ENDPOINT_WEBHOOK}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Campos: nome, telefone, e-mail, cidade/UF, interesse. Origem <b>site</b> → cai em <b>Novo Lead</b>.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <button className="btn btn-ghost" onClick={copiarEndpoint}><i className="ti ti-copy" /> Copiar endpoint</button>
            {migracaoOk && podeSimular && (
              <button className="btn btn-ghost" onClick={simular} disabled={busy}><i className="ti ti-flask" /> {busy ? 'Simulando…' : 'Simular novo lead'}</button>
            )}
          </div>
          {msg && <p style={{ fontSize: 12, marginTop: 8, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.txt}</p>}
        </div>
        <div className="dash-w">
          <h4><i className="ti ti-route" /> Entrada de leads por origem</h4>
          <BarList rows={(() => {
            const m = new Map<string, number>()
            for (const l of leads) m.set(l.origem || '—', (m.get(l.origem || '—') || 0) + 1)
            return [...m.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)
          })()} />
        </div>
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-inbox flt" /> Entrada recente de leads (Geo + Site)</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Origem</th><th>Interesse</th><th>UF</th><th>Entrada</th><th>Status</th></tr></thead>
            <tbody>
              {recentes.length === 0
                ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 18 }}>Nenhum lead recente (últimos 7 dias).</td></tr>
                : recentes.map((l) => {
                  const et = etapas.find((e) => e.id === l.etapa_id)
                  const d = diasDesde(l.criado_em)
                  return (
                    <tr key={l.id}>
                      <td><span style={{ fontWeight: 600 }}>{l.nome || '—'}</span></td>
                      <td>{l.telefone || '—'}</td>
                      <td>{l.origem === 'geolocalizado'
                        ? <span className="os-st os-andamento"><i className="ti ti-map-pin" /> Geolocalizado</span>
                        : l.origem === 'site'
                          ? <span className="os-st os-fechada"><i className="ti ti-world" /> Site</span>
                          : (l.origem || '—')}</td>
                      <td>{l.tipo_lead || '—'}</td>
                      <td>{l.uf || '—'}</td>
                      <td>{d === 0 ? 'hoje' : `há ${d} dia(s)`}</td>
                      <td>{badgeEtapa(et, nomeEtapa.get(l.etapa_id || '') || '')}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── FUNIL ───
function Funil({ leads, etapas, totaisPorEtapa, leadsCapped }: {
  leads: ExpLead[]; etapas: ExpEtapa[]; totaisPorEtapa: Record<string, number>; leadsCapped: boolean
}) {
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos')
  const semFiltro = filtroTipo === 'Todos'
  const visiveis = semFiltro ? leads : leads.filter((l) => l.tipo_lead === filtroTipo)
  const etapasFunil = etapas.filter((e) => e.nome !== 'Perdido')
  // Sem filtro de tipo, usa a CONTAGEM EXATA por etapa (não cai no teto). Com filtro
  // de tipo, só temos a amostra (não há count exato por tipo) — sinalizamos isso.
  const counts = etapasFunil.map((e) => ({
    etapa: e,
    c: semFiltro ? (totaisPorEtapa[e.id] ?? 0) : visiveis.filter((l) => l.etapa_id === e.id).length,
  }))
  const max = Math.max(1, ...counts.map((c) => c.c))
  const tiposBtn = ['Todos', ...TIPOS_LEAD.map((t) => t.label)]

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {tiposBtn.map((t) => (
          <button key={t} className={`btn ${t === filtroTipo ? 'btn-primary' : ''}`} style={{ padding: '5px 12px' }} onClick={() => setFiltroTipo(t)}>{t}</button>
        ))}
      </div>
      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12 }}>
          <span><i className="ti ti-filter-cog flt" /> Pipeline por etapa</span>
          {!semFiltro && leadsCapped && <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>amostra dos {leads.length.toLocaleString('pt-BR')} mais recentes</span>}
        </div>
        {counts.map(({ etapa, c }) => (
          <div key={etapa.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <div style={{ width: 160, fontSize: 12.5, color: 'var(--text-2)' }}>{etapa.nome}</div>
            <div style={{ flex: 1, background: 'var(--line)', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ height: 24, width: `${Math.round((c / max) * 100)}%`, background: etapa.cor, borderRadius: 7, minWidth: c ? 6 : 0 }} />
            </div>
            <div style={{ width: 36, textAlign: 'right', fontWeight: 700 }}>{c}</div>
          </div>
        ))}
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}>
          <span><i className="ti ti-list flt" /> Leads ({visiveis.length.toLocaleString('pt-BR')})</span>
          {semFiltro && leadsCapped && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>exibindo {visiveis.length.toLocaleString('pt-BR')} de {counts.reduce((s, c) => s + c.c, 0).toLocaleString('pt-BR')}+ leads</span>}
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Tipo</th><th>Etapa</th><th>Temperatura</th><th>Origem</th></tr></thead>
            <tbody>
              {visiveis.length === 0
                ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 18 }}>Sem leads para este filtro.</td></tr>
                : visiveis.map((l) => {
                  const tmp = metaTemp(l.temperatura)
                  const et = etapas.find((e) => e.id === l.etapa_id)
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.nome || '—'}</td>
                      <td>{l.telefone || '—'}</td>
                      <td>{l.tipo_lead ? <span className="os-st" style={{ background: corTipo(l.tipo_lead) + '22', color: corTipo(l.tipo_lead) }}>{l.tipo_lead}</span> : '—'}</td>
                      <td>{et ? <span className="os-st" style={{ background: et.cor + '22', color: et.cor }}>{et.nome}</span> : '—'}</td>
                      <td>{l.temperatura ? <span className="os-st" style={{ background: tmp.cor + '22', color: tmp.cor }}>{tmp.label}</span> : '—'}</td>
                      <td>{l.origem || '—'}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── LEADS (toggle Kanban | Lista) ─── legado expList (8632)
function Leads({
  etapas, leads, unidades, activeUnitId, isAdmin, nomeEtapa,
}: {
  etapas: ExpEtapa[]; leads: ExpLead[]; unidades: ExpUnidade[]
  activeUnitId: string | null; isAdmin: boolean; nomeEtapa: Map<string, string>
}) {
  const [mode, setMode] = useState<'kanban' | 'lista'>('kanban')

  return (
    <div>
      <div className="rel-acts" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className={`btn ${mode === 'kanban' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('kanban')}><i className="ti ti-layout-kanban" /> Kanban</button>
        <button className={`btn ${mode === 'lista' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('lista')}><i className="ti ti-list" /> Lista</button>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} title="Importação de planilha (.xlsx) — em breve" onClick={() => alert('Importe a planilha de leads (.xlsx) no padrão Nome / Telefone / E-mail / Empresa / Tipo / UF. Recurso em integração.')}>
          <i className="ti ti-upload" /> Importar (.xlsx)
        </button>
      </div>

      {mode === 'kanban'
        ? <ExpansaoBoard etapas={etapas} leads={leads} unidades={unidades} activeUnitId={activeUnitId} isAdmin={isAdmin} />
        : (
          <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-list flt" /> Leads ({leads.length})</span></div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Empresa</th><th>UF</th><th>Tipo</th><th>Status</th><th>Temperatura</th></tr></thead>
                <tbody>
                  {leads.length === 0
                    ? <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 18 }}>Nenhum lead cadastrado.</td></tr>
                    : leads.map((l) => {
                      const tmp = metaTemp(l.temperatura)
                      const et = etapas.find((e) => e.id === l.etapa_id)
                      return (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 600 }}>{l.nome || '—'}</td>
                          <td>{l.telefone || '—'}</td>
                          <td>{l.email || '—'}</td>
                          <td>{l.empresa || '—'}</td>
                          <td>{l.uf || '—'}</td>
                          <td>{l.tipo_lead ? <span className="os-st" style={{ background: corTipo(l.tipo_lead) + '22', color: corTipo(l.tipo_lead) }}>{l.tipo_lead}</span> : '—'}</td>
                          <td>{badgeEtapa(et, nomeEtapa.get(l.etapa_id || '') || '')}</td>
                          <td>{l.temperatura ? <span className="os-st" style={{ background: tmp.cor + '22', color: tmp.cor }}>{tmp.label}</span> : '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  )
}

// ─── CONVERSAS ───
// As conversas reais de WhatsApp ficam em sac_whatsapp_chats / sac_whatsapp_mensagens
// e são atendidas na Conversa (SAC). Esta aba NÃO tem fonte de conversas própria,
// então direciona para o relatório real (Expansão · WhatsApp CRM) e para a Triagem — em vez
// de exibir uma caixa de entrada fictícia. Sem dados inventados.
function Conversas() {
  return (
    <div>
      <div className="rel-legend">
        As conversas de <b>WhatsApp</b> da rede são registradas e atendidas na <b>Conversa</b> (SAC). Cada respondente de disparo vira um lead no funil de Expansão. Para iniciar campanhas, use a aba <Link href="/expansao/disparos" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>Disparos</Link>.
      </div>
      <div className="rel-card" style={{ textAlign: 'center', padding: 32 }}>
        <i className="ti ti-brand-whatsapp" style={{ fontSize: 34, color: '#25D366' }} />
        <p style={{ margin: '10px 0 4px', fontWeight: 700, fontSize: 15 }}>Atendimento de conversas no WhatsApp CRM</p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 520, margin: '0 auto 16px' }}>
          O resumo gerencial das conversas (total, não lidas, em atendimento, no bot) está no relatório <b>Expansão · WhatsApp CRM</b>. Para ler e responder mensagens com atribuição de atendente, use a <b>Conversa</b> em SAC.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/expansao/whatsapp" className="btn btn-primary" style={{ textDecoration: 'none' }}><i className="ti ti-chart-pie" /> Abrir WhatsApp CRM</Link>
          <Link href="/sac/triagem" className="btn btn-ghost" style={{ textDecoration: 'none' }}><i className="ti ti-messages" /> Conversa (SAC)</Link>
          <Link href="/expansao/disparos" className="btn btn-ghost" style={{ textDecoration: 'none' }}><i className="ti ti-send" /> Disparos</Link>
        </div>
      </div>
    </div>
  )
}

// ─── TIPOS ───
function Tipos({ leads }: { leads: ExpLead[] }) {
  return (
    <div>
      <div className="rel-legend">
        Tipos de lead (linhas de oferta): <b>Ultracell</b>, <b>Ultracell Pro</b>, <b>Quanta</b> e <b>Quanta Light</b> são as máquinas da rede; <b>Franquia</b> é a modalidade de franqueamento. Cada tipo tem cor própria e segmenta o funil e os gráficos.
      </div>
      <div className="rel-acts" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" title="Os tipos de oferta são fixos no sistema (paridade com o legado)." onClick={() => alert('Os tipos de lead são definidos pela franqueadora (linhas de oferta fixas). Para criar uma nova linha, fale com a operação.')}>
          <i className="ti ti-plus" /> Novo tipo de lead
        </button>
      </div>
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-tag flt" /> Tipos de lead</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Tipo de lead</th><th>Leads</th><th>Valor estimado total</th><th>Ações</th></tr></thead>
            <tbody>
              {TIPOS_LEAD.map((t) => {
                const doTipo = leads.filter((l) => l.tipo_lead === t.label)
                const soma = doTipo.reduce((s, l) => s + (l.valor_estimado || 0), 0)
                return (
                  <tr key={t.label}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: t.cor, display: 'inline-block' }} /> {t.label}
                      </span>
                    </td>
                    <td>{doTipo.length}</td>
                    <td>{moedaBR(soma)}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '3px 9px' }} title="Edição de tipo (cor) — gerida pela franqueadora" onClick={() => alert(`O tipo "${t.label}" usa a cor padrão da franqueadora. Edição de cores em integração.`)}>
                        <i className="ti ti-edit" /> Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
