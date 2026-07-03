import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { DesempenhoManager } from '@/components/desempenho/DesempenhoManager'
import type { AvaliacaoRow, PdiRow, MetaResumo, ColabOpt } from '@/components/desempenho/tipos'

export const dynamic = 'force-dynamic'

// Papéis que podem registrar/editar avaliações e PDIs (gate de UI; o servidor revalida).
const PAPEIS_ESCRITA = ['gestor', 'gerente', 'rh']

/**
 * RH · Desempenho  módulo REAL (substitui o snapshot estático do protótipo).
 *
 * Tabelas: avaliacoes_desempenho, pdi, metas_colaborador (resumo). Nenhuma tem coluna
 * unidade_id → o escopo multitenant é aplicado via os colaboradores da unidade ativa
 * (filtramos colaboradores por unidade_id e só trazemos registros desses colaboradores).
 */
export default async function DesempenhoPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnitId = ctx?.activeUnitId ?? null
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // ── Colaboradores ativos da unidade ativa (multitenant via colaborador) ──
  let cq = sb.from('colaboradores').select('id, nome, cargo, unidade_id').eq('status', 'ativo').order('nome', { ascending: true }).limit(500)
  if (activeUnitId) cq = cq.eq('unidade_id', activeUnitId)
  const { data: colabRaw } = await cq
  const colaboradores: ColabOpt[] = ((colabRaw ?? []) as { id: string; nome: string; cargo: string | null }[])
    .map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo }))
  const mapaColab = new Map(colaboradores.map((c) => [c.id, c.nome]))
  const colabIds = colaboradores.map((c) => c.id)

  // Se há unidade ativa mas nenhum colaborador, não há registros a mostrar.
  const semDados = !!activeUnitId && colabIds.length === 0
  const restringe = !!activeUnitId && colabIds.length > 0

  // ── Avaliações de desempenho ──
  let avaliacoes: AvaliacaoRow[] = []
  if (!semDados) {
    let aq = sb
      .from('avaliacoes_desempenho')
      .select('id, colaborador_id, avaliador_id, periodo, nota_produtividade, nota_qualidade, nota_comportamento, nota_trabalho_equipe, nota_geral, observacoes, criado_em')
      .order('criado_em', { ascending: false })
      .limit(500)
    if (restringe) aq = aq.in('colaborador_id', colabIds)
    const { data: avalRaw } = await aq
    avaliacoes = ((avalRaw ?? []) as Omit<AvaliacaoRow, 'colaboradorNome'>[]).map((a) => ({
      ...a,
      colaboradorNome: mapaColab.get(a.colaborador_id) ?? '',
    }))
  }

  // ── PDIs ──
  let pdis: PdiRow[] = []
  if (!semDados) {
    let pq = sb
      .from('pdi')
      .select('id, colaborador_id, responsavel_id, titulo, descricao, prazo, status, progresso, criado_em, atualizado_em')
      .order('criado_em', { ascending: false })
      .limit(500)
    if (restringe) pq = pq.in('colaborador_id', colabIds)
    const { data: pdiRaw } = await pq
    pdis = ((pdiRaw ?? []) as Omit<PdiRow, 'colaboradorNome'>[]).map((p) => ({
      ...p,
      colaboradorNome: mapaColab.get(p.colaborador_id) ?? '',
    }))
  }

  // ── Metas (resumo  CRUD completo vive em /cadastros/metas) ──
  let metas: MetaResumo[] = []
  if (!semDados) {
    let mq = sb
      .from('metas_colaborador')
      .select('id, colaborador_id, indicador, valor_alvo, valor_realizado, status')
      .order('criado_em', { ascending: false })
      .limit(500)
    if (restringe) mq = mq.in('colaborador_id', colabIds)
    const { data: metasRaw } = await mq
    metas = ((metasRaw ?? []) as Omit<MetaResumo, 'colaboradorNome'>[]).map((m) => ({
      ...m,
      colaboradorNome: mapaColab.get(m.colaborador_id) ?? '',
    }))
  }

  // ── KPIs reais ──
  const notasGerais = avaliacoes.map((a) => a.nota_geral).filter((n): n is number => n != null)
  const notaMedia = notasGerais.length > 0 ? notasGerais.reduce((a, b) => a + b, 0) / notasGerais.length : null
  // Colaboradores ativos que ainda não têm nenhuma avaliação registrada.
  const avaliados = new Set(avaliacoes.map((a) => a.colaborador_id))
  const semAvaliacao = colaboradores.filter((c) => !avaliados.has(c.id)).length
  const pdisAtivos = pdis.filter((p) => p.status !== 'concluido' && p.status !== 'cancelado').length
  const metasBatidas = metas.filter((m) => (m.valor_alvo ?? 0) > 0 && (m.valor_realizado ?? 0) >= (m.valor_alvo ?? 0)).length

  return (
    <DesempenhoManager
      avaliacoes={avaliacoes}
      pdis={pdis}
      metas={metas}
      colaboradores={colaboradores}
      podeEscrever={podeEscrever}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
      kpis={{
        avaliacoes: avaliacoes.length,
        notaMedia,
        colaboradores: colaboradores.length,
        semAvaliacao,
        pdisAtivos,
        metasBatidas,
      }}
    />
  )
}
