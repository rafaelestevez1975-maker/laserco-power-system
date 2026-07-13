import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { DescontosManager, type DescontoRow } from '@/components/descontos/DescontosManager'

export const dynamic = 'force-dynamic'

const PAPEIS_GESTAO = ['financeiro', 'gestor']

type SP = {
  q?: string // busca por nome
  ativo?: string // 'sim' | 'nao' (vazio = todos)
}

/** /descontos  CRUD de descontos/parcerias (tabela real `descontos`). */
export default async function DescontosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeGerir = ehAdmin(ctx?.papel) || PAPEIS_GESTAO.includes(ctx?.papel || '')

  let q = sb
    .from('descontos')
    .select('id, nome, tipo, valor, ativo, criado_em')
    .order('criado_em', { ascending: false })

  const busca = (sp.q ?? '').trim()
  if (busca) q = q.ilike('nome', `%${busca}%`)
  if (sp.ativo === 'sim') q = q.eq('ativo', true)
  else if (sp.ativo === 'nao') q = q.eq('ativo', false)

  const { data } = await q

  const rows = (data ?? []) as DescontoRow[]

  return <DescontosManager rows={rows} podeGerir={podeGerir} filtroNome={busca} filtroAtivo={sp.ativo ?? ''} />
}
