import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

/**
 * Contexto de sessão (backend lkii): usuário + papel + unidades visíveis.
 * Modelo real: empresas → unidades; perfis_usuario(papel, unidade_id).
 * `papel='admin_geral'` = administrador geral da franqueadora (vê tudo).
 * As unidades vêm filtradas pela RLS do Supabase (cada perfil só enxerga o que pode).
 */
export type Unidade = { id: string; nome: string }

export type SessionContext = {
  nome: string
  email: string
  iniciais: string
  papel: string
  isAdmin: boolean
  /** recurso_id que o usuário pode acessar (via cargos→permissões). admin_geral = todos. */
  recursos: string[]
  unidades: Unidade[]
  activeUnitId: string | null
  activeUnitName: string
}

const ADMIN_PAPEL = 'admin_geral'

/** Resolve os recursos do usuário: usuario_cargos → cargo_permissoes → permissoes.
 *  Usa service-role (server-only) para não depender de RLS nas tabelas de RBAC. */
async function resolveRecursos(userId: string): Promise<string[]> {
  try {
    const admin = adminClient()
    const { data: ucs } = await admin.from('usuario_cargos').select('cargo_id').eq('perfil_id', userId)
    const cargoIds = (ucs ?? []).map((r: { cargo_id: string }) => r.cargo_id)
    if (cargoIds.length === 0) return []
    const { data: cps } = await admin
      .from('cargo_permissoes')
      .select('permissoes(recurso_id)')
      .in('cargo_id', cargoIds)
    const set = new Set<string>()
    // O embed pode vir como objeto (to-one) ou array, dependendo da inferência  tratamos os dois.
    for (const row of (cps ?? []) as Array<Record<string, unknown>>) {
      const perm = row.permissoes as { recurso_id?: string } | Array<{ recurso_id?: string }> | null | undefined
      const arr = Array.isArray(perm) ? perm : perm ? [perm] : []
      for (const x of arr) { if (x?.recurso_id) set.add(x.recurso_id) }
    }
    return [...set]
  } catch {
    return []
  }
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data: perfil } = await sb
    .from('perfis_usuario')
    .select('nome_completo, email, papel, unidade_id')
    .eq('id', user.id)
    .single()

  const p = perfil as { nome_completo?: string; email?: string; papel?: string; unidade_id?: string | null } | null
  const nome = p?.nome_completo ?? user.email?.split('@')[0] ?? 'Usuário'
  const email = p?.email ?? user.email ?? ''
  const papel = p?.papel ?? 'colaborador'
  const isAdmin = papel === ADMIN_PAPEL
  const iniciais = nome.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'U'

  const recursos = isAdmin ? [] : await resolveRecursos(user.id)

  // Unidades que o usuário enxerga (RLS aplica). Nomes vêm com lixo de migração
  // (prefixo [INATIVA], espaços)  limpamos para exibição.
  const { data: unidadesRaw } = await sb
    .from('unidades')
    .select('id, nome')
    .eq('ativa', true)
    .order('nome', { ascending: true })

  const unidades: Unidade[] = (unidadesRaw ?? [])
    .map((u: { id: string; nome: string }) => ({ id: u.id, nome: (u.nome ?? '').trim() }))
    .filter((u) => u.nome && !u.nome.startsWith('[INATIVA]'))

  // Unidade ativa: cookie (se permitida) > unidade do perfil > nenhuma (= todas).
  const ck = (await cookies()).get('lc_unit')?.value
  const allowed = new Set(unidades.map((u) => u.id))
  let activeUnitId: string | null = ck && allowed.has(ck) ? ck : p?.unidade_id ?? null
  if (activeUnitId && !allowed.has(activeUnitId)) activeUnitId = null

  const activeUnitName = activeUnitId
    ? unidades.find((u) => u.id === activeUnitId)?.nome ?? 'Unidade'
    : 'Todas as unidades'

  return { nome, email, iniciais, papel, isAdmin, recursos, unidades, activeUnitId, activeUnitName }
}
