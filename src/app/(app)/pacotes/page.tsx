import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { PacotesManager, type PacoteRow, type ServicoOpt } from '@/components/pacotes/PacotesManager'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

type SP = { q?: string; ativo?: string; page?: string }

// Papéis com escrita no catálogo de pacotes (gate de UI; o servidor revalida).
const PAPEIS_ESCRITA = ['gestor', 'operacoes']

export default async function PacotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ativo = sp.ativo ?? 'sim'
  const q = (sp.q ?? '').trim()
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais (count, sem puxar linhas) ──
  const [totalRes, ativosRes] = await Promise.all([
    sb.from('pacotes').select('id', { count: 'exact', head: true }),
    sb.from('pacotes').select('id', { count: 'exact', head: true }).eq('ativo', true),
  ])
  const kpiTotal = totalRes.count ?? 0
  const kpiAtivos = ativosRes.count ?? 0
  const kpiInativos = Math.max(0, kpiTotal - kpiAtivos)

  // ── Lista paginada server-side ──
  let query = sb
    .from('pacotes')
    .select('id, nome, descricao, preco, validade_dias, cobertura_creditos, desc_max, pagar_comissao, ativo, criado_em', { count: 'exact' })
    .order('nome', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)
  if (ativo === 'sim') query = query.eq('ativo', true)
  else if (ativo === 'nao') query = query.eq('ativo', false)
  if (q) query = query.ilike('nome', `%${q}%`)

  const { data: pacRaw, count } = await query
  const pacotesBase = (pacRaw ?? []) as Omit<PacoteRow, 'itens'>[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Composição (pacote_itens) dos pacotes desta página, com nome do serviço ──
  const ids = pacotesBase.map((p) => p.id)
  const itensByPacote: Record<string, { servico_id: string; quantidade: number; servico_nome: string; grupo: string | null }[]> = {}
  if (ids.length) {
    const { data: itRaw } = await sb
      .from('pacote_itens')
      .select('pacote_id, servico_id, quantidade, servicos(nome, grupo)')
      .in('pacote_id', ids)
    for (const r of (itRaw ?? []) as Array<{
      pacote_id: string
      servico_id: string
      quantidade: number | null
      servicos: { nome?: string; grupo?: string | null } | { nome?: string; grupo?: string | null }[] | null
    }>) {
      const s = Array.isArray(r.servicos) ? r.servicos[0] : r.servicos
      ;(itensByPacote[r.pacote_id] ??= []).push({
        servico_id: r.servico_id,
        quantidade: r.quantidade ?? 1,
        servico_nome: s?.nome ?? '(serviço removido)',
        grupo: s?.grupo ?? null,
      })
    }
  }
  const pacotes: PacoteRow[] = pacotesBase.map((p) => ({ ...p, itens: itensByPacote[p.id] ?? [] }))

  // ── Serviços ativos p/ o seletor da composição (agrupados por grupo no client) ──
  const { data: servRaw } = await sb
    .from('servicos')
    .select('id, nome, grupo')
    .eq('ativo', true)
    .order('grupo', { ascending: true })
    .order('nome', { ascending: true })
  const servicos = (servRaw ?? []) as ServicoOpt[]

  const temFiltro = !!(q || ativo !== 'sim')

  return (
    <PacotesManager
      pacotes={pacotes}
      servicos={servicos}
      podeEscrever={podeEscrever}
      kpis={{ total: kpiTotal, ativos: kpiAtivos, inativos: kpiInativos }}
      filtros={{ q, ativo }}
      page={page}
      totalPages={totalPages}
      total={total}
      temFiltro={temFiltro}
    />
  )
}
