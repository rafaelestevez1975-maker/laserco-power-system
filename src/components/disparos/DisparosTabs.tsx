'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WA_PILL } from '@/lib/automacoes'
import type { SegCriterio } from '@/lib/automacoes'
import { DisparoComposer, type CanalOpt } from '@/components/disparos/DisparoComposer'
import { SegmentadorModal } from '@/components/disparos/SegmentadorModal'
import {
  criarBaseSegmento, importarBaseExterna, excluirBase,
  respondentesParaCRM, excluirCampanha, agendarGrupoVip, excluirGrupoVip,
} from '@/app/(app)/disparos/actions'
import type { Template } from '@/app/(app)/expansao/disparos/actions'

export type CanalOpt2 = { nome: string; label: string; escopo: 'unidade' | 'geral' | null }
export type CampanhaRow = { id: string; nome: string; base: string; canal: string; status: string; enviadas: number; entregues: number; lidas: number; respostas: number; quando: string; unidade: string }
export type BaseRow = { id: string; nome: string; tipo: string; contatos: number; criada: string }
export type VipRow = { id: string; nome: string; convite: string | null; aquecimento: string | null; ofertaIni: string | null; ofertaFim: string | null; membros: number; status: string; link: string | null }
type ApiCard = { unidade: string; canal: string; status: string; numero: string | null }

type Props = {
  tabInicial: string
  canais: CanalOpt2[]
  apiCards: ApiCard[]
  campanhas: CampanhaRow[]
  bases: BaseRow[]
  vip: VipRow[]
  servicos: string[]
  unidades: string[]
  listas: { nome: string; qtd: number }[]
  templates: Template[]
  activeUnitId: string | null
  podeEscrever: boolean
  uazapiConfigurado: boolean
  semTabela: boolean
}

const TABS: [string, string, string][] = [
  ['campanhas', 'Campanhas', 'ti-speakerphone'],
  ['conversas', 'Conversas', 'ti-messages'],
  ['bases', 'Bases & Contatos', 'ti-database'],
  ['config', 'Configuração da API', 'ti-settings'],
  ['vip', 'Grupo VIP', 'ti-crown'],
]

function pill(status: string) {
  const [cls, lbl] = WA_PILL[status] ?? ['draft', status]
  const cor: Record<string, [string, string]> = {
    ok: ['#E7F9EE', '#1a8a4f'], done: ['#E7F9EE', '#1a8a4f'], run: ['var(--blue-bg, #E7F0FA)', 'var(--blue, #3D7FD1)'],
    pend: ['var(--amber-bg, #FBF0DD)', 'var(--amber, #9a6a12)'], draft: ['var(--surface-2)', 'var(--text-3)'],
  }
  const [bg, fg] = cor[cls] ?? cor.draft
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10, background: bg, color: fg }}>{lbl}</span>
}

function pct(n: number, d: number) { return Math.round((n / Math.max(d, 1)) * 100) + '%' }

