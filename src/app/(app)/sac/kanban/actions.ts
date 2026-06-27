'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']

/** Move um ticket do SAC para outra fase (Novo → Contato → Em pagamento → Concluído). */
export async function moverTicketFase(ticketId: string, fase: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!FASES.includes(fase)) return { ok: false, error: 'Fase inválida.' }

  const { error } = await sb.from('sac_tickets').update({ fase }).eq('id', ticketId)
  if (error) {
    return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para mover o chamado.' : error.message }
  }
  revalidatePath('/sac/kanban')
  revalidatePath('/sac')
  return { ok: true }
}
