/**
 * Resolver de período dos DASHBOARDS — espelha os 8 presets do legado (REL_PERIODS L4208):
 * Hoje, Ontem, Semana passada, Últimos 30 dias, Mês atual, Mês passado, Este ano, Período…
 * Reaproveita resolveRelRange() (relatorios) para os presets comuns (mes/mes_passado/ano/custom)
 * e adiciona os presets diários que faltam. Pure / server-safe.
 */
import { resolveRelRange, type RelRange } from '@/components/relatorios/relPeriodo'

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Resolve o período do dashboard. `default` por dashboard (financeiro='mes', demais='30d'). */
export function resolveDashRange(periodo: string | undefined, di?: string, df?: string, now: Date = new Date()): RelRange {
  const p = periodo || 'mes'
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  if (p === 'hoje') {
    const ini = new Date(y, m, d)
    const fim = new Date(y, m, d + 1)
    const pIni = new Date(y, m, d - 1)
    return { label: 'Hoje', ini: ymd(ini), fim: ymd(fim), prevIni: ymd(pIni), prevFim: ymd(ini), prevLabel: 'Ontem' }
  }
  if (p === 'ontem') {
    const ini = new Date(y, m, d - 1)
    const fim = new Date(y, m, d)
    const pIni = new Date(y, m, d - 2)
    return { label: 'Ontem', ini: ymd(ini), fim: ymd(fim), prevIni: ymd(pIni), prevFim: ymd(ini), prevLabel: 'Anteontem' }
  }
  if (p === 'semana_passada') {
    // Semana anterior (seg→dom) — bloco de 7 dias terminando no início desta semana.
    const dow = (now.getDay() + 6) % 7 // 0 = segunda
    const inicioSemana = new Date(y, m, d - dow) // segunda desta semana
    const ini = new Date(inicioSemana.getFullYear(), inicioSemana.getMonth(), inicioSemana.getDate() - 7)
    const fim = inicioSemana
    const pIni = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - 7)
    return { label: 'Semana passada', ini: ymd(ini), fim: ymd(fim), prevIni: ymd(pIni), prevFim: ymd(ini), prevLabel: 'Semana retrasada' }
  }
  if (p === '30d') {
    const fim = new Date(y, m, d + 1)
    const ini = new Date(fim.getTime() - 30 * 864e5)
    const pIni = new Date(ini.getTime() - 30 * 864e5)
    return { label: 'Últimos 30 dias', ini: ymd(ini), fim: ymd(fim), prevIni: ymd(pIni), prevFim: ymd(ini), prevLabel: '30 dias anteriores' }
  }

  // mes / mes_passado / ano / 90d / custom / tudo → reaproveita o resolver dos relatórios.
  return resolveRelRange(p, di, df, now)
}
