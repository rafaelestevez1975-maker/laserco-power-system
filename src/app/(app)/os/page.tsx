import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { one } from '@/lib/sb'
import { OsFiltros } from '@/components/os/OsFiltros'
import { OsList, type OsRow } from '@/components/os/OsList'
import { NovaOSButton } from '@/components/os/NovaOSModal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const PAPEIS_ESCRITA = ['operacoes', 'gestor']

type SP = {
  status?: string // aberta | fechada | cancelada
  cliente?: string // cliente_id
  colaborador?: string // criado_por (perfil)
  origem?: string
  di?: string // criado_em >= (data)
  df?: string // criado_em <= (data)
  page?: string
}

const STATUS_FILTRO = ['aberta', 'fechada', 'cancelada'] as const

/** Builder mínimo usado pelos filtros — evita a explosão de tipos do PostgREST (TS2589). */
type FiltroQuery = {
  eq(c: string, v: unknown): FiltroQuery
  gte(c: string, v: unknown): FiltroQuery
  lte(c: string, v: unknown): FiltroQuery
}

/**
 * Aplica filtros comuns (unidade, status, cliente, colaborador, origem, período de criação).
 * `incluiStatus=false` omite o filtro de status (usado nos KPIs por status).
 */
function aplicarFiltros<Q extends FiltroQuery>(q: Q, unidadeId: string | null, sp: SP, incluiStatus = true): Q {
  let out: FiltroQuery = q
  if (unidadeId) out = out.eq('unidade_id', unidadeId)
  if (incluiStatus && sp.status && (STATUS_FILTRO as readonly string[]).includes(sp.status)) out = out.eq('status', sp.status)
  if (sp.cliente) out = out.eq('cliente_id', sp.cliente)
  if (sp.colaborador) out = out.eq('criado_por', sp.colaborador)
  if (sp.origem) out = out.eq('origem', sp.origem)
  if (sp.di) out = out.gte('criado_em', `${sp.di}T00:00:00`)
  if (sp.df) out = out.lte('criado_em', `${sp.df}T23:59:59`)
  return out as Q
}

