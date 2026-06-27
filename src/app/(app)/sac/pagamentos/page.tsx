import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { PagamentosSac, type Reembolso } from '@/components/sac/PagamentosSac'
import { AcordosSac, type Acordo, type Parcela } from '@/components/sac/AcordosSac'
import { NovoAcordo } from '@/components/sac/NovoAcordo'

export default async function SacPagamentosPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  let rq = sb
    .from('lancamentos_financeiros')
    .select('id, descricao, valor, status, data_vencimento, data_pagamento, observacao, origem_ref_id')
    .ilike('descricao', 'Reembolso SAC%')
    .order('status', { ascending: false }) // pendente antes de pago
    .order('data_vencimento', { ascending: false })
    .limit(200)
  if (ctx?.activeUnitId) rq = rq.eq('unidade_id', ctx.activeUnitId)

  let aq = sb
    .from('sac_acordos')
    .select('id, cliente, valor_total, n_parcelas, status, criado_em, sac_parcelas(id, n, vencimento, valor, pago)')
    .order('criado_em', { ascending: false })
    .limit(100)
  if (ctx?.activeUnitId) aq = aq.eq('unidade_id', ctx.activeUnitId)

  const [{ data: reembRaw }, { data: acRaw }] = await Promise.all([rq, aq])
  const itens = (reembRaw ?? []) as Reembolso[]
  const acordos = ((acRaw ?? []) as (Omit<Acordo, 'parcelas'> & { sac_parcelas?: Parcela[] })[]).map((a) => ({
    ...a, parcelas: (a.sac_parcelas ?? []).slice().sort((x, y) => x.n - y.n),
  }))

  const podeBaixar = !!(ctx?.isAdmin || ctx?.papel === 'financeiro')
  const podeValidar = !!(ctx?.isAdmin || ctx?.papel === 'gestor' || ctx?.papel === 'financeiro')

  return (
    <div className="view active">
      {podeValidar && <NovoAcordo unidades={ctx?.unidades ?? []} />}
      <AcordosSac acordos={acordos} podeValidar={podeValidar} />
      <PagamentosSac itens={itens} podeBaixar={podeBaixar} />
    </div>
  )
}
