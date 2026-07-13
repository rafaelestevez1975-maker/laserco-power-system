import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { one } from '@/lib/sb'
import { MetasLista, type MetaCatRow, type UnidadeOpt } from '@/components/metas/MetasLista'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['gestor']

/**
 * Metas — LISTAGEM do catálogo de metas (tabela REAL `public.metas`), espelhando o BEMP.
 * (Antes esta rota era um simulador por unidade; os componentes MetasUnidadeSimulador /
 *  MetasColaboradorCrud continuam existindo para outras rotas, mas não são usados aqui.)
 *
 * Escopo multitenant: com unidade ativa mostra as metas dessa unidade OU as globais
 * (unidade_id null); sem unidade ativa (admin) mostra todas as visíveis (RLS aplica).
 * RBAC: só admin_geral/gestor escreve.
 */
export default async function MetasPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const unidades: UnidadeOpt[] = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))

  let q = sb
    .from('metas')
    .select('id, nome, indicador, ciclo, valor, ativo, unidade_id, unidades(nome)')
    .order('nome', { ascending: true })
    .limit(1000)
  if (ctx?.activeUnitId) q = q.or(`unidade_id.eq.${ctx.activeUnitId},unidade_id.is.null`)

  const { data, error } = await q

  type Raw = { id: string; nome: string | null; indicador: string; ciclo: string; valor: number | null; ativo: boolean | null; unidade_id: string | null; unidades: { nome: string | null } | { nome: string | null }[] | null }
  const metas: MetaCatRow[] = ((data ?? []) as Raw[]).map((m) => ({
    id: m.id,
    nome: m.nome,
    indicador: m.indicador,
    ciclo: m.ciclo,
    valor: m.valor,
    unidade_id: m.unidade_id,
    unidadeNome: one(m.unidades)?.nome ?? null,
    ativo: m.ativo,
  }))

  return (
    <div className="view active">
      <p style={{ color: 'var(--text-2)', fontSize: 13.5, marginBottom: 16 }}>
        Catálogo de <b>metas</b> cadastradas por indicador (agendamentos, atendimentos, faturamento, vendas) e ciclo (mensal ou semanal). Defina metas globais ou por unidade e mantenha-as ativas para acompanhamento.
      </p>

      {error && (
        <div className="crm-note" style={{ borderColor: 'var(--red, #D85563)', color: 'var(--red, #D85563)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar as metas.
        </div>
      )}

      <MetasLista metas={metas} unidades={unidades} podeEscrever={podeEscrever} />
    </div>
  )
}
