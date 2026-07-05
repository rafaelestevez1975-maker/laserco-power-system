'use client'

import { useRef, useState } from 'react'
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
  rodarConciliacao, salvarConfig, dreDaCompetencia, dreAnual, fluxoDoRazao, criarContaPlano, setContaPlanoAtivo, removerContaPlano, salvarRoyaltyUnidade, type ContaPlano,
  importarRecebiveis, importarDespesas, type ImportRecebivelItem, type ImportDespesaItem,
  importarExtrato, type ImportExtratoItem,
} from '@/app/(app)/financeiro/actions'
import type { Recebivel, ContaPagar, Conciliacao, FinConfig, DreLinha, RoyaltyUnidade } from '@/app/(app)/financeiro/page'

type TabKey = 'fluxo' | 'dre' | 'calc' | 'receber' | 'pagar' | 'conciliacao' | 'royalties' | 'cobranca' | 'config'
const TABS: { k: TabKey; label: string; icon: string }[] = [
  { k: 'fluxo', label: 'Fluxo de Caixa', icon: 'ti-cash' },
  { k: 'dre', label: 'DRE', icon: 'ti-report-money' },
  { k: 'calc', label: 'Cálculos', icon: 'ti-calculator' },
  { k: 'receber', label: 'Contas a Receber', icon: 'ti-arrow-down-left' },
  { k: 'pagar', label: 'Contas a Pagar', icon: 'ti-arrow-up-right' },
  { k: 'conciliacao', label: 'Conciliação Bancária', icon: 'ti-building-bank' },
  { k: 'royalties', label: 'Automação de Royalties', icon: 'ti-robot' },
  { k: 'cobranca', label: 'Cobrança & Jurídico', icon: 'ti-gavel' },
  { k: 'config', label: 'Configurações', icon: 'ti-settings' },
]

// helpers de soma
const sum = <T,>(arr: T[], f: (x: T) => number | null | undefined) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0)

// Estilo padrão dos seletores de filtro (QA 03/07: chips → listas suspensas em todo o módulo).
const SEL_FILTRO: React.CSSProperties = { padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, background: '#fff', fontFamily: 'inherit', maxWidth: 260 }

// ── Excel (SheetJS)  paridade finImportExcel/finModeloExcel do legacy ──
async function lerPlanilha(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][]
}
const colIdx = (headers: string[], ...keys: string[]) => {
  for (const k of keys) { const i = headers.findIndex((h) => h.includes(k)); if (i >= 0) return i }
  return -1
}
// parser de dinheiro do legacy (aceita "R$ 1.234,56" e "1234.56")
function parseValorBR(s: unknown): number {
  let t = String(s ?? '').replace(/[r$\s]/gi, '')
  if (t.indexOf(',') > -1 && t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = parseFloat(t)
  return isNaN(n) ? 0 : n
}
async function baixarModeloExcel(ctx: 'receber' | 'pagar') {
  const XLSX = await import('xlsx')
  const aoa = ctx === 'pagar'
    ? [['Categoria', 'Descrição', 'Escopo/Unidade', 'Valor', 'Vencimento', 'Prioridade', 'Status'],
       ['Salários', 'Folha de pagamento  equipe', 'Florianópolis - Centro', '14200,00', '05/07/2026', 'alta', 'aberto'],
       ['Aluguel', 'Aluguel da matriz', 'Escritório', '12000,00', '10/07/2026', 'media', 'aberto'],
       ['Impostos', 'DAS Simples Nacional', 'Escritório', '9800,50', '20/07/2026', 'alta', 'aberto']]
    : [['Unidade/Cliente', 'Categoria', 'Descrição', 'Valor', 'Vencimento', 'Status'],
       ['Manaus - Ponta Negra Shopping', 'Royalties', 'Royalties · 06/2026', '6850,00', '10/07/2026', 'aberto'],
       ['Caruaru - Caruaru', 'Taxa de franquia', 'Parcela 4/6', '8333,33', '10/07/2026', 'aberto'],
       ['Cuiabá - Pantanal Shopping', 'Locação de equipamentos', 'Locação UltraCel · 06/2026', '3600,00', '05/07/2026', 'aberto']]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = aoa[0].map(() => ({ wch: 24 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos')
  XLSX.writeFile(wb, `modelo-lancamentos-contas-a-${ctx}.xlsx`)
}

// ── Modal "Editar filtros" (finFiltroOpen L5431)  período/pessoa/descrição/VALOR (QA 03/07) ──
type FiltrosFin = { d1: string; d2: string; pessoa: string; desc: string; v1: string; v2: string }
const FILTROS_ZERO: FiltrosFin = { d1: '', d2: '', pessoa: '', desc: '', v1: '', v2: '' }
/** Predicado de valor (min/max) — vazio = sem corte. */
const passaValor = (f: FiltrosFin, v: number | null | undefined) =>
  (!f.v1 || Number(v ?? 0) >= Number(f.v1)) && (!f.v2 || Number(v ?? 0) <= Number(f.v2))
function FiltroFinModal({ titulo, pessoaLabel, pessoas, filtros, onApply, onClose }: {
  titulo: string; pessoaLabel: string; pessoas: string[]; filtros: FiltrosFin
  onApply: (f: FiltrosFin) => void; onClose: () => void
}) {
  const [f, setF] = useState<FiltrosFin>(filtros)
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit', background: '#fff' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,30,.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 640, width: '100%', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.3)', padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <i className="ti ti-filter" style={{ fontSize: 20, color: '#3b4252' }} />
          <h3 style={{ fontSize: 19, fontWeight: 700, flex: 1 }}>{titulo}</h3>
          <i className="ti ti-x" style={{ fontSize: 20, color: '#9aa0aa', cursor: 'pointer' }} onClick={onClose} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 26px' }}>
          <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Período (vencimento)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={f.d1} onChange={(e) => setF({ ...f, d1: e.target.value })} style={inp} />
              <span style={{ color: 'var(--text-3)' }}>→</span>
              <input type="date" value={f.d2} onChange={(e) => setF({ ...f, d2: e.target.value })} style={inp} />
            </div>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>{pessoaLabel}</label>
            <select value={f.pessoa} onChange={(e) => setF({ ...f, pessoa: e.target.value })} style={inp}>
              <option value="">{pessoaLabel}  todos</option>
              {pessoas.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Valor (R$)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" step="0.01" value={f.v1} onChange={(e) => setF({ ...f, v1: e.target.value })} placeholder="mín." style={inp} />
              <span style={{ color: 'var(--text-3)' }}>→</span>
              <input type="number" step="0.01" value={f.v2} onChange={(e) => setF({ ...f, v2: e.target.value })} placeholder="máx." style={inp} />
            </div>
          </div>
          <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Descrição contém</label>
            <input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="Buscar por texto…" style={inp} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="btn btn-ghost" onClick={() => { onApply({ ...FILTROS_ZERO }) }}>Limpar filtros</button>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onApply(f)}><i className="ti ti-check" /> Aplicar</button>
        </div>
      </div>
    </div>
  )
}

function Pill({ s }: { s: string }) {
  const p = STATUS_PILL[s] || STATUS_PILL.aberto
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: p.bg, color: p.c }}>{p.label}</span>
}
function PrioPill({ pr }: { pr: string }) {
  const p = PRIO_PILL[pr] || PRIO_PILL.media
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: p.bg, color: p.c }}>{p.label}</span>
}

export type UnidadeOpt = { id: string; nome: string }

