/**
 * Lib namespeada de Comissões — tipos + conversão entre a LINHA do banco
 * (matriz_comissoes) e o modelo de UI (ComCat). Client-safe (sem 'use server'),
 * usada tanto pela page (RSC) quanto pelo board (client) e pelas server actions.
 *
 * Espelho fiel de COM_CATS do legado (legacy/index.html ~7324). A tabela
 * matriz_comissoes guarda uma linha por categoria (ver scripts/migrations/comissoes.sql).
 */

export type ComBaseItem = { on: boolean; pct: number }
export type ComCat = {
  /** id da linha no banco (undefined = categoria nova ainda não salva). */
  id?: string
  nome: string
  /** cargo do backend correspondente (para o simulador casar colaborador → categoria). */
  cargo?: string | null
  base: { individual: ComBaseItem; loja: ComBaseItem; sessao: ComBaseItem }
  /** Parte 1 · adicional por dezena (sobre a premiação base). */
  tiers: { t80: number; t100: number; t120: number; t130: number }
  /** Parte 2 · adicional no fechamento do mês (sobre o valor final da unidade). */
  fech: { f100: number; f120: number; f130: number }
}

/** Forma da linha na tabela matriz_comissoes. */
export type MatrizRow = {
  id: string
  nome: string
  cargo: string | null
  ordem: number | null
  base_individual_on: boolean
  base_individual_pct: number
  base_loja_on: boolean
  base_loja_pct: number
  base_sessao_on: boolean
  base_sessao_pct: number
  tier_t80: number
  tier_t100: number
  tier_t120: number
  tier_t130: number
  fech_f100: number
  fech_f120: number
  fech_f130: number
}

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

/** Linha do banco → modelo de UI. */
export function rowToCat(r: MatrizRow): ComCat {
  return {
    id: r.id,
    nome: r.nome,
    cargo: r.cargo,
    base: {
      individual: { on: !!r.base_individual_on, pct: n(r.base_individual_pct) },
      loja: { on: !!r.base_loja_on, pct: n(r.base_loja_pct) },
      sessao: { on: !!r.base_sessao_on, pct: n(r.base_sessao_pct) },
    },
    tiers: { t80: n(r.tier_t80), t100: n(r.tier_t100), t120: n(r.tier_t120), t130: n(r.tier_t130) },
    fech: { f100: n(r.fech_f100), f120: n(r.fech_f120), f130: n(r.fech_f130) },
  }
}

/** Modelo de UI → colunas para insert/update (sem id/empresa_id). */
export function catToColumns(c: ComCat, ordem: number) {
  return {
    nome: (c.nome || '').trim() || 'Categoria',
    cargo: c.cargo || null,
    ordem,
    base_individual_on: !!c.base.individual.on,
    base_individual_pct: n(c.base.individual.pct),
    base_loja_on: !!c.base.loja.on,
    base_loja_pct: n(c.base.loja.pct),
    base_sessao_on: !!c.base.sessao.on,
    base_sessao_pct: n(c.base.sessao.pct),
    tier_t80: n(c.tiers.t80),
    tier_t100: n(c.tiers.t100),
    tier_t120: n(c.tiers.t120),
    tier_t130: n(c.tiers.t130),
    fech_f100: n(c.fech.f100),
    fech_f120: n(c.fech.f120),
    fech_f130: n(c.fech.f130),
  }
}

/** Colunas selecionadas da tabela (para o .select()). */
export const MATRIZ_COLS =
  'id, nome, cargo, ordem, base_individual_on, base_individual_pct, base_loja_on, base_loja_pct, base_sessao_on, base_sessao_pct, tier_t80, tier_t100, tier_t120, tier_t130, fech_f100, fech_f120, fech_f130'
