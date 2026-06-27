import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ColaboradoresFiltros } from '@/components/colaboradores/ColaboradoresFiltros'
import { ColaboradoresList, type ColaboradorRow } from '@/components/colaboradores/ColaboradoresList'
import { NovoColaboradorModal } from '@/components/colaboradores/NovoColaboradorModal'

const PAGE_SIZE = 25

type SP = {
  q?: string
  status?: string // 'ativo' | 'inativo' | '' (todos)
  regime?: string // 'clt' | 'pj' | ''
  cargo?: string
  area?: string
  page?: string
}

// Papéis que podem cadastrar/inativar (gate de UI; o servidor revalida).
const PAPEIS_ESCRITA = ['admin_geral', 'gerente', 'recepcao']

export default async function ColaboradoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { q, status = 'ativo', regime, cargo, area, page: pageRaw } = sp
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais (head:true → só count) ──
  const scoped = (cols: string) => {
    let qy = sb.from('colaboradores').select(cols, { count: 'exact', head: true })
    if (activeUnit) qy = qy.eq('unidade_id', activeUnit)
    return qy
  }
  const [totalRes, ativosCltRes, ativosPjRes, inativosRes] = await Promise.all([
    scoped('id'),
    scoped('id').eq('status', 'ativo').eq('regime', 'clt'),
    scoped('id').eq('status', 'ativo').eq('regime', 'pj'),
    scoped('id').eq('status', 'inativo'),
  ])
  const kpiTotal = totalRes.count ?? 0
  const kpiAtivosClt = ativosCltRes.count ?? 0
  const kpiAtivosPj = ativosPjRes.count ?? 0
  const kpiInativos = inativosRes.count ?? 0

  // ── Lista paginada server-side ──
  let query = sb
    .from('colaboradores')
    .select('id, nome, cpf, telefone, email, cargo, area, departamento, regime, tipo, status, data_admissao', { count: 'exact' })
    .order('nome', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (activeUnit) query = query.eq('unidade_id', activeUnit)
  if (status === 'ativo') query = query.eq('status', 'ativo')
  else if (status === 'inativo') query = query.eq('status', 'inativo')
  if (regime === 'clt' || regime === 'pj') query = query.eq('regime', regime)
  if (cargo) query = query.eq('cargo', cargo)
  if (area) query = query.ilike('area', `%${area}%`)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) {
      const d = qs.replace(/\D/g, '')
      const ors = [`nome.ilike.%${qs}%`, `email.ilike.%${qs}%`, `cargo.ilike.%${qs}%`]
      if (d) { ors.push(`cpf.ilike.%${d}%`, `telefone.ilike.%${d}%`) }
      query = query.or(ors.join(','))
    }
  }

  const { data, count } = await query
  const colaboradores = (data ?? []) as ColaboradorRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(q || regime || cargo || area || status !== 'ativo')

  // Áreas distintas para o filtro (do escopo atual). Best-effort: amostra de até 1000.
  let areaQuery = sb.from('colaboradores').select('area').not('area', 'is', null).limit(1000)
  if (activeUnit) areaQuery = areaQuery.eq('unidade_id', activeUnit)
  const { data: areasRaw } = await areaQuery
  const areas = [...new Set(((areasRaw ?? []) as { area: string | null }[]).map((r) => r.area).filter((a): a is string => !!a))].sort()

  const unidadeSugerida = activeUnit ?? (ctx?.unidades?.[0]?.id ?? null)

  return (
    <div className="view active">
      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
        {podeEscrever && (
          <NovoColaboradorModal unidades={ctx?.unidades ?? []} unidadeSugerida={unidadeSugerida} isAdmin={ctx?.isAdmin ?? false} activeUnitId={activeUnit} />
        )}
      </div>

      {/* KPIs reais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Total', kpiTotal, 'ti-users'],
          ['Ativos CLT', kpiAtivosClt, 'ti-id-badge-2'],
          ['Ativos PJ', kpiAtivosPj, 'ti-briefcase'],
          ['Inativos', kpiInativos, 'ti-user-off'],
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

      <ColaboradoresFiltros areas={areas} />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} colaborador(es){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages.toLocaleString('pt-BR')}
        {activeUnit ? ` · ${ctx?.activeUnitName}` : ' · todas as unidades'}
      </div>

      <ColaboradoresList colaboradores={colaboradores} page={page} totalPages={totalPages} basePath="/colaboradores" searchParams={sp} />
    </div>
  )
}
