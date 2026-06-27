import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ProdutosFiltros } from '@/components/produtos/ProdutosFiltros'
import { ProdutosList, type ProdutoRow } from '@/components/produtos/ProdutosList'
import { ProdutoModalNovo } from '@/components/produtos/ProdutoModal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

// Papéis que podem cadastrar/editar/inativar produto (admin sempre passa).
const PAPEIS_ESCRITA = ['gestor']

type SP = {
  q?: string
  grupo?: string
  ativo?: string // 'sim' (default) | 'nao' | '' (todos)
  page?: string
}

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { q, grupo, ativo = 'sim', page: pageRaw } = sp
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais (head:true → só count). Catálogo por empresa, sem escopo de unidade ──
  const base = () => sb.from('produtos').select('id', { count: 'exact', head: true })
  const [totalRes, ativosRes] = await Promise.all([base(), base().eq('ativo', true)])
  const kpiTotal = totalRes.count ?? 0
  const kpiAtivos = ativosRes.count ?? 0
  const kpiInativos = kpiTotal - kpiAtivos

  // Produtos abaixo do estoque mínimo (alerta). Tabela costuma ser pequena → busca leve.
  const { data: estoqueRaw } = await sb
    .from('produtos')
    .select('estoque_atual, estoque_minimo')
    .eq('ativo', true)
  const kpiBaixoEstoque = ((estoqueRaw ?? []) as { estoque_atual: number | null; estoque_minimo: number | null }[])
    .filter((r) => (r.estoque_minimo ?? 0) > 0 && (r.estoque_atual ?? 0) <= (r.estoque_minimo ?? 0)).length

  // ── Grupos = valores distintos de produtos.grupo ──
  const { data: gruposRaw } = await sb.from('produtos').select('grupo')
  const grupos = [...new Set(((gruposRaw ?? []) as { grupo: string | null }[])
    .map((r) => (r.grupo || '').trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  // ── Lista paginada server-side ──
  let query = sb
    .from('produtos')
    .select('id, nome, grupo, descricao, preco_padrao, desc_max, custo, estoque_atual, estoque_minimo, feedstock, ativo', { count: 'exact' })
    .order('nome', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (grupo) query = query.eq('grupo', grupo)
  if (ativo === 'sim') query = query.eq('ativo', true)
  else if (ativo === 'nao') query = query.eq('ativo', false)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) query = query.or(`nome.ilike.%${qs}%,descricao.ilike.%${qs}%`)
  }

  const { data, count } = await query
  const produtos = (data ?? []) as ProdutoRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(q || grupo || ativo !== 'sim')
  const catalogoVazio = kpiTotal === 0

  return (
    <div className="view active">
      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
        {podeEscrever && <ProdutoModalNovo grupos={grupos} />}
      </div>

      {/* KPIs reais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Total de produtos', kpiTotal, 'ti-package'],
          ['Ativos', kpiAtivos, 'ti-circle-check'],
          ['Inativos', kpiInativos, 'ti-circle-off'],
          ['Estoque baixo', kpiBaixoEstoque, 'ti-alert-triangle'],
        ] as [string, number, string][]).map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      {catalogoVazio ? (
        <div className="rel-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <i className="ti ti-package" style={{ fontSize: 30, display: 'block', marginBottom: 10 }} />
          <b style={{ fontSize: 15, color: 'var(--text-2)' }}>Nenhum produto cadastrado ainda</b>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            O catálogo de produtos está vazio.
            {podeEscrever ? ' Use o botão “Novo produto” acima para começar.' : ' Peça a um gestor para cadastrar.'}
          </p>
        </div>
      ) : (
        <>
          <ProdutosFiltros grupos={grupos} />

          <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
            <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} produto(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages.toLocaleString('pt-BR')}
          </div>

          <ProdutosList
            produtos={produtos}
            grupos={grupos}
            page={page}
            totalPages={totalPages}
            total={total}
            searchParams={sp}
            podeEscrever={podeEscrever}
          />
        </>
      )}
    </div>
  )
}
