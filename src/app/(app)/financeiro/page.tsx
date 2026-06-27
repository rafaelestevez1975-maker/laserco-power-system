import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { moedaBR, dataBR } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

const CAP = 20000 // teto de segurança p/ somatórios

type Lite = { valor: number | null; status: string | null; data_vencimento: string | null }
type Recent = Lite & { id: string; descricao: string | null; tipo: string | null }

/** Fluxo de Caixa da franqueadora — KPIs reais sobre `lancamentos_financeiros`.
 *  Esta página real substitui o clone estático do protótipo (catch-all). */
export default async function FinanceiroPage() {
  const ctx = await getSessionContext()
  const podeVer = ehAdmin(ctx?.papel) || ['financeiro', 'gestor'].includes(ctx?.papel || '')

  if (!podeVer) {
    return (
      <div className="view active">
        <div className="crm-note"><i className="ti ti-lock" /> Acesso restrito. O Financeiro da franqueadora é visível apenas para administradores.</div>
      </div>
    )
  }

  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const escopo = ctx?.activeUnitName ?? 'Toda a rede'
  const hojeISO = new Date().toISOString().slice(0, 10)

  const sel = (tipo: 'receita' | 'despesa') => {
    let q = sb.from('lancamentos_financeiros').select('valor, status, data_vencimento').eq('tipo', tipo).range(0, CAP - 1)
    if (unidadeId) q = q.eq('unidade_id', unidadeId)
    return q
  }
  let recentQ = sb
    .from('lancamentos_financeiros')
    .select('id, descricao, valor, status, data_vencimento, tipo')
    .order('data_vencimento', { ascending: false, nullsFirst: false })
    .range(0, 9)
  if (unidadeId) recentQ = recentQ.eq('unidade_id', unidadeId)

  const [{ data: recRaw }, { data: despRaw }, { data: recentRaw }] = await Promise.all([sel('receita'), sel('despesa'), recentQ])
  const receitas = (recRaw ?? []) as Lite[]
  const despesas = (despRaw ?? []) as Lite[]
  const recentes = (recentRaw ?? []) as Recent[]

  const somar = (arr: Lite[]) => {
    let total = 0, pago = 0, emAberto = 0, atrasado = 0
    for (const r of arr) {
      const v = r.valor || 0
      total += v
      if (r.status === 'pago') pago += v
      else {
        emAberto += v
        if (r.data_vencimento && r.data_vencimento < hojeISO) atrasado += v
      }
    }
    return { total, pago, emAberto, atrasado }
  }
  const R = somar(receitas)
  const D = somar(despesas)
  const resultadoProjetado = R.total - D.total
  const semDados = receitas.length === 0 && despesas.length === 0

  const cards: { label: string; valor: number; cor?: string; sub?: string }[] = [
    { label: 'A receber (em aberto)', valor: R.emAberto, sub: 'Royalties, taxas e aluguéis pendentes' },
    { label: 'Já recebido', valor: R.pago, cor: '#15803D', sub: 'Lançamentos baixados' },
    { label: 'Inadimplência', valor: R.atrasado, cor: '#D85563', sub: 'A receber já vencido' },
    { label: 'A pagar', valor: D.emAberto, cor: '#9A6700', sub: 'Despesas pendentes da rede' },
    { label: 'Resultado projetado', valor: resultadoProjetado, cor: resultadoProjetado >= 0 ? '#15803D' : '#D85563', sub: 'Entradas − saídas (previsto)' },
  ]

  return (
    <div className="view active">
      <div className="crm-note" style={{ marginBottom: 14 }}>
        <i className="ti ti-businessplan" /> Fluxo de caixa da franqueadora — escopo: <b>{escopo}</b>
        {!unidadeId && ' (consolidado da rede; selecione uma unidade no topo para filtrar)'}.
      </div>

      {/* KPIs reais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, margin: '0 0 18px' }}>
        {cards.map((c) => (
          <div key={c.label} className="metric-box">
            <span>{c.label}</span>
            <b style={c.cor ? { color: c.cor } : undefined}>{moedaBR(c.valor)}</b>
            {c.sub && <small style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.sub}</small>}
          </div>
        ))}
      </div>

      {/* Ações reais (telas funcionais de contas) */}
      <div className="seg" style={{ marginBottom: 18 }}>
        <Link href="/contas?aba=receber" className="seg-btn"><i className="ti ti-arrow-down-left" /> Contas a Receber</Link>
        <Link href="/contas?aba=pagar" className="seg-btn"><i className="ti ti-arrow-up-right" /> Contas a Pagar</Link>
      </div>

      {/* Últimos lançamentos reais */}
      <div className="cli-card">
        <div className="rel-card-h" style={{ cursor: 'default', padding: '12px 16px' }}>
          <span><i className="ti ti-list" /> Últimos lançamentos</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>Descrição</th><th>Tipo</th><th>Vencimento</th><th className="num-r">Valor</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recentes.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 38, color: 'var(--text-3)' }}>
                  <i className="ti ti-database-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
                  Nenhum lançamento ainda. Use <b>Contas a Receber / Contas a Pagar</b> para lançar (ou importe sua base).
                </td></tr>
              )}
              {recentes.map((r) => {
                const eff = r.status === 'pago' ? 'pago' : (r.data_vencimento && r.data_vencimento < hojeISO ? 'atrasado' : 'pendente')
                const pill = eff === 'pago' ? { bg: '#E7F0EC', c: '#15803D', t: 'Pago/Recebido' } : eff === 'atrasado' ? { bg: '#FBE9EB', c: '#D85563', t: 'Atrasado' } : { bg: '#FBEFD9', c: '#9A6700', t: 'Em aberto' }
                return (
                  <tr key={r.id}>
                    <td>{r.descricao || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.tipo === 'receita' ? 'Receita' : 'Despesa'}</td>
                    <td>{dataBR(r.data_vencimento)}</td>
                    <td className="num-r"><b>{moedaBR(r.valor)}</b></td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: pill.bg, color: pill.c }}>{pill.t}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {semDados && (
        <div className="crm-note" style={{ marginTop: 14 }}>
          <i className="ti ti-info-circle" /> Os valores estão zerados porque ainda <b>não há lançamentos reais</b> no banco — a base do fluxo de caixa ainda não foi importada. (Os "R$ 24 milhões / Cobrança BEMP" que apareciam antes eram dados <b>fictícios</b> do protótipo, já removidos desta tela.)
        </div>
      )}

      <div className="crm-note" style={{ marginTop: 14 }}>
        <i className="ti ti-tools" /> <b>Em construção</b> (próximas entregas): DRE (loja / franqueadora / consolidado), Conciliação Bancária, Automação de Royalties e Régua de Cobrança automática. Disponíveis no submenu como "em construção".
      </div>
    </div>
  )
}
