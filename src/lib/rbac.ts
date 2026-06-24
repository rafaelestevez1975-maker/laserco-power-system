/**
 * Checagem de papel (RBAC grosso) compartilhada. Ver docs/CONSOLIDACAO.md (I1).
 * O `admin_geral` (franqueadora) sempre passa. A RLS do Supabase é a 2ª linha de defesa.
 */
export const PAPEL_ADMIN = 'admin_geral'

export function ehAdmin(papel: string | null | undefined): boolean {
  return papel === PAPEL_ADMIN
}

/** admin sempre passa; senão o papel precisa estar entre os aceitos. */
export function temPapel(papel: string | null | undefined, ...aceitos: string[]): boolean {
  return !!papel && (papel === PAPEL_ADMIN || aceitos.includes(papel))
}

/** Para usar no topo de Server Actions sensíveis. Retorna mensagem de erro ou null se ok. */
export function exigirPapel(papel: string | null | undefined, aceitos: string[], oQue = 'esta ação'): string | null {
  return temPapel(papel, ...aceitos) ? null : `Você não tem permissão para ${oQue}.`
}
