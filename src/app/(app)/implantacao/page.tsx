import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import type { EtapaImpl, ProjetoImpl, TarefaImpl } from '@/lib/implantacao'
import { ImplantacaoView } from '@/components/implantacao/ImplantacaoView'

export const dynamic = 'force-dynamic'

const PAPEIS_EDITA = ['gestor']

export default async function ImplantacaoPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEditar = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_EDITA.includes(ctx.papel))
  const activeUnitId = ctx?.activeUnitId ?? null

  // ── 1) Projeto: o da unidade ativa, ou o mais recente quando vendo "todas". ──
  let projQ = sb
    .from('implantacao_projetos')
    .select('id, nome, inicio, inauguracao, status')
    .order('criado_em', { ascending: false })
    .limit(1)
  if (activeUnitId) projQ = projQ.eq('unidade_id', activeUnitId)
  const { data: projData, error: projErr } = await projQ
  const projeto = ((projData ?? [])[0] as ProjetoImpl | undefined) ?? null

  // Banner de migration ausente (tabela não existe) vs simplesmente sem projeto.
  const semTabela = !!projErr && /relation|does not exist|schema cache/i.test(projErr.message || '')

  let etapas: EtapaImpl[] = []
  if (projeto) {
    const { data: etapasData } = await sb
      .from('implantacao_etapas')
      .select('id, projeto_id, cod, nome, ordem')
      .eq('projeto_id', projeto.id)
      .order('ordem', { ascending: true })
    const etapasBase = (etapasData ?? []) as Omit<EtapaImpl, 'tarefas'>[]

    const etapaIds = etapasBase.map((e) => e.id)
    const tarefasByEtapa = new Map<string, TarefaImpl[]>()
    if (etapaIds.length > 0) {
      const { data: tarData } = await sb
        .from('implantacao_tarefas')
        .select('id, etapa_id, cod, descricao, responsavel, duracao_dias, situacao, ordem')
        .in('etapa_id', etapaIds)
        .order('ordem', { ascending: true })
      for (const t of (tarData ?? []) as TarefaImpl[]) {
        const arr = tarefasByEtapa.get(t.etapa_id) ?? []
        arr.push(t)
        tarefasByEtapa.set(t.etapa_id, arr)
      }
    }
    etapas = etapasBase.map((e) => ({ ...e, tarefas: tarefasByEtapa.get(e.id) ?? [] }))
  }

  return (
    <ImplantacaoView
      projeto={projeto}
      etapas={etapas}
      podeEditar={podeEditar}
      semTabela={semTabela}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
    />
  )
}
