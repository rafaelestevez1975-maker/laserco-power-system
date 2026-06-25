import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SacConfigManager, type Motivo, type Tag } from '@/components/sac/SacConfigManager'

export default async function SacConfigPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  const [{ data: mot }, { data: tg }] = await Promise.all([
    sb.from('sac_motivos').select('id, label, ativo, ordem').order('ordem', { ascending: true }),
    sb.from('sac_tags').select('id, nome, cor, ativo').order('nome', { ascending: true }),
  ])

  const podeEditar = !!(ctx?.isAdmin || ctx?.papel === 'sac' || ctx?.papel === 'gestor')

  return (
    <div className="view active">
      <SacConfigManager motivos={(mot ?? []) as Motivo[]} tags={(tg ?? []) as Tag[]} podeEditar={podeEditar} />
    </div>
  )
}
