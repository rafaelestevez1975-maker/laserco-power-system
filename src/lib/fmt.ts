/**
 * Formatação BR compartilhada (client-safe: funções puras, sem process.env nem imports de server).
 * Use em qualquer page/component. Centraliza o que estava duplicado em ~13 arquivos.
 * Ver docs/CONSOLIDACAO.md (D3/D4).
 */

type Dataish = string | number | Date | null | undefined

// Fuso do negócio (Brasil). Datas/horas são SEMPRE formatadas neste fuso, no servidor e no
// cliente, para (a) baterem entre SSR e hidratação — senão o React acusa #418 — e (b) mostrarem
// o horário local do Brasil independentemente do fuso do servidor (UTC na Vercel).
const TZ_BR = 'America/Sao_Paulo'
const SO_DIA = /^\d{4}-\d{2}-\d{2}$/

function asDate(d: Dataish): Date | null {
  if (d == null || d === '') return null
  const dt = d instanceof Date ? d : new Date(d)
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
  // Data SÓ-DIA (YYYY-MM-DD): reformata direto, sem passar por Date/fuso → determinístico
  // (SSR == cliente) e sem deslocar o dia. Timestamps usam o fuso BR fixo.
  if (typeof d === 'string' && SO_DIA.test(d)) { const [y, m, dia] = d.split('-'); return `${dia}/${m}/${y}` }
  const dt = asDate(d)
  return dt ? dt.toLocaleDateString('pt-BR', { timeZone: TZ_BR }) : ''
}

/** "31/12, 14:05" (dia/mês + hora  formato curto usado nas listas/threads). */
export function dataHoraBR(d: Dataish): string {
  const dt = asDate(d)
  return dt ? dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ_BR }) : ''
}

/** "31/12/2026 14:05:00" (data e hora completas, locale BR). */
export function dataHora(d: Dataish): string {
  const dt = asDate(d)
  return dt ? dt.toLocaleString('pt-BR', { timeZone: TZ_BR }) : ''
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
