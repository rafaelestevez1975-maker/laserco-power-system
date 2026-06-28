'use client'

/**
 * Corridinha de Vendas + Ranking de agendamentos do mês.
 *
 * ANTES: usava uma base FIXA de 16 unidades com vendas/agendamentos inventados
 * e um botão "Atualizar agora" que injetava deltas com Math.random() — dado fake
 * apresentado como real. Substituído por dados reais agregados no servidor
 * (DashboardUnidade.tsx): cada linha vem de agendamentos/OS reais por unidade.
 *
 * Mantemos a regra de pontos do legado (11-pos para o top10). Vendas continuam
 * com VALOR OCULTO (só posição), como no legado.
 */

export type RankRow = {
  /** id da unidade (chave estável) */
  id: string
  /** nome exibido */
  u: string
  /** agendamentos do dia */
  agd: number
  /** agendamentos do mês */
  agm: number
  /** posição de vendas do dia (1 = maior faturamento). 0 = sem ranking de vendas. */
  posVendaDia: number
  /** posição de vendas do mês (1 = maior faturamento). 0 = sem ranking. */
  posVendaMes: number
  /** indica se há QUALQUER venda no dia (para distinguir "sem dados" de empate em 0) */
  temVendaDia: boolean
  /** indica se há QUALQUER venda no mês */
  temVendaMes: boolean
}

export type CorridinhaData = {
  rows: RankRow[]
  /** id da unidade ativa (destaque). null = "Todas as unidades". */
  minhaId: string | null
  /** houve erro ao carregar os dados reais */
  erro: boolean
}

function dailyPts(pos: number): number { return pos > 0 && pos <= 10 ? 11 - pos : 0 }

function medal(p: number) {
  const cls = p === 1 ? 'p1' : p === 2 ? 'p2' : p === 3 ? 'p3' : ''
  return <span className={`cor-pos ${cls}`} style={medalStyle(p)}>{p}º</span>
}
function medalStyle(p: number): React.CSSProperties {
  const base: React.CSSProperties = { minWidth: 30, textAlign: 'center', fontWeight: 800, fontSize: 12, borderRadius: 6, padding: '2px 6px' }
  if (p === 1) return { ...base, background: '#F6E5B6', color: '#8A6D17' }
  if (p === 2) return { ...base, background: '#E6E8EC', color: '#5A6270' }
  if (p === 3) return { ...base, background: '#F0DCC8', color: '#955A2B' }
  return { ...base, background: 'var(--surface-2)', color: 'var(--text-3)' }
}

