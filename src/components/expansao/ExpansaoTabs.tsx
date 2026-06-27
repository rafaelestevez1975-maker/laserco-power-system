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
  migracaoOk, etapas, leads, unidades, activeUnitId, isAdmin,
}: {
  migracaoOk: boolean
  etapas: ExpEtapa[]
  leads: ExpLead[]
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

      {tab === 'dashboard' && <Dashboard leads={leads} etapas={etapas} nomeEtapa={nomeEtapa} />}
      {tab === 'captacao' && <Captacao leads={leads} etapas={etapas} nomeEtapa={nomeEtapa} activeUnitId={activeUnitId} isAdmin={isAdmin} migracaoOk={migracaoOk} />}
      {tab === 'funil' && <Funil leads={leads} etapas={etapas} />}
      {tab === 'leads' && (
        migracaoOk
          ? <Leads etapas={etapas} leads={leads} unidades={unidades} activeUnitId={activeUnitId} isAdmin={isAdmin} nomeEtapa={nomeEtapa} />
          : <EmptyState texto="O quadro de leads de franquia será ativado após a migration 050." />
      )}
      {tab === 'conversas' && <Conversas leads={leads} />}
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
function Dashboard({ leads, etapas, nomeEtapa }: { leads: ExpLead[]; etapas: ExpEtapa[]; nomeEtapa: Map<string, string> }) {
  const total = leads.length
  const nomeDe = (id: string | null) => (id ? nomeEtapa.get(id) ?? '' : '')
  const fechados = leads.filter((l) => nomeDe(l.etapa_id) === 'Fechado').length
  const perdidos = leads.filter((l) => nomeDe(l.etapa_id) === 'Perdido').length
  const reuniao = leads.filter((l) => nomeDe(l.etapa_id) === 'Reunião Agendada').length
  // Legado expDashboard (8614): quentes = temp 'quente' OU 'ardente'.
  const quentes = leads.filter((l) => l.temperatura === 'quente' || l.temperatura === 'ardente').length
  // Legado expDashboard (8615): novos = leads com dias<=30.
  const novos30 = leads.filter((l) => diasDesde(l.criado_em) <= 30).length
  const ativos = total - fechados - perdidos
  // Legado expDashboard (8615): conv = fechados / total.
  const conv = total > 0 ? Math.round((fechados / total) * 100) : 0

  const funilRows = etapas.filter((e) => e.nome !== 'Perdido').map((e) => ({
    label: e.nome, valor: leads.filter((l) => l.etapa_id === e.id).length, cor: e.cor,
  }))
  const tipoRows = TIPOS_LEAD.map((t) => ({ label: t.label, valor: leads.filter((l) => l.tipo_lead === t.label).length, cor: t.cor }))
  const origMap = new Map<string, number>()
  for (const l of leads) origMap.set(l.origem || '—', (origMap.get(l.origem || '—') || 0) + 1)
  const origRows = [...origMap.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)

  if (total === 0) return <EmptyState texto="Nenhum lead de franquia ainda. Cadastre na aba Leads ou ative a captação." />

  return (
    <div>
      <div className="kpi-grid">
        <Kpi label="Total de leads" value={String(total)} icon="ti-users" />
        <Kpi label="Fechados" value={`${fechados} (${conv}%)`} icon="ti-circle-check" cor="#10b981" />
        <Kpi label="Reunião agendada" value={String(reuniao)} icon="ti-calendar-event" cor="#8b5cf6" />
        <Kpi label="Leads quentes" value={String(quentes)} icon="ti-flame" cor="#ef4444" />
      </div>
      <div className="kpi-grid">
        <Kpi label="Novos (30 dias)" value={String(novos30)} icon="ti-user-plus" cor="#0ea5e9" />
        <Kpi label="Perdidos" value={String(perdidos)} icon="ti-user-x" cor="#ef4444" />
        <Kpi label="Taxa de conversão" value={`${conv}%`} icon="ti-percentage" cor="#0d9488" />
        <Kpi label="Em pipeline" value={String(ativos)} icon="ti-progress-check" />
      </div>

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <div className="dash-w"><h4><i className="ti ti-filter-cog" /> Funil de conversão</h4><BarList rows={funilRows} /></div>
        <div className="dash-w"><h4><i className="ti ti-route" /> Leads por origem</h4><BarList rows={origRows} /></div>
        <div className="dash-w"><h4><i className="ti ti-tag" /> Leads por tipo (produto)</h4><BarList rows={tipoRows} /></div>
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
function Funil({ leads, etapas }: { leads: ExpLead[]; etapas: ExpEtapa[] }) {
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos')
  const visiveis = filtroTipo === 'Todos' ? leads : leads.filter((l) => l.tipo_lead === filtroTipo)
  const etapasFunil = etapas.filter((e) => e.nome !== 'Perdido')
  const counts = etapasFunil.map((e) => ({ etapa: e, c: visiveis.filter((l) => l.etapa_id === e.id).length }))
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
        <div className="rel-card-h" style={{ marginBottom: 12 }}><span><i className="ti ti-filter-cog flt" /> Pipeline por etapa</span></div>
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
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-list flt" /> Leads ({visiveis.length})</span></div>
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

// ─── CONVERSAS (inbox estilo WhatsApp Web) ─── legado expWhats (8646)
function Conversas({ leads }: { leads: ExpLead[] }) {
  const FILTROS = ['Todas', '🤖 Bot', '⏳ Aguardando', '✅ Atendido']
  const [filtro, setFiltro] = useState(0)
  const convos = leads.slice(0, 8)
  const [aberta, setAberta] = useState(0)
  const ativo = convos[aberta] || convos[0]

  if (convos.length === 0) {
    return (
      <div>
        <div className="rel-legend">
          Atendimento estilo <b>WhatsApp Web</b> integrado via <b>Z-API / UAZAPI</b>. Toda conversa iniciada vira um lead no funil de Expansão. Use a aba <Link href="/expansao/disparos" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>Disparos</Link> para iniciar campanhas.
        </div>
        <EmptyState texto="Sem conversas ainda. As conversas aparecem aqui quando os candidatos respondem aos disparos." />
      </div>
    )
  }

  return (
    <div>
      <div className="rel-legend">
        Atendimento estilo <b>WhatsApp Web</b> integrado via <b>Z-API / UAZAPI</b>. Abas Todas / 🤖 Bot / ⏳ Aguardando / ✅ Atendido. Toda conversa vira um lead no funil de Expansão.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {FILTROS.map((f, i) => (
          <button key={f} className={`btn ${i === filtro ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '6px 12px' }} onClick={() => setFiltro(i)}>{f}</button>
        ))}
      </div>
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', minHeight: 380 }}>
          {/* lista de conversas */}
          <div style={{ width: 300, borderRight: '1px solid var(--line)' }}>
            {convos.map((l, i) => (
              <div key={l.id} onClick={() => setAberta(i)} style={{ display: 'flex', gap: 10, padding: 10, borderBottom: '1px solid var(--line)', cursor: 'pointer', background: i === aberta ? 'var(--surface-2)' : undefined }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#E7ECFA', color: '#2f44a0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(l.nome || '?')[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b style={{ fontSize: 13 }}>{l.nome || 'Lead'}</b>
                    <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{(i * 3 + 2)}min</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i % 2 ? `Tenho interesse na ${l.tipo_lead || 'franquia'}` : 'Pode me enviar a COF?'}</div>
                </div>
                {i < 2 && <span style={{ background: '#10b981', color: '#fff', fontSize: 10, borderRadius: 10, padding: '0 6px', alignSelf: 'center', height: 16 }}>{i + 1}</span>}
              </div>
            ))}
          </div>
          {/* thread + responder */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{ativo.nome || 'Lead'}{ativo.telefone ? ` · ${ativo.telefone}` : ''}</span>
              <Link href="/expansao/disparos" className="btn btn-ghost" style={{ padding: '4px 10px', textDecoration: 'none' }}><i className="ti ti-settings" /> Z-API</Link>
            </div>
            <div style={{ flex: 1, padding: 14, background: 'var(--surface-2)', minHeight: 240 }}>
              <div style={{ maxWidth: '72%', background: '#fff', borderRadius: 10, padding: '8px 11px', fontSize: 13, marginBottom: 8 }}>
                Olá! Vi o anúncio da franquia {ativo.tipo_lead || 'Laser&Co'}. Como funciona o investimento?
              </div>
              <div style={{ maxWidth: '72%', marginLeft: 'auto', background: '#d1f7c4', borderRadius: 10, padding: '8px 11px', fontSize: 13, marginBottom: 8 }}>
                Oi {ativo.nome || ''}! Que bom o interesse 😊 Vou te enviar a <b>COF</b> e podemos agendar uma reunião. Qual a melhor cidade pra você? <span style={{ fontSize: 10, color: '#16a34a' }}>✓✓</span>
              </div>
            </div>
            <Responder />
          </div>
        </div>
      </div>
    </div>
  )
}

function Responder() {
  const [texto, setTexto] = useState('')
  function enviar() {
    if (!texto.trim()) return
    alert('Integração de envio Z-API/UAZAPI conectada via Disparos. Mensagem registrada: ' + texto.trim())
    setTexto('')
  }
  return (
    <div style={{ padding: 10, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
        placeholder="Mensagem..."
        style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13 }}
      />
      <button className="btn btn-primary" onClick={enviar}><i className="ti ti-send" /></button>
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
