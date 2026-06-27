import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { IndiquesManager, type Indicacao } from '@/components/indiques/IndiquesManager'
import { mesRef } from '@/lib/indiques'

export const dynamic = 'force-dynamic'

export default async function IndiquesPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const uniNome = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))
  const mes = mesRef()

  // Filtro de unidade vem do componente; aqui carregamos TODAS as visíveis (RLS) e
  // o componente filtra client-side (legado: select "Todas as unidades").
  let q = sb
    .from('indicacoes')
    .select('id, indicador_nome, indicador_telefone, premio_descricao, status, origem, unidade_id, criado_em, indicacao_indicados(id, nome, telefone, email, status, observacoes)')
    .order('criado_em', { ascending: false })
    .limit(500)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)
  const { data } = await q
  const indicacoes = (data ?? []) as Indicacao[]

  // Prêmio/meta do mês (indique_config) — tolerante à migration não aplicada.
  let premio: { premio: string; valor_ref: string | null; observacao: string | null; meta_mensal: number; unidade_id: string | null } | null = null
  let migrationPendente = false
  {
    let pq = sb.from('indique_config').select('premio, valor_ref, observacao, meta_mensal, unidade_id').eq('mes_ref', mes)
    if (activeUnit) pq = pq.eq('unidade_id', activeUnit)
    const { data: pcfg, error: ePcfg } = await pq.order('atualizado_em', { ascending: false }).limit(1).maybeSingle()
    if (ePcfg && /indique_config|relation|does not exist/i.test(ePcfg.message)) migrationPendente = true
    else if (pcfg) premio = pcfg as unknown as typeof premio
  }

  // Último sorteio do mês (indique_sorteios) — tolerante à migration não aplicada.
  let ultimoSorteio: { id: string; ganhador_nome: string; ganhador_whats: string | null; ganhador_email: string | null; premio: string | null; notificado: boolean } | null = null
  {
    let sq = sb.from('indique_sorteios').select('id, ganhador_nome, ganhador_whats, ganhador_email, premio, notificado').eq('mes_ref', mes)
    if (activeUnit) sq = sq.eq('unidade_id', activeUnit)
    const { data: sor, error: eSor } = await sq.order('sorteado_em', { ascending: false }).limit(1).maybeSingle()
    if (eSor && /indique_sorteios|relation|does not exist/i.test(eSor.message)) migrationPendente = true
    else if (sor) ultimoSorteio = sor as unknown as typeof ultimoSorteio
  }

  return (
    <div className="view active">
      <IndiquesManager
        indicacoes={indicacoes}
        unidades={ctx?.unidades ?? []}
        activeUnitId={activeUnit}
        activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
        uniNome={uniNome}
        isAdmin={ctx?.isAdmin ?? false}
        premio={premio}
        metaMensal={premio?.meta_mensal ?? 60}
        ultimoSorteio={ultimoSorteio}
        migrationPendente={migrationPendente}
      />
    </div>
  )
}
