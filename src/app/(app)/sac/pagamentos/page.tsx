import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { PagamentosSac, type Reembolso } from '@/components/sac/PagamentosSac'
import { AcordosSac, type Acordo, type Parcela } from '@/components/sac/AcordosSac'
import { NovoAcordo, type ChamadoOpcao } from '@/components/sac/NovoAcordo'

export default async function SacPagamentosPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  // Reembolsos (espelho de Contas a Pagar). count exact = total real (não só a página de 200).
  let rq = sb
    .from('lancamentos_financeiros')
    .select('id, descricao, valor, status, data_vencimento, data_pagamento, observacao, origem_ref_id', { count: 'exact' })
    .ilike('descricao', 'Reembolso SAC%')
    .order('status', { ascending: false }) // pendente antes de pago
    .order('data_vencimento', { ascending: false })
    .limit(200)
  if (ctx?.activeUnitId) rq = rq.eq('unidade_id', ctx.activeUnitId)

  // Acordos + parcelas. count exact = total real de acordos (não só a página de 100).
  let aq = sb
    .from('sac_acordos')
    .select('id, ticket_id, cliente, valor_total, n_parcelas, status, observacao, criado_em, sac_parcelas(id, n, vencimento, valor, pago)', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .limit(100)
  if (ctx?.activeUnitId) aq = aq.eq('unidade_id', ctx.activeUnitId)

  // Chamados abertos para o dropdown "Chamado vinculado" do Novo acordo (paridade sacAcChamPick).
  let cq = sb
    .from('sac_tickets')
    .select('id, numero, protocolo, nome_cliente, valor_devolucao')
    .neq('fase', 'Concluído')
    .order('criado_em', { ascending: false })
    .limit(200)
  if (ctx?.activeUnitId) cq = cq.eq('unidade_id', ctx.activeUnitId)

  const [reembRes, acRes, chamRes] = await Promise.all([rq, aq, cq])

  const erro = !!(reembRes.error || acRes.error)
  const itens = (reembRes.data ?? []) as Reembolso[]
  const totalReembolsos = reembRes.count ?? itens.length
  const acordos = ((acRes.data ?? []) as (Omit<Acordo, 'parcelas'> & { sac_parcelas?: Parcela[] })[]).map((a) => ({
    ...a, parcelas: (a.sac_parcelas ?? []).slice().sort((x, y) => x.n - y.n),
  }))
  const totalAcordos = acRes.count ?? acordos.length

  type ChamRow = { id: string; numero: number | null; protocolo: string | null; nome_cliente: string | null; valor_devolucao: number | null }
  const chamados: ChamadoOpcao[] = ((chamRes.data ?? []) as ChamRow[]).map((c) => ({
    id: c.id,
    rotulo: `${c.protocolo || `SAC-${c.numero ?? ''}`} · ${c.nome_cliente || 'Cliente'}`,
    cliente: c.nome_cliente || '',
    valorSugerido: c.valor_devolucao ?? null,
  }))

  const podeBaixar = !!(ctx?.isAdmin || ctx?.papel === 'financeiro')
  const podeValidar = !!(ctx?.isAdmin || ctx?.papel === 'gestor' || ctx?.papel === 'financeiro')

  if (erro) {
    return (
      <div className="view active">
        <div className="cli-card" style={{ padding: 28, textAlign: 'center' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 30, color: 'var(--red)' }} />
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>Não foi possível carregar os pagamentos do SAC.</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Verifique sua permissão de acesso e tente novamente. Se persistir, fale com o administrador.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view active">
      <AcordosSac acordos={acordos} totalAcordos={totalAcordos} podeValidar={podeValidar}>
        {podeValidar && <NovoAcordo unidades={ctx?.unidades ?? []} chamados={chamados} />}
      </AcordosSac>
      <PagamentosSac itens={itens} totalReembolsos={totalReembolsos} podeBaixar={podeBaixar} />
    </div>
  )
}
