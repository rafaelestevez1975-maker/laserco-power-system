/**
 * Jurídico — helpers puros (client-safe) espelhando a lógica do legado
 * (legacy/index.html · bloco "Jurídico" 4896-5009). Paridade fiel:
 *  - montagem automática do corpo da notificação (jurMontarCorpo 4915)
 *  - assunto com regra de reincidência >=20 dias (finGerarNotifJuridica 4924)
 *  - merge fields dos modelos (jurMerge 4997): {unidade},{franqueado},{cnpj},{prazo},{data}
 *  - os 3 tipos de documento contratual (jurUnitDet 4978)
 */

import { moedaBR } from '@/lib/fmt'

// ── Tipos de documento contratual (jurUnitDet 4978) ──
export const DOC_TIPOS = [
  { tipo: 'contrato', nome: 'Contrato de Franquia', icone: 'ti-file-certificate' },
  { tipo: 'pre', nome: 'Pré-contrato de Franquia', icone: 'ti-file-text' },
  { tipo: 'cof', nome: 'Circular de Oferta de Franquia (COF)', icone: 'ti-file-description' },
] as const
export type DocTipo = (typeof DOC_TIPOS)[number]['tipo']

// ── Prazo fixo de regularização e fallback do franqueado (legado) ──
export const PRAZO_REGULARIZACAO = '15 (quinze) dias'
export const FRANQUEADO_FALLBACK = 'Franqueado(a) responsável'

export type RecebivelAtraso = {
  id: string
  unidade_nome: string | null
  franqueado: string | null
  cnpj: string | null
  categoria: string | null
  ref: string | null // competencia/parcela
  valor: number
  vencimento: string | null // data formatada pt-BR (venc)
  dias_atraso: number
}

/** Data atual no formato pt-BR (legado usa new Date().toLocaleDateString('pt-BR')). */
export function hojeBR(): string {
  return new Date().toLocaleDateString('pt-BR')
}

/** Franqueado responsável da unidade, com fallback (jurFranq 4938). */
export function franqueadoNome(resp: string | null | undefined): string {
  return resp && resp.trim() !== '' ? resp.trim() : FRANQUEADO_FALLBACK
}

/**
 * Assunto da notificação automática (finGerarNotifJuridica 4926):
 *   reincidência (dias>=20) → '2ª Notificação', senão 'Notificação'
 *   '… — {categoria} em atraso · {unidade}'
 */
export function montarAssunto(r: RecebivelAtraso): string {
  const reincid = (r.dias_atraso ?? 0) >= 20
  const prefixo = reincid ? '2ª Notificação' : 'Notificação'
  return `${prefixo} — ${r.categoria ?? 'Débito'} em atraso · ${r.unidade_nome ?? ''}`
}

/**
 * Corpo padrão da notificação extrajudicial (jurMontarCorpo 4915).
 * COPIADO FIELMENTE do legado: prazo de 15 (quinze) dias, citação da Lei
 * nº 13.966/2019 e assinatura do Departamento Jurídico. {data} = hoje pt-BR.
 */
export function montarCorpo(r: RecebivelAtraso): string {
  const fr = franqueadoNome(r.franqueado)
  const cnpj = r.cnpj ?? ''
  const refTxt = r.ref ? ' — ' + r.ref : ''
  return (
    `Prezado(a) ${fr},\n\n` +
    `Na qualidade de franqueadora da rede Laser&Co, constatamos que a unidade ${r.unidade_nome ?? ''} (CNPJ ${cnpj}) encontra-se em atraso com a seguinte obrigação financeira:\n\n` +
    `• Natureza do débito: ${r.categoria ?? ''}${refTxt}\n` +
    `• Valor em aberto: ${moedaBR(r.valor)}\n` +
    `• Vencimento: ${r.vencimento ?? ''}\n` +
    `• Dias em atraso: ${r.dias_atraso ?? 0} dia(s)\n\n` +
    `Solicitamos a REGULARIZAÇÃO no prazo de 15 (quinze) dias a contar do recebimento desta notificação, sob pena da incidência dos encargos contratuais e da adoção das medidas previstas no Contrato de Franquia e na Lei nº 13.966/2019, incluindo protesto e eventual rescisão.\n\n` +
    `Permanecemos à disposição para tratar de eventual repactuação.\n\n` +
    `Atenciosamente,\n` +
    `Departamento Jurídico — Laser&Co\n` +
    `${hojeBR()}`
  )
}

/**
 * Substitui os merge fields de um modelo (jurMerge 4997):
 *   {unidade}→nome, {franqueado}→responsável, {cnpj}→CNPJ,
 *   {prazo}→'15 (quinze) dias', {data}→data atual pt-BR.
 */
export function mergeTemplate(
  txt: string | null | undefined,
  ctx: { unidade: string; franqueado: string; cnpj: string },
): string {
  return (txt || '')
    .replace(/\{unidade\}/g, ctx.unidade)
    .replace(/\{franqueado\}/g, ctx.franqueado)
    .replace(/\{cnpj\}/g, ctx.cnpj)
    .replace(/\{prazo\}/g, PRAZO_REGULARIZACAO)
    .replace(/\{data\}/g, hojeBR())
}

/** Status pill da notificação (badge 'Aguardando revisão' / 'Enviada'). */
export const NOTIF_STATUS: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Aguardando revisão', cls: 'os-andamento' },
  enviada: { label: 'Enviada', cls: 'os-fechada' },
}

/** Default de um novo modelo em branco (jurNewTpl 4995). */
export const NOVO_TEMPLATE = {
  nome: 'Novo modelo de notificação',
  assunto: 'Notificação · {unidade}',
  corpo:
    'Prezado(a) {franqueado},\n\n[texto da notificação]\n\nAtenciosamente,\nDepartamento Jurídico — Laser&Co\n{data}',
}
