'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AUTO_CATEGORIAS, AUTO_COR, CANAL_LBL,
  type AutomacaoPadrao,
} from '@/lib/automacoes'
import {
  alternarAutomacao, criarAutomacao, editarAutomacao, excluirAutomacao,
  salvarNoShow, type NoShowForm,
} from '@/app/(app)/automacoes/actions'

export type AutoCustom = { id: string; nome: string; gatilho: string; acao: string; categoria: string; ativa: boolean; escopo: 'rede' | 'unidade' }
export type WaCanalInfo = { configurado: boolean; conectado: boolean; numero: string | null; nomeCanal: string | null }
type NoShow = { ativa: boolean; primeira_apos: string; max_dia: number; intervalo: string; mensagem: string; reagenda_se_responde: boolean; exclui_se_sem_resposta: boolean; oculta_dia_seguinte: boolean }
type Kpis = { ativas: number; total: number; enviadasMes: number; taxaResposta: number; recuperados: number }

type Props = {
  catalogo: AutomacaoPadrao[]
  estado: Record<string, boolean>
  custom: AutoCustom[]
  noshow: NoShow
  kpis: Kpis
  wa: WaCanalInfo
  unidadeNome: string
  temUnidadeAtiva: boolean
  isAdmin: boolean
  podeEscrever: boolean
  semTabela: boolean
}

type CardItem =
  | { tipo: 'padrao'; a: AutomacaoPadrao; ativa: boolean }
  | { tipo: 'custom'; c: AutoCustom; ativa: boolean }

