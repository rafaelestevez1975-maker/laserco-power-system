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
  // aparece  inclusive fases antigas/com poucos chamados  e o número do cabeçalho bate
  // com o Dashboard. (Antes: "240 mais recentes no geral" escondia fases inteiras, ex.:
  // 1.648 chamados Novos recentes empurravam os 36 "Em pagamento" pra fora da janela.)
  // PERF: as LISTAS (cards capados por fase) precisam mesmo das linhas → não dá pra
  // colapsar. Mas as CONTAGENS eram 7 queries `count:'exact'` (1 por fase) que saturavam
  // o pool. Trocamos por UMA varredura paginada só da coluna `fase` (mesmo filtro de
  // unidade), tabulando o total por fase em JS. Mesmos números.
  const [listas, faseMap] = await Promise.all([
    Promise.all(FASES.map((f) => {
      let q = sb.from('sac_tickets').select(COLS).eq('fase', f).order('criado_em', { ascending: false }).limit(POR_FASE)
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      return q
    })),
    (async (): Promise<{ map: Map<string, number>; error: string | null }> => {
      const map = new Map<string, number>()
      const PAGE = 1000
      for (let offset = 0; ; offset += PAGE) {
        let q = sb.from('sac_tickets').select('fase')
        if (unidadeId) q = q.eq('unidade_id', unidadeId)
        const { data, error } = await q.range(offset, offset + PAGE - 1)
        if (error) return { map, error: error.message }
        const rows = (data ?? []) as { fase: string | null }[]
        for (const r of rows) {
          if (r.fase) map.set(r.fase, (map.get(r.fase) ?? 0) + 1)
        }
        if (rows.length < PAGE) break
      }
      return { map, error: null }
    })(),
  ])

  // Estado de erro honesto: se QUALQUER query (lista ou contagem) falhar, não fingimos
  // colunas vazias  mostramos um aviso. (RLS/rede engolidos viravam "Sem chamados".)
  const erro = listas.find((r) => r.error)?.error?.message || faseMap.error || null

  const tickets = listas.flatMap((r) => (r.data ?? [])) as Ticket[]
  const totais: Record<string, number> = {}
  FASES.forEach((f) => { totais[f] = faseMap.map.get(f) ?? 0 })

  return (
    <div className="view active">
      <SacKanban tickets={tickets} totais={totais} erro={erro} />
    </div>
  )
}
