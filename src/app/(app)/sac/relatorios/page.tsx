import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SacRelatorios } from '@/components/sac/SacRelatorios'

const CANAIS = ['Reclame Aqui', 'Blip', 'WhatsApp', 'Sults', 'Procon', 'Instagram', 'Manual', 'E-mail']
const FASES = ['Novo', 'Contato com cliente', 'Em pagamento', 'Concluído']
const PRIOS = ['baixa', 'media', 'alta', 'critica']

export default async function SacRelatoriosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo = '30d' } = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null

  const now = new Date()
  let desde: string | null = null
  if (periodo === '30d') desde = new Date(now.getTime() - 30 * 864e5).toISOString()
  else if (periodo === 'mes') desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  // 'tudo' => sem filtro de data

  const c = async (col?: string, val?: unknown) => {
    let q = sb.from('sac_tickets').select('id', { count: 'exact', head: true })
    if (activeUnit) q = q.eq('unidade_id', activeUnit)
    if (desde) q = q.gte('criado_em', desde)
    if (col) q = q.eq(col, val as never)
    const { count } = await q
    return count ?? 0
  }

  const [total, concluidos, sla, canais, fases, prios] = await Promise.all([
    c(),
    c('fase', 'Concluído'),
    c('sla_violado', true),
    Promise.all(CANAIS.map((k) => c('canal', k))),
    Promise.all(FASES.map((f) => c('fase', f))),
    Promise.all(PRIOS.map((p) => c('prioridade', p))),
  ])

  return (
    <div className="view active">
      <SacRelatorios
        periodo={periodo}
        kpis={{ total, concluidos, emAberto: total - concluidos, sla, slaPct: total ? Math.round((sla / total) * 100) : 0 }}
        canais={CANAIS.map((k, i) => ({ nome: k, n: canais[i] }))}
        fases={FASES.map((f, i) => ({ nome: f, n: fases[i] }))}
        prioridades={PRIOS.map((p, i) => ({ nome: p, n: prios[i] }))}
      />
    </div>
  )
}
