import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SacKanban, type Ticket } from '@/components/sac/SacKanban'

const LIMITE = 240

export default async function SacKanbanPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  let q = sb
    .from('sac_tickets')
    .select('id, numero, protocolo, nome_cliente, cpf_cliente, email_cliente, telefone_cliente, canal, motivo_label, prioridade, fase, status, area_reclamada, observacoes, valor_pago, valor_devolucao, sla_violado, criado_em')
    .order('criado_em', { ascending: false })
    .limit(LIMITE)
  if (ctx?.activeUnitId) q = q.eq('unidade_id', ctx.activeUnitId) // respeita a unidade ativa do topo
  const { data } = await q
  const tickets = (data ?? []) as Ticket[]

  return (
    <div className="view active">
      <SacKanban tickets={tickets} />
    </div>
  )
}
