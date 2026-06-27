import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ServicosFiltros } from '@/components/servicos/ServicosFiltros'
import { ServicosList, type ServicoRow } from '@/components/servicos/ServicosList'
import { ServicoModalNovo } from '@/components/servicos/ServicoModal'
import { GruposManager } from '@/components/servicos/GruposManager'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

// Papéis que podem cadastrar/editar/inativar serviço (admin sempre passa).
const PAPEIS_ESCRITA = ['gestor']

type SP = {
  q?: string
  grupo?: string
  ativo?: string // 'sim' (default) | 'nao' | '' (todos)
  page?: string
}

export default async function ServicosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { q, grupo, ativo = 'sim', page: pageRaw } = sp
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais (head:true → só count) — catálogo por empresa, sem escopo de unidade ──
  const base = () => sb.from('servicos').select('id', { count: 'exact', head: true })
  const [totalRes, ativosRes, comissRes] = await Promise.all([
    base(),
    base().eq('ativo', true),
    base().eq('comissionavel', true).eq('ativo', true),
  ])
  const kpiTotal = totalRes.count ?? 0
  const kpiAtivos = ativosRes.count ?? 0
  const kpiInativos = kpiTotal - kpiAtivos
  const kpiComiss = comissRes.count ?? 0

  // ── Grupos = valores distintos de servicos.grupo (não há tabela de grupos no backend) ──
  // Puxa só a coluna grupo (148 linhas, leve) e deduplica server-side com contagem.
  const { data: gruposRaw } = await sb.from('servicos').select('grupo, ativo')
  const contagem = new Map<string, { total: number; ativos: number }>()
  for (const r of (gruposRaw ?? []) as { grupo: string | null; ativo: boolean | null }[]) {
    const g = (r.grupo || '').trim()
    if (!g) continue
    const cur = contagem.get(g) ?? { total: 0, ativos: 0 }
    cur.total += 1
    if (r.ativo !== false) cur.ativos += 1
    contagem.set(g, cur)
  }
  const grupos = [...contagem.entries()]
    .map(([nome, c]) => ({ nome, total: c.total, ativos: c.ativos }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const semGrupo = ((gruposRaw ?? []) as { grupo: string | null }[]).filter((r) => !((r.grupo || '').trim())).length

  // ── Lista paginada server-side ──
  let query = sb
    .from('servicos')
    .select('id, nome, grupo, descricao, duracao_min, preco_padrao, desc_max, pagar_comissao, comissionavel, dynamic_price, ativo', { count: 'exact' })
    .order('grupo', { ascending: true, nullsFirst: false })
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
  const servicos = (data ?? []) as ServicoRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(q || grupo || ativo !== 'sim')

  return (
    <div className="view active">
      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
        {podeEscrever && <ServicoModalNovo grupos={grupos.map((g) => g.nome)} />}
      </div>

      {/* KPIs reais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Total de serviços', kpiTotal, 'ti-sparkles'],
          ['Ativos', kpiAtivos, 'ti-circle-check'],
          ['Inativos', kpiInativos, 'ti-circle-off'],
          ['Comissionáveis', kpiComiss, 'ti-coin'],
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

      {/* Grupos de serviços (chips + CRUD de renomear) */}
      <GruposManager grupos={grupos} semGrupo={semGrupo} grupoAtivo={grupo ?? ''} podeEscrever={podeEscrever} />

      <ServicosFiltros grupos={grupos.map((g) => g.nome)} />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} serviço(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages.toLocaleString('pt-BR')}
      </div>

      <ServicosList
        servicos={servicos}
        grupos={grupos.map((g) => g.nome)}
        page={page}
        totalPages={totalPages}
        total={total}
        searchParams={sp}
        podeEscrever={podeEscrever}
      />
    </div>
  )
}
