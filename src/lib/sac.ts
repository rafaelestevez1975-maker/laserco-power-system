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