export default async function OsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais por status (head:true → só count), respeitando filtros ATIVOS exceto o próprio status ──
  // O builder do PostgREST é tipado de forma recursiva; tratamos como FiltroQuery (que devolve
  // uma Promise ao await) para não estourar a profundidade de instanciação do TS (TS2589).
  type CountResult = { count: number | null }
  const kpiBase = (): FiltroQuery =>
    aplicarFiltros(sb.from('os').select('id', { count: 'exact', head: true }) as unknown as FiltroQuery, unidadeId, sp, false)
  const [abertasRes, fechadasRes, canceladasRes] = await Promise.all([
    kpiBase().eq('status', 'aberta') as unknown as PromiseLike<CountResult>,
    kpiBase().eq('status', 'fechada') as unknown as PromiseLike<CountResult>,
    kpiBase().eq('status', 'cancelada') as unknown as PromiseLike<CountResult>,
  ])
  const kpiAbertas = abertasRes.count ?? 0
  const kpiFechadas = fechadasRes.count ?? 0
  const kpiCanceladas = canceladasRes.count ?? 0

  // ── Lista paginada server-side (embed do cliente p/ nome) ──
  type Raw = {
    id: string
    numero: number | null
    status: string
    origem: string | null
    total: number | null
    valor_pago: number | null
    valor_pendente: number | null
    desconto_total: number | null
    observacao: string | null
    criado_em: string | null
    fechada_em: string | null
    cancelada_em: string | null
    cliente_id: string | null
    criado_por: string | null
    cliente?: { nome: string | null } | { nome: string | null }[] | null
    responsavel?: { nome_completo: string | null } | { nome_completo: string | null }[] | null
  }

  const listQ = sb
    .from('os')
    .select(
      'id, numero, status, origem, total, valor_pago, valor_pendente, desconto_total, observacao, criado_em, fechada_em, cancelada_em, cliente_id, criado_por, cliente:clientes(nome), responsavel:perfis_usuario!os_criado_por_fkey(nome_completo)',
      { count: 'exact' },
    )
    .order('criado_em', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1)
  // Filtramos pelo tipo leve (FiltroQuery) e tratamos o await como o shape esperado — evita TS2589.
  const listFiltrada = aplicarFiltros(listQ as unknown as FiltroQuery, unidadeId, sp) as unknown as PromiseLike<{ data: Raw[] | null; count: number | null }>
  const { data: rowsRaw, count } = await listFiltrada

  const rows: OsRow[] = ((rowsRaw ?? []) as Raw[]).map((r) => ({
    id: r.id,
    numero: r.numero,
    status: r.status,
    origem: r.origem,
    total: r.total,
    valor_pago: r.valor_pago,
    valor_pendente: r.valor_pendente,
    desconto_total: r.desconto_total,
    observacao: r.observacao,
    criado_em: r.criado_em,
    fechada_em: r.fechada_em,
    cancelada_em: r.cancelada_em,
    cliente_id: r.cliente_id,
    clienteNome: one(r.cliente)?.nome ?? null,
    responsavelNome: one(r.responsavel)?.nome_completo ?? null,
  }))
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Listas auxiliares p/ filtros e modal (clientes/colaboradores/serviços) ──
  // Clientes ativos (cap leve) — só p/ os <select> de filtro e o picker de nova OS.
  const { data: clientesRaw } = await sb
    .from('clientes')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .range(0, 999)
  const clientes = ((clientesRaw ?? []) as { id: string; nome: string | null }[]).map((c) => ({ id: c.id, nome: c.nome || '(sem nome)' }))

  const { data: colabRaw } = await sb
    .from('perfis_usuario')
    .select('id, nome_completo')
    .eq('ativo', true)
    .order('nome_completo', { ascending: true })
    .range(0, 499)
  const colaboradores = ((colabRaw ?? []) as { id: string; nome_completo: string | null }[]).map((c) => ({ id: c.id, nome: c.nome_completo || '(sem nome)' }))

  const { data: servRaw } = await sb
    .from('servicos')
    .select('id, nome, preco_padrao')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .range(0, 999)
  const servicos = ((servRaw ?? []) as { id: string; nome: string | null; preco_padrao: number | null }[]).map((s) => ({
    id: s.id,
    nome: s.nome || '(sem nome)',
    preco: Number(s.preco_padrao) || 0,
  }))

  const temFiltro = !!(sp.status || sp.cliente || sp.colaborador || sp.origem || sp.di || sp.df)

  return (
    <div className="view active">
      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
        {podeEscrever && (
          <NovaOSButton
            activeUnitId={unidadeId}
            activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
            clientes={clientes}
          />
        )}
      </div>

      {/* KPIs reais por status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Abertas', kpiAbertas, 'ti-clipboard-list', 'var(--amber)'],
          ['Fechadas', kpiFechadas, 'ti-clipboard-check', 'var(--green)'],
          ['Canceladas', kpiCanceladas, 'ti-clipboard-x', 'var(--red)'],
        ] as [string, number, string, string][]).map(([label, val, icon, color]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50, #F7E7EB)', color, flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      <OsFiltros clientes={clientes} colaboradores={colaboradores} />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} OS{temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages.toLocaleString('pt-BR')}
        {!unidadeId && <span style={{ marginLeft: 10, color: 'var(--amber)' }}><i className="ti ti-alert-triangle" /> Selecione uma unidade para abrir novas OS.</span>}
      </div>

      <OsList
        rows={rows}
        page={page}
        totalPages={totalPages}
        total={total}
        searchParams={sp as Record<string, string | undefined>}
        podeEscrever={podeEscrever}
        activeUnitId={unidadeId}
        servicos={servicos}
      />
    </div>
  )
}
