import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { DescontosManager, type DescontoRow } from '@/components/descontos/DescontosManager'

export const dynamic = 'force-dynamic'

const PAPEIS_GESTAO = ['financeiro', 'gestor']

/** /descontos — CRUD de descontos/parcerias (tabela real `descontos`). */
export default async function DescontosPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeGerir = ehAdmin(ctx?.papel) || PAPEIS_GESTAO.includes(ctx?.papel || '')

  const { data } = await sb
    .from('descontos')
    .select('id, nome, tipo, valor, ativo, criado_em')
    .order('criado_em', { ascending: false })

  const rows = (data ?? []) as DescontoRow[]

  return <DescontosManager rows={rows} podeGerir={podeGerir} />
}
