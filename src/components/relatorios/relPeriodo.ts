/**
 * Resolve o período do relatório (querystring) → intervalos ISO de data.
 * Pure / server-safe. Trabalha com strings 'YYYY-MM-DD' (data_competencia é DATE;
 * inicio/criado_em são timestamptz, mas comparação por borda de dia basta).
 *
 * Retorna também o "intervalo anterior" de mesmo tamanho p/ comparativos
 * (mês atual vs anterior etc.).
 */

export type RelRange = {
  /** rótulo legível do período atual (ex.: "Junho/2026") */
  label: string
  /** início inclusivo (>=) em 'YYYY-MM-DD', ou null = sem limite inferior */
  ini: string | null
  /** fim exclusivo (<) em 'YYYY-MM-DD', ou null = sem limite superior */
  fim: string | null
  /** comparativo: período anterior de mesmo tamanho (pode ter nulls) */
  prevIni: string | null
  prevFim: string | null
  prevLabel: string
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function resolveRelRange(periodo: string | undefined, di?: string, df?: string, now: Date = new Date()): RelRange {
  const p = periodo || 'mes'
  const y = now.getFullYear()
  const m = now.getMonth()

  if (p === 'mes') {
    const ini = new Date(y, m, 1)
    const fim = new Date(y, m + 1, 1)
    const pIni = new Date(y, m - 1, 1)
    return {
      label: `${MESES[m]}/${y}`,
      ini: ymd(ini),
      fim: ymd(fim),
      prevIni: ymd(pIni),
      prevFim: ymd(ini),
      prevLabel: `${MESES[(m + 11) % 12]}/${m === 0 ? y - 1 : y}`,
    }
  }

  if (p === 'mes_passado') {
    const ini = new Date(y, m - 1, 1)
    const fim = new Date(y, m, 1)
    const pIni = new Date(y, m - 2, 1)
    return {
      label: `${MESES[(m + 11) % 12]}/${m === 0 ? y - 1 : y}`,
      ini: ymd(ini),
      fim: ymd(fim),
      prevIni: ymd(pIni),
      prevFim: ymd(ini),
      prevLabel: `${MESES[(m + 10) % 12]}/${m <= 1 ? y - 1 : y}`,
    }
  }

  if (p === '90d') {
    const fim = new Date(y, m, now.getDate() + 1)
    const ini = new Date(fim.getTime() - 90 * 864e5)
    const pIni = new Date(ini.getTime() - 90 * 864e5)
    return { label: 'Últimos 90 dias', ini: ymd(ini), fim: ymd(fim), prevIni: ymd(pIni), prevFim: ymd(ini), prevLabel: '90 dias anteriores' }
  }

  if (p === 'ano') {
    const ini = new Date(y, 0, 1)
    const fim = new Date(y + 1, 0, 1)
    return { label: `${y}`, ini: ymd(ini), fim: ymd(fim), prevIni: ymd(new Date(y - 1, 0, 1)), prevFim: ymd(ini), prevLabel: `${y - 1}` }
  }

  if (p === 'custom') {
    const ini = di || null
    // fim exclusivo: +1 dia em df
    let fim: string | null = null
    if (df) {
      const d = new Date(df + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      fim = ymd(d)
    }
    return { label: `${di || '…'} a ${df || '…'}`, ini, fim, prevIni: null, prevFim: null, prevLabel: 'sem comparativo' }
  }

  // 'tudo'
  return { label: 'Todo o histórico', ini: null, fim: null, prevIni: null, prevFim: null, prevLabel: 'sem comparativo' }
}

/** Sobe um timestamptz a meia-noite local p/ usar nos filtros gte/lt de colunas timestamptz. */
export function asTsStart(ymdStr: string | null): string | null {
  return ymdStr ? `${ymdStr}T00:00:00` : null
}
