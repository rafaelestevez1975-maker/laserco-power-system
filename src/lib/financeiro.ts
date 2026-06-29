/**
 * Financeiro da FRANQUEADORA — helpers puros (client-safe) espelhando a lógica do
 * legado (legacy/index.html · buildFinFranq L5099+). Paridade fiel:
 *  - categorias fixas FIN_CATS_REC (Royalties protegida)
 *  - prioridade padrão por categoria (finPrioPadrao L5113)
 *  - régua de cobrança (FIN_CFG.regua L5028-5035)
 *  - royalty = 10% do bruto / fundo = 2% (finSeed L5053-5054)
 *  - cálculo de dias de atraso por vencimento (calcDias)
 */

// ── Categorias de recebíveis (FIN_CATS_REC L5037). Royalties é fixa/protegida. ──
export const FIN_CATS_REC = [
  'Royalties',
  'Taxa de franquia',
  'Fundo de marketing',
  'Aluguel de máquinas',
  'Reembolso disparos Ultrassom',
  'Locação de equipamentos',
  'Taxa de tecnologia',
  'Outros',
] as const

// ── Régua de cobrança (FIN_CFG.regua L5028-5035) ──
export type ReguaPasso = { dias: number; acao: string; canal: string }
export const FIN_REGUA: ReguaPasso[] = [
  { dias: 0, acao: 'Vencimento · boleto registrado no banco', canal: '' },
  { dias: 1, acao: '1ª notificação automática de atraso', canal: 'Sistema + E-mail + WhatsApp' },
  { dias: 5, acao: '2ª notificação + alerta ao Gerente de Campo', canal: 'Sistema + E-mail + WhatsApp' },
  { dias: 10, acao: 'Acionar Jurídico · notificação extrajudicial', canal: 'Jurídico (e-mail)' },
  { dias: 20, acao: 'Jurídico · protesto em cartório', canal: 'Jurídico' },
  { dias: 30, acao: 'Jurídico · rescisão contratual', canal: 'Jurídico' },
]

// ── Adquirentes default (FIN_CFG.adquirentes L5023-5027) ──
export type Adquirente = { nome: string; deb: number; cred: number; parc: number; pix: number; prazo: number }
export const FIN_ADQUIRENTES: Adquirente[] = [
  { nome: 'Cielo', deb: 1.09, cred: 2.49, parc: 3.19, pix: 0.49, prazo: 30 },
  { nome: 'Stone', deb: 0.99, cred: 2.39, parc: 2.99, pix: 0.29, prazo: 1 },
  { nome: 'Rede', deb: 1.19, cred: 2.69, parc: 3.29, pix: 0.59, prazo: 30 },
]

export const FIN_BANCO_DEFAULT = {
  nome: 'Banco do Brasil',
  agencia: '1234-5',
  conta: '45.678-9',
  convenio: 'Convênio 1234567 · Carteira 17 · CNAB 240',
  login: 'laserco.financeiro',
  autoBaixa: true,
}

export const ROYALTY_PCT_DEFAULT = 10
export const FUNDO_PCT_DEFAULT = 2
export const VENC_DIA_DEFAULT = 10
// Competência (mês de referência) a partir de uma data ISO — ex.: "Junho/2026".
// Substitui o antigo FIN_MESREF chumbado ('Maio/2026'). Saldo inicial das projeções
// agora vem da posição realizada real (recebido − pago), não de número inventado.
const MESES_BR = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export function mesRefBR(hojeISO?: string): string {
  const d = hojeISO ? new Date(hojeISO + (hojeISO.length <= 10 ? 'T00:00:00' : '')) : new Date()
  if (isNaN(d.getTime())) return ''
  return `${MESES_BR[d.getMonth()]}/${d.getFullYear()}`
}

// ── Prioridade padrão por categoria (finPrioPadrao L5113) ──
const PRIO_ALTA = ['Salários', 'Impostos', 'Aluguel', 'Pró-labore']
const PRIO_BAIXA = ['Tecnologia', 'Marketing']
export function finPrioPadrao(cat: string): 'alta' | 'media' | 'baixa' {
  if (PRIO_ALTA.includes(cat)) return 'alta'
  if (PRIO_BAIXA.includes(cat)) return 'baixa'
  return 'media'
}

// ── Pills de status (finPill L5111) ──
export type StatusRec = 'aberto' | 'atrasado' | 'pago' | 'suspenso' | 'jur'
export const STATUS_PILL: Record<string, { label: string; bg: string; c: string }> = {
  aberto: { label: 'Em aberto', bg: '#FFF3E0', c: '#B26A00' },
  pago: { label: 'Pago', bg: '#E7F0EC', c: '#0f6b3a' },
  atrasado: { label: 'Atrasado', bg: '#FDECEC', c: 'var(--red)' },
  jur: { label: 'No Jurídico', bg: '#F7E7EB', c: 'var(--brand-600)' },
  suspenso: { label: 'Suspenso', bg: '#ECEAF2', c: '#5B5570' },
}

export const PRIO_PILL: Record<string, { label: string; bg: string; c: string }> = {
  alta: { label: 'Alta', bg: '#FDECEC', c: 'var(--red)' },
  media: { label: 'Média', bg: '#FFF3E0', c: '#B26A00' },
  baixa: { label: 'Baixa', bg: '#E8F0FE', c: '#1565C0' },
}

// ── Nº de boleto simulado (finBoletoNum L5046) ──
export function finBoletoNum(seq: number): string {
  const a = 34191 + (seq % 9)
  const b = (79000 + seq * 7) % 99999
  const c = (51000 + seq * 13) % 99999
  const d = (15000 + seq * 17) % 99999
  const val = String(900630000000 + seq * 131).slice(-14)
  const pad = (n: number) => String(n).padStart(5, '0')
  return `${a}.${pad(b)} ${pad(c)}.${pad(d)} 91020.150008 8 ${val}`
}

// ── Dias de atraso por vencimento (calcDias L5516) — base hoje. ──
export function calcDiasAtraso(vencimento: string | null | undefined, hojeISO?: string): number {
  if (!vencimento) return 0
  const v = new Date(vencimento)
  const hoje = hojeISO ? new Date(hojeISO) : new Date()
  if (isNaN(v.getTime())) return 0
  return Math.max(0, Math.floor((hoje.getTime() - v.getTime()) / 86400000))
}

// ── Próximo passo da régua para um nº de dias em atraso (finRodarRegua/finCobranca) ──
export function proximoPassoRegua(diasAtraso: number, regua: ReguaPasso[] = FIN_REGUA): ReguaPasso {
  // legado: [...regua].reverse().find(p => dias>=p.dias) || regua[1]
  const passo = [...regua].reverse().find((p) => diasAtraso >= p.dias)
  return passo ?? regua[1] ?? regua[0]
}

// ── E-mail/telefone do franqueado (finFranqEmail L5043) — fallback por slug ──
export function finFranqEmail(unidadeNome: string | null | undefined): string {
  const slug = (unidadeNome || '').split(' - ')[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
  return slug ? `franqueado.${slug}@laserco.com.br` : 'franqueado@laserco.com.br'
}

// % formatado (finPct) — 1 casa
export function finPct(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}
