import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { rangePeriodo } from '@/lib/periodo'
import { moedaBR, dataBR } from '@/lib/fmt'
import { situacaoChamado } from '@/lib/sac'
import { SacDashFiltros } from '@/components/sac/SacDashFiltros'
import { RelKpis } from '@/components/relatorios/RelKpis'
import { BarChart } from '@/components/relatorios/BarChart'

// Paridade 1:1 com o legado `sacDashboard`/`sacDashRender` (legacy/index.html ~8985-9014).
// Canais e fases EXATAMENTE como o write path canônico (actions.ts) e as telas peer
// (kanban/relatorios/ChamadosTabela). Manter em sincronia: se um ticket usa um valor
// que não está aqui, ele some das contagens por canal/fase.
const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
const PRIOS: { k: string; l: string }[] = [
  { k: 'baixa', l: 'Baixa' }, { k: 'media', l: 'Média' }, { k: 'alta', l: 'Alta' }, { k: 'urgente', l: 'Crítica' },
]

const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: bg, color })
const cap = (s: string | null) => (s || '').replace(/^\w/, (c) => c.toUpperCase())
const prioPill = (p: string | null) => (p === 'alta' || p === 'urgente' ? pill('#FCEBE0', '#C2410C') : p === 'baixa' ? pill('#EEF2F7', '#64748B') : pill('#FBEFD9', '#9A6700'))
const prioLabel = (p: string | null) => (PRIOS.find((x) => x.k === p)?.l ?? cap(p))
// Status = situação do legado (Em andamento / Concluído / Em atraso).
const sitPill = (s: string) => (s === 'Concluído' ? pill('#E7F0EC', '#0F6B3A') : s === 'Em atraso' ? pill('#FBE6E6', '#B91C1C') : pill('#E7EEFB', '#1E3A8A'))

// `atendente` pode vir uma vez ou repetido (multi-seleção). Normalizamos sempre para array.
type SP = { periodo?: string; di?: string; df?: string; atendente?: string | string[] }

