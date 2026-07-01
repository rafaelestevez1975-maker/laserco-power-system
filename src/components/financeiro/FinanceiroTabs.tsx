'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { moedaBR, dataBR } from '@/lib/fmt'
import {
  STATUS_PILL, PRIO_PILL, FIN_CATS_REC, finPct, finFranqEmail, proximoPassoRegua,
  mesRefBR, type ReguaPasso, COMISSAO_BASE_OPCOES,
  type FluxoSerie, type FluxoResumo, type FluxoComp, FLUXO_ZERO,
} from '@/lib/financeiro'
import {
  gerarBoleto, darBaixaRecebivel, escalarJuridico, notificarCobranca, suspenderLancamento,
  pagarDespesa, definirPrioridade, novaDespesa,
  gerarCobrancaRoyalties, gerarRoyaltiesDoFaturamento, apurarFaturamentoBemp, apurarDespesasDaCompetencia, processarRetornoBancario, rodarReguaAtraso,
  rodarConciliacao, salvarConfig, dreDaCompetencia, fluxoDoRazao,
} from '@/app/(app)/financeiro/actions'
import type { Recebivel, ContaPagar, Conciliacao, FinConfig, DreLinha } from '@/app/(app)/financeiro/page'

type TabKey = 'fluxo' | 'dre' | 'calc' | 'receber' | 'pagar' | 'conciliacao' | 'royalties' | 'cobranca' | 'config'
const TABS: { k: TabKey; label: string; icon: string }[] = [
  { k: 'fluxo', label: 'Fluxo de Caixa', icon: 'ti-cash' },
  { k: 'dre', label: 'DRE', icon: 'ti-report-money' },
  { k: 'calc', label: 'Cálculos', icon: 'ti-calculator' },
  { k: 'receber', label: 'Contas a Receber', icon: 'ti-arrow-down-left' },
  { k: 'pagar', label: 'Contas a Pagar', icon: 'ti-arrow-up-right' },
  { k: 'conciliacao', label: 'Conciliação', icon: 'ti-building-bank' },
  { k: 'royalties', label: 'Royalties', icon: 'ti-robot' },
  { k: 'cobranca', label: 'Cobrança & Jurídico', icon: 'ti-gavel' },
  { k: 'config', label: 'Configurações', icon: 'ti-settings' },
]

// helpers de soma
const sum = <T,>(arr: T[], f: (x: T) => number | null | undefined) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0)

function Pill({ s }: { s: string }) {
  const p = STATUS_PILL[s] || STATUS_PILL.aberto
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: p.bg, color: p.c }}>{p.label}</span>
}
function PrioPill({ pr }: { pr: string }) {
  const p = PRIO_PILL[pr] || PRIO_PILL.media
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: p.bg, color: p.c }}>{p.label}</span>
}

