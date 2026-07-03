/**
 * Matriz de comissões  fiel ao legado buildComissoes / COM_CATS (legacy/index.html ~7324..7460).
 *
 * A matriz agora PERSISTE na tabela matriz_comissoes (scripts/migrations/comissoes.sql).
 * Este arquivo guarda o SEED de fallback (igual ao legado) usado APENAS quando a tabela
 * ainda não foi aplicada/está vazia  nesse caso o board mostra banner de empty-state.
 *
 * Cada categoria mapeia (por nome/cargo) a um cargo do enum `cargo_colaborador`
 * (gerente | subgerente | consultora_vendas | aplicadora) quando aplicável  usado pelo
 * simulador para pré-selecionar a categoria ao escolher um colaborador real.
 */

import type { ComCat } from '@/lib/comissoes'

export type { ComBaseItem, ComCat } from '@/lib/comissoes'

/** Ticket médio de uma sessão executada (legado SESSAO_TICKET). */
export const SESSAO_TICKET = 250
/** Meta mínima/cheia da unidade no mês (legado META_UNIDADE). */
export const META_UNIDADE = 100000

/** Divisor de período → rótulo (legado PERIODO_LBL). 1=mês, 2=quinzena, 3=dezena. */
export const PERIODO_LBL: Record<number, string> = { 1: 'mês', 2: 'quinzena', 3: 'dezena' }

/** Seed da matriz  espelho exato do COM_CATS do legado, com cargo do backend mapeado. */
export const COM_CATS_SEED: ComCat[] = [
  { nome: 'Gerente', cargo: 'gerente', base: { individual: { on: true, pct: 2 }, loja: { on: true, pct: 1.5 }, sessao: { on: false, pct: 0 } }, tiers: { t80: 10, t100: 25, t120: 50, t130: 65 }, fech: { f100: 1, f120: 2, f130: 3 } },
  { nome: 'Sub Gerente', cargo: 'subgerente', base: { individual: { on: true, pct: 1.5 }, loja: { on: true, pct: 1 }, sessao: { on: false, pct: 0 } }, tiers: { t80: 8, t100: 20, t120: 40, t130: 55 }, fech: { f100: 0.8, f120: 1.5, f130: 2.5 } },
  { nome: 'Profissional da Saúde', cargo: 'aplicadora', base: { individual: { on: false, pct: 0 }, loja: { on: false, pct: 0 }, sessao: { on: true, pct: 5 } }, tiers: { t80: 5, t100: 15, t120: 30, t130: 40 }, fech: { f100: 0.5, f120: 1, f130: 1.5 } },
  { nome: 'Consultoras de Vendas', cargo: 'consultora_vendas', base: { individual: { on: true, pct: 3 }, loja: { on: true, pct: 1 }, sessao: { on: false, pct: 0 } }, tiers: { t80: 10, t100: 25, t120: 50, t130: 65 }, fech: { f100: 1, f120: 2, f130: 3 } },
  { nome: 'Atendente (SAC)', cargo: null, base: { individual: { on: true, pct: 2 }, loja: { on: false, pct: 0 }, sessao: { on: false, pct: 0 } }, tiers: { t80: 10, t100: 25, t120: 50, t130: 65 }, fech: { f100: 0.5, f120: 1, f130: 1.5 } },
]

/**
 * Rótulo amigável do cargo do backend → exibido no simulador. Inclui os cargos
 * ampliados (SAC, Proprietário, Profissional) do legado para a pré-seleção casar.
 */
export const CARGO_LABEL: Record<string, string> = {
  gerente: 'Gerente',
  subgerente: 'Sub Gerente',
  consultora_vendas: 'Consultoras de Vendas',
  aplicadora: 'Profissional da Saúde',
  profissional: 'Profissional da Saúde',
  sac: 'Atendente (SAC)',
  proprietario: 'Gerente',
}

/**
 * Mapa cargo do colaborador → NOME da categoria da matriz (legado simPickColab,
 * que casa por catNome). Cargos não-mapeáveis a um cargo de matriz (SAC,
 * Proprietário, Profissional) caem aqui por NOME para pré-selecionar a categoria.
 */
export const CARGO_TO_CAT_NOME: Record<string, string> = {
  gerente: 'Gerente',
  subgerente: 'Sub Gerente',
  consultora_vendas: 'Consultoras de Vendas',
  aplicadora: 'Profissional da Saúde',
  profissional: 'Profissional da Saúde',
  sac: 'Atendente (SAC)',
  proprietario: 'Gerente',
}

export const money = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')

/** Colaborador real (do backend) para alimentar o filtro do simulador. */
export type SimColaborador = { id: string; nome: string; cargo: string | null; unidadeNome: string }
