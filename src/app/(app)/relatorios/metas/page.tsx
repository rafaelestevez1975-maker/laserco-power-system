import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'
import { ExportCsvButton } from '@/components/relatorios/ExportCsvButton'

export const dynamic = 'force-dynamic'

type SP = { visualizar?: string }

type MetaLin = {
  id: string
  colaborador_id: string
  indicador: string | null
  unidade_medida: string | null
  valor_alvo: number | null
  valor_realizado: number | null
  status: string | null
}

const IND_LABEL: Record<string, string> = {
  venda: 'Venda (R$)',
  agendamentos: 'Agendamentos',
  clientes_novos: 'Clientes novos',
  indicacoes: 'Indicações',
  sessoes: 'Sessões',
}

/**
 * Metas — réplica do REL_DEFS.metas do legado (legacy/index.html ~4394). Sobre dado REAL:
 * lê metas_colaborador (escopadas pela unidade via colaboradores), apura meta vs realizado e
 * % atingido por colaborador. KPIs: Meta do período / Realizado / % Atingido / Premiação
 * (liberada quando atingimento >= 80%, regra do legado). Filtro Visualizar (% Atingido | Valor).
 */
export default async function RelMetasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const visualizar = sp.visualizar === 'valor' ? 'valor' : 'pct'

  const PAGE = 1000

  // Colaboradores da unidade ativa (multitenant — metas_colaborador não tem unidade_id).
  // Paginação completa: numa unidade com >500 ativos a lista era cortada e os agregados
  // (meta/realizado/% e a decisão Premiação ≥80%) não batiam com a realidade.
  const colaboradores: { id: string; nome: string }[] = []
  for (let from = 0; from < 50000; from += PAGE) {
    let cq = sb.from('colaboradores').select('id, nome').eq('status', 'ativo').order('nome', { ascending: true })
    if (unidadeId) cq = cq.eq('unidade_id', unidadeId)
    const { data, error } = await cq.range(from, from + PAGE - 1)
    if (error) break
    const batch = (data ?? []) as { id: string; nome: string }[]
    colaboradores.push(...batch)
    if (batch.length < PAGE) break
  }
  const mapaColab = new Map(colaboradores.map((c) => [c.id, c.nome]))
  const colabIds = colaboradores.map((c) => c.id)

  // Metas dos colaboradores da unidade — paginadas + chunk no .in (evita corte e URL longa).
  const metas: MetaLin[] = []
  if (!unidadeId || colabIds.length > 0) {
    // Sem unidade ativa (rede): paginação direta. Com unidade: por lotes de colaboradores.
    const grupos: (string[] | null)[] = unidadeId ? [] : [null]
    if (unidadeId) for (let i = 0; i < colabIds.length; i += 200) grupos.push(colabIds.slice(i, i + 200))
    for (const grupo of grupos) {
      for (let from = 0; from < 50000; from += PAGE) {
        let mq = sb
          .from('metas_colaborador')
          .select('id, colaborador_id, indicador, unidade_medida, valor_alvo, valor_realizado, status')
          .order('criado_em', { ascending: false })
        if (grupo) mq = mq.in('colaborador_id', grupo)
        const { data, error } = await mq.range(from, from + PAGE - 1)
        if (error) break
        const batch = (data ?? []) as MetaLin[]
        metas.push(...batch)
        if (batch.length < PAGE) break
      }
    }
  }

  const linhas = metas.map((m) => {
    const alvo = Number(m.valor_alvo) || 0
    const real = Number(m.valor_realizado) || 0
    const pct = alvo > 0 ? (real / alvo) * 100 : 0
    const ehVenda = (m.indicador || '') === 'venda'
    return {
      id: m.id,
      colaborador: mapaColab.get(m.colaborador_id) ?? '—',
      indicador: IND_LABEL[m.indicador || ''] ?? m.indicador ?? '—',
      ehVenda,
      alvo,
      real,
      pct,
    }
  })

  // KPIs agregados sobre metas de VENDA (R$) — espelha "Meta do período / Realizado".
  const metasVenda = linhas.filter((l) => l.ehVenda)
  const metaTotal = metasVenda.reduce((a, l) => a + l.alvo, 0)
  const realizadoTotal = metasVenda.reduce((a, l) => a + l.real, 0)
  const pctAtingido = metaTotal > 0 ? (realizadoTotal / metaTotal) * 100 : 0
  // Regra do legado: premiação liberada quando atingimento >= 80% da meta.
  const premiacaoLiberada = pctAtingido >= 80

  const ordenadas = [...linhas].sort((a, b) => b.pct - a.pct)
  const barPct: BarRow[] = ordenadas
    .slice(0, 10)
    .map((l) => ({ label: l.colaborador + ' · ' + l.indicador, value: Math.round(l.pct), display: `${l.pct.toFixed(0)}%` }))

  const kpis: RelKpi[] = [
    { label: 'Meta do período (venda)', value: moedaBR(metaTotal), icon: 'ti-target' },
    { label: 'Realizado', value: moedaBR(realizadoTotal), icon: 'ti-cash' },
    { label: '% Atingido', value: `${pctAtingido.toFixed(0)}%`, icon: 'ti-percentage', delta: premiacaoLiberada ? 'meta de 80% atingida' : 'abaixo de 80%', deltaTone: premiacaoLiberada ? 'up' : 'down' },
    { label: 'Premiação', value: premiacaoLiberada ? 'Liberada' : 'Bloqueada', icon: 'ti-gift', deltaTone: premiacaoLiberada ? 'up' : 'down' },
  ]

  const csvRows = ordenadas.map((l) => [
    l.colaborador,
    l.indicador,
    l.ehVenda ? Math.round(l.real) : l.real,
    l.ehVenda ? Math.round(l.alvo) : l.alvo,
    l.pct.toFixed(0) + '%',
  ])

  const base = '/relatorios/metas'

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Metas</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}</span>
      </div>

      <div className="rel-legend">
        Apuração das <b>metas por colaborador</b> (meta vs realizado) cadastradas em <b>Cadastros · Metas</b>. A <b>premiação</b> é liberada quando o atingimento agregado de venda atinge <b>80% da meta</b> (regra do legado).
      </div>

      <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div className="rf">
          <label>Visualizar</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className={`btn ${visualizar === 'pct' ? 'btn-primary' : 'btn-ghost'}`} href={base}>
              % Atingido
            </a>
            <a className={`btn ${visualizar === 'valor' ? 'btn-primary' : 'btn-ghost'}`} href={`${base}?visualizar=valor`}>
              Valor
            </a>
          </div>
        </div>
        <ExportCsvButton filename="metas" headers={['Colaborador', 'Indicador', 'Realizado', 'Meta', '% Atingido']} rows={csvRows} />
      </div>

      {linhas.length === 0 && (
        <div className="rel-card" style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '12px 14px' }}>
          <i className="ti ti-info-circle" /> Nenhuma meta cadastrada {unidadeId ? 'para os colaboradores desta unidade' : ''}. Cadastre metas em <b>Cadastros · Metas</b> para vê-las aqui.
        </div>
      )}

      <RelKpis kpis={kpis} />

      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <BarChart title="Atingimento por colaborador (%)" icon="ti-target-arrow" rows={barPct} emptyMsg="Sem metas cadastradas." />
      </div>

      <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
          <span>
            <i className="ti ti-target" /> Metas por colaborador
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{linhas.length.toLocaleString('pt-BR')} meta(s)</span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Indicador</th>
                <th className="num-r">Realizado</th>
                <th className="num-r">Meta</th>
                <th className="num-r">% Atingido</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                    Nenhuma meta a exibir.
                  </td>
                </tr>
              )}
              {ordenadas.map((l) => {
                const fmt = (v: number) => (l.ehVenda ? moedaBR(v) : v.toLocaleString('pt-BR'))
                const tone = l.pct >= 100 ? 'var(--green)' : l.pct >= 80 ? 'var(--amber)' : 'var(--red)'
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="cli-name">{l.colaborador}</span>
                    </td>
                    <td>{l.indicador}</td>
                    <td className="num-r" style={{ fontWeight: 600 }}>
                      {visualizar === 'valor' || l.ehVenda ? fmt(l.real) : l.real.toLocaleString('pt-BR')}
                    </td>
                    <td className="num-r">{fmt(l.alvo)}</td>
                    <td className="num-r" style={{ fontWeight: 700, color: tone }}>{l.pct.toFixed(0)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