export function FinanceiroTabs({ migracaoOk, truncado = false, recebiveis, contasPagar, conciliacao, config, hojeISO, dre = [], dreCompetencia = null, fluxoSerie = [], fluxoResumo = null, fluxoComp = [], planoContas = [], unidades = [], royaltiesUnidade = [], indices = {}, unidadeAtiva = null, tabInicial = 'fluxo' }: {
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
  planoContas?: ContaPlano[]
  unidades?: UnidadeOpt[]
  royaltiesUnidade?: RoyaltyUnidade[]
  indices?: Record<string, { label: string; acum12m: number }>
  unidadeAtiva?: { id: string; nome: string } | null
  tabInicial?: TabKey
}) {
  const [tab, setTab] = useState<TabKey>(tabInicial)
  // Troca de aba reflete na URL (/financeiro/<aba>) sem recarregar  o menu lateral acompanha.
  const trocarAba = (k: TabKey) => {
    setTab(k)
    try { window.history.replaceState(null, '', k === 'fluxo' ? '/financeiro' : `/financeiro/${k}`) } catch { /* noop */ }
  }

  return (
    <div>
      <div className="rel-tabs" style={{ flexWrap: 'wrap' }} id="finTabs">
        {TABS.map((t) => (
          <div key={t.k} className={`rel-tab ${t.k === tab ? 'active' : ''}`} onClick={() => trocarAba(t.k)} style={{ cursor: 'pointer' }}>
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

      {unidadeAtiva && (
        <div className="rel-legend" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-building-store" style={{ color: 'var(--brand-500)', fontSize: 16 }} />
          <span>Exibindo apenas <b>{unidadeAtiva.nome}</b> (filtro de unidade do topo). Selecione “Todas as unidades” no topo para ver a rede inteira.</span>
        </div>
      )}

      {truncado && (
        <div className="rel-legend" style={{ background: '#FFF8E1', color: 'var(--text)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-alert-triangle" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span>O volume de lançamentos ultrapassou o limite de leitura desta tela  <b>os totais e KPIs abaixo são parciais</b> (somam apenas os registros carregados). Filtre por período/unidade para ver os valores completos.</span>
        </div>
      )}

      {tab === 'fluxo' && <FluxoTab serie0={fluxoSerie} resumo0={fluxoResumo} comp0={fluxoComp} hojeISO={hojeISO} recebiveis={recebiveis} contasPagar={contasPagar} unidadeAtiva={unidadeAtiva} />}
      {tab === 'dre' && <DreTab dre={dre} competencia={dreCompetencia} unidades={unidades} unidadeAtiva={unidadeAtiva} config={config} />}
      {tab === 'calc' && <CalcTab recebiveis={recebiveis} hojeISO={hojeISO} indices={indices} />}
      {tab === 'receber' && <ReceberTab recebiveis={recebiveis} goRoyalties={() => trocarAba('royalties')} config={config} unidades={unidades} />}
      {tab === 'pagar' && <PagarTab contasPagar={contasPagar} config={config} planoContas={planoContas} unidades={unidades} />}
      {tab === 'conciliacao' && <ConciliacaoTab conciliacao={conciliacao} />}
      {tab === 'royalties' && <RoyaltiesTab recebiveis={recebiveis} config={config} hojeISO={hojeISO} />}
      {tab === 'cobranca' && <CobrancaTab recebiveis={recebiveis} config={config} />}
      {tab === 'config' && <ConfigTab config={config} planoContas={planoContas} royaltiesUnidade={royaltiesUnidade} />}
    </div>
  )
}

// =============================================================================
// FLUXO DE CAIXA (finFluxoHTML L5156 + finProxSemanaHTML L5124)
// =============================================================================
function FluxoTab({ serie0, resumo0, comp0, hojeISO, recebiveis, contasPagar, unidadeAtiva = null }: { serie0: FluxoSerie[]; resumo0: FluxoResumo | null; comp0: FluxoComp[]; hojeISO: string; recebiveis: Recebivel[]; contasPagar: ContaPagar[]; unidadeAtiva?: { id: string; nome: string } | null }) {
  // QA 03/07: escopo COMBINÁVEL por checkbox. Default = Franqueadora + Lojas próprias
  // (a receita da FRANQUIA não é dinheiro da franqueadora  só o royalty, que já está na
  // visão Franqueadora). Marcar Franquias soma a operação das franqueadas quando quiser.
  const [partes, setPartes] = useState<string[]>(ESCOPO_DEFAULT)
  const [serie, setSerie] = useState<FluxoSerie[]>(serie0)
  const [resumo, setResumo] = useState<FluxoResumo>(resumo0 ?? FLUXO_ZERO)
  const [comp, setComp] = useState<FluxoComp[]>(comp0)
  const [busy, setBusy] = useState(false)
  const reqRef = useRef(0) // guarda de corrida: só a ÚLTIMA troca de escopo aplica o resultado
  async function trocarEscopo(novas: string[]) {
    const req = ++reqRef.current
    setPartes(novas); setBusy(true)
    const r = await fluxoDoRazao(novas.join(','), unidadeAtiva?.id ?? null)
    if (req !== reqRef.current) return // chegou fora de ordem  descarta
    setBusy(false)
    if (r.ok) { setSerie(r.serie ?? []); setResumo(r.resumo ?? FLUXO_ZERO); setComp(r.composicao ?? []) }
  }
  const escopoLabel = rotuloEscopo(partes)

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

  // Série de 6 meses terminando no mês corrente  preenche 0 nos meses sem lançamento (estado honesto).
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
        {unidadeAtiva ? (
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}><i className="ti ti-building-store" style={{ color: 'var(--brand-500)' }} /> Fluxo da unidade <b>{unidadeAtiva.nome}</b></span>
        ) : (
          <EscopoPicker partes={partes} onChange={trocarEscopo} />
        )}
        {busy && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>carregando…</span>}
      </div>
      <div className="rel-legend">Fluxo de caixa derivado do <b>razão</b> (fonte única)  visão <b>{escopoLabel}</b>. Entradas/saídas pela <b>data prevista de caixa</b>; <b>Recebido/Pago</b> refletem baixas registradas. A operação das franquias fica fora desta conta  da franquia entram só os <b>royalties</b>.</div>

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
      </div>

      {/* Projeção de caixa próximos N dias  paridade com o legacy (finProxSemanaHTML). */}
      <ProjecaoCaixa recebiveis={recebiveis} contasPagar={contasPagar} hojeISO={hojeISO} />
    </div>
  )
}

// =============================================================================
// CONTAS A RECEBER (finReceberHTML L5202 + finRecAcoes L5222)
// =============================================================================
function ReceberTab({ recebiveis, goRoyalties, config, unidades = [] }: { recebiveis: Recebivel[]; goRoyalties: () => void; config: FinConfig; unidades?: UnidadeOpt[] }) {
  const router = useRouter()
  const [cat, setCat] = useState('Todas')
  const [status, setStatus] = useState('Todos')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [filtros, setFiltros] = useState<FiltrosFin>({ ...FILTROS_ZERO })
  const [filtroOpen, setFiltroOpen] = useState(false)
  const [showNova, setShowNova] = useState(false)
  const [importando, setImportando] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const fcount = [filtros.d1 || filtros.d2, filtros.pessoa, filtros.desc, filtros.v1 || filtros.v2].filter(Boolean).length

  // Importação de planilha (paridade finImportExcel 'receber')
  async function importar(f: File | null | undefined) {
    if (!f) return
    setImportando(true); setMsg('Lendo planilha…')
    try {
      const aoa = await lerPlanilha(f)
      const headers = (aoa[0] || []).map((x) => String(x || '').trim().toLowerCase())
      const cUni = colIdx(headers, 'unidade', 'escopo', 'loja', 'filial', 'franquia', 'cliente')
      const cCat = colIdx(headers, 'categoria', 'categ', 'conta', 'grupo')
      const cDesc = colIdx(headers, 'descri', 'histó', 'histo', 'lança', 'lanca', 'nome', 'item')
      const cVal = colIdx(headers, 'valor', 'value', 'total', 'montante', 'r$')
      const cVenc = colIdx(headers, 'vencimento', 'venc', 'data')
      const cStat = colIdx(headers, 'status', 'situa', 'pago')
      const itens: ImportRecebivelItem[] = aoa.slice(1)
        .filter((r) => r && r.some((c) => String(c || '').trim()))
        .map((r) => ({
          unidade: cUni >= 0 ? String(r[cUni] || '').trim() : '',
          categoria: cCat >= 0 ? String(r[cCat] || 'Outros').trim() : 'Outros',
          descricao: cDesc >= 0 ? String(r[cDesc] || '').trim() : '',
          valor: cVal >= 0 ? parseValorBR(r[cVal]) : 0,
          vencimento: cVenc >= 0 ? String(r[cVenc] || '').trim() : null,
          status: cStat >= 0 ? String(r[cStat] || '') : '',
        }))
      const res = await importarRecebiveis(itens)
      setMsg(res.ok ? `${res.importados} lançamento(s) importado(s) do Excel.` : (res.error || 'Falha na importação.'))
      if (res.ok) router.refresh()
    } catch { setMsg('Não foi possível ler a planilha. Confira o formato (.xlsx/.csv).') }
    setImportando(false)
  }

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(id); setMsg('')
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro.'); return }
    setMsg(okMsg); router.refresh()
  }

  // Categorias = as cadastradas em Configurações (fin_config.categorias) ∪ as já usadas nos dados.
  const cats = ['Todas', ...new Set([...(config.categorias || []), ...recebiveis.map((r) => r.categoria).filter(Boolean)])]
  const sts: [string, string][] = [['Todos', 'Todos'], ['aberto', 'Em aberto'], ['atrasado', 'Atrasado'], ['pago', 'Pago'], ['suspenso', 'Suspenso']]
  const list = recebiveis.filter((r) =>
    (cat === 'Todas' || r.categoria === cat) && (status === 'Todos' || r.status === status) &&
    (!filtros.pessoa || r.unidade_nome === filtros.pessoa) &&
    (!filtros.desc || `${r.categoria} ${r.unidade_nome || ''} ${r.competencia || ''}`.toLowerCase().includes(filtros.desc.toLowerCase())) &&
    (!filtros.d1 || (r.vencimento || '') >= filtros.d1) && (!filtros.d2 || (r.vencimento || '') <= filtros.d2) &&
    passaValor(filtros, r.valor))
  const tot = sum(list, (r) => r.valor)
  const susp = sum(list.filter((r) => r.status === 'suspenso'), (r) => r.valor)

  return (
    <div>
      <div className="rel-legend">Todo recebível das unidades entra aqui, com <b>categorias separadas</b>: Royalties (10% do bruto), Taxa de franquia, Fundo de marketing, Aluguel de máquinas e outros  cadastráveis em Configurações.</div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}
      {/* QA 03/07: chips viravam poluição conforme as categorias crescem → listas suspensas. */}
      <div className="dash-filter" style={{ marginBottom: 14, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="flabel">Categoria</span>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={SEL_FILTRO}>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="flabel">Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={SEL_FILTRO}>
          {sts.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
        </select>
      </div>
      <div className="rel-acts" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Total filtrado: <b style={{ color: '#0f6b3a' }}>{moedaBR(tot)}</b> · {list.length} lançamento(s){susp > 0 && <> · Suspensos: <b style={{ color: '#6B5B95' }}>{moedaBR(susp)}</b></>}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { importar(e.target.files?.[0]); e.currentTarget.value = '' }} />
          <button className="btn btn-ghost" onClick={() => baixarModeloExcel('receber')} title="Baixar um modelo .xlsx com as colunas certas"><i className="ti ti-download" /> Modelo</button>
          <button className="btn btn-primary" disabled={importando} onClick={() => fileRef.current?.click()} title="Colunas reconhecidas: Unidade/Cliente, Categoria, Descrição, Valor, Vencimento, Status"><i className="ti ti-file-spreadsheet" /> {importando ? 'Importando…' : 'Importar lançamentos (Excel)'}</button>
          <button className="btn" onClick={() => setFiltroOpen(true)}><i className="ti ti-filter" /> Editar filtros{fcount > 0 && <span style={{ background: 'var(--brand-500)', color: '#fff', borderRadius: 20, padding: '0 6px', fontSize: 10, marginLeft: 4 }}>{fcount}</span>}</button>
          <button className="btn btn-ghost" onClick={() => setShowNova(true)}><i className="ti ti-plus" /> Nova conta a receber</button>
          <button className="btn btn-primary" onClick={goRoyalties}><i className="ti ti-robot" /> Gerar cobrança automática</button>
        </div>
      </div>
      {filtroOpen && <FiltroFinModal titulo="Editar filtros" pessoaLabel="Cliente" pessoas={[...new Set(recebiveis.map((r) => r.unidade_nome).filter(Boolean) as string[])].sort()} filtros={filtros} onApply={(f) => { setFiltros(f); setFiltroOpen(false) }} onClose={() => setFiltroOpen(false)} />}
      {showNova && <NovaReceitaModal config={config} unidades={unidades} onClose={() => setShowNova(false)} onSaved={() => { setShowNova(false); setMsg('Conta a receber lançada (sub-livro + razão).'); router.refresh() }} />}
      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Unidade</th><th>Categoria</th><th>Competência</th><th className="num-r">Valor</th><th>Venc.</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum recebível com esse filtro.</td></tr>}
            {list.slice(0, 400).map((r) => (
              <tr key={r.id}>
                <td><span className="cli-name"><i className="ti ti-building-store" style={{ color: 'var(--brand-500)', marginRight: 6, verticalAlign: -2 }} />{r.unidade_nome || ''}</span></td>
                <td>{r.categoria}</td>
                <td style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{r.competencia}{r.bruto ? <><br />bruto {moedaBR(r.bruto)}</> : null}</td>
                <td className="num-r" style={{ fontWeight: 700 }}>{moedaBR(r.valor)}</td>
                <td>{dataBR(r.vencimento)}{r.status === 'atrasado' && <span style={{ color: 'var(--red)', fontSize: 11 }}> ({r.dias_atraso}d)</span>}</td>
                <td><Pill s={r.jur_id ? 'jur' : r.status} /></td>
                <td style={{ whiteSpace: 'nowrap' }}><RecAcoes r={r} busy={busy} run={run} bancoOk={Boolean((config.banco as { nome?: string })?.nome)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

function RecAcoes({ r, busy, run, bancoOk = false }: { r: Recebivel; busy: string | null; run: (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => void; bancoOk?: boolean }) {
  const b = busy === r.id
  if (r.status === 'pago') return <span className="os-link" title={r.boleto ? 'boleto ' + r.boleto.slice(0, 9) : ''}><i className="ti ti-receipt" /> Comprovante</span>
  if (r.status === 'suspenso') return <span className="os-link" onClick={() => !b && run(r.id, () => suspenderLancamento('receber', r.id), 'Lançamento reativado.')}><i className="ti ti-player-play" /> Reativar</span>
  const acts: React.ReactNode[] = []
  // Sem banco configurado o boleto é PRÉVIA  o tooltip aponta onde configurar (auto-serviço 04/07).
  if (!r.boleto) acts.push(<span key="ger" className="os-link" title={bancoOk ? undefined : 'PRÉVIA  o registro real no banco (multa/protesto) liga quando o convênio for preenchido em Configurações → Banco de cobrança'} onClick={() => !b && run(r.id, () => gerarBoleto(r.id), 'Boleto gerado e enviado por e-mail/WhatsApp ao franqueado.')}><i className="ti ti-file-invoice" /> Gerar boleto{bancoOk ? '' : ' (prévia)'}</span>)
  else {
    acts.push(<VerBoletoLink key="ver" r={r} />)
    acts.push(<span key="baixa" className="os-link" onClick={() => !b && run(r.id, () => darBaixaRecebivel(r.id), 'Baixa registrada (retorno bancário).')}><i className="ti ti-circle-check" /> Dar baixa</span>)
  }
  if (r.status === 'atrasado' && !r.jur_id) acts.push(<span key="jur" className="os-link" style={{ color: 'var(--red)' }} onClick={() => !b && run(r.id, () => escalarJuridico(r.id), 'Caso encaminhado ao Jurídico.')}><i className="ti ti-gavel" /> Jurídico</span>)
  acts.push(<span key="susp" className="os-link" style={{ color: '#6B5B95' }} onClick={() => !b && run(r.id, () => suspenderLancamento('receber', r.id), 'Marcado como suspenso.')}><i className="ti ti-player-pause" /> Suspender</span>)
  return <>{acts.map((a, i) => <span key={i}>{i > 0 && ' · '}{a}</span>)}</>
}

// Ver boleto (finVerBoleto L5230)  exibe boleto simulado
function VerBoletoLink({ r }: { r: Recebivel }) {
  return (
    <span className="os-link" onClick={() => alert(
      `PRÉVIA DO BOLETO  emissão bancária em integração\n(dados reais do lançamento)\n\nBeneficiário: Laser&Co Franqueadora Ltda\nPagador: ${r.unidade_nome || ''}\nReferência: ${r.categoria} · ${r.competencia || ''}\nValor: ${moedaBR(r.valor)}\nVencimento: ${dataBR(r.vencimento)}\n\nLinha digitável:\n${r.boleto}\n\nEnviado para: ${finFranqEmail(r.unidade_nome)}`,
    )}><i className="ti ti-eye" /> Ver boleto</span>
  )
}

// =============================================================================
// CONTAS A PAGAR (finPagarHTML L5233 + finSetPrio + finSuspender)
// =============================================================================
function PagarTab({ contasPagar, config, planoContas = [], unidades = [] }: { contasPagar: ContaPagar[]; config: FinConfig; planoContas?: ContaPlano[]; unidades?: UnidadeOpt[] }) {
  const router = useRouter()
  const [escopo, setEscopo] = useState('Todos')
  const [prio, setPrio] = useState('Todas')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [showNova, setShowNova] = useState(false)
  const [filtros, setFiltros] = useState<FiltrosFin>({ ...FILTROS_ZERO })
  const [filtroOpen, setFiltroOpen] = useState(false)
  const [importando, setImportando] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const fcount = [filtros.d1 || filtros.d2, filtros.pessoa, filtros.desc, filtros.v1 || filtros.v2].filter(Boolean).length

  // Importação de planilha (paridade finImportExcel 'pagar')
  async function importar(f: File | null | undefined) {
    if (!f) return
    setImportando(true); setMsg('Lendo planilha…')
    try {
      const aoa = await lerPlanilha(f)
      const headers = (aoa[0] || []).map((x) => String(x || '').trim().toLowerCase())
      const cCat = colIdx(headers, 'categoria', 'categ', 'conta', 'grupo')
      const cDesc = colIdx(headers, 'descri', 'histó', 'histo', 'lança', 'lanca', 'nome', 'item')
      const cUni = colIdx(headers, 'unidade', 'escopo', 'loja', 'filial', 'franquia', 'fornecedor')
      const cVal = colIdx(headers, 'valor', 'value', 'total', 'montante', 'r$')
      const cVenc = colIdx(headers, 'vencimento', 'venc', 'data')
      const cPrio = colIdx(headers, 'prioridade', 'prio')
      const cStat = colIdx(headers, 'status', 'situa', 'pago')
      const itens: ImportDespesaItem[] = aoa.slice(1)
        .filter((r) => r && r.some((c) => String(c || '').trim()))
        .map((r) => ({
          categoria: cCat >= 0 ? String(r[cCat] || 'Outras').trim() : 'Outras',
          descricao: cDesc >= 0 ? String(r[cDesc] || '').trim() : '',
          escopo: cUni >= 0 ? String(r[cUni] || 'Rede').trim() : 'Rede',
          valor: cVal >= 0 ? parseValorBR(r[cVal]) : 0,
          vencimento: cVenc >= 0 ? String(r[cVenc] || '').trim() : null,
          prioridade: cPrio >= 0 ? String(r[cPrio] || '') : '',
          status: cStat >= 0 ? String(r[cStat] || '') : '',
        }))
      const res = await importarDespesas(itens)
      setMsg(res.ok ? `${res.importados} lançamento(s) importado(s) do Excel.` : (res.error || 'Falha na importação.'))
      if (res.ok) router.refresh()
    } catch { setMsg('Não foi possível ler a planilha. Confira o formato (.xlsx/.csv).') }
    setImportando(false)
  }

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusy(id); setMsg('')
    const r = await fn(); setBusy(null)
    if (!r.ok) { setMsg(r.error || 'Erro.'); return }
    setMsg(okMsg); router.refresh()
  }

  const escs = ['Todos', 'Escritório', 'Rede', 'Lojas']
  const prChips: [string, string][] = [['Todas', 'Todas'], ['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']]
  const [catPag, setCatPag] = useState('Todas')
  // Categorias = plano de contas (despesa/custo) ∪ categorias já usadas nas contas (dados importados)
  const catsPagar = ['Todas', ...new Set([
    ...planoContas.filter((c) => c.ativo && (c.natureza === 'despesa' || c.natureza === 'custo')).map((c) => c.nome),
    ...contasPagar.map((p) => p.categoria).filter(Boolean),
  ])]
  const prRank: Record<string, number> = { alta: 0, media: 1, baixa: 2 }
  let list = contasPagar.filter((p) =>
    (escopo === 'Todos' || (escopo === 'Lojas' ? (p.escopo !== 'Escritório' && p.escopo !== 'Rede') : p.escopo === escopo)) &&
    (prio === 'Todas' || p.prioridade === prio) &&
    (catPag === 'Todas' || p.categoria === catPag) &&
    (!filtros.pessoa || p.escopo === filtros.pessoa) &&
    (!filtros.desc || `${p.descricao || ''} ${p.categoria}`.toLowerCase().includes(filtros.desc.toLowerCase())) &&
    (!filtros.d1 || (p.vencimento || '') >= filtros.d1) && (!filtros.d2 || (p.vencimento || '') <= filtros.d2) &&
    passaValor(filtros, p.valor))
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
      <div className="rel-legend">Despesas da rede  vinculadas a cada unidade ou em conjunto (escritório/rede). Cada pagamento tem um <b>nível de prioridade</b> (Alta, Média, Baixa): se o caixa apertar, pague primeiro os de <b>prioridade alta</b>.</div>
      {msg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['Prioridade ALTA', pAlta, 'var(--red)'], ['Prioridade Média', pMedia, '#B26A00'], ['Prioridade Baixa', pBaixa, '#1565C0']].map(([lbl, v, cor]) => (
          <div key={lbl as string} className="rel-card" style={{ padding: '10px 14px', flex: 1, minWidth: 140, borderLeft: `3px solid ${cor as string}` }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{lbl as string}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: cor as string }}>{moedaBR(v as number)}</div>
          </div>
        ))}
      </div>
      {/* QA 03/07: chips → listas suspensas (as categorias crescem e poluíam a tela). */}
      <div className="dash-filter" style={{ marginBottom: 14, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="flabel">Escopo</span>
        <select value={escopo} onChange={(e) => setEscopo(e.target.value)} style={SEL_FILTRO}>
          {escs.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <span className="flabel">Prioridade</span>
        <select value={prio} onChange={(e) => setPrio(e.target.value)} style={SEL_FILTRO}>
          {prChips.map((pr) => <option key={pr[0]} value={pr[0]}>{pr[1]}</option>)}
        </select>
        <span className="flabel">Categoria</span>
        <select value={catPag} onChange={(e) => setCatPag(e.target.value)} style={SEL_FILTRO}>
          {catsPagar.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="rel-acts" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Total: <b>{moedaBR(tot)}</b> · Em aberto: <b style={{ color: 'var(--red)' }}>{moedaBR(aberto)}</b>{susp > 0 && <> · Suspensos: <b style={{ color: '#6B5B95' }}>{moedaBR(susp)}</b></>}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { importar(e.target.files?.[0]); e.currentTarget.value = '' }} />
          <button className="btn btn-ghost" onClick={() => baixarModeloExcel('pagar')} title="Baixar um modelo .xlsx com as colunas certas"><i className="ti ti-download" /> Modelo</button>
          <button className="btn btn-primary" disabled={importando} onClick={() => fileRef.current?.click()} title="Colunas reconhecidas: Categoria, Descrição, Escopo/Unidade, Valor, Vencimento, Prioridade, Status"><i className="ti ti-file-spreadsheet" /> {importando ? 'Importando…' : 'Importar lançamentos (Excel)'}</button>
          <button className="btn" onClick={() => setFiltroOpen(true)}><i className="ti ti-filter" /> Editar filtros{fcount > 0 && <span style={{ background: 'var(--brand-500)', color: '#fff', borderRadius: 20, padding: '0 6px', fontSize: 10, marginLeft: 4 }}>{fcount}</span>}</button>
          <button className="btn btn-ghost" onClick={() => setShowNova(true)}><i className="ti ti-plus" /> Nova despesa</button>
        </div>
      </div>
      {filtroOpen && <FiltroFinModal titulo="Editar filtros" pessoaLabel="Fornecedor / Escopo" pessoas={[...new Set(contasPagar.map((p) => p.escopo).filter(Boolean))].sort()} filtros={filtros} onApply={(f) => { setFiltros(f); setFiltroOpen(false) }} onClose={() => setFiltroOpen(false)} />}
      {showNova && <NovaDespesaModal config={config} planoContas={planoContas} unidades={unidades} onClose={() => setShowNova(false)} onSaved={() => { setShowNova(false); router.refresh() }} />}
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

function NovaDespesaModal({ config, planoContas = [], unidades = [], onClose, onSaved }: { config: FinConfig; planoContas?: ContaPlano[]; unidades?: UnidadeOpt[]; onClose: () => void; onSaved: () => void }) {
  // Categorias de DESPESA vêm do PLANO DE CONTAS (Config → Plano de contas), não de lista solta.
  const catsDespesa = planoContas.filter((c) => c.ativo && (c.natureza === 'despesa' || c.natureza === 'custo')).map((c) => c.nome)
  const [categoria, setCategoria] = useState(catsDespesa[0] ?? '')
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
        <div className="mf full" style={{ marginBottom: 10 }}><label>Categoria <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 11 }}>(cadastre em Configurações → Plano de contas)</span></label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
            {catsDespesa.length === 0 && <option value="">— cadastre uma categoria de despesa —</option>}
            {catsDespesa.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="mf full" style={{ marginBottom: 10 }}><label>Descrição</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div className="mf" style={{ flex: 1 }}><label>Escopo</label>
            <select value={escopo} onChange={(e) => setEscopo(e.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
              <option value="Escritório">Escritório</option>
              <option value="Rede">Rede</option>
              {unidades.length > 0 && <optgroup label="Unidades">{unidades.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}</optgroup>}
            </select>
          </div>
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

// Lançamento MANUAL de conta a receber (pedido 03/07: "subir contas a receber" além do Excel).
// Reusa importarRecebiveis([itens])  mesma semântica do import: sub-livro + razão + link.
// RECORRENTE (QA 03/07: "locação de uma máquina 48x 15k"): data de início, periodicidade,
// quantidade de parcelas e valor  gera todas as parcelas de uma vez, numeradas i/n.
const PERIODICIDADES: { valor: string; label: string; meses: number }[] = [
  { valor: 'mensal', label: 'Mensal', meses: 1 },
  { valor: 'bimestral', label: 'Bimestral', meses: 2 },
  { valor: 'trimestral', label: 'Trimestral', meses: 3 },
  { valor: 'semestral', label: 'Semestral', meses: 6 },
  { valor: 'anual', label: 'Anual', meses: 12 },
]
function NovaReceitaModal({ config, unidades = [], onClose, onSaved }: { config: FinConfig; unidades?: UnidadeOpt[]; onClose: () => void; onSaved: () => void }) {
  const cats = config.categorias || []
  const [unidade, setUnidade] = useState('')
  const [categoria, setCategoria] = useState(cats[0] ?? 'Outros')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [statusPg, setStatusPg] = useState<'aberto' | 'pago'>('aberto')
  const [recorrente, setRecorrente] = useState(false)
  const [parcelas, setParcelas] = useState('12')
  const [period, setPeriod] = useState('mensal')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const salvar = async () => {
    const v = Number(valor)
    if (!Number.isFinite(v) || v <= 0) { setErr('Informe um valor maior que zero.'); return }
    if (!vencimento) { setErr(recorrente ? 'Informe a data da primeira parcela.' : 'Informe o vencimento.'); return }
    const n = recorrente ? Math.floor(Number(parcelas)) : 1
    if (recorrente && (!Number.isFinite(n) || n < 2 || n > 360)) { setErr('Quantidade de parcelas inválida (2 a 360).'); return }
    setBusy(true); setErr('')
    // vencimentos: soma meses preservando o DIA da 1ª parcela (dia 31 → cai pro último dia do mês curto)
    const passo = PERIODICIDADES.find((p) => p.valor === period)?.meses ?? 1
    const [a0, m0, d0] = vencimento.split('-').map(Number)
    const vencDe = (i: number) => {
      const mTot = (m0 - 1) + i * passo
      const ano = a0 + Math.floor(mTot / 12), mes = (mTot % 12) + 1
      const ultimo = new Date(ano, mes, 0).getDate()
      return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d0, ultimo)).padStart(2, '0')}`
    }
    const base = (descricao || categoria).trim()
    const itens = Array.from({ length: n }, (_x, i) => ({
      unidade, categoria,
      descricao: n > 1 ? `${base} · ${i + 1}/${n}` : base,
      valor: v, vencimento: vencDe(i),
      status: n > 1 ? 'aberto' : statusPg, // recorrente nasce tudo em aberto
    }))
    const r = await importarRecebiveis(itens)
    setBusy(false)
    if (!r.ok) { setErr(r.error || 'Erro ao lançar.'); return }
    onSaved()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="rel-card" style={{ width: 'min(480px,92vw)', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 15 }}>Nova conta a receber</b>
          <i className="ti ti-x" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        {err && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 8 }}>{err}</div>}
        <div className="mf full" style={{ marginBottom: 10 }}><label>Unidade / cliente</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
            <option value=""> sem unidade (avulso) </option>
            {unidades.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
          </select>
        </div>
        <div className="mf full" style={{ marginBottom: 10 }}><label>Categoria <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 11 }}>(cadastre em Configurações → Categorias de recebíveis)</span></label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
            {cats.length === 0 && <option value="Outros">Outros</option>}
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="mf full" style={{ marginBottom: 10 }}><label>Descrição / competência</label><input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Locação UltraCel · contrato 2026" /></div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div className="mf" style={{ flex: 1 }}><label>{recorrente ? 'Valor da parcela (R$)' : 'Valor (R$)'}</label><input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div className="mf" style={{ flex: 1 }}><label>{recorrente ? '1ª parcela (início)' : 'Vencimento'}</label><input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
          {!recorrente && <div className="mf" style={{ flex: 1 }}><label>Status</label>
            <select value={statusPg} onChange={(e) => setStatusPg(e.target.value as 'aberto' | 'pago')}><option value="aberto">Em aberto</option><option value="pago">Já recebido</option></select>
          </div>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', marginBottom: recorrente ? 10 : 14 }}>
          <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} style={{ accentColor: 'var(--brand-500)' }} />
          <b>Recebimento recorrente</b> <span style={{ color: 'var(--text-3)' }}>(ex.: locação de máquina 48× de 15.000)</span>
        </label>
        {recorrente && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div className="mf" style={{ flex: 1 }}><label>Periodicidade</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODICIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}</select>
            </div>
            <div className="mf" style={{ flex: 1 }}><label>Qtd. de parcelas</label><input type="number" min={2} max={360} value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></div>
            <div className="mf" style={{ flex: 1.4, alignSelf: 'flex-end', fontSize: 11.5, color: 'var(--text-3)' }}>
              {Number(parcelas) >= 2 && Number(valor) > 0 && <>Total do contrato: <b>{moedaBR(Number(parcelas) * Number(valor))}</b> em {parcelas} parcelas</>}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={salvar}>{busy ? '…' : <><i className="ti ti-device-floppy" /> {recorrente ? `Lançar ${parcelas || '…'} parcelas` : 'Lançar'}</>}</button>
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
  const [importOpen, setImportOpen] = useState(false)
  const div = conciliacao.filter((c) => c.status === 'divergencia')

  const rodar = async () => {
    setBusy(true); setMsg('')
    const r = await rodarConciliacao(); setBusy(false)
    setMsg(r.ok ? `Conciliação processada · ${r.cruzados ?? 0} cruzado(s), ${r.divergentes ?? 0} divergência(s).` : (r.error || 'Erro.'))
    if (r.ok) router.refresh()
  }

  return (
    <div>
      <div className="rel-legend">Conciliação <b>automática</b>: cruza as <b>vendas das lojas</b> com os <b>extratos bancários</b> e as <b>taxas das adquirentes</b> cadastradas. Quando o crédito recebido diverge do esperado, o sistema gera um <b>alerta de inconsistência</b>.</div>
      <div className="rel-acts" style={{ justifyContent: 'flex-end', marginBottom: 12, display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy} onClick={() => setImportOpen(true)} title="Importa o extrato de QUALQUER banco: você vincula as colunas da planilha aos campos do sistema"><i className="ti ti-file-spreadsheet" /> Importar extrato (Excel)</button>
        <button className="btn btn-primary" disabled={busy} onClick={rodar}><i className="ti ti-refresh" /> Rodar conciliação automática</button>
      </div>
      {importOpen && <ImportExtratoModal onClose={() => setImportOpen(false)} onDone={(n) => { setImportOpen(false); setMsg(`${n} linha(s) do extrato importada(s) — rode a conciliação.`); router.refresh() }} />}
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
            <div className="rel-card" style={{ background: 'var(--green-bg)', marginBottom: 14 }}><b style={{ color: '#0f6b3a' }}><i className="ti ti-circle-check" /> Sem inconsistências</b>  todas as vendas conciliadas com o extrato.</div>
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
    addLog(`✓ ${r.geradas} boletos gerados no ${banco.nome}  total ${moedaBR(r.total || 0)}`, '✓ Crédito a receber lançado no financeiro da franqueadora', `✓ Enviado por e-mail e WhatsApp aos franqueados (${r.geradas} destinatários)`)
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
      `✓ Apuração ${comp}  faturamento BEMP ${moedaBR(rf.faturamento || 0)} em ${rf.unidades || 0} unidade(s) → ${rf.lancamentos || 0} lançamento(s) de receita no razão`,
      r.geradas ? `✓ Royalties (${config.royalty_pct}%) + Fundo: ${r.geradas} recebível(is) e ${r.lancamentos || 0} lançamento(s) no razão` : 'Royalties já apurados nesta competência.')
    if (rf.semCentro && rf.semCentro > 0) addLog(`⚠ ${rf.semCentro} unidade(s) sem centro de custo  a receita entra no consolidado, mas as despesas de config não incidem sobre elas. Verifique o cadastro.`)
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
    addLog(`✓ Retorno bancário processado  ${r.baixados || 0} boletos baixados (${moedaBR(r.total || 0)})`)
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
      <div className="rel-legend">Automação de cobrança de <b>royalties</b>  sempre <b>{config.royalty_pct}% do faturamento bruto</b>, com vencimento <b>todo dia {config.venc_dia}</b> do mês seguinte. O sistema gera o boleto, lança o crédito a receber, envia ao franqueado e agenda a baixa no retorno bancário.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 14 }}>
        <div className="rel-card" style={{ padding: 14 }}><div style={{ fontSize: 12, color: 'var(--text-2)' }}>Banco de cobrança</div><div style={{ fontSize: 15, fontWeight: 700, marginTop: 3 }}><i className="ti ti-building-bank" style={{ color: 'var(--brand-500)' }} /> {banco.nome || 'Não configurado'}</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{banco.nome ? `Ag. ${banco.agencia || ''} · C/C ${banco.conta || ''}` : 'Configure em Configurações'}</div></div>
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
        <div style={{ fontSize: 12.5, color: '#6b5800' }}><b>Integração bancária real (produção):</b> a conexão com o banco para registrar boletos e dar baixa é feita por <b>API/Open Finance ou CNAB</b>, com credenciais guardadas em cofre seguro no servidor  <b>nunca</b> no navegador. Este módulo <b>simula</b> o ciclo para validação do fluxo.</div>
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
// DRE (finDreHTML L5642  versão simplificada sobre os dados reais)
// =============================================================================
const MESES_DRE = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
// Segmentos do DRE  mesmos do legacy (finDreHTML): consolidado / próprias / franquias / franqueadora,
// + 'todas as unidades' (agregado) e detalhamento por loja.
// QA 03/07: escopo por CHECKBOX combinável (antes era um select de visão única  "não consigo
// ver próprias + franqueadora sem a franquia entrar junto"). As três peças cobrem tudo:
// Franqueadora (centro rede: royalties/fundo) · Lojas próprias · Franquias.
const ESCOPO_PARTES: { valor: string; label: string }[] = [
  { valor: 'franqueadora', label: 'Franqueadora' },
  { valor: 'proprias', label: 'Lojas próprias' },
  { valor: 'franquias', label: 'Franquias' },
]
// Rafael 04/07 (via Julio): franquia é irrelevante no financeiro da franqueadora  OCULTAR o
// checkbox (não remover a lógica: "vai que ele muda de ideia"  é só virar esta flag).
const MOSTRAR_FRANQUIAS = false
const ESCOPO_VISIVEIS = ESCOPO_PARTES.filter((p) => MOSTRAR_FRANQUIAS || p.valor !== 'franquias')
const ESCOPO_DEFAULT = ['franqueadora', 'proprias'] // financeiro da franqueadora SEM franquias
const rotuloEscopo = (partes: string[]) =>
  ESCOPO_PARTES.filter((p) => partes.includes(p.valor)).map((p) => p.label).join(' + ') || 'Franqueadora'
function EscopoPicker({ partes, onChange }: { partes: string[]; onChange: (p: string[]) => void }) {
  const toggle = (v: string) => {
    const novas = partes.includes(v) ? partes.filter((x) => x !== v) : [...partes, v]
    if (novas.length === 0) return // sempre ao menos uma peça marcada
    onChange(novas)
  }
  return (
    <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Incluir na conta:</span>
      {ESCOPO_VISIVEIS.map((p) => (
        <label key={p.valor} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', fontWeight: partes.includes(p.valor) ? 700 : 400 }}>
          <input type="checkbox" checked={partes.includes(p.valor)} onChange={() => toggle(p.valor)} style={{ accentColor: 'var(--brand-500)' }} />
          {p.label}
        </label>
      ))}
    </span>
  )
}
// ── Esqueleto do DRE "adulto" (QA 03/07: subtotais por grupo, Lucro Bruto e Resultado) ──
// Estrutura: Receita bruta → (−) Custos e deduções → (=) Lucro bruto → (−) demais grupos
// de despesa (financeiras, administrativas e os criados pelo usuário) → (=) Resultado.
type DreSecao = { tipo: 'sub' | 'linha' | 'marco'; label: string; chave: string; totais: number[]; sinal: 1 | -1 }
function montarDre(linhas: (DreLinha & { mes?: number })[], nMeses: number): { secoes: DreSecao[]; receitaMes: number[] } {
  const idx = (l: { mes?: number }) => (nMeses === 1 ? 0 : ((l.mes ?? 1) - 1))
  const somaEm = (arr: number[], l: DreLinha & { mes?: number }) => { arr[idx(l)] += Number(l.total) || 0 }
  const zeros = () => Array.from({ length: nMeses }, () => 0)

  const receitas = linhas.filter((l) => l.natureza === 'receita')
  const naoRec = linhas.filter((l) => l.natureza !== 'receita')
  const receitaMes = zeros(); receitas.forEach((l) => somaEm(receitaMes, l))

  const secoes: DreSecao[] = []
  const porConta = (lote: (DreLinha & { mes?: number })[]) => {
    const m = new Map<string, { ordem: number; tot: number[] }>()
    for (const l of lote) {
      const e = m.get(l.conta) ?? { ordem: l.ordem, tot: zeros() }
      somaEm(e.tot, l); e.ordem = Math.min(e.ordem, l.ordem); m.set(l.conta, e)
    }
    return [...m.entries()].sort((a, b) => a[1].ordem - b[1].ordem)
  }

  secoes.push({ tipo: 'sub', label: '(+) Receita bruta', chave: 'rb', totais: receitaMes, sinal: 1 })
  for (const [conta, e] of porConta(receitas)) secoes.push({ tipo: 'linha', label: conta, chave: `r:${conta}`, totais: e.tot, sinal: 1 })

  // grupos de custo/despesa na ordem do plano; o BLOCO DE CUSTOS fecha o Lucro Bruto.
  // Custo = grupo 'Custos' OU grupo cujas linhas são todas natureza 'custo' (review 04/07:
  // categoria criada em Config com natureza custo e grupo livre também deduz no Lucro Bruto).
  const grupos = new Map<string, { ordem: number; linhas: (DreLinha & { mes?: number })[] }>()
  for (const l of naoRec) {
    const g = grupos.get(l.grupo || 'Outros') ?? { ordem: l.ordem, linhas: [] }
    g.linhas.push(l); g.ordem = Math.min(g.ordem, l.ordem); grupos.set(l.grupo || 'Outros', g)
  }
  const ordenados = [...grupos.entries()].sort((a, b) => a[1].ordem - b[1].ordem)
  const ehCusto = ([g, info]: (typeof ordenados)[number]) =>
    g.trim().toLowerCase() === 'custos' || info.linhas.every((l) => l.natureza === 'custo')
  const custosMes = zeros()
  for (const ent of ordenados.filter(ehCusto)) {
    const [g, info] = ent
    const tot = zeros(); info.linhas.forEach((l) => { somaEm(tot, l); somaEm(custosMes, l) })
    secoes.push({ tipo: 'sub', label: `(-) ${g.trim().toLowerCase() === 'custos' ? 'Custos e deduções' : g}`, chave: `g:${g}`, totais: tot, sinal: -1 })
    for (const [conta, e] of porConta(info.linhas)) secoes.push({ tipo: 'linha', label: conta, chave: `c:${g}:${conta}`, totais: e.tot, sinal: -1 })
  }
  const lucroBruto = receitaMes.map((v, i) => v - custosMes[i])
  secoes.push({ tipo: 'marco', label: '(=) Lucro bruto', chave: 'lb', totais: lucroBruto, sinal: 1 })

  const resultado = [...lucroBruto]
  for (const ent of ordenados.filter((e) => !ehCusto(e))) {
    const [g, info] = ent
    const tot = zeros(); info.linhas.forEach((l) => somaEm(tot, l))
    tot.forEach((v, i) => { resultado[i] -= v })
    secoes.push({ tipo: 'sub', label: `(-) ${g}`, chave: `g:${g}`, totais: tot, sinal: -1 })
    for (const [conta, e] of porConta(info.linhas)) secoes.push({ tipo: 'linha', label: conta, chave: `d:${g}:${conta}`, totais: e.tot, sinal: -1 })
  }
  secoes.push({ tipo: 'marco', label: '(=) Resultado do período', chave: 'res', totais: resultado, sinal: 1 })
  return { secoes, receitaMes }
}

function DreTab({ dre, competencia, unidades = [], unidadeAtiva = null, config = null }: { dre: DreLinha[]; competencia: string | null; unidades?: UnidadeOpt[]; unidadeAtiva?: { id: string; nome: string } | null; config?: FinConfig | null }) {
  // Auto-serviço (04/07): sem %% configurados o DRE fica sem imposto/comissão/taxa  avisar
  // ONDE configurar em vez de esperar alguém perguntar "cadê as despesas".
  const semRegras = !!config && !config.imposto_pct && !config.comissao_pct && !config.taxa_cartao_pct
  const [comp, setComp] = useState(competencia ? competencia.slice(0, 7) : '')
  const [partes, setPartes] = useState<string[]>(ESCOPO_DEFAULT)
  const [unidade, setUnidade] = useState('') // '' = agregado do escopo
  const [visao, setVisao] = useState<'mensal' | 'anual'>('mensal')
  const [ano, setAno] = useState<number>(competencia ? Number(competencia.slice(0, 4)) : new Date().getFullYear())
  const [linhas, setLinhas] = useState<DreLinha[]>(dre)
  const [linhasAno, setLinhasAno] = useState<(DreLinha & { mes: number })[]>([])
  const [busy, setBusy] = useState(false)

  const reqRef = useRef(0) // guarda de corrida: só o ÚLTIMO recarregar aplica o resultado
  const escopoDe = (vPartes: string[], vUnidade: string) => (unidadeAtiva || vUnidade ? 'unidades' : vPartes.join(','))
  async function recarregar(vComp: string, vPartes: string[], vUnidade: string, vVisao: 'mensal' | 'anual', vAno: number) {
    const req = ++reqRef.current
    setBusy(true)
    const uni = unidadeAtiva ? unidadeAtiva.id : (vUnidade || null)
    if (vVisao === 'anual') {
      const r = await dreAnual(vAno, escopoDe(vPartes, vUnidade), uni)
      if (req !== reqRef.current) return
      if (r.ok) setLinhasAno((r.linhas as (DreLinha & { mes: number })[]) ?? [])
    } else {
      const [a, m] = vComp.split('-').map(Number)
      if (!a || !m) { setLinhas([]); setBusy(false); return }
      const r = await dreDaCompetencia(a, m, escopoDe(vPartes, vUnidade), uni)
      if (req !== reqRef.current) return
      if (r.ok) setLinhas((r.linhas as DreLinha[]) ?? [])
    }
    setBusy(false)
  }
  const trocarMes = (v: string) => { setComp(v); recarregar(v, partes, unidade, visao, ano) }
  const trocarEscopo = (p: string[]) => { setPartes(p); recarregar(comp, p, unidade, visao, ano) }
  const trocarUnidade = (v: string) => { setUnidade(v); recarregar(comp, partes, v, visao, ano) }
  const trocarVisao = (v: 'mensal' | 'anual') => { setVisao(v); recarregar(comp, partes, unidade, v, ano) }
  const trocarAno = (v: number) => { setAno(v); recarregar(comp, partes, unidade, visao, v) }

  const compLabel = comp ? `${MESES_DRE[Number(comp.slice(5, 7)) - 1]}/${comp.slice(0, 4)}` : ''
  const tituloEscopo = unidadeAtiva ? unidadeAtiva.nome : (unidade ? (unidades.find((u) => u.id === unidade)?.nome ?? 'Loja') : rotuloEscopo(partes))

  const seletor = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
      <span className="seg" style={{ margin: 0 }}>
        <button className={`seg-btn${visao === 'mensal' ? ' active' : ''}`} onClick={() => trocarVisao('mensal')}>Mensal</button>
        <button className={`seg-btn${visao === 'anual' ? ' active' : ''}`} onClick={() => trocarVisao('anual')}>Anual</button>
      </span>
      {visao === 'mensal' ? (<>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Competência:</label>
        <input type="month" value={comp} onChange={(e) => trocarMes(e.target.value)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13 }} />
      </>) : (<>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Ano:</label>
        <input type="number" min={2020} max={2100} value={ano} onChange={(e) => trocarAno(Number(e.target.value) || ano)} style={{ padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13, width: 90 }} />
      </>)}
      {unidadeAtiva && <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}><i className="ti ti-building-store" style={{ color: 'var(--brand-500)' }} /> DRE da unidade <b>{unidadeAtiva.nome}</b></span>}
      {!unidadeAtiva && <EscopoPicker partes={partes} onChange={trocarEscopo} />}
      {!unidadeAtiva && unidades.length > 0 && (
        <select value={unidade} onChange={(e) => trocarUnidade(e.target.value)} title="DRE de uma loja específica" style={SEL_FILTRO}>
          <option value="">Uma loja específica…</option>
          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      )}
      {busy && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>carregando…</span>}
    </div>
  )

  const base = visao === 'anual' ? linhasAno : linhas
  if (base.length === 0) {
    return (
      <div>
        {seletor}
        <div className="rel-legend">O DRE lê do <b>razão</b> (fonte única). Sem lançamentos em <b>{visao === 'anual' ? ano : compLabel}</b> nesta visão  vá em <b>Royalties → Apurar mês (faturamento + royalties)</b> para lançar a receita e os royalties; o DRE aparece aqui automaticamente.</div>
      </div>
    )
  }

  const nMeses = visao === 'anual' ? 12 : 1
  const { secoes, receitaMes } = montarDre(base, nMeses)
  const receitaTotal = receitaMes.reduce((s, v) => s + v, 0)
  const av = (v: number) => (receitaTotal > 0 ? finPct((Math.abs(v) / receitaTotal) * 100) : '')
  const estiloDe = (s: DreSecao): React.CSSProperties =>
    s.tipo === 'marco' ? { fontWeight: 800, background: 'var(--surface-2)' }
      : s.tipo === 'sub' ? { fontWeight: 700, background: 'var(--surface-2)' } : {}

  return (
    <div>
      {seletor}
      <div className="rel-legend">DRE derivado do <b>razão</b> (fonte única)  <b>{visao === 'anual' ? `ano ${ano}` : compLabel}</b> · visão <b>{tituloEscopo}</b>. A operação das franquias fica fora do DRE da franqueadora (a despesa delas não é conhecida)  da franquia entra só o <b>royalty</b>. <b>AV%</b> = análise vertical sobre a receita bruta.</div>
      {semRegras && (
        <div className="rel-legend" style={{ background: '#FFF3E0', color: '#7A4E00', border: '1px solid #F0C987' }}>
          <i className="ti ti-settings" /> <b>Imposto, comissão e taxa de cartão ainda estão em 0%</b>  por isso essas despesas não aparecem no DRE.
          Configure em <b>Configurações → Regras de despesa</b> e depois clique em <b>Royalties → Apurar mês</b>: o DRE recalcula sozinho.
        </div>
      )}
      <div className="cli-card"><div className="cli-scroll">
        <table className="cli-table">
          <thead>
            <tr>
              <th style={{ minWidth: 220 }}>Demonstração do resultado  {visao === 'anual' ? ano : compLabel}</th>
              {visao === 'anual' && MESES_DRE.map((m) => <th key={m} className="num-r" style={{ minWidth: 92 }}>{m.slice(0, 3)}</th>)}
              <th className="num-r" style={{ minWidth: 110 }}>{visao === 'anual' ? 'Total' : 'Valor'}</th>
              <th className="num-r">AV%</th>
            </tr>
          </thead>
          <tbody>
            {secoes.map((s) => {
              const total = s.totais.reduce((a, v) => a + v, 0)
              const negativo = s.sinal < 0 || total < 0
              return (
                <tr key={s.chave} style={estiloDe(s)}>
                  <td style={s.tipo === 'linha' ? { paddingLeft: 22, color: 'var(--text-2)' } : undefined}>{s.label}</td>
                  {visao === 'anual' && s.totais.map((v, i) => (
                    <td key={i} className="num-r" style={{ fontSize: 12, color: negativo && v !== 0 ? 'var(--red)' : undefined }}>
                      {v === 0 ? '' : moedaBR(s.tipo === 'marco' ? v : s.sinal * v)}
                    </td>
                  ))}
                  <td className="num-r" style={{ fontWeight: s.tipo === 'linha' ? 400 : 700, color: (s.tipo === 'marco' ? total < 0 : s.sinal < 0) ? 'var(--red)' : undefined }}>
                    {moedaBR(s.tipo === 'marco' ? total : s.sinal * total)}
                  </td>
                  <td className="num-r" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{av(total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div></div>
    </div>
  )
}

// =============================================================================
// CÁLCULOS (finCalcHTML L5534  atualização de débito: correção+multa+juros)
// =============================================================================
// Índices REAIS (API SGS do Banco Central, buscados no servidor  src/lib/indices-bcb).
// Sem valor embarcado: se a API não respondeu, a correção monetária fica DESATIVADA (honesto).
type Indices = Record<string, { label: string; acum12m: number }>
function CalcTab({ recebiveis, hojeISO, indices = {} }: { recebiveis: Recebivel[]; hojeISO: string; indices?: Indices }) {
  const chaves = Object.keys(indices)
  const [indice, setIndice] = useState(chaves[0] ?? '')
  const [multaPct, setMultaPct] = useState(10)
  const [jurosMesPct, setJurosMesPct] = useState(1)
  const [dataCalc, setDataCalc] = useState(hojeISO)
  const [modo, setModo] = useState<'nominal' | 'acrescimos'>('acrescimos')

  // Importa automaticamente recebíveis atrasados (calcOne L5517).
  const atr = recebiveis.filter((r) => r.status === 'atrasado')
  const idx = indices[indice] ?? null
  const calcOne = (valor: number, dias: number) => {
    if (modo === 'nominal') return { correcao: 0, multa: 0, juros: 0, total: valor }
    const correcao = idx ? valor * (idx.acum12m / 100) * (dias / 365) : 0
    const multa = valor * (multaPct / 100)
    const juros = valor * (jurosMesPct / 100) * (dias / 30)
    return { correcao, multa, juros, total: valor + correcao + multa + juros }
  }
  const linhas = atr.map((r) => ({ r, ...calcOne(Number(r.valor) || 0, r.dias_atraso || 0) }))
  const totalAtualizado = sum(linhas, (l) => l.total)
  const totalOriginal = sum(atr, (r) => r.valor)

  return (
    <div>
      <div className="rel-legend">Atualização de débitos em atraso: <b>correção monetária</b> por índice oficial + <b>multa {multaPct}%</b> + <b>juros de mora {jurosMesPct}% a.m.</b>. Índices <b>reais do Banco Central</b> (API SGS · acumulado 12 meses), atualizados automaticamente.</div>
      {chaves.length === 0 && <div className="rel-legend" style={{ background: '#FFF8E1', border: '1px solid var(--amber)' }}><i className="ti ti-alert-triangle" style={{ color: 'var(--amber)' }} /> Os índices do Banco Central estão indisponíveis no momento  a <b>correção monetária</b> foi desativada (multa e juros seguem valendo). Recarregue mais tarde.</div>}
      <div className="rel-card" style={{ marginBottom: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Parâmetros</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="mf" style={{ flex: 1, minWidth: 130 }}><label>Índice de correção</label>
            <select value={indice} onChange={(e) => setIndice(e.target.value)} disabled={chaves.length === 0}>{chaves.length === 0 && <option value="">indisponível</option>}{chaves.map((k) => <option key={k} value={k}>{indices[k].label} · {finPct(indices[k].acum12m)}</option>)}</select>
          </div>
          <div className="mf" style={{ width: 110 }}><label>Multa (%)</label><input type="number" step="0.5" value={multaPct} onChange={(e) => setMultaPct(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf" style={{ width: 130 }}><label>Juros (% a.m.)</label><input type="number" step="0.1" value={jurosMesPct} onChange={(e) => setJurosMesPct(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf" style={{ width: 160 }}><label>Data do cálculo</label><input type="date" value={dataCalc} onChange={(e) => setDataCalc(e.target.value)} /></div>
          <div className="mf" style={{ width: 150 }}><label>Modo</label>
            <select value={modo} onChange={(e) => setModo(e.target.value as 'nominal' | 'acrescimos')}><option value="acrescimos">Com acréscimos</option><option value="nominal">Nominal</option></select>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}><i className="ti ti-building-bank" /> Fonte dos índices: <b>Banco Central do Brasil</b> (API SGS  séries 189 IGP-M, 433 IPCA, 188 INPC, 432 SELIC, 4389 CDI), com cache de 6h no servidor.</div>
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
function ConfigTab({ config, planoContas = [], royaltiesUnidade = [] }: { config: FinConfig; planoContas?: ContaPlano[]; royaltiesUnidade?: RoyaltyUnidade[] }) {
  const router = useRouter()
  const [descAtivo, setDescAtivo] = useState(config.royalty_desc_ativo !== false)
  const [descTeto, setDescTeto] = useState(config.royalty_desc_teto ?? 80000)
  const [descPct, setDescPct] = useState(config.royalty_desc_pct ?? 50)
  const [ruBusca, setRuBusca] = useState('')
  const [ruEdit, setRuEdit] = useState<Record<string, { pct: string; dia: string; tipo: 'propria' | 'franquia' }>>({})
  const [ruBusy, setRuBusy] = useState<string | null>(null)
  const [ruMsg, setRuMsg] = useState('')
  const ruVal = (u: RoyaltyUnidade) => ruEdit[u.id] ?? { pct: u.royalty_pct_override != null ? String(u.royalty_pct_override) : '', dia: u.venc_dia_override != null ? String(u.venc_dia_override) : '', tipo: u.tipo_loja }
  const salvarRU = async (u: RoyaltyUnidade) => {
    const v = ruVal(u)
    setRuBusy(u.id); setRuMsg('')
    const r = await salvarRoyaltyUnidade(u.id, v.pct.trim() === '' ? null : parseFloat(v.pct), v.dia.trim() === '' ? null : parseInt(v.dia), v.tipo)
    setRuBusy(null)
    if (!r.ok) { setRuMsg(r.error || 'Erro ao salvar.'); return }
    setRuMsg(`${u.nome}: regra salva (vale na próxima apuração).`)
    router.refresh()
  }
  const [pcNome, setPcNome] = useState('')
  const [pcNatureza, setPcNatureza] = useState('despesa')
  const [pcGrupo, setPcGrupo] = useState('')
  const [pcBusy, setPcBusy] = useState(false)
  const [pcMsg, setPcMsg] = useState('')
  // Grupos existentes no plano (p/ personalizar onde a nova categoria entra no DRE).
  const pcGrupos = [...new Set(planoContas.map((c) => c.grupo).filter(Boolean))] as string[]
  const addConta = async () => {
    setPcBusy(true); setPcMsg('')
    const r = await criarContaPlano(pcNome, pcNatureza, pcGrupo || undefined)
    setPcBusy(false)
    if (!r.ok) { setPcMsg(r.error || 'Erro ao criar categoria.'); return }
    setPcNome(''); setPcMsg('Categoria criada.'); router.refresh()
  }
  const toggleConta = async (c: ContaPlano) => {
    setPcBusy(true); setPcMsg('')
    const r = await setContaPlanoAtivo(c.id, !c.ativo)
    setPcBusy(false)
    if (!r.ok) { setPcMsg(r.error || 'Erro.'); return }
    router.refresh()
  }
  const excluirConta = async (c: ContaPlano) => {
    if (!window.confirm(`Excluir a categoria "${c.nome}"? Essa ação não pode ser desfeita.`)) return
    setPcBusy(true); setPcMsg('')
    const r = await removerContaPlano(c.id)
    setPcBusy(false)
    if (!r.ok) { setPcMsg(r.error || 'Erro ao excluir.'); return }
    setPcMsg(`Categoria "${c.nome}" excluída.`); router.refresh()
  }
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
  const [msgOk, setMsgOk] = useState(true)

  const addCat = () => { const v = novaCat.trim(); if (v && !cats.includes(v)) { setCats([...cats, v]); setNovaCat('') } }
  const rmCat = (c: string) => { if (c !== 'Royalties') setCats(cats.filter((x) => x !== c)) }

  const salvar = async () => {
    setBusy(true); setMsg('')
    const r = await salvarConfig({ royalty_pct: royalty, fundo_pct: fundo, venc_dia: vencDia, imposto_pct: imposto, imposto_regime: impostoRegime, comissao_pct: comissao, comissao_base: comissaoBase, taxa_cartao_pct: taxaCartao, royalty_desc_ativo: descAtivo, royalty_desc_teto: descTeto, royalty_desc_pct: descPct, banco, adquirentes: adq, categorias: cats, regua })
    setBusy(false)
    // Toast FIXO (feedback 03/07: a msg no topo da aba ficava fora da tela ao salvar lá embaixo).
    setMsgOk(r.ok)
    setMsg(r.ok ? 'Configurações salvas com sucesso!' : (r.error || 'Erro ao salvar.'))
    window.setTimeout(() => setMsg(''), 6000)
    if (r.ok) router.refresh()
  }

  const setAdqField = (i: number, k: keyof AdqRow, v: string) => setAdq(adq.map((a, j) => j === i ? { ...a, [k]: k === 'nome' ? v : (parseFloat(v) || 0) } : a))
  const addAdq = () => setAdq([...adq, { nome: '', deb: 0, cred: 0, parc: 0, pix: 0, prazo: 30 }])
  const rmAdq = (i: number) => setAdq(adq.filter((_, j) => j !== i))
  const setReguaField = (i: number, k: keyof ReguaPasso, v: string) => setRegua(regua.map((p, j) => j === i ? { ...p, [k]: k === 'dias' ? (parseInt(v) || 0) : v } : p))
  // QA 03/07: etapas da régua são livres  adicionar/remover (ex.: não rescindir com só 30 dias).
  const addRegua = () => setRegua([...regua, { dias: (regua[regua.length - 1]?.dias ?? 0) + 15, acao: '', canal: '' }])
  const rmRegua = (i: number) => setRegua(regua.filter((_p, j) => j !== i))

  const inputStyle: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontSize: 12.5, fontFamily: 'inherit' }

  return (
    <div>
      <div className="rel-legend">Parâmetros do financeiro da franqueadora. As credenciais do banco são usadas <b>apenas no servidor seguro</b> em produção  aqui ficam mascaradas.</div>
      {/* Toast fixo: visível de qualquer ponto da página (o Salvar fica no rodapé). */}
      {msg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, display: 'flex', alignItems: 'center', gap: 10, background: msgOk ? '#0f6b3a' : 'var(--red)', color: '#fff', padding: '12px 18px', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.25)', fontSize: 13.5, fontWeight: 600, maxWidth: 'min(420px, 90vw)' }}>
          <i className={`ti ${msgOk ? 'ti-circle-check' : 'ti-alert-circle'}`} style={{ fontSize: 18 }} />
          <span>{msg}</span>
          <i className="ti ti-x" style={{ cursor: 'pointer', opacity: 0.8 }} onClick={() => setMsg('')} />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="rel-card">
          <div className="set-sec" style={{ marginTop: 0 }}>Royalties &amp; cobrança</div>
          <div className="mf full" style={{ marginBottom: 10 }}><label>% de royalties sobre o faturamento bruto (receita − descontos)</label><input type="number" step="0.5" value={royalty} onChange={(e) => setRoyalty(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full" style={{ marginBottom: 10 }}><label>% do fundo de marketing (0 = não cobrar)</label><input type="number" step="0.5" value={fundo} onChange={(e) => setFundo(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full" style={{ marginBottom: 12 }}><label>Dia de vencimento padrão (mês seguinte)</label><input type="number" min={1} max={28} value={vencDia} onChange={(e) => setVencDia(parseInt(e.target.value) || 10)} /></div>
          <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={descAtivo} onChange={(e) => setDescAtivo(e.target.checked)} />
              <b>Desconto automático de royalty</b>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="mf" style={{ flex: 1 }}><label>Faturamento abaixo de (R$)</label><input type="number" step="1000" value={descTeto} disabled={!descAtivo} onChange={(e) => setDescTeto(parseFloat(e.target.value) || 0)} /></div>
              <div className="mf" style={{ flex: 1 }}><label>Desconto (%)</label><input type="number" step="5" min={0} max={100} value={descPct} disabled={!descAtivo} onChange={(e) => setDescPct(parseFloat(e.target.value) || 0)} /></div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>Aplicado só a quem está <b>pagando em dia</b> (sem cobrança atrasada). Ex.: abaixo de 80 mil e em dia → royalty de 10% cai pra 5%.</div>
          </div>
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
          <div style={{ fontSize: 11, color: '#B26A00', marginTop: 7 }}><i className="ti ti-lock" /> Senha/token nunca trafegam pelo navegador  ficam em cofre no servidor (produção).</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!banco.autoBaixa} onChange={(e) => setBanco({ ...banco, autoBaixa: e.target.checked })} /> Baixa automática pelo retorno bancário
          </label>
        </div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Regras de despesa <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}> alimentam o DRE e o Fluxo pelo razão</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 12px' }}>Percentuais aplicados sobre o <b>faturamento real do BEMP</b> ao apurar o mês (Royalties → Apurar mês). <b>0 = não lança</b> a despesa. Ajuste conforme seu contador  o DRE recalcula na próxima apuração.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <div className="mf full"><label>Imposto  regime</label><input value={impostoRegime} onChange={(e) => setImpostoRegime(e.target.value)} placeholder="Simples Nacional" /></div>
          <div className="mf full"><label>Imposto  alíquota efetiva (%)</label><input type="number" step="0.1" min={0} max={100} value={imposto} onChange={(e) => setImposto(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full"><label>Comissão (%)</label><input type="number" step="0.1" min={0} max={100} value={comissao} onChange={(e) => setComissao(parseFloat(e.target.value) || 0)} /></div>
          <div className="mf full"><label>Comissão  base de cálculo</label>
            <select value={comissaoBase} onChange={(e) => setComissaoBase(e.target.value)} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: '#fff' }}>
              {COMISSAO_BASE_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
            </select>
          </div>
          <div className="mf full"><label>Taxa de cartão  MDR médio (%)</label><input type="number" step="0.1" min={0} max={100} value={taxaCartao} onChange={(e) => setTaxaCartao(parseFloat(e.target.value) || 0)} /></div>
        </div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Royalties por unidade <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}> exceções à regra geral (vazio = usa a regra geral + desconto automático)</span></div>
        {ruMsg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{ruMsg}</div>}
        <input value={ruBusca} onChange={(e) => setRuBusca(e.target.value)} placeholder="🔎 Buscar franquia…" style={{ ...inputStyle, padding: '8px 11px', width: '100%', marginBottom: 8 }} />
        <div className="cli-scroll" style={{ maxHeight: 280 }}>
          <table className="cli-table">
            <thead><tr><th>Unidade</th><th>Tipo</th><th className="num-r">Royalty % (exceção)</th><th className="num-r">Venc. dia (exceção)</th><th /></tr></thead>
            <tbody>
              {royaltiesUnidade.filter((u) => !ruBusca.trim() || u.nome.toLowerCase().includes(ruBusca.toLowerCase())).slice(0, 80).map((u) => {
                const v = ruVal(u)
                const custom = u.royalty_pct_override != null || u.venc_dia_override != null
                return (
                  <tr key={u.id} style={custom ? { background: 'var(--surface-2)' } : undefined}>
                    <td>{u.nome}{custom && <span style={{ fontSize: 10.5, color: 'var(--brand-600)', marginLeft: 6 }}>(exceção)</span>}</td>
                    <td>
                      <select value={v.tipo} onChange={(e) => setRuEdit({ ...ruEdit, [u.id]: { ...v, tipo: e.target.value as 'propria' | 'franquia' } })}
                        title="Loja própria NÃO paga royalty e entra no segmento 'Lojas próprias' do DRE"
                        style={{ ...inputStyle, padding: '4px 6px', background: '#fff' }}>
                        <option value="franquia">Franquia</option>
                        <option value="propria">Própria</option>
                      </select>
                    </td>
                    <td className="num-r"><input type="number" step="0.5" min={0} max={100} placeholder="" value={v.pct} onChange={(e) => setRuEdit({ ...ruEdit, [u.id]: { ...v, pct: e.target.value } })} style={{ ...inputStyle, width: 74, textAlign: 'right' }} /></td>
                    <td className="num-r"><input type="number" min={1} max={28} placeholder="" value={v.dia} onChange={(e) => setRuEdit({ ...ruEdit, [u.id]: { ...v, dia: e.target.value } })} style={{ ...inputStyle, width: 64, textAlign: 'right' }} /></td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 12 }} disabled={ruBusy === u.id} onClick={() => salvarRU(u)}>{ruBusy === u.id ? '…' : 'Salvar'}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>A exceção vale a partir da <b>próxima apuração</b> (Royalties → Apurar mês). Deixe em branco para voltar à regra geral. <b>Loja própria não paga royalty</b> e habilita os segmentos Próprias × Franquias do DRE.</div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0 }}>Plano de contas (DRE) <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 12 }}> crie as suas categorias de receita/custo/despesa</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '2px 0 10px' }}>As categorias organizam o <b>DRE</b> e classificam as despesas lançadas em <b>Contas a Pagar</b> (a despesa com categoria de mesmo nome cai na conta certa; sem correspondente vai para “Outras despesas”). Desativar uma categoria não apaga lançamentos — ela só some dos seletores.</div>
        {pcMsg && <div style={{ fontSize: 12.5, color: 'var(--brand-600)', marginBottom: 8 }}>{pcMsg}</div>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <input value={pcNome} onChange={(e) => setPcNome(e.target.value)} placeholder="Nova categoria (ex.: Frete e Logística)" style={{ flex: 1, minWidth: 220, ...inputStyle, padding: '8px 11px' }} />
          <select value={pcNatureza} onChange={(e) => setPcNatureza(e.target.value)} style={{ ...inputStyle, padding: '8px 11px', background: '#fff' }}>
            <option value="despesa">Despesa</option>
            <option value="custo">Custo</option>
            <option value="receita">Receita</option>
          </select>
          <select value={pcGrupo} onChange={(e) => setPcGrupo(e.target.value)} title="Grupo do DRE onde a categoria entra" style={{ ...inputStyle, padding: '8px 11px', background: '#fff' }}>
            <option value="">Grupo automático (pela natureza)</option>
            {pcGrupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <button className="btn btn-ghost" disabled={pcBusy || !pcNome.trim()} onClick={addConta}><i className="ti ti-plus" /> Adicionar</button>
        </div>
        <div className="cli-scroll" style={{ maxHeight: 260 }}>
          <table className="cli-table">
            <thead><tr><th>Código</th><th>Categoria</th><th>Natureza</th><th>Grupo</th><th style={{ textAlign: 'center' }}>Ativa</th><th /></tr></thead>
            <tbody>
              {planoContas.map((c) => (
                <tr key={c.id} style={c.ativo ? undefined : { opacity: 0.55 }}>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.codigo || ''}</td>
                  <td>{c.nome}</td>
                  <td style={{ fontSize: 12 }}>{c.natureza}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.grupo || ''}</td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={c.ativo} disabled={pcBusy} onChange={() => toggleConta(c)}
                      title={c.ativo ? 'Desativar (some dos seletores; lançamentos ficam)' : 'Reativar'} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {c.codigo
                      ? <i className="ti ti-lock" title="Categoria do sistema  não pode ser excluída (desative se não usar)" style={{ color: 'var(--text-3)', fontSize: 14 }} />
                      : <button className="btn" disabled={pcBusy} style={{ padding: '3px 8px', color: 'var(--red)' }} onClick={() => excluirConta(c)} title="Excluir categoria"><i className="ti ti-trash" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="set-sec" style={{ marginTop: 0 }}>Taxas das adquirentes (%)  usadas na conciliação</div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Adquirente</th><th className="num-r">Débito</th><th className="num-r">Crédito</th><th className="num-r">Parcelado</th><th className="num-r">Pix</th><th className="num-r">Prazo (d)</th><th /></tr></thead>
            <tbody>
              {adq.map((a, i) => (
                <tr key={i}>
                  <td><input value={a.nome} onChange={(e) => setAdqField(i, 'nome', e.target.value)} style={{ ...inputStyle, width: 90 }} /></td>
                  {(['deb', 'cred', 'parc', 'pix'] as const).map((k) => <td key={k} className="num-r"><input type="number" step="0.01" value={a[k]} onChange={(e) => setAdqField(i, k, e.target.value)} style={{ ...inputStyle, width: 62, textAlign: 'right' }} /></td>)}
                  <td className="num-r"><input type="number" value={a.prazo} onChange={(e) => setAdqField(i, 'prazo', e.target.value)} style={{ ...inputStyle, width: 52, textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right' }}><button className="btn" style={{ padding: '3px 8px', color: 'var(--red)' }} onClick={() => rmAdq(i)} title="Remover adquirente (salve as configurações ao final)"><i className="ti ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={addAdq}><i className="ti ti-plus" /> Adicionar adquirente</button>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Preencha nome e taxas e clique em <b>Salvar configurações</b> (no fim da página) para gravar.</span>
        </div>
      </div>

      <div className="rel-card" style={{ marginTop: 14 }}>
        <div className="set-sec" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Régua de cobrança / jurídico</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.5px', padding: '2px 8px', borderRadius: 20, background: '#FFF3E0', color: '#B26A00', border: '1px solid #F0C987' }}>🚧 EM CONSTRUÇÃO</span>
        </div>
        <div style={{ fontSize: 12, color: '#B26A00', margin: '2px 0 10px' }}><i className="ti ti-alert-triangle" /> Os <b>disparos automáticos</b> (e-mail/WhatsApp) da régua ainda <b>não estão ligados</b> — a configuração abaixo fica salva e passa a valer quando a automação de cobrança entrar no ar.</div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead><tr><th>Dias após venc.</th><th>Ação</th><th>Canal</th><th /></tr></thead>
            <tbody>
              {regua.map((p, i) => (
                <tr key={i}>
                  <td><input type="number" value={p.dias} onChange={(e) => setReguaField(i, 'dias', e.target.value)} style={{ ...inputStyle, width: 54, textAlign: 'right' }} /></td>
                  <td><input value={p.acao} onChange={(e) => setReguaField(i, 'acao', e.target.value)} style={{ ...inputStyle, width: '100%' }} /></td>
                  <td><input value={p.canal} onChange={(e) => setReguaField(i, 'canal', e.target.value)} style={{ ...inputStyle, width: '100%' }} /></td>
                  <td style={{ textAlign: 'right' }}><button className="btn" style={{ padding: '3px 8px', color: 'var(--red)' }} onClick={() => rmRegua(i)} title="Remover etapa (salve as configurações ao final)"><i className="ti ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={addRegua}><i className="ti ti-plus" /> Adicionar etapa</button>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Monte quantas etapas precisar (ex.: 45/60/90 dias antes de rescisão) e clique em <b>Salvar configurações</b>.</span>
        </div>
      </div>

      <div className="rel-acts" style={{ justifyContent: 'flex-end', marginTop: 14, display: 'flex' }}>
        <button className="btn btn-primary" disabled={busy} onClick={salvar}><i className="ti ti-device-floppy" /> Salvar configurações</button>
      </div>
    </div>
  )
}
// Projeção de caixa próximos N dias (finProxSemanaHTML L5124)
function ProjecaoCaixa({ recebiveis, contasPagar, hojeISO }: { recebiveis: Recebivel[]; contasPagar: ContaPagar[]; hojeISO: string }) {
  const [dias, setDias] = useState(7)
  const base = new Date(hojeISO + 'T00:00:00') // data-base = hoje (servidor)
  const N = dias
  const lista: Date[] = []
  for (let k = 1; k <= N; k++) { const d = new Date(base); d.setDate(base.getDate() + k); lista.push(d) }
  const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const fmt = (d: Date) => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')
  const isBiz = (d: Date) => d.getDay() >= 1 && d.getDay() <= 5
  const nBiz = lista.filter(isBiz).length || 1
  const aReceberOpen = sum(recebiveis.filter((r) => r.status === 'aberto' || r.status === 'atrasado'), (r) => r.valor)
  const recDiaUtil = aReceberOpen / nBiz
  const parseV = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : fmt(d) }

  // Saldo inicial = posição de caixa realizada (recebido − pago), não número inventado.
  const saldoRealizado = sum(recebiveis.filter((r) => r.status === 'pago'), (r) => r.valor)
    - sum(contasPagar.filter((p) => p.status === 'pago'), (p) => p.valor)
  let saldo = saldoRealizado
  const rows = lista.map((d) => {
    const tag = fmt(d)
    const entrada = isBiz(d) ? recDiaUtil : recDiaUtil * 0.15
    const pagDia = contasPagar.filter((p) => p.status === 'aberto' && parseV(p.vencimento) === tag)
    const saida = sum(pagDia, (p) => p.valor)
    const saiAlta = sum(pagDia.filter((p) => p.prioridade === 'alta'), (p) => p.valor)
    saldo += entrada - saida
    return { tag, wd: wd[d.getDay()], entrada, saida, saiAlta, saldo, neg: saldo < 0 }
  })
  const totEnt = lista.reduce((s, d) => s + (isBiz(d) ? recDiaUtil : recDiaUtil * 0.15), 0)
  const totSai = sum(contasPagar.filter((p) => p.status === 'aberto' && lista.some((d) => parseV(p.vencimento) === fmt(d))), (p) => p.valor)
  const presets = [7, 10, 15, 30]

  return (
    <div className="rel-card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="set-sec" style={{ marginTop: 0, flex: 1 }}><i className="ti ti-calendar-due" /> Projeção de caixa  próximos {N} dias ({fmt(lista[0])} a {fmt(lista[lista.length - 1])})</div>
        <div style={{ minWidth: 200 }}>
          <label style={{ fontSize: 11, display: 'block' }}>Período da projeção</label>
          <select value={presets.includes(N) ? N : 'custom'} onChange={(e) => {
            if (e.target.value === 'custom') { const n = parseInt(prompt('Projetar o caixa para quantos dias à frente?', '20') || ''); if (n && n >= 1) setDias(Math.min(180, n)) }
            else setDias(+e.target.value)
          }} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px', fontSize: 12.5, fontFamily: 'inherit' }}>
            <option value={7}>1 semana (7 dias)  padrão</option>
            <option value={10}>10 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
            <option value="custom">Personalizar…{!presets.includes(N) ? ` (${N} dias)` : ''}</option>
          </select>
        </div>
      </div>
      <div className="rel-legend" style={{ marginBottom: 10 }}>Projeção conforme <b>o que temos a receber</b> e a <b>expectativa de recebimento das lojas</b> (recebíveis em aberto diluídos nos dias úteis) versus os <b>pagamentos previstos</b>. A coluna <b>(prio. alta)</b> mostra o mínimo a honrar caso o caixa aperte.</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {[['Entradas previstas', totEnt, '#0f6b3a'], ['Saídas previstas', totSai, 'var(--red)'], ['Resultado da semana', totEnt - totSai, (totEnt - totSai) >= 0 ? '#0f6b3a' : 'var(--red)']].map(([lbl, v, cor]) => (
          <div key={lbl as string} className="rel-card" style={{ padding: '10px 14px', flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{lbl as string}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: cor as string }}>{moedaBR(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="cli-scroll">
        <table className="cli-table">
          <thead><tr><th>Dia</th><th className="num-r">Entradas (a receber + lojas)</th><th className="num-r">Saídas</th><th className="num-r">(prio. alta)</th><th className="num-r">Saldo projetado</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tag} style={r.neg ? { background: '#FFF7F7' } : undefined}>
                <td>{r.wd} {r.tag}</td>
                <td className="num-r" style={{ color: '#0f6b3a' }}>{moedaBR(r.entrada)}</td>
                <td className="num-r" style={{ color: 'var(--red)' }}>{r.saida ? moedaBR(r.saida) : ''}</td>
                <td className="num-r" style={{ fontSize: 11, color: 'var(--red)' }}>{r.saiAlta ? moedaBR(r.saiAlta) : ''}</td>
                <td className="num-r" style={{ fontWeight: 700, color: r.saldo >= 0 ? '#0f6b3a' : 'var(--red)' }}>{moedaBR(r.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ── Assistente: importar EXTRATO BANCÁRIO de qualquer banco (pedido 03/07). Passo 1: escolher a
// planilha (.xlsx/.csv). Passo 2: VINCULAR as colunas dela aos campos do sistema (com sugestão
// automática por nome) + prévia. Serve para qualquer layout de extrato. ──
const EXTRATO_CAMPOS: { key: keyof ImportExtratoItem; label: string; obrig: boolean; sug: string[] }[] = [
  { key: 'data', label: 'Data do crédito', obrig: true, sug: ['data', 'date', 'dia'] },
  { key: 'recebido', label: 'Valor recebido (crédito)', obrig: true, sug: ['recebido', 'crédito', 'credito', 'valor', 'amount'] },
  { key: 'venda', label: 'Valor da venda (bruto)', obrig: false, sug: ['venda', 'bruto', 'gross'] },
  { key: 'adquirente', label: 'Adquirente / bandeira', obrig: false, sug: ['adquirente', 'bandeira', 'operadora', 'cartão', 'cartao'] },
  { key: 'unidade', label: 'Unidade / loja', obrig: false, sug: ['unidade', 'loja', 'filial', 'estabelecimento'] },
  { key: 'descricao', label: 'Descrição / histórico', obrig: false, sug: ['descri', 'histó', 'histo', 'lançamento', 'lancamento', 'memo'] },
]
function ImportExtratoModal({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [aoa, setAoa] = useState<string[][] | null>(null)
  const [mapa, setMapa] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const headers = (aoa?.[0] ?? []).map((h) => String(h ?? '').trim())

  async function carregar(f: File | null | undefined) {
    if (!f) return
    setErro('')
    try {
      const dados = await lerPlanilha(f)
      if (!dados.length) { setErro('Planilha vazia.'); return }
      setAoa(dados)
      // sugestão automática de vínculo por nome de coluna
      const hs = (dados[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase())
      const m: Record<string, number> = {}
      for (const c of EXTRATO_CAMPOS) { const i = colIdx(hs, ...c.sug); if (i >= 0) m[c.key as string] = i }
      setMapa(m)
    } catch { setErro('Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv.') }
  }

  const linhas = (aoa ?? []).slice(1).filter((r) => r && r.some((c) => String(c ?? '').trim()))
  const montar = (r: string[]): ImportExtratoItem => ({
    data: mapa.data != null ? String(r[mapa.data] ?? '').trim() : null,
    recebido: mapa.recebido != null ? parseValorBR(r[mapa.recebido]) : 0,
    venda: mapa.venda != null ? parseValorBR(r[mapa.venda]) : null,
    adquirente: mapa.adquirente != null ? String(r[mapa.adquirente] ?? '').trim() : '',
    unidade: mapa.unidade != null ? String(r[mapa.unidade] ?? '').trim() : '',
    descricao: mapa.descricao != null ? String(r[mapa.descricao] ?? '').trim() : '',
  })
  const podeImportar = mapa.data != null && mapa.recebido != null && linhas.length > 0

  async function importar() {
    setBusy(true); setErro('')
    const res = await importarExtrato(linhas.map(montar))
    setBusy(false)
    if (!res.ok) { setErro(res.error || 'Falha na importação.'); return }
    onDone(res.importados ?? 0)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, background: '#fff', fontFamily: 'inherit' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,22,30,.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 860, width: '100%', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.3)', padding: '24px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <i className="ti ti-file-spreadsheet" style={{ fontSize: 20, color: '#3b4252' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Importar extrato bancário</h3>
          <i className="ti ti-x" style={{ fontSize: 20, color: '#9aa0aa', cursor: 'pointer' }} onClick={onClose} />
        </div>

        {!aoa ? (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', marginBottom: 14 }}>Escolha a planilha do extrato (<b>qualquer banco</b> — .xlsx, .xls ou .csv).<br />No próximo passo você vincula as colunas dela aos campos do sistema.</p>
            <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { carregar(e.target.files?.[0]); e.currentTarget.value = '' }} />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}><i className="ti ti-upload" /> Escolher arquivo</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 12 }}><b>{linhas.length}</b> linha(s) encontradas. Vincule as colunas da planilha aos campos do sistema (<span style={{ color: 'var(--red)' }}>*</span> obrigatórios):</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 18px', marginBottom: 16 }}>
              {EXTRATO_CAMPOS.map((c) => (
                <div key={c.key as string}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{c.label}{c.obrig && <span style={{ color: 'var(--red)' }}> *</span>}</label>
                  <select style={inp} value={mapa[c.key as string] ?? ''} onChange={(e) => {
                    const v = e.target.value
                    setMapa((m) => { const n = { ...m }; if (v === '') delete n[c.key as string]; else n[c.key as string] = Number(v); return n })
                  }}>
                    <option value="">— não importar —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="cli-scroll" style={{ maxHeight: 180, marginBottom: 14 }}>
              <table className="cli-table">
                <thead><tr><th>Data</th><th className="num-r">Recebido</th><th className="num-r">Venda</th><th>Adquirente</th><th>Unidade</th><th>Descrição</th></tr></thead>
                <tbody>
                  {linhas.slice(0, 5).map((r, i) => { const it = montar(r); return (
                    <tr key={i}><td>{it.data || '—'}</td><td className="num-r">{it.recebido ? moedaBR(it.recebido) : '—'}</td><td className="num-r">{it.venda ? moedaBR(it.venda) : '—'}</td><td>{it.adquirente || '—'}</td><td>{it.unidade || '—'}</td><td style={{ fontSize: 11.5 }}>{(it.descricao || '—').slice(0, 40)}</td></tr>
                  ) })}
                </tbody>
              </table>
            </div>
            {erro && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 10 }}><i className="ti ti-alert-triangle" /> {erro}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => { setAoa(null); setMapa({}) }}><i className="ti ti-arrow-left" /> Trocar arquivo</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
                <button className="btn btn-primary" onClick={importar} disabled={busy || !podeImportar} title={!podeImportar ? 'Vincule Data e Valor recebido' : undefined}>{busy ? 'Importando…' : <><i className="ti ti-check" /> Importar {linhas.length} linha(s)</>}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
