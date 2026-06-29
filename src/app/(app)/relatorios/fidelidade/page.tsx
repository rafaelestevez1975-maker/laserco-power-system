import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'
import { BarChart, type BarRow } from '@/components/relatorios/BarChart'

export const dynamic = 'force-dynamic'

type SP = { ordem?: string }

// Relatório de Fidelidade (read-only, "Fidelidade / Situação" do legado, legacy/index.html ~7256).
// Fonte real confirmada: clientes.saldo_pontos / clientes.saldo_creditos
// (colunas usadas em clientes/page.tsx e clientes/[id]/page.tsx).
//
// É um relatório de SNAPSHOT (saldos atuais), não temporal → sem filtro de período.
// A base de clientes é grande (~347k linhas na introspecção), por isso:
//   - KPIs usam head:true (só count, nunca puxa linhas);
//   - a tabela traz só uma janela ordenada (top N por saldo) e os totais somados
//     são da janela trazida (rotulado como "top N", igual ao cap de faturamento).
const TOP_N = 100

// Interface estrutural mínima do builder de count (eq/gt encadeáveis + thenable).
type CountQuery = {
  eq: (c: string, v: unknown) => CountQuery
  gt: (c: string, v: unknown) => CountQuery
  then: Promise<{ count: number | null }>['then']
}

/** Conta clientes (head:true → só count) aplicando filtros encadeados. */
async function contar(
  sb: Awaited<ReturnType<typeof createClient>>,
  unidadeId: string | null,
  build: (q: CountQuery) => CountQuery,
): Promise<number | null> {
  // 'estimated' = estatística do Postgres (instantâneo); 'exact' varria ~347k clientes (9s).
  let base = sb.from('clientes').select('id', { count: 'estimated', head: true }) as unknown as CountQuery
  if (unidadeId) base = base.eq('unidade_origem_id', unidadeId)
  const { count } = await build(base)
  return count
}

type ClienteFid = {
  id: string
  nome: string | null
  telefone: string | null
  saldo_pontos: number | null
  saldo_creditos: number | null
}

