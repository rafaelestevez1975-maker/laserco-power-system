'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { moedaBR, dataBR } from '@/lib/fmt'
import { ExpansaoBoard } from './ExpansaoBoard'
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

export function ExpansaoTabs({
  migracaoOk, etapas, leads, unidades, activeUnitId, isAdmin, origensCaptacao,
}: {
  migracaoOk: boolean
  etapas: ExpEtapa[]
  leads: ExpLead[]
  unidades: ExpUnidade[]
  activeUnitId: string | null
  isAdmin: boolean
  origensCaptacao: string[]
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
      {tab === 'captacao' && <Captacao leads={leads} origensCaptacao={origensCaptacao} />}
      {tab === 'funil' && <Funil leads={leads} etapas={etapas} />}
      {tab === 'leads' && (
        migracaoOk
          ? <ExpansaoBoard etapas={etapas} leads={leads} unidades={unidades} activeUnitId={activeUnitId} isAdmin={isAdmin} />
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

// ─── DASHBOARD ───
function Dashboard({ leads, etapas, nomeEtapa }: { leads: ExpLead[]; etapas: ExpEtapa[]; nomeEtapa: Map<string, string> }) {
  const total = leads.length
  const nomeDe = (id: string | null) => (id ? nomeEtapa.get(id) ?? '' : '')
  const fechados = leads.filter((l) => nomeDe(l.etapa_id) === 'Fechado').length
  const perdidos = leads.filter((l) => nomeDe(l.etapa_id) === 'Perdido').length
  const reuniao = leads.filter((l) => nomeDe(l.etapa_id) === 'Reunião Agendada').length
  const quentes = leads.filter((l) => l.temperatura === 'quente').length
  const ativos = total - fechados - perdidos
  const decididos = fechados + perdidos
  const conv = decididos > 0 ? Math.round((fechados / decididos) * 100) : 0

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
        <Kpi label="Em pipeline" value={String(ativos)} icon="ti-progress-check" />
        <Kpi label="Perdidos" value={String(perdidos)} icon="ti-user-x" cor="#ef4444" />
        <Kpi label="Taxa de conversão" value={`${conv}%`} icon="ti-percentage" cor="#0d9488" />
        <Kpi label="Tipos ativos" value={String(tipoRows.filter((t) => t.valor > 0).length)} icon="ti-tag" cor="#b7791f" />
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
            <thead><tr><th>Lead</th><th>Tipo</th><th>Origem</th><th>Etapa</th><th>Temperatura</th><th>Valor est.</th><th>Entrada</th></tr></thead>
            <tbody>
              {leads.slice(0, 10).map((l) => {
                const tmp = metaTemp(l.temperatura)
                return (
                  <tr key={l.id}>
                    <td><span style={{ fontWeight: 600 }}>{l.nome || '—'}</span></td>
                    <td>{l.tipo_lead ? <span className="os-st" style={{ background: corTipo(l.tipo_lead) + '22', color: corTipo(l.tipo_lead) }}>{l.tipo_lead}</span> : '—'}</td>
                    <td>{l.origem || '—'}</td>
                    <td>{nomeDe(l.etapa_id) || '—'}</td>
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
function Captacao({ leads, origensCaptacao }: { leads: ExpLead[]; origensCaptacao: string[] }) {
  const isCaptacao = (o: string | null) => !!o && origensCaptacao.includes(o)
  const geo = leads.filter((l) => l.origem === 'geolocalizado')
  const site = leads.filter((l) => l.origem === 'site')
  const recentes = leads.filter((l) => isCaptacao(l.origem)).slice(0, 20)

  return (
    <div>
      <div className="rel-legend">
        Leads que entram automaticamente por <b>geolocalização</b> (CRM) e pelo <b>cadastro do site</b>. O formulário do site integra direto aqui via <b>webhook</b> — cada novo lead cai no funil em <b>Novo Lead</b>.
      </div>
      <div className="kpi-grid">
        <Kpi label="Captação total" value={String(geo.length + site.length)} icon="ti-user-plus" />
        <Kpi label="Via geolocalizado" value={String(geo.length)} icon="ti-map-pin" cor="#0ea5e9" />
        <Kpi label="Via site" value={String(site.length)} icon="ti-world" cor="#10b981" />
        <Kpi label="Outras origens" value={String(leads.length - geo.length - site.length)} icon="ti-route" cor="#b7791f" />
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <div className="dash-w">
          <h4><i className="ti ti-plug-connected" /> Integração com o site (webhook)</h4>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>Endpoint do formulário do site (Webhook / Zapier / API):</div>
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 11.5, margin: '8px 0', wordBreak: 'break-all' }}>POST https://api.laserco.com.br/leads/site</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Campos: nome, telefone, e-mail, cidade/UF, interesse. Origem <b>site</b> → cai em <b>Novo Lead</b>.</div>
          {/* TODO(legado buildExpansao/expCaptacao): botão "Copiar endpoint" e "Simular novo lead" (expSimularLead) ainda não implementados — exigem rota de webhook real. */}
        </div>
        <div className="dash-w">
          <h4><i className="ti ti-route" /> Entrada por origem</h4>
          <BarList rows={(() => {
            const m = new Map<string, number>()
            for (const l of leads) m.set(l.origem || '—', (m.get(l.origem || '—') || 0) + 1)
            return [...m.entries()].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)
          })()} />
        </div>
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-inbox flt" /> Entrada recente (Geo + Site)</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>Origem</th><th>Interesse</th><th>Entrada</th></tr></thead>
            <tbody>
              {recentes.length === 0
                ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 18 }}>Nenhum lead de captação automática ainda.</td></tr>
                : recentes.map((l) => (
                  <tr key={l.id}>
                    <td><span style={{ fontWeight: 600 }}>{l.nome || '—'}</span></td>
                    <td>{l.telefone || '—'}</td>
                    <td>{l.origem === 'geolocalizado'
                      ? <span className="os-st os-andamento"><i className="ti ti-map-pin" /> Geolocalizado</span>
                      : <span className="os-st os-fechada"><i className="ti ti-world" /> Site</span>}</td>
                    <td>{l.tipo_lead || '—'}</td>
                    <td>{dataBR(l.criado_em)}</td>
                  </tr>
                ))}
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

// ─── CONVERSAS (placeholder honesto) ───
function Conversas() {
  return (
    <div className="rel-card" style={{ textAlign: 'center', padding: 40 }}>
      <i className="ti ti-brand-whatsapp" style={{ fontSize: 34, color: '#25D366' }} />
      <h3 style={{ margin: '10px 0 4px' }}>Conversas em construção</h3>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
        O atendimento estilo WhatsApp Web (integração Z-API/UAZAPI) será conectado aqui. Por ora, use a aba <b>Disparos</b> para enviar mensagens em massa aos candidatos a franquia.
      </p>
      <Link href="/expansao/disparos" className="btn btn-primary" style={{ marginTop: 14, textDecoration: 'none' }}><i className="ti ti-send" /> Ir para Disparos</Link>
      {/* TODO(legado buildExpansao/expWhats): inbox de conversas + chat Z-API. Depende de integração de inbox em tempo real. */}
    </div>
  )
}

// ─── TIPOS ───
function Tipos({ leads }: { leads: ExpLead[] }) {
  return (
    <div>
      <div className="rel-legend">
        Tipos de lead (linhas de oferta): <b>Ultracell</b> e <b>Quanta</b> são as máquinas da rede; <b>Franquia</b> é a modalidade de franqueamento. Cada tipo tem cor própria e segmenta o funil e os gráficos.
      </div>
      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px' }}><span><i className="ti ti-tag flt" /> Tipos de lead</span></div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Tipo de lead</th><th>Leads</th><th>Valor estimado total</th></tr></thead>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* TODO(legado buildExpansao/expTipos): CRUD de tipos de lead (novo/editar) — hoje os 3 tipos são fixos no código. Exigiria tabela própria de tipos. */}
    </div>
  )
}