export function AutomacoesView(props: Props) {
  const { catalogo, estado, custom, kpis, wa, unidadeNome, temUnidadeAtiva, isAdmin, podeEscrever, semTabela } = props
  const router = useRouter()
  const [filtro, setFiltro] = useState<string>('Todas')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  const itens: CardItem[] = useMemo(() => {
    const padrao: CardItem[] = catalogo.map((a) => ({ tipo: 'padrao', a, ativa: estado[a.chave] ?? a.ativoDefault }))
    const cst: CardItem[] = custom.map((c) => ({ tipo: 'custom', c, ativa: c.ativa }))
    return [...padrao, ...cst]
  }, [catalogo, estado, custom])

  const visiveis = itens.filter((it) => {
    const cat = it.tipo === 'padrao' ? it.a.cat : it.c.categoria
    return filtro === 'Todas' || cat === filtro
  })

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, after?: () => void) {
    setBusy(true); setErro('')
    const r = await fn()
    setBusy(false)
    if (!r.ok) { setErro(r.error || 'Falha na operação.'); return }
    after?.(); router.refresh()
  }

  async function toggle(chave: string, ativa: boolean) {
    if (!podeEscrever) { setErro('Você não tem permissão para alterar automações.'); return }
    await run(() => alternarAutomacao(chave, ativa))
  }

  async function nova() {
    const nome = window.prompt(isAdmin
      ? 'Nova automação PADRÃO da rede (vale para todas as unidades).\n\nNome:'
      : 'Nova automação PERSONALIZADA (visível só na sua unidade).\n\nNome:')
    if (!nome) return
    const gatilho = window.prompt('Quando ela dispara? (gatilho)\nEx.: um cliente faz aniversário') || ''
    const acao = window.prompt('O que ela faz? (ação)\nEx.: envia um cupom exclusivo por WhatsApp') || ''
    await run(() => criarAutomacao({ nome, gatilho, acao }))
  }

  async function editar(c: AutoCustom) {
    const nome = window.prompt(c.escopo === 'rede' ? 'Editar automação PADRÃO da rede (afeta todas as unidades).\n\nNome:' : 'Editar nome da automação:', c.nome)
    if (nome === null) return
    const gatilho = window.prompt('Gatilho (quando dispara):', c.gatilho) ?? ''
    const acao = window.prompt('Ação (o que faz):', c.acao) ?? ''
    await run(() => editarAutomacao(c.id, { nome: nome || c.nome, gatilho, acao }))
  }

  async function excluir(c: AutoCustom) {
    if (!window.confirm(`Excluir a automação "${c.nome}"?`)) return
    await run(() => excluirAutomacao(c.id))
  }

  const verde = '#1FA855'

  return (
    <div>
      {/* Banner topo */}
      <div className="rel-card" style={{ padding: 16, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-600)', width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-message-chatbot" style={{ fontSize: 23 }} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontWeight: 700 }}>Mensagens e Automações</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Automações padrão da rede + mensagens personalizadas da unidade. Cada unidade ativa/desativa o que usa.</div>
        </div>
      </div>

      {semTabela && (
        <div className="rel-card" style={{ padding: 14, marginBottom: 14, background: 'var(--amber-bg, #FBF0DD)', color: 'var(--amber, #9a6a12)', fontSize: 13 }}>
          <i className="ti ti-database-exclamation" /> Aplique a migration <b>scripts/migrations/automacoes.sql</b> no lkii para persistir o estado das automações por unidade.
        </div>
      )}

      {/* Conector WhatsApp da unidade (legado waIntegracaoRender 3919) */}
      <div className="rel-card" style={{ marginBottom: 16, padding: 16, border: `1px solid ${wa.conectado ? `${verde}44` : 'var(--line)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: `${verde}18`, color: verde, width: 42, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-brand-whatsapp" style={{ fontSize: 23 }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontWeight: 700 }}>WhatsApp da unidade — {unidadeNome}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              Cada unidade integra o <b>seu próprio WhatsApp</b> para disparar e gerir as automações.{' '}
              {!wa.configurado
                ? <span style={{ color: 'var(--amber)', fontWeight: 700 }}>● API não configurada</span>
                : wa.conectado
                  ? <span style={{ color: '#0F6B3A', fontWeight: 700 }}>● Conectado{wa.numero ? ` (${wa.numero})` : ''}</span>
                  : <span style={{ color: '#B26A00', fontWeight: 700 }}>● Não conectado</span>}
            </div>
          </div>
          <a className={`btn ${wa.conectado ? 'btn-ghost' : 'btn-primary'}`} href="/canais">
            <i className={`ti ${wa.conectado ? 'ti-plug' : 'ti-plug'}`} /> {wa.conectado ? 'Gerenciar em Canais' : 'Conectar em Canais'}
          </a>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 9 }}>
          <i className="ti ti-info-circle" /> Todas as automações são enviadas por <b>WhatsApp</b> — o <b>envio por e-mail está suspenso</b>. A unidade dispara automações apenas com o WhatsApp conectado.
        </div>
      </div>

      {/* 4 KPIs (autosKpi 3928) */}
      <div className="metric-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="metric-box"><span>Automações ativas</span><b>{kpis.ativas} / {kpis.total}</b></div>
        <div className="metric-box"><span>Mensagens enviadas (mês)</span><b>{kpis.enviadasMes.toLocaleString('pt-BR')}</b></div>
        <div className="metric-box"><span>Taxa de resposta</span><b>{kpis.taxaResposta}%</b></div>
        <div className="metric-box"><span>Agendamentos recuperados</span><b>{kpis.recuperados}</b></div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn btn-primary" disabled={busy || !podeEscrever} onClick={nova} title={podeEscrever ? '' : 'Sem permissão'}>
          <i className="ti ti-plus" /> Nova automação
        </button>
        <a className="btn" href="/disparos?tab=bases"><i className="ti ti-filter-cog" /> Segmentar base de clientes</a>
        <a className="btn" href="/disparos"><i className="ti ti-speakerphone" /> Disparos WhatsApp</a>
      </div>

      {erro && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 10 }}>{erro}</p>}

      {/* Filtro de categorias (renderAutos cats 3941) */}
      <div id="autoCats" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <span className="flabel" style={{ fontSize: 12, color: 'var(--text-3)' }}>Categorias</span>
        {AUTO_CATEGORIAS.map((c) => (
          <button key={c} className={`chip ${c === filtro ? 'active' : ''}`} onClick={() => setFiltro(c)}
            style={{ border: '1px solid var(--line)', borderRadius: 16, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer', background: c === filtro ? 'var(--brand-500)' : 'var(--surface-2)', color: c === filtro ? '#fff' : 'var(--text-2)' }}>
            {c}
          </button>
        ))}
      </div>

      {/* Grid de automações */}
      {visiveis.length === 0 ? (
        <div className="rel-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>
          Nenhuma automação nesta categoria.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14, marginBottom: 24 }}>
          {visiveis.map((it) => it.tipo === 'padrao'
            ? <PadraoCard key={`p-${it.a.chave}`} a={it.a} ativa={it.ativa} podeEscrever={podeEscrever} busy={busy} onToggle={() => toggle(it.a.chave, !it.ativa)} />
            : <CustomCard key={`c-${it.c.id}`} c={it.c} isAdmin={isAdmin} podeEscrever={podeEscrever} onEdit={() => editar(it.c)} onDel={() => excluir(it.c)} />)}
        </div>
      )}

      {/* Automação de não comparecimento (no-show) — view-motivos 1762-1788 */}
      <NoShowCard noshow={props.noshow} podeEscrever={podeEscrever} temUnidadeAtiva={temUnidadeAtiva} />
    </div>
  )
}

function Switch({ checked, disabled, onChange, title }: { checked: boolean; disabled?: boolean; onChange: () => void; title?: string }) {
  return (
    <label title={title} style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 22, background: checked ? 'var(--brand-500)' : 'var(--line-strong, #ccc)', transition: '.2s' }} />
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.2s' }} />
    </label>
  )
}

function CanalPills({ canais, stat }: { canais: ('wa' | 'push')[]; stat?: string }) {
  return (
    <>
      {canais.map((c) => (
        <span key={c} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: c === 'wa' ? '#E7F9EE' : 'var(--blue-bg, #E7F0FA)', color: c === 'wa' ? '#1a8a4f' : 'var(--blue, #3D7FD1)' }}>
          {CANAL_LBL[c]}
        </span>
      ))}
      {stat && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {stat}</span>}
    </>
  )
}

function PadraoCard({ a, ativa, podeEscrever, busy, onToggle }: { a: AutomacaoPadrao; ativa: boolean; podeEscrever: boolean; busy: boolean; onToggle: () => void }) {
  const [bg, fg] = AUTO_COR[a.cat] ?? ['#F7E7EB', 'var(--brand-500)']
  return (
    <div className="rel-card" style={{ padding: 16, opacity: ativa ? 1 : 0.62 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ background: bg, color: fg, width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className={`ti ${a.ic}`} style={{ fontSize: 19 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {a.cat}
            <span style={{ fontSize: 10, fontWeight: 700, background: '#F7E7EB', color: 'var(--brand-600)', padding: '2px 8px', borderRadius: 10 }}>
              <i className="ti ti-lock" style={{ fontSize: 11 }} /> Padrão da rede
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{a.nome}</div>
        </div>
        <Switch checked={ativa} disabled={busy || !podeEscrever} onChange={onToggle} title={podeEscrever ? 'Usar nesta unidade' : 'Somente leitura'} />
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '10px 0', lineHeight: 1.5 }}>
        <b>Quando</b> {a.gat} <b>→</b> {a.ac}.
      </div>

      {a.det && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}><i className="ti ti-list-check" /> Serviços recorrentes monitorados</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            {a.det.servicos.map((s) => <span key={s} style={{ fontSize: 11, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '2px 9px' }}>{s}</span>)}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginTop: 8 }}><i className="ti ti-clock-hour-7" /> {a.det.janela}</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {a.det.passos.map((p) => (
              <div key={p.dia} style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-600)', minWidth: 42 }}>{p.dia}</span>
                <div style={{ fontSize: 12 }}><b>{p.titulo}</b><div style={{ color: 'var(--text-3)' }}>{p.desc}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <CanalPills canais={a.canais} stat={a.stat} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}><i className="ti ti-lock" /> Somente leitura</span>
      </div>
    </div>
  )
}

function CustomCard({ c, isAdmin, podeEscrever, onEdit, onDel }: { c: AutoCustom; isAdmin: boolean; podeEscrever: boolean; onEdit: () => void; onDel: () => void }) {
  const [bg, fg] = AUTO_COR.Personalizada
  const rede = c.escopo === 'rede'
  const podeMexer = podeEscrever && (!rede || isAdmin)
  return (
    <div className="rel-card" style={{ padding: 16, opacity: c.ativa ? 1 : 0.62 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ background: bg, color: fg, width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-message-2" style={{ fontSize: 19 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {c.categoria}
            {rede
              ? <span style={{ fontSize: 10, fontWeight: 700, background: '#F7E7EB', color: 'var(--brand-600)', padding: '2px 8px', borderRadius: 10 }}><i className="ti ti-lock" style={{ fontSize: 11 }} /> Padrão da rede</span>
              : <span style={{ fontSize: 10, fontWeight: 700, background: '#E7F0EC', color: '#0f6b3a', padding: '2px 8px', borderRadius: 10 }}>Minha unidade</span>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{c.nome}</div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '10px 0', lineHeight: 1.5 }}>
        <b>Quando</b> {c.gatilho} <b>→</b> {c.acao}.
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <CanalPills canais={['wa']} />
        {podeMexer ? (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <span onClick={onEdit} style={{ fontSize: 12, color: 'var(--brand-600)', cursor: 'pointer', fontWeight: 600 }}>{rede ? 'Editar (padrão)' : 'Editar'}</span>
            <span onClick={onDel} style={{ fontSize: 12, color: 'var(--red)', cursor: 'pointer', fontWeight: 600 }}>Excluir</span>
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}><i className="ti ti-lock" /> Somente leitura</span>
        )}
      </div>
    </div>
  )
}

function NoShowCard({ noshow, podeEscrever, temUnidadeAtiva }: { noshow: NoShow; podeEscrever: boolean; temUnidadeAtiva: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState<NoShowForm>({
    ativa: noshow.ativa,
    primeiraApos: noshow.primeira_apos,
    maxDia: noshow.max_dia,
    intervalo: noshow.intervalo,
    mensagem: noshow.mensagem,
    reagendaSeResponde: noshow.reagenda_se_responde,
    excluiSeSemResposta: noshow.exclui_se_sem_resposta,
    ocultaDiaSeguinte: noshow.oculta_dia_seguinte,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; txt: string } | null>(null)

  async function salvar() {
    setSaving(true); setMsg(null)
    const r = await salvarNoShow(form)
    setSaving(false)
    if (!r.ok) { setMsg({ tipo: 'erro', txt: r.error || 'Erro ao salvar.' }); return }
    setMsg({ tipo: 'ok', txt: 'Automação de não comparecimento salva.' }); router.refresh()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line-strong, #ddd)', borderRadius: 9, fontFamily: 'inherit', fontSize: 13 }
  const rule: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text-2)', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 9, marginBottom: 8, cursor: 'pointer' }

  return (
    <div className="rel-card" style={{ padding: 18 }}>
      <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="ti ti-brand-whatsapp" style={{ color: '#25D366' }} /> Automação de não comparecimento (WhatsApp)
      </h3>

      <label style={{ ...rule, background: '#F7E7EB', borderColor: 'var(--brand-300, #e8b9c5)', marginTop: 12 }}>
        <input type="checkbox" checked={form.ativa} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />
        <span><b>Ativar automação de não comparecimento</b> — quando o cliente não comparece, o sistema dispara mensagens automáticas oferecendo o reagendamento.</span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '12px 0' }}>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Enviar 1ª mensagem após a sessão</label><input style={inp} value={form.primeiraApos} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, primeiraApos: e.target.value })} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Máximo de mensagens no dia</label><input style={inp} type="number" min={1} max={2} value={form.maxDia} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, maxDia: Number(e.target.value) })} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 600 }}>Intervalo entre mensagens</label><input style={inp} value={form.intervalo} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, intervalo: e.target.value })} /></div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Mensagem automática (WhatsApp)</label>
        <textarea style={{ ...inp, minHeight: 90, lineHeight: 1.6, resize: 'vertical' }} value={form.mensagem} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Variáveis: {'{cliente}'}, {'{serviço}'}, {'{hora}'}</div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>Regras de tratamento</div>
      <label style={rule}>
        <input type="checkbox" checked={form.reagendaSeResponde} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, reagendaSeResponde: e.target.checked })} />
        <span>Se o cliente <b>responder</b> à mensagem, o atendimento é <b>reagendado automaticamente</b>.</span>
      </label>
      <label style={rule}>
        <input type="checkbox" checked={form.excluiSeSemResposta} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, excluiSeSemResposta: e.target.checked })} />
        <span>Se não comparecer e <b>não responder</b> até o fim do dia, o agendamento é <b>excluído</b> e o <b>não comparecimento é computado nos dashboards</b>.</span>
      </label>
      <label style={rule}>
        <input type="checkbox" checked={form.ocultaDiaSeguinte} disabled={!podeEscrever} onChange={(e) => setForm({ ...form, ocultaDiaSeguinte: e.target.checked })} />
        <span><b>Não exibir na agenda do dia seguinte</b> clientes que não compareceram no dia anterior.</span>
      </label>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '18px 0 8px' }}>Fluxo automático</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap', overflowX: 'auto' }}>
        {[
          ['ti-calendar-x', 'var(--amber)', 'Não compareceu', 'Cliente não comparece no horário da sessão.'],
          ['ti-brand-whatsapp', '#25D366', '+2h · 1ª mensagem', 'WhatsApp informando o não comparecimento e oferecendo remarcação.'],
          ['ti-brand-whatsapp', '#25D366', '+2h · 2ª mensagem', 'Segunda (e última) tentativa do dia.'],
          ['ti-calendar-check', 'var(--blue)', 'Respondeu', 'Reagenda automaticamente.'],
          ['ti-trash', 'var(--red)', 'Sem resposta', 'Exclui o agendamento e computa o não comparecimento no dashboard.'],
        ].map(([ic, cor, t, d], i, arr) => (
          <div key={t} style={{ display: 'contents' }}>
            <div style={{ flex: '1 1 150px', minWidth: 150, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><i className={`ti ${ic}`} style={{ color: cor as string }} /> {t}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{d}</div>
            </div>
            {i < arr.length - 1 && <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)' }}><i className="ti ti-chevron-right" /></div>}
          </div>
        ))}
      </div>

      {!temUnidadeAtiva && <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 12 }}>Selecione uma unidade ativa para salvar esta configuração.</p>}
      {msg && <p style={{ fontSize: 12.5, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)', marginTop: 12 }}>{msg.txt}</p>}
      {podeEscrever && (
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" disabled={saving || !temUnidadeAtiva} onClick={salvar}>
            {saving ? 'Salvando…' : <><i className="ti ti-device-floppy" /> Salvar automação de não comparecimento</>}
          </button>
        </div>
      )}
    </div>
  )
}
