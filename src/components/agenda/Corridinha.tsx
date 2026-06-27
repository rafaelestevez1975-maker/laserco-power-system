'use client'

import { useMemo, useState } from 'react'

/**
 * Corridinha de Vendas + Ranking de agendamentos do mês.
 * Paridade com o legado: CORRIDA (L4524), corridaDailyPts (L4525),
 * corridinhaHTML (L4535), corridaTick (L4566) e dashAgMesRender (L9450).
 *
 * No legado os números da rede são uma base fixa que "atualiza em tempo real"
 * (corridaTick joga um delta aleatório). Mantemos a MESMA base e a mesma regra
 * de pontos (11-pos para o top10). A unidade ativa é destacada pelo nome.
 */

type Unit = { u: string; dia: number; mes: number }

const CORRIDA_BASE: Unit[] = [
  { u: 'São Paulo - Vila Olímpia', dia: 12840, mes: 172 },
  { u: 'Porto Alegre - Iguatemi', dia: 9210, mes: 165 },
  { u: 'Goiânia - Setor Marista', dia: 8760, mes: 151 },
  { u: 'Fortaleza - Aldeota', dia: 8190, mes: 148 },
  { u: 'Cuiabá - Pantanal Shopping', dia: 7640, mes: 140 },
  { u: 'Belo Horizonte - Lourdes BH', dia: 7120, mes: 133 },
  { u: 'Maceió - Jatiuca', dia: 6880, mes: 128 },
  { u: 'Manaus - Ponta Negra Shopping', dia: 6540, mes: 121 },
  { u: 'Canoas - Park Shopping Canoas', dia: 6210, mes: 118 },
  { u: 'Gramado - Gramado', dia: 5980, mes: 110 },
  { u: 'São José', dia: 5640, mes: 104 },
  { u: 'Florianópolis - Centro', dia: 5210, mes: 96 },
  { u: 'Balneário Camboriú', dia: 4870, mes: 90 },
  { u: 'Maringá - Catuaí Shopping', dia: 4520, mes: 83 },
  { u: 'Petrolina - Petrolina', dia: 3980, mes: 74 },
  { u: 'Sinop - Sinop Shopping', dia: 3410, mes: 65 },
]

// _corUnits do legado: deriva agendamentos a partir das vendas.
type DerivedUnit = Unit & { agd: number; agm: number }
function corUnits(base: Unit[]): DerivedUnit[] {
  return base.map((x) => ({ ...x, agd: Math.round(x.dia / 108), agm: Math.round(x.mes * 11) }))
}
function dailyPts(pos: number): number { return pos <= 10 ? 11 - pos : 0 }

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