export function DisparosTabs(props: Props) {
  const router = useRouter()
  const [tab, setTab] = useState(props.tabInicial)
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [segOpen, setSegOpen] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, after?: (r: T) => void) {
    setBusy(true); setErro('')
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setErro(r.error || 'Falha na operação.'); return }
    after?.(r); router.refresh()
  }

  return (
    <div>
      <div className="rel-head" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="ri" style={{ background: '#E7F9EE', color: '#1a8a4f', width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-brand-whatsapp" style={{ fontSize: 22 }} /></div>
        <div><h2 style={{ fontSize: 17, margin: 0 }}>Disparos WhatsApp API</h2><p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>Campanhas segmentadas, central de conversas, bases e Grupo VIP — pelo número de cada unidade.</p></div>
      </div>

      {/* Tab nav */}
      <div id="dispTabs" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(([key, lbl, ic]) => (
          <button key={key} className={`rel-tab ${tab === key ? 'active' : ''}`} onClick={() => { setTab(key); setReportId(null) }}
            style={{ border: 'none', background: 'none', padding: '9px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, borderBottom: tab === key ? '2px solid var(--brand-500)' : '2px solid transparent', color: tab === key ? 'var(--brand-600)' : 'var(--text-2)' }}>
            <i className={`ti ${ic}`} /> {lbl}
          </button>
        ))}
      </div>

      {props.semTabela && (
        <div className="rel-card" style={{ padding: 14, marginBottom: 14, background: 'var(--amber-bg, #FBF0DD)', color: 'var(--amber, #9a6a12)', fontSize: 13 }}>
          <i className="ti ti-database-exclamation" /> Aplique a migration <b>scripts/migrations/automacoes.sql</b> no lkii para persistir campanhas, bases e grupos VIP.
        </div>
      )}
      {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10 }}>{erro}</p>}

      {tab === 'campanhas' && (reportId
        ? <CampReport camp={props.campanhas.find((c) => c.id === reportId)!} onBack={() => setReportId(null)} onCRM={(id) => run(() => respondentesParaCRM(id), (r) => setErro(`${r.total} respondentes enviados ao CRM (origem: Disparo WhatsApp).`))} busy={busy} podeEscrever={props.podeEscrever} />
        : <TabCampanhas {...props} onReport={setReportId} onExcluir={(id) => run(() => excluirCampanha(id))} busy={busy} />)}

      {tab === 'conversas' && <TabConversas />}

      {tab === 'bases' && (
        <TabBases {...props} onSegmentar={() => setSegOpen(true)}
          onImportar={(nome, nums) => run(() => importarBaseExterna(nome, nums), (r) => setErro(`Base "${nome}" importada com ${r.total} contatos.`))}
          onExcluir={(id) => run(() => excluirBase(id))} busy={busy} />
      )}

      {tab === 'config' && <TabConfig apiCards={props.apiCards} uazapiConfigurado={props.uazapiConfigurado} />}

      {tab === 'vip' && (
        <TabVip vip={props.vip} podeEscrever={props.podeEscrever} busy={busy}
          onAgendar={(input) => run(() => agendarGrupoVip(input))}
          onExcluir={(id) => run(() => excluirGrupoVip(id))} />
      )}

      <SegmentadorModal
        open={segOpen} titulo="Criar segmento de base" aplicarLabel="Gerar base"
        servicos={props.servicos} unidades={props.unidades} busy={busy}
        onClose={() => setSegOpen(false)}
        onApply={(crit: SegCriterio[]) => { setSegOpen(false); run(() => criarBaseSegmento(crit), (r) => setErro(`Segmento criado · ${r.contatos} contatos.`)) }}
      />
    </div>
  )
}

