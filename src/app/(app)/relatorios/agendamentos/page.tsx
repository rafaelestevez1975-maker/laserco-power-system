import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelFiltros } from '@/components/relatorios/RelFiltros'
import { AgendamentosFiltros } from '@/components/relatorios/AgendamentosFiltros'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { resolveRelRange, asTsStart } from '@/components/relatorios/relPeriodo'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string; unidade?: string; profissional?: string; servico?: string }

// Status reais descobertos na introspecção (agendamentos.status):
//   aberto, confirmado, cancelado, concluido
const STATUS: { val: string; label: string; icon: string; cls: string }[] = [
  { val: 'concluido', label: 'Concluídos', icon: 'ti-circle-check', cls: 'os-fechada' },
  { val: 'confirmado', label: 'Confirmados', icon: 'ti-calendar-check', cls: 'os-aberta' },
  { val: 'aberto', label: 'Abertos', icon: 'ti-calendar', cls: 'os-aberta' },
  { val: 'em_atendimento', label: 'Em atendimento', icon: 'ti-progress', cls: 'os-aberta' },
  { val: 'cancelado', label: 'Cancelados', icon: 'ti-calendar-x', cls: 'os-cancelada' },
  { val: 'no_show', label: 'No-show', icon: 'ti-user-x', cls: 'os-cancelada' },
]

/** Conta agendamentos (head:true → só count) aplicando filtros. */
async function contar(
  sb: Awaited<ReturnType<typeof createClient>>,
  opts: {
    status?: string
    unidadeId: string | null
    iniTs: string | null
    fimTs: string | null
    profissionalId?: string | null
    servicoId?: string | null
  },
): Promise<number> {
  let q = sb.from('agendamentos').select('id', { count: 'exact', head: true })
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.unidadeId) q = q.eq('unidade_id', opts.unidadeId)
  if (opts.profissionalId) q = q.eq('profissional_id', opts.profissionalId)
  if (opts.servicoId) q = q.eq('servico_id', opts.servicoId)
  if (opts.iniTs) q = q.gte('inicio', opts.iniTs)
  if (opts.fimTs) q = q.lt('inicio', opts.fimTs)
  const { count } = await q
  return count ?? 0
}

