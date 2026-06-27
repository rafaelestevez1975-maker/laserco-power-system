// Constantes/tipos/helpers do CATÁLOGO compartilhados entre Server Actions
// ('use server' só pode exportar funções async) e componentes client.
// Espelham as regras do legado (legacy/index.html: comTag, PGTO, openPacForm).

/** Timing de pagamento da comissão (legado SERVICOS[7]/PACOTES[5], comTag). */
export type PagarComissao = 'Venda' | 'Execução' | 'Não pagar'
export const PAGAR_COMISSAO_OPCOES: PagarComissao[] = ['Venda', 'Execução', 'Não pagar']

/** Cobertura de créditos de pacote (legado openPacForm pf_cob / PACOTES[1]). */
export type CoberturaCreditos = 'Qualquer unidade' | 'Unidade que realiza a venda'
export const COBERTURA_OPCOES: CoberturaCreditos[] = ['Qualquer unidade', 'Unidade que realiza a venda']

/** Tipos de forma de pagamento (legado pgForm `tipos`). */
export const TIPOS_PAGAMENTO = [
  'Crédito',
  'Débito',
  'PIX',
  'Dinheiro',
  'Link de Pagamento',
  'Boleto',
  'Transferência',
  'Crédito Recorrente',
] as const
export type TipoForma = (typeof TIPOS_PAGAMENTO)[number]

/** Espelha pgEhRecorrente do legado: a forma é Crédito Recorrente (PagoLivre). */
export function ehRecorrente(nome: string, tipo: string): boolean {
  return tipo === 'Crédito Recorrente' || /Crédito Recorrente/i.test(nome || '')
}
