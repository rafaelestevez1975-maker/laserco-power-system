import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
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

export default async function SacChamadosPage({ searchParams }: { searchParams: Promise<{ canal?: string; fase?: string; q?: string; atendente?: string; page?: string }> }) {
  const { canal, fase, q, atendente, page: pageRaw } = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const uniNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  // Atendentes do SAC — fonte única (lib/pessoas, liga colaboradores⟷perfis_usuario)
  const atendentes = (await listAtendentesSac(sb)).map((a) => ({ id: a.id, nome: a.nome }))
  const atNome = new Map(atendentes.map((a) => [a.id, a.nome]))

  const page = Math.max(1, Number(pageRaw) || 1)
  const from = (page - 1) * PAGE_SIZE

  let query = sb
    .from('sac_tickets')
    .select('numero, protocolo, nome_cliente, telefone_cliente, canal, unidade_id, motivo_label, prioridade, fase, status, sla_violado, atribuido_para', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (canal) query = query.eq('canal', canal)
  if (fase) query = query.eq('fase', fase)
  if (atendente) query = query.eq('atribuido_para', atendente)
  if (q) {
    // busca avançada: cliente OU protocolo OU CPF OU telefone (sanitiza chars que quebram o or())
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) query = query.or(`nome_cliente.ilike.%${qs}%,protocolo.ilike.%${qs}%,cpf_cliente.ilike.%${qs}%,telefone_cliente.ilike.%${qs}%`)
  }
  if (ctx?.activeUnitId) query = query.eq('unidade_id', ctx.activeUnitId) // respeita a unidade ativa do topo

  const { data, count } = await query
  const tickets = (data ?? []) as Ticket[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const temFiltro = !!(canal || fase || q || atendente)

  const urlComPagina = (p: number) => {
    const sp = new URLSearchParams()
    if (canal) sp.set('canal', canal)
    if (fase) sp.set('fase', fase)
    if (q) sp.set('q', q)
    if (atendente) sp.set('atendente', atendente)
    if (p > 1) sp.set('page', String(p))
    const s = sp.toString()
    return `/sac/chamados${s ? `?${s}` : ''}`
  }

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <NovoChamado unidades={ctx?.unidades ?? []} activeUnitId={ctx?.activeUnitId ?? null} />
      </div>
      <SacFiltros atendentes={atendentes} />

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
