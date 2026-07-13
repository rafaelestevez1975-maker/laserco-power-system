import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { MotivosManager, type MotivoRow, type NoshowRow } from '@/components/motivos/MotivosManager'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['gestor']

type SP = {
  q?: string // busca por nome
  ativo?: string // 'sim' | 'nao' (vazio = todos)
}

export default async function MotivosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  let q = sb
    .from('motivos_cancelamento')
    .select('id, nome, sistema, ativo')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  const busca = (sp.q ?? '').trim()
  if (busca) q = q.ilike('nome', `%${busca}%`)
  if (sp.ativo === 'sim') q = q.eq('ativo', true)
  else if (sp.ativo === 'nao') q = q.eq('ativo', false)

  const { data, error } = await q

  const motivos = (data ?? []) as MotivoRow[]
  const semTabela = !!error

  // Config de automação de não comparecimento (singleton por empresa).
  const { data: noshowData } = await sb
    .from('noshow_automacao')
    .select('ativa, primeira_apos, max_mensagens, intervalo, mensagem, regra_reagenda, regra_exclui, regra_oculta')
    .limit(1)
    .maybeSingle()

  const noshow = (noshowData ?? null) as NoshowRow | null
  const sistema = motivos.filter((m) => m.sistema).length

  return (
    <MotivosManager
      motivos={motivos}
      podeEscrever={podeEscrever}
      contador={{ total: motivos.length, sistema }}
      noshow={noshow}
      semTabela={semTabela}
      filtroNome={busca}
      filtroAtivo={sp.ativo ?? ''}
    />
  )
}
