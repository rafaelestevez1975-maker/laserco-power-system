import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { temPapel } from '@/lib/rbac'
import { indicesEconomicos } from '@/lib/indices-bcb'
import { FinanceiroTabs } from '@/components/financeiro/FinanceiroTabs'
import {
  FIN_CATS_REC, FIN_REGUA, FIN_ADQUIRENTES,
  ROYALTY_PCT_DEFAULT, FUNDO_PCT_DEFAULT, VENC_DIA_DEFAULT,
  IMPOSTO_PCT_DEFAULT, IMPOSTO_REGIME_DEFAULT, COMISSAO_PCT_DEFAULT, COMISSAO_BASE_DEFAULT, TAXA_CARTAO_PCT_DEFAULT,
  janelaFluxo, normalizaFluxo, type FluxoSerie, type FluxoResumo, type FluxoComp,
  calcDiasAtraso,
} from '@/lib/financeiro'

export const dynamic = 'force-dynamic'

export type Recebivel = {
  id: string; unidade_nome: string | null; categoria: string; competencia: string | null
  bruto: number | null; valor: number | null; vencimento: string | null; status: string
  dias_atraso: number; boleto: string | null; enviado: boolean; data_pagamento: string | null; jur_id: string | null
}
export type ContaPagar = {
  id: string; categoria: string; descricao: string | null; escopo: string
  valor: number | null; vencimento: string | null; status: string; prioridade: string
}
export type Conciliacao = {
  id: string; data: string | null; unidade_nome: string | null; adquirente: string | null
  venda: number | null; taxa_pct: number | null; taxa: number | null; esperado: number | null
  recebido: number | null; status: string; observacao: string | null
}
export type FinConfig = {
  royalty_pct: number; fundo_pct: number; venc_dia: number
  imposto_pct: number; imposto_regime: string; comissao_pct: number; comissao_base: string; taxa_cartao_pct: number
  royalty_desc_ativo: boolean; royalty_desc_teto: number; royalty_desc_pct: number
  banco: Record<string, unknown>; adquirentes: unknown[]; categorias: string[]; regua: { dias: number; acao: string; canal: string }[]
}
// Franquia com override de royalty (CEO: % e vencimento por unidade; null = regra geral).
export type RoyaltyUnidade = { id: string; nome: string; royalty_pct_override: number | null; venc_dia_override: number | null; tipo_loja: 'propria' | 'franquia' }
// DRE derivado do RAZÃO (fin_lancamento)  cada linha é uma conta do plano de contas somada.
export type DreLinha = { grupo: string; natureza: string; conta: string; ordem: number; total: number }

