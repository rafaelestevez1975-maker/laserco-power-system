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
  tipo_preco?: string // '' (todos) | 'fixo' | 'variavel' | 'gratuito'
  comiss?: string // '' (todos) | 'sim' | 'nao'
  page?: string
}

export default async function ServicosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { q, grupo, ativo = 'sim', tipo_preco = '', comiss = '', page: pageRaw } = sp
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais (head:true → só count)  catálogo por empresa, sem escopo de unidade ──
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

  // ── Grupos: fonte ÚNICA com a tela /cadastros/grupo-servicos ──
  // A lista de grupos é o catálogo real (tabela grupo_servicos) UNIDO aos valores de
  // servicos.grupo. Assim as duas telas concordam: um grupo cadastrado sem serviço aparece
  // aqui com contagem 0, e um grupo livre digitado em servicos.grupo (que não exista na
  // tabela) aparece nas duas. Antes /servicos ignorava a tabela e os números divergiam.
  // range() explícito: sem ele o PostgREST corta em 1000 linhas silenciosamente, o que
  // truncaria a contagem de grupos e divergiria dos KPIs (count:exact) se o catálogo crescer.
  const [gruposServRes, gruposTabRes] = await Promise.all([
    sb.from('servicos').select('grupo, ativo').range(0, 49999),
    sb.from('grupo_servicos').select('nome, ativo').order('ordem', { ascending: true }).order('nome', { ascending: true }),
  ])
  const gruposRaw = gruposServRes.data
  const contagem = new Map<string, { total: number; ativos: number }>()
  // Semeia com os grupos cadastrados na tabela (ativos), para que apareçam mesmo com 0 serviços.
  for (const g of (gruposTabRes.data ?? []) as { nome: string | null; ativo: boolean | null }[]) {
    if (g.ativo === false) continue
    const nome = (g.nome || '').trim()
    if (nome && !contagem.has(nome)) contagem.set(nome, { total: 0, ativos: 0 })
  }
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
  // Tipo de preço: Fixo = preço fixo > 0 · Variável = preço dinâmico · Gratuito = preço 0
  if (tipo_preco === 'fixo') query = query.eq('dynamic_price', false).gt('preco_padrao', 0)
  else if (tipo_preco === 'variavel') query = query.eq('dynamic_price', true)
  else if (tipo_preco === 'gratuito') query = query.eq('preco_padrao', 0)
  // Comissionável (Sim/Não)
  if (comiss === 'sim') query = query.eq('comissionavel', true)
  else if (comiss === 'nao') query = query.eq('comissionavel', false)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) query = query.or(`nome.ilike.%${qs}%,descricao.ilike.%${qs}%`)
  }

  const { data, count } = await query
  const servicos = (data ?? []) as ServicoRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(q || grupo || ativo !== 'sim' || tipo_preco || comiss)

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
