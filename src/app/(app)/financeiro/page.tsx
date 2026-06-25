import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { FinContasPagar, type Lancamento } from '@/components/financeiro/FinContasPagar'
import { FinContasReceber, type Recebivel } from '@/components/financeiro/FinContasReceber'
import { moedaBR } from '@/lib/fmt'

const PAGE_SIZE = 30

type Row = { id: string; descricao: string | null; valor: number | null; status: string | null; data_vencimento: string | null; origem_ref_id: string | null; plano_contas?: { nome?: string } | { nome?: string }[] }

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ aba?: string; page?: string }> }) {
  const { aba: abaRaw, page: pageRaw } = await searchParams
  const aba: 'pagar' | 'receber' = abaRaw === 'receber' ? 'receber' : 'pagar'
  const tipo = aba === 'receber' ? 'receita' : 'despesa'
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  // KPIs (somas precisas) via RPC fin_resumo — respeita RLS/unidade
  const { data: resumoRaw } = await sb.rpc('fin_resumo', { p_tipo: tipo, p_unidade: activeUnit })
  const r = (Array.isArray(resumoRaw) ? resumoRaw[0] : resumoRaw) as { pend_qtd?: number; pend_valor?: number; pago_qtd?: number; pago_valor?: number } | null
  const pendValor = Number(r?.pend_valor ?? 0), pagoValor = Number(r?.pago_valor ?? 0)
  const pendQtd = Number(r?.pend_qtd ?? 0), pagoQtd = Number(r?.pago_qtd ?? 0)
  const totalRows = pendQtd + pagoQtd
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))

  // Linhas paginadas
  let q = sb
    .from('lancamentos_financeiros')
    .select('id, descricao, valor, status, data_vencimento, origem_ref_id, plano_contas(nome)')
    .eq('tipo', tipo)
    .order('data_vencimento', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)
  const { data } = await q
  const rows = ((data ?? []) as Row[]).map((row) => {
    const pc = row.plano_contas
    const categoria = Array.isArray(pc) ? pc[0]?.nome ?? null : pc?.nome ?? null
    return { id: row.id, descricao: row.descricao, valor: row.valor, status: row.status, data_vencimento: row.data_vencimento, origem_ref_id: row.origem_ref_id, categoria }
  })

  const podeReceber = !!(ctx?.isAdmin || ctx?.papel === 'financeiro')
  const urlPg = (p: number) => `/financeiro?aba=${aba}${p > 1 ? `&page=${p}` : ''}`
  const tab = (k: 'pagar' | 'receber', icon: string, label: string) => (
    <Link className={`btn ${aba === k ? 'btn-primary' : ''}`} href={`/financeiro?aba=${k}`}><i className={`ti ${icon}`} /> {label}</Link>
  )

  return (
    <div className="view active">
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {tab('pagar', 'ti-arrow-down-left', 'Contas a Pagar')}
        {tab('receber', 'ti-arrow-up-right', 'Contas a Receber')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 18 }}>
        {aba === 'pagar' ? (
          <>
            <div className="metric-box"><span>A pagar (pendente)</span><b>{moedaBR(pendValor)}</b></div>
            <div className="metric-box"><span>Pago</span><b>{moedaBR(pagoValor)}</b></div>
            <div className="metric-box"><span>Lançamentos pendentes</span><b>{pendQtd.toLocaleString('pt-BR')}</b></div>
          </>
        ) : (
          <>
            <div className="metric-box"><span>A receber (pendente)</span><b>{moedaBR(pendValor)}</b></div>
            <div className="metric-box"><span>Recebido</span><b>{moedaBR(pagoValor)}</b></div>
            <div className="metric-box"><span>Recebíveis (total)</span><b>{totalRows.toLocaleString('pt-BR')}</b></div>
          </>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-list" /> {totalRows.toLocaleString('pt-BR')} lançamento(s) · página {page} de {totalPages}
      </div>

      {aba === 'pagar'
        ? <FinContasPagar lancamentos={rows as Lancamento[]} />
        : <FinContasReceber itens={rows as Recebivel[]} podeReceber={podeReceber} />}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 14 }}>
          {page > 1
            ? <Link className="btn" href={urlPg(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
            : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>}
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Página {page} de {totalPages}</span>
          {page < totalPages
            ? <Link className="btn" href={urlPg(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
            : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>}
        </div>
      )}
    </div>
  )
}
