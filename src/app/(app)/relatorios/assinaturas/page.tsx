import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'

export const dynamic = 'force-dynamic'

type SP = { ativo?: string }

/**
 * Relatório de Assinaturas — espelha o REL_DEFS.assinaturas do legado
 * (legacy/index.html ~4257: "Relatório de Assinaturas", KPIs de planos/MRR/ticket).
 *
 * Fonte de dados real (confirmada no código): `planos_assinatura` (catálogo de planos de
 * assinatura da rede) + `plano_assinatura_servicos` (serviços incluídos em cada plano).
 * Ver src/app/(app)/planos/page.tsx e src/app/(app)/planos/actions.ts.
 *
 * IMPORTANTE: não existe tabela de assinaturas *por cliente* no backend lkii
 * (cliente_assinaturas / assinaturas / clientes_planos não aparecem em nenhum from()),
 * portanto KPIs de "assinaturas ativas por cliente", churn e MRR realizado não são
 * calculáveis ainda. Este relatório mostra o catálogo de planos e o MRR/ticket potencial,
 * com aviso (crm-note) sobre a métrica que falta. `planos_assinatura` não tem unidade_id
 * (é escopo da franqueadora), então não há filtro por unidade — mantemos coerência com
 * /planos e mostramos a nota.
 */
type PlanoRow = {
  id: string
  nome: string | null
  descricao: string | null
  valor_mensal: number | null
  valor_adesao: number | null
  duracao_meses: number | null
  beneficios: string[] | null
  ativo: boolean | null
  criado_em: string | null
}