// ─── Campanhas ───
function TabCampanhas({ campanhas, canais, listas, templates, activeUnitId, podeEscrever, onReport, onExcluir, busy }: Props & { onReport: (id: string) => void; onExcluir: (id: string) => void; busy: boolean }) {
  const agg = useMemo(() => campanhas.reduce((a, c) => ({ env: a.env + c.enviadas, entr: a.entr + c.entregues, lidas: a.lidas + c.lidas, resp: a.resp + c.respostas }), { env: 0, entr: 0, lidas: 0, resp: 0 }), [campanhas])
  const composerCanais: CanalOpt[] = canais.map((c) => ({ nome: c.nome, label: c.label, escopo: c.escopo, unidadeId: null, delayMin: 20, delayMax: 45 }))

  return (
    <div>
      <div className="rel-legend" style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}>
        Crie campanhas de disparo segmentadas. A base pode vir do próprio sistema (segmentos) ou de um arquivo externo importado. Cada campanha gera o seu próprio relatório de entrega, leitura e resposta.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="metric-box"><span>Campanhas</span><b>{campanhas.length}</b></div>
        <div className="metric-box"><span>Mensagens enviadas</span><b>{agg.env.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Taxa de leitura</span><b>{pct(agg.lidas, agg.entr)}</b></div>
        <div className="metric-box"><span>Respostas</span><b>{agg.resp}</b></div>
      </div>

      {/* Composer real (envio via UAZAPI) com seleção de base como público */}
      <div style={{ marginBottom: 16 }}>
        <DisparoComposer canais={composerCanais} activeUnitId={activeUnitId} templates={templates} listas={listas} />
      </div>

      {campanhas.length === 0 ? (
        <div className="rel-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
          Nenhuma campanha registrada ainda. Use o disparador acima — as campanhas enviadas aparecem aqui com entrega, leitura e respostas.
        </div>
      ) : (
        <div className="cli-card"><div className="cli-scroll"><table className="cli-table" style={{ width: '100%' }}>
          <thead><tr><th>Campanha</th><th>Unidade</th><th>Base</th><th>Status</th><th style={{ textAlign: 'right' }}>Enviadas</th><th style={{ textAlign: 'right' }}>Lidas</th><th style={{ textAlign: 'right' }}>Respostas</th><th>Relatório</th></tr></thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id}>
                <td><span className="cli-name">{c.nome}</span></td><td>{c.unidade}</td>
                <td><span style={{ fontSize: 11, background: 'var(--surface-2)', borderRadius: 10, padding: '2px 8px' }}>{c.base}</span></td>
                <td>{pill(c.status)}</td>
                <td style={{ textAlign: 'right' }}>{c.enviadas || ''}</td><td style={{ textAlign: 'right' }}>{c.lidas || ''}</td><td style={{ textAlign: 'right' }}>{c.respostas || ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span onClick={() => onReport(c.id)} style={{ color: 'var(--brand-600)', cursor: 'pointer', fontWeight: 600 }}><i className="ti ti-report" /> Relatório</span>
                  {podeEscrever && <span onClick={() => !busy && onExcluir(c.id)} style={{ color: 'var(--red)', cursor: 'pointer', marginLeft: 10 }}><i className="ti ti-trash" /></span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}

function CampReport({ camp, onBack, onCRM, busy, podeEscrever }: { camp: CampanhaRow; onBack: () => void; onCRM: (id: string) => void; busy: boolean; podeEscrever: boolean }) {
  const env = camp.enviadas || 0
  // entregues/lidas/respostas só são preenchidas por webhook da UAZAPI (writeback de
  // status), que ainda não existe — então ficam em 0. Mostramos os zeros reais e um
  // aviso honesto, em vez de fabricar Conversões (respostas×0.6) e Custo (×R$0,08)
  // que o legado inventava.
  const semMetricas = camp.entregues === 0 && camp.lidas === 0 && camp.respostas === 0
  const funnel: [string, number][] = [['Enviadas', env], ['Entregues', camp.entregues], ['Lidas', camp.lidas], ['Respostas', camp.respostas]]
  const max = Math.max(env, 1)
  return (
    <div>
      <div style={{ marginBottom: 12 }}><span onClick={onBack} style={{ color: 'var(--brand-600)', cursor: 'pointer', fontWeight: 600 }}><i className="ti ti-arrow-left" /> Voltar às campanhas</span></div>
      <div className="rel-head" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="ri" style={{ background: '#E7F9EE', color: '#1a8a4f', width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="ti ti-report" /></div>
        <div><h2 style={{ fontSize: 17, margin: 0 }}>{camp.nome}</h2><p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0 }}>{camp.unidade} · base "{camp.base}" · {camp.quando}</p></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="metric-box"><span>Enviadas</span><b>{env}</b></div>
        <div className="metric-box"><span>Entregues</span><b>{semMetricas ? '—' : `${camp.entregues} (${pct(camp.entregues, env)})`}</b></div>
        <div className="metric-box"><span>Lidas</span><b>{semMetricas ? '—' : `${camp.lidas} (${pct(camp.lidas, camp.entregues)})`}</b></div>
        <div className="metric-box"><span>Respostas</span><b>{semMetricas ? '—' : camp.respostas}</b></div>
      </div>

      <div className="rel-card" style={{ padding: 16, marginBottom: 16, background: '#E7F9EE', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <i className="ti ti-affiliate" style={{ fontSize: 24, color: '#0f6b3a' }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h4 style={{ margin: 0, fontSize: 14, color: '#0f6b3a' }}><i className="ti ti-arrow-right" /> {camp.respostas > 0 ? `${camp.respostas} respondentes viram leads no CRM` : 'Respondentes viram leads no CRM'}</h4>
          <p style={{ margin: 0, fontSize: 12.5, color: '#177a45' }}>{camp.respostas > 0 ? <>Cada um entra flegado como <b>Disparo WhatsApp</b> para a equipe seguir o fluxo de fechamento.</> : <>Quando a campanha tiver respostas, envie-as ao CRM flegadas como <b>Disparo WhatsApp</b>.</>}</p>
        </div>
        {podeEscrever && <button className="btn btn-primary" disabled={busy || camp.respostas <= 0} onClick={() => onCRM(camp.id)}><i className="ti ti-user-plus" /> Enviar ao CRM</button>}
      </div>

      <div className="rel-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}><i className="ti ti-filter" /> Funil da campanha</div>
        {semMetricas ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '6px 0' }}>
            Sem métricas de entrega/leitura/resposta ainda — elas chegam pelo retorno de status da UAZAPI (webhook). Por enquanto só registramos as <b>{env}</b> mensagens enviadas.
          </div>
        ) : funnel.map(([lbl, n]) => (
          <div key={lbl} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}><span>{lbl}</span><span style={{ color: 'var(--text-3)' }}>{n} ({pct(n, env)})</span></div>
            <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 5 }}><div style={{ height: 8, width: `${(n / max) * 100}%`, background: 'var(--brand-500)', borderRadius: 5 }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Conversas (dispConversas 6577) — inbox real depende do webhook; empty-state até então ───
function TabConversas() {
  return (
    <div>
      <div className="rel-legend" style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}>
        <b>Gestão de conversa no próprio sistema:</b> responda os clientes sem sair da plataforma. Toda conversa iniciada por um disparo vira um <b>lead no CRM</b>, flegado como <b>Disparo WhatsApp</b>.
      </div>
      <div className="rel-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
        <i className="ti ti-messages" style={{ fontSize: 30, display: 'block', marginBottom: 8 }} />
        As conversas recebidas chegam pela integração da UAZAPI (webhook → Triagem). Abra a <a href="/expansao/whatsapp" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>central de conversas</a> para responder os clientes e levá-los ao CRM.
      </div>
    </div>
  )
}

// ─── Bases & Contatos (dispBases 6635) ───
function TabBases({ bases, podeEscrever, onSegmentar, onImportar, onExcluir, busy }: Props & { onSegmentar: () => void; onImportar: (nome: string, nums: string) => void; onExcluir: (id: string) => void; busy: boolean }) {
  const [impOpen, setImpOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [nums, setNums] = useState('')

  return (
    <div>
      <div className="rel-legend" style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}>
        As bases do tipo <b>Sistema</b> são segmentos dinâmicos (atualizam sozinhos). As <b>Externas</b> vêm de arquivos importados (CSV/Excel) — ideais para leads de anúncios e listas de outras origens.
      </div>
      {podeEscrever && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setImpOpen((v) => !v)}><i className="ti ti-upload" /> Importar base externa</button>
          <button className="btn btn-primary" onClick={onSegmentar}><i className="ti ti-filter-plus" /> Criar base pelo sistema</button>
        </div>
      )}
      {impOpen && (
        <div className="rel-card" style={{ padding: 16, marginBottom: 14, display: 'grid', gap: 10, maxWidth: 560 }}>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Nome da base</label><input className="" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Leads Instagram set/out" style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line-strong, #ddd)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13 }} /></div>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Números (um por linha ou separados por vírgula)</label>
            <textarea value={nums} onChange={(e) => setNums(e.target.value)} placeholder={'48999990000\n11988887777'} style={{ width: '100%', minHeight: 90, padding: '8px 10px', border: '1px solid var(--line-strong, #ddd)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }} />
          </div>
          <div><button className="btn btn-primary" disabled={busy} onClick={() => onImportar(nome, nums)}><i className="ti ti-database-import" /> Importar base</button></div>
        </div>
      )}

      {bases.length === 0 ? (
        <div className="rel-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
          Nenhuma base criada ainda. {podeEscrever ? 'Crie um segmento pelo sistema ou importe uma base externa.' : 'Peça ao gestor para criar bases.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {bases.map((b) => (
            <div key={b.id} className="rel-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: b.tipo === 'externa' ? 'var(--gold-soft, #F6EAD2)' : '#E7F9EE', color: b.tipo === 'externa' ? 'var(--gold-600, #9A7B27)' : '#1a8a4f' }}>
                  <i className={`ti ${b.tipo === 'externa' ? 'ti-file-spreadsheet' : 'ti-filter-check'}`} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{b.criada}</div>
                </div>
                {pill(b.tipo === 'externa' ? 'pend' : 'ok')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}><b>{b.contatos.toLocaleString('pt-BR')}</b> contatos</div>
              {podeEscrever && <div style={{ marginTop: 10 }}><button className="btn btn-ghost" disabled={busy} onClick={() => onExcluir(b.id)} style={{ fontSize: 12, padding: '5px 10px' }}><i className="ti ti-trash" /> Excluir</button></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Config da API (dispConfig 6705) → reaproveita /canais (UAZAPI real) ───
function TabConfig({ apiCards, uazapiConfigurado }: { apiCards: ApiCard[]; uazapiConfigurado: boolean }) {
  return (
    <div>
      <div className="rel-legend" style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}>
        <b>Cada unidade tem o seu próprio número e credenciais</b> de WhatsApp. A gestão completa (criar instância, QR de pareamento, status, delay anti-ban) fica em <a href="/canais" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>Canais WhatsApp</a>.
      </div>
      <div style={{ marginBottom: 14 }}><a className="btn btn-primary" href="/canais"><i className="ti ti-plus" /> Conectar / gerenciar canais</a></div>
      {!uazapiConfigurado ? (
        <div className="rel-card" style={{ padding: 16, color: 'var(--amber)' }}>UAZAPI não configurada (faltam UAZAPI_BASE_URL / UAZAPI_ADMIN_TOKEN).</div>
      ) : apiCards.length === 0 ? (
        <div className="rel-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Nenhum canal cadastrado. Conecte um número em <a href="/canais" style={{ color: 'var(--brand-600)' }}>Canais</a>.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {apiCards.map((a) => (
            <div key={a.canal} className="rel-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E7F9EE', color: '#1a8a4f' }}><i className="ti ti-brand-whatsapp" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.unidade}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{a.numero ?? a.canal}</div>
                </div>
                {pill(a.status === 'connected' ? 'ok' : 'pend')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>UAZAPI · {a.status === 'connected' ? 'Conectada' : 'Pendente'}</div>
              <div style={{ marginTop: 11 }}><a className="btn btn-ghost" href="/canais" style={{ fontSize: 12, padding: '6px 10px' }}><i className="ti ti-settings" /> Gerenciar</a></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Grupo VIP (dispVIP 6713) ───
function TabVip({ vip, podeEscrever, busy, onAgendar, onExcluir }: { vip: VipRow[]; podeEscrever: boolean; busy: boolean; onAgendar: (i: { nome: string; dataConvite?: string; dataAquecimento?: string; dataOfertaIni?: string; dataOfertaFim?: string }) => void; onExcluir: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ nome: '', dataConvite: '', dataAquecimento: '', dataOfertaIni: '', dataOfertaFim: '' })
  const membros = vip.reduce((a, g) => a + g.membros, 0)
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line-strong, #ddd)', borderRadius: 8, fontFamily: 'inherit', fontSize: 13 }

  return (
    <div>
      <div className="rel-legend" style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}>
        O <b>Grupo VIP</b> é um grupo de WhatsApp temporário com <b>2 dias de ofertas exclusivas</b> em datas pré-agendadas. O sistema cria o grupo, convida os clientes, gera o link público e conduz o ciclo de aquecimento e venda.
      </div>

      {/* Ciclo de 3 etapas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          ['5 dias antes', 'Convite', 'Cria o grupo e envia convite aos clientes selecionados + link público para stories e redes.'],
          ['2 dias antes', 'Aquecimento', 'Mensagens automáticas para "esquentar" o grupo: contagem regressiva, bastidores e prévias.'],
          ['2 dias de venda', 'Ofertas ao vivo', 'Liberação programada das ofertas exclusivas com gatilhos de urgência. Encerra e arquiva o grupo.'],
        ].map(([d, t, desc]) => (
          <div key={t} className="rel-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-600)' }}>{d}</div>
            <div style={{ fontWeight: 700, fontSize: 14, margin: '2px 0 6px' }}>{t}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{desc}</div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--brand-500)' }}><i className="ti ti-sparkles" /> IA conduz a etapa</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="metric-box"><span>Grupos VIP agendados</span><b>{vip.length}</b></div>
        <div className="metric-box"><span>Membros (ativos)</span><b>{membros.toLocaleString('pt-BR')}</b></div>
        {/* conversão/receita do VIP não têm origem real (sem colunas no vip_grupos) → estado honesto em vez de número inventado (31% / R$ 42.800). */}
        <div className="metric-box"><span>Conversão média</span><b>—</b></div>
        <div className="metric-box"><span>Receita último VIP</span><b>—</b></div>
      </div>

      {podeEscrever && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={() => setOpen((v) => !v)}><i className="ti ti-plus" /> Agendar Grupo VIP</button>
        </div>
      )}
      {open && (
        <div className="rel-card" style={{ padding: 16, marginBottom: 14, display: 'grid', gap: 10, maxWidth: 640 }}>
          <div><label style={{ fontSize: 12, fontWeight: 600 }}>Nome do grupo</label><input style={inp} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: VIP Junho — Rejuvenescimento" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Convite (5d antes)</label><input style={inp} type="date" value={f.dataConvite} onChange={(e) => setF({ ...f, dataConvite: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Aquecimento (2d antes)</label><input style={inp} type="date" value={f.dataAquecimento} onChange={(e) => setF({ ...f, dataAquecimento: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Ofertas — início</label><input style={inp} type="date" value={f.dataOfertaIni} onChange={(e) => setF({ ...f, dataOfertaIni: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>Ofertas — fim</label><input style={inp} type="date" value={f.dataOfertaFim} onChange={(e) => setF({ ...f, dataOfertaFim: e.target.value })} /></div>
          </div>
          <div><button className="btn btn-primary" disabled={busy} onClick={() => { onAgendar(f); setOpen(false); setF({ nome: '', dataConvite: '', dataAquecimento: '', dataOfertaIni: '', dataOfertaFim: '' }) }}><i className="ti ti-calendar-plus" /> Agendar grupo</button></div>
        </div>
      )}

      {vip.length === 0 ? (
        <div className="rel-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Nenhum Grupo VIP agendado ainda.</div>
      ) : (
        <div className="cli-card"><div className="cli-scroll"><table className="cli-table" style={{ width: '100%' }}>
          <thead><tr><th>Grupo VIP</th><th>Convite</th><th>Aquecimento</th><th>Ofertas</th><th style={{ textAlign: 'right' }}>Membros</th><th>Status</th><th>Link</th>{podeEscrever && <th></th>}</tr></thead>
          <tbody>
            {vip.map((g) => (
              <tr key={g.id}>
                <td><span className="cli-name">{g.nome}</span></td>
                <td>{g.convite ?? '—'}</td><td>{g.aquecimento ?? '—'}</td>
                <td>{g.ofertaIni ? `${g.ofertaIni}${g.ofertaFim ? ` – ${g.ofertaFim}` : ''}` : '—'}</td>
                <td style={{ textAlign: 'right' }}>{g.membros || ''}</td>
                <td>{pill(g.status)}</td>
                <td style={{ fontSize: 11.5 }}>{g.link ? <span style={{ color: 'var(--brand-600)' }}><i className="ti ti-link" /> {g.link}</span> : '—'}</td>
                {podeEscrever && <td><span onClick={() => !busy && onExcluir(g.id)} style={{ color: 'var(--red)', cursor: 'pointer' }}><i className="ti ti-trash" /></span></td>}
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  )
}
