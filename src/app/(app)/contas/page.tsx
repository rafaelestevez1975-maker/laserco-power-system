import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ContasManager, type LancRow, type Categoria } from '@/components/contas/ContasManager'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30
const KPI_CAP = 20000 // teto p/ somatórios (a tabela toda tem ~13k; escopada por unidade é bem menor)

type SP = {
  aba?: string // 'pagar' (despesa) | 'receber' (receita)
  status?: string // pago | pendente | atrasado
  categoria?: string // plano_contas.id
  fornecedor?: string // legado: filtro Fornecedor (texto)
  unidade?: string // '' (todas) | 'franqueadora' (rede, unidade_id null) | <uuid da loja>
  di?: string // data_vencimento >=
  df?: string // data_vencimento <=
  page?: string
}

type Aba = 'pagar' | 'receber'

/** Escopo de unidade do "nosso × franquia":
 *  - eq  = uma loja específica (ou a unidade ativa do topo)
 *  - null = lançamentos da Franqueadora/rede (sem unidade_id)
 *  - all = todas (rede + lojas) */
type UnitScope = { mode: 'eq' | 'null' | 'all'; id?: string }

/** Aplica os filtros comuns (tipo, unidade, status, categoria, vencimento) numa query. */
function aplicarFiltros<
  Q extends {
    eq(c: string, v: unknown): Q
    gte(c: string, v: unknown): Q
    lte(c: string, v: unknown): Q
    lt(c: string, v: unknown): Q
    is(c: string, v: unknown): Q
    ilike(c: string, v: string): Q
  },
>(q: Q, tipo: 'receita' | 'despesa', unit: UnitScope, status: string | undefined, categoria: string | undefined, di: string | undefined, df: string | undefined, hojeISO: string, fornecedor?: string): Q {
  let out = q.eq('tipo', tipo)
  if (unit.mode === 'eq' && unit.id) out = out.eq('unidade_id', unit.id)
  else if (unit.mode === 'null') out = out.is('unidade_id', null)
  if (categoria) out = out.eq('categoria_id', categoria)
  if (fornecedor) out = out.ilike('fornecedor', `%${fornecedor}%`)
  if (di) out = out.gte('data_vencimento', di)
  if (df) out = out.lte('data_vencimento', df)
  if (status === 'pago') out = out.eq('status', 'pago')
  else if (status === 'pendente') out = out.eq('status', 'pendente')
  else if (status === 'atrasado') {
    // atrasado = não pago e vencimento já passou
    out = out.eq('status', 'pendente').lt('data_vencimento', hojeISO)
  }
  return out
}

export default async function ContasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const aba: Aba = sp.aba === 'pagar' ? 'pagar' : 'receber' // default Receber (não há despesas lançadas ainda)
  const tipo: 'receita' | 'despesa' = aba === 'receber' ? 'receita' : 'despesa'

  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const podeEscrever = ehAdmin(ctx?.papel) || ['financeiro', 'gestor'].includes(ctx?.papel || '')

  // ── "Nosso × franquia": resolve o escopo de unidade ──
  // Se há unidade ativa no topo, ela manda. Senão (Todas), vale o filtro da tela.
  const unidades = ctx?.unidades ?? []
  const uniNome: Record<string, string> = Object.fromEntries(unidades.map((u) => [u.id, u.nome]))
  const upFiltro = unidadeId ? '' : (sp.unidade ?? '')
  const unitScope: UnitScope = unidadeId
    ? { mode: 'eq', id: unidadeId }
    : upFiltro === 'franqueadora'
      ? { mode: 'null' }
      : upFiltro
        ? { mode: 'eq', id: upFiltro }
        : { mode: 'all' }
  // Mostra coluna/filtro de unidade só quando não há uma unidade fixada no topo.
  const mostrarUnidade = !unidadeId

  const hojeISO = new Date().toISOString().slice(0, 10)
  const fornecedorFil = (sp.fornecedor ?? '').trim()
  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── Categorias (árvore) do tipo da aba para o filtro + form ──
  const { data: catRaw } = await sb
    .from('plano_contas')
    .select('id, parent_id, codigo, nome, tipo, aceita_lancamentos, ativo')
    .eq('tipo', tipo)
    .eq('ativo', true)
    .order('codigo', { ascending: true })
  const categorias = ((catRaw ?? []) as Categoria[]).filter((c) => c.ativo !== false)
  const catNome: Record<string, string> = Object.fromEntries(categorias.map((c) => [c.id, c.nome]))

  // ── Página de lançamentos (server-side .range + count exato) ──
  let listQ = sb
    .from('lancamentos_financeiros')
    .select('id, descricao, valor, status, data_vencimento, data_pagamento, categoria_id, unidade_id, forma_pagamento, fornecedor, observacao, tipo', { count: 'exact' })
    .order('data_vencimento', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1)
  listQ = aplicarFiltros(listQ, tipo, unitScope, sp.status, sp.categoria, sp.di, sp.df, hojeISO, fornecedorFil)
  const { data: rowsRaw, count } = await listQ
  const rows: LancRow[] = ((rowsRaw ?? []) as LancRow[]).map((r) => ({
    ...r,
    categoria: r.categoria_id ? catNome[r.categoria_id] ?? '' : '',
    unidade: r.unidade_id ? (uniNome[r.unidade_id] ?? 'Loja') : 'Franqueadora / rede',
    // status derivado para exibição: pendente + vencido => "atrasado"
    statusEfetivo:
      r.status === 'pago'
        ? 'pago'
        : r.data_vencimento && r.data_vencimento < hojeISO
          ? 'atrasado'
          : 'pendente',
  }))
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── KPIs reais (sobre o conjunto filtrado completo, não só a página) ──
  // Busca leve: só valor/status/vencimento, com teto de segurança.
  let kpiQ = sb
    .from('lancamentos_financeiros')
    .select('valor, status, data_vencimento')
    .range(0, KPI_CAP - 1)
  kpiQ = aplicarFiltros(kpiQ, tipo, unitScope, sp.status, sp.categoria, sp.di, sp.df, hojeISO, fornecedorFil)
  const { data: kpiRaw } = await kpiQ
  const kpiRows = (kpiRaw ?? []) as { valor: number | null; status: string | null; data_vencimento: string | null }[]

  let previsto = 0
  let realizado = 0
  let emAberto = 0
  let atrasado = 0
  for (const k of kpiRows) {
    const v = k.valor || 0
    previsto += v
    if (k.status === 'pago') realizado += v
    else {
      emAberto += v
      if (k.data_vencimento && k.data_vencimento < hojeISO) atrasado += v
    }
  }

  return (
    <ContasManager
      aba={aba}
      tipo={tipo}
      rows={rows}
      categorias={categorias}
      podeEscrever={podeEscrever}
      activeUnitId={unidadeId}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
      unidades={unidades}
      mostrarUnidade={mostrarUnidade}
      filtros={{ status: sp.status ?? '', categoria: sp.categoria ?? '', fornecedor: fornecedorFil, unidade: upFiltro, di: sp.di ?? '', df: sp.df ?? '' }}
      kpis={{ previsto, realizado, emAberto, atrasado }}
      page={page}
      totalPages={totalPages}
      total={total}
      kpiCapped={kpiRows.length >= KPI_CAP}
    />
  )
}