export function FinanceiroTabs({ migracaoOk, truncado = false, recebiveis, contasPagar, conciliacao, config, hojeISO, dre = [], dreCompetencia = null, fluxoSerie = [], fluxoResumo = null, fluxoComp = [], tabInicial = 'fluxo' }: {
  migracaoOk: boolean
  truncado?: boolean
  recebiveis: Recebivel[]
  contasPagar: ContaPagar[]
  conciliacao: Conciliacao[]
  config: FinConfig
  hojeISO: string
  dre?: DreLinha[]
  dreCompetencia?: string | null
  fluxoSerie?: FluxoSerie[]
  fluxoResumo?: FluxoResumo | null
  fluxoComp?: FluxoComp[]
  tabInicial?: TabKey
}) {
  const [tab, setTab] = useState<TabKey>(tabInicial)

  return (
    <div>
      <div className="rel-tabs" style={{ flexWrap: 'wrap' }} id="finTabs">
        {TABS.map((t) => (
          <div key={t.k} className={`rel-tab ${t.k === tab ? 'active' : ''}`} onClick={() => setTab(t.k)} style={{ cursor: 'pointer' }}>
            <i className={`ti ${t.icon}`} /> {t.label}
          </div>
        ))}
      </div>

      {!migracaoOk && (
        <div className="rel-legend" style={{ background: '#FFF8E1', color: 'var(--text)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-alert-triangle" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span><b>Aplique a migration scripts/migrations/financeiro.sql no lkii</b> para ativar o Financeiro da franqueadora (tabelas <code>fin_recebiveis</code>, <code>fin_contas_pagar</code>, <code>fin_conciliacao</code>, <code>fin_config</code> + seed). Enquanto isso, a tela funciona em modo vazio.</span>
        </div>
      )}

      {truncado && (
        <div className="rel-legend" style={{ background: '#FFF8E1', color: 'var(--text)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-alert-triangle" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span>O volume de lançamentos ultrapassou o limite de leitura desta tela — <b>os totais e KPIs abaixo são parciais</b> (somam apenas os registros carregados). Filtre por período/unidade para ver os valores completos.</span>
        </div>
      )}

      {tab === 'fluxo' && <FluxoTab serie0={fluxoSerie} resumo0={fluxoResumo} comp0={fluxoComp} hojeISO={hojeISO} />}
      {tab === 'dre' && <DreTab dre={dre} competencia={dreCompetencia} />}
      {tab === 'calc' && <CalcTab recebiveis={recebiveis} hojeISO={hojeISO} />}
      {tab === 'receber' && <ReceberTab recebiveis={recebiveis} goRoyalties={() => setTab('royalties')} />}
      {tab === 'pagar' && <PagarTab contasPagar={contasPagar} config={config} />}
      {tab === 'conciliacao' && <ConciliacaoTab conciliacao={conciliacao} />}
      {tab === 'royalties' && <RoyaltiesTab recebiveis={recebiveis} config={config} hojeISO={hojeISO} />}
      {tab === 'cobranca' && <CobrancaTab recebiveis={recebiveis} config={config} />}
      {tab === 'config' && <ConfigTab config={config} />}
    </div>
  )
}

// =============================================================================
// FLUXO DE CAIXA (finFluxoHTML L5156 + finProxSemanaHTML L5124)
// =============================================================================
function FluxoTab({ serie0, resumo0, comp0, hojeISO }: { serie0: FluxoSerie[]; resumo0: FluxoResumo | null; comp0: FluxoComp[]; hojeISO: string }) {
  const [escopo, setEscopo] = useState('consolidado')
  const [serie, setSerie] = useState<FluxoSerie[]>(serie0)
  const [resumo, setResumo] = useState<FluxoResumo>(resumo0 ?? FLUXO_ZERO)
  const [comp, setComp] = useState<FluxoComp[]>(comp0)
  const [busy, setBusy] = useState(false)
  async function trocarEscopo(v: string) {
    setEscopo(v); setBusy(true)
    const r = await fluxoDoRazao(v); setBusy(false)
    if (r.ok) { setSerie(r.serie ?? []); setResumo(r.resumo ?? FLUXO_ZERO); setComp(r.composicao ?? []) }
  }
  const escSel = DRE_ESCOPOS.find((e) => e.valor === escopo) ?? DRE_ESCOPOS[0]

  // KPIs derivados do razão por status (previsto = a receber/pagar; realizado/conciliado = recebido/pago).
  const resultado = (resumo.a_receber + resumo.recebido) - (resumo.a_pagar + resumo.pago)
  const vencPct = resumo.a_receber > 0 ? (resumo.vencido / resumo.a_receber) * 100 : 0
  const kpis = [
    { ic: 'ti-arrow-down-circle', cor: '#0f6b3a', bg: 'var(--green-bg)', lbl: 'A receber', val: resumo.a_receber, sub: 'Receitas previstas (aguardando baixa)' },
    { ic: 'ti-circle-check', cor: '#1565C0', bg: '#E3F2FD', lbl: 'Recebido', val: resumo.recebido, sub: 'Baixado / conciliado no razão' },
    { ic: 'ti-alert-triangle', cor: 'var(--red)', bg: '#FDECEC', lbl: 'Vencido', val: resumo.vencido, sub: finPct(vencPct) + ' do a receber · sem baixa' },
    { ic: 'ti-arrow-up-circle', cor: '#B26A00', bg: '#FFF3E0', lbl: 'A pagar', val: resumo.a_pagar, sub: 'Despesas previstas' },
    { ic: 'ti-wallet', cor: '#6A1B9A', bg: '#F3E5F5', lbl: 'Resultado projetado', val: resultado, sub: 'Entradas − saídas' },
  ]

  // Série de 6 meses terminando no mês corrente — preenche 0 nos meses sem lançamento (estado honesto).
  const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const p2 = (n: number) => String(n).padStart(2, '0')
  const hoje = new Date(hojeISO + 'T00:00:00')
  const janela = Array.from({ length: 6 }, (_v, k) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - k), 1)
    const key = `${d.getFullYear()}-${p2(d.getMonth() + 1)}`
    const f = serie.find((s) => s.mes === key)
    return { label: MES_ABREV[d.getMonth()], ano: d.getFullYear(), ent: f?.entradas ?? 0, sai: f?.saidas ?? 0 }
  })
  const semSerie = janela.every((b) => b.ent === 0 && b.sai === 0)
  const maxV = Math.max(...janela.map((b) => Math.max(b.ent, b.sai)), 1)
  let acc = 0
  const saldoSerie = janela.map((b) => { acc += b.ent - b.sai; return acc })
  const totComp = sum(comp, (c) => c.total) || 1

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Visão:</label>
        <select value={escopo} onChange={(e) => trocarEscopo(e.target.value)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff', fontFamily: 'inherit' }}>
          {DRE_ESCOPOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
        </select>
        {busy && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>carregando…</span>}
      </div>
      <div className="rel-legend">Fluxo de caixa derivado do <b>razão</b> (fonte única) — visão <b>{escSel.label}</b>. Entradas/saídas pela <b>data prevista de caixa</b>; <b>Recebido/Pago</b> refletem baixas registradas. {escSel.hint}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.lbl} className="rel-card" style={{ padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: k.bg, color: k.cor }}><i className={`ti ${k.ic}`} /></div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{k.lbl}</div>
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: k.cor }}>{moedaBR(k.val)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14, marginBottom: 6 }}>
        <div className="rel-card">
          <div className="set-sec" style={{ marginTop: 0 }}>Fluxo de caixa · 6 meses</div>
          {semSerie ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '24px 4px' }}>Sem lançamentos nos últimos 6 meses nesta visão.</div>
          ) : (<>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '8px 4px 0' }}>
              {janela.map((b, i) => (
                <div key={`${b.label}-${b.ano}-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
                    <div title={`Entradas ${moedaBR(b.ent)}`} style={{ width: 13, borderRadius: '4px 4px 0 0', background: '#27AE60', height: Math.max(3, (b.ent / maxV) * 120) }} />
                    <div title={`Saídas ${moedaBR(b.sai)}`} style={{ width: 13, borderRadius: '4px 4px 0 0', background: '#E74C3C', height: Math.max(3, (b.sai / maxV) * 120) }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{b.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 10, fontSize: 11.5, color: 'var(--text-2)' }}>
              <span><i className="ti ti-square-rounded-filled" style={{ color: '#27AE60' }} /> Entradas</span>
              <span><i className="ti ti-square-rounded-filled" style={{ color: '#E74C3C' }} /> Saídas</span>
            </div>
          </>)}
        </div>
        <div className="rel-card">
          <div className="set-sec" style={{ marginTop: 0 }}>Composição do &quot;a receber&quot;</div>
          {comp.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nenhuma entrada prevista nesta visão.</div>}
          {comp.map((x) => (
            <div key={x.conta} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}><span>{x.conta}</span><b>{moedaBR(x.total)}</b></div>
              <div style={{ height: 7, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(x.total / totComp) * 100}%`, background: 'linear-gradient(90deg,#27AE60,#2ecc71)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rel-card">
        <div className="set-sec" style={{ marginTop: 0 }}>Movimentação de caixa (mensal · previsto/realizado)</div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Mês</th><th className="num-r">Entradas</th><th className="num-r">Saídas</th><th className="num-r">Resultado</th><th className="num-r">Saldo acumulado</th></tr></thead>
            <tbody>
              {semSerie && <tr><td colSpan={5} style={{ padding: 20, color: 'var(--text-3)' }}>Sem lançamentos nos últimos 6 meses nesta visão.</td></tr>}
              {!semSerie && janela.map((b, i) => (
                <tr key={`${b.label}-${b.ano}`}>
                  <td>{b.label}/{b.ano}</td>
                  <td className="num-r" style={{ color: '#0f6b3a' }}>{moedaBR(b.ent)}</td>
                  <td className="num-r" style={{ color: 'var(--red)' }}>{moedaBR(b.sai)}</td>
                  <td className="num-r" style={{ fontWeight: 700, color: (b.ent - b.sai) >= 0 ? '#0f6b3a' : 'var(--red)' }}>{moedaBR(b.ent - b.sai)}</td>
                  <td className="num-r" style={{ fontWeight: 700 }}>{moedaBR(saldoSerie[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rel-legend" style={{ marginTop: 10 }}>A <b>projeção diária</b> de caixa volta junto com a migração de <b>Contas a Pagar/Receber</b> para o razão (próxima etapa), que traz os vencimentos datados.</div>
      </div>
    </div>
  )
}

// =============================================================================
// CONTAS A RECEBER (finReceberHTML L5202 + finRecAcoes L5222)
// =============================================================================
function ReceberTab({ recebiveis, goRoyalties }: { recebiveis: Recebivel[]; goRoyalties: () => void }) {
  const router = useRouter()
  const [cat, setCat] = useState('Todas')
  const [status, setStatus] = useState('Todos')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(id); setMsg('')
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro.'); return }
    setMsg(okMsg); router.refresh()
  }

  const cats = ['Todas', ...FIN_CATS_REC]
  const sts: [string, string][] = [['Todos', 'Todos'], ['aberto', 'Em aberto'], ['atrasado', 'Atrasado'], ['pago', 'Pago'], ['suspenso', 'Suspenso']]
  const list = recebiveis.filter((r) => (cat === 'Todas' || r.categoria === cat) && (status === 'Todos' || r.status === status))
  const tot = sum(list, (r) => r.valor)
  const susp = sum(list.filter((r) => r.status === 'suspenso'), (r) => r.valor)

  return (
    <div>
      <div className="rel-legend">Todo recebível das unidades entra aqui, com <b>categorias separadas</b>: Royalties (10% do bruto), Taxa de franquia, Fundo de marketing, Aluguel de máquinas e outros — cadastráveis em Configurações.</div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}
      <div className="dash-filter" style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="flabel">Categoria</span>
        {cats.map((c) => <div key={c} className={`chip ${c === cat ? 'active' : ''}`} onClick={() => setCat(c)} style={{ cursor: 'pointer' }}>{c}</div>)}
      </div>
      <div className="dash-filter" style={{ marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="flabel">Status</span>
        {sts.map((s) => <div key={s[0]} className={`chip ${s[0] === status ? 'active' : ''}`} onClick={() => setStatus(s[0])} style={{ cursor: 'pointer' }}>{s[1]}</div>)}
      </div>
      <div className="rel-acts" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Total filtrado: <b style={{ color: '#0f6b3a' }}>{moedaBR(tot)}</b> · {list.length} lançamento(s){susp > 0 && <> · Suspensos: <b style={{ color: '#6B5B95' }}>{moedaBR(susp)}</b></>}</div>
        <button className="btn btn-primary" onClick={goRoyalties}><i className="ti ti-robot" /> Gerar cobrança automática</button>
      </div>
      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Unidade</th><th>Categoria</th><th>Competência</th><th className="num-r">Valor</th><th>Venc.</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum recebível com esse filtro.</td></tr>}
            {list.slice(0, 400).map((r) => (
              <tr key={r.id}>
                <td><span className="cli-name"><i className="ti ti-building-store" style={{ color: 'var(--brand-500)', marginRight: 6, verticalAlign: -2 }} />{r.unidade_nome || '—'}</span></td>
                <td>{r.categoria}</td>
                <td style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{r.competencia}{r.bruto ? <><br />bruto {moedaBR(r.bruto)}</> : null}</td>
                <td className="num-r" style={{ fontWeight: 700 }}>{moedaBR(r.valor)}</td>
                <td>{dataBR(r.vencimento)}{r.status === 'atrasado' && <span style={{ color: 'var(--red)', fontSize: 11 }}> ({r.dias_atraso}d)</span>}</td>
                <td><Pill s={r.jur_id ? 'jur' : r.status} /></td>
                <td style={{ whiteSpace: 'nowrap' }}><RecAcoes r={r} busy={busy} run={run} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

function RecAcoes({ r, busy, run }: { r: Recebivel; busy: string | null; run: (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => void }) {
  const b = busy === r.id
  if (r.status === 'pago') return <span className="os-link" title={r.boleto ? 'boleto ' + r.boleto.slice(0, 9) : ''}><i className="ti ti-receipt" /> Comprovante</span>
  if (r.status === 'suspenso') return <span className="os-link" onClick={() => !b && run(r.id, () => suspenderLancamento('receber', r.id), 'Lançamento reativado.')}><i className="ti ti-player-play" /> Reativar</span>
  const acts: React.ReactNode[] = []
  if (!r.boleto) acts.push(<span key="ger" className="os-link" onClick={() => !b && run(r.id, () => gerarBoleto(r.id), 'Boleto gerado e enviado por e-mail/WhatsApp ao franqueado.')}><i className="ti ti-file-invoice" /> Gerar boleto</span>)
  else {
    acts.push(<VerBoletoLink key="ver" r={r} />)
    acts.push(<span key="baixa" className="os-link" onClick={() => !b && run(r.id, () => darBaixaRecebivel(r.id), 'Baixa registrada (retorno bancário).')}><i className="ti ti-circle-check" /> Dar baixa</span>)
  }
  if (r.status === 'atrasado' && !r.jur_id) acts.push(<span key="jur" className="os-link" style={{ color: 'var(--red)' }} onClick={() => !b && run(r.id, () => escalarJuridico(r.id), 'Caso encaminhado ao Jurídico.')}><i className="ti ti-gavel" /> Jurídico</span>)
  acts.push(<span key="susp" className="os-link" style={{ color: '#6B5B95' }} onClick={() => !b && run(r.id, () => suspenderLancamento('receber', r.id), 'Marcado como suspenso.')}><i className="ti ti-player-pause" /> Suspender</span>)
  return <>{acts.map((a, i) => <span key={i}>{i > 0 && ' · '}{a}</span>)}</>
}

// Ver boleto (finVerBoleto L5230) — exibe boleto simulado
function VerBoletoLink({ r }: { r: Recebivel }) {
  return (
    <span className="os-link" onClick={() => alert(
      `BOLETO BANCÁRIO (simulado)\n\nBeneficiário: Laser&Co Franqueadora Ltda\nPagador: ${r.unidade_nome || ''}\nReferência: ${r.categoria} · ${r.competencia || ''}\nValor: ${moedaBR(r.valor)}\nVencimento: ${dataBR(r.vencimento)}\n\nLinha digitável:\n${r.boleto}\n\nEnviado para: ${finFranqEmail(r.unidade_nome)}`,
    )}><i className="ti ti-eye" /> Ver boleto</span>
  )
}

// =============================================================================
// CONTAS A PAGAR (finPagarHTML L5233 + finSetPrio + finSuspender)
// =============================================================================
function PagarTab({ contasPagar, config }: { contasPagar: ContaPagar[]; config: FinConfig }) {
  const router = useRouter()
  const [escopo, setEscopo] = useState('Todos')
  const [prio, setPrio] = useState('Todas')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [showNova, setShowNova] = useState(false)

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(id); setMsg('')
    const r = await fn(); setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro.'); return }
    setMsg(okMsg); router.refresh()
  }

  const escs = ['Todos', 'Escritório', 'Rede', 'Lojas']
  const prChips: [string, string][] = [['Todas', 'Todas'], ['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']]
  const prRank: Record<string, number> = { alta: 0, media: 1, baixa: 2 }
  let list = contasPagar.filter((p) =>
    (escopo === 'Todos' || (escopo === 'Lojas' ? (p.escopo !== 'Escritório' && p.escopo !== 'Rede') : p.escopo === escopo)) &&
    (prio === 'Todas' || p.prioridade === prio))
  list = [...list].sort((a, b) => (prRank[a.prioridade] ?? 1) - (prRank[b.prioridade] ?? 1))
  const tot = sum(list, (p) => p.valor)
  const aberto = sum(list.filter((p) => p.status === 'aberto'), (p) => p.valor)
  const susp = sum(list.filter((p) => p.status === 'suspenso'), (p) => p.valor)
  const ab = contasPagar.filter((p) => p.status === 'aberto')
  const pAlta = sum(ab.filter((p) => p.prioridade === 'alta'), (p) => p.valor)
  const pMedia = sum(ab.filter((p) => p.prioridade === 'media'), (p) => p.valor)
  const pBaixa = sum(ab.filter((p) => p.prioridade === 'baixa'), (p) => p.valor)

  return (
    <div>
      <div className="rel-legend">Despesas da rede — vinculadas a cada unidade ou em conjunto (escritório/rede). Cada pagamento tem um <b>nível de prioridade</b> (Alta, Média, Baixa): se o caixa apertar, pague primeiro os de <b>prioridade alta</b>.</div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['Em aberto · Prioridade ALTA', pAlta, 'var(--red)'], ['Prioridade Média', pMedia, '#B26A00'], ['Prioridade Baixa', pBaixa, '#1565C0']].map(([lbl, v, cor]) => (
          <div key={lbl as string} className="rel-card" style={{ padding: '10px 14px', flex: 1, minWidth: 140, borderLeft: `3px solid ${cor as string}` }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{lbl as string}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: cor as string }}>{moedaBR(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="dash-filter" style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="flabel">Escopo</span>
        {escs.map((e) => <div key={e} className={`chip ${e === escopo ? 'active' : ''}`} onClick={() => setEscopo(e)} style={{ cursor: 'pointer' }}>{e}</div>)}
      </div>
      <div className="dash-filter" style={{ marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="flabel">Prioridade</span>
        {prChips.map((pr) => <div key={pr[0]} className={`chip ${pr[0] === prio ? 'active' : ''}`} onClick={() => setPrio(pr[0])} style={{ cursor: 'pointer' }}>{pr[1]}</div>)}
      </div>
      <div className="rel-acts" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Total: <b>{moedaBR(tot)}</b> · Em aberto: <b style={{ color: 'var(--red)' }}>{moedaBR(aberto)}</b>{susp > 0 && <> · Suspensos: <b style={{ color: '#6B5B95' }}>{moedaBR(susp)}</b></>}</div>
        <button className="btn btn-ghost" onClick={() => setShowNova(true)}><i className="ti ti-plus" /> Nova despesa</button>
      </div>
      {showNova && <NovaDespesaModal config={config} onClose={() => setShowNova(false)} onSaved={() => { setShowNova(false); router.refresh() }} />}
      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Prioridade</th><th>Categoria</th><th>Descrição</th><th>Escopo</th><th className="num-r">Valor</th><th>Venc.</th><th>Status</th><th>Definir prio.</th><th>Ações</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhuma despesa com esse filtro.</td></tr>}
            {list.map((p) => (
              <tr key={p.id}>
                <td><PrioPill pr={p.prioridade} /></td>
                <td>{p.categoria}</td>
                <td>{p.descricao || ''}</td>
                <td><span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 20, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{p.escopo}</span></td>
                <td className="num-r" style={{ fontWeight: 700 }}>{moedaBR(p.valor)}</td>
                <td>{dataBR(p.vencimento)}</td>
                <td><Pill s={p.status} /></td>
                <td>
                  <select value={p.prioridade} disabled={busy === p.id} onChange={(e) => run(p.id, () => definirPrioridade(p.id, e.target.value as 'alta' | 'media' | 'baixa'), 'Prioridade atualizada.')}
                    style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '4px 6px', fontSize: 11.5, fontFamily: 'inherit' }}>
                    <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {p.status === 'aberto' ? <>
                    <span className="os-link" onClick={() => busy !== p.id && run(p.id, () => pagarDespesa(p.id), 'Pagamento lançado.')}><i className="ti ti-cash" /> Pagar</span>
                    {' · '}
                    <span className="os-link" style={{ color: '#6B5B95' }} onClick={() => busy !== p.id && run(p.id, () => suspenderLancamento('pagar', p.id), 'Marcado como suspenso.')}><i className="ti ti-player-pause" /> Suspender</span>
                  </> : p.status === 'suspenso' ? (
                    <span className="os-link" onClick={() => busy !== p.id && run(p.id, () => suspenderLancamento('pagar', p.id), 'Lançamento reativado.')}><i className="ti ti-player-play" /> Reativar</span>
                  ) : <span className="os-link"><i className="ti ti-receipt" /> Comprovante</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

function NovaDespesaModal({ config, onClose, onSaved }: { config: FinConfig; onClose: () => void; onSaved: () => void }) {
  const [categoria, setCategoria] = useState('Fornecedores')
  const [descricao, setDescricao] = useState('')
  const [escopo, setEscopo] = useState('Escritório')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [prioridade, setPrioridade] = useState<'alta' | 'media' | 'baixa'>('media')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const salvar = async () => {
    setBusy(true); setErr('')
    const r = await novaDespesa({ categoria, descricao, escopo, valor: Number(valor), vencimento, prioridade })
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Erro ao salvar.'); return }
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="rel-card" style={{ width: 'min(480px,92vw)', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 15 }}>Nova despesa</b>
          <i className="ti ti-x" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        {err && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 8 }}>{err}</div>}
        <div className="mf full" style={{ marginBottom: 10 }}><label>Categoria</label><input list="fin-cat-pagar" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
          <datalist id="fin-cat-pagar">{config.categorias.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="mf full" style={{ marginBottom: 10 }}><label>Descrição</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div className="mf" style={{ flex: 1 }}><label>Escopo</label><input value={escopo} onChange={(e) => setEscopo(e.target.value)} placeholder="Escritório / Rede / Unidade" /></div>
          <div className="mf" style={{ flex: 1 }}><label>Prioridade</label>
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as 'alta' | 'media' | 'baixa')}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div className="mf" style={{ flex: 1 }}><label>Valor (R$)</label><input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div className="mf" style={{ flex: 1 }}><label>Vencimento</label><input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? '…' : <><i className="ti ti-device-floppy" /> Salvar</>}</button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// CONCILIAÇÃO (finConciliacaoHTML L5322 + finRodarConc)
// =============================================================================
function ConciliacaoTab({ conciliacao }: { conciliacao: Conciliacao[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const div = conciliacao.filter((c) => c.status === 'divergencia')

  const rodar = async () => {
    setBusy(true); setMsg('')
    const r = await rodarConciliacao(); setBusy(false)
    setMsg(r.ok ? `Conciliação processada · ${r.cruzados ?? 0} lançamentos cruzados.` : (r.error || 'Erro.'))
    if (r.ok) router.refresh()
  }

  return (
    <div>
      <div className="rel-legend">Conciliação <b>automática</b>: cruza as <b>vendas das lojas</b> com os <b>extratos bancários</b> e as <b>taxas das adquirentes</b> cadastradas. Quando o crédito recebido diverge do esperado, o sistema gera um <b>alerta de inconsistência</b>.</div>
      <div className="rel-acts" style={{ justifyContent: 'flex-end', marginBottom: 12, display: 'flex' }}>
        <button className="btn btn-primary" disabled={busy} onClick={rodar}><i className="ti ti-refresh" /> Rodar conciliação automática</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 10 }}>{msg}</div>}
      {conciliacao.length === 0 ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)' }}>Sem lançamentos de conciliação. Importe o extrato bancário e rode a conciliação.</div>
      ) : (
        <>
          {div.length ? (
            <div className="rel-card" style={{ background: '#FDECEC', border: '1px solid #f5c2c2', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 24, color: 'var(--red)' }} />
              <div><b style={{ color: 'var(--red)' }}>{div.length} inconsistência(s) detectada(s)</b><div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>O cruzamento entre vendas, extrato bancário e taxas das adquirentes apontou divergências.</div></div>
            </div>
          ) : (
            <div className="rel-card" style={{ background: 'var(--green-bg)', marginBottom: 14 }}><b style={{ color: '#0f6b3a' }}><i className="ti ti-circle-check" /> Sem inconsistências</b> — todas as vendas conciliadas com o extrato.</div>
          )}
          <div className="cli-card"><div className="cli-scroll">
            <table className="cli-table">
              <thead><tr><th>Data</th><th>Unidade</th><th>Adquirente</th><th className="num-r">Venda</th><th className="num-r">Taxa</th><th className="num-r">Esperado</th><th className="num-r">Extrato</th><th>Status</th><th>Observação</th></tr></thead>
              <tbody>
                {conciliacao.map((c) => (
                  <tr key={c.id} style={c.status === 'divergencia' ? { background: '#FFF7F7' } : undefined}>
                    <td>{dataBR(c.data)}</td><td>{c.unidade_nome}</td><td>{c.adquirente}</td>
                    <td className="num-r">{moedaBR(c.venda)}</td>
                    <td className="num-r" style={{ fontSize: 11.5 }}>{finPct(c.taxa_pct || 0)}<br />{moedaBR(c.taxa)}</td>
                    <td className="num-r">{moedaBR(c.esperado)}</td>
                    <td className="num-r">{moedaBR(c.recebido)}</td>
                    <td>{c.status === 'ok'
                      ? <span style={{ color: '#0f6b3a', fontWeight: 700, fontSize: 12 }}><i className="ti ti-circle-check" /> OK</span>
                      : <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: 12 }}><i className="ti ti-alert-triangle" /> Divergência</span>}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{c.observacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </>
      )}
    </div>
  )
}

// =============================================================================
// AUTOMAÇÃO DE ROYALTIES (finRoyaltiesHTML L5333)
// =============================================================================
function RoyaltiesTab({ recebiveis, config, hojeISO }: { recebiveis: Recebivel[]; config: FinConfig; hojeISO: string }) {
  const router = useRouter()
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const banco = config.banco as { nome?: string; agencia?: string; conta?: string }
  // Competência padrão = mês anterior (fechado). O faturamento real vem do BEMP via apuração.
  const d0 = new Date(hojeISO + 'T12:00:00'); d0.setMonth(d0.getMonth() - 1)
  const [comp, setComp] = useState(`${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}`)

  const pend = recebiveis.filter((r) => r.categoria === 'Royalties' && (r.status === 'aberto' || r.status === 'atrasado'))
  const semBoleto = pend.filter((r) => !r.boleto).length
  const totRoy = sum(recebiveis.filter((r) => r.categoria === 'Royalties'), (r) => r.valor)
  const hh = () => { const d = new Date(); return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}] ` }
  const addLog = (...lines: string[]) => setLog((l) => [...lines.map((x) => hh() + x), ...l].slice(0, 40))

  const gerar = async () => {
    setBusy('gerar')
    const r = await gerarCobrancaRoyalties(); setBusy('')
    if (!r.ok) { addLog('✗ ' + (r.error || 'Erro')); return }
    if (!r.geradas) { addLog('Nenhum royalty pendente de boleto.'); return }
    addLog(`✓ ${r.geradas} boletos gerados no ${banco.nome} — total ${moedaBR(r.total || 0)}`, '✓ Crédito a receber lançado no financeiro da franqueadora', `✓ Enviado por e-mail e WhatsApp aos franqueados (${r.geradas} destinatários)`)
    router.refresh()
  }
  const apurar = async () => {
    const [a, m] = comp.split('-').map(Number)
    if (!a || !m) { addLog('✗ Selecione a competência.'); return }
    setBusy('apurar')
    const rf = await apurarFaturamentoBemp(a, m)         // 1) receita real (BEMP) no razão
    const r = await gerarRoyaltiesDoFaturamento(a, m)    // 2) royalties + fundo no razão
    const rd = await apurarDespesasDaCompetencia(a, m)   // 3) despesas config (imposto/comissão/taxa) no razão
    setBusy('')
    if (!rf.ok) { addLog('✗ ' + (rf.error || 'Erro no faturamento')); return }
    if (!r.ok) { addLog('✗ ' + (r.error || 'Erro nos royalties')); return }
    addLog(
      `✓ Apuração ${comp} — faturamento BEMP ${moedaBR(rf.faturamento || 0)} em ${rf.unidades || 0} unidade(s) → ${rf.lancamentos || 0} lançamento(s) de receita no razão`,
      r.geradas ? `✓ Royalties (${config.royalty_pct}%) + Fundo: ${r.geradas} recebível(is) e ${r.lancamentos || 0} lançamento(s) no razão` : 'Royalties já apurados nesta competência.')
    if (rf.semCentro && rf.semCentro > 0) addLog(`⚠ ${rf.semCentro} unidade(s) sem centro de custo — a receita entra no consolidado, mas as despesas de config não incidem sobre elas. Verifique o cadastro.`)
    if (rd.ok) {
      const totDesp = (rd.imposto || 0) + (rd.comissao || 0) + (rd.taxaCartao || 0)
      addLog(totDesp > 0
        ? `✓ Despesas: imposto ${moedaBR(rd.imposto || 0)} + comissão ${moedaBR(rd.comissao || 0)} + taxa cartão ${moedaBR(rd.taxaCartao || 0)} → ${rd.lancamentos || 0} lançamento(s) no razão`
        : 'Despesas: nenhuma regra configurada (defina % em Configurações → Regras de despesa).')
    } else addLog('⚠ Despesas: ' + (rd.error || 'não apuradas'))
    router.refresh()
  }
  const baixar = async () => {
    setBusy('baixar')
    const r = await processarRetornoBancario(); setBusy('')
    if (!r.ok) { addLog('✗ ' + (r.error || 'Erro')); return }
    addLog(`✓ Retorno bancário processado — ${r.baixados || 0} boletos baixados (${moedaBR(r.total || 0)})`)
    router.refresh()
  }
  const regua = async () => {
    setBusy('regua')
    const r = await rodarReguaAtraso(config.regua); setBusy('')
    if (!r.ok) { addLog('✗ ' + (r.error || 'Erro')); return }
    addLog(`→ Régua aplicada a ${r.aplicadas || 0} cobrança(s) em atraso · ${r.juridico || 0} escalada(s) ao Jurídico`)
    router.refresh()
  }

  const passos = ['Apura 10% do bruto', 'Gera boleto no banco', 'Lança crédito a receber', 'Envia e-mail + WhatsApp', 'Baixa no retorno bancário', 'Atraso → aciona Jurídico']

  return (
    <div>
      <div className="rel-legend">Automação de cobrança de <b>royalties</b> — sempre <b>{config.royalty_pct}% do faturamento bruto</b>, com vencimento <b>todo dia {config.venc_dia}</b> do mês seguinte. O sistema gera o boleto, lança o crédito a receber, envia ao franqueado e agenda a baixa no retorno bancário.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 14 }}>
        <div className="rel-card" style={{ padding: 14 }}><div style={{ fontSize: 12, color: 'var(--text-2)' }}>Banco de cobrança</div><div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}><i className="ti ti-building-bank" style={{ color: 'var(--brand-500)' }} /> {banco.nome || 'Não configurado'}</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{banco.nome ? `Ag. ${banco.agencia || '—'} · C/C ${banco.conta || '—'}` : 'Configure em Configurações'}</div></div>
        <div className="rel-card" style={{ padding: 14 }}><div style={{ fontSize: 12, color: 'var(--text-2)' }}>Competência</div><div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}>{mesRefBR(hojeISO)}</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Vencimento dia {config.venc_dia}</div></div>
        <div className="rel-card" style={{ padding: 14 }}><div style={{ fontSize: 12, color: 'var(--text-2)' }}>Total de royalties</div><div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, color: '#0f6b3a' }}>{moedaBR(totRoy)}</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{pend.length} unidade(s) · {semBoleto} sem boleto</div></div>
      </div>
      <div className="rel-card" style={{ marginBottom: 4 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Pipeline de automação</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {passos.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', borderRadius: 20, padding: '6px 12px', fontSize: 12 }}>
              <span style={{ background: 'var(--brand-500)', color: '#fff', width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</span> {s}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', background: 'var(--green-bg)', borderRadius: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f6b3a' }}><i className="ti ti-calculator" /> 1) Apurar do faturamento real (BEMP)</span>
          <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Competência:</label>
          <input type="month" value={comp} onChange={(e) => setComp(e.target.value)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
          <button className="btn btn-primary" disabled={!!busy} onClick={apurar}>{busy === 'apurar' ? 'Apurando…' : <><i className="ti ti-calculator" /> Apurar mês (faturamento + royalties)</>}</button>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>lança a receita do BEMP e os royalties + fundo no razão (fonte única do DRE/Fluxo)</span>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!!busy} onClick={gerar}><i className="ti ti-robot" /> 2) Gerar cobrança de royalties ({semBoleto})</button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={baixar}><i className="ti ti-building-bank" /> Processar retorno bancário (baixa)</button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={regua}><i className="ti ti-clock-exclamation" /> Rodar régua de atraso</button>
        </div>
        {log.length > 0 && (
          <div className="rel-card" style={{ marginTop: 14, background: '#0E1726', color: '#cfe3ff', fontFamily: 'ui-monospace,monospace', fontSize: 12, lineHeight: 1.7, maxHeight: 240, overflow: 'auto' }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
      <div className="rel-card" style={{ background: '#FFF8E1', border: '1px solid #f0e0a8', marginTop: 14, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <i className="ti ti-shield-lock" style={{ fontSize: 20, color: '#B26A00' }} />
        <div style={{ fontSize: 12.5, color: '#6b5800' }}><b>Integração bancária real (produção):</b> a conexão com o banco para registrar boletos e dar baixa é feita por <b>API/Open Finance ou CNAB</b>, com credenciais guardadas em cofre seguro no servidor — <b>nunca</b> no navegador. Este módulo <b>simula</b> o ciclo para validação do fluxo.</div>
      </div>
    </div>
  )
}

// =============================================================================
// COBRANÇA & JURÍDICO (finCobrancaHTML L5387)
// =============================================================================
function CobrancaTab({ recebiveis, config }: { recebiveis: Recebivel[]; config: FinConfig }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const atr = recebiveis.filter((r) => r.status === 'atrasado')
  const totAtr = sum(atr, (r) => r.valor)

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(id); setMsg('')
    const r = await fn(); setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro.'); return }
    setMsg(okMsg); router.refresh()
  }

  return (
    <div>
      <div className="rel-legend">Régua de cobrança automática por atraso. Notificações por <b>sistema, e-mail e WhatsApp</b> do franqueado. A partir de <b>D+10</b>, o caso é encaminhado ao <b>Jurídico</b> conforme a regra cadastrada.</div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 10 }}>{msg}</div>}
      <div className="rel-card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, background: atr.length ? '#FDECEC' : 'var(--green-bg)' }}>
        <i className={`ti ti-${atr.length ? 'alert-triangle' : 'circle-check'}`} style={{ fontSize: 24, color: atr.length ? 'var(--red)' : '#0f6b3a' }} />
        <div><b style={{ color: atr.length ? 'var(--red)' : '#0f6b3a' }}>{atr.length} unidade(s) inadimplente(s) · {moedaBR(totAtr)}</b><div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Régua ativa · escalonamento ao Jurídico automático a partir de D+10</div></div>
      </div>
      <div className="cli-card" style={{ marginBottom: 16 }}><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Unidade / contato</th><th>Categoria</th><th className="num-r">Valor</th><th>Atraso</th><th>Próxima ação</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {atr.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 22 }}>Nenhuma cobrança em atraso 🎉</td></tr> : atr.map((r) => {
              const passo = proximoPassoRegua(r.dias_atraso || 0, config.regua)
              return (
                <tr key={r.id}>
                  <td><span className="cli-name">{r.unidade_nome}</span><br /><span style={{ fontSize: 11, color: 'var(--text-3)' }}>{finFranqEmail(r.unidade_nome)}</span></td>
                  <td>{r.categoria}</td>
                  <td className="num-r" style={{ fontWeight: 700, color: 'var(--red)' }}>{moedaBR(r.valor)}</td>
                  <td style={{ color: 'var(--red)', fontWeight: 700 }}>{r.dias_atraso}d</td>
                  <td style={{ fontSize: 11.5 }}>{passo.acao}</td>
                  <td><Pill s={r.jur_id ? 'jur' : 'atrasado'} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="os-link" onClick={() => busy !== r.id && run(r.id, () => notificarCobranca(r.id), 'Notificação enviada por e-mail e WhatsApp ao franqueado.')}><i className="ti ti-mail-forward" /> Notificar</span>
                    {!r.jur_id && <>{' · '}<span className="os-link" style={{ color: 'var(--brand-600)' }} onClick={() => busy !== r.id && run(r.id, () => escalarJuridico(r.id), 'Caso encaminhado ao Jurídico.')}><i className="ti ti-gavel" /> Jurídico</span></>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div></div>
      <div className="rel-card">
        <div className="set-sec" style={{ marginTop: 0 }}>Régua de cobrança (configurável em Configurações)</div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Quando</th><th>Ação</th><th>Canal</th></tr></thead>
            <tbody>
              {config.regua.map((p, i) => (
                <tr key={i}><td style={{ fontWeight: 700 }}>{p.dias === 0 ? 'No vencimento' : 'D+' + p.dias}</td><td>{p.acao}</td><td style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{p.canal}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// DRE (finDreHTML L5642 — versão simplificada sobre os dados reais)
// =============================================================================
const MESES_DRE = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DRE_ESCOPOS: { valor: string; label: string; hint: string }[] = [
  { valor: 'consolidado', label: 'Consolidado (rede)', hint: 'Toda a rede — franqueadora + unidades. Os royalties se anulam entre si.' },
  { valor: 'franqueadora', label: 'Só franqueadora', hint: 'Resultado da franqueadora: royalties e fundo de marketing recebidos das unidades.' },
  { valor: 'unidades', label: 'Só unidades', hint: 'Resultado agregado das unidades: faturamento menos royalties, fundo e despesas.' },
]
function DreTab({ dre, competencia }: { dre: DreLinha[]; competencia: string | null }) {
  const [comp, setComp] = useState(competencia ? competencia.slice(0, 7) : '')
  const [escopo, setEscopo] = useState('consolidado')
  const [linhas, setLinhas] = useState<DreLinha[]>(dre)
  const [busy, setBusy] = useState(false)
  async function recarregar(vComp: string, vEscopo: string) {
    const [a, m] = vComp.split('-').map(Number)
    if (!a || !m) { setLinhas([]); return }
    setBusy(true)
    const r = await dreDaCompetencia(a, m, vEscopo)
    setBusy(false)
    if (r.ok) setLinhas((r.linhas as DreLinha[]) ?? [])
  }
  const trocarMes = (v: string) => { setComp(v); recarregar(v, escopo) }
  const trocarEscopo = (v: string) => { setEscopo(v); recarregar(comp, v) }
  // Fonte única: o RAZÃO. Agrupa por natureza (receita/custo/despesa) e soma por conta.
  const receitas = linhas.filter((l) => l.natureza === 'receita').sort((a, b) => a.ordem - b.ordem)
  const custos = linhas.filter((l) => l.natureza === 'custo').sort((a, b) => a.ordem - b.ordem)
  const despesas = linhas.filter((l) => l.natureza === 'despesa').sort((a, b) => a.ordem - b.ordem)
  const totReceita = sum(receitas, (l) => l.total)
  const totCusto = sum(custos, (l) => l.total)
  const totDespesa = sum(despesas, (l) => l.total)
  const resultado = totReceita - totCusto - totDespesa
  const av = (v: number) => totReceita > 0 ? finPct((v / totReceita) * 100) : '—'
  const compLabel = comp ? `${MESES_DRE[Number(comp.slice(5, 7)) - 1]}/${comp.slice(0, 4)}` : '—'

  const escSel = DRE_ESCOPOS.find((e) => e.valor === escopo) ?? DRE_ESCOPOS[0]
  const seletor = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
      <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Competência:</label>
      <input type="month" value={comp} onChange={(e) => trocarMes(e.target.value)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
      <label style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 6 }}>Visão:</label>
      <select value={escopo} onChange={(e) => trocarEscopo(e.target.value)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff', fontFamily: 'inherit' }}>
        {DRE_ESCOPOS.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
      </select>
      {busy && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>carregando…</span>}
    </div>
  )

  if (linhas.length === 0) {
    return (
      <div>
        {seletor}
        <div className="rel-legend">O DRE lê do <b>razão</b> (fonte única). Sem lançamentos em <b>{compLabel}</b> — vá em <b>Royalties → Apurar mês (faturamento + royalties)</b> para lançar a receita e os royalties dessa competência; o DRE aparece aqui automaticamente.</div>
      </div>
    )
  }

  const linhaConta = (l: DreLinha, sinal: number) => (
    <tr key={l.natureza + l.conta}>
      <td style={{ paddingLeft: 22, color: 'var(--text-2)' }}>{l.conta}</td>
      <td className="num-r" style={{ color: sinal < 0 ? 'var(--red)' : undefined }}>{moedaBR(sinal * l.total)}</td>
      <td className="num-r" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{av(l.total)}</td>
    </tr>
  )
  const linhaTotal = (lbl: string, v: number) => (
    <tr style={{ background: 'var(--surface-2)' }}>
      <td style={{ fontWeight: 700 }}>{lbl}</td>
      <td className="num-r" style={{ fontWeight: 700, color: v < 0 ? 'var(--red)' : undefined }}>{moedaBR(v)}</td>
      <td className="num-r" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{av(Math.abs(v))}</td>
    </tr>
  )

  return (
    <div>
      {seletor}
      <div className="rel-legend">DRE derivado do <b>razão</b> (fonte única) — competência <b>{compLabel}</b> · visão <b>{escSel.label}</b>. {escSel.hint} <b>AV%</b> = análise vertical sobre a receita. As linhas se completam conforme os demais produtores (folha, impostos, reembolsos) entram no razão.</div>
      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Demonstração do resultado — {compLabel}</th><th className="num-r">Valor</th><th className="num-r">AV%</th></tr></thead>
          <tbody>
            {linhaTotal('Receita bruta', totReceita)}
            {receitas.map((l) => linhaConta(l, 1))}
            {custos.length > 0 && linhaTotal('(-) Custos', -totCusto)}
            {custos.map((l) => linhaConta(l, -1))}
            {despesas.length > 0 && linhaTotal('(-) Despesas', -totDespesa)}
            {despesas.map((l) => linhaConta(l, -1))}
            {linhaTotal('= Resultado do período', resultado)}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// =============================================================================
// CÁLCULOS (finCalcHTML L5534 — atualização de débito: correção+multa+juros)
// =============================================================================
const CALC_IDX: Record<string, { label: string; acum12m: number }> = {
  'IGP-M': { label: 'IGP-M', acum12m: 3.89 },
  'IPCA': { label: 'IPCA', acum12m: 4.27 },
  'INPC': { label: 'INPC', acum12m: 4.11 },
  'SELIC': { label: 'SELIC (a.a.)', acum12m: 10.5 },
  'CDI': { label: 'CDI (a.a.)', acum12m: 10.4 },
}
function CalcTab({ recebiveis, hojeISO }: { recebiveis: Recebivel[]; hojeISO: string }) {
  const [indice, setIndice] = useState('IGP-M')
  const [multaPct, setMultaPct] = useState(10)
  const [jurosMesPct, setJurosMesPct] = useState(1)
  const [dataCalc, setDataCalc] = useState(hojeISO)
  const [modo, setModo] = useState<'nominal' | 'acrescimos'>('acrescimos')

  // Importa automaticamente recebíveis atrasados (calcOne L5517).
  const atr = recebiveis.filter((r) => r.status === 'atrasado')
  const idx = CALC_IDX[indice]
  const calcOne = (valor: number, dias: number) => {
    if (modo === 'nominal') return { correcao: 0, multa: 0, juros: 0, total: valor }
    const correcao = valor * (idx.acum12m / 100) * (dias / 365)
    const multa = valor * (multaPct / 100)
    const juros = valor * (jurosMesPct / 100) * (dias / 30)
    return { correcao, multa, juros, total: valor + correcao + multa + juros }
  }
  const linhas = atr.map((r) => ({ r, ...calcOne(Number(r.valor) || 0, r.dias_atraso || 0) }))
  const totalAtualizado = sum(linhas, (l) => l.total)
  const totalOriginal = sum(atr, (r) => r.valor)

  return (
    <div>
      <div className="rel-legend">Atualização de débitos em atraso: <b>correção monetária</b> por índice oficial + <b>multa {multaPct}%</b> + <b>juros de mora {jurosMesPct}% a.m.</b>. Índices embarcados (IGP-M/IPCA/INPC/SELIC/CDI); em produção atualizáveis pela API SGS do Banco Central.</div>
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Parâmetros</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="mf" style={{ flex: 1, minWidth: 130 }}><label>Índice de correção</label>
            <select value={indice} onChange={(e) => setIndice(e.target.value)}>{Object.keys(CALC_IDX).map((k) => <option key={k} value={k}>{CALC_IDX[k].label} · {finPct(CALC_IDX[k].acum12m)}</option>)}</select>
          </div>
          <div className="mf" style={{ width: 110 }}><label>Multa (%)</label><input type="number" step="0.5" value={multaPct} onChange={(e) => setMultaPct(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf" style={{ width: 130 }}><label>Juros (% a.m.)</label><input type="number" step="0.1" value={jurosMesPct} onChange={(e) => setJurosMesPct(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf" style={{ width: 160 }}><label>Data do cálculo</label><input type="date" value={dataCalc} onChange={(e) => setDataCalc(e.target.value)} /></div>
          <div className="mf" style={{ width: 150 }}><label>Modo</label>
            <select value={modo} onChange={(e) => setModo(e.target.value as 'nominal' | 'acrescimos')}><option value="acrescimos">Com acréscimos</option><option value="nominal">Nominal</option></select>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}><i className="ti ti-info-circle" /> A atualização de índices via API SGS do Banco Central (séries 189/433/188/432/4389) será conectada no servidor — por ora usa-se os valores embarcados acima.</div>
      </div>
      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Unidade</th><th>Categoria</th><th>Atraso</th><th className="num-r">Original</th><th className="num-r">Correção</th><th className="num-r">Multa</th><th className="num-r">Juros</th><th className="num-r">Atualizado</th></tr></thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={8} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum débito em atraso para atualizar.</td></tr>}
            {linhas.map((l) => (
              <tr key={l.r.id}>
                <td>{l.r.unidade_nome}</td><td>{l.r.categoria}</td><td style={{ color: 'var(--red)' }}>{l.r.dias_atraso}d</td>
                <td className="num-r">{moedaBR(l.r.valor)}</td>
                <td className="num-r" style={{ fontSize: 11.5 }}>{moedaBR(l.correcao)}</td>
                <td className="num-r" style={{ fontSize: 11.5 }}>{moedaBR(l.multa)}</td>
                <td className="num-r" style={{ fontSize: 11.5 }}>{moedaBR(l.juros)}</td>
                <td className="num-r" style={{ fontWeight: 700 }}>{moedaBR(l.total)}</td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot><tr style={{ background: 'var(--surface-2)' }}><td colSpan={3} style={{ fontWeight: 700 }}>Total</td><td className="num-r" style={{ fontWeight: 700 }}>{moedaBR(totalOriginal)}</td><td colSpan={3} /><td className="num-r" style={{ fontWeight: 800, color: '#0f6b3a' }}>{moedaBR(totalAtualizado)}</td></tr></tfoot>
          )}
        </table>
      </div></div>
    </div>
  )
}

// =============================================================================
// CONFIGURAÇÕES (finConfigHTML L5401 + finSalvarCfg)
// =============================================================================
type AdqRow = { nome: string; deb: number; cred: number; parc: number; pix: number; prazo: number }
function ConfigTab({ config }: { config: FinConfig }) {
  const router = useRouter()
  const [royalty, setRoyalty] = useState(config.royalty_pct)
  const [fundo, setFundo] = useState(config.fundo_pct)
  const [vencDia, setVencDia] = useState(config.venc_dia)
  const [imposto, setImposto] = useState(config.imposto_pct)
  const [impostoRegime, setImpostoRegime] = useState(config.imposto_regime)
  const [comissao, setComissao] = useState(config.comissao_pct)
  const [comissaoBase, setComissaoBase] = useState(config.comissao_base)
  const [taxaCartao, setTaxaCartao] = useState(config.taxa_cartao_pct)
  const [banco, setBanco] = useState(config.banco as Record<string, string | boolean>)
  const [cats, setCats] = useState<string[]>(config.categorias)
  const [novaCat, setNovaCat] = useState('')
  const [adq, setAdq] = useState<AdqRow[]>(config.adquirentes as AdqRow[])
  const [regua, setRegua] = useState<ReguaPasso[]>(config.regua)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const addCat = () => { const v = novaCat.trim(); if (v && !cats.includes(v)) { setCats([...cats, v]); setNovaCat('') } }
  const rmCat = (c: string) => { if (c !== 'Royalties') setCats(cats.filter((x) => x !== c)) }

  const salvar = async () => {
    setBusy(true); setMsg('')
    const r = await salvarConfig({ royalty_pct: royalty, fundo_pct: fundo, venc_dia: vencDia, imposto_pct: imposto, imposto_regime: impostoRegime, comissao_pct: comissao, comissao_base: comissaoBase, taxa_cartao_pct: taxaCartao, banco, adquirentes: adq, categorias: cats, regua })
    setBusy(false)
    setMsg(r.ok ? 'Configurações salvas.' : (r.error || 'Erro ao salvar.'))
    if (r.ok) router.refresh()
  }

  const setAdqField = (i: number, k: keyof AdqRow, v: string) => setAdq(adq.map((a, j) => j === i ? { ...a, [k]: k === 'nome' ? v : (parseFloat(v) || 0) } : a))
  const setReguaField = (i: number, k: keyof ReguaPasso, v: string) => setRegua(regua.map((p, j) => j === i ? { ...p, [k]: k === 'dias' ? (parseInt(v) || 0) : v } : p))

  const inputStyle: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontSize: 12.5, fontFamily: 'inherit' }

  return (
    <div>
      <div className="rel-legend">Parâmetros do financeiro da franqueadora. As credenciais do banco são usadas <b>apenas no servidor seguro</b> em produção — aqui ficam mascaradas.</div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="rel-card">
          <div className="set-sec" style={{ marginTop: 0 }}>Royalties &amp; cobrança</div>
          <div className="mf full" style={{ marginBottom: 10 }}><label>% de royalties sobre o faturamento bruto</label><input type="number" step="0.5" value={royalty} onChange={(e) => setRoyalty(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full" style={{ marginBottom: 10 }}><label>% do fundo de marketing</label><input type="number" step="0.5" value={fundo} onChange={(e) => setFundo(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full"><label>Dia de vencimento (mês seguinte)</label><input type="number" min={1} max={28} value={vencDia} onChange={(e) => setVencDia(parseInt(e.target.value) || 10)} /></div>
        </div>
        <div className="rel-card">
          <div className="set-sec" style={{ marginTop: 0 }}>Banco de cobrança</div>
          <div className="mf full" style={{ marginBottom: 10 }}><label>Banco</label><input value={String(banco.nome ?? '')} onChange={(e) => setBanco({ ...banco, nome: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div className="mf" style={{ flex: 1 }}><label>Agência</label><input value={String(banco.agencia ?? '')} onChange={(e) => setBanco({ ...banco, agencia: e.target.value })} /></div>
            <div className="mf" style={{ flex: 1 }}><label>Conta</label><input value={String(banco.conta ?? '')} onChange={(e) => setBanco({ ...banco, conta: e.target.value })} /></div>
          </div>
          <div className="mf full" style={{ marginBottom: 10 }}><label>Convênio / Carteira</label><input value={String(banco.convenio ?? '')} onChange={(e) => setBanco({ ...banco, convenio: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="mf" style={{ flex: 1 }}><label>Usuário (API)</label><input value={String(banco.login ?? '')} onChange={(e) => setBanco({ ...banco, login: e.target.value })} /></div>
            <div className="mf" style={{ flex: 1 }}><label>Senha / Token</label><input type="password" value="••••••••" disabled style={{ background: 'var(--surface-2)', cursor: 'not-allowed' }} /></div>
          </div>
          <div style={{ fontSize: 11, color: '#B26A00', marginTop: 7 }}><i className="ti ti-lock" /> Senha/token nunca trafegam pelo navegador — ficam em cofre no servidor (produção).</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!banco.autoBaixa} onChange={(e) => setBanco({ ...banco, autoBaixa: e.target.checked })} /> Baixa automática pelo retorno bancário
          </label>
        </div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Regras de despesa <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}>— alimentam o DRE e o Fluxo pelo razão</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 12px' }}>Percentuais aplicados sobre o <b>faturamento real do BEMP</b> ao apurar o mês (Royalties → Apurar mês). <b>0 = não lança</b> a despesa. Ajuste conforme seu contador — o DRE recalcula na próxima apuração.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <div className="mf full"><label>Imposto — regime</label><input value={impostoRegime} onChange={(e) => setImpostoRegime(e.target.value)} placeholder="Simples Nacional" /></div>
          <div className="mf full"><label>Imposto — alíquota efetiva (%)</label><input type="number" step="0.1" min={0} max={100} value={imposto} onChange={(e) => setImposto(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full"><label>Comissão (%)</label><input type="number" step="0.1" min={0} max={100} value={comissao} onChange={(e) => setComissao(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full"><label>Comissão — base de cálculo</label>
            <select value={comissaoBase} onChange={(e) => setComissaoBase(e.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
              {COMISSAO_BASE_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
            </select>
          </div>
          <div className="mf full"><label>Taxa de cartão — MDR médio (%)</label><input type="number" step="0.1" min={0} max={100} value={taxaCartao} onChange={(e) => setTaxaCartao(parseFloat(e.target.value) || 0)} /></div>
        </div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Categorias de recebíveis</div>
        <div style={{ marginBottom: 8 }}>
          {cats.map((c) => (
            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', borderRadius: 20, padding: '5px 12px', fontSize: 12.5, margin: '0 6px 6px 0' }}>
              {c} {c !== 'Royalties' && <i className="ti ti-x" style={{ cursor: 'pointer', color: 'var(--text-3)' }} onClick={() => rmCat(c)} />}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={novaCat} onChange={(e) => setNovaCat(e.target.value)} placeholder="Nova categoria (ex.: Taxa de tecnologia)" style={{ flex: 1, ...inputStyle, padding: '8px 11px' }} />
          <button className="btn btn-ghost" onClick={addCat}><i className="ti ti-plus" /> Adicionar</button>
        </div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Taxas das adquirentes (%) — usadas na conciliação</div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Adquirente</th><th className="num-r">Débito</th><th className="num-r">Crédito</th><th className="num-r">Parcelado</th><th className="num-r">Pix</th><th className="num-r">Prazo (d)</th></tr></thead>
            <tbody>
              {adq.map((a, i) => (
                <tr key={i}>
                  <td><input value={a.nome} onChange={(e) => setAdqField(i, 'nome', e.target.value)} style={{ ...inputStyle, width: 90 }} /></td>
                  {(['deb', 'cred', 'parc', 'pix'] as const).map((k) => <td key={k} className="num-r"><input type="number" step="0.01" value={a[k]} onChange={(e) => setAdqField(i, k, e.target.value)} style={{ ...inputStyle, width: 62, textAlign: 'right' }} /></td>)}
                  <td className="num-r"><input type="number" value={a.prazo} onChange={(e) => setAdqField(i, 'prazo', e.target.value)} style={{ ...inputStyle, width: 52, textAlign: 'right' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Régua de cobrança / jurídico</div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Dias após venc.</th><th>Ação</th><th>Canal</th></tr></thead>
            <tbody>
              {regua.map((p, i) => (
                <tr key={i}>
                  <td><input type="number" value={p.dias} onChange={(e) => setReguaField(i, 'dias', e.target.value)} style={{ ...inputStyle, width: 54, textAlign: 'right' }} /></td>
                  <td><input value={p.acao} onChange={(e) => setReguaField(i, 'acao', e.target.value)} style={{ ...inputStyle, width: '100%' }} /></td>
                  <td><input value={p.canal} onChange={(e) => setReguaField(i, 'canal', e.target.value)} style={{ ...inputStyle, width: '100%' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rel-acts" style={{ justifyContent: 'flex-end', marginTop: 14, display: 'flex' }}>
        <button className="btn btn-primary" disabled={busy} onClick={salvar}><i className="ti ti-device-floppy" /> Salvar configurações</button>
      </div>
    </div>
  )
}
