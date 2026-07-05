// Constantes puras (fora do 'use server'). Consumidas pela action (validação) e pelo
// PermissoesGrid. Exportar este `const` de dentro do actions.ts quebrava a tela.
/** Escopos válidos, do mais restrito ao mais amplo (ordem usada no editor). */
export const ESCOPOS = ['proprio', 'unidade', 'empresa', 'global'] as const
export type Escopo = (typeof ESCOPOS)[number]
