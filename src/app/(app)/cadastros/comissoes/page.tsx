import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ComissoesBoard } from '@/components/comissoes/ComissoesBoard'
import type { SimColaborador } from '@/components/comissoes/comissoes-data'

export const dynamic = 'force-dynamic'

// Quem pode EDITAR a matriz (gestores/admin). Demais só visualizam + simulam.
const PAPEIS_ESCRITA = ['gestor']

/**
 * Matriz de comissões — grade categorias × faixas + simulador em tempo real.
 *
 * Backend lkii NÃO possui tabela de matriz de comissões (introspecção: 404 em
 * comissoes/matriz_comissoes). A matriz é um SEED fiel ao legado (COM_CATS) e o simulador
 * roda 100% no cliente. Persistência da matriz = //TODO(needs-table: matriz_comissoes).
 *
 * O que É real: a lista de colaboradores e unidades (alimenta o filtro do simulador,
 * mapeando cargo→categoria — ex.: cargo 'consultora_vendas' → "Consultoras de Vendas").
 */
export default async function ComissoesPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEditar = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // Unidades visíveis (RLS via sessão).
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))
  const mapaUni = new Map(unidades.map((u) => [u.id, u.nome]))

  // Colaboradores ativos (multitenant: escopo na unidade ativa quando houver).
  let q = sb
    .from('colaboradores')
    .select('id, nome, cargo, unidade_id')
    .eq('status', 'ativo')
    .order('nome', { ascending: true })
    .limit(300)
  if (ctx?.activeUnitId) q = q.eq('unidade_id', ctx.activeUnitId)

  const { data: colabRaw } = await q
  const colaboradores: SimColaborador[] = ((colabRaw ?? []) as { id: string; nome: string; cargo: string | null; unidade_id: string | null }[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    cargo: c.cargo,
    unidadeNome: (c.unidade_id && mapaUni.get(c.unidade_id)) || ctx?.activeUnitName || '—',
  }))

  return (
    <div className="view active">
      <ComissoesBoard colaboradores={colaboradores} unidades={unidades} podeEditar={podeEditar} />
    </div>
  )
}

// TODO(needs-table: matriz_comissoes) — persistir a matriz (categorias × faixas/base/fechamento)
// por empresa/unidade. Sem acesso de migration, a matriz é seed em memória (fiel ao legado).
// TODO(legado: buildComissoes) — vincular a matriz salva ao cálculo real de premiação por
// período (Saque) e ao roster premRoster do legado; depende da tabela acima.
