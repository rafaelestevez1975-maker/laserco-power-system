import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { siteConfigurado } from '@/lib/supabase/site'
import { ExportacoesHub } from '@/components/exportacoes/ExportacoesHub'
import type { DatasetKey } from '@/app/(app)/exportacoes/actions'

export const dynamic = 'force-dynamic'

export default async function ExportacoesPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const escopoUnidade = !!activeUnit

  // Contagens reais por dataset (count head:true — só o total, sem puxar linhas).
  // Cada tabela é escopada pela unidade ativa na sua coluna própria.
  const head = (tabela: string, col?: string, val?: string | null) => {
    let q = sb.from(tabela).select('id', { count: 'exact', head: true })
    if (activeUnit && col) q = q.eq(col, val ?? activeUnit)
    return q
  }

  const [cli, contas, ag, colab, sac] = await Promise.all([
    head('clientes', 'unidade_origem_id'),
    head('lancamentos_financeiros', 'unidade_id'),
    head('agendamentos', 'unidade_id'),
    head('colaboradores', 'unidade_id'),
    head('sac_tickets', 'unidade_id'),
  ])

  // Leads do site: fonte externa (sem count barato e sem escopo por unidade).
  // null = "contagem indisponível" no card.
  const counts: Partial<Record<DatasetKey, number | null>> = {
    clientes: cli.error ? null : cli.count ?? 0,
    contas: contas.error ? null : contas.count ?? 0,
    agendamentos: ag.error ? null : ag.count ?? 0,
    colaboradores: colab.error ? null : colab.count ?? 0,
    chamados: sac.error ? null : sac.count ?? 0,
    leads: siteConfigurado() ? null : await contagemLeadsFallback(sb),
  }

  return (
    <ExportacoesHub
      counts={counts}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
      escopoUnidade={escopoUnidade}
    />
  )
}

/** Quando a chave do site não está configurada, lê o fallback lkii.site_leads (count). */
async function contagemLeadsFallback(sb: Awaited<ReturnType<typeof createClient>>): Promise<number | null> {
  const { count, error } = await sb.from('site_leads').select('id', { count: 'exact', head: true })
  return error ? null : count ?? 0
}
