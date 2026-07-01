/**
 * Auto-distribuição de conversas do SAC. Escolhe a atendente que recebe uma conversa nova.
 * Regra (pedido do Julio): só quem está ONLINE recebe automaticamente; entre as online,
 * a OPERACIONAL (atendente/supervisor — exclui consulta) menos carregada, na unidade do canal
 * (ou rede). Server-only (recebe o client `sb`, normalmente o adminClient do webhook).
 */
import type { SB } from '@/lib/sb'

type PerfilCargo = {
  id: string
  unidade_id: string | null
  usuario_cargos: Array<{ cargos: { slug?: string } | { slug?: string }[] | null }> | null
}

export async function escolherAtendenteOnline(sb: SB, unidadeId: string | null): Promise<string | null> {
  // Candidatas: papel sac, ONLINE, ativas — com o cargo embutido p/ filtrar operacional.
  const { data } = await sb
    .from('perfis_usuario')
    // Desambiguar o embed: usuario_cargos tem 2 FKs p/ perfis_usuario (perfil_id e
    // atribuido_por). Sem a FK explícita o PostgREST devolve PGRST201 e a query falha
    // INTEIRA — por isso a auto-distribuição não escolhia ninguém.
    .select('id, unidade_id, usuario_cargos!usuario_cargos_perfil_id_fkey(cargos(slug))')
    .eq('papel', 'sac')
    .eq('sac_online', true)
    .eq('ativo', true)

  const cands = ((data ?? []) as PerfilCargo[])
    .filter((p) => {
      const slugs = new Set<string>()
      for (const uc of p.usuario_cargos ?? []) {
        const c = uc.cargos
        const arr = Array.isArray(c) ? c : c ? [c] : []
        for (const x of arr) if (x.slug) slugs.add(x.slug)
      }
      const operacional = slugs.has('atendente_sac') || slugs.has('supervisor_sac') || slugs.size === 0
      const consultaOnly = slugs.has('consulta_sac') && !(slugs.has('atendente_sac') || slugs.has('supervisor_sac'))
      if (consultaOnly) return false
      // Unidade: a do canal, OU atendente sem unidade (rede). Se a conversa não tem unidade, aceita todos.
      if (unidadeId && p.unidade_id && p.unidade_id !== unidadeId) return false
      return operacional
    })
    .map((p) => p.id)

  if (cands.length === 0) return null
  if (cands.length === 1) return cands[0]

  // Menos carregada: menor nº de conversas ABERTAS atualmente atribuídas (carga viva).
  // Contar também as resolvidas puniria quem já fechou muitos casos e desbalancearia a fila.
  const carga = new Map<string, number>(cands.map((id) => [id, 0]))
  const { data: chats } = await sb.from('sac_whatsapp_chats').select('atendente_id').in('atendente_id', cands).eq('status', 'aberto')
  for (const r of (chats ?? []) as { atendente_id: string | null }[]) {
    if (r.atendente_id) carga.set(r.atendente_id, (carga.get(r.atendente_id) ?? 0) + 1)
  }
  let best = cands[0], min = Infinity
  for (const id of cands) { const c = carga.get(id) ?? 0; if (c < min) { min = c; best = id } }
  return best
}
