import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { PagamentosSac, type Reembolso } from '@/components/sac/PagamentosSac'

export default async function SacPagamentosPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  let q = sb
    .from('lancamentos_financeiros')
    .select('id, descricao, valor, status, data_vencimento, data_pagamento, observacao, origem_ref_id')
    .ilike('descricao', 'Reembolso SAC%')
    .order('status', { ascending: false }) // pendente antes de pago
    .order('data_vencimento', { ascending: false })
    .limit(200)
  if (ctx?.activeUnitId) q = q.eq('unidade_id', ctx.activeUnitId) // respeita a unidade ativa

  const { data } = await q
  const itens = (data ?? []) as Reembolso[]
  const podeBaixar = !!(ctx?.isAdmin || ctx?.papel === 'financeiro')

  return (
    <div className="view active">
      <PagamentosSac itens={itens} podeBaixar={podeBaixar} />
    </div>
  )
}
