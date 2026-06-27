import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { one } from '@/lib/sb'
import {
  nfseProvedor, nfseAliquota, nfseConectada, NFSE_POLITICA_DEFAULT,
  NFSE_POR_SESSAO_DEFAULT, type NfsePolitica,
} from '@/lib/nfse'
import { NotasView, type UnidadeFiscal, type NotaRow } from '@/components/notas/NotasView'

export const dynamic = 'force-dynamic'

const PAPEIS_FISCAIS = ['gestor', 'financeiro']

type SP = {
  comp?: string // competência 'YYYY-MM'
  unidade?: string // unidade_id
  tipo?: string // nfse | nfe
  status?: string // autorizada | cancelada | processando | erro
}

export default async function NotasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnitId = ctx?.activeUnitId ?? null
  const podeAdministrar = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_FISCAIS.includes(ctx.papel))

  // ── Política da rede (1 registro por empresa). semTabela = migration ausente. ──
  const { data: polData, error: polErr } = await sb
    .from('nfse_politica')
    .select('politica, por_sessao')
    .limit(1)
  const semTabela = !!polErr && /relation|does not exist|schema cache/i.test(polErr.message || '')
  const polRow = (polData ?? [])[0] as { politica?: string; por_sessao?: boolean } | undefined
  const politica = (polRow?.politica as NfsePolitica) || NFSE_POLITICA_DEFAULT
  const porSessao = polRow?.por_sessao ?? NFSE_POR_SESSAO_DEFAULT

  // ── Unidades da rede (exceto inativas) + config fiscal por unidade. ──
  const { data: uniRaw } = await sb
    .from('unidades')
    .select('id, nome, cidade, estado, ativa')
    .eq('ativa', true)
    .order('nome', { ascending: true })
  type UniRaw = { id: string; nome: string | null; cidade: string | null; estado: string | null }
  const unidadesBase = (uniRaw ?? []) as UniRaw[]

  // Config persistida por unidade (provedor/alíquota/status/ambiente).
  const cfgByUni = new Map<string, { provedor: string | null; aliquota_iss: number | null; status_conexao: string | null; ambiente: string | null }>()
  if (!semTabela && unidadesBase.length > 0) {
    const { data: cfgRaw } = await sb
      .from('nfse_config_unidade')
      .select('unidade_id, provedor, aliquota_iss, status_conexao, ambiente')
      .in('unidade_id', unidadesBase.map((u) => u.id))
    for (const c of (cfgRaw ?? []) as { unidade_id: string; provedor: string | null; aliquota_iss: number | null; status_conexao: string | null; ambiente: string | null }[]) {
      cfgByUni.set(c.unidade_id, { provedor: c.provedor, aliquota_iss: c.aliquota_iss, status_conexao: c.status_conexao, ambiente: c.ambiente })
    }
  }

  // Monta a tabela de integração (config persistida tem prioridade; senão deriva como o legado).
  const unidadesFiscais: UnidadeFiscal[] = unidadesBase.map((u) => {
    const cfg = cfgByUni.get(u.id)
    const conectada = cfg ? cfg.status_conexao === 'conectada' : nfseConectada(u.nome)
    return {
      id: u.id,
      nome: (u.nome || '').trim() || '(sem nome)',
      cidade: u.cidade || '',
      uf: (u.estado || '').toUpperCase(),
      provedor: cfg?.provedor || nfseProvedor(u.cidade),
      aliquota: cfg?.aliquota_iss != null ? Number(cfg.aliquota_iss) : nfseAliquota(u.cidade),
      conectada,
      ambiente: cfg?.ambiente === 'homologacao' ? 'Homologação' : 'Produção',
    }
  })
  const conectadas = unidadesFiscais.filter((u) => u.conectada).length

  // ── KPIs das notas emitidas (count por status + soma de valores). ──
  let notas: NotaRow[] = []
  let kpiEmitidas = 0
  let kpiCanceladas = 0
  let kpiProcessando = 0
  let kpiValorTotal = 0
  if (!semTabela) {
    type Raw = {
      id: string
      numero: string | null
      competencia: string | null
      tipo: string
      fato_gerador: string
      cliente_nome: string | null
      valor: number | null
      status: string
      criado_em: string | null
      cliente?: { nome: string | null } | { nome: string | null }[] | null
    }
    let listQ = sb
      .from('nfse')
      .select('id, numero, competencia, tipo, fato_gerador, cliente_nome, valor, status, criado_em, cliente:clientes(nome)')
      .order('criado_em', { ascending: false, nullsFirst: false })
      .range(0, 199)
    const fUni = (sp.unidade || activeUnitId || '').trim()
    if (fUni) listQ = listQ.eq('unidade_id', fUni)
    if (sp.comp) listQ = listQ.eq('competencia', sp.comp)
    if (sp.tipo === 'nfse' || sp.tipo === 'nfe') listQ = listQ.eq('tipo', sp.tipo)
    if (['autorizada', 'cancelada', 'processando', 'erro'].includes(sp.status || '')) listQ = listQ.eq('status', sp.status!)
    const { data: rowsRaw } = await listQ
    notas = ((rowsRaw ?? []) as Raw[]).map((r) => ({
      id: r.id,
      numero: r.numero,
      competencia: r.competencia,
      tipo: r.tipo,
      fato_gerador: r.fato_gerador,
      clienteNome: r.cliente_nome || one(r.cliente)?.nome || null,
      valor: Number(r.valor) || 0,
      status: r.status,
    }))
    // KPIs (sem filtro de status/tipo) — count por status no escopo de unidade ativa.
    // Tratamos o builder como um tipo leve (CountQuery) para não estourar a
    // profundidade de instanciação do PostgREST no TS (TS2589) — igual à página de OS.
    type CountRes = { count: number | null }
    type CountQuery = { eq(c: string, v: unknown): CountQuery }
    const base = (): CountQuery => {
      let q = sb.from('nfse').select('id', { count: 'exact', head: true }) as unknown as CountQuery
      if (activeUnitId) q = q.eq('unidade_id', activeUnitId)
      return q
    }
    const [emRes, caRes, prRes] = await Promise.all([
      base().eq('status', 'autorizada') as unknown as PromiseLike<CountRes>,
      base().eq('status', 'cancelada') as unknown as PromiseLike<CountRes>,
      base().eq('status', 'processando') as unknown as PromiseLike<CountRes>,
    ])
    kpiEmitidas = emRes.count ?? 0
    kpiCanceladas = caRes.count ?? 0
    kpiProcessando = prRes.count ?? 0
    // Soma de valores das notas autorizadas (no escopo da unidade ativa).
    let valQ = sb.from('nfse').select('valor').eq('status', 'autorizada')
    if (activeUnitId) valQ = valQ.eq('unidade_id', activeUnitId)
    const { data: valRows } = await valQ.range(0, 4999)
    kpiValorTotal = ((valRows ?? []) as { valor: number | null }[]).reduce((a, r) => a + (Number(r.valor) || 0), 0)
  }

  // ── Clientes p/ o modal de emissão manual (cap leve). ──
  const { data: cliRaw } = await sb
    .from('clientes')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .range(0, 999)
  const clientes = ((cliRaw ?? []) as { id: string; nome: string | null }[]).map((c) => ({ id: c.id, nome: c.nome || '(sem nome)' }))

  return (
    <NotasView
      semTabela={semTabela}
      podeAdministrar={!!podeAdministrar}
      politica={politica}
      porSessao={porSessao}
      unidades={unidadesFiscais}
      conectadas={conectadas}
      notas={notas}
      kpis={{ emitidas: kpiEmitidas, valorTotal: kpiValorTotal, canceladas: kpiCanceladas, processando: kpiProcessando }}
      clientes={clientes}
      activeUnitId={activeUnitId}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
      filtros={{ comp: sp.comp || '', unidade: sp.unidade || '', tipo: sp.tipo || '', status: sp.status || '' }}
    />
  )
}
