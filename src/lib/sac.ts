/**
 * Regras de negócio do SAC portadas 1:1 do legado (legacy/index.html).
 * Mantém o cálculo idêntico ao que o cliente já validou no protótipo.
 */

// ───────────────────────── Reembolso por saldo de sessões ─────────────────────────
// Legado: sacCalcReembolso (index.html 9173-9181). A multa de rescisão incide SÓ sobre
// o saldo das sessões NÃO usadas; as sessões já feitas são abatidas (consumido).
export type Reembolso = {
  vSess: number       // valor por sessão = valorPago / sessoesContratadas
  restantes: number   // sessões ainda não usadas
  consumido: number    // valor das sessões já feitas (abatido)
  saldo: number       // valor das sessões restantes (base do reembolso)
  multa: number       // multa aplicada ao saldo
  fim: number         // valor final a reembolsar
}

export function calcReembolso(
  valorPago: number, sessoesContr: number, sessoesFeitas: number, multaPct: number, semMulta: boolean,
): Reembolso {
  const vp = Math.max(0, Number(valorPago) || 0)
  const contr = Math.max(0, Math.floor(Number(sessoesContr) || 0))
  const feitas = Math.min(contr, Math.max(0, Math.floor(Number(sessoesFeitas) || 0)))
  const vSess = contr ? vp / contr : 0
  const restantes = Math.max(0, contr - feitas)
  const consumido = vSess * feitas
  const saldo = vSess * restantes
  const multa = semMulta ? 0 : saldo * ((Number(multaPct) || 0) / 100)
  const fim = Math.max(0, saldo - multa)
  return {
    vSess: round2(vSess), restantes, consumido: round2(consumido),
    saldo: round2(saldo), multa: round2(multa), fim: round2(fim),
  }
}

// ───────────────────────── Acordo: 1º pagamento após o dia 15 ─────────────────────────
// Legado: sacAcPreview/sacAcordoSalvar (index.html 9302, 9339) — bloqueia dia <= 15.
/** Dia do mês (1–31) de uma data ISO 'YYYY-MM-DD', sem ruído de fuso (igual ao split do legado). */
export function diaDoMes(dataISO: string | null | undefined): number {
  return Number((dataISO || '').split('-')[2]) || 0
}
/** O 1º pagamento do acordo precisa cair APÓS o dia 15 (dia 16 em diante). */
export function primeiroPagamentoValido(dataISO: string | null | undefined): boolean {
  return diaDoMes(dataISO) > 15
}
export const MSG_DIA15 = 'A data do 1º pagamento deve ser após o dia 15.'

// ───────────────────────── Observações: prefixo Tipo/Reclamação ─────────────────────────
// sac_tickets não tem colunas próprias para "tipo da unidade" (Franquia/Própria) nem
// "data da reclamação" — o legado guardava esses campos no formulário. Para manter a
// paridade SEM tocar no banco, gravamos esses dados no PREFIXO de observações no padrão
// "Tipo: <tipo> · Reclamação: <YYYY-MM-DD>" (mesmo padrão da importação). Estes helpers
// extraem/reconstroem esse prefixo para exibir na lista e reeditar no modal.
export type ObsMeta = { tipo: string; dataRecl: string; texto: string }

/** Lê o prefixo "Tipo:/Reclamação:" das observações e devolve {tipo, dataRecl, texto livre}. */
export function lerObsMeta(obs: string | null | undefined): ObsMeta {
  const partes = (obs || '').split(' · ')
  let tipo = '', dataRecl = ''
  const resto: string[] = []
  for (const p of partes) {
    const t = p.trim()
    const mTipo = /^Tipo:\s*(.+)$/i.exec(t)
    const mRecl = /^Reclama[çc][ãa]o:\s*(.+)$/i.exec(t)
    if (mTipo && !tipo) tipo = mTipo[1].trim()
    else if (mRecl && !dataRecl) dataRecl = mRecl[1].trim()
    else if (t) resto.push(t)
  }
  return { tipo, dataRecl, texto: resto.join(' · ') }
}

/** Reconstrói as observações com o prefixo "Tipo:/Reclamação:" (campos vazios são omitidos). */
export function montarObs(tipo: string, dataRecl: string, texto: string): string | null {
  const prefixo = [tipo ? `Tipo: ${tipo}` : '', dataRecl ? `Reclamação: ${dataRecl}` : ''].filter(Boolean).join(' · ')
  return [prefixo, (texto || '').trim()].filter(Boolean).join(' · ') || null
}

// ───────────────────────── Situação do chamado (paridade de Status do legado) ─────────────────────────
// O legado tinha "Em andamento / Concluído / Em atraso" derivado de (concluído? / SLA estourado?).
// Aqui derivamos o mesmo a partir de fase + sla_violado (a coluna `status` do schema usa
// 'aberto'/'resolvido', semântica diferente). Mantém o badge e o filtro de Status do legado.
export type Situacao = 'Em andamento' | 'Concluído' | 'Em atraso'
export const SITUACOES: Situacao[] = ['Em andamento', 'Concluído', 'Em atraso']

export function situacaoChamado(fase: string | null | undefined, slaViolado: boolean | null | undefined): Situacao {
  if ((fase || '') === 'Concluído') return 'Concluído'
  if (slaViolado) return 'Em atraso'
  return 'Em andamento'
}

// ───────────────────────── Premiação monetária do SAC ─────────────────────────
// Legado: SAC_PREM (8913) + sacPremValor (9122). Prêmio em R$ por atendente.
export type PremMonetaria = {
  porAtendimento: number  // R$ por atendimento
  porFinalizado: number   // R$ por caso finalizado
  porReversao: number     // R$ por reversão (retenção de cancelamento/reembolso)
  porSLA: number          // R$ por caso no prazo (SLA)
  pctVendas: number       // % sobre vendas do atendente no sistema
  bonusPacote: number     // R$ por pacote vendido (upsell)
  bonusZeroAtraso: number // bônus por zero atrasos no mês
  bonusCSAT: number       // bônus por satisfação >= metaCSAT
  metaCSAT: number        // nota CSAT mínima para o bônus
}

export const PREM_DEFAULT: PremMonetaria = {
  porAtendimento: 2, porFinalizado: 8, porReversao: 35, porSLA: 5,
  pctVendas: 3, bonusPacote: 15, bonusZeroAtraso: 40, bonusCSAT: 50, metaCSAT: 4.5,
}

export type PremMetricas = {
  tot: number; con: number; atr: number; rev: number; slaOk: number
  vendas: number; pacotes: number; csat: number
}

/** Prêmio em R$ — fórmula idêntica ao legado (sacPremValor). */
export function premioValor(m: PremMetricas, P: PremMonetaria): number {
  return (
    m.tot * P.porAtendimento +
    m.con * P.porFinalizado +
    m.rev * P.porReversao +
    m.slaOk * P.porSLA +
    (P.pctVendas / 100) * m.vendas +
    (m.atr === 0 ? P.bonusZeroAtraso : 0) +
    (m.csat >= P.metaCSAT ? P.bonusCSAT : 0) +
    m.pacotes * P.bonusPacote
  )
}

function round2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100 }
