import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { FinContasPagar, type Lancamento } from '@/components/financeiro/FinContasPagar'
import { moedaBR } from '@/lib/fmt'

const money = moedaBR

export default async function FinanceiroPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  let q = sb
    .from('lancamentos_financeiros')
    .select('id, descricao, valor, status, data_vencimento, origem_ref_id, plano_contas(nome)')
    .eq('tipo', 'despesa')
    .order('data_vencimento', { ascending: false })
    .limit(200)
  if (ctx?.activeUnitId) q = q.eq('unidade_id', ctx.activeUnitId) // respeita a unidade ativa do topo
  const { data } = await q

  const lancamentos: Lancamento[] = (data ?? []).map((r) => {
    const pc = (r as { plano_contas?: { nome?: string } | { nome?: string }[] }).plano_contas
    const categoria = Array.isArray(pc) ? pc[0]?.nome ?? null : pc?.nome ?? null
    const row = r as { id: string; descricao: string | null; valor: number | null; status: string | null; data_vencimento: string | null; origem_ref_id: string | null }
    return { id: row.id, descricao: row.descricao, valor: row.valor, status: row.status, data_vencimento: row.data_vencimento, origem_ref_id: row.origem_ref_id, categoria }
  })

  const pendentes = lancamentos.filter((l) => l.status !== 'pago')
  const aPagar = pendentes.reduce((s, l) => s + (l.valor || 0), 0)
  const pago = lancamentos.filter((l) => l.status === 'pago').reduce((s, l) => s + (l.valor || 0), 0)

  return (
    <div className="view active">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '4px 0 18px' }}>
        <div className="metric-box"><span>A pagar (pendente)</span><b>{money(aPagar)}</b></div>
        <div className="metric-box"><span>Pago</span><b>{money(pago)}</b></div>
        <div className="metric-box"><span>Lançamentos pendentes</span><b>{pendentes.length}</b></div>
      </div>

      <FinContasPagar lancamentos={lancamentos} />
    </div>
  )
}
