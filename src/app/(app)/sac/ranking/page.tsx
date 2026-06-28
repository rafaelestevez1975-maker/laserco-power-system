import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { rangePeriodo } from '@/lib/periodo'
import { moedaBR, dataBR } from '@/lib/fmt'
import { temPapel } from '@/lib/rbac'
import { PremiacaoConfig } from '@/components/sac/PremiacaoConfig'
import { RankingFiltros } from '@/components/sac/RankingFiltros'
import { PREM_DEFAULT, premioValor, type PremMonetaria, type PremMetricas } from '@/lib/sac'

const medalha = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`)

type SP = { periodo?: string; di?: string; df?: string }

export default async function SacRankingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const spv = await searchParams
  // Default "mes" (Mês atual), coerente com o card "Destaque do mês" e com o Dashboard SAC.
  const periodo = spv.periodo ?? 'mes'
  const { di, df } = spv
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null
  const sb = await createClient()
  const { ini, fim } = rangePeriodo(periodo, di, df)

  const [{ data: cfgRaw }, atendentes] = await Promise.all([
    sb.from('sac_premiacao_config').select('pesos').limit(1).maybeSingle(),
    listAtendentesSac(sb),
  ])
  const cfg = cfgRaw as { pesos?: Partial<PremMonetaria> } | null
  const prem: PremMonetaria = { ...PREM_DEFAULT, ...(cfg?.pesos ?? {}) }

  // Métricas reais por atendente (sac_tickets). Vendas/pacotes/CSAT ainda não têm fonte
  // real ligada ao atendente → entram como 0 (o prêmio usa o que é mensurável hoje).
  // Escopo por unidade ativa (.eq('unidade_id', activeUnit)) + recorte de período
  // (gte/lt criado_em) — mesmos filtros do Dashboard SAC, para os números baterem.
  // PERF: UMA varredura paginada tabulando por atribuido_para em JS (não 4 counts por
  // atendente). Inclui a regra de "reversão" (concluído, não pago, motivo cancel/reembolso/retenç).
  const reCancel = /cancel|reembolso|retenç/i
  const stats = new Map<string, { tot: number; con: number; atr: number; rev: number }>()
  let carregouOk = true
  try {
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      let q = sb
        .from('sac_tickets')
        .select('atribuido_para, fase, sla_violado, pago, motivo_label')
        .not('atribuido_para', 'is', null)
      if (activeUnit) q = q.eq('unidade_id', activeUnit)
      if (ini) q = q.gte('criado_em', ini)
      if (fim) q = q.lt('criado_em', fim)
      const { data, error } = await q.range(offset, offset + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as {
        atribuido_para: string | null; fase: string | null; sla_violado: boolean | null
        pago: boolean | null; motivo_label: string | null
      }[]
      for (const r of rows) {
        if (!r.atribuido_para) continue
        const s = stats.get(r.atribuido_para) ?? { tot: 0, con: 0, atr: 0, rev: 0 }
        s.tot++
        const concl = r.fase === 'Concluído'
        if (concl) s.con++
        if (r.sla_violado) s.atr++
        if (concl && r.pago !== true && r.motivo_label != null && reCancel.test(r.motivo_label)) s.rev++
        stats.set(r.atribuido_para, s)
      }
      if (rows.length < PAGE) break
    }
  } catch {
    carregouOk = false
  }
  const linhas = atendentes.map((a) => {
    const s = stats.get(a.id) ?? { tot: 0, con: 0, atr: 0, rev: 0 }
    const tot = s.tot
    const atr = s.atr
    const m: PremMetricas = { tot, con: s.con, atr, rev: s.rev, slaOk: Math.max(0, tot - atr), vendas: 0, pacotes: 0, csat: 0 }
    return { id: a.id, nome: a.nome, cargo: a.cargo, m, premio: premioValor(m, prem) }
  })
  linhas.sort((a, b) => b.premio - a.premio || b.m.con - a.m.con)
  const top = linhas[0]

  // RBAC: admin/gestor/sac configuram a premiação (mesmo guard server-side em config/actions).
  const podeEditar = temPapel(ctx?.papel, 'sac', 'gestor')

  // Rótulo honesto do recorte aplicado (paridade com o cabeçalho de contexto do Dashboard).
  const periodoLabel = (() => {
    const map: Record<string, string> = { '': 'Todo o histórico', hoje: 'Hoje', ontem: 'Ontem', semana: 'Última semana', mes: 'Mês atual', mes_passado: 'Mês passado', custom: 'Período' }
    return map[periodo] ?? 'Mês atual'
  })()
  const periodoRange = ini || fim ? ` (${ini ? dataBR(ini) : '…'} a ${fim ? dataBR(new Date(new Date(fim).getTime() - 864e5)) : '…'})` : ''
  const destaqueLabel = periodo === '' ? 'Destaque · maior premiação' : `Destaque · ${periodoLabel.toLowerCase()} · maior premiação`

  return (
    <div className="view active">
      <PremiacaoConfig prem={prem} podeEditar={podeEditar} />

      <RankingFiltros />

      <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px' }}>
        <i className="ti ti-filter" /> {periodoLabel}{periodoRange}
        {activeUnit ? <> · {ctx?.activeUnitName ?? 'unidade ativa'}</> : <> · todas as unidades</>}
      </div>

      {!carregouOk ? (
        <div className="cli-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar o ranking do SAC. Recarregue a página ou ajuste o período.
        </div>
      ) : (
        <>
          {/* Card "Destaque" sempre visível: com fallback honesto quando não há premiação no período. */}
          {top && top.premio > 0 ? (
            <div className="rel-card" style={{ background: 'linear-gradient(135deg,var(--brand-600),var(--brand-400))', color: '#fff', marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{destaqueLabel}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{top.nome}</div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>{moedaBR(top.premio)} · {top.m.con} resolvidos · {top.m.rev} reversões</div>
            </div>
          ) : (
            <div className="rel-card" style={{ marginBottom: 12, color: 'var(--text-3)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>{destaqueLabel}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Sem premiação a destacar neste período — nenhum atendimento atribuído ainda.</div>
            </div>
          )}

          <div className="cli-card">
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr><th>#</th><th>Atendente</th><th>Atend.</th><th>Finaliz.</th><th>Reversões</th><th>No prazo</th><th>Atrasos</th><th>Vendas</th><th>Prêmio</th></tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: 'var(--text-3)' }}>Nenhum atendente SAC ativo.</td></tr>}
                  {linhas.map((l, i) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 700 }}>{medalha(i)}</td>
                      <td><b>{l.nome}</b>{l.cargo ? <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{l.cargo}</span> : null}</td>
                      <td style={{ textAlign: 'center' }}>{l.m.tot}</td>
                      <td style={{ textAlign: 'center' }}>{l.m.con}</td>
                      <td style={{ textAlign: 'center' }}>{l.m.rev > 0 ? <b style={{ color: 'var(--brand-600)' }}>{l.m.rev}</b> : '0'}</td>
                      <td style={{ textAlign: 'center' }}>{l.m.slaOk}</td>
                      <td style={{ textAlign: 'center' }}>{l.m.atr === 0 ? <span style={{ color: '#0F6B3A', fontWeight: 700 }}>Zero ✓</span> : l.m.atr}</td>
                      <td style={{ textAlign: 'right' }}>{moedaBR(l.m.vendas)}</td>
                      <td style={{ textAlign: 'right' }}><b>{moedaBR(l.premio)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
            <i className="ti ti-info-circle" /> Prêmio (R$) = atend.×{moedaBR(prem.porAtendimento)} + finaliz.×{moedaBR(prem.porFinalizado)} + reversões×{moedaBR(prem.porReversao)} + no prazo×{moedaBR(prem.porSLA)} + {prem.pctVendas}% das vendas + bônus zero-atraso ({moedaBR(prem.bonusZeroAtraso)}) + bônus CSAT≥{prem.metaCSAT} ({moedaBR(prem.bonusCSAT)}) + pacote×{moedaBR(prem.bonusPacote)}. Reversão = cancelamento/reembolso concluído sem devolução (retenção). Vendas/CSAT/pacotes entram quando houver fonte ligada ao atendente.
          </div>
        </>
      )}
    </div>
  )
}
