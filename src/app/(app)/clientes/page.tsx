import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ClientesFiltros } from '@/components/clientes/ClientesFiltros'
import { ClientesList, type ClienteRow } from '@/components/clientes/ClientesList'
import { NovoClienteModal } from '@/components/clientes/NovoClienteModal'
import { ImportarClientesModal } from '@/components/clientes/ImportarClientesModal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

type SP = {
  q?: string
  ativo?: string // 'sim' | 'nao' | '' (todos)
  verificado?: string // 'sim' | 'nao' | ''
  genero?: string // 'female' | 'male' | 'other' | ''
  doc?: string // 'cpf' | 'rg' | 'sem' — tipo de documento (paridade BEMP)
  arquivos?: string // 'com' | 'contrato' | 'sem' — fotos/contratos do BEMP (contadores denormalizados)
  bloqueado?: string // 'sim' | 'nao' | '' — coluna direta clientes.bloqueado (paridade BEMP)
  app?: string // 'sim' | 'nao' | '' — coluna direta clientes.tem_app (paridade BEMP)
  cidade?: string
  estado?: string
  unidade?: string // id de unidade (admin filtra entre todas)
  page?: string
}

// Papéis que podem cadastrar/inativar (gate de UI; o servidor revalida).
const PAPEIS_ESCRITA = ['admin_geral', 'sac', 'crm', 'operacoes'] // alinhado à RLS de escrita de clientes

export default async function ClientesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { q, ativo = 'sim', verificado, genero, doc, arquivos, bloqueado, app, cidade, estado, unidade, page: pageRaw } = sp
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const isAdmin = ctx?.isAdmin ?? false
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // Paridade BEMP: a lista de clientes é da ORGANIZAÇÃO (RLS limita o franqueado à sua base);
  // unidade só filtra quando escolhida explicitamente no filtro. O escopo implícito pela unidade
  // ativa zerava a tela: o import do BEMP não traz cliente→unidade (unidade_origem_id é NULL
  // em toda a base até o re-sync via Postgres).
  const unidadeFiltro = unidade || null

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  // ── KPIs reais (head:true → só count, sem puxar linhas) ──
  const scoped = (cols: string) => {
    // 'estimated' usa a estatística do Postgres (instantâneo)  'exact' fazia COUNT(*)
    // completo sobre ~347k clientes e travava a tela (16s). KPI aproximado é aceitável.
    let qy = sb.from('clientes').select(cols, { count: 'estimated', head: true })
    if (unidadeFiltro) qy = qy.eq('unidade_origem_id', unidadeFiltro)
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
  // Ordena por nome (alfabético, como o BEMP). Isto só é viável porque: (1) existe índice
  // btree em clientes(nome); (2) a RLS de SELECT foi reescrita com (select tem_acesso_cliente_final())
  // — sem isso a função rodava por-linha nas 350k e travava a tela em "0 clientes" (timeout 57014).
  // Contagem: 'estimated' é a estatística do planner — instantânea, mas MENTE quando há filtro
  // (o filtro de arquivos dizia 58.434 onde o real é 8.353). Como todo filtro estreita muito o
  // conjunto e a contagem exata dele custa ~0,7-2s (índices trigram/parciais), usamos 'exact'
  // quando o usuário filtra e 'estimated' só na lista crua (176k, onde ±0,1% não importa).
  const temFiltroEstreito = !!(q || arquivos || verificado || genero || doc || bloqueado || app || cidade || estado || unidadeFiltro)
  let query = sb
    .from('clientes')
    .select('id, nome, telefone, cpf, email, genero, cidade, estado, saldo_pontos, saldo_creditos, ativo, verificado, total_documentos, total_contratos', { count: temFiltroEstreito ? 'exact' : 'estimated' })
    .order('nome', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  if (unidadeFiltro) query = query.eq('unidade_origem_id', unidadeFiltro)
  if (ativo === 'sim') query = query.eq('ativo', true)
  else if (ativo === 'nao') query = query.eq('ativo', false)
  if (verificado === 'sim') query = query.eq('verificado', true)
  else if (verificado === 'nao') query = query.eq('verificado', false)
  if (genero && ['female', 'male', 'other'].includes(genero)) query = query.eq('genero', genero)
  // Tipo de documento (paridade BEMP): CPF preenchido / RG preenchido / sem documento.
  if (doc === 'cpf') query = query.not('cpf', 'is', null)
  else if (doc === 'rg') query = query.not('rg', 'is', null)
  else if (doc === 'sem') query = query.is('cpf', null).is('rg', null)
  // Arquivos do BEMP (fotos/anamneses/contratos): filtro barato via contador denormalizado
  // (clientes.total_documentos / total_contratos, mantidos por trigger em clientes_documentos).
  if (arquivos === 'com') query = query.gt('total_documentos', 0)
  else if (arquivos === 'contrato') query = query.gt('total_contratos', 0)
  else if (arquivos === 'sem') query = query.eq('total_documentos', 0)
  // Bloqueado / Com app (paridade BEMP): colunas booleanas diretas → filtro barato via .eq().
  if (bloqueado === 'sim') query = query.eq('bloqueado', true)
  else if (bloqueado === 'nao') query = query.eq('bloqueado', false)
  if (app === 'sim') query = query.eq('tem_app', true)
  else if (app === 'nao') query = query.eq('tem_app', false)
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

  const { data, count, error: listErr } = await query
  const clientes = (data ?? []) as ClienteRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(q || verificado || genero || doc || bloqueado || app || cidade || estado || (isAdmin && unidade) || ativo !== 'sim')

  // unidade padrão sugerida no modal de novo cliente
  const unidadeSugerida = activeUnit ?? (ctx?.unidades?.[0]?.id ?? null)
  const unidadesLista = ctx?.unidades ?? []

  return (
    <div className="view active">
      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 10 }}>
        {podeEscrever && <ImportarClientesModal unidades={unidadesLista} unidadeSugerida={unidadeSugerida} />}
        {podeEscrever && (
          <NovoClienteModal unidades={unidadesLista} unidadeSugerida={unidadeSugerida} isAdmin={isAdmin} activeUnitId={activeUnit} />
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

      <ClientesFiltros unidades={isAdmin ? unidadesLista : []} />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} cliente(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages.toLocaleString('pt-BR')}
        {unidadeFiltro
          ? ` · ${(isAdmin && unidade ? unidadesLista.find((u) => u.id === unidade)?.nome : ctx?.activeUnitName) ?? ''}`
          : ' · todas as unidades'}
      </div>

      {listErr && (
        <div className="alert" style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, padding: '10px 14px', margin: '0 0 10px', fontSize: 13 }}>
          <i className="ti ti-alert-triangle" /> A consulta demorou demais e foi interrompida — refine a busca (nome mais completo, CPF ou telefone) e tente de novo.
        </div>
      )}
      <ClientesList clientes={clientes} page={page} totalPages={totalPages} basePath="/clientes" searchParams={sp} />
    </div>
  )
}
