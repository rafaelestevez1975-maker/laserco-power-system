import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { PlanosManager, type PlanoRow, type ServicoOpt } from '@/components/planos/PlanosManager'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

type SP = { q?: string; ativo?: string; page?: string }

// Papéis com escrita nos planos (gate de UI; o servidor revalida).
const PAPEIS_ESCRITA = ['gestor', 'operacoes']

export default async function PlanosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ativo = sp.ativo ?? 'sim'
  const q = (sp.q ?? '').trim()
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs ──
  const [totalRes, ativosRes, mrrRes] = await Promise.all([
    sb.from('planos_assinatura').select('id', { count: 'exact', head: true }),
    sb.from('planos_assinatura').select('id', { count: 'exact', head: true }).eq('ativo', true),
    sb.from('planos_assinatura').select('valor_mensal').eq('ativo', true),
  ])
  const kpiTotal = totalRes.count ?? 0
  const kpiAtivos = ativosRes.count ?? 0
  // "ticket médio" dos planos ativos (média da mensalidade)  KPI real do catálogo.
  const valores = ((mrrRes.data ?? []) as { valor_mensal: number | null }[]).map((r) => r.valor_mensal || 0)
  const ticketMedio = valores.length ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : 0

  // ── Lista paginada ──
  let query = sb
    .from('planos_assinatura')
    .select('id, nome, descricao, valor_mensal, valor_adesao, duracao_meses, modo_utilizacao, tipo_comissao, beneficios, ativo, criado_em', { count: 'exact' })
    .order('valor_mensal', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)
  if (ativo === 'sim') query = query.eq('ativo', true)
  else if (ativo === 'nao') query = query.eq('ativo', false)
  if (q) query = query.ilike('nome', `%${q}%`)

  const { data: planRaw, count } = await query
  const planosBase = (planRaw ?? []) as Omit<PlanoRow, 'itens'>[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Serviços incluídos (plano_assinatura_servicos) com nome ──
  const ids = planosBase.map((p) => p.id)
  const itensByPlano: Record<string, { servico_id: string; quantidade_mensal: number; servico_nome: string; grupo: string | null }[]> = {}
  if (ids.length) {
    const { data: itRaw } = await sb
      .from('plano_assinatura_servicos')
      .select('plano_id, servico_id, quantidade_mensal, servicos(nome, grupo)')
      .in('plano_id', ids)
    for (const r of (itRaw ?? []) as Array<{
      plano_id: string
      servico_id: string
      quantidade_mensal: number | null
      servicos: { nome?: string; grupo?: string | null } | { nome?: string; grupo?: string | null }[] | null
    }>) {
      const s = Array.isArray(r.servicos) ? r.servicos[0] : r.servicos
      ;(itensByPlano[r.plano_id] ??= []).push({
        servico_id: r.servico_id,
        quantidade_mensal: r.quantidade_mensal ?? 1,
        servico_nome: s?.nome ?? '(serviço removido)',
        grupo: s?.grupo ?? null,
      })
    }
  }
  const planos: PlanoRow[] = planosBase.map((p) => ({ ...p, itens: itensByPlano[p.id] ?? [] }))

  // ── Serviços ativos p/ o seletor ──
  const { data: servRaw } = await sb
    .from('servicos')
    .select('id, nome, grupo')
    .eq('ativo', true)
    .order('grupo', { ascending: true })
    .order('nome', { ascending: true })
  const servicos = (servRaw ?? []) as ServicoOpt[]

  const temFiltro = !!(q || ativo !== 'sim')

  return (
    <PlanosManager
      planos={planos}
      servicos={servicos}
      podeEscrever={podeEscrever}
      kpis={{ total: kpiTotal, ativos: kpiAtivos, ticketMedio }}
      filtros={{ q, ativo }}
      page={page}
      totalPages={totalPages}
      total={total}
      temFiltro={temFiltro}
    />
  )
}
