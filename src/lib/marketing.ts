/**
 * Helpers compartilhados de Marketing + Disco Virtual + Universidade.
 * Client-safe: funções puras (sem imports de server). Espelha a lógica do legado
 * (legacy/index.html): _discoFmt/_discoIco (9402-9403), uniQuizSubmit nota (5985),
 * mkt ícone por extensão (8399).
 */

// ───────────────────────────── Disco Virtual ─────────────────────────────

/** Formata bytes -> "1.2 MB" / "96 KB" / "120 B" (legado _discoFmt, 9402). */
export function discoFmt(b: number | null | undefined): string {
  const n = Number(b) || 0
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB'
  if (n >= 1024) return Math.round(n / 1024) + ' KB'
  return n + ' B'
}

/** Ícone + cor por tipo de arquivo (legado _discoIco, 9403). */
export function discoIco(tipo: string | null | undefined): { icon: string; cor: string } {
  const map: Record<string, [string, string]> = {
    pdf: ['ti-file-type-pdf', '#C0392B'],
    xlsx: ['ti-file-spreadsheet', '#1E8449'],
    xls: ['ti-file-spreadsheet', '#1E8449'],
    csv: ['ti-file-spreadsheet', '#1E8449'],
    doc: ['ti-file-type-doc', '#2563EB'],
    docx: ['ti-file-type-doc', '#2563EB'],
    img: ['ti-photo', '#8A2A41'],
    png: ['ti-photo', '#8A2A41'],
    jpg: ['ti-photo', '#8A2A41'],
    jpeg: ['ti-photo', '#8A2A41'],
    zip: ['ti-file-zip', '#B7791F'],
    video: ['ti-video', '#6B21A8'],
    mp4: ['ti-video', '#6B21A8'],
  }
  const m = map[(tipo || '').toLowerCase()] || ['ti-file', '#6B7280']
  return { icon: m[0], cor: m[1] }
}

/** Formata "YYYY-MM-DD" -> "DD/MM/YYYY" sem passar por Date (evita shift de fuso). */
export function dataRefBR(d: string | null | undefined): string {
  const s = (d || '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

/** Extensão normalizada a partir do nome (legado _discoExt, 9404). */
export function discoExt(nome: string | null | undefined): string {
  const p = ((nome || '').split('.').pop() || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(p)) return 'img'
  if (['mp4', 'mov', 'avi', 'mkv'].includes(p)) return 'video'
  return p
}

// ───────────────────────────── Marketing ─────────────────────────────

/** Ícone de um arquivo de material por heurística do nome (legado materiais, 8399). */
export function mktFileIcon(nome: string): { icon: string; canva: boolean } {
  const isCanva = /Canva|link/i.test(nome)
  let icon = 'photo'
  if (/MP4|vídeo|video|Reels/i.test(nome)) icon = 'video'
  else if (isCanva) icon = 'brush'
  else if (/PDF|AI|CDR|TXT|ZIP/i.test(nome)) icon = 'file-text'
  return { icon, canva: isCanva }
}

export const MKT_TABS = [
  { key: 'atualizacoes', label: 'Atualizações', icon: 'ti-bell' },
  { key: 'materiais', label: 'Materiais', icon: 'ti-folders' },
  { key: 'noticias', label: 'Notícias', icon: 'ti-news' },
] as const
export type MktTab = (typeof MKT_TABS)[number]['key']

// ─────────────────────── Campanhas de WhatsApp (rota /marketing) ───────────────────────
// Valores abaixo refletem os CHECKs reais de campanhas_whatsapp
// (campanhas_whatsapp_status_check / _segmentacao_tipo_check). Ficam aqui (e não
// no actions.ts) porque arquivos `'use server'` só podem exportar funções async.

export const STATUS_CAMPANHA = ['rascunho', 'agendada', 'processando', 'concluida', 'cancelada', 'erro'] as const
export const SEGMENTACAO_TIPOS = ['manual', 'aniversariantes'] as const

export type StatusCampanha = (typeof STATUS_CAMPANHA)[number]
export type SegmentacaoTipo = (typeof SEGMENTACAO_TIPOS)[number]

/** Rótulo + classe `wa-pill` por status real da campanha. */
export const STATUS_PILL: Record<string, [string, string]> = {
  rascunho: ['draft', 'Rascunho'],
  agendada: ['pend', 'Agendada'],
  processando: ['run', 'Em disparo'],
  concluida: ['done', 'Concluída'],
  cancelada: ['draft', 'Cancelada'],
  erro: ['pend', 'Erro'],
}

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_PILL).map(([k, v]) => [k, v[1]]),
)

export const SEG_LABEL: Record<string, string> = {
  manual: 'Base manual / importada',
  aniversariantes: 'Aniversariantes do mês',
}

// ───────────────────────────── Universidade ─────────────────────────────

/** Nota mínima de aprovação nas provas (legado uniQuizSubmit, 5988). */
export const UNI_NOTA_MIN = 7.0

/** Nota = round(acertos/total*100)/10 (legado uniQuizSubmit, 5985). 0..10 com 1 casa. */
export function uniNota(acertos: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((acertos / total) * 100) / 10
}

/** Link de vídeo do YouTube a partir de link completo ou ID (legado ytUrl, 6043). */
export function ytUrl(v: string | null | undefined): string {
  const s = (v || '').trim()
  if (!s) return ''
  return s.startsWith('http') ? s : 'https://www.youtube.com/watch?v=' + s
}

export type Questao = { q: string; opts: string[]; c: number }
