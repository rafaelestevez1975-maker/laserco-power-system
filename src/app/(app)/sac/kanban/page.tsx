import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SacKanban, type Ticket } from '@/components/sac/SacKanban'

// Colunas do Kanban (espelham FASES do SacKanban).
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
// Cards carregados POR coluna (mais recentes). O cabeçalho mostra o total REAL por fase.
const POR_FASE = 120
const COLS = 'id, numero, protocolo, nome_cliente, cpf_cliente, email_cliente, telefone_cliente, canal, motivo_label, prioridade, fase, status, area_reclamada, observacoes, valor_pago, valor_devolucao, sla_violado, criado_em'

export default async function SacKanbanPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null

  // Carrega POR FASE (cards capados) + conta o total real por fase. Assim TODA coluna
  // aparece — inclusive fases antigas/com poucos chamados — e o número do cabeçalho bate
  // com o Dashboard. (Antes: "240 mais recentes no geral" escondia fases inteiras, ex.:
  // 1.648 chamados Novos recentes empurravam os 36 "Em pagamento" pra fora da janela.)
  const [listas, contagens] = await Promise.all([
    Promise.all(FASES.map((f) => {
      let q = sb.from('sac_tickets').select(COLS).eq('fase', f).order('criado_em', { ascending: false }).limit(POR_FASE)
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      return q
    })),
    Promise.all(FASES.map((f) => {
      let q = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('fase', f)
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      return q
    })),
  ])

  // Estado de erro honesto: se QUALQUER query (lista ou contagem) falhar, não fingimos
  // colunas vazias — mostramos um aviso. (RLS/rede engolidos viravam "Sem chamados".)
  const erro = listas.find((r) => r.error)?.error?.message || contagens.find((r) => r.error)?.error?.message || null

  const tickets = listas.flatMap((r) => (r.data ?? [])) as Ticket[]
  const totais: Record<string, number> = {}
  FASES.forEach((f, i) => { totais[f] = contagens[i].count ?? 0 })

  return (
    <div className="view active">
      <SacKanban tickets={tickets} totais={totais} erro={erro} />
    </div>
  )
}
