import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { CategoriasManager, type CatRow } from '@/components/catcontas/CategoriasManager'

export const dynamic = 'force-dynamic'

const PAPEIS_GESTAO = ['financeiro', 'gestor']

/** /catpag — Categorias de contas a PAGAR (plano_contas tipo=despesa). */
export default async function CatPagPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeGerir = ehAdmin(ctx?.papel) || PAPEIS_GESTAO.includes(ctx?.papel || '')

  const { data } = await sb
    .from('plano_contas')
    .select('id, parent_id, codigo, nome, tipo, natureza, aceita_lancamentos, is_sistema, ativo')
    .eq('tipo', 'despesa')
    .order('codigo', { ascending: true })

  const rows = (data ?? []) as CatRow[]

  return <CategoriasManager tipo="despesa" rows={rows} podeGerir={podeGerir} />
}
