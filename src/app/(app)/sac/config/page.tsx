import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SacConfigManager, type Motivo, type Tag } from '@/components/sac/SacConfigManager'
import { SLA_HORAS_DEFAULT } from '@/lib/sac-config'

export default async function SacConfigPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  const [{ data: mot }, { data: tg }, { data: cfg }] = await Promise.all([
    sb.from('sac_motivos').select('id, label, ativo, ordem').order('ordem', { ascending: true }),
    sb.from('sac_tags').select('id, nome, cor, ativo').order('nome', { ascending: true }),
    sb.from('sac_premiacao_config').select('pesos').limit(1).maybeSingle(),
  ])

  const slaRaw = (cfg as { pesos?: { slaHoras?: number } } | null)?.pesos?.slaHoras
  const slaHoras = Number.isFinite(Number(slaRaw)) && Number(slaRaw) > 0 ? Number(slaRaw) : SLA_HORAS_DEFAULT

  const podeEditar = !!(ctx?.isAdmin || ctx?.papel === 'sac' || ctx?.papel === 'gestor')

  return (
    <div className="view active">
      <SacConfigManager motivos={(mot ?? []) as Motivo[]} tags={(tg ?? []) as Tag[]} slaHoras={slaHoras} podeEditar={podeEditar} />
    </div>
  )
}
