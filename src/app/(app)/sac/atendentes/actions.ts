'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { listAtendentesSac } from '@/lib/pessoas'
import type { SB } from '@/lib/sb'

export type DistribResult = { ok: boolean; error?: string; conversas?: number; atendentes?: number }

/** Carga atual (conversas atribuídas + tickets abertos atribuídos) por atendente. */
async function cargaPorAtendente(sb: SB, ids: string[]): Promise<Map<string, number>> {
  const carga = new Map<string, number>()
  await Promise.all(ids.map(async (id) => {
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).eq('atendente_id', id),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', id).neq('fase', 'Concluído'),
    ])
    carga.set(id, (c1 ?? 0) + (c2 ?? 0))
  }))
  return carga
}

/** Distribuição automática IGUALITÁRIA: atribui a fila não-atribuída (conversas que
 *  precisam de humano + chamados abertos) round-robin ao atendente menos carregado.
 *  Atribuição usa o id do perfis_usuario (ver project-laserco-people-model). */
export async function distribuirFila(): Promise<DistribResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'sac', 'gestor')) return { ok: false, error: 'Você não tem permissão para distribuir o atendimento.' }
  const sb = op.sb

  const atendentes = await listAtendentesSac(sb)
  if (atendentes.length === 0) return { ok: false, error: 'Nenhum atendente SAC ativo para distribuir.' }

  const carga = await cargaPorAtendente(sb, atendentes.map((a) => a.id))
  const menosCarregado = () => {
    let best = atendentes[0].id, min = Infinity
    for (const a of atendentes) { const c = carga.get(a.id) ?? 0; if (c < min) { min = c; best = a.id } }
    return best
  }

  // Distribui o ATENDIMENTO VIVO: conversas que precisam de humano (sem atendente e
  // com bot desligado). Chamados (backlog histórico) são atribuídos ao serem trabalhados,
  // não em massa, para não despejar centenas de uma vez.
  const { data: convs } = await sb
    .from('sac_whatsapp_chats').select('id').is('atendente_id', null).eq('bot_ativo', false)
    .order('ultima_msg_em', { ascending: true }).limit(300)
  let nConv = 0
  for (const c of (convs ?? []) as { id: string }[]) {
    const aid = menosCarregado()
    const { error: e } = await sb.from('sac_whatsapp_chats').update({ atendente_id: aid }).eq('id', c.id)
    if (!e) { carga.set(aid, (carga.get(aid) ?? 0) + 1); nConv++ }
  }

  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true, conversas: nConv, atendentes: atendentes.length }
}
