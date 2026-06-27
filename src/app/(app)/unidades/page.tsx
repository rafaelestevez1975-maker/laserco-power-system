import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { UnidadesManager, type UnidadeRow } from '@/components/unidades/UnidadesManager'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

type SP = {
  q?: string // busca por nome/cidade/cnpj
  uf?: string // filtro por estado
  status?: string // ativa | inativa
  page?: string
}

/** Lista das unidades da rede (82 reais) com KPIs, busca, filtro por UF e paginação.
 *  A franqueadora (admin_geral) vê todas; demais papéis veem o que a RLS permite. */
export default async function UnidadesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeGerir = ehAdmin(ctx?.papel) || ctx?.papel === 'proprietario'

  const busca = (sp.q || '').trim()
  const uf = (sp.uf || '').trim().toUpperCase()
  const status = sp.status === 'inativa' ? 'inativa' : sp.status === 'ativa' ? 'ativa' : ''
  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais sobre o universo visível (count exato por status, sem trazer linhas) ──
  const [{ count: totalCount }, { count: ativasCount }] = await Promise.all([
    sb.from('unidades').select('id', { count: 'exact', head: true }),
    sb.from('unidades').select('id', { count: 'exact', head: true }).eq('ativa', true),
  ])
  const total = totalCount ?? 0
  const ativas = ativasCount ?? 0
  const inativas = Math.max(0, total - ativas)

  // ── UFs disponíveis para o filtro (distinct em memória; tabela pequena) ──
  const { data: ufRaw } = await sb.from('unidades').select('estado').not('estado', 'is', null)
  const ufs = [...new Set(((ufRaw ?? []) as { estado: string | null }[]).map((r) => (r.estado || '').toUpperCase()).filter(Boolean))].sort()

  // ── Página de unidades (server-side .range + count exato sobre o filtro) ──
  let q = sb
    .from('unidades')
    .select('id, nome, cnpj, endereco, cidade, estado, cep, ativa, bemp_salon_id', { count: 'exact' })
    .order('nome', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)
  if (busca) q = q.or(`nome.ilike.%${busca}%,cidade.ilike.%${busca}%,cnpj.ilike.%${busca}%`)
  if (uf) q = q.eq('estado', uf)
  if (status === 'ativa') q = q.eq('ativa', true)
  else if (status === 'inativa') q = q.eq('ativa', false)

  const { data: rowsRaw, count } = await q
  const rows = (rowsRaw ?? []) as UnidadeRow[]
  const filtrado = count ?? 0
  const totalPages = Math.max(1, Math.ceil(filtrado / PAGE_SIZE))

  return (
    <UnidadesManager
      rows={rows}
      kpis={{ total, ativas, inativas }}
      ufs={ufs}
      podeGerir={!!podeGerir}
      filtros={{ q: busca, uf, status }}
      page={page}
      totalPages={totalPages}
      total={filtrado}
    />
  )
}