export default async function SacDashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const spv = await searchParams
  // Default do período: "mes" (Mês atual), igual ao legado (SAC_DFILT.per='Mês atual').
  const periodo = spv.periodo ?? 'mes'
  const { di, df } = spv
  const atSel = (Array.isArray(spv.atendente) ? spv.atendente : spv.atendente ? [spv.atendente] : []).filter(Boolean)
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null
  const sb = await createClient()
  const { ini, fim } = rangePeriodo(periodo, di, df)
  const uniNome: Record<string, string> = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  const [atendentesFull, { data: motivosRaw }] = await Promise.all([
    listAtendentesSac(sb),
    sb.from('sac_motivos').select('label').eq('ativo', true).order('ordem', { ascending: true }),
  ])
  const atendentes = atendentesFull.map((a) => ({ id: a.id, nome: a.nome }))
  const motivos = ((motivosRaw ?? []) as { label: string }[]).map((m) => m.label)

  // PERF: antes esta tela disparava ~33 queries `count:'exact'` separadas (6 KPIs +
  // 1 por canal + 1 por fase + 1 por motivo) MAIS um loop paginado só para reembolsos 
  // dezenas de varreduras em paralelo saturavam o pool do Supabase (lentidão / timeouts).
  // Agora fazemos UMA varredura das colunas necessárias (com os mesmos filtros) e
  // tabulamos tudo em JS. Mesmos números, 1 round-trip por bloco de 1000.
  let carregouOk = true
  let reembOk = true
  let total = 0, concluidos = 0, emAtraso = 0
  let slaViol = 0
  let reembTotal = 0, reembQtd = 0, reembPagos = 0
  let tempoResoMs = 0, tempoResoQtd = 0 // tempo médio de resolução (J.02): só chamados concluídos com carimbo
  const canalMap = new Map<string, number>()
  const faseMap = new Map<string, number>()
  const motivoMap = new Map<string, number>()
  try {
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      // concluido_em já existe no lkii (migration aplicada) e é carimbado ao concluir (actions.ts
      // + actions-sac.ts) → "Tempo médio de resolução" é REAL. Chamados antigos sem carimbo ficam
      // de fora da média (honesto), não quebram nada.
      let q = sb.from('sac_tickets').select('fase, canal, motivo_label, sla_violado, valor_devolucao, pago, criado_em, concluido_em')
      if (activeUnit) q = q.eq('unidade_id', activeUnit)
      if (atSel.length) q = q.in('atribuido_para', atSel)
      if (ini) q = q.gte('criado_em', ini)
      if (fim) q = q.lt('criado_em', fim)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as {
        fase: string | null; canal: string | null; motivo_label: string | null
        sla_violado: boolean | null; valor_devolucao: number | null; pago: boolean | null
        criado_em: string | null; concluido_em: string | null
      }[]
      for (const r of rows) {
        total++
        if (r.fase === 'Concluído') concluidos++
        // Tempo de resolução: só conta concluídos COM carimbo (chamados antigos sem concluido_em ficam de fora  honesto).
        if (r.fase === 'Concluído' && r.concluido_em && r.criado_em) {
          const dt = new Date(r.concluido_em).getTime() - new Date(r.criado_em).getTime()
          if (dt >= 0) { tempoResoMs += dt; tempoResoQtd++ }
        }
        if (r.sla_violado) { slaViol++; if (r.fase !== 'Concluído') emAtraso++ }
        if (r.canal) canalMap.set(r.canal, (canalMap.get(r.canal) ?? 0) + 1)
        if (r.fase) faseMap.set(r.fase, (faseMap.get(r.fase) ?? 0) + 1)
        if (r.motivo_label) motivoMap.set(r.motivo_label, (motivoMap.get(r.motivo_label) ?? 0) + 1)
        const v = r.valor_devolucao || 0
        if (v > 0) { reembTotal += v; reembQtd++; if (r.pago) reembPagos++ }
      }
      if (rows.length < PAGE) break
    }
  } catch {
    carregouOk = false
    reembOk = false
  }
  // Em andamento = nem concluído nem em atraso (paridade situacaoChamado).
  const emAndamento = Math.max(0, total - concluidos - emAtraso)
  // Taxa SLA cumprido: igual ao legado/relatorios  (total - violados) / total.
  const slaPct = total ? Math.round(((total - slaViol) / total) * 100) : 100
  // Tempo médio de resolução em dias (J.02): média de (concluido_em - criado_em) dos concluídos
  // carimbados no recorte. "" enquanto não houver nenhum (não inventamos valor, como o legado fazia).
  const tempoMedioDias = tempoResoQtd ? tempoResoMs / tempoResoQtd / 86400000 : null
  const tempoMedioLabel = tempoMedioDias == null
    ? ''
    : `${tempoMedioDias.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dias`
  const canalCounts = CANAIS.map((k) => canalMap.get(k) ?? 0)
  const faseCounts = FASES.map((f) => faseMap.get(f) ?? 0)
  const motivoCounts = motivos.map((m) => motivoMap.get(m) ?? 0)

  // Chamados recentes (6)  com Unidade, Motivo, Prioridade e Status (paridade com o legado).
  let recq = sb.from('sac_tickets').select('numero, protocolo, nome_cliente, canal, unidade_id, motivo_label, prioridade, fase, sla_violado')
    .order('criado_em', { ascending: false }).limit(6)
  if (activeUnit) recq = recq.eq('unidade_id', activeUnit)
  if (atSel.length) recq = recq.in('atribuido_para', atSel)
  if (ini) recq = recq.gte('criado_em', ini)
  if (fim) recq = recq.lt('criado_em', fim)
  const { data: recentesRaw, error: recError } = await recq
  const recentes = (recentesRaw ?? []) as {
    numero: number | null; protocolo: string | null; nome_cliente: string | null; canal: string | null
    unidade_id: string | null; motivo_label: string | null; prioridade: string | null; fase: string | null; sla_violado: boolean | null
  }[]

  // Estado de erro honesto: se as contagens falharam, mostra mensagem em vez de números errados.
  if (!carregouOk) {
    return (
      <div className="view active">
        <SacDashFiltros atendentes={atendentes} />
        <div className="cli-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar os indicadores do SAC. Recarregue a página ou ajuste os filtros.
        </div>
      </div>
    )
  }

  // KPIs (paridade 1:1, 6 cards serifados via rel-kpi):
  // Total / Em andamento / Concluídos / Em atraso / Tempo médio resolução / Taxa SLA cumprido.
  // "Tempo médio de resolução" agora é REAL: média de (concluido_em - criado_em) dos chamados
  // concluídos carimbados (J.02). Chamados concluídos antes desta feature não têm carimbo e
  // ficam de fora  por isso pode aparecer "" até novos chamados serem concluídos (honesto;
  // o legado exibia "3,2 dias" hardcoded  dado MOCK).
  const kpis = [
    { label: 'Total de chamados', value: total.toLocaleString('pt-BR'), icon: 'ti-headset' },
    { label: 'Em andamento', value: emAndamento.toLocaleString('pt-BR'), icon: 'ti-progress' },
    { label: 'Concluídos', value: concluidos.toLocaleString('pt-BR'), icon: 'ti-circle-check' },
    { label: 'Em atraso', value: emAtraso.toLocaleString('pt-BR'), icon: 'ti-alert-triangle' },
    { label: 'Tempo médio resolução', value: tempoMedioLabel, icon: 'ti-clock' },
    { label: 'Taxa SLA cumprido', value: `${slaPct}%`, icon: 'ti-shield-check' },
  ]

  // Barras: canal/motivo filtram >0 e ordenam desc; fases (kanban) mantêm a ordem fixa (legado).
  const canalBars = CANAIS.map((k, i) => ({ label: k, value: canalCounts[i] })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const motivoBars = motivos.map((m, i) => ({ label: m, value: motivoCounts[i] })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const faseBars = FASES.map((f, i) => ({ label: f, value: faseCounts[i] }))

  // Linha-resumo do recorte aplicado (paridade com o cabeçalho de contexto do legado).
  const periodoLabel = ((): string => {
    const map: Record<string, string> = { '': 'Qualquer período', hoje: 'Hoje', ontem: 'Ontem', semana: 'Última semana', mes: 'Mês atual', mes_passado: 'Mês passado', custom: 'Período' }
    return map[periodo] ?? 'Mês atual'
  })()
  const periodoRange = ini || fim ? ` (${ini ? dataBR(ini) : '…'} a ${fim ? dataBR(new Date(new Date(fim).getTime() - 864e5)) : '…'})` : ''
  const atendentesResumo = atSel.length ? `${atSel.length} atendente(s)` : 'todos os atendentes'

  return (
    <div className="view active">
      <SacDashFiltros atendentes={atendentes} />

      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        <i className="ti ti-filter" /> {total.toLocaleString('pt-BR')} chamado(s) · {periodoLabel}{periodoRange} · {atendentesResumo}
        {activeUnit && <> · {uniNome[activeUnit] ?? 'unidade ativa'}</>}
      </div>

      <RelKpis kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '14px 0' }}>
        <BarChart title="Chamados por canal" icon="ti-radio" rows={canalBars} />
        <BarChart title="Chamados por motivo" icon="ti-list-details" rows={motivoBars} gold />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <BarChart title="Distribuição no Kanban" icon="ti-layout-kanban" rows={faseBars} />
        <div className="dash-w">
          <h4><i className="ti ti-cash" /> Reembolsos solicitados (período)</h4>
          <div style={{ padding: '8px 4px' }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--brand-500)' }}>{reembOk ? moedaBR(reembTotal) : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {reembOk ? `${reembQtd} chamados com reembolso · ${reembPagos} já pagos` : 'não foi possível somar os reembolsos'}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-w">
        <h4><i className="ti ti-clock-hour-4" /> Chamados recentes</h4>
        <div className="cli-card">
          <div className="cli-scroll">
            <table className="cli-table">
              <thead><tr><th>Protocolo</th><th>Cliente</th><th>Canal</th><th>Unidade</th><th>Motivo</th><th>Prioridade</th><th>Status</th></tr></thead>
              <tbody>
                {recError && <tr><td colSpan={7} style={{ padding: 18, color: 'var(--red)' }}><i className="ti ti-alert-triangle" /> Não foi possível carregar os chamados recentes.</td></tr>}
                {!recError && recentes.length === 0 && <tr><td colSpan={7} style={{ padding: 18, color: 'var(--text-3)' }}>Nenhum chamado no período.</td></tr>}
                {!recError && recentes.map((t, i) => {
                  const sit = situacaoChamado(t.fase, t.sla_violado)
                  return (
                    <tr key={i}>
                      <td><b>{t.protocolo || `SAC-${t.numero ?? ''}`}</b></td>
                      <td>{t.nome_cliente || ''}</td>
                      <td>{t.canal || ''}</td>
                      <td>{t.unidade_id ? (uniNome[t.unidade_id] ?? '') : <span style={{ color: 'var(--text-3)' }}></span>}</td>
                      <td>{t.motivo_label || <span style={{ color: 'var(--text-3)' }}></span>}</td>
                      <td><span style={prioPill(t.prioridade)}>{prioLabel(t.prioridade)}</span></td>
                      <td><span style={sitPill(sit)}>{sit}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
