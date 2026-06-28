import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { rangePeriodo } from '@/lib/periodo'
import { SacFiltros } from '@/components/sac/SacFiltros'
import { NovoChamado } from '@/components/sac/NovoChamado'
import { ChamadosTabela, type ChamadoRow } from '@/components/sac/ChamadosTabela'

const PAGE_SIZE = 30

type SP = { canal?: string; fase?: string; situacao?: string; q?: string; atendente?: string; motivo?: string; unidade?: string; periodo?: string; di?: string; df?: string; page?: string }

export default async function SacChamadosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const spv = await searchParams
  const { canal, fase, situacao, q, atendente, motivo, unidade, periodo, di, df, page: pageRaw } = spv
  const ctx = await getSessionContext()
  const sb = await createClient()
  const uniNome: Record<string, string> = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  const [atendentesFull, { data: motivosRaw }] = await Promise.all([
    listAtendentesSac(sb),
    sb.from('sac_motivos').select('label').eq('ativo', true).order('ordem', { ascending: true }),
  ])
  const atendentes = atendentesFull.map((a) => ({ id: a.id, nome: a.nome }))
  const motivos = ((motivosRaw ?? []) as { label: string }[]).map((m) => m.label)
  const unidadesFiltro = ctx?.activeUnitId ? [] : (ctx?.unidades ?? [])

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE
  const { ini, fim } = rangePeriodo(periodo, di, df)

  // Filtros base (escopo de unidade) reutilizados na query da lista e no total geral.
  type Q = ReturnType<typeof sb.from>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aplicarUnidade = (qb: any) => (ctx?.activeUnitId ? qb.eq('unidade_id', ctx.activeUnitId) : qb)

  let query = sb
    .from('sac_tickets')
    .select('id, numero, protocolo, nome_cliente, telefone_cliente, email_cliente, cpf_cliente, canal, unidade_id, motivo_label, prioridade, fase, sla_violado, atribuido_para, observacoes, area_reclamada, valor_pago, valor_devolucao, multa_aplicada, pago, criado_em', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (canal) query = query.eq('canal', canal)
  if (fase) query = query.eq('fase', fase)
  // Situação (paridade do "Status" do legado), derivada de fase + sla_violado:
  if (situacao === 'Concluído') query = query.eq('fase', 'Concluído')
  else if (situacao === 'Em atraso') query = query.eq('sla_violado', true).neq('fase', 'Concluído')
  else if (situacao === 'Em andamento') query = query.neq('fase', 'Concluído').or('sla_violado.is.null,sla_violado.eq.false')
  if (atendente) query = query.eq('atribuido_para', atendente)
  if (motivo) query = query.eq('motivo_label', motivo)
  if (unidade && !ctx?.activeUnitId) query = query.eq('unidade_id', unidade)
  if (ini) query = query.gte('criado_em', ini)
  if (fim) query = query.lt('criado_em', fim)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    // Legado busca em cliente+id+unidade+motivo+canal; aqui mantemos isso e somamos CPF/telefone.
    // (unidade entra por nome só quando o termo casa com alguma unidade do escopo.)
    if (qs) {
      const conds = [`nome_cliente.ilike.%${qs}%`, `protocolo.ilike.%${qs}%`, `cpf_cliente.ilike.%${qs}%`, `telefone_cliente.ilike.%${qs}%`, `motivo_label.ilike.%${qs}%`, `canal.ilike.%${qs}%`]
      const uniIds = (ctx?.unidades ?? []).filter((u) => u.nome.toLowerCase().includes(qs.toLowerCase())).map((u) => u.id)
      for (const id of uniIds) conds.push(`unidade_id.eq.${id}`)
      query = query.or(conds.join(','))
    }
  }
  query = aplicarUnidade(query) // respeita a unidade ativa do topo

  // Total geral (sem filtros, só escopo de unidade) — para o "X de Y" do legado.
  const totalGeralQ = aplicarUnidade(sb.from('sac_tickets').select('id', { count: 'exact', head: true }))
  const [{ data, count, error }, { count: countGeral }] = await Promise.all([query, totalGeralQ])
  const tickets = (data ?? []) as ChamadoRow[]
  const total = count ?? 0
  const totalGeral = countGeral ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(canal || fase || situacao || q || atendente || motivo || unidade || periodo)

  const urlComPagina = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries({ canal, fase, situacao, q, atendente, motivo, unidade, periodo, di, df })) if (v) sp.set(k, v)
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return `/sac/chamados${s ? `?${s}` : ''}`
  }

  return (
    <div className="view active">
      <SacFiltros atendentes={atendentes} motivos={motivos} unidades={unidadesFiltro}>
        <NovoChamado unidades={ctx?.unidades ?? []} atendentes={atendentes} activeUnitId={ctx?.activeUnitId ?? null} />
      </SacFiltros>

      {error ? (
        <div className="cli-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar os chamados. Recarregue a página ou ajuste os filtros.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
            <i className="ti ti-filter" /> {total} de {totalGeral} chamado(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages} · <span style={{ color: 'var(--text-3)' }}>clique numa linha ou no lápis para editar</span>
          </div>

          <ChamadosTabela tickets={tickets} atendentes={atendentes} motivos={motivos} uniNome={uniNome} unidades={ctx?.unidades ?? []} />
        </>
      )}

      {!error && totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 14 }}>
          {page > 1
            ? <Link className="btn" href={urlComPagina(page - 1)}><i className="ti ti-chevron-left" /> Anterior</Link>
            : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}><i className="ti ti-chevron-left" /> Anterior</span>}
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Página {page} de {totalPages}</span>
          {page < totalPages
            ? <Link className="btn" href={urlComPagina(page + 1)}>Próxima <i className="ti ti-chevron-right" /></Link>
            : <span className="btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>Próxima <i className="ti ti-chevron-right" /></span>}
        </div>
      )}
    </div>
  )
}