const ABAS_VALIDAS = ['fluxo', 'dre', 'calc', 'receber', 'pagar', 'conciliacao', 'royalties', 'cobranca', 'config'] as const

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const tabInicial = (ABAS_VALIDAS as readonly string[]).includes(sp.tab || '') ? (sp.tab as string) : 'fluxo'
  const ctx = await getSessionContext()
  const sb = await createClient()
  // Gate de acesso: admin OU perfil financeiro (legado: isAdmin() || USER_ROLE==='Financeiro').
  const permitido = temPapel(ctx?.papel, 'financeiro', 'gestor')

  if (!permitido) {
    return (
      <div className="view active">
        <div className="rel-legend" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-shield-lock" style={{ fontSize: 18, color: 'var(--brand-600)' }} />
          <span>Módulo restrito a <b>administradores</b> e ao perfil <b>Financeiro</b>.</span>
        </div>
      </div>
    )
  }

  const hojeISO = new Date().toISOString().slice(0, 10)

  // ── Escopo do TOPO (feedback 03/07: o filtro de unidade não refletia no Financeiro) ──
  // Unidade ativa selecionada → TODAS as visões (listas, DRE, Fluxo) escopam por ela.
  const unidadeAtivaId = ctx?.activeUnitId ?? null
  const unidadeAtivaNome = ctx?.activeUnitName ?? null

  // ── Feature-detect: a migration cria fin_recebiveis. Se a tabela não existe,
  //    a query falha → banner de migration + tela em modo vazio. ──
  // Limites de leitura das listas. Como os KPIs/totais são somados em memória a
  // partir destes arrays, capturamos também o count REAL de cada tabela
  // ({ count: 'exact' }) para detectar truncamento e avisar o operador quando a
  // lista exibida estiver abaixo do total (evita total silenciosamente subcontado).
  const LIM_REC = 2000, LIM_PAG = 2000, LIM_CONC = 1000
  let migracaoOk = true
  let recebiveis: Recebivel[] = []
  let recTotal = 0
  {
    let qRec = sb
      .from('fin_recebiveis')
      .select('id, unidade_nome, categoria, competencia, bruto, valor, vencimento, status, dias_atraso, boleto, enviado, data_pagamento, jur_id', { count: 'exact' })
      .order('vencimento', { ascending: true, nullsFirst: false })
      .limit(LIM_REC)
    if (unidadeAtivaId) qRec = qRec.eq('unidade_id', unidadeAtivaId)
    const { data, error, count } = await qRec
    if (error) migracaoOk = false
    else {
      recTotal = count ?? 0
      recebiveis = ((data ?? []) as Recebivel[]).map((r) => ({
        ...r,
        // Recalcula dias de atraso em runtime (calcDias) p/ status 'atrasado'.
        dias_atraso: r.status === 'atrasado' ? (r.dias_atraso || calcDiasAtraso(r.vencimento, hojeISO)) : r.dias_atraso,
      }))
    }
  }

  let contasPagar: ContaPagar[] = []
  let conciliacao: Conciliacao[] = []
  let config: FinConfig | null = null
  let pagTotal = 0
  let concTotal = 0
  if (migracaoOk) {
    let qPag = sb.from('fin_contas_pagar').select('id, categoria, descricao, escopo, valor, vencimento, status, prioridade', { count: 'exact' }).order('vencimento', { ascending: true, nullsFirst: false }).limit(LIM_PAG)
    if (unidadeAtivaNome) qPag = qPag.eq('escopo', unidadeAtivaNome)
    let qConc = sb.from('fin_conciliacao').select('id, data, unidade_nome, adquirente, venda, taxa_pct, taxa, esperado, recebido, status, observacao', { count: 'exact' }).order('data', { ascending: true, nullsFirst: false }).limit(LIM_CONC)
    if (unidadeAtivaNome) qConc = qConc.eq('unidade_nome', unidadeAtivaNome)
    const [{ data: pagRaw, count: pagCount }, { data: concRaw, count: concCount }, { data: cfgRaw }] = await Promise.all([
      qPag,
      qConc,
      sb.from('fin_config').select('royalty_pct, fundo_pct, venc_dia, imposto_pct, imposto_regime, comissao_pct, comissao_base, taxa_cartao_pct, royalty_desc_ativo, royalty_desc_teto, royalty_desc_pct, banco, adquirentes, categorias, regua').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
    ])
    contasPagar = (pagRaw ?? []) as ContaPagar[]
    conciliacao = (concRaw ?? []) as Conciliacao[]
    config = cfgRaw as FinConfig | null
    pagTotal = pagCount ?? 0
    concTotal = concCount ?? 0
  }

  // Truncamento: lista carregada abaixo do total real → totais somados em memória
  // seriam parciais. Mostramos aviso explícito na UI (nunca número subcontado silencioso).
  const truncado =
    recebiveis.length < recTotal ||
    contasPagar.length < pagTotal ||
    conciliacao.length < concTotal

  // Config com defaults do legado quando não houver linha salva.
  const cfg: FinConfig = config ?? {
    royalty_pct: ROYALTY_PCT_DEFAULT, fundo_pct: 0, venc_dia: VENC_DIA_DEFAULT,
    imposto_pct: IMPOSTO_PCT_DEFAULT, imposto_regime: IMPOSTO_REGIME_DEFAULT,
    comissao_pct: COMISSAO_PCT_DEFAULT, comissao_base: COMISSAO_BASE_DEFAULT, taxa_cartao_pct: TAXA_CARTAO_PCT_DEFAULT,
    royalty_desc_ativo: true, royalty_desc_teto: 80000, royalty_desc_pct: 50,
    banco: {}, adquirentes: [...FIN_ADQUIRENTES], categorias: [...FIN_CATS_REC], regua: [...FIN_REGUA],
  }

  // DRE derivado do RAZÃO (fonte única)  última competência apurada no razão.
  let dre: DreLinha[] = []
  let dreCompetencia: string | null = null
  {
    const { data: ultRaw } = await sb.rpc('fin_ultima_competencia')
    const ult = (ultRaw as string | null) ?? null
    if (ult) {
      dreCompetencia = ult
      const d = new Date(ult + 'T12:00:00'); d.setMonth(d.getMonth() + 1)
      const fim = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const { data: dreRaw } = await sb.rpc('fin_dre', unidadeAtivaId
        ? { p_ini: ult, p_fim: fim, p_escopo: 'unidades', p_unidade: unidadeAtivaId }
        : { p_ini: ult, p_fim: fim })
      dre = (dreRaw ?? []) as DreLinha[]
    }
  }

  // Plano de contas (Config gerencia; DRE deriva) + unidades (DRE por loja).
  const { data: pcRaw } = await sb.from('plano_conta').select('id, codigo, nome, natureza, grupo, ordem, ativo').order('ordem')
  const planoContas = (pcRaw ?? []) as { id: string; codigo: string | null; nome: string; natureza: string; grupo: string | null; ordem: number; ativo: boolean }[]
  const unidadesOpt = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))

  // Índices REAIS do Banco Central (API SGS, cache 6h)  aba Cálculos (fim do mock acum12m).
  const indices = await indicesEconomicos()

  // Franquias com override de royalty (% e vencimento POR unidade  regra do CEO).
  const { data: ruRaw } = await sb.from('unidades')
    .select('id, nome, royalty_pct_override, venc_dia_override, tipo_loja')
    .not('bemp_salon_id', 'is', null).eq('ativa', true).order('nome')
  const royaltiesUnidade = (ruRaw ?? []) as RoyaltyUnidade[]

  // Fluxo de caixa DERIVADO do razão (fonte única)  visão inicial 'consolidado'; o seletor de
  // escopo na aba refaz via server action. Série de 6 meses + KPIs por status + composição.
  let fluxoSerie: FluxoSerie[] = []
  let fluxoResumo: FluxoResumo | null = null
  let fluxoComp: FluxoComp[] = []
  {
    const { ini, fim } = janelaFluxo(new Date())
    const esc = unidadeAtivaId ? 'unidades' : 'consolidado'
    const [serieR, resumoR, compR] = await Promise.all([
      sb.rpc('fin_fluxo', { p_ini: ini, p_fim: fim, p_escopo: esc, p_unidade: unidadeAtivaId }),
      sb.rpc('fin_fluxo_resumo', { p_escopo: esc, p_unidade: unidadeAtivaId }),
      sb.rpc('fin_fluxo_composicao', { p_escopo: esc, p_unidade: unidadeAtivaId }),
    ])
    const norm = normalizaFluxo(serieR.data, resumoR.data, compR.data)
    fluxoSerie = norm.serie; fluxoResumo = norm.resumo; fluxoComp = norm.composicao
  }

  return (
    <div className="view active">
      <FinanceiroTabs
        migracaoOk={migracaoOk}
        truncado={truncado}
        recebiveis={recebiveis}
        contasPagar={contasPagar}
        conciliacao={conciliacao}
        config={cfg}
        hojeISO={hojeISO}
        dre={dre}
        dreCompetencia={dreCompetencia}
        fluxoSerie={fluxoSerie}
        fluxoResumo={fluxoResumo}
        fluxoComp={fluxoComp}
        planoContas={planoContas}
        unidades={unidadesOpt}
        royaltiesUnidade={royaltiesUnidade}
        indices={indices}
        unidadeAtiva={unidadeAtivaId ? { id: unidadeAtivaId, nome: unidadeAtivaNome || 'Unidade' } : null}
        tabInicial={tabInicial as 'fluxo'}
      />
    </div>
  )
}
