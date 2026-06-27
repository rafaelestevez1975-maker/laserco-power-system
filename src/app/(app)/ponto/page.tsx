import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { PontoManager, type RegistroRow, type ColabOpt } from '@/components/ponto/PontoManager'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
// Papéis que enxergam o espelho da unidade inteira e podem lançar/ajustar marcações.
const PAPEIS_GESTAO = ['admin_geral', 'gestor', 'gerente', 'recepcao', 'rh']

type SP = {
  colaborador?: string
  tipo?: string
  validacao?: string // '' | 'no_local' | 'fora'
  di?: string // data >=
  df?: string // data <=
  page?: string
}

/** Início (00:00) / fim (23:59:59.999) de um dia local em ISO, ou null. */
function diaISO(d: string | undefined, fim = false): string | null {
  if (!d) return null
  const dt = new Date(d + (fim ? 'T23:59:59.999' : 'T00:00:00'))
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

export default async function PontoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnitId = ctx?.activeUnitId ?? null
  const podeGerir = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_GESTAO.includes(ctx.papel))

  // Colaborador (RH) ligado ao usuário logado — é "o meu ponto".
  const { data: { user } } = await sb.auth.getUser()
  let meuColabId: string | null = null
  if (user) {
    const { data: c } = await sb.from('colaboradores').select('id').eq('perfil_id', user.id).maybeSingle()
    meuColabId = (c as { id?: string } | null)?.id ?? null
  }

  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE
  const iniISO = diaISO(sp.di)
  const fimISO = diaISO(sp.df, true)

  // ── Colaboradores da unidade (p/ filtro + lançamento manual) ──
  let colabQ = sb.from('colaboradores').select('id, nome, cargo, unidade_id').eq('status', 'ativo').order('nome', { ascending: true }).limit(500)
  if (activeUnitId) colabQ = colabQ.eq('unidade_id', activeUnitId)
  const { data: colabRaw } = await colabQ
  const colaboradores = ((colabRaw ?? []) as ColabOpt[])
  const colabNome: Record<string, string> = Object.fromEntries(colaboradores.map((c) => [c.id, c.nome ?? '—']))

  // ── Lista paginada de marcações ──
  // Quem NÃO é gestão só vê o próprio ponto (cada colaborador vê o SEU — legado).
  let listQ = sb
    .from('registros_ponto')
    .select('id, colaborador_id, unidade_id, tipo, data_hora, lat, lng, validado_geo, fonte, ajustado_por, motivo_ajuste', { count: 'exact' })
    .order('data_hora', { ascending: false, nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1)
  if (activeUnitId) listQ = listQ.eq('unidade_id', activeUnitId)
  if (!podeGerir) {
    if (!meuColabId) {
      // Sem vínculo de colaborador e sem gestão → nada a exibir; força conjunto vazio.
      listQ = listQ.eq('colaborador_id', '00000000-0000-0000-0000-000000000000')
    } else {
      listQ = listQ.eq('colaborador_id', meuColabId)
    }
  } else if (sp.colaborador) {
    listQ = listQ.eq('colaborador_id', sp.colaborador)
  }
  if (sp.tipo) listQ = listQ.eq('tipo', sp.tipo)
  if (sp.validacao === 'no_local') listQ = listQ.eq('validado_geo', true)
  else if (sp.validacao === 'fora') listQ = listQ.eq('validado_geo', false)
  if (iniISO) listQ = listQ.gte('data_hora', iniISO)
  if (fimISO) listQ = listQ.lte('data_hora', fimISO)

  const { data: rowsRaw, count } = await listQ
  const rows: RegistroRow[] = ((rowsRaw ?? []) as RegistroRow[]).map((r) => ({
    ...r,
    colaborador_nome: r.colaborador_id ? (colabNome[r.colaborador_id] ?? '—') : '—',
  }))
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── KPIs (de hoje, no escopo visível) ──
  const hojeIni = diaISO(new Date().toISOString().slice(0, 10))
  const hojeFim = diaISO(new Date().toISOString().slice(0, 10), true)
  let kpiQ = sb
    .from('registros_ponto')
    .select('colaborador_id, tipo, validado_geo')
    .gte('data_hora', hojeIni!)
    .lte('data_hora', hojeFim!)
    .limit(2000)
  if (activeUnitId) kpiQ = kpiQ.eq('unidade_id', activeUnitId)
  if (!podeGerir && meuColabId) kpiQ = kpiQ.eq('colaborador_id', meuColabId)
  const { data: kpiRaw } = await kpiQ
  const kpiRows = (kpiRaw ?? []) as { colaborador_id: string | null; tipo: string | null; validado_geo: boolean | null }[]

  const marcacoesHoje = kpiRows.length
  const presentesHoje = new Set(kpiRows.filter((k) => k.tipo === 'entrada').map((k) => k.colaborador_id)).size
  const foraDoLocal = kpiRows.filter((k) => k.validado_geo === false).length
  const noLocal = kpiRows.filter((k) => k.validado_geo === true).length

  return (
    <PontoManager
      rows={rows}
      colaboradores={colaboradores}
      podeGerir={podeGerir}
      meuColabId={meuColabId}
      activeUnitId={activeUnitId}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
      filtros={{ colaborador: sp.colaborador ?? '', tipo: sp.tipo ?? '', validacao: sp.validacao ?? '', di: sp.di ?? '', df: sp.df ?? '' }}
      kpis={{ marcacoesHoje, presentesHoje, noLocal, foraDoLocal }}
      page={page}
      totalPages={totalPages}
      total={total}
    />
  )
}
