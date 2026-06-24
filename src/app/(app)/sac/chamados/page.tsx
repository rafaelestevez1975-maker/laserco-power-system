import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SacFiltros } from '@/components/sac/SacFiltros'
import { NovoChamado } from '@/components/sac/NovoChamado'

type Ticket = {
  numero: number | null; protocolo: string | null; nome_cliente: string | null; telefone_cliente: string | null
  canal: string | null; unidade_id: string | null; motivo_label: string | null; prioridade: string | null
  fase: string | null; status: string | null; sla_violado: boolean | null
}

const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })
const prioPill = (p: string | null) =>
  p === 'alta' || p === 'critica' ? pill('#FCEBE0', '#C2410C') : p === 'baixa' ? pill('#EEF2F7', '#64748B') : pill('#FBEFD9', '#9A6700')
const fasePill = (f: string | null) =>
  f === 'Concluído' ? pill('#E7F0EC', '#15803D') : f === 'Em pagamento' ? pill('#FBEFD9', '#9A6700') : f === 'Contato com cliente' ? pill('#E6F0FB', '#3D7FD1') : pill('#F7E7EB', '#8A2A41')

export default async function SacChamadosPage({ searchParams }: { searchParams: Promise<{ canal?: string; fase?: string; q?: string }> }) {
  const { canal, fase, q } = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const uniNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  let query = sb
    .from('sac_tickets')
    .select('numero, protocolo, nome_cliente, telefone_cliente, canal, unidade_id, motivo_label, prioridade, fase, status, sla_violado', { count: 'exact' })
    .order('criado_em', { ascending: false })
    .limit(60)
  if (canal) query = query.eq('canal', canal)
  if (fase) query = query.eq('fase', fase)
  if (q) query = query.ilike('nome_cliente', `%${q}%`)

  const { data, count } = await query
  const tickets = (data ?? []) as Ticket[]

  return (
    <div className="view active">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <NovoChamado unidades={ctx?.unidades ?? []} activeUnitId={ctx?.activeUnitId ?? null} />
      </div>
      <SacFiltros />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 8px' }}>
        <i className="ti ti-filter" /> {tickets.length} de {count ?? tickets.length} chamados
        {(canal || fase || q) ? ' (filtrado)' : ''}
      </div>

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr><th>Protocolo</th><th>Cliente</th><th>Canal</th><th>Unidade</th><th>Motivo</th><th>Prioridade</th><th>Fase</th><th>SLA</th></tr>
            </thead>
            <tbody>
              {tickets.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum chamado para os filtros selecionados.</td></tr>
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
    </div>
  )
}
