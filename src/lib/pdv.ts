/**
 * Regras de PDV / Nova Venda portadas do legado (legacy/index.html: DESC_LIMIT 5793,
 * CORTESIA_* 5824). O legado define alçada por *cargo*; o backend lkii expõe um `papel`
 * mais grosso (admin_geral/gestor/operacoes/colaborador), então mapeamos papel → limite.
 *
 * Mapeamento (documentado p/ o cliente revisar — o legado tem painel admin de alçadas):
 *   admin_geral → 100%  (Administrador/Proprietário)
 *   gestor      →  25%  (Gerente de Campo)
 *   operacoes   →  10%  (SAC/Consultora — pega a alçada mais permissiva do operacional)
 *   colaborador →   5%  (Consultora de Vendas / Profissional)
 *
 * Quando existir alçada por cargo real (usuario_cargos), trocar este mapa por consulta.
 */
export const DESC_LIMIT_POR_PAPEL: Record<string, number> = {
  admin_geral: 100,
  gestor: 25,
  operacoes: 10,
  colaborador: 5,
}

/** Limite de desconto (%) que o papel pode conceder sem aprovação do gestor. */
export function descLimitFor(papel: string | null | undefined): number {
  return DESC_LIMIT_POR_PAPEL[papel ?? ''] ?? 5
}

/** Teto mensal de cortesias (desconto 100%) por unidade, em R$. Legado: CORTESIA_LIMIT_MES. */
export const CORTESIA_LIMIT_MES = 2000

/** Formas de pagamento do PDV → método aceito em os_pagamentos (CHECK do lkii). */
export const FORMAS_PDV: { value: string; label: string; metodo: string }[] = [
  { value: 'pix', label: 'PIX', metodo: 'pix' },
  { value: 'dinheiro', label: 'Dinheiro', metodo: 'dinheiro' },
  { value: 'debito', label: 'Cartão de Débito', metodo: 'cartao_debito' },
  { value: 'credito', label: 'Cartão de Crédito', metodo: 'cartao_credito' },
  { value: 'link', label: 'Link de Pagamento', metodo: 'outros' },
  { value: 'recorrente', label: 'Crédito Recorrente (PagoLivre)', metodo: 'credito_recorrente' },
]

/** Parcelas oferecidas no PDV (legado: 1x/2x/3x/4x/6x/10x/12x). */
export const PARCELAS_PDV = [1, 2, 3, 4, 6, 10, 12]

/** Início (00:00) do mês de uma data ISO — usado no teto mensal de cortesias. */
export function inicioDoMes(isoDate: string): string {
  // isoDate = 'YYYY-MM-DD...' → 'YYYY-MM-01T00:00:00'
  return `${isoDate.slice(0, 7)}-01T00:00:00`
}
