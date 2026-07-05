/**
 * Formatação BR compartilhada (client-safe: funções puras, sem process.env nem imports de server).
 * Use em qualquer page/component. Centraliza o que estava duplicado em ~13 arquivos.
 * Ver docs/CONSOLIDACAO.md (D3/D4).
 */

type Dataish = string | number | Date | null | undefined

function asDate(d: Dataish): Date | null {
  if (d == null || d === '') return null
  // Data SÓ-DIA (YYYY-MM-DD): parseia como meia-noite LOCAL (T00:00:00 sem 'Z'), senão o JS
  // interpreta como UTC e o fuso desloca o dia → o SSR (UTC) e o cliente (ex.: BRT, UTC-3)
  // renderizam dias diferentes e o React acusa hydration mismatch (#418) nas listas de
  // vencimento (Contas a Receber etc.). Com T00:00:00 ambos tratam como o mesmo dia local.
  const soDia = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  const dt = d instanceof Date ? d : new Date(soDia ? d + 'T00:00:00' : d)
  return isNaN(dt.getTime()) ? null : dt
}

/** "R$ 1.234" (inteiro, sem centavos  padrão do sistema). null/undefined => "R$ 0". */
export function moedaBR(v: number | null | undefined): string {
  return 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR')
}

/** Só os dígitos de um telefone/documento. */
export function digitos(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '')
}

/** Telefone normalizado com DDI 55 (igual ao normTel da UAZAPI). "" se vazio. */
export function telBR55(raw: string | null | undefined): string {
  const d = digitos(raw)
  if (!d) return ''
  return d.startsWith('55') ? d : '55' + d
}

/** Link wa.me pronto (com 55) ou null se não houver telefone. */
export function waHref(tel: string | null | undefined): string | null {
  const d = telBR55(tel)
  return d ? `https://wa.me/${d}` : null
}

/** "31/12/2026" (ou "" se inválido). */
export function dataBR(d: Dataish): string {
  const dt = asDate(d)
  return dt ? dt.toLocaleDateString('pt-BR') : ''
}

/** "31/12, 14:05" (dia/mês + hora  formato curto usado nas listas/threads). */
export function dataHoraBR(d: Dataish): string {
  const dt = asDate(d)
  return dt ? dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}

/** "31/12/2026 14:05:00" (data e hora completas, locale BR). */
export function dataHora(d: Dataish): string {
  const dt = asDate(d)
  return dt ? dt.toLocaleString('pt-BR') : ''
}

/** "há 5 min" / "há 2 h" / "há 3 d"  tempo relativo curto em pt-BR. */
export function relativo(d: Dataish, agora: number = 0): string {
  const dt = asDate(d)
  if (!dt) return ''
  const base = agora || Date.now()
  const seg = Math.max(0, Math.floor((base - dt.getTime()) / 1000))
  if (seg < 60) return 'agora'
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const dias = Math.floor(h / 24)
  return `há ${dias} d`
}
