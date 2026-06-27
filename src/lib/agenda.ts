/**
 * Helpers do módulo Agenda + Dashboard da unidade.
 * Client-safe: só funções puras e constantes (sem imports de server).
 * Fórmulas/regras copiadas FIELMENTE do legado (legacy/index.html):
 *   - EVT_TYPES (L9591) · AGENDA_GAP/NOSHOW/DUR (L2975-2977) · ocupação (agOcupRender L2980)
 *   - períodos do dashboard (dashPerSel L1176) · metas de novos/avaliações (KPI L1190-1214)
 */

// ── Eventos da rede ─────────────────────────────────────────────────────────
// Espelha EVT_TYPES do legado: [cor, ícone tabler] por tipo de evento.
export const EVT_TYPES: Record<string, [string, string]> = {
  'Treinamento online': ['#3D7FD1', 'ti-device-laptop'],
  'Treinamento presencial': ['#1F9D6B', 'ti-school'],
  'Reunião da rede': ['#8A2A41', 'ti-users-group'],
  'Evento': ['#C79433', 'ti-confetti'],
  'Inauguração': ['#D85563', 'ti-building-store'],
}
export const EVT_TIPOS = Object.keys(EVT_TYPES)
// Direcionamentos possíveis (legado: checkboxes #evtAudi).
export const EVT_AUDIENCIAS = ['Rede própria', 'Franquias', 'Franqueados', 'Office', 'Todos']

export function corEvento(tipo: string): [string, string] {
  return EVT_TYPES[tipo] ?? ['#C79433', 'ti-calendar']
}

// ── Constantes da grade (legado: AGENDA_GAP/NOSHOW/DUR) ──────────────────────
export const AGENDA_START = 8 * 60
export const AGENDA_END = 20 * 60
export const AGENDA_GAP_PADRAO = 10 // padrão da rede
export const AGENDA_GAPS = [10, 15, 20, 30] // opções de GAP por unidade (uniSetGap)
export const AGENDA_NOSHOW = 45 // % faltas médias (afeta a meta de ocupação)
export const AGENDA_DUR = 30 // min médio por agendamento
export const AGENDA_CAP_SERVICOS = 60 // soma de serviços ocupa no máx 60 min na agenda

export type OcupacaoInfo = {
  nProf: number; horas: number; baseCap: number; alvo: number
  pct: number; faltam: number; cor: string; agendados: number
}

/**
 * Ocupação da agenda (espelha agOcupRender do legado):
 *   baseCap = nProf × horas × 60 ÷ AGENDA_DUR
 *   alvo    = baseCap × (1 + AGENDA_NOSHOW/100)   ← "meta com sobreposição"
 *   pct     = agendados / alvo
 *   cor     = pct≥85 verde · ≥60 âmbar · <60 vermelho
 */
export function calcOcupacao(nProf: number, agendados: number): OcupacaoInfo {
  const horas = (AGENDA_END - AGENDA_START) / 60
  const baseCap = Math.round((nProf * horas * 60) / AGENDA_DUR)
  const alvo = Math.round(baseCap * (1 + AGENDA_NOSHOW / 100))
  const pct = alvo ? Math.round((agendados / alvo) * 100) : 0
  const faltam = Math.max(0, alvo - agendados)
  const cor = pct >= 85 ? '#0f6b3a' : pct >= 60 ? '#B26A00' : '#B91C1C'
  return { nProf, horas: Math.round(horas), baseCap, alvo, pct, faltam, cor, agendados }
}

// ── Períodos do dashboard (legado: dashPerSel + applyPeriod) ─────────────────
export type PeriodoKey = 'hoje' | 'ontem' | 'semana' | 'mes' | 'ultimo' | 'd30' | 'periodo'

export const PERIODOS: { val: PeriodoKey; label: string }[] = [
  { val: 'hoje', label: 'Hoje' },
  { val: 'ontem', label: 'Ontem' },
  { val: 'semana', label: 'Última semana' },
  { val: 'mes', label: 'Este mês' },
  { val: 'ultimo', label: 'Mês anterior' },
  { val: 'd30', label: 'Últimos 30 dias' },
  { val: 'periodo', label: 'Período personalizado…' },
]

/** "YYYY-MM-DD" no fuso BR (sem depender do TZ do servidor). */
export function hojeBR(base = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(base)
}

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00-03:00`)
  d.setDate(d.getDate() + n)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

/**
 * Resolve um período do dashboard em [ini, fim] inclusivos (datas "YYYY-MM-DD"),
 * a label de exibição e a duração em dias. Espelha as 7 opções do legado.
 * `di`/`df` são usados quando per='periodo'.
 */
export function resolvePeriodo(
  per: PeriodoKey | string | undefined,
  di?: string, df?: string,
): { ini: string; fim: string; label: string; dias: number } {
  const hoje = hojeBR()
  const [y, m] = hoje.split('-').map(Number)
  const lastDay = (yy: number, mm: number) => new Date(yy, mm, 0).getDate()
  const fmtBR = (iso: string) => iso.split('-').reverse().join('/')
  const range = (ini: string, fim: string, label: string) => {
    const d0 = new Date(`${ini}T12:00:00-03:00`).getTime()
    const d1 = new Date(`${fim}T12:00:00-03:00`).getTime()
    return { ini, fim, label, dias: Math.round((d1 - d0) / 864e5) + 1 }
  }
  switch (per) {
    case 'ontem': { const o = addDias(hoje, -1); return range(o, o, `Ontem, ${fmtBR(o)}`) }
    case 'semana': return range(addDias(hoje, -6), hoje, 'Última semana')
    case 'mes': {
      const ini = `${y}-${String(m).padStart(2, '0')}-01`
      return range(ini, hoje, 'Este mês')
    }
    case 'ultimo': {
      const pm = m === 1 ? 12 : m - 1
      const py = m === 1 ? y - 1 : y
      const ini = `${py}-${String(pm).padStart(2, '0')}-01`
      const fim = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay(py, pm)).padStart(2, '0')}`
      return range(ini, fim, 'Mês anterior')
    }
    case 'd30': return range(addDias(hoje, -29), hoje, 'Últimos 30 dias')
    case 'periodo': {
      if (di && df && /^\d{4}-\d{2}-\d{2}$/.test(di) && /^\d{4}-\d{2}-\d{2}$/.test(df)) {
        const [a, b] = di <= df ? [di, df] : [df, di]
        return range(a, b, `${fmtBR(a)} a ${fmtBR(b)}`)
      }
      return range(hoje, hoje, `Hoje, ${fmtBR(hoje)}`)
    }
    case 'hoje':
    default:
      return range(hoje, hoje, `Hoje, ${fmtBR(hoje)}`)
  }
}

/** Limites [ini 00:00, fim+1 00:00) em ISO (fuso BR) para filtrar por timestamp. */
export function rangeISO(ini: string, fim: string): { de: string; ate: string } {
  const de = new Date(`${ini}T00:00:00-03:00`).toISOString()
  const ate = new Date(`${addDias(fim, 1)}T00:00:00-03:00`).toISOString()
  return { de, ate }
}

// ── Metas dos KPIs (legado: kpi-note "novos > 20% · avaliações ≥ 20%") ───────
export const META_NOVOS_PCT = 20
export const META_AVAL_PCT = 20
