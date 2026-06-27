/**
 * Presets de período → intervalo [ini, fim) ISO. Replica o sacRange do protótipo.
 * Client-safe (puro). Usado em SAC Chamados e Dashboard. Ver docs/CONSOLIDACAO.md.
 */
export const PERIODOS: [string, string][] = [
  ['', 'Qualquer período'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Última semana'],
  ['mes', 'Mês atual'], ['mes_passado', 'Mês passado'], ['custom', 'Período…'],
]

export function rangePeriodo(periodo: string | undefined, di?: string, df?: string): { ini: string | null; fim: string | null } {
  const now = new Date()
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  let ini: Date | null = null, fim: Date | null = null
  switch (periodo) {
    case 'hoje': ini = dia(now); break
    case 'ontem': ini = new Date(dia(now).getTime() - 864e5); fim = dia(now); break
    case 'semana': ini = new Date(dia(now).getTime() - 7 * 864e5); break
    case 'mes': ini = new Date(now.getFullYear(), now.getMonth(), 1); break
    case 'mes_passado': ini = new Date(now.getFullYear(), now.getMonth() - 1, 1); fim = new Date(now.getFullYear(), now.getMonth(), 1); break
    case 'custom':
      if (di) ini = new Date(di)
      if (df) { const d = new Date(df); fim = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) }
      break
  }
  const iso = (d: Date | null) => (d && !isNaN(d.getTime()) ? d.toISOString() : null)
  return { ini: iso(ini), fim: iso(fim) }
}
