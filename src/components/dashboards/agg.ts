/**
 * Helpers de agregação server-side para os dashboards.
 * REGRA DE OURO: nunca puxar linhas cruas em massa (agendamentos=136k, clientes=347k).
 * Tudo aqui usa `count:'exact', head:true` (conta no servidor, transfere zero linhas)
 * OU paginação enxuta de colunas pequenas (lancamentos=12.9k, valor+categoria+data).
 */
import type { createClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createClient>>

/** Filtro genérico aplicável a uma query de count. */
export type CountOpts = {
  /** col=>val (eq). ex.: { status: 'concluido' } */
  eq?: Record<string, string>
  unidadeId?: string | null
  /** coluna de data usada nos filtros de período */
  dateCol?: string
  gte?: string | null
  lt?: string | null
  /** quando true, escopo por unidade usa essa coluna (ex.: clientes => unidade_origem_id) */
  unidadeCol?: string
}

/**
 * Erro de agregação de dashboard — lançado quando o Supabase devolve `{ error }`.
 * Garante que o dashboard NÃO mostre 0/valores parciais silenciosos (reclamação de
 * "números que não batem"): a tela cai no error boundary com aviso real em vez de fingir zero.
 */
export class DashAggError extends Error {
  constructor(public tabela: string, public causa: string) {
    super(`Falha ao consultar "${tabela}": ${causa}`)
    this.name = 'DashAggError'
  }
}

/** Conta linhas de uma tabela aplicando filtros — head:true (zero linhas transferidas). */
export async function contar(sb: SB, tabela: string, opts: CountOpts = {}): Promise<number> {
  let q = sb.from(tabela).select('id', { count: 'exact', head: true })
  for (const [c, v] of Object.entries(opts.eq ?? {})) q = q.eq(c, v)
  if (opts.unidadeId) q = q.eq(opts.unidadeCol ?? 'unidade_id', opts.unidadeId)
  if (opts.dateCol && opts.gte) q = q.gte(opts.dateCol, opts.gte)
  if (opts.dateCol && opts.lt) q = q.lt(opts.dateCol, opts.lt)
  const { count, error } = await q
  if (error) throw new DashAggError(tabela, error.message)
  return count ?? 0
}

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Rótulo curto "mai/26" a partir de 'YYYY-MM'. */
export function rotuloMes(ym: string): string {
  const [y, m] = ym.split('-')
  return `${MESES_CURTO[Number(m) - 1] ?? m}/${y.slice(2)}`
}

/** Lista os N meses até `fim` (exclusivo) como ['YYYY-MM', ...] em ordem cronológica. */
export function ultimosMeses(fimYmd: string | null, n: number, hoje = new Date()): { ym: string; ini: string; fim: string }[] {
  // âncora = primeiro dia do mês de `fim` (ou do mês corrente se não houver limite).
  const base = fimYmd ? new Date(fimYmd + 'T00:00:00') : hoje
  const out: { ym: string; ini: string; fim: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const d2 = new Date(base.getFullYear(), base.getMonth() - i + 1, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    out.push({ ym, ini: ymd(d), fim: ymd(d2) })
  }
  return out
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Linha mínima de lançamento (só colunas baratas). */
export type LancMin = {
  valor: number | null
  categoria_id: string | null
  data_competencia: string | null
  status?: string | null
  forma_pagamento?: string | null
}

const SUM_CAP = 20000
const PAGE = 1000

/**
 * Pagina lançamentos (valor/categoria/data + status + forma de pagamento) com filtros —
 * usado p/ somar receita/despesa por categoria, mês, status (previsto×realizado) e forma.
 * 12.9k linhas no total; com filtro de período fica enxuto. Caps em SUM_CAP.
 */
export async function pullLancamentos(
  sb: SB,
  tipo: 'receita' | 'despesa',
  unidadeId: string | null,
  iniYmd: string | null,
  fimYmd: string | null,
): Promise<{ rows: LancMin[]; capped: boolean }> {
  const out: LancMin[] = []
  let from = 0
  let capped = false
  for (;;) {
    let q = sb
      .from('lancamentos_financeiros')
      .select('valor, categoria_id, data_competencia, status, forma_pagamento')
      .eq('tipo', tipo)
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniYmd) q = q.gte('data_competencia', iniYmd)
    if (fimYmd) q = q.lt('data_competencia', fimYmd)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new DashAggError('lancamentos_financeiros', error.message)
    const batch = (data ?? []) as LancMin[]
    out.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
    if (out.length >= SUM_CAP) {
      capped = true
      break
    }
  }
  return { rows: out, capped }
}

/** Soma valor das linhas. */
export function somaLanc(rows: LancMin[]): number {
  return rows.reduce((a, r) => a + (r.valor || 0), 0)
}

/** Soma só as linhas com status 'pago' (realizado). As demais = previsto/em aberto. */
export function somaRealizado(rows: LancMin[]): number {
  return rows.reduce((a, r) => a + (r.status === 'pago' ? r.valor || 0 : 0), 0)
}

/** Agrupa valor por uma chave string (ex.: categoria_id, forma_pagamento), descartando nulos. */
export function somaPorChave(rows: LancMin[], chave: (r: LancMin) => string | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = chave(r)
    if (!k) continue
    m.set(k, (m.get(k) || 0) + (r.valor || 0))
  }
  return m
}

/** Agregado por serviço: faturamento + sessões (qtd) — para o ranking do gerencial. */
export type ServAgg = { nome: string; faturamento: number; sessoes: number }

/**
 * Agrega faturamento e sessões por serviço a partir de os_servicos (filtrado pelos os_ids
 * já escopados por unidade/período). Embute servicos(nome). Paginação enxuta (in os_id),
 * sem nunca puxar a tabela inteira. Réplica real do SERV_FULL ilustrativo do legado.
 */
export async function pullServicosPorOS(sb: SB, osIds: string[]): Promise<ServAgg[]> {
  if (osIds.length === 0) return []
  const acc = new Map<string, { faturamento: number; sessoes: number }>()
  // Processa em lotes de até 800 os_ids (limite seguro p/ filtro IN).
  for (let i = 0; i < osIds.length; i += 800) {
    const chunk = osIds.slice(i, i + 800)
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('os_servicos')
        .select('servico_id, quantidade, preco_total, total, servicos(nome)')
        .in('os_id', chunk)
        .range(from, from + PAGE - 1)
      if (error) throw new DashAggError('os_servicos', error.message)
      const batch = (data ?? []) as Array<{
        servico_id: string | null
        quantidade: number | null
        preco_total: number | null
        total: number | null
        servicos: { nome: string | null } | { nome: string | null }[] | null
      }>
      for (const r of batch) {
        const emb = Array.isArray(r.servicos) ? r.servicos[0] : r.servicos
        const nome = emb?.nome || (r.servico_id ? 'Serviço ' + r.servico_id.slice(0, 6) : 'Sem serviço')
        const fat = Number(r.total ?? r.preco_total) || 0
        const sess = Number(r.quantidade) || 1
        const cur = acc.get(nome) || { faturamento: 0, sessoes: 0 }
        cur.faturamento += fat
        cur.sessoes += sess
        acc.set(nome, cur)
      }
      if (batch.length < PAGE) break
      from += PAGE
    }
  }
  return [...acc.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.faturamento - a.faturamento)
}

/**
 * Faturamento (receita) realizado do MÊS ANTERIOR de uma unidade — base p/ royalties.
 * Conta só `status='pago'` (faturamento de fato), via paginação enxuta do mês anterior.
 */
export async function faturamentoMesAnterior(sb: SB, unidadeId: string | null, hoje: Date = new Date()): Promise<number> {
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const iniYmd = `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-01`
  const fimYmd = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-01`
  const { rows } = await pullLancamentos(sb, 'receita', unidadeId, iniYmd, fimYmd)
  return somaRealizado(rows)
}