export default async function RelAgendamentosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()

  // Unidade: o contexto do franqueado fixa a unidade; para admin (sem fixação),
  // o filtro ?unidade= escolhe. Estas colunas são indexadas → .eq() barato.
  const unidadeFixa = ctx?.activeUnitId ?? null
  const unidadeId = unidadeFixa ?? (sp.unidade || null)
  const profissionalId = sp.profissional || null
  const servicoId = sp.servico || null

  // Default mais útil aqui: a base tem datas futuras (até 2035); 'mes' funciona bem.
  const range = resolveRelRange(sp.periodo, sp.di, sp.df)
  const iniTs = asTsStart(range.ini)
  const fimTs = asTsStart(range.fim)

  // ── Listas dos dropdowns (pequenas; só nomes) ──
  const [unidadesRes, colaboradoresRes, servicosRes] = await Promise.all([
    // Filtro de unidade só faz sentido quando o contexto NÃO fixa a unidade.
    unidadeFixa
      ? Promise.resolve({ data: [] as { id: string; nome: string }[] })
      : sb.from('unidades').select('id,nome').eq('ativa', true).order('nome'),
    (() => {
      let q = sb.from('colaboradores').select('id,nome').eq('status', 'ativo').order('nome').limit(500)
      if (unidadeId) q = q.eq('unidade_id', unidadeId)
      return q
    })(),
    sb.from('servicos').select('id,nome').eq('ativo', true).order('nome').limit(1000),
  ])
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[]
  const colaboradores = (colaboradoresRes.data ?? []) as { id: string; nome: string }[]
  const servicos = (servicosRes.data ?? []) as { id: string; nome: string }[]

  // ── Contagens por status (paralelo, head:true  nunca puxa as 136k linhas) ──
  const [total, ...porStatus] = await Promise.all([
    contar(sb, { unidadeId, iniTs, fimTs, profissionalId, servicoId }),
    ...STATUS.map((s) => contar(sb, { status: s.val, unidadeId, iniTs, fimTs, profissionalId, servicoId })),
  ])
  const statusCounts = STATUS.map((s, i) => ({ ...s, count: porStatus[i] }))

  const concluidos = statusCounts.find((s) => s.val === 'concluido')?.count ?? 0
  const cancelados = statusCounts.find((s) => s.val === 'cancelado')?.count ?? 0
  const taxaConclusao = total > 0 ? (concluidos / total) * 100 : 0
  const taxaCancel = total > 0 ? (cancelados / total) * 100 : 0

  // ── Breakdown por dia (só quando o intervalo é "fechado" e curto, p/ não explodir) ──
  // Limitamos a 31 dias; cada dia = 1 count head. Acima disso, mostramos por status apenas.
  let porDia: { dia: string; count: number }[] = []
  if (range.ini && range.fim) {
    const d0 = new Date(range.ini + 'T00:00:00')
    const d1 = new Date(range.fim + 'T00:00:00')
    const dias = Math.round((d1.getTime() - d0.getTime()) / 864e5)
    if (dias > 0 && dias <= 31) {
      const tarefas: Promise<{ dia: string; count: number }>[] = []
      for (let i = 0; i < dias; i++) {
        const a = new Date(d0.getTime() + i * 864e5)
        const b = new Date(d0.getTime() + (i + 1) * 864e5)
        const aTs = a.toISOString()
        const bTs = b.toISOString()
        const label = `${String(a.getDate()).padStart(2, '0')}/${String(a.getMonth() + 1).padStart(2, '0')}`
        tarefas.push(
          (async () => {
            let q = sb.from('agendamentos').select('id', { count: 'exact', head: true }).gte('inicio', aTs).lt('inicio', bTs)
            if (unidadeId) q = q.eq('unidade_id', unidadeId)
            if (profissionalId) q = q.eq('profissional_id', profissionalId)
            if (servicoId) q = q.eq('servico_id', servicoId)
            const { count } = await q
            return { dia: label, count: count ?? 0 }
          })(),
        )
      }
      porDia = await Promise.all(tarefas)
    }
  }

  // Rótulo da unidade no cabeçalho: contexto fixo → nome do contexto; filtro do admin → nome escolhido.
  const unidadeNome = unidadeFixa
    ? ctx?.activeUnitName
    : sp.unidade
      ? (unidades.find((u) => u.id === sp.unidade)?.nome ?? 'Unidade')
      : 'Todas as unidades'

  const barStatus: BarRow[] = statusCounts.map((s) => ({ label: s.label, value: s.count, display: s.count.toLocaleString('pt-BR') }))
  const barDias: BarRow[] = porDia.map((d) => ({ label: d.dia, value: d.count, display: d.count.toLocaleString('pt-BR') }))

  const kpis: RelKpi[] = [
    { label: 'Total de agendamentos', value: total.toLocaleString('pt-BR'), icon: 'ti-calendar-stats' },
    { label: 'Concluídos', value: concluidos.toLocaleString('pt-BR'), icon: 'ti-circle-check', delta: `${taxaConclusao.toFixed(1)}% de conclusão`, deltaTone: 'up' },
    { label: 'Cancelados', value: cancelados.toLocaleString('pt-BR'), icon: 'ti-calendar-x', delta: `${taxaCancel.toFixed(1)}% de cancelamento`, deltaTone: taxaCancel > 25 ? 'down' : 'flat' },
    { label: 'Confirmados', value: (statusCounts.find((s) => s.val === 'confirmado')?.count ?? 0).toLocaleString('pt-BR'), icon: 'ti-calendar-check' },
  ]

  return (
    <div className="view active">
      <RelTabs active="agendamentos" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Agendamentos</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {range.label} · {unidadeNome}
        </span>
      </div>

      <RelFiltros periodo={sp.periodo || 'mes'} di={sp.di || ''} df={sp.df || ''} basePath="/relatorios/agendamentos" />

      <AgendamentosFiltros
        unidades={unidades}
        colaboradores={colaboradores}
        servicos={servicos}
        unidade={sp.unidade || ''}
        profissional={sp.profissional || ''}
        servico={sp.servico || ''}
      />

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Por status" icon="ti-chart-pie" rows={barStatus} emptyMsg="Sem agendamentos no período." />
        {porDia.length > 0 ? (
          <BarChart title="Por dia" icon="ti-calendar-week" rows={barDias} emptyMsg="Sem agendamentos no período." />
        ) : (
          <div className="dash-w">
            <h4>
              <i className="ti ti-calendar-week" /> Por dia
            </h4>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '8px 0' }}>
              Selecione um período de até 31 dias (mês atual, mês passado ou período personalizado) para ver o breakdown diário.
            </div>
          </div>
        )}
      </div>

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-table" /> Resumo por status
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{total.toLocaleString('pt-BR')} no período</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Status</th>
                <th className="num-r">Quantidade</th>
                <th className="num-r">% do total</th>
              </tr>
            </thead>
            <tbody>
              {total === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhum agendamento no período selecionado.
                  </td>
                </tr>
              )}
              {total > 0 &&
                statusCounts.map((s) => (
                  <tr key={s.val}>
                    <td>
                      <span className={`os-st ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="num-r" style={{ fontWeight: 600 }}>{s.count.toLocaleString('pt-BR')}</td>
                    <td className="num-r">{total > 0 ? ((s.count / total) * 100).toFixed(1) : '0,0'}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TODO(legado: buildAgendamentos): breakdown por profissional  a tabela `profissionais` não existe
          no backend atual (agendamentos.profissional_id é sempre null na base importada do BEMP).
          Quando a fonte existir, agrupar por profissional_id e juntar nomes. */}
    </div>
  )
}
