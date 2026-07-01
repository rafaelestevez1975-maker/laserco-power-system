import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac, type Pessoa } from '@/lib/pessoas'
import { PREM_DEFAULT, premioValor, type PremMonetaria, type PremMetricas } from '@/lib/sac'
import { AtendentesManager, type AtendenteRow } from '@/components/sac/AtendentesManager'

export default async function SacAtendentesPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const uniNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))
  const unidadeId = ctx?.activeUnitId ?? null

  // Fonte única de atendentes (perfis_usuario papel SAC + ficha RH via colaboradores.perfil_id).
  // Inclui INATIVOS: a gestão lista e reativa quem foi desativado (paridade com o legado).
  let atendentes: Pessoa[]
  let erro = false
  try {
    atendentes = await listAtendentesSac(sb, true)
  } catch {
    atendentes = []
    erro = true
  }

  // Pesos de premiação (mesma fonte do Ranking) — para estimar o prêmio do mês por atendente.
  const { data: cfgRaw } = await sb.from('sac_premiacao_config').select('pesos').limit(1).maybeSingle()
  const prem: PremMonetaria = { ...PREM_DEFAULT, ...((cfgRaw as { pesos?: Partial<PremMonetaria> } | null)?.pesos ?? {}) }

  // Presença (sac_online) + cargo SAC atual de cada atendente — para a gestão editar (pôr online,
  // trocar cargo). Sem isso o admin não conseguia consertar "tudo cai numa pessoa só".
  const ids = atendentes.map((a) => a.id)
  const onlinePorId = new Map<string, boolean>()
  const cargoSacPorId = new Map<string, string>()
  if (ids.length) {
    const rankCargo = (s: string) => (s === 'supervisor_sac' ? 3 : s === 'atendente_sac' ? 2 : s === 'consulta_sac' ? 1 : 0)
    const [{ data: pres }, { data: ucs }] = await Promise.all([
      sb.from('perfis_usuario').select('id, sac_online').in('id', ids),
      sb.from('usuario_cargos').select('perfil_id, cargos(slug)').in('perfil_id', ids),
    ])
    for (const r of (pres ?? []) as { id: string; sac_online: boolean | null }[]) onlinePorId.set(r.id, !!r.sac_online)
    for (const r of (ucs ?? []) as { perfil_id: string; cargos: { slug?: string } | { slug?: string }[] | null }[]) {
      const arr = Array.isArray(r.cargos) ? r.cargos : r.cargos ? [r.cargos] : []
      for (const c of arr) if (c.slug && rankCargo(c.slug) > rankCargo(cargoSacPorId.get(r.perfil_id) ?? '')) cargoSacPorId.set(r.perfil_id, c.slug)
    }
  }

  // Carga + KPIs reais por atendente (sac_tickets / sac_whatsapp_chats), escopados pela
  // unidade ativa do topo (não conta a rede inteira de quem opera numa unidade).
  // Filtro de unidade inline em cada count (o generic de scopeUnidade estoura a profundidade — TS2589).
  const rows: AtendenteRow[] = await Promise.all(atendentes.map(async (a) => {
    let qConversas = sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).eq('atendente_id', a.id)
    let qTickets = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).neq('fase', 'Concluído')
    let qTotal = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id)
    let qResolvidos = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('fase', 'Concluído')
    let qAtrasados = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('sla_violado', true)
    let qReversoes = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('fase', 'Concluído').not('pago', 'is', true).or('motivo_label.ilike.%cancel%,motivo_label.ilike.%reembolso%,motivo_label.ilike.%retenç%')
    if (unidadeId) {
      qConversas = qConversas.eq('unidade_id', unidadeId)
      qTickets = qTickets.eq('unidade_id', unidadeId)
      qTotal = qTotal.eq('unidade_id', unidadeId)
      qResolvidos = qResolvidos.eq('unidade_id', unidadeId)
      qAtrasados = qAtrasados.eq('unidade_id', unidadeId)
      qReversoes = qReversoes.eq('unidade_id', unidadeId)
    }
    const [{ count: conversas }, { count: tickets }, { count: total }, { count: resolvidos }, { count: atrasados }, { count: reversoes }] =
      await Promise.all([qConversas, qTickets, qTotal, qResolvidos, qAtrasados, qReversoes])
    const tot = total ?? 0
    const atr = atrasados ?? 0
    const con = resolvidos ?? 0
    // SLA% = casos no prazo / total atendido (null quando ainda não há histórico → estado honesto).
    const slaPct = tot > 0 ? Math.round((Math.max(0, tot - atr) / tot) * 100) : null
    const metricas: PremMetricas = { tot, con, atr, rev: reversoes ?? 0, slaOk: Math.max(0, tot - atr), vendas: 0, pacotes: 0, csat: 0 }
    return {
      id: a.id, nome: a.nome, papel: a.papel, cargo: a.cargo, area: a.area,
      unidadeNome: a.unidadeId ? (uniNome.get(a.unidadeId) ?? null) : null, email: a.email, ativo: a.ativo,
      sacOnline: onlinePorId.get(a.id) ?? false, cargoSac: cargoSacPorId.get(a.id) ?? null,
      conversas: conversas ?? 0, tickets: tickets ?? 0,
      chamadosTotal: tot, resolvidos: con, slaPct, premio: a.ativo ? Math.round(premioValor(metricas, prem)) : 0,
    }
  }))

  // Filas não atribuídas (precisam de distribuição), escopadas pela unidade ativa.
  let qFilaConv = sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).is('atendente_id', null).eq('bot_ativo', false)
  let qFilaTick = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).is('atribuido_para', null).neq('fase', 'Concluído')
  if (unidadeId) { qFilaConv = qFilaConv.eq('unidade_id', unidadeId); qFilaTick = qFilaTick.eq('unidade_id', unidadeId) }
  const [{ count: filaConversas }, { count: filaTickets }] = await Promise.all([qFilaConv, qFilaTick])

  const podeDistribuir = !!(ctx?.isAdmin || ctx?.papel === 'sac' || ctx?.papel === 'gestor')
  const podeCriar = !!ctx?.isAdmin // criar/ativar/desativar login de atendente é só do admin
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))

  return (
    <div className="view active">
      {erro ? (
        <div className="cli-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar os atendentes. Recarregue a página.
        </div>
      ) : (
        <AtendentesManager
          atendentes={rows} filaConversas={filaConversas ?? 0} filaTickets={filaTickets ?? 0}
          podeDistribuir={podeDistribuir} podeCriar={podeCriar} unidades={unidades}
          escopo={ctx?.activeUnitName ?? 'Todas as unidades'} comEscopo={!!unidadeId}
        />
      )}
    </div>
  )
}
