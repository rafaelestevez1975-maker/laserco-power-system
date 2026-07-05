// Constantes puras (fora do 'use server': um arquivo de ações só pode exportar funções
// async — exportar este `const` de lá quebrava a página com erro do Next). Fonte única
// consumida pela action (validação) e pelo DescontosManager (dropdown).
export const TIPOS_DESCONTO = ['percentual', 'valor'] as const
export type TipoDesconto = (typeof TIPOS_DESCONTO)[number]
