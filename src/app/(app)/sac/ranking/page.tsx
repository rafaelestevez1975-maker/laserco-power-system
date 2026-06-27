import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { PremiacaoConfig } from '@/components/sac/PremiacaoConfig'
import { PREM_DEFAULT, premioValor, type PremMonetaria, type PremMetricas } from '@/lib/sac'

const medalha = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`)
const brl = (n: number) => `R$ ${Math.round(Number(n) || 0).toLocaleString('pt-BR')}`

export default async function SacRankingPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  const [{ data: cfgRaw }, atendentes] = await Promise.all([
    sb.from('sac_premiacao_config').select('pesos').limit(1).maybeSingle(),
    listAtendentesSac(sb),
  ])
  const cfg = cfgRaw as { pesos?: Partial<PremMonetaria> } | null
  const prem: PremMonetaria = { ...PREM_DEFAULT, ...(cfg?.pesos ?? {}) }

  // Métricas reais por atendente (sac_tickets). Vendas/pacotes/CSAT ainda não têm fonte
  // real ligada ao atendente → entram como 0 (o prêmio usa o que é mensurável hoje).
  const linhas = await Promise.all(atendentes.map(async (a) => {
    const [{ count: total }, { count: resolvidos }, { count: atrasados }, { count: reversoes }] = await Promise.all([
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('fase', 'Concluído'),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('sla_violado', true),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).eq('fase', 'Concluído').not('pago', 'is', true).or('motivo_label.ilike.%cancel%,motivo_label.ilike.%reembolso%,motivo_label.ilike.%retenç%'),
    ])
    const tot = total ?? 0
    const atr = atrasados ?? 0
    const m: PremMetricas = { tot, con: resolvidos ?? 0, atr, rev: reversoes ?? 0, slaOk: Math.max(0, tot - atr), vendas: 0, pacotes: 0, csat: 0 }
    return { id: a.id, nome: a.nome, cargo: a.cargo, m, premio: premioValor(m, prem) }
  }))
  linhas.sort((a, b) => b.premio - a.premio || b.m.con - a.m.con)
  const top = linhas[0]

  const podeEditar = !!(ctx?.isAdmin || ctx?.papel === 'gestor' || ctx?.papel === 'sac')

  return (
    <div className="view active">
      <PremiacaoConfig prem={prem} podeEditar={podeEditar} />

      {top && top.premio > 0 && (
        <div className="rel-card" style={{ background: 'linear-gradient(135deg,var(--brand-600),var(--brand-400))', color: '#fff', marginBottom: 12, padding: 16, borderRadius: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Destaque do mês · maior premiação</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{top.nome}</div>
          <div style={{ fontSize: 13, opacity: 0.92 }}>{brl(top.premio)} · {top.m.con} resolvidos · {top.m.rev} reversões</div>
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
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{l.m.tot}</td>
                  <td style={{ textAlign: 'center' }}>{l.m.con}</td>
                  <td style={{ textAlign: 'center', color: l.m.rev > 0 ? '#15803D' : 'var(--text-3)', fontWeight: l.m.rev > 0 ? 700 : 400 }}>{l.m.rev}</td>
                  <td style={{ textAlign: 'center' }}>{l.m.slaOk}</td>
                  <td style={{ textAlign: 'center' }}>{l.m.atr === 0 ? <span style={{ color: '#0F6B3A', fontWeight: 700 }}>Zero ✓</span> : l.m.atr}</td>
                  <td style={{ textAlign: 'right' }}>{brl(l.m.vendas)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--brand-600)' }}>{brl(l.premio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
        <i className="ti ti-info-circle" /> Prêmio (R$) = atend.×{brl(prem.porAtendimento)} + finaliz.×{brl(prem.porFinalizado)} + reversões×{brl(prem.porReversao)} + no prazo×{brl(prem.porSLA)} + {prem.pctVendas}% das vendas + bônus zero-atraso ({brl(prem.bonusZeroAtraso)}) + bônus CSAT≥{prem.metaCSAT} ({brl(prem.bonusCSAT)}) + pacote×{brl(prem.bonusPacote)}. Reversão = cancelamento/reembolso concluído sem devolução (retenção). Vendas/CSAT/pacotes entram quando houver fonte ligada ao atendente.
      </div>
    </div>
  )
}
