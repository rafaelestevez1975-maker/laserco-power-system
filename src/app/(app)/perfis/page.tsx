import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { PerfisLista, type CargoRow } from '@/components/perfis/PerfisLista'

export const dynamic = 'force-dynamic'

/** Lista de cargos (perfis de acesso) + nº de permissões e nº de usuários por cargo.
 *  RBAC vive em tabelas service-role (igual resolveRecursos de lib/session) → adminClient. */
export default async function PerfisPage() {
  const ctx = await getSessionContext()
  const isAdmin = ehAdmin(ctx?.papel)
  const admin = adminClient()

  // bate_ponto pode não existir ainda (migration rbac.sql) — tolera a coluna ausente.
  const sel = 'id, nome, slug, descricao, is_sistema, ativo, atualizado_em, bate_ponto'
  let cargosRaw: unknown[] | null = null
  let temBatePonto = true
  {
    const r = await admin.from('cargos').select(sel)
      .order('is_sistema', { ascending: false }).order('nome', { ascending: true })
    if (r.error && /bate_ponto/.test(r.error.message)) {
      temBatePonto = false
      const r2 = await admin.from('cargos').select('id, nome, slug, descricao, is_sistema, ativo, atualizado_em')
        .order('is_sistema', { ascending: false }).order('nome', { ascending: true })
      cargosRaw = r2.data
    } else {
      cargosRaw = r.data
    }
  }
  const cargos = (cargosRaw ?? []) as CargoRow[]

  // Contagens agregadas (1 leitura cada) — montamos os mapas em memória.
  const [{ data: cpRaw }, { data: ucRaw }] = await Promise.all([
    admin.from('cargo_permissoes').select('cargo_id'),
    admin.from('usuario_cargos').select('cargo_id, ativo'),
  ])
  const permPorCargo: Record<string, number> = {}
  for (const r of (cpRaw ?? []) as { cargo_id: string }[]) {
    permPorCargo[r.cargo_id] = (permPorCargo[r.cargo_id] ?? 0) + 1
  }
  const usuariosPorCargo: Record<string, number> = {}
  for (const r of (ucRaw ?? []) as { cargo_id: string; ativo: boolean }[]) {
    if (r.ativo !== false) usuariosPorCargo[r.cargo_id] = (usuariosPorCargo[r.cargo_id] ?? 0) + 1
  }

  const sistema = cargos.filter((c) => c.is_sistema)
  const empresa = cargos.filter((c) => !c.is_sistema)
  const totalUsuariosVinc = Object.values(usuariosPorCargo).reduce((a, b) => a + b, 0)

  return (
    <PerfisLista
      cargos={cargos}
      sistemaCount={sistema.length}
      empresaCount={empresa.length}
      totalUsuariosVinc={totalUsuariosVinc}
      permPorCargo={permPorCargo}
      usuariosPorCargo={usuariosPorCargo}
      isAdmin={isAdmin}
      temBatePonto={temBatePonto}
    />
  )
}