function Vazio({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 4px' }}>{msg}</div>
}

export function Corridinha({ data }: { data: CorridinhaData }) {
  const { rows, minhaId, erro } = data
  const ehMinha = (id: string) => minhaId !== null && id === minhaId

  // Rankings derivados dos dados REAIS.
  const vendas = [...rows]
    .filter((x) => x.temVendaDia)
    .sort((a, b) => a.posVendaDia - b.posVendaDia)
  const agdr = [...rows].sort((a, b) => b.agd - a.agd).map((x, i) => ({ ...x, pos: i + 1 }))
  const dgame = vendas.map((x) => ({ ...x, dpts: dailyPts(x.posVendaDia) }))
  const mgame = [...rows]
    .filter((x) => x.temVendaMes)
    .sort((a, b) => a.posVendaMes - b.posVendaMes)
  const agMes = [...rows].sort((a, b) => b.agm - a.agm).map((x, i) => ({ ...x, pos: i + 1 }))

  const myV = vendas.find((x) => ehMinha(x.id))
  const myA = agdr.find((x) => ehMinha(x.id))
  const myDG = dgame.find((x) => ehMinha(x.id))
  const myMG = mgame.find((x) => ehMinha(x.id))
  const myAM = agMes.find((x) => ehMinha(x.id))
  const maxAgMes = agMes[0]?.agm || 1

  const kpis: [string, string, string][] = [
    ['Vendas · sua posição', myV ? `${myV.posVendaDia}º` : '—', 'ti-flag'],
    ['Agendamentos · sua posição', myA && myA.agd > 0 ? `${myA.pos}º` : '—', 'ti-calendar-stats'],
    ['Unidades na rede', String(rows.length), 'ti-building'],
    ['Meus pontos hoje (game)', myDG ? `${myDG.dpts} pts · ${myDG.posVendaDia}º` : '—', 'ti-bolt'],
    ['Meus pontos no mês (game)', myMG ? `${myMG.posVendaMes}º` : '—', 'ti-device-gamepad-2'],
  ]

  const rowStyle = (mine: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 12.5,
    borderRadius: 8, ...(mine ? { background: 'var(--gold-soft)', fontWeight: 700 } : {}),
  })

  if (erro) {
    return (
      <div className="rel-card" style={{ marginBottom: 18, padding: 16 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ranking do dia</h2>
        <Vazio msg="Não foi possível carregar o ranking agora. Tente novamente em instantes." />
      </div>
    )
  }

  return (
    <>
      {/* Corridinha de Vendas */}
      <div className="rel-card" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold-soft)', color: 'var(--gold-600)' }}><i className="ti ti-trophy" style={{ fontSize: 20 }} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ranking do dia</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>Posição das unidades hoje · vendas (apenas posição), agendamentos e o game de pontuação</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 14 }}>
          {kpis.map(([lab, val, ic]) => (
            <div key={lab} className="metric-box" style={{ padding: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}><i className={`ti ${ic}`} /> {lab}</span>
              <b style={{ fontSize: 17 }}>{val}</b>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {/* Vendas (só posição) */}
          <Bloco titulo="Ranking de vendas · hoje" icon="ti-trophy" sub={<span><i className="ti ti-lock" /> Valores ocultos · apenas a posição</span>}>
            {vendas.length === 0 && <Vazio msg="Sem vendas registradas hoje." />}
            {vendas.slice(0, 10).map((x) => (
              <div key={x.id} style={rowStyle(ehMinha(x.id))}>{medal(x.posVendaDia)}<span style={{ flex: 1 }}>{x.u}{ehMinha(x.id) && <b> (sua unidade)</b>}</span></div>
            ))}
            {myV && myV.posVendaDia > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myV.posVendaDia)}<span style={{ flex: 1 }}>{myV.u} <b>(sua unidade)</b></span></div></>}
          </Bloco>

          {/* Game · pontos do dia */}
          <Bloco titulo="Game · pontos do dia" icon="ti-bolt" sub={<span>Pontos pela posição de <b>vendas de hoje</b></span>}>
            {dgame.length === 0 && <Vazio msg="Sem pontuação hoje (sem vendas)." />}
            {dgame.slice(0, 10).map((x) => (
              <div key={x.id} style={rowStyle(ehMinha(x.id))}>{medal(x.posVendaDia)}<span style={{ flex: 1 }}>{x.u}</span><span style={{ color: 'var(--gold-600)', fontWeight: 800 }}>{x.dpts} pts</span></div>
            ))}
            {myDG && myDG.posVendaDia > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myDG.posVendaDia)}<span style={{ flex: 1 }}>{myDG.u}</span><span style={{ color: 'var(--gold-600)', fontWeight: 800 }}>{myDG.dpts} pts</span></div></>}
          </Bloco>

          {/* Agendamentos · hoje */}
          <Bloco titulo="Ranking de agendamentos · hoje" icon="ti-calendar-check" sub={<span>Nº de agendamentos por unidade</span>}>
            {agdr.every((x) => x.agd === 0) && <Vazio msg="Sem agendamentos hoje." />}
            {agdr.filter((x) => x.agd > 0).slice(0, 10).map((x) => (
              <div key={x.id} style={rowStyle(ehMinha(x.id))}>{medal(x.pos)}<span style={{ flex: 1 }}>{x.u}</span><span style={{ color: 'var(--text-3)' }}>{x.agd} agds</span></div>
            ))}
            {myA && myA.agd > 0 && myA.pos > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myA.pos)}<span style={{ flex: 1 }}>{myA.u}</span><span style={{ color: 'var(--text-3)' }}>{myA.agd} agds</span></div></>}
          </Bloco>
        </div>

        {/* Game · pontuação acumulada no mês (por posição de vendas do mês) */}
        <div style={{ marginTop: 14 }}>
          <Bloco titulo="Game · ranking de vendas no mês" icon="ti-device-gamepad-2" sub={<span>Ranking <b>mensal</b> por posição de vendas — sem exibir valores em R$</span>}>
            {mgame.length === 0 && <Vazio msg="Sem vendas registradas no mês." />}
            {mgame.slice(0, 10).map((x) => (
              <div key={x.id} style={rowStyle(ehMinha(x.id))}>{medal(x.posVendaMes)}<span style={{ flex: 1 }}>{x.u}{ehMinha(x.id) && <b> (sua unidade)</b>}</span></div>
            ))}
            {myMG && myMG.posVendaMes > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myMG.posVendaMes)}<span style={{ flex: 1 }}>{myMG.u} <b>(sua unidade)</b></span></div></>}
          </Bloco>
        </div>
      </div>

      {/* Ranking de agendamentos · acumulado do mês */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}><i className="ti ti-calendar-stats" /> Ranking de agendamentos</h3>
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>acumulado do mês</span>
        </div>
        <div className="panel-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agMes.every((x) => x.agm === 0) && <Vazio msg="Sem agendamentos no mês." />}
          {agMes.filter((x) => x.agm > 0).slice(0, 10).map((x) => (
            <div key={x.id} style={rowStyle(ehMinha(x.id))}>
              {medal(x.pos)}
              <span style={{ minWidth: 160, flex: '0 0 auto' }}>{x.u}{ehMinha(x.id) && <b> (sua unidade)</b>}</span>
              <span style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round((x.agm / maxAgMes) * 100)}%`, background: 'var(--brand-500)' }} />
              </span>
              <span style={{ minWidth: 56, textAlign: 'right', fontWeight: 700 }}>{x.agm.toLocaleString('pt-BR')}</span>
            </div>
          ))}
          {myAM && myAM.agm > 0 && myAM.pos > 10 && (
            <><Sep /><div style={rowStyle(true)}>{medal(myAM.pos)}<span style={{ minWidth: 160, flex: '0 0 auto' }}>{myAM.u} <b>(sua posição)</b></span><span style={{ flex: 1 }} /><span style={{ minWidth: 56, textAlign: 'right', fontWeight: 700 }}>{myAM.agm.toLocaleString('pt-BR')}</span></div></>
          )}
        </div>
      </div>
    </>
  )
}

function Bloco({ titulo, icon, sub, children }: { titulo: string; icon: string; sub: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
      <h4 style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700 }}><i className={`ti ${icon}`} /> {titulo}</h4>
      <div style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px' }}>{sub}</div>
      {children}
    </div>
  )
}
function Sep() {
  return <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', margin: '4px 0', textTransform: 'uppercase', letterSpacing: '.5px' }}>sua posição</div>
}