export default async function RelAssinaturasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  // Filtro simples: ativos (default) / todos.
  const filtroAtivo = sp.ativo === 'todos' ? 'todos' : 'ativos'

  // A tabela pode não existir / RLS pode barrar → tratamos o erro p/ estado vazio (sem quebrar).
  let rows: PlanoRow[] = []
  let semFonte = false
  {
    let q = sb
      .from('planos_assinatura')
      .select('id, nome, descricao, valor_mensal, valor_adesao, duracao_meses, beneficios, ativo, criado_em')
      .order('valor_mensal', { ascending: true })
      .limit(1000)
    if (filtroAtivo === 'ativos') q = q.eq('ativo', true)
    const { data, error } = await q
    if (error) semFonte = true
    else rows = (data ?? []) as PlanoRow[]
  }

  // Quantidade de serviços incluídos por plano (plano_assinatura_servicos).
  const itensPorPlano = new Map<string, number>()
  if (!semFonte && rows.length) {
    const ids = rows.map((r) => r.id)
    const { data: itRaw, error: itErr } = await sb
      .from('plano_assinatura_servicos')
      .select('plano_id, quantidade_mensal')
      .in('plano_id', ids)
    if (!itErr) {
      for (const it of (itRaw ?? []) as { plano_id: string; quantidade_mensal: number | null }[]) {
        itensPorPlano.set(it.plano_id, (itensPorPlano.get(it.plano_id) || 0) + (Number(it.quantidade_mensal) || 0))
      }
    }
  }

  // ── KPIs ──
  const ativos = rows.filter((r) => r.ativo !== false)
  const totalPlanos = rows.length
  const qtdAtivos = ativos.length
  // MRR potencial = soma das mensalidades dos planos ativos (1 assinante hipotético cada).
  const mrrPotencial = ativos.reduce((a, r) => a + (Number(r.valor_mensal) || 0), 0)
  // Ticket médio (mensalidade média dos planos ativos).
  const ticketMedio = qtdAtivos > 0 ? mrrPotencial / qtdAtivos : 0
  // Adesão média (planos ativos com valor_adesao > 0).
  const comAdesao = ativos.filter((r) => (Number(r.valor_adesao) || 0) > 0)
  const adesaoMedia = comAdesao.length > 0 ? comAdesao.reduce((a, r) => a + (Number(r.valor_adesao) || 0), 0) / comAdesao.length : 0

  // ── Gráficos ──
  const barMensalidade: BarRow[] = ativos
    .map((r) => ({ label: r.nome || '—', value: Number(r.valor_mensal) || 0, display: moedaBR(Number(r.valor_mensal) || 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // Distribuição por faixa de mensalidade (planos ativos).
  const faixas: { label: string; lo: number; hi: number }[] = [
    { label: 'Até R$ 100', lo: 0, hi: 100 },
    { label: 'R$ 100–200', lo: 100, hi: 200 },
    { label: 'R$ 200–400', lo: 200, hi: 400 },
    { label: 'Acima de R$ 400', lo: 400, hi: Infinity },
  ]
  const barFaixa: BarRow[] = faixas.map((f) => {
    const c = ativos.filter((r) => {
      const v = Number(r.valor_mensal) || 0
      return v >= f.lo && v < f.hi
    }).length
    return { label: f.label, value: c, display: c.toLocaleString('pt-BR') }
  })

  const kpis: RelKpi[] = [
    { label: 'Planos ativos', value: qtdAtivos.toLocaleString('pt-BR'), icon: 'ti-id-badge-2' },
    { label: 'MRR potencial', value: moedaBR(mrrPotencial), icon: 'ti-cash', delta: 'Soma das mensalidades dos planos ativos', deltaTone: 'flat' },
    { label: 'Ticket médio', value: moedaBR(ticketMedio), icon: 'ti-receipt' },
    { label: 'Adesão média', value: moedaBR(adesaoMedia), icon: 'ti-discount' },
  ]

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Assinaturas</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Catálogo de planos de assinatura da rede</span>
      </div>

      {semFonte && (
        <div className="crm-note" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-400)', fontSize: 12.5, color: 'var(--text-2)', padding: '12px 14px' }}>
          <i className="ti ti-database-import" /> Relatório em preparação: a fonte de dados de assinaturas ainda não está disponível no backend.
          Quando os planos de assinatura forem cadastrados em <code>/planos</code>, os indicadores aparecem aqui automaticamente.
        </div>
      )}

      {!semFonte && (
        <div className="rel-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label className="mf-l" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
              Planos
            </label>
            <div style={{ display: 'inline-flex', gap: 6 }}>
              <a
                href="/relatorios/assinaturas"
                className={`rel-tab${filtroAtivo === 'ativos' ? ' active' : ''}`}
                style={{ textDecoration: 'none' }}
              >
                Ativos
              </a>
              <a
                href="/relatorios/assinaturas?ativo=todos"
                className={`rel-tab${filtroAtivo === 'todos' ? ' active' : ''}`}
                style={{ textDecoration: 'none' }}
              >
                Todos
              </a>
            </div>
          </div>
        </div>
      )}

      {!semFonte && <RelKpis kpis={kpis} />}

      {!semFonte && (
        <div className="dash-grid" style={{ marginBottom: 16 }}>
          <BarChart title="Top planos por mensalidade" icon="ti-cash" rows={barMensalidade} gold asMoeda emptyMsg="Sem planos ativos." />
          <BarChart title="Planos por faixa de mensalidade" icon="ti-chart-bar" rows={barFaixa} emptyMsg="Sem planos ativos." />
        </div>
      )}

      {!semFonte && (
        <div className="rel-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="rel-card-h" style={{ padding: '14px 18px', cursor: 'default' }}>
            <span>
              <i className="ti ti-id-badge-2" /> Planos de assinatura
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{rows.length.toLocaleString('pt-BR')} plano(s)</span>
          </div>
          <div className="cli-scroll">
            <table className="cli-table">
              <thead>
                <tr>
                  <th>Plano</th>
                  <th>Status</th>
                  <th className="num-r">Mensalidade</th>
                  <th className="num-r">Adesão</th>
                  <th className="num-r">Duração</th>
                  <th className="num-r">Serviços/mês</th>
                  <th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                      {filtroAtivo === 'ativos' ? 'Nenhum plano ativo. Cadastre planos em /planos.' : 'Nenhum plano cadastrado ainda.'}
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const ativoBool = r.ativo !== false
                  const servicos = itensPorPlano.get(r.id) ?? 0
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="cli-name">{r.nome || '—'}</span>
                        {r.descricao && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{r.descricao}</div>}
                      </td>
                      <td>
                        <span className={`os-st ${ativoBool ? 'os-fechada' : 'os-cancelada'}`}>{ativoBool ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td className="num-r" style={{ fontWeight: 600 }}>{moedaBR(Number(r.valor_mensal) || 0)}/mês</td>
                      <td className="num-r">{(Number(r.valor_adesao) || 0) > 0 ? moedaBR(Number(r.valor_adesao)) : <span style={{ color: 'var(--text-3)' }}>Sem adesão</span>}</td>
                      <td className="num-r">{r.duracao_meses ? `${r.duracao_meses} ${r.duracao_meses === 1 ? 'mês' : 'meses'}` : <span style={{ color: 'var(--text-3)' }}>Sem fidelidade</span>}</td>
                      <td className="num-r">{servicos > 0 ? servicos.toLocaleString('pt-BR') : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td>{dataBR(r.criado_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--line)' }}>
                    <td style={{ fontWeight: 800 }}>Total ({qtdAtivos} ativo(s))</td>
                    <td />
                    <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(mrrPotencial)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <div className="crm-note" style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 14px', marginTop: 12 }}>
        <i className="ti ti-info-circle" /> Os indicadores refletem o <b>catálogo de planos</b> da rede{ctx?.papel ? '' : ''}. O backend ainda não
        registra assinaturas por cliente (tabela de vínculo cliente↔plano), então <b>assinaturas ativas, churn e MRR realizado</b> não são
        calculáveis no momento — o MRR exibido é o <b>potencial</b> (mensalidade por plano).
        {/* TODO(legado: REL_DEFS.assinaturas ~4257): quando existir a tabela de assinaturas por cliente,
            adicionar KPIs de assinaturas ativas / novas no período / canceladas / churn / MRR realizado
            e as abas "Pagamentos" e "Rateio de Assinaturas". */}
      </div>
    </div>
  )
}
