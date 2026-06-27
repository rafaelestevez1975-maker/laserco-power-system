/** Limite duro de linhas por exportação (escopado por unidade ativa).
 *  Fica aqui (e não em actions.ts) porque arquivo 'use server' só pode exportar
 *  funções async — constantes/valores precisam vir de um módulo comum. */
export const EXPORT_LIMIT = 5000
