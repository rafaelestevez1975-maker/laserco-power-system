import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { UsuariosManager, type UsuarioRow, type CargoOpt } from '@/components/configuracoes/UsuariosManager'

export const dynamic = 'force-dynamic'

/**
 * Configurações → Usuários: ponto ÚNICO de criação/gestão de acesso.
 * Antes espalhado (Colaboradores/Perfis/SAC); agora um lugar só, onde o admin cria o usuário e
 * escolhe o Perfil de acesso (cargo) que define o que ele acessa. RBAC: só admin_geral.
 */
export default async function ConfigUsuariosPage() {
  const ctx = await getSessionContext()
  const isAdmin = ehAdmin(ctx?.papel)
  const admin = adminClient()

  // Usuários (perfis_usuario) + cargo atual (usuario_cargos ativo → cargos.nome).
  const [{ data: perfisRaw }, { data: cargosRaw }, { data: vincRaw }, { data: unidadesRaw }] = await Promise.all([
    admin.from('perfis_usuario').select('id, nome_completo, email, telefone, papel, unidade_id, ativo, status').order('nome_completo', { ascending: true }).limit(1000),
    admin.from('cargos').select('id, nome, slug, is_sistema, ativo').eq('ativo', true).order('is_sistema', { ascending: true }).order('nome', { ascending: true }),
    admin.from('usuario_cargos').select('perfil_id, cargo_id, ativo').eq('ativo', true),
    admin.from('unidades').select('id, nome').eq('ativa', true).order('nome', { ascending: true }),
  ])

  const cargos = (cargosRaw ?? []) as { id: string; nome: string; slug: string; is_sistema: boolean; ativo: boolean }[]
  const cargoNome = new Map(cargos.map((c) => [c.id, c.nome]))
  const cargoDoUsuario = new Map<string, string>()
  for (const v of (vincRaw ?? []) as { perfil_id: string; cargo_id: string; ativo: boolean }[]) {
    if (v.ativo !== false && !cargoDoUsuario.has(v.perfil_id)) cargoDoUsuario.set(v.perfil_id, v.cargo_id)
  }
  const unidades = (unidadesRaw ?? []) as { id: string; nome: string }[]
  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]))

  const usuarios: UsuarioRow[] = ((perfisRaw ?? []) as {
    id: string; nome_completo: string | null; email: string | null; telefone: string | null
    papel: string | null; unidade_id: string | null; ativo: boolean | null; status: string | null
  }[]).map((p) => {
    const cid = cargoDoUsuario.get(p.id) ?? null
    return {
      id: p.id, nome: p.nome_completo, email: p.email, telefone: p.telefone,
      papel: p.papel, cargoId: cid, cargoNome: cid ? (cargoNome.get(cid) ?? null) : null,
      unidadeNome: p.unidade_id ? (nomeUnidade.get(p.unidade_id) ?? null) : null,
      ativo: p.ativo, status: p.status,
    }
  })

  // Perfis de acesso p/ o dropdown: prioriza os de negócio (empresa), depois os do sistema.
  const cargoOpts: CargoOpt[] = cargos.map((c) => ({ id: c.id, nome: c.nome, sistema: c.is_sistema }))

  return (
    <UsuariosManager
      usuarios={usuarios}
      cargos={cargoOpts}
      unidades={unidades}
      isAdmin={isAdmin}
    />
  )
}
