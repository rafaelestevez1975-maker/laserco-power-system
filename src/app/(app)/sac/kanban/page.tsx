import Link from 'next/link'
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
      <div className="crm-note">
        <i className="ti ti-layout-kanban" /> Kanban dos <b>{tickets.length} chamados mais recentes</b> — arraste para mudar a fase
        (Novo → Contato → Em pagamento → Concluído). Clique no card para ver os detalhes.
        {' '}<Link href="/sac/chamados" style={{ color: 'var(--brand-600)', fontWeight: 600 }}>Ver lista completa →</Link>
      </div>
      <SacKanban tickets={tickets} />
    </div>
  )
}
