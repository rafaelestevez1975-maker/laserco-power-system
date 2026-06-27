import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { SacRelatorios } from '@/components/sac/SacRelatorios'

const CANAIS = ['Reclame Aqui', 'Blip', 'WhatsApp', 'Sults', 'Procon', 'Instagram', 'Manual', 'E-mail']
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
const PRIOS = ['baixa', 'media', 'alta', 'urgente']

export default async function SacRelatoriosPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo = '30d' } = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null

  const now = new Date()
  let desde: string | null = null
  if (periodo === '30d') desde = new Date(now.getTime() - 30 * 864e5).toISOString()
  else if (periodo === 'mes') desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // base com filtros (unidade + período), opcionalmente por atendente
  const base = (atendenteId?: string) => {
    let q = sb.from('sac_tickets').select('id', { count: 'exact', head: true })
    if (activeUnit) q = q.eq('unidade_id', activeUnit)
    if (desde) q = q.gte('criado_em', desde)
    if (atendenteId) q = q.eq('atribuido_para', atendenteId)
    return q
  }
  const c = async (col?: string, val?: unknown) => {
    let q = base()
    if (col) q = q.eq(col, val as never)
    const { count } = await q
    return count ?? 0
  }
  const perfAtendente = async (id: string) => {
    const [{ count: tot }, { count: res }, { count: vio }] = await Promise.all([
      base(id), base(id).eq('fase', 'Concluído'), base(id).eq('sla_violado', true),
    ])
    const t = tot ?? 0
    return { total: t, resolvidos: res ?? 0, slaPct: t ? Math.round(((t - (vio ?? 0)) / t) * 100) : 0 }
  }

  const [{ data: motRaw }, atendentes] = await Promise.all([
    sb.from('sac_motivos').select('label').eq('ativo', true).order('ordem', { ascending: true }),
    listAtendentesSac(sb),
  ])
  const motivos = ((motRaw ?? []) as { label: string }[]).map((m) => m.label)

  const [total, concluidos, sla, canais, fases, prios, motivoCounts, atendPerf] = await Promise.all([
    c(), c('fase', 'Concluído'), c('sla_violado', true),
    Promise.all(CANAIS.map((k) => c('canal', k))),
    Promise.all(FASES.map((f) => c('fase', f))),
    Promise.all(PRIOS.map((p) => c('prioridade', p))),
    Promise.all(motivos.map((m) => c('motivo_label', m))),
    Promise.all(atendentes.map(async (a) => ({ nome: a.nome, ...(await perfAtendente(a.id)) }))),
  ])

  const motivosTop = motivos.map((m, i) => ({ nome: m, n: motivoCounts[i] })).filter((d) => d.n > 0).sort((a, b) => b.n - a.n).slice(0, 8)
  const atendOrden = atendPerf.filter((a) => a.total > 0).sort((a, b) => b.total - a.total)

  return (
    <div className="view active">
      <SacRelatorios
        periodo={periodo}
        kpis={{ total, concluidos, emAberto: total - concluidos, sla, slaPct: total ? Math.round((sla / total) * 100) : 0 }}
        canais={CANAIS.map((k, i) => ({ nome: k, n: canais[i] }))}
        fases={FASES.map((f, i) => ({ nome: f, n: fases[i] }))}
        prioridades={PRIOS.map((p, i) => ({ nome: p, n: prios[i] }))}
        motivos={motivosTop}
        atendentes={atendOrden}
      />
    </div>
  )
}
