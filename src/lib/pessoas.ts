/**
 * Fonte ÚNICA de "pessoas" do sistema. Pessoa = perfis_usuario (login+papel)
 * ligado ao registro de RH colaboradores via colaboradores.perfil_id.
 * Atendente / Colaborador / Usuário são VISÕES da mesma pessoa.
 * Ver memory project-laserco-people-model + docs/CONSOLIDACAO.md.
 * Server-only (recebe o client `sb`).
 */
import type { SB } from '@/lib/sb'

/** Atendentes do SAC = papel 'sac' (cargos atendente/supervisor/consulta). O admin_geral NÃO
 *  entra: tem acesso total ao SAC, mas não é "atendente" → fora do ranking/premiação e da fila
 *  de distribuição (pedido do Julio, 29/06). */
export const PAPEIS_SAC = ['sac']

export type Pessoa = {
  id: string            // perfis_usuario.id — é a CHAVE de atribuição (sac_tickets.atribuido_para / sac_whatsapp_chats.atendente_id)
  nome: string
  papel: string
  unidadeId: string | null
  email: string | null
  cargo: string | null  // do registro de RH (colaboradores), se houver
  area: string | null
  ativo: boolean
}

type PerfilRow = { id: string; nome_completo: string | null; email: string | null; papel: string; unidade_id: string | null; ativo: boolean }
type ColabRow = { perfil_id: string | null; cargo: string | null; area: string | null }

/** Enriquece perfis_usuario com o registro de RH (colaboradores) pelo perfil_id. */
async function enriquecer(sb: SB, perfis: PerfilRow[]): Promise<Pessoa[]> {
  if (perfis.length === 0) return []
  const ids = perfis.map((p) => p.id)
  const { data: colabs } = await sb.from('colaboradores').select('perfil_id, cargo, area').in('perfil_id', ids)
  const rh = new Map(((colabs ?? []) as ColabRow[]).filter((c) => c.perfil_id).map((c) => [c.perfil_id as string, c]))
  return perfis.map((p) => ({
    id: p.id, nome: p.nome_completo || 'Sem nome', papel: p.papel, unidadeId: p.unidade_id, email: p.email,
    cargo: rh.get(p.id)?.cargo ?? null, area: rh.get(p.id)?.area ?? null, ativo: p.ativo,
  }))
}

/** Atendentes do SAC (perfis papel sac/admin) + cargo/área do RH.
 *  Por padrão só ATIVOS (distribuição/ranking só consideram quem opera). Passe
 *  `incluirInativos=true` para a gestão de atendentes, que precisa listar e
 *  reativar quem foi desativado (paridade com o legado, que mostra Ativo/Inativo). */
export async function listAtendentesSac(sb: SB, incluirInativos = false, somenteOperacionais = false): Promise<Pessoa[]> {
  let q = sb
    .from('perfis_usuario')
    .select('id, nome_completo, email, papel, unidade_id, ativo')
    .in('papel', PAPEIS_SAC)
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data } = await q.order('nome_completo')
  let perfis = (data ?? []) as PerfilRow[]

  // somenteOperacionais: exclui quem é SÓ "Consulta SAC" — esse cargo VÊ o SAC mas não entra na
  // fila de distribuição nem no ranking/premiação (pedido do Julio). Operacional = atendente/supervisor.
  if (somenteOperacionais && perfis.length) {
    const ids = perfis.map((p) => p.id)
    const { data: ucs } = await sb.from('usuario_cargos').select('perfil_id, cargos(slug)').in('perfil_id', ids)
    const slugs = new Map<string, Set<string>>()
    for (const r of (ucs ?? []) as Array<{ perfil_id: string; cargos: { slug?: string } | { slug?: string }[] | null }>) {
      const c = r.cargos
      const arr = Array.isArray(c) ? c : c ? [c] : []
      const set = slugs.get(r.perfil_id) ?? new Set<string>()
      for (const x of arr) if (x.slug) set.add(x.slug)
      slugs.set(r.perfil_id, set)
    }
    perfis = perfis.filter((p) => {
      const s = slugs.get(p.id)
      if (!s) return true // sem cargo identificado → mantém (não some por falta de dado)
      const operacional = s.has('atendente_sac') || s.has('supervisor_sac')
      return !(s.has('consulta_sac') && !operacional) // consulta-only fica de fora
    })
  }

  return enriquecer(sb, perfis)
}
