import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { rangePeriodo } from '@/lib/periodo'
import { SacFiltros } from '@/components/sac/SacFiltros'
import { NovoChamado } from '@/components/sac/NovoChamado'
import { ChamadosTabela, type ChamadoRow } from '@/components/sac/ChamadosTabela'

const PAGE_SIZE = 30

type SP = { canal?: string; fase?: string; q?: string; atendente?: string; motivo?: string; unidade?: string; periodo?: string; di?: string; df?: string; page?: string }

export default async function SacChamadosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const spv = await searchParams
  const { canal, fase, q, atendente, motivo, unidade, periodo, di, df, page: pageRaw } = spv
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

  let query = sb
    .from('sac_tickets')
    .select('id, numero, protocolo, nome_cliente, telefone_cliente, email_cliente, cpf_cliente, canal, unidade_id, motivo_label, prioridade, fase, sla_violado, atribuido_para, observacoes, area_reclamada, valor_pago, valor_devolucao, multa_aplicada, pago', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (canal) query = query.eq('canal', canal)
  if (fase) query = query.eq('fase', fase)
  if (atendente) query = query.eq('atribuido_para', atendente)
  if (motivo) query = query.eq('motivo_label', motivo)
  if (unidade && !ctx?.activeUnitId) query = query.eq('unidade_id', unidade)
  if (ini) query = query.gte('criado_em', ini)
  if (fim) query = query.lt('criado_em', fim)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) query = query.or(`nome_cliente.ilike.%${qs}%,protocolo.ilike.%${qs}%,cpf_cliente.ilike.%${qs}%,telefone_cliente.ilike.%${qs}%`)
  }
  if (ctx?.activeUnitId) query = query.eq('unidade_id', ctx.activeUnitId) // respeita a unidade ativa do topo

  const { data, count } = await query
  const tickets = (data ?? []) as ChamadoRow[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(canal || fase || q || atendente || motivo || unidade || periodo)

  const urlComPagina = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries({ canal, fase, q, atendente, motivo, unidade, periodo, di, df })) if (v) sp.set(k, v)
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return `/sac/chamados${s ? `?${s}` : ''}`
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <NovoChamado unidades={ctx?.unidades ?? []} atendentes={atendentes} activeUnitId={ctx?.activeUnitId ?? null} />
      </div>
      <SacFiltros atendentes={atendentes} motivos={motivos} unidades={unidadesFiltro} />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total} chamado(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages} · <span style={{ color: 'var(--text-3)' }}>clique numa linha para editar</span>
      </div>

      <ChamadosTabela tickets={tickets} atendentes={atendentes} motivos={motivos} uniNome={uniNome} />

      {totalPages > 1 && (
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
