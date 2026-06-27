import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ComissoesBoard } from '@/components/comissoes/ComissoesBoard'
import { COM_CATS_SEED, type SimColaborador } from '@/components/comissoes/comissoes-data'
import { rowToCat, MATRIZ_COLS, type ComCat, type MatrizRow } from '@/lib/comissoes'

export const dynamic = 'force-dynamic'

// Quem pode EDITAR/SALVAR a matriz (gestores/admin). Demais só visualizam + simulam.
const PAPEIS_ESCRITA = ['gestor']

/**
 * Matriz de comissões — grade categorias × faixas + simulador em tempo real.
 *
 * A matriz agora PERSISTE na tabela matriz_comissoes (scripts/migrations/comissoes.sql).
 * A page carrega as categorias do banco (por empresa) e o board permite editar e
 * SALVAR (action salvarMatriz). Se a tabela não existir/estiver vazia, cai no SEED
 * fiel ao legado (COM_CATS) e o board mostra o banner de empty-state pedindo a migration.
 *
 * O que mais é real: a lista de colaboradores e unidades (alimenta o filtro do
 * simulador, mapeando cargo→categoria — ex.: 'consultora_vendas' → "Consultoras de Vendas").
 */
export default async function ComissoesPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEditar = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // Unidades visíveis (RLS via sessão).
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))
  const mapaUni = new Map(unidades.map((u) => [u.id, u.nome]))

  // ── Matriz persistida (matriz_comissoes). Fallback: SEED quando a tabela não existe/vazia. ──
  let matriz: ComCat[] = COM_CATS_SEED
  let matrizDoBanco = false
  const { data: matrizRaw, error: matrizErr } = await sb
    .from('matriz_comissoes')
    .select(MATRIZ_COLS)
    .order('ordem', { ascending: true })
  if (!matrizErr && Array.isArray(matrizRaw) && matrizRaw.length > 0) {
    matriz = (matrizRaw as MatrizRow[]).map(rowToCat)
    matrizDoBanco = true
  }

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
      <ComissoesBoard
        matriz={matriz}
        matrizDoBanco={matrizDoBanco}
        colaboradores={colaboradores}
        unidades={unidades}
        podeEditar={podeEditar}
      />
    </div>
  )
}
