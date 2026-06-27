import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { MotivosManager, type MotivoRow, type NoshowRow } from '@/components/motivos/MotivosManager'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['gestor']

export default async function MotivosPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const { data, error } = await sb
    .from('motivos_cancelamento')
    .select('id, nome, sistema, ativo')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

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
    />
  )
}
