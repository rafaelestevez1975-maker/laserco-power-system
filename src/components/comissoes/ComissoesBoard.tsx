'use client'

import { useMemo, useState } from 'react'
import {
  COM_CATS_SEED,
  CARGO_LABEL,
  META_UNIDADE,
  SESSAO_TICKET,
  PERIODO_LBL,
  money,
  type ComCat,
  type SimColaborador,
} from './comissoes-data'

/**
 * Matriz de comissões (grade categorias × faixas) + Simulador de premiação em tempo real.
 * Fiel a buildComissoes do legado: Parte 1 (adicional por dezena sobre a premiação base) +
 * Parte 2 (bônus de fechamento do mês). Tudo client-side — não há tabela para persistir.
 * //TODO(needs-table: matriz_comissoes) — botão "Salvar matriz" mostra aviso honesto.
 */
export function ComissoesBoard({
  colaboradores,
  unidades,
  podeEditar,
}: {
  colaboradores: SimColaborador[]
  unidades: { id: string; nome: string }[]
  podeEditar: boolean
}) {
  // Estado da matriz (cópia editável do seed). Sem persistência (needs-table).
  const [cats, setCats] = useState<ComCat[]>(() => COM_CATS_SEED.map((c) => structuredClone(c)))
  const [divisor, setDivisor] = useState<number>(3) // 1=mês, 2=quinzena, 3=dezena (legado default 3)

  // Simulador
  const [catIdx, setCatIdx] = useState<number>(3) // legado default '3' (Consultoras)
  const [uniNome, setUniNome] = useState<string>(unidades[0]?.nome ?? '')
  const [colabFiltro, setColabFiltro] = useState<string>('')

  const meta = META_UNIDADE / divisor
  const [vendido, setVendido] = useState<number>(Math.round(0.685 * (META_UNIDADE / 3)))
  const [indiv, setIndiv] = useState<number>(Math.round(22000 / 3))
  const [sessoes, setSessoes] = useState<number>(Math.round(180 / 3))
  const [fatMes, setFatMes] = useState<number>(META_UNIDADE)

  // Ao trocar período, reescala os defaults dos sliders (espelha setPeriodo do legado).
  function aplicarPeriodo(div: number) {
    setDivisor(div)
    const m = META_UNIDADE / div
    setVendido(Math.round(0.685 * m))
    setIndiv(Math.round(22000 / div))
    setSessoes(Math.round(180 / div))
    if (fatMes === 0) setFatMes(META_UNIDADE)
  }

  function atualizarCat(i: number, mut: (c: ComCat) => void) {
    setCats((prev) => {
      const next = prev.map((c, idx) => (idx === i ? structuredClone(c) : c))
      mut(next[i])
      return next
    })
  }

  function novaCategoria() {
    setCats((prev) => [
      ...prev,
      { nome: 'Nova categoria', base: { individual: { on: false, pct: 0 }, loja: { on: false, pct: 0 }, sessao: { on: false, pct: 0 } }, tiers: { t80: 0, t100: 0, t120: 0, t130: 0 }, fech: { f100: 0, f120: 0, f130: 0 } },
    ])
  }

  function removerCategoria(i: number) {
    setCats((prev) => prev.filter((_, idx) => idx !== i))
    if (catIdx >= cats.length - 1) setCatIdx(Math.max(0, cats.length - 2))
  }

  // Quando escolhe um colaborador real, pré-seleciona categoria (por cargo) e unidade.
  function pickColab(nome: string) {
    setColabFiltro(nome)
    const hit = colaboradores.find((c) => c.nome === nome)
    if (!hit) return
    const ci = cats.findIndex((c) => c.cargo && c.cargo === hit.cargo)
    if (ci >= 0) setCatIdx(ci)
    if (hit.unidadeNome && unidades.some((u) => u.nome === hit.unidadeNome)) setUniNome(hit.unidadeNome)
  }

  // ── Cálculo do simulador (espelho fiel de simulate() do legado) ──
  const sim = useMemo(() => {
    const c = cats[catIdx]
    if (!c) return null
    const plbl = PERIODO_LBL[divisor]
    const base = (v: number) =>
      (c.base.individual.on ? (c.base.individual.pct / 100) * indiv : 0) +
      (c.base.loja.on ? (c.base.loja.pct / 100) * v : 0) +
      (c.base.sessao.on ? (c.base.sessao.pct / 100) * (sessoes * SESSAO_TICKET) : 0)
    const tierPct = (a: number) => (a >= 130 ? c.tiers.t130 : a >= 120 ? c.tiers.t120 : a >= 100 ? c.tiers.t100 : a >= 80 ? c.tiers.t80 : 0)
    const total = (v: number) => {
      const a = (v / meta) * 100
      return a < 80 ? 0 : base(v) * (1 + tierPct(a) / 100)
    }
    const att = (vendido / meta) * 100
    const cur = total(vendido)

    // Parte 2 — fechamento do mês
    const attMes = (fatMes / META_UNIDADE) * 100
    const fpct = attMes >= 130 ? c.fech.f130 : attMes >= 120 ? c.fech.f120 : attMes >= 100 ? c.fech.f100 : 0
    const part2 = (fpct / 100) * fatMes
    const totalMes = cur * 3 + part2 // 3 dezenas + bônus de fechamento

    const lvls = [80, 100, 120, 130]
    const next = lvls.find((p) => att < p)

    return { c, plbl, att, cur, attMes, fpct, part2, totalMes, next, tier: tierPct(att), total }
  }, [cats, catIdx, divisor, meta, vendido, indiv, sessoes, fatMes])

  const maxS = 1.3 * meta
  const w = Math.min(100, (vendido / maxS) * 100)

  const inputPct: React.CSSProperties = { width: 56, padding: '5px 7px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 13, textAlign: 'right' }
  const periodoNote: Record<number, string> = {
    1: 'A meta cheia do mês (R$ 100.000) é usada para apurar a premiação.',
    2: 'A meta do mês é dividida em 2 quinzenas — cada período apura sobre R$ 50.000.',
    3: 'A meta do mês é dividida em 3 dezenas (10 dias) — cada período apura sobre ~R$ 33.333.',
  }

  return (
    <div>
      <p style={{ color: 'var(--text-2)', fontSize: 13.5, marginBottom: 16 }}>
        A premiação tem <b>duas partes</b>: <b>Parte 1</b> — adicional por faixa de meta (mín. &gt;80%, meta 100%, super 120%, hiper 130%) apurado <b>por dezena</b>; e <b>Parte 2</b> — adicional no <b>fechamento do mês</b> sobre o valor final, conforme a unidade bate meta/super/hiper. Use o simulador (com filtro por categoria, unidade ou colaborador) para ver o ganho em tempo real.
      </p>

      {/* Apuração da meta para premiação */}
      <div className="doc-card">
        <h3><i className="ti ti-calendar-stats" /> Apuração da meta para premiação</h3>
        <div className="seg" style={{ display: 'flex', gap: 8 }}>
          {[[1, 'Mensal'], [2, 'Quinzenal (15 dias)'], [3, 'Decendial (dezena · 10 dias)']].map(([d, lbl]) => (
            <button
              key={d as number}
              className={`seg-btn${divisor === d ? ' active' : ''}`}
              onClick={() => aplicarPeriodo(d as number)}
            >
              {lbl as string}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10 }}>{periodoNote[divisor]}</p>
      </div>

      {/* Aviso de persistência (needs-table) */}
      <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '10px 14px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
        <i className="ti ti-info-circle" style={{ color: 'var(--amber)', fontSize: 18 }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
          A matriz abaixo é um <b>modelo padrão da rede</b>. Edições recalculam o simulador na hora, mas <b>ainda não há tabela no backend</b> para salvá-las de forma permanente.
        </span>
      </div>

      <div className="mod-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        {podeEditar && (
          <button className="btn btn-primary" onClick={novaCategoria}><i className="ti ti-plus" /> Nova categoria</button>
        )}
      </div>

      {/* Grade de categorias × faixas */}
      <div>
        {cats.map((c, i) => (
          <div key={i} className="doc-card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <i className="ti ti-user-shield" style={{ color: 'var(--brand-500)', fontSize: 18 }} />
              <input
                value={c.nome}
                disabled={!podeEditar}
                onChange={(e) => atualizarCat(i, (x) => { x.nome = e.target.value })}
                style={{ flex: 1, fontWeight: 700, fontSize: 15, border: 'none', borderBottom: '1px dashed var(--line)', padding: '4px 2px', background: 'transparent' }}
              />
              {podeEditar && (
                <button title="Remover categoria" onClick={() => removerCategoria(i)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 17 }}>
                  <i className="ti ti-trash" />
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              {/* Premiação base */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Premiação base (marque um ou mais)</div>
                {([
                  ['individual', 'Venda individual'],
                  ['loja', 'Meta da loja'],
                  ['sessao', 'Sessão executada'],
                ] as const).map(([key, lbl]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                      <input type="checkbox" disabled={!podeEditar} checked={c.base[key].on} onChange={(e) => atualizarCat(i, (x) => { x.base[key].on = e.target.checked })} />
                      {lbl}
                    </label>
                    <input style={inputPct} disabled={!podeEditar} value={c.base[key].pct} onChange={(e) => atualizarCat(i, (x) => { x.base[key].pct = parseFloat(e.target.value) || 0 })} />
                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>%</span>
                  </div>
                ))}
              </div>

              {/* Faixas */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Parte 1 · Adicional por <b>dezena</b> (sobre a premiação base)</div>
                {([
                  ['t80', 'Mín. >80%', '#8a8a8a'],
                  ['t100', 'Meta 100%', 'var(--brand-500)'],
                  ['t120', 'Super 120%', 'var(--brand-600)'],
                  ['t130', 'Hiper 130%', '#7a1f3d'],
                ] as const).map(([key, lbl, color]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span className="os-st" style={{ background: `${color}22`, color, minWidth: 96, textAlign: 'center' }}>{lbl}</span>
                    <span style={{ color: 'var(--text-3)' }}>+</span>
                    <input style={inputPct} disabled={!podeEditar} value={c.tiers[key]} onChange={(e) => atualizarCat(i, (x) => { x.tiers[key] = parseFloat(e.target.value) || 0 })} />
                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>%</span>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', margin: '13px 0 8px' }}>Parte 2 · Adicional no <b>fechamento do mês</b> (sobre o valor final da unidade)</div>
                {([
                  ['f100', 'Meta 100%', 'var(--brand-500)'],
                  ['f120', 'Super 120%', 'var(--brand-600)'],
                  ['f130', 'Hiper 130%', '#7a1f3d'],
                ] as const).map(([key, lbl, color]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span className="os-st" style={{ background: `${color}22`, color, minWidth: 96, textAlign: 'center' }}>{lbl}</span>
                    <span style={{ color: 'var(--text-3)' }}>+</span>
                    <input style={inputPct} disabled={!podeEditar} value={c.fech[key]} onChange={(e) => atualizarCat(i, (x) => { x.fech[key] = parseFloat(e.target.value) || 0 })} />
                    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>%</span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12, color: 'var(--amber)' }}>
                  <i className="ti ti-alert-triangle" /> Abaixo de 80% da meta da unidade: <b>sem premiação</b>.
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Simulador */}
      <div className="doc-card">
        <h3><i className="ti ti-bolt" /> Simulador de premiação em tempo real</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div className="mf">
                <label>Filtrar por colaborador</label>
                <input list="simColabList" placeholder="Digite um nome…" value={colabFiltro} onChange={(e) => pickColab(e.target.value)} />
                <datalist id="simColabList">
                  {colaboradores.map((c) => (
                    <option key={c.id} value={c.nome}>{(c.cargo && CARGO_LABEL[c.cargo]) || c.cargo || '—'} · {c.unidadeNome}</option>
                  ))}
                </datalist>
              </div>
              <div className="mf">
                <label>Unidade</label>
                <select value={uniNome} onChange={(e) => setUniNome(e.target.value)}>
                  {unidades.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="mf" style={{ marginBottom: 14 }}>
              <label>Categoria da colaboradora</label>
              <select value={catIdx} onChange={(e) => setCatIdx(Number(e.target.value))}>
                {cats.map((c, i) => <option key={i} value={i}>{c.nome}</option>)}
              </select>
            </div>
            <div className="mf" style={{ marginBottom: 14 }}>
              <label>Meta da unidade (por {PERIODO_LBL[divisor]})</label>
              <input value={money(meta)} disabled />
            </div>
            <div className="sim-slider">
              <label>Vendido pela unidade na {PERIODO_LBL[divisor]}: <b style={{ color: 'var(--brand-500)' }}>{money(vendido)}</b></label>
              <input type="range" min={0} max={Math.round(1.3 * meta)} step={divisor === 1 ? 1000 : 500} value={vendido} onChange={(e) => setVendido(Number(e.target.value))} />
            </div>
            <div className="sim-slider">
              <label>Minha venda individual ({PERIODO_LBL[divisor]}): <b style={{ color: 'var(--brand-500)' }}>{money(indiv)}</b></label>
              <input type="range" min={0} max={Math.round(50000 / divisor)} step={250} value={indiv} onChange={(e) => setIndiv(Number(e.target.value))} />
            </div>
            <div className="mf" style={{ marginBottom: 14 }}>
              <label>Sessões executadas por mim ({PERIODO_LBL[divisor]})</label>
              <input type="number" min={0} value={sessoes} onChange={(e) => setSessoes(Number(e.target.value) || 0)} />
            </div>
            <div className="sim-slider">
              <label>Faturamento final do mês — fechamento (unidade): <b style={{ color: 'var(--brand-500)' }}>{money(fatMes)}</b></label>
              <input type="range" min={0} max={Math.round(1.4 * META_UNIDADE)} step={1000} value={fatMes} onChange={(e) => setFatMes(Number(e.target.value))} />
            </div>
          </div>

          {/* Resultado */}
          <div className="sim-result">
            {sim && (
              <>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>Parte 1 · por {PERIODO_LBL[divisor]}{uniNome ? ' — ' + uniNome : ''}</div>
                <div className="sim-earn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Premiação da {PERIODO_LBL[divisor]}<b>{money(sim.cur)}</b></div>
                <div className="sim-prog" style={{ position: 'relative' }}>
                  <div className="fill" style={{ width: `${w}%` }} />
                  <div className="sim-mark" style={{ left: `${(meta * 0.8 / maxS) * 100}%` }}><span>80%</span></div>
                  <div className="sim-mark" style={{ left: `${(meta / maxS) * 100}%` }}><span>100%</span></div>
                  <div className="sim-mark" style={{ left: `${Math.min(100, (meta * 1.2 / maxS) * 100)}%` }}><span>120%</span></div>
                  <div className="sim-mark" style={{ left: '99%' }}><span>130%</span></div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span>Unidade na {PERIODO_LBL[divisor]}: {money(vendido)} de {money(meta)}</span>
                  <span><b>{Math.round(sim.att)}%</b> da meta</span>
                </div>

                {/* Mensagens da Parte 1 */}
                {sim.att < 80 ? (
                  <>
                    <div className="sim-msg warn-msg"><i className="ti ti-alert-triangle" /> <b>Abaixo de 80% da meta da unidade não há premiação.</b> Parte 1 atual: <b>R$ 0</b>.</div>
                    <div className="sim-msg next"><i className="ti ti-target" /> Faltam <b>{money(meta * 0.8 - vendido)}</b> em vendas da unidade ({PERIODO_LBL[divisor]}) para a <b>meta mínima (80%)</b> e desbloquear a premiação (+<b>{sim.c.tiers.t80}%</b>). Ao atingir: <b>{money(sim.total(meta * 0.8))}</b>.</div>
                  </>
                ) : (
                  <>
                    <div className="sim-msg ok"><i className="ti ti-check" /> Faixa da {PERIODO_LBL[divisor]} atingida! Adicional de <b>+{sim.tier}%</b> aplicado na Parte 1.</div>
                    {sim.next ? (
                      <div className="sim-msg next"><i className="ti ti-arrow-up-right" /> Faltam <b>{money(meta * sim.next / 100 - vendido)}</b> para o nível <b>{sim.next}%</b> → Parte 1 de <b>{money(sim.total(meta * sim.next / 100))}</b> (+{money(sim.total(meta * sim.next / 100) - sim.cur)}).</div>
                    ) : (
                      <div className="sim-msg ok"><i className="ti ti-trophy" /> Hipermeta (130%) atingida! Adicional de <b>+{sim.c.tiers.t130}%</b> aplicado. 🎉</div>
                    )}
                  </>
                )}

                <div style={{ borderTop: '1px dashed var(--line)', margin: '14px 0 10px' }} />
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>Parte 2 · fechamento do mês</div>
                <div className="sim-earn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#7a1f3d,#a83a5b)' }}>Bônus de fechamento<b>{money(sim.part2)}</b></div>
                {sim.fpct > 0 ? (
                  <div className="sim-msg ok"><i className="ti ti-cash" /> Fechamento do mês: unidade em <b>{Math.round(sim.attMes)}%</b> da meta → bônus de <b>+{sim.fpct}%</b> sobre {money(fatMes)} = <b>{money(sim.part2)}</b>.</div>
                ) : (
                  <div className="sim-msg next"><i className="ti ti-cash-off" /> Fechamento: unidade em <b>{Math.round(sim.attMes)}%</b> — abaixo de 100%, sem bônus de fechamento. Faltam <b>{money(Math.max(0, META_UNIDADE - fatMes))}</b> para a meta do mês (+{sim.c.fech.f100}%).</div>
                )}

                <div style={{ borderTop: '1px dashed var(--line)', margin: '14px 0 10px' }} />
                <div className="sim-earn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg,#23303a,#3a5060)' }}>Estimativa total no mês (3 dezenas + fechamento)<b>{money(sim.totalMes)}</b></div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
