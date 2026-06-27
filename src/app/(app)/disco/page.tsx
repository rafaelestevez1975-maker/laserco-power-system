import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { DiscoManager, type DiscoPasta, type DiscoArquivo } from '@/components/disco/DiscoManager'

export const dynamic = 'force-dynamic'

export default async function DiscoPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const isAdmin = ehAdmin(ctx?.papel)

  let migrationPendente = false

  // Config do Drive (disco_config).
  let driveLinked = false
  let driveUrl: string | null = null
  {
    const { data, error } = await sb.from('disco_config').select('drive_linked, drive_url').maybeSingle()
    if (error && /disco_config|relation|does not exist|schema cache/i.test(error.message)) migrationPendente = true
    else if (data) { driveLinked = !!(data as { drive_linked?: boolean }).drive_linked; driveUrl = (data as { drive_url?: string | null }).drive_url ?? null }
  }

  // Pastas (disco_pastas).
  let pastas: DiscoPasta[] = []
  {
    const { data, error } = await sb
      .from('disco_pastas')
      .select('id, parent_id, nome, por, drive, criado_em')
      .order('nome', { ascending: true })
    if (error && /disco_pastas|relation|does not exist|schema cache/i.test(error.message)) migrationPendente = true
    else pastas = (data ?? []) as DiscoPasta[]
  }

  // Arquivos (disco_arquivos).
  let arquivos: DiscoArquivo[] = []
  {
    const { data, error } = await sb
      .from('disco_arquivos')
      .select('id, pasta_id, nome, tipo, bytes, arquivo_path, por, drive, criado_em')
      .order('nome', { ascending: true })
    if (error && /disco_arquivos|relation|does not exist|schema cache/i.test(error.message)) migrationPendente = true
    else arquivos = (data ?? []) as DiscoArquivo[]
  }

  return (
    <div className="view active">
      <DiscoManager
        isAdmin={isAdmin}
        migrationPendente={migrationPendente}
        driveLinked={driveLinked}
        driveUrl={driveUrl}
        pastas={pastas}
        arquivos={arquivos}
      />
    </div>
  )
}
