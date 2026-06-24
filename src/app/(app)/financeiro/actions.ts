'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Dá baixa (marca como pago) num lançamento. Se for um reembolso do SAC
 *  (origem_ref_id aponta para um sac_ticket), conclui o chamado automaticamente
 *   é o "espelha de volta" pedido na reunião. */
export async function darBaixaLancamento(lancamentoId: string): Promise<{ ok: boolean; error?: string; concluiuChamado?: boolean }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  const hojeDate = new Date().toISOString().slice(0, 10)
  const agora = new Date().toISOString()

  const { data: lf, error: e0 } = await sb
    .from('lancamentos_financeiros')
    .select('id, origem_ref_id, status')
    .eq('id', lancamentoId).single()
  const lanc = lf as { origem_ref_id?: string | null; status?: string } | null
  if (e0 || !lanc) return { ok: false, error: 'Lançamento não encontrado.' }
  if (lanc.status === 'pago') return { ok: false, error: 'Lançamento já está pago.' }

  const { error: e1 } = await sb
    .from('lancamentos_financeiros')
    .update({ status: 'pago', data_pagamento: hojeDate })
    .eq('id', lancamentoId)
  if (e1) return { ok: false, error: /row-level|policy|permission/i.test(e1.message) ? 'Sem permissão para dar baixa.' : e1.message }

  // Espelha de volta no SAC: se o lançamento veio de um chamado, conclui-o.
  let concluiuChamado = false
  if (lanc.origem_ref_id) {
    const { data: tk } = await sb.from('sac_tickets').select('id').eq('id', lanc.origem_ref_id).maybeSingle()
    if (tk) {
      await sb.from('sac_tickets').update({ fase: 'Concluído', pago: true, pago_em: agora, data_reembolso: hojeDate }).eq('id', lanc.origem_ref_id)
      concluiuChamado = true
      revalidatePath('/sac'); revalidatePath('/sac/kanban'); revalidatePath('/sac/chamados')
    }
  }

  revalidatePath('/financeiro')
  return { ok: true, concluiuChamado }
}
