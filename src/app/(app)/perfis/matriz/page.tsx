import { redirect } from 'next/navigation'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { MatrizPermissoes } from '@/components/perfis/MatrizPermissoes'

export const dynamic = 'force-dynamic'

// Ordem fixa das ações (colunas dentro de cada recurso) e rótulos curtos.
const ACOES = ['ler', 'criar', 'editar', 'deletar', 'aprovar', 'exportar', 'admin']
const ACAO_LABEL: Record<string, string> = {
  ler: 'Ver', criar: 'Criar', editar: 'Editar', deletar: 'Excluir', aprovar: 'Aprovar', exportar: 'Exportar', admin: 'Admin',
}

/** Matriz de permissões estilo ABV: recurso × ação nas linhas (agrupado por módulo), TODOS os
 *  cargos nas colunas, checkbox = o cargo tem aquela permissão. Salva reaproveitando
 *  salvarPermissoesCargo (por cargo). RBAC vive em tabelas service-role → adminClient. Só admin. */
export default async function MatrizPage() {
  const ctx = await getSessionContext()
  if (!ehAdmin(ctx?.papel)) redirect('/perfis')
  const admin = adminClient()

  const [{ data: recRaw }, { data: cargosRaw }, { data: permsRaw }, { data: cpRaw }] = await Promise.all([
    admin.from('recursos').select('id, nome, modulo').order('modulo', { ascending: true }).order('id', { ascending: true }),
    admin.from('cargos').select('id, nome, slug, is_sistema').neq('slug', 'super_admin').order('is_sistema', { ascending: false }).order('nome', { ascending: true }),
    admin.from('permissoes').select('id, recurso_id, acao_id'),
    admin.from('cargo_permissoes').select('cargo_id, permissao_id'),
  ])

  const recursos = (recRaw ?? []) as { id: string; nome: string; modulo: string | null }[]
  const cargos = (cargosRaw ?? []) as { id: string; nome: string; slug: string; is_sistema: boolean }[]
  const perms = (permsRaw ?? []) as { id: string; recurso_id: string; acao_id: string }[]
  const cps = (cpRaw ?? []) as { cargo_id: string; permissao_id: string }[]

  // permissao_id → "recurso|acao"
  const parDaPerm = new Map<string, string>()
  for (const p of perms) parDaPerm.set(p.id, `${p.recurso_id}|${p.acao_id}`)
  // checked[cargoId] = ["recurso|acao", ...] (o cargo tem ALGUMA permissão desse par)
  const sets = new Map<string, Set<string>>()
  for (const cp of cps) {
    const par = parDaPerm.get(cp.permissao_id)
    if (!par) continue
    const s = sets.get(cp.cargo_id) ?? new Set<string>()
    s.add(par)
    sets.set(cp.cargo_id, s)
  }
  const checked: Record<string, string[]> = {}
  for (const [cid, s] of sets) checked[cid] = [...s]

  // recursos agrupados por módulo
  const byMod = new Map<string, { id: string; nome: string }[]>()
  for (const r of recursos) {
    const m = r.modulo || 'outros'
    byMod.set(m, [...(byMod.get(m) ?? []), { id: r.id, nome: r.nome }])
  }
  const modulos = [...byMod.entries()].map(([modulo, recs]) => ({ modulo, recursos: recs }))

  return <MatrizPermissoes cargos={cargos} acoes={ACOES} acaoLabel={ACAO_LABEL} modulos={modulos} checked={checked} />
}