export function Corridinha({ unidadeNome }: { unidadeNome: string }) {
  const [base, setBase] = useState<Unit[]>(CORRIDA_BASE)
  const minha = unidadeNome // destaca a unidade ativa pelo nome (match exato ou parcial)
  const ehMinha = (u: string) => u === minha || (minha !== 'Todas as unidades' && u.startsWith(minha))

  const U = useMemo(() => corUnits(base), [base])

  // Rankings derivados.
  const vendas = useMemo(() => [...U].sort((a, b) => b.dia - a.dia).map((x, i) => ({ ...x, pos: i + 1 })), [U])
  const agdr = useMemo(() => [...U].sort((a, b) => b.agd - a.agd).map((x, i) => ({ ...x, pos: i + 1 })), [U])
  const dgame = useMemo(() => vendas.map((x) => ({ ...x, dpts: dailyPts(x.pos) })), [vendas])
  const mgame = useMemo(() => [...U].sort((a, b) => b.mes - a.mes).map((x, i) => ({ ...x, gpos: i + 1 })), [U])
  const agMes = useMemo(() => [...U].sort((a, b) => b.agm - a.agm).map((x, i) => ({ ...x, pos: i + 1 })), [U])

  const myV = vendas.find((x) => ehMinha(x.u))
  const myA = agdr.find((x) => ehMinha(x.u))
  const myDG = dgame.find((x) => ehMinha(x.u))
  const myMG = mgame.find((x) => ehMinha(x.u))
  const myAM = agMes.find((x) => ehMinha(x.u))
  const maxAgMes = agMes[0]?.agm || 1

  // corridaTick: delta aleatório nas vendas do dia (simula tempo real).
  function tick() {
    setBase((prev) => prev.map((x) => ({ ...x, dia: Math.max(0, x.dia + Math.round((Math.random() - 0.35) * 1200)) })))
  }

  const kpis: [string, string, string][] = [
    ['Vendas · sua posição', myV ? `${myV.pos}º` : '—', 'ti-flag'],
    ['Agendamentos · sua posição', myA ? `${myA.pos}º` : '—', 'ti-calendar-stats'],
    ['Unidades na rede', String(U.length), 'ti-building'],
    ['Meus pontos hoje (game)', myDG ? `${myDG.dpts} pts · ${myDG.pos}º` : '0', 'ti-bolt'],
    ['Meus pontos no mês (game)', myMG ? `${myMG.mes} pts · ${myMG.gpos}º` : '0', 'ti-device-gamepad-2'],
  ]

  const rowStyle = (mine: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 12.5,
    borderRadius: 8, ...(mine ? { background: 'var(--gold-soft)', fontWeight: 700 } : {}),
  })

  return (
    <>
      {/* Corridinha de Vendas */}
      <div className="rel-card" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold-soft)', color: 'var(--gold-600)' }}><i className="ti ti-trophy" style={{ fontSize: 20 }} /></div>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ranking do dia</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>Posição das unidades hoje · vendas (apenas posição), agendamentos e o game de pontuação</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}><i className="ti ti-circle-filled" style={{ fontSize: 8, verticalAlign: 2 }} /> Atualizando em tempo real</span>
          <button className="btn btn-ghost" onClick={tick}><i className="ti ti-refresh" /> Atualizar agora</button>
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
            {vendas.slice(0, 10).map((x) => (
              <div key={x.u} style={rowStyle(ehMinha(x.u))}>{medal(x.pos)}<span style={{ flex: 1 }}>{x.u}{ehMinha(x.u) && <b> (sua unidade)</b>}</span></div>
            ))}
            {myV && myV.pos > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myV.pos)}<span style={{ flex: 1 }}>{myV.u} <b>(sua unidade)</b></span></div></>}
          </Bloco>

          {/* Game · pontos do dia */}
          <Bloco titulo="Game · pontos do dia" icon="ti-bolt" sub={<span>Pontos pela posição de <b>vendas de hoje</b></span>}>
            {dgame.slice(0, 10).map((x) => (
              <div key={x.u} style={rowStyle(ehMinha(x.u))}>{medal(x.pos)}<span style={{ flex: 1 }}>{x.u}</span><span style={{ color: 'var(--gold-600)', fontWeight: 800 }}>{x.dpts} pts</span></div>
            ))}
            {myDG && myDG.pos > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myDG.pos)}<span style={{ flex: 1 }}>{myDG.u}</span><span style={{ color: 'var(--gold-600)', fontWeight: 800 }}>{myDG.dpts} pts</span></div></>}
          </Bloco>

          {/* Agendamentos · hoje */}
          <Bloco titulo="Ranking de agendamentos · hoje" icon="ti-calendar-check" sub={<span>Nº de agendamentos por unidade</span>}>
            {agdr.slice(0, 10).map((x) => (
              <div key={x.u} style={rowStyle(ehMinha(x.u))}>{medal(x.pos)}<span style={{ flex: 1 }}>{x.u}</span><span style={{ color: 'var(--text-3)' }}>{x.agd} agds</span></div>
            ))}
            {myA && myA.pos > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myA.pos)}<span style={{ flex: 1 }}>{myA.u}</span><span style={{ color: 'var(--text-3)' }}>{myA.agd} agds</span></div></>}
          </Bloco>
        </div>

        {/* Game · pontuação acumulada no mês */}
        <div style={{ marginTop: 14 }}>
          <Bloco titulo="Game · pontuação acumulada no mês" icon="ti-device-gamepad-2" sub={<span>Ranking <b>mensal</b> por pontos acumulados — sem exibir valores em R$</span>}>
            {mgame.slice(0, 10).map((x) => (
              <div key={x.u} style={rowStyle(ehMinha(x.u))}>{medal(x.gpos)}<span style={{ flex: 1 }}>{x.u}</span><span style={{ fontWeight: 800 }}>{x.mes} pts</span></div>
            ))}
            {myMG && myMG.gpos > 10 && <><Sep /><div style={rowStyle(true)}>{medal(myMG.gpos)}<span style={{ flex: 1 }}>{myMG.u}</span><span style={{ fontWeight: 800 }}>{myMG.mes} pts</span></div></>}
          </Bloco>
        </div>
      </div>

      {/* Ranking de agendamentos · acumulado do mês (dashAgMesRender) */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}><i className="ti ti-calendar-stats" /> Ranking de agendamentos</h3>
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>acumulado do mês</span>
        </div>
        <div className="panel-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {agMes.slice(0, 10).map((x) => (
            <div key={x.u} style={rowStyle(ehMinha(x.u))}>
              {medal(x.pos)}
              <span style={{ minWidth: 160, flex: '0 0 auto' }}>{x.u}{ehMinha(x.u) && <b> (sua unidade)</b>}</span>
              <span style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 6, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.round((x.agm / maxAgMes) * 100)}%`, background: 'var(--brand-500)' }} />
              </span>
              <span style={{ minWidth: 56, textAlign: 'right', fontWeight: 700 }}>{x.agm.toLocaleString('pt-BR')}</span>
            </div>
          ))}
          {myAM && myAM.pos > 10 && (
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
