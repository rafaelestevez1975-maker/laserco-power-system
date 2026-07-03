import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { dataBR } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

/** Jornada esperada (h/dia)  base do saldo. O legado calcula sobre a carga diária do
 *  colaborador; sem essa coluna no schema, usamos 8h/dia úteis como padrão. */
const HORAS_DIA = 8

type Reg = { colaborador_id: string | null; tipo: string | null; data_hora: string | null }

/** Horas trabalhadas no dia: pares entrada→saída (com desconto do almoço). */
function horasNoDia(marcacoes: Reg[]): number {
  const ord = marcacoes
    .filter((m) => m.data_hora)
    .map((m) => ({ t: m.tipo, ms: new Date(m.data_hora as string).getTime() }))
    .sort((a, b) => a.ms - b.ms)
  let total = 0
  let entrada: number | null = null
  for (const m of ord) {
    if (m.t === 'entrada' || m.t === 'volta_almoco') entrada = m.ms
    else if ((m.t === 'saida' || m.t === 'saida_almoco') && entrada != null) {
      total += m.ms - entrada
      entrada = null
    }
  }
  return total / 3600000
}

/**
 * RH · Ponto (Jornada e Ponto)  porta a tela "Ponto" do portal RH (distinta do módulo
 * Ponto Digital GPS): jornada da semana, saldo semanal e banco de horas, a partir das
 * marcações reais (registros_ponto). Para bater o ponto por GPS use /ponto.
 */
export default async function RhPontoPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnitId = ctx?.activeUnitId ?? null

  // Semana corrente (segunda a domingo).
  const hoje = new Date()
  const dow = (hoje.getDay() + 6) % 7 // 0 = segunda
  const ini = new Date(hoje); ini.setDate(hoje.getDate() - dow); ini.setHours(0, 0, 0, 0)
  const fim = new Date(ini); fim.setDate(ini.getDate() + 7)

  // Colaboradores do escopo.
  let cq = sb.from('colaboradores').select('id, nome, cargo').eq('status', 'ativo').order('nome', { ascending: true }).limit(2000)
  if (activeUnitId) cq = cq.eq('unidade_id', activeUnitId)
  const { data: colabRaw } = await cq
  const colabs = (colabRaw ?? []) as { id: string; nome: string; cargo: string | null }[]
  const colabIds = colabs.map((c) => c.id)
  const restringe = !!activeUnitId && colabIds.length > 0

  // Marcações da semana.
  let regs: Reg[] = []
  let semTabela = false
  try {
    let rq = sb.from('registros_ponto')
      .select('colaborador_id, tipo, data_hora')
      .gte('data_hora', ini.toISOString())
      .lt('data_hora', fim.toISOString())
      .limit(5000)
    if (activeUnitId) rq = rq.eq('unidade_id', activeUnitId)
    if (restringe) rq = rq.in('colaborador_id', colabIds)
    const { data, error } = await rq
    if (error) semTabela = true
    else regs = (data ?? []) as Reg[]
  } catch { semTabela = true }

  // Agrupa por colaborador × dia.
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d })
  const diasUteis = dias.filter((d) => d.getDay() !== 0 && d.getDay() !== 6).length
  const cargaSemana = diasUteis * HORAS_DIA

  type Linha = { id: string; nome: string; cargo: string | null; porDia: number[]; total: number; saldo: number }
  const linhas: Linha[] = colabs.map((c) => {
    const porDia = dias.map((d) => {
      const dM = regs.filter((r) => r.colaborador_id === c.id && r.data_hora && new Date(r.data_hora).toDateString() === d.toDateString())
      return Math.round(horasNoDia(dM) * 10) / 10
    })
    const total = Math.round(porDia.reduce((a, b) => a + b, 0) * 10) / 10
    return { id: c.id, nome: c.nome, cargo: c.cargo, porDia, total, saldo: Math.round((total - cargaSemana) * 10) / 10 }
  }).filter((l) => l.total > 0 || regs.some((r) => r.colaborador_id === l.id))

  const totalSemana = Math.round(linhas.reduce((a, l) => a + l.total, 0) * 10) / 10
  const saldoRede = Math.round(linhas.reduce((a, l) => a + l.saldo, 0) * 10) / 10
  const diasLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

  return (
    <div className="view active">
      <div className="rel-head">
        <div className="ri" style={{ background: '#E7F0EC', color: '#0f6b3a' }}><i className="ti ti-clock" /></div>
        <div>
          <h2>Jornada e Ponto</h2>
          <p>Saldo semanal e banco de horas · semana de {dataBR(ini)} a {dataBR(new Date(fim.getTime() - 86400000))} · {ctx?.activeUnitName ?? 'Todas as unidades'}.</p>
        </div>
        <Link href="/ponto" className="btn btn-primary" style={{ marginLeft: 'auto' }}><i className="ti ti-map-pin-check" /> Bater ponto (GPS)</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 16px' }}>
        <div className="metric-box"><span>Carga prevista (semana)</span><b>{cargaSemana} h</b></div>
        <div className="metric-box"><span>Horas trabalhadas</span><b style={{ color: 'var(--brand-600)' }}>{totalSemana} h</b></div>
        <div className="metric-box"><span>Banco de horas (saldo)</span><b style={{ color: saldoRede >= 0 ? '#15803D' : '#D85563' }}>{saldoRede >= 0 ? '+' : ''}{saldoRede} h</b></div>
      </div>

      {semTabela && (
        <div className="rel-card" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '10px 14px', background: '#FFF7E6', border: '1px solid #F0D89A' }}>
          <i className="ti ti-database-off" style={{ color: 'var(--amber)', fontSize: 18 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Tabela de ponto indisponível. Aplique a migration <b>scripts/migrations/rh.sql</b> no lkii e registre marcações em <Link href="/ponto" style={{ color: 'var(--brand-600)' }}>Ponto Digital</Link>.</span>
        </div>
      )}

      <div className="cli-card">
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                {diasLabels.map((d, i) => <th key={d} className="num-r">{d}<br /><span style={{ fontSize: 10, color: 'var(--text-3)' }}>{dias[i].getDate()}/{dias[i].getMonth() + 1}</span></th>)}
                <th className="num-r">Total</th>
                <th className="num-r">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 36, color: 'var(--text-3)' }}>
                  <i className="ti ti-clock-off" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} /> Nenhuma marcação nesta semana.
                </td></tr>
              )}
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.nome}</b>{l.cargo ? <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{l.cargo}</span> : null}</td>
                  {l.porDia.map((h, i) => <td key={i} className="num-r" style={{ color: h > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{h > 0 ? `${h}h` : ''}</td>)}
                  <td className="num-r"><b>{l.total}h</b></td>
                  <td className="num-r" style={{ color: l.saldo >= 0 ? '#15803D' : '#D85563', fontWeight: 700 }}>{l.saldo >= 0 ? '+' : ''}{l.saldo}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
