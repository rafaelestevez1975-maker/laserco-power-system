import { createClient } from '@/lib/supabase/server'
import { SacKanban, type Ticket } from '@/components/sac/SacKanban'

const LIMITE = 240

export default async function SacKanbanPage() {
  const sb = await createClient()
  const { data } = await sb
    .from('sac_tickets')
    .select('id, numero, protocolo, nome_cliente, cpf_cliente, email_cliente, telefone_cliente, canal, motivo_label, prioridade, fase, status, area_reclamada, observacoes, valor_pago, valor_devolucao, sla_violado, criado_em')
    .order('criado_em', { ascending: false })
    .limit(LIMITE)
  const tickets = (data ?? []) as Ticket[]

  return (
    <div className="view active">
      <SacKanban tickets={tickets} />
    </div>
  )
}
