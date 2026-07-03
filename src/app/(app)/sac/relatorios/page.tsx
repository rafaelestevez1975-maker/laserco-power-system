import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { rangePeriodo } from '@/lib/periodo'
import { temPapel } from '@/lib/rbac'
import { SacRelatorios } from '@/components/sac/SacRelatorios'

// Canais e fases EXATAMENTE como o write path canônico (sac/actions.ts) e as telas peer
// (Dashboard/kanban/ChamadosTabela). Servem só de "esqueleto" / ordem de exibição: as
// barras são montadas a partir da varredura real, então um valor fora desta lista
// (ex.: canal "Importado" da importação legada) AINDA aparece  não some do breakdown.
const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
const PRIOS = ['baixa', 'media', 'alta', 'urgente']

// Papéis com acesso ao SAC (paridade com PAPEIS_SAC + perfis operacionais que enxergam
// indicadores). admin_geral sempre passa via temPapel.
const PAPEIS_VER_SAC = ['sac', 'gestor', 'financeiro']

type SP = { periodo?: string; di?: string; df?: string }

export default async function SacRelatoriosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const spv = await searchParams
  // Default do período: "mes" (Mês atual), igual ao Dashboard do SAC e ao legado (REL_PERIODS idx 4).
  const periodo = spv.periodo ?? 'mes'
  const { di, df } = spv
  const ctx = await getSessionContext()

  // Guard de sessão: sem contexto = sessão inválida → estado honesto (não renderiza relatório vazio).
  if (!ctx) {
    return (
      <div className="view active">
        <div className="cli-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Sessão inválida ou expirada. Faça login novamente para ver os relatórios do SAC.
        </div>
      </div>
    )
  }

  // Guard de RBAC: só papéis do SAC (ou admin_geral) veem os relatórios.
  if (!temPapel(ctx.papel, ...PAPEIS_VER_SAC)) {
    return (
      <div className="view active">
        <div className="cli-card" style={{ padding: 18, color: 'var(--text-2)' }}>
          <i className="ti ti-lock" /> Você não tem permissão para ver os relatórios do SAC.
        </div>
      </div>
    )
  }

  const sb = await createClient()
  const activeUnit = ctx.activeUnitId ?? null
  const { ini, fim } = rangePeriodo(periodo, di, df)
  const uniNome = new Map((ctx.unidades ?? []).map((u) => [u.id, u.nome]))

  const [{ data: motRaw }, atendentes] = await Promise.all([
    sb.from('sac_motivos').select('label').eq('ativo', true).order('ordem', { ascending: true }),
    listAtendentesSac(sb),
  ])
  const motivos = ((motRaw ?? []) as { label: string }[]).map((m) => m.label)

  // PERF: antes esta tela disparava 60+ queries `count:'exact'` (1 por canal/fase/
  // prioridade/motivo + 3 POR atendente)  saturava o pool do Supabase. Agora é UMA
  // varredura das colunas necessárias (mesmos filtros) tabulada em JS. Mesmos números.
  let carregouOk = true
  let total = 0, concluidos = 0, slaViol = 0
  let reembTotal = 0, reembCount = 0, reembPagos = 0
  const canalMap = new Map<string, number>()
  const faseMap = new Map<string, number>()
  const prioMap = new Map<string, number>()
  const motivoMap = new Map<string, number>()
  const uniMap = new Map<string, number>()
  const atendMap = new Map<string, { total: number; resolvidos: number; violado: number }>()
  // Linhas de reembolso (1 por ticket com devolução > 0)  paridade com a tabela legada.
  const reembRows: { ref: string; cliente: string; unidadeId: string | null; valor: number; multa: boolean; pago: boolean }[] = []
  try {
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      let q = sb.from('sac_tickets').select('numero, protocolo, nome_cliente, fase, canal, prioridade, motivo_label, sla_violado, atribuido_para, unidade_id, valor_devolucao, multa_aplicada, pago')
      if (activeUnit) q = q.eq('unidade_id', activeUnit)
      if (ini) q = q.gte('criado_em', ini)
      if (fim) q = q.lt('criado_em', fim)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as {
        numero: number | null; protocolo: string | null; nome_cliente: string | null
        fase: string | null; canal: string | null; prioridade: string | null
        motivo_label: string | null; sla_violado: boolean | null; atribuido_para: string | null
        unidade_id: string | null; valor_devolucao: number | null; multa_aplicada: boolean | null; pago: boolean | null
      }[]
      for (const r of rows) {
        total++
        const concl = r.fase === 'Concluído'
        if (concl) concluidos++
        if (r.sla_violado) slaViol++
        if (r.canal) canalMap.set(r.canal, (canalMap.get(r.canal) ?? 0) + 1)
        if (r.fase) faseMap.set(r.fase, (faseMap.get(r.fase) ?? 0) + 1)
        if (r.prioridade) prioMap.set(r.prioridade, (prioMap.get(r.prioridade) ?? 0) + 1)
        if (r.motivo_label) motivoMap.set(r.motivo_label, (motivoMap.get(r.motivo_label) ?? 0) + 1)
        if (r.unidade_id) uniMap.set(r.unidade_id, (uniMap.get(r.unidade_id) ?? 0) + 1)
        if (r.atribuido_para) {
          const a = atendMap.get(r.atribuido_para) ?? { total: 0, resolvidos: 0, violado: 0 }
          a.total++; if (concl) a.resolvidos++; if (r.sla_violado) a.violado++
          atendMap.set(r.atribuido_para, a)
        }
        const v = r.valor_devolucao || 0
        if (v > 0) {
          reembTotal += v; reembCount++; if (r.pago) reembPagos++
          reembRows.push({
            ref: r.protocolo || `SAC-${r.numero ?? ''}`,
            cliente: r.nome_cliente || '',
            unidadeId: r.unidade_id,
            valor: v,
            multa: !!r.multa_aplicada,
            pago: !!r.pago,
          })
        }
      }
      if (rows.length < PAGE) break
    }
  } catch {
    carregouOk = false
  }

  // Estado de erro honesto: se a varredura falhou (RLS/conexão), não mostramos "tela vazia"
  // (Total 0, barras zeradas)  sinalizamos o erro como o Dashboard do SAC faz.
  if (!carregouOk) {
    return (
      <div className="view active">
        <div className="cli-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar os relatórios do SAC. Recarregue a página ou ajuste o período.
        </div>
      </div>
    )
  }

  // Barras montadas a partir do dado REAL: união da ordem canônica + valores que aparecem
  // nos tickets mas não estão na lista (ex.: "Importado"). Assim a soma das barras = Total.
  const ordenarUniao = (canon: string[], m: Map<string, number>) => {
    const extras = [...m.keys()].filter((k) => !canon.includes(k)).sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0))
    return [...canon, ...extras].map((k) => ({ nome: k, n: m.get(k) ?? 0 })).filter((d) => d.n > 0)
  }
  const canais = ordenarUniao(CANAIS, canalMap)
  const fases = ordenarUniao(FASES, faseMap)
  const prios = ordenarUniao(PRIOS, prioMap)
  const motivosTop = ordenarUniao(motivos, motivoMap).sort((a, b) => b.n - a.n).slice(0, 8)

  // Chamados por unidade (Top 10)  útil principalmente na visão "Todas as unidades"
  // (sem unidade ativa), onde o breakdown por unidade faz sentido (paridade com o legado).
  const porUnidade = !activeUnit
    ? [...uniMap.entries()]
        .map(([id, n]) => ({ nome: uniNome.get(id) ?? 'Sem unidade', n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 10)
    : []

  const atendOrden = atendentes
    .map((a) => {
      const p = atendMap.get(a.id) ?? { total: 0, resolvidos: 0, violado: 0 }
      return { nome: a.nome, total: p.total, resolvidos: p.resolvidos, slaPct: p.total ? Math.round(((p.total - p.violado) / p.total) * 100) : 0 }
    })
    .filter((a) => a.total > 0)
    .sort((a, b) => b.total - a.total)

  // Reembolsos: ordena pendentes antes de pagos, depois por valor desc; resolve nome da unidade.
  const reembolsos = reembRows
    .map((r) => ({ ref: r.ref, cliente: r.cliente, unidade: r.unidadeId ? (uniNome.get(r.unidadeId) ?? '') : '', valor: r.valor, multa: r.multa, pago: r.pago }))
    .sort((a, b) => Number(a.pago) - Number(b.pago) || b.valor - a.valor)

  // SLA: usamos a convenção CUMPRIDO ((total - violados)/total) em toda a tela  KPI,
  // coluna por atendente e CSV  para não exibir duas métricas opostas com o mesmo nome.
  const slaPct = total ? Math.round(((total - slaViol) / total) * 100) : 100

  return (
    <div className="view active">
      <SacRelatorios
        periodo={periodo}
        di={di ?? ''}
        df={df ?? ''}
        kpis={{ total, concluidos, emAberto: total - concluidos, slaViol, slaPct }}
        canais={canais}
        fases={fases}
        prioridades={prios}
        motivos={motivosTop}
        porUnidade={porUnidade}
        mostrarUnidade={!activeUnit}
        atendentes={atendOrden}
        reembolsos={reembolsos}
        reembResumo={{ total: reembTotal, count: reembCount, pagos: reembPagos }}
      />
    </div>
  )
}
