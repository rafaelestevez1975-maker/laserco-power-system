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

/** Conta linhas de uma tabela aplicando filtros — head:true (zero linhas transferidas). */
export async function contar(sb: SB, tabela: string, opts: CountOpts = {}): Promise<number> {
  let q = sb.from(tabela).select('id', { count: 'exact', head: true })
  for (const [c, v] of Object.entries(opts.eq ?? {})) q = q.eq(c, v)
  if (opts.unidadeId) q = q.eq(opts.unidadeCol ?? 'unidade_id', opts.unidadeId)
  if (opts.dateCol && opts.gte) q = q.gte(opts.dateCol, opts.gte)
  if (opts.dateCol && opts.lt) q = q.lt(opts.dateCol, opts.lt)
  const { count } = await q
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
export type LancMin = { valor: number | null; categoria_id: string | null; data_competencia: string | null }

const SUM_CAP = 20000
const PAGE = 1000

/**
 * Pagina lançamentos (só valor/categoria/data) com filtros — usado p/ somar receita
 * por categoria e por mês. 12.9k linhas no total; com filtro de período fica enxuto.
 * Caps em SUM_CAP p/ não estourar caso o período não seja informado.
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
      .select('valor, categoria_id, data_competencia')
      .eq('tipo', tipo)
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    if (iniYmd) q = q.gte('data_competencia', iniYmd)
    if (fimYmd) q = q.lt('data_competencia', fimYmd)
    const { data } = await q.range(from, from + PAGE - 1)
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
