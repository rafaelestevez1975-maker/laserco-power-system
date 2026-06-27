import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ClientesFiltros } from '@/components/clientes/ClientesFiltros'
import { ClientesList, type ClienteRow } from '@/components/clientes/ClientesList'
import { NovoClienteModal } from '@/components/clientes/NovoClienteModal'

const PAGE_SIZE = 25

type SP = {
  q?: string
  ativo?: string // 'sim' | 'nao' | '' (todos)
  verificado?: string // 'sim' | 'nao' | ''
  cidade?: string
  estado?: string
  page?: string
}

// Papéis que podem cadastrar/inativar (gate de UI; o servidor revalida).
const PAPEIS_ESCRITA = ['admin_geral', 'gerente', 'recepcao', 'colaborador']

export default async function ClientesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { q, ativo = 'sim', verificado, cidade, estado, page: pageRaw } = sp
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais (head:true → só count, sem puxar linhas) ──
  const scoped = (cols: string) => {
    let qy = sb.from('clientes').select(cols, { count: 'exact', head: true })
    if (activeUnit) qy = qy.eq('unidade_origem_id', activeUnit)
    return qy
  }
  const inicioMes = (() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
  })()

  const [totalRes, ativosRes, verifRes, novosRes] = await Promise.all([
    scoped('id'),
    scoped('id').eq('ativo', true),
    scoped('id').eq('verificado', true),
    scoped('id').gte('criado_em', inicioMes),
  ])
  const kpiTotal = totalRes.count ?? 0
  const kpiAtivos = ativosRes.count ?? 0
  const kpiVerif = verifRes.count ?? 0
  const kpiNovos = novosRes.count ?? 0

  // ── Lista paginada server-side ──
  let query = sb
    .from('clientes')
    .select('id, nome, telefone, cpf, email, cidade, estado, saldo_pontos, saldo_creditos, ativo, verificado', { count: 'exact' })
    .order('nome', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (activeUnit) query = query.eq('unidade_origem_id', activeUnit)
  if (ativo === 'sim') query = query.eq('ativo', true)
  else if (ativo === 'nao') query = query.eq('ativo', false)
  if (verificado === 'sim') query = query.eq('verificado', true)
  else if (verificado === 'nao') query = query.eq('verificado', false)
  if (cidade) query = query.ilike('cidade', `%${cidade}%`)
  if (estado) query = query.ilike('estado', `%${estado}%`)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) {
      const dig = qs.replace(/\D/g, '')
      const ors = [`nome.ilike.%${qs}%`, `email.ilike.%${qs}%`]
      if (dig) { ors.push(`cpf.ilike.%${dig}%`, `telefone.ilike.%${dig}%`) }
      query = query.or(ors.join(','))
    }
  }

  const { data, count } = await query
  const clientes = (data ?? []) as ClienteRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(q || verificado || cidade || estado || ativo !== 'sim')

  // unidade padrão sugerida no modal de novo cliente
  const unidadeSugerida = activeUnit ?? (ctx?.unidades?.[0]?.id ?? null)

  return (
    <div className="view active">
      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
        {/* TODO(legado): Importar clientes CSV/XLSX (buildClientes / impDoImport, legacy 3241-3324) */}
        <button className="btn" disabled title="Importação de planilha — em desenvolvimento">
          <i className="ti ti-file-import" /> Importar
        </button>
        {podeEscrever && (
          <NovoClienteModal unidades={ctx?.unidades ?? []} unidadeSugerida={unidadeSugerida} isAdmin={ctx?.isAdmin ?? false} activeUnitId={activeUnit} />
        )}
      </div>

      {/* KPIs reais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Total de clientes', kpiTotal, 'ti-users'],
          ['Ativos', kpiAtivos, 'ti-user-check'],
          ['Verificados', kpiVerif, 'ti-rosette-discount-check'],
          ['Novos no mês', kpiNovos, 'ti-user-plus'],
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

      <ClientesFiltros />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} cliente(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages.toLocaleString('pt-BR')}
        {activeUnit ? ` · ${ctx?.activeUnitName}` : ' · todas as unidades'}
      </div>

      <ClientesList clientes={clientes} page={page} totalPages={totalPages} basePath="/clientes" searchParams={sp} />
    </div>
  )
}
