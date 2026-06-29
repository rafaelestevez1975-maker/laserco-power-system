import { cache } from 'react'
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
  /** Nível dentro do SAC (pelo cargo) p/ filtrar o submenu; null se não for cargo SAC. */
  sacNivel: SacNivel
}

const ADMIN_PAPEL = 'admin_geral'

/** Busca os cargos do usuário (1 round-trip). Separado para rodar em PARALELO
 *  com as demais consultas do contexto (perfil, unidades). */
async function fetchCargos(userId: string): Promise<{ ids: string[]; slugs: string[] }> {
  try {
    const admin = adminClient()
    // Traz o slug do cargo no MESMO SELECT (embed) — sem round-trip extra — p/ derivar o nível SAC.
    const { data: ucs } = await admin.from('usuario_cargos').select('cargo_id, cargos(slug)').eq('perfil_id', userId)
    const rows = (ucs ?? []) as Array<{ cargo_id: string; cargos: { slug?: string } | { slug?: string }[] | null }>
    const slugs = rows.flatMap((r) => {
      const c = r.cargos
      const arr = Array.isArray(c) ? c : c ? [c] : []
      return arr.map((x) => x.slug).filter(Boolean) as string[]
    })
    return { ids: rows.map((r) => r.cargo_id), slugs }
  } catch {
    return { ids: [], slugs: [] }
  }
}

export type SacNivel = 'supervisor' | 'consulta' | 'atendente' | null
/** Nível dentro do SAC pelo cargo (supervisor vê tudo; atendente só o operacional; consulta leitura). */
function nivelSac(slugs: string[]): SacNivel {
  if (slugs.includes('supervisor_sac')) return 'supervisor'
  if (slugs.includes('atendente_sac')) return 'atendente'
  if (slugs.includes('consulta_sac')) return 'consulta'
  return null
}

/** Resolve os recursos a partir dos cargos já buscados: cargo_permissoes → permissoes.
 *  Usa service-role (server-only) para não depender de RLS nas tabelas de RBAC. */
async function resolveRecursos(cargoIds: string[]): Promise<string[]> {
  try {
    if (cargoIds.length === 0) return []
    const admin = adminClient()
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

// Memoizado por request (React cache): o layout, a página, o ComunicadosGate e qualquer
// componente/action que chame getSessionContext no MESMO render compartilham UMA execução
// (1 auth.getUser + 1 lote de queries) em vez de N. Era o maior gargalo de navegação.
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  // As 3 consultas abaixo dependem só de user.id (não uma da outra) → rodam em PARALELO.
  // Antes eram sequenciais (perfil → cargos → unidades), pagando 1 round-trip cada
  // em TODA navegação autenticada. Em paralelo, o custo cai para ~1 round-trip + a
  // resolução final de permissões.
  const [perfilRes, cargos, unidadesRes] = await Promise.all([
    sb
      .from('perfis_usuario')
      .select('nome_completo, email, papel, unidade_id')
      .eq('id', user.id)
      .single(),
    fetchCargos(user.id),
    // Unidades que o usuário enxerga (RLS aplica). Nomes vêm com lixo de migração
    // (prefixo [INATIVA], espaços) → limpamos para exibição.
    sb
      .from('unidades')
      .select('id, nome')
      .eq('ativa', true)
      .order('nome', { ascending: true }),
  ])

  const perfil = perfilRes.data
  const unidadesRaw = unidadesRes.data
  const cargoIds = cargos.ids

  const p = perfil as { nome_completo?: string; email?: string; papel?: string; unidade_id?: string | null } | null
  const nome = p?.nome_completo ?? user.email?.split('@')[0] ?? 'Usuário'
  const email = p?.email ?? user.email ?? ''
  const papel = p?.papel ?? 'colaborador'
  const isAdmin = papel === ADMIN_PAPEL
  const iniciais = nome.split(' ').slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'U'

  const recursos = isAdmin ? [] : await resolveRecursos(cargoIds)

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

  return { nome, email, iniciais, papel, isAdmin, recursos, unidades, activeUnitId, activeUnitName, sacNivel: nivelSac(cargos.slugs) }
})
