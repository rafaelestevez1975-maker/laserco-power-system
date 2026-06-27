/**
 * Lib namespeada dos Dashboards (Financeiro/Gerencial/Funil).
 * Réplica fiel das fórmulas/regras do legado (legacy/index.html ~4440-4700):
 *  - royalties por unidade (10% do faturamento do mês anterior, venc. dia 10)
 *  - própria × franqueada (uniEhPropria: CNPJ da franqueadora)
 *  - FUNIL_DATA (segmentos Novos / Revenda / Todos) e tickets/ratios
 *  - presets de período do legado (REL_PERIODS) e defaults por dashboard
 * Pure / server-safe (sem 'use client', sem acesso a DB).
 */

// ── Própria × franqueada (legado uniEhPropria L6780) ──
// Lojas próprias têm o CNPJ da franqueadora (prefixo 44.442.908).
const CNPJ_FRANQUEADORA = '44.442.908'
const CNPJ_DIGITS_FRANQUEADORA = '44442908'

/** True quando a unidade é PRÓPRIA (CNPJ da franqueadora). Aceita CNPJ formatado ou só dígitos. */
export function uniEhPropria(cnpj: string | null | undefined): boolean {
  const c = (cnpj ?? '').trim()
  if (!c) return false
  if (c.startsWith(CNPJ_FRANQUEADORA)) return true
  return c.replace(/\D/g, '').startsWith(CNPJ_DIGITS_FRANQUEADORA)
}

/** True quando a unidade é FRANQUEADA (paga royalties). Sem CNPJ → trata como franqueada (legado). */
export function uniEhFranqueada(cnpj: string | null | undefined): boolean {
  return !uniEhPropria(cnpj)
}

// ── Royalties (legado FIN_CFG.royaltyPct L5020 + royaltiesUnidade L4581) ──
export const ROYALTY_PCT = 10 // % sobre o faturamento bruto do mês anterior
export const ROYALTY_VENC_DIA = 10 // vencimento sempre dia 10 do mês seguinte

export type Royalties = {
  franqueada: boolean
  /** faturamento do mês anterior (base do cálculo) */
  faturamentoMesAnterior: number
  pct: number
  /** valor de royalties a pagar (= faturamento × pct%) */
  valor: number
  /** data de vencimento dd/mm/aaaa (dia 10 do mês seguinte) */
  venc: string
}

function z2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Calcula os royalties da unidade a partir do faturamento REAL do mês anterior.
 * Réplica de royaltiesUnidade() do legado: 10% do faturamento do mês anterior,
 * vencimento dia 10 do mês seguinte. Loja própria não paga (valor=0, franqueada=false).
 */
export function calcRoyalties(
  cnpj: string | null | undefined,
  faturamentoMesAnterior: number,
  hoje: Date = new Date(),
): Royalties {
  const franqueada = uniEhFranqueada(cnpj)
  const valor = franqueada ? Math.round(faturamentoMesAnterior * ROYALTY_PCT) / 100 : 0
  const venc = new Date(hoje.getFullYear(), hoje.getMonth() + 1, ROYALTY_VENC_DIA)
  return {
    franqueada,
    faturamentoMesAnterior,
    pct: ROYALTY_PCT,
    valor,
    venc: `${z2(venc.getDate())}/${z2(venc.getMonth() + 1)}/${venc.getFullYear()}`,
  }
}

// ── Funil: segmentos Novos / Revenda / Todos (legado FUNIL_DATA L4450) ──
export type FunilSeg = 'novos' | 'revenda' | 'todos'

export type FunilSegData = {
  lab: string
  desc: string
  /** agendamentos */
  ag: number
  /** comparecimento */
  comp: number
  /** conversão (vendas) */
  conv: number
  /** ticket médio formatado e numérico */
  ticket: string
  ticketN: number
}

/**
 * Estrutura/ratio dos 3 segmentos do funil (Novos × Revenda × Todos).
 * Os números absolutos do legado são ilustrativos; aqui usamos os RATIOS do legado
 * (comparecimento/agendamento e conversão/comparecimento) e tickets reais do segmento,
 * escalando pelos AGENDAMENTOS reais do período para refletir a operação da unidade.
 */
export const FUNIL_RATIOS: Record<FunilSeg, { lab: string; desc: string; compRate: number; convRate: number; ticketN: number }> = {
  novos: {
    lab: 'Clientes novos',
    desc: 'Nunca compraram — agendam uma avaliação e é feita a 1ª venda.',
    compRate: 430 / 520, // legado: comp/ag
    convRate: 268 / 430, // legado: conv/comp
    ticketN: 1480,
  },
  revenda: {
    lab: 'Já clientes (revenda)',
    desc: 'Já compraram — retornam e fazem nova compra (revenda).',
    compRate: 610 / 720,
    convRate: 402 / 610,
    ticketN: 690,
  },
  todos: {
    lab: 'Todos (média dos dois)',
    desc: 'Soma dos clientes novos + revenda; ticket é a média ponderada.',
    compRate: 1040 / 1240,
    convRate: 670 / 1040,
    ticketN: 1010,
  },
}

export const FUNIL_SEGS: { slug: FunilSeg; label: string; icon: string }[] = [
  { slug: 'novos', label: 'Clientes novos', icon: 'ti-user-plus' },
  { slug: 'revenda', label: 'Já clientes (revenda)', icon: 'ti-rotate' },
  { slug: 'todos', label: 'Todos (média)', icon: 'ti-users-group' },
]

/** % inteiro a/b (réplica do pct() do legado). */
export function pctInt(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

// ── Presets de período do legado (REL_PERIODS L4208) ──
// 8 presets; default financeiro = 'mes', demais = '30d'.
export const REL_PERIODOS_FULL: [string, string][] = [
  ['hoje', 'Hoje'],
  ['ontem', 'Ontem'],
  ['semana_passada', 'Semana passada'],
  ['30d', 'Últimos 30 dias'],
  ['mes', 'Mês atual'],
  ['mes_passado', 'Mês passado'],
  ['ano', 'Este ano'],
  ['custom', 'Período…'],
]

// ── Tipo de unidade no funil (legado rfUni L4216) ──
export const FUNIL_TIPO_UNI: [string, string][] = [
  ['ambas', 'Ambas (próprias + franquias)'],
  ['proprias', 'Somente próprias'],
  ['franquias', 'Somente franquias'],
]
