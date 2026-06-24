/**
 * Helpers server-only em volta do Supabase — centralizam o que estava copiado
 * em todos os actions.ts. Ver docs/CONSOLIDACAO.md (D1/D2/D5/I5).
 */
import { createClient } from '@/lib/supabase/server'

export type SB = Awaited<ReturnType<typeof createClient>>

/** Traduz erro do Supabase: RLS/policy -> "Sem permissão para <oQue>."; senão a msg original (ou fallback). */
export function msgErro(error: { message?: string } | string | null | undefined, oQue: string): string {
  const m = typeof error === 'string' ? error : (error?.message ?? '')
  return /row-level|policy|permission|denied/i.test(m) ? `Sem permissão para ${oQue}.` : (m || `Falha ao ${oQue}.`)
}

export type Operador = { sb: SB; userId: string; nome: string; email: string; papel: string }

/** Garante usuário logado e devolve operador + client. Use no início de toda Server Action. */
export async function requireOperador(): Promise<{ op: Operador; error?: undefined } | { op: null; error: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { op: null, error: 'Sessão expirada.' }
  const { data } = await sb.from('perfis_usuario').select('nome_completo, email, papel').eq('id', user.id).single()
  const p = data as { nome_completo?: string; email?: string; papel?: string } | null
  return { op: { sb, userId: user.id, nome: p?.nome_completo || user.email || 'Usuário', email: p?.email || user.email || '', papel: p?.papel || 'colaborador' } }
}

/** Aplica filtro por unidade quando há unidade ativa (multitenant). No-op se activeUnitId for null. */
export function scopeUnidade<Q extends { eq(col: string, val: unknown): Q }>(q: Q, activeUnitId: string | null | undefined, col = 'unidade_id'): Q {
  return activeUnitId ? q.eq(col, activeUnitId) : q
}

/** Normaliza embed do Supabase (que vem como objeto OU array) para 1 registro. */
export function one<T>(embed: T | T[] | null | undefined): T | null {
  return Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null)
}
