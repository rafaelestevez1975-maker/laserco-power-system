/**
 * Fonte ÚNICA de "pessoas" do sistema. Pessoa = perfis_usuario (login+papel)
 * ligado ao registro de RH colaboradores via colaboradores.perfil_id.
 * Atendente / Colaborador / Usuário são VISÕES da mesma pessoa.
 * Ver memory project-laserco-people-model + docs/CONSOLIDACAO.md.
 * Server-only (recebe o client `sb`).
 */
import type { SB } from '@/lib/sb'

/** Papéis que atuam no SAC (recebem conversas/tickets). */
export const PAPEIS_SAC = ['sac', 'admin_geral']

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

/** Atendentes do SAC (perfis papel sac/admin ativos) + cargo/área do RH. */
export async function listAtendentesSac(sb: SB): Promise<Pessoa[]> {
  const { data } = await sb
    .from('perfis_usuario')
    .select('id, nome_completo, email, papel, unidade_id, ativo')
    .in('papel', PAPEIS_SAC).eq('ativo', true).order('nome_completo')
  return enriquecer(sb, (data ?? []) as PerfilRow[])
}