export default async function RelFidelidadePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  // OBS (igual ao relatório de Clientes): clientes.unidade_origem_id é null na base atual,
  // então o escopo por unidade ainda não segmenta de fato — mantemos o aviso na tela.
  const unidadeId = ctx?.activeUnitId ?? null
  const ordem = sp.ordem === 'creditos' ? 'creditos' : 'pontos'
  const ordemCol = ordem === 'creditos' ? 'saldo_creditos' : 'saldo_pontos'

  // ── KPIs (head:true — nunca puxa as linhas) ──
  const [totalGeral, comPontos, comCreditos] = await Promise.all([
    contar(sb, unidadeId, (q) => q),
    contar(sb, unidadeId, (q) => q.gt('saldo_pontos', 0)),
    contar(sb, unidadeId, (q) => q.gt('saldo_creditos', 0)),
  ])

  // ── Janela ordenada por saldo (top N) — para tabela + somatórios da janela ──
  let topQ = sb
    .from('clientes')
    .select('id, nome, telefone, saldo_pontos, saldo_creditos')
    .order(ordemCol, { ascending: false, nullsFirst: false })
    .gt(ordemCol, 0)
    .limit(TOP_N)
  if (unidadeId) topQ = topQ.eq('unidade_origem_id', unidadeId)
  const { data: topData, error: topErr } = await topQ

  // Robustez: se a query falhar (coluna/tabela indisponível), cai no estado vazio.
  const indisponivel = topErr != null && totalGeral == null && comPontos == null && comCreditos == null
  const top = (topData ?? []) as ClienteFid[]

  // Totais somados sobre a JANELA trazida (top N) — rotulado como tal.
  const pontosTopN = top.reduce((a, c) => a + (c.saldo_pontos || 0), 0)
  const creditosTopN = top.reduce((a, c) => a + (c.saldo_creditos || 0), 0)
  const capped = top.length >= TOP_N

  const kpis: RelKpi[] = [
    { label: 'Base total', value: (totalGeral ?? 0).toLocaleString('pt-BR'), icon: 'ti-users' },
    {
      label: 'Com pontos',
      value: (comPontos ?? 0).toLocaleString('pt-BR'),
      icon: 'ti-coin',
      delta: totalGeral && totalGeral > 0 ? `${(((comPontos ?? 0) / totalGeral) * 100).toFixed(1)}% da base` : undefined,
      deltaTone: 'up',
    },
    {
      label: 'Com créditos',
      value: (comCreditos ?? 0).toLocaleString('pt-BR'),
      icon: 'ti-wallet',
      delta: totalGeral && totalGeral > 0 ? `${(((comCreditos ?? 0) / totalGeral) * 100).toFixed(1)}% da base` : undefined,
      deltaTone: 'up',
    },
    {
      label: ordem === 'creditos' ? `Créditos (top ${TOP_N})` : `Pontos (top ${TOP_N})`,
      value: ordem === 'creditos' ? moedaBR(creditosTopN) : pontosTopN.toLocaleString('pt-BR'),
      icon: 'ti-award',
    },
  ]

  const barTop: BarRow[] = top.slice(0, 10).map((c) => {
    const v = ordem === 'creditos' ? c.saldo_creditos || 0 : c.saldo_pontos || 0
    return {
      label: c.nome || 'Sem nome',
      value: v,
      display: ordem === 'creditos' ? moedaBR(v) : v.toLocaleString('pt-BR'),
    }
  })

  return (
    <div className="view active">
      <RelTabs active="fidelidade" query={relQuery(sp)} />

      <div className="rel-head">
        <div className="ri">
          <i className="ti ti-thumb-up" />
        </div>
        <div>
          <h2>Relatório de Fidelidade</h2>
          <p>
            Saldos atuais do clube · {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
          </p>
        </div>
      </div>

      {/* Troca de ordenação (pontos x créditos) sem JS de cliente — links de querystring. */}
      <div className="rel-card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700 }}>
          Ordenar por
        </span>
        <a
          href="/relatorios/fidelidade?ordem=pontos"
          className={`os-st ${ordem === 'pontos' ? 'os-aberta' : ''}`}
          style={{ textDecoration: 'none', border: '1px solid var(--line)' }}
        >
          <i className="ti ti-coin" /> Pontos
        </a>
        <a
          href="/relatorios/fidelidade?ordem=creditos"
          className={`os-st ${ordem === 'creditos' ? 'os-aberta' : ''}`}
          style={{ textDecoration: 'none', border: '1px solid var(--line)' }}
        >
          <i className="ti ti-wallet" /> Créditos
        </a>
      </div>

      {indisponivel ? (
        <div className="crm-note">
          <i className="ti ti-database-off" /> Relatório em preparação: a fonte de dados de fidelidade ainda não está disponível.
        </div>
      ) : (
        <>
          <RelKpis kpis={kpis} />

          {capped && (
            <div className="crm-note">
              <i className="ti ti-alert-triangle" /> Mostrando os {TOP_N} clientes com maior saldo de{' '}
              {ordem === 'creditos' ? 'créditos' : 'pontos'}. Os totais acima referem-se a esta janela.
            </div>
          )}

          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <BarChart
              title={ordem === 'creditos' ? 'Top 10 — créditos (R$)' : 'Top 10 — pontos'}
              icon="ti-award"
              rows={barTop}
              gold={ordem === 'creditos'}
              asMoeda={ordem === 'creditos'}
              emptyMsg="Nenhum cliente com saldo."
            />
            <div className="dash-w">
              <h4>
                <i className="ti ti-info-circle" /> Sobre o relatório
              </h4>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
                Snapshot dos saldos atuais do clube de fidelidade (pontos) e da carteira (créditos em R$),
                a partir do cadastro de clientes. Use o seletor acima para ordenar a lista por pontos ou por créditos.
              </div>
            </div>
          </div>

          <div className="cli-card">
            <div className="rel-card-h" style={{ margin: 0, padding: '14px 16px', borderBottom: '1px solid var(--line)', cursor: 'default' }}>
              <span>
                <i className="ti ti-trophy" /> Clientes por saldo ({ordem === 'creditos' ? 'créditos' : 'pontos'})
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>{top.length} cliente(s)</span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Telefone</th>
                    <th className="num-r">Pontos</th>
                    <th className="num-r">Créditos</th>
                  </tr>
                </thead>
                <tbody>
                  {top.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhum cliente com saldo de {ordem === 'creditos' ? 'créditos' : 'pontos'}.
                      </td>
                    </tr>
                  )}
                  {top.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.nome || 'Sem nome'}</td>
                      <td style={{ color: 'var(--text-3)' }}>{c.telefone || '—'}</td>
                      <td className="num-r" style={{ fontWeight: ordem === 'pontos' ? 700 : 400 }}>
                        {(c.saldo_pontos || 0).toLocaleString('pt-BR')}
                      </td>
                      <td className="num-r" style={{ fontWeight: ordem === 'creditos' ? 700 : 400 }}>
                        {moedaBR(c.saldo_creditos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {top.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--line)' }}>
                      <td style={{ fontWeight: 800 }} colSpan={2}>
                        Total (janela)
                      </td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{pontosTopN.toLocaleString('pt-BR')}</td>
                      <td className="num-r" style={{ fontWeight: 800 }}>{moedaBR(creditosTopN)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* OBS: clientes.unidade_origem_id não está populado no backend → o filtro por unidade
              ainda não segmenta de fato (mesmo caso do Relatório de Clientes). */}
          <div className="rel-card" style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 14px' }}>
            <i className="ti ti-info-circle" /> Os números refletem a base inteira: a coluna{' '}
            <code>unidade_origem_id</code> não está populada no backend, então ainda não é possível segmentar a
            fidelidade por unidade.
            {/* TODO(legado: "Fidelidade / Movimentação de pontos"): quando existir uma tabela de
                lançamentos de pontos (entradas/resgates/expiração), trazer extrato temporal e
                pontos a expirar nos próximos 12 meses (legacy/index.html ~1460). */}
          </div>
        </>
      )}
    </div>
  )
}
