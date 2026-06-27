'use client'

import { useMemo, useState } from 'react'

const money = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR')
const META_MIN = 100000
const PLBL: Record<number, string> = { 1: 'mês', 2: 'quinzena', 3: 'dezena' }

/**
 * Painel de metas da UNIDADE — venda (mín. R$100k) + agendamentos + clientes novos (25%)
 * + indicações, com apuração mensal/quinzenal/decendial e alertas em tempo real.
 * Fiel a buildMetas/updateMetas/setMetasPeriodo do legado (~3640).
 *
 * É um SIMULADOR: não há tabela metas_unidade no backend lkii. //TODO(needs-table: metas_unidade)
 * — o botão "Salvar metas" mostra aviso honesto. As metas POR COLABORADOR (que têm tabela real)
 * ficam no CRUD logo abaixo nesta mesma tela.
 */
export function MetasUnidadeSimulador({
  unidades,
  mediaRede = 274,
  mesAnterior = 305,
}: {
  unidades: { id: string; nome: string }[]
  mediaRede?: number
  mesAnterior?: number
}) {
  const [div, setDiv] = useState<number>(1) // 1=mensal, 2=quinzenal, 3=decendial
  const [uniNome, setUniNome] = useState<string>(unidades[0]?.nome ?? '')

  const [venda, setVenda] = useState<number>(META_MIN)
  const agendMeta = Math.max(mediaRede, mesAnterior)

  const vendaPer = venda / div
  const superPer = vendaPer * 1.2
  const agendPer = agendMeta / div
  const novosPer = agendPer * 0.25

  const [vendReal, setVendReal] = useState<number>(68500)
  const [agReal, setAgReal] = useState<number>(210)
  const [nvReal, setNvReal] = useState<number>(38)
  const [indiques, setIndiques] = useState<number>(60)
  const [saving, setSaving] = useState<string | null>(null)

  const plbl = PLBL[div]

  // Garante mín. R$100k (regra do legado: nunca reduz).
  function setVendaClamped(v: number) {
    setVenda(v < META_MIN ? META_MIN : v)
  }

  const ind = useMemo(() => {
    const diaUtil = 26 // base do legado para meta diária de indicações
    const diaria = Math.max(1, Math.round(indiques / diaUtil))
    const proj = diaria * diaUtil
    return { diaria, proj }
  }, [indiques])

  const periodoHint: Record<number, string> = {
    1: 'Meta cheia do mês.',
    2: 'Meta dividida em 2 quinzenas (15 dias).',
    3: 'Meta dividida em 3 dezenas (10 dias).',
  }

  function salvar() {
    // //TODO(needs-table: metas_unidade) — sem tabela, só confirma visualmente (igual ao legado).
    setSaving('Metas da unidade calculadas. Ainda não há tabela no backend para publicá-las no Dashboard — quando existir, este botão persistirá.')
    setTimeout(() => setSaving(null), 6000)
  }

  return (
    <div>
      {/* Unidade e apuração */}
      <div className="doc-card">
        <h3><i className="ti ti-calendar-stats" /> Unidade e apuração</h3>
        <div style={{ marginBottom: 14, maxWidth: 360 }}>
          <div className="mf">
            <label>Unidade</label>
            <select value={uniNome} onChange={(e) => setUniNome(e.target.value)}>
              {unidades.length === 0 && <option value="">Nenhuma unidade visível</option>}
              {unidades.map((u) => <option key={u.id} value={u.nome}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        <div className="seg" style={{ display: 'flex', gap: 8 }}>
          {[[1, 'Mensal'], [2, 'Quinzenal (15 dias)'], [3, 'Decendial (dezena · 10 dias)']].map(([d, lbl]) => (
            <button key={d as number} className={`seg-btn${div === d ? ' active' : ''}`} onClick={() => setDiv(d as number)}>{lbl as string}</button>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 10 }}>{periodoHint[div]}</p>
      </div>

      {/* Meta de venda */}
      <div className="doc-card">
        <h3><i className="ti ti-currency-real" /> Meta de venda</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <div className="mf">
            <label>Meta mensal (mín. R$ 100.000)</label>
            <input type="number" min={META_MIN} step={2500} value={venda} onChange={(e) => setVendaClamped(Number(e.target.value) || 0)} onBlur={(e) => setVendaClamped(Number(e.target.value) || 0)} />
          </div>
          <div className="metric-box purple"><span>Meta do período</span><b>{money(vendaPer)}</b></div>
          <div className="metric-box gold"><span>Supermeta (+20%) · objetivo</span><b>{money(superPer)}</b></div>
        </div>
        <div className="sim-slider">
          <label>Vendido no período: <b style={{ color: 'var(--brand-500)' }}>{money(vendReal)}</b></label>
          <input type="range" min={0} max={Math.round(superPer)} value={Math.min(vendReal, Math.round(superPer))} onChange={(e) => setVendReal(Number(e.target.value))} />
        </div>
        <div className="sim-prog" style={{ position: 'relative' }}>
          <div className="fill" style={{ width: `${Math.min(100, (vendReal / superPer) * 100)}%` }} />
          <div className="sim-mark" style={{ left: `${(vendaPer / superPer) * 100}%` }}><span>Meta</span></div>
          <div className="sim-mark" style={{ left: '99.5%' }}><span>Super</span></div>
        </div>
        {vendReal >= superPer ? (
          <div className="sim-msg ok"><i className="ti ti-trophy" /> Supermeta da {plbl} batida! 🎉</div>
        ) : vendReal >= vendaPer ? (
          <div className="sim-msg ok"><i className="ti ti-check" /> Meta batida! Faltam <b>{money(superPer - vendReal)}</b> para a <b>supermeta</b> (objetivo).</div>
        ) : (
          <div className="sim-msg next"><i className="ti ti-target" /> Faltam <b>{money(vendaPer - vendReal)}</b> para a meta da {plbl} e <b>{money(superPer - vendReal)}</b> para a <b>supermeta (+20%, objetivo)</b>.</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2,#f7f7f8)', borderRadius: 8, padding: '10px 12px', marginTop: 12 }}>
          <b>Regras automáticas de reajuste:</b> a meta mínima de qualquer unidade é <b>R$ 100.000</b> e nunca é reduzida. A cada <b>2 meses consecutivos</b> batendo a meta, no <b>3º mês</b> a meta sobe para a <b>média dos 2 meses anteriores</b>, arredondada para cima (2,5k / 5k / 10k). Em <b>novembro</b> a meta sobe <b>40%</b> e, em <b>dezembro</b>, volta ao patamar de <b>outubro</b>. O objetivo é sempre a <b>supermeta (20% acima)</b>.
        </div>
      </div>

      {/* Meta de agendamentos */}
      <div className="doc-card">
        <h3><i className="ti ti-calendar-check" /> Meta de agendamentos</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <div className="metric-box"><span>Média da rede</span><b>{mediaRede}</b></div>
          <div className="metric-box"><span>Mês anterior (unidade)</span><b>{mesAnterior}</b></div>
          <div className="mf"><label>Meta mensal (maior dos dois)</label><input value={agendMeta} readOnly style={{ background: 'var(--surface-2)', fontWeight: 700 }} /></div>
          <div className="metric-box purple"><span>Meta do período</span><b>{Math.round(agendPer)} agend.</b></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2,#f7f7f8)', borderRadius: 8, padding: '10px 12px', margin: '12px 0' }}>
          <b>Regra geral:</b> a meta de agendamento da unidade é a <b>média da rede</b> ou o que a unidade <b>agendou no mês anterior</b>, o que for <b>maior</b> — podendo ser dividida no mês, por quinzena ou dezena.
        </div>
        <div className="sim-slider">
          <label>Agendado no período: <b style={{ color: 'var(--brand-500)' }}>{agReal} agend.</b></label>
          <input type="range" min={0} max={Math.max(10, Math.round(agendPer * 1.3))} value={Math.min(agReal, Math.max(10, Math.round(agendPer * 1.3)))} onChange={(e) => setAgReal(Number(e.target.value))} />
        </div>
        <div className="sim-prog" style={{ position: 'relative' }}>
          <div className="fill" style={{ width: `${Math.min(100, agendPer ? (agReal / agendPer) * 100 : 0)}%` }} />
          <div className="sim-mark" style={{ left: '99.5%' }}><span>Meta</span></div>
        </div>
        {agReal >= agendPer ? (
          <div className="sim-msg ok"><i className="ti ti-check" /> Meta de agendamentos da {plbl} atingida!</div>
        ) : (
          <div className="sim-msg next"><i className="ti ti-calendar-plus" /> Faltam <b>{Math.max(0, Math.ceil(agendPer - agReal))} agendamentos</b> para fechar a meta da {plbl}.</div>
        )}
      </div>

      {/* Meta de clientes novos */}
      <div className="doc-card">
        <h3><i className="ti ti-user-plus" /> Meta de clientes novos (avaliações)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
          <div className="metric-box"><span>Regra</span><b style={{ fontSize: 15 }}>25% do total de clientes</b></div>
          <div className="metric-box purple"><span>Meta do período</span><b>{Math.round(novosPer)} aval.</b></div>
        </div>
        <div className="sim-slider">
          <label>Avaliações (clientes novos) no período: <b style={{ color: 'var(--brand-500)' }}>{nvReal} aval.</b></label>
          <input type="range" min={0} max={Math.max(3, Math.round(novosPer * 1.5))} value={Math.min(nvReal, Math.max(3, Math.round(novosPer * 1.5)))} onChange={(e) => setNvReal(Number(e.target.value))} />
        </div>
        <div className="sim-prog" style={{ position: 'relative' }}>
          <div className="fill" style={{ width: `${Math.min(100, novosPer ? (nvReal / novosPer) * 100 : 0)}%` }} />
          <div className="sim-mark" style={{ left: '99.5%' }}><span>Meta</span></div>
        </div>
        {nvReal >= novosPer ? (
          <div className="sim-msg ok"><i className="ti ti-check" /> Meta de clientes novos (avaliações) da {plbl} atingida!</div>
        ) : (
          <div className="sim-msg next"><i className="ti ti-user-plus" /> Faltam <b>{Math.max(0, Math.ceil(novosPer - nvReal))} avaliações</b> (clientes novos) para a meta da {plbl} — equivale a 25% do total de clientes.</div>
        )}
      </div>

      {/* Meta de indicações */}
      <div className="doc-card">
        <h3><i className="ti ti-user-heart" /> Meta de indicações (Indiques)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <div className="mf"><label>Meta mensal de indicações</label><input type="number" min={0} step={5} value={indiques} onChange={(e) => setIndiques(Number(e.target.value) || 0)} /></div>
          <div className="metric-box"><span>Meta diária (auto)</span><b>{ind.diaria}</b></div>
          <div className="metric-box purple"><span>Projeção do mês (auto)</span><b>{ind.proj}</b></div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
          <i className="ti ti-info-circle" /> A <b>meta diária</b> e a <b>projeção do mês</b> são calculadas automaticamente a partir da meta mensal. Acompanhe no <b>dashboard de Gestão de Indiques</b>.
        </div>
      </div>

      {saving && (
        <div className="sim-msg ok" style={{ marginBottom: 6 }}><i className="ti ti-info-circle" /> {saving}</div>
      )}
      <div style={{ display: 'flex', gap: 10, margin: '6px 0 28px' }}>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={salvar}><i className="ti ti-device-floppy" /> Salvar metas</button>
      </div>
    </div>
  )
}
