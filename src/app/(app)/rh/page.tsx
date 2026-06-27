import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * RH · Dashboard — porta a tela inicial do portal RH (legacy/portal-rh.html, tela
 * "Dashboard"): KPIs/cards (Colaboradores, Pendências para Aprovação, vagas abertas)
 * + métricas por departamento + atalhos para as demais telas do portal.
 *
 * Multitenant: colaboradores/vagas têm unidade_id → filtramos pela unidade ativa.
 * Folha/férias/atestados não têm unidade_id → restringimos pelos colaboradores da unidade.
 */
export default async function RhDashboardPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnitId = ctx?.activeUnitId ?? null

  // ── Colaboradores da unidade (base do escopo) ──
  let cq = sb.from('colaboradores').select('id, departamento, status').limit(2000)
  if (activeUnitId) cq = cq.eq('unidade_id', activeUnitId)
  const { data: colabRaw } = await cq
  const colaboradores = (colabRaw ?? []) as { id: string; departamento: string | null; status: string | null }[]
  const colabIds = colaboradores.map((c) => c.id)
  const ativos = colaboradores.filter((c) => c.status === 'ativo')
  const restringe = !!activeUnitId && colabIds.length > 0
  const semColab = !!activeUnitId && colabIds.length === 0

  // ── Pendências para aprovação (férias pendentes + atestados pendentes) ──
  // best-effort: se a migration rh.sql não foi aplicada, o count falha → 0.
  const safe = async (p: PromiseLike<{ count: number | null }>): Promise<number> => { try { return (await p).count ?? 0 } catch { return 0 } }

  let feriasPend = 0, atestPend = 0, vagasAbertas = 0
  if (!semColab) {
    const fq = sb.from('solicitacoes_ferias').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
    const aq = sb.from('atestados').select('id', { count: 'exact', head: true }).eq('status', 'pendente')
    feriasPend = await safe(restringe ? fq.in('colaborador_id', colabIds) : fq)
    atestPend = await safe(restringe ? aq.in('colaborador_id', colabIds) : aq)
  }
  {
    let vq = sb.from('vagas').select('id', { count: 'exact', head: true }).eq('status', 'aberta')
    if (activeUnitId) vq = vq.eq('unidade_id', activeUnitId)
    vagasAbertas = await safe(vq)
  }

  const pendencias = feriasPend + atestPend

  // ── Métricas por departamento (dos ativos) ──
  const porDep = new Map<string, number>()
  for (const c of ativos) {
    const d = (c.departamento || 'Sem departamento').trim() || 'Sem departamento'
    porDep.set(d, (porDep.get(d) ?? 0) + 1)
  }
  const departamentos = [...porDep.entries()].sort((a, b) => b[1] - a[1])

  const kpis: [string, number | string, string, string][] = [
    ['Colaboradores ativos', ativos.length, 'ti-users', 'var(--brand-500)'],
    ['Pendências p/ aprovação', pendencias, 'ti-clipboard-check', pendencias > 0 ? 'var(--amber)' : 'var(--text-3)'],
    ['Vagas abertas', vagasAbertas, 'ti-user-plus', '#15803D'],
    ['Departamentos', departamentos.length, 'ti-building-community', 'var(--text-2)'],
  ]

  const atalhos: { label: string; href: string; icon: string; desc: string }[] = [
    { label: 'Colaboradores', href: '/rh/colaboradores', icon: 'ti-users', desc: 'Cadastro completo de admissão' },
    { label: 'Ponto', href: '/rh/ponto', icon: 'ti-clock', desc: 'Jornada e banco de horas' },
    { label: 'Recrutamento', href: '/rh/recrutamento', icon: 'ti-user-plus', desc: 'Vagas, candidatos e currículos' },
    { label: 'Folha de Pagamento', href: '/rh/folha', icon: 'ti-cash', desc: 'INSS, IRRF, FGTS e 13º' },
    { label: 'Férias e Ausências', href: '/rh/ferias', icon: 'ti-calendar', desc: 'Solicitações e atestados' },
    { label: 'Desempenho', href: '/rh/desempenho', icon: 'ti-chart-bar', desc: 'Avaliações trimestrais' },
    { label: 'Regras da Rede', href: '/rh/regras', icon: 'ti-book', desc: 'Normas e condutas' },
  ]

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7F0EC', color: '#0f6b3a' }}><i className="ti ti-briefcase" /></div>
        <div>
          <h2>Recursos Humanos</h2>
          <p>Portal de RH · {ctx?.activeUnitName ?? 'Todas as unidades'} — colaboradores, ponto, folha, férias e desempenho.</p>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
        {kpis.map(([label, val, icon, color]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--surface-2)', color, flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{typeof val === 'number' ? val.toLocaleString('pt-BR') : val}</b>
            </span>
          </div>
        ))}
      </div>

      {pendencias > 0 && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 16px', padding: '12px 16px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
          <i className="ti ti-bell-ringing" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <b>{pendencias}</b> pendência(s) aguardando aprovação:{' '}
            {feriasPend > 0 && <Link href="/rh/ferias" style={{ color: 'var(--brand-600)' }}>{feriasPend} de férias</Link>}
            {feriasPend > 0 && atestPend > 0 && ' · '}
            {atestPend > 0 && <Link href="/rh/ferias" style={{ color: 'var(--brand-600)' }}>{atestPend} atestado(s)</Link>}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
        {/* Métricas por departamento */}
        <div className="rel-card">
          <div className="rel-card-h"><span><i className="ti ti-building-community flt" /> Colaboradores por departamento</span></div>
          <div style={{ marginTop: 10 }}>
            {departamentos.length === 0
              ? <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '16px 0', textAlign: 'center' }}>Nenhum colaborador ativo no escopo.</div>
              : departamentos.map(([dep, n]) => (
                  <div key={dep} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <span style={{ fontSize: 13 }}><i className="ti ti-point-filled" style={{ color: 'var(--brand-400, var(--brand-500))' }} /> {dep}</span>
                    <b style={{ fontSize: 13 }}>{n}</b>
                  </div>
                ))}
          </div>
        </div>

        {/* Atalhos */}
        <div className="rel-card">
          <div className="rel-card-h"><span><i className="ti ti-layout-grid flt" /> Acessar telas do RH</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 10 }}>
            {atalhos.map((a) => (
              <Link key={a.href} href={a.href} className="lead-card" style={{ display: 'flex', gap: 11, alignItems: 'center', textDecoration: 'none', color: 'inherit', padding: '12px 14px' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--brand-500)', flexShrink: 0 }}>
                  <i className={`ti ${a.icon}`} style={{ fontSize: 17 }} />
                </span>
                <span>
                  <b style={{ display: 'block', fontSize: 13 }}>{a.label}</b>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
