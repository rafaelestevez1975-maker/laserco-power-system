import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { OrigensManager, type OrigemRow } from '@/components/origens/OrigensManager'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['gestor']

type SP = { nome?: string; ativo?: string }

export default async function OrigensPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ativo = sp.ativo ?? 'Todos' // legado: filtro Ativo (Todos/Sim/Não)
  const nome = (sp.nome ?? '').trim()
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  let query = sb
    .from('origens_cliente')
    .select('id, nome, ativo, auto, campo')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  // O filtro Ativo do legado: inativo = ativo===false. 'Sim' => ativos, 'Não' => inativos.
  if (ativo === 'Sim') query = query.eq('ativo', true)
  else if (ativo === 'Não') query = query.eq('ativo', false)
  if (nome) query = query.ilike('nome', `%${nome}%`)

  const { data, error } = await query
  const origens = (data ?? []) as OrigemRow[]
  const semTabela = !!error

  // Contador do legado: "X registros encontrados · Y ativos".
  const ativos = origens.filter((o) => o.ativo !== false).length

  return (
    <OrigensManager
      origens={origens}
      podeEscrever={podeEscrever}
      filtros={{ ativo, nome }}
      contador={{ total: origens.length, ativos }}
      semTabela={semTabela}
    />
  )
}
