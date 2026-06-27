import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { rangePeriodo } from '@/lib/periodo'
import { SacFiltros } from '@/components/sac/SacFiltros'
import { NovoChamado } from '@/components/sac/NovoChamado'

type Ticket = {
  numero: number | null; protocolo: string | null; nome_cliente: string | null; telefone_cliente: string | null
  canal: string | null; unidade_id: string | null; motivo_label: string | null; prioridade: string | null
  fase: string | null; status: string | null; sla_violado: boolean | null; atribuido_para: string | null
}

const PAGE_SIZE = 30
const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })
const prioPill = (p: string | null) =>
  p === 'alta' || p === 'critica' ? pill('#FCEBE0', '#C2410C') : p === 'baixa' ? pill('#EEF2F7', '#64748B') : pill('#FBEFD9', '#9A6700')
const fasePill = (f: string | null) =>
  f === 'Concluído' ? pill('#E7F0EC', '#15803D') : f === 'Em pagamento' ? pill('#FBEFD9', '#9A6700') : f === 'Contato com cliente' ? pill('#E6F0FB', '#3D7FD1') : pill('#F7E7EB', '#8A2A41')

type SP ={ canal?: string; fase?: string; q?: string; atendente?: string; motivo?: string; unidade?: string; periodo?: string; di?: string; df?: string; page?: string }

export default async function SacChamadosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const spv = await searchParams
  const { canal, fase, q, atendente, motivo, unidade, periodo, di, df, page: pageRaw } = spv
  const ctx = await getSessionContext()
  const sb = await createClient()
  const uniNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  // Atendentes (fonte única) + Motivos (sac_motivos) para os filtros
  const [atendentesFull, { data: motivosRaw }] = await Promise.all([
    listAtendentesSac(sb),
    sb.from('sac_motivos').select('label').eq('ativo', true).order('ordem', { ascending: true }),
  ])
  const atendentes = atendentesFull.map((a) => ({ id: a.id, nome: a.nome }))
  const atNome = new Map(atendentes.map((a) => [a.id, a.nome]))
  const motivos = ((motivosRaw ?? []) as { label: string }[]).map((m) => m.label)
  // Filtro de unidade só faz sentido p/ quem vê várias (admin sem unidade ativa travada)
  const unidadesFiltro = ctx?.activeUnitId ? [] : (ctx?.unidades ?? [])

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE
  const { ini, fim } = rangePeriodo(periodo, di, df)

  let query = sb
    .from('sac_tickets')
    .select('numero, protocolo, nome_cliente, telefone_cliente, canal, unidade_id, motivo_label, prioridade, fase, status, sla_violado, atribuido_para', { count: 'exact' })
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
  const tickets = (data ?? []) as Ticket[]
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
        <NovoChamado unidades={ctx?.unidades ?? []} activeUnitId={ctx?.activeUnitId ?? null} />
      </div>
      <SacFiltros atendentes={atendentes} motivos={motivos} unidades={unidadesFiltro} />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {total} chamado(s){temFiltro ? ' (filtrado)' : ''} · página {page} de {totalPages}
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>Protocolo</th><th>Cliente</th><th>Canal</th><th>Unidade</th><th>Atendente</th><th>Motivo</th><th>Prioridade</th><th>Fase</th><th>SLA</th></tr>
            </thead>
            <tbody>
              {tickets.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum chamado para os filtros selecionados.</td></tr>
              )}
              {tickets.map((t, i) => (
                <tr key={i}>
                  <td><b>{t.protocolo || `SAC-${t.numero ?? ''}`}</b></td>
                  <td>
                    {t.nome_cliente || ''}
                    {t.telefone_cliente && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t.telefone_cliente}</div>}
                  </td>
                  <td>{t.canal || ''}</td>
                  <td>{t.unidade_id ? (uniNome.get(t.unidade_id) ?? '') : <span style={{ color: 'var(--text-3)' }}></span>}</td>
                  <td>{t.atribuido_para ? (atNome.get(t.atribuido_para) ?? '—') : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td>{t.motivo_label || ''}</td>
                  <td><span style={prioPill(t.prioridade)}>{(t.prioridade || '').replace(/^\w/, (c) => c.toUpperCase())}</span></td>
                  <td><span style={fasePill(t.fase)}>{t.fase || ''}</span></td>
                  <td>{t.sla_violado ? <span style={pill('#FBE9EB', '#D85563')}><i className="ti ti-alarm" /> Violado</span> : <span style={pill('#E7F0EC', '#15803D')}>OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
