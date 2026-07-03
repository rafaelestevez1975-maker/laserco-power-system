import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin, temPapel } from '@/lib/rbac'
import { FeriasManager, type FeriasRow, type AtestadoRow, type ColabOpt } from '@/components/ferias/FeriasManager'

export const dynamic = 'force-dynamic'

/** Papéis que gerenciam (aprovam/recusam/lançam p/ terceiros)  legado "Férias e Afastamentos · Gerenciar". */
const PAPEIS_APROVA = ['gestor', 'gerente', 'rh']
const LIMIT = 1000

/**
 * RH · Férias e Ausências (rota /rh/ferias).
 *
 * Solicitações de férias (período aquisitivo, abono pecuniário, aprovação) +
 * atestados médicos (afastamentos, entrega ao RH). Tabelas reais no lkii:
 * solicitacoes_ferias e atestados  sem unidade_id, então o escopo multitenant
 * é feito pelos colaboradores da unidade ativa (colaboradores.unidade_id).
 */
export default async function FeriasPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnitId = ctx?.activeUnitId ?? null
  const podeAprovar = ehAdmin(ctx?.papel) || temPapel(ctx?.papel, ...PAPEIS_APROVA)

  // ── Colaboradores do escopo (nome para exibir + ids para filtro multitenant) ──
  let cq = sb
    .from('colaboradores')
    .select('id, nome, perfil_id')
    .eq('status', 'ativo')
    .order('nome', { ascending: true })
    .limit(2000)
  if (activeUnitId) cq = cq.eq('unidade_id', activeUnitId)
  const { data: colabRaw, error: colabErr } = await cq

  const { data: { user } } = await sb.auth.getUser()
  const colabFull = (colabRaw ?? []) as (ColabOpt & { perfil_id: string | null })[]
  const colaboradores: ColabOpt[] = colabFull.map((c) => ({ id: c.id, nome: c.nome }))
  const mapaColab = new Map(colaboradores.map((c) => [c.id, c.nome]))
  const colabIds = colaboradores.map((c) => c.id)
  const restringe = !!activeUnitId
  const semColab = !!activeUnitId && colabIds.length === 0

  // Colaborador do próprio usuário (perfis_usuario.id = auth.user.id = colaboradores.perfil_id).
  // Usado para pré-selecionar e travar o form quando o usuário não é gestor/RH ("cria o seu").
  const meuColaboradorId = user ? (colabFull.find((c) => c.perfil_id === user.id)?.id ?? null) : null

  let ferias: FeriasRow[] = []
  let atestados: AtestadoRow[] = []
  let erro = colabErr ? 'Não foi possível carregar os colaboradores.' : ''

  // Quando há unidade ativa mas nenhum colaborador, não há o que buscar (.in([]) quebra).
  if (!semColab && !colabErr) {
    let fq = sb
      .from('solicitacoes_ferias')
      .select('id, colaborador_id, periodo_aquisitivo, data_inicio, data_fim, dias_solicitados, vender_dias, status, motivo')
      .order('criado_em', { ascending: false })
      .limit(LIMIT)
    if (restringe) fq = fq.in('colaborador_id', colabIds)

    let aq = sb
      .from('atestados')
      .select('id, colaborador_id, data_inicio, dias, cid, data_entrega, status, observacoes')
      .order('criado_em', { ascending: false })
      .limit(LIMIT)
    if (restringe) aq = aq.in('colaborador_id', colabIds)

    const [{ data: fData, error: fErr }, { data: aData, error: aErr }] = await Promise.all([fq, aq])

    if (fErr || aErr) {
      erro = 'Não foi possível carregar as solicitações de férias/atestados.'
    } else {
      ferias = ((fData ?? []) as Omit<FeriasRow, 'colaboradorNome'>[]).map((r) => ({
        ...r,
        colaboradorNome: mapaColab.get(r.colaborador_id) ?? '',
      }))
      atestados = ((aData ?? []) as Omit<AtestadoRow, 'colaboradorNome'>[]).map((r) => ({
        ...r,
        colaboradorNome: mapaColab.get(r.colaborador_id) ?? '',
      }))
    }
  }

  const kpis = {
    feriasPend: ferias.filter((f) => f.status === 'pendente').length,
    feriasAprov: ferias.filter((f) => f.status === 'aprovada').length,
    atestPend: atestados.filter((a) => a.status === 'pendente').length,
    emFerias: emFeriasHoje(ferias),
  }

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7F0EC', color: '#0f6b3a' }}><i className="ti ti-calendar" /></div>
        <div>
          <h2>Férias e Ausências</h2>
          <p>Solicitações de férias (período aquisitivo, abono pecuniário) e atestados médicos.</p>
        </div>
        <Link href="/rh" className="btn btn-ghost" style={{ marginLeft: 'auto' }}>
          <i className="ti ti-arrow-left" /> Dashboard RH
        </Link>
      </div>

      <FeriasManager
        ferias={ferias}
        atestados={atestados}
        colaboradores={colaboradores}
        meuColaboradorId={meuColaboradorId}
        podeAprovar={podeAprovar}
        erro={erro}
        semColaboradores={semColab}
        activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
        kpis={kpis}
      />
    </div>
  )
}

/** Quantos colaboradores estão de férias HOJE (aprovada + hoje dentro do período). */
function emFeriasHoje(ferias: FeriasRow[]): number {
  const hoje = new Date().toISOString().slice(0, 10)
  return ferias.filter(
    (f) => f.status === 'aprovada' && f.data_inicio && f.data_fim && f.data_inicio <= hoje && f.data_fim >= hoje,
  ).length
}
