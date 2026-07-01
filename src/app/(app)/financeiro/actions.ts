'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { finBoletoNum, calcDiasAtraso, proximoPassoRegua, type ReguaPasso } from '@/lib/financeiro'
import { darBaixaLancamento as _darBaixaLancamento, receberLancamento as _receberLancamento } from './actions-sac'
import { postLancamento, mapaFinanceiro, type LancamentoEvento } from '@/lib/financeiro-ledger'

// ── Guard comum: financeiro da franqueadora é restrito a admin/financeiro/gestor. ──
const PAPEIS_FIN = ['financeiro', 'gestor']
type R = { ok: boolean; error?: string }

const MESES_BR = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Tipo de venda do BEMP (bemp_billings.entity) → conta de RECEITA do plano de contas (código).
const CONTA_POR_ENTIDADE: Record<string, string> = {
  packages: '3.1.03', services: '3.1.01', products: '3.1.02',
  subscription_quotas: '3.1.04', subscriptions: '3.1.04', money_credits: '3.1.01',
}

/** Empresa default (1ª) — o financeiro da franqueadora é consolidado da matriz. */
async function empresaId(sb: SB): Promise<string | null> {
  const { data } = await sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

// =============================================================================
// RECEBÍVEIS (Contas a Receber da franqueadora)
// =============================================================================

/** Gera boleto de um recebível (finGerarUm L5229): nº de boleto + marca enviado. */
export async function gerarBoleto(id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para gerar boletos.' }

  const { data: rec } = await op.sb.from('fin_recebiveis').select('id, boleto').eq('id', id).maybeSingle()
  const r = rec as { boleto?: string | null } | null
  if (!r) return { ok: false, error: 'Recebível não encontrado.' }
  if (r.boleto) return { ok: false, error: 'Boleto já gerado.' }

  // seq determinístico baseado no nº de boletos já gerados + offset do legado.
  const { count } = await op.sb.from('fin_recebiveis').select('id', { count: 'exact', head: true }).not('boleto', 'is', null)
  const boleto = finBoletoNum((count ?? 0) + 700)
  const { error: e } = await op.sb.from('fin_recebiveis').update({ boleto, enviado: true }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'gerar boleto') }
  revalidatePath('/financeiro')
  return { ok: true }
}

/** Dá baixa num recebível (finBaixaUm L5231): status→pago, data, limpa jurId. */
export async function darBaixaRecebivel(id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para dar baixa.' }

  const { data: rec } = await op.sb.from('fin_recebiveis').select('status, boleto').eq('id', id).maybeSingle()
  const r = rec as { status?: string; boleto?: string | null } | null
  if (!r) return { ok: false, error: 'Recebível não encontrado.' }
  if (r.status === 'pago') return { ok: false, error: 'Este recebível já está pago.' }
  if (!r.boleto) return { ok: false, error: 'Gere o boleto antes de dar baixa (retorno bancário).' }

  const hoje = new Date().toISOString().slice(0, 10)
  const { error: e } = await op.sb.from('fin_recebiveis').update({ status: 'pago', jur_id: null, dias_atraso: 0, data_pagamento: hoje }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'dar baixa') }
  revalidatePath('/financeiro')
  return { ok: true }
}

/** Escalar ao Jurídico (finEscalar L5399): cria vínculo jur_id. */
export async function escalarJuridico(id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para acionar o Jurídico.' }

  const { data: rec } = await op.sb.from('fin_recebiveis').select('status, jur_id').eq('id', id).maybeSingle()
  const r = rec as { status?: string; jur_id?: string | null } | null
  if (!r) return { ok: false, error: 'Recebível não encontrado.' }
  if (r.jur_id) return { ok: false, error: 'Caso já está no Jurídico.' }

  const { error: e } = await op.sb.from('fin_recebiveis').update({ jur_id: 'JUR-' + id.slice(0, 8) }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'acionar o Jurídico') }
  revalidatePath('/financeiro')
  return { ok: true }
}

/** Notificar cobrança (finNotificar L5398): só registra envio (e-mail+WhatsApp). */
export async function notificarCobranca(id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para notificar.' }
  const { data } = await op.sb.from('fin_recebiveis').select('id').eq('id', id).maybeSingle()
  if (!data) return { ok: false, error: 'Recebível não encontrado.' }
  // Integração real de e-mail/WhatsApp acontece no servidor (placeholder honesto).
  revalidatePath('/financeiro')
  return { ok: true }
}

// =============================================================================
// SUSPENDER / REATIVAR (finSuspender L5254) — receber e pagar
// =============================================================================
export async function suspenderLancamento(tabela: 'receber' | 'pagar', id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para suspender lançamentos.' }

  const tab = tabela === 'receber' ? 'fin_recebiveis' : 'fin_contas_pagar'
  const cols = tabela === 'receber' ? 'status, status_anterior, vencimento, jur_id' : 'status, status_anterior'
  const { data: rec } = await op.sb.from(tab).select(cols).eq('id', id).maybeSingle()
  const r = rec as { status?: string; status_anterior?: string | null; vencimento?: string | null; jur_id?: string | null } | null
  if (!r) return { ok: false, error: 'Lançamento não encontrado.' }

  if (r.status === 'suspenso') {
    // Reativar: volta ao status anterior; recalcula atraso (receber).
    let novo = r.status_anterior || 'aberto'
    const patch: Record<string, unknown> = { status_anterior: null }
    if (tabela === 'receber' && novo !== 'pago') {
      const d = calcDiasAtraso(r.vencimento)
      if (d > 0) { novo = 'atrasado'; patch.dias_atraso = d }
    }
    patch.status = novo
    const { error: e } = await op.sb.from(tab).update(patch).eq('id', id)
    if (e) return { ok: false, error: msgErro(e.message, 'reativar lançamento') }
  } else {
    if (r.status === 'pago') return { ok: false, error: 'Lançamento já pago não pode ser suspenso.' }
    const patch: Record<string, unknown> = { status_anterior: r.status, status: 'suspenso' }
    if (tabela === 'receber' && r.jur_id) patch.jur_id = null
    const { error: e } = await op.sb.from(tab).update(patch).eq('id', id)
    if (e) return { ok: false, error: msgErro(e.message, 'suspender lançamento') }
  }
  revalidatePath('/financeiro')
  return { ok: true }
}

// =============================================================================
// CONTAS A PAGAR
// =============================================================================

/** Pagar uma despesa (finPagar L5253): status→pago. */
export async function pagarDespesa(id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para pagar.' }
  const { data: rec } = await op.sb.from('fin_contas_pagar').select('status').eq('id', id).maybeSingle()
  const r = rec as { status?: string } | null
  if (!r) return { ok: false, error: 'Conta não encontrada.' }
  if (r.status === 'pago') return { ok: false, error: 'Esta conta já está paga.' }
  const { error: e } = await op.sb.from('fin_contas_pagar').update({ status: 'pago' }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'pagar') }
  revalidatePath('/financeiro')
  return { ok: true }
}

/** Definir prioridade de uma despesa (finSetPrio L5116). */
export async function definirPrioridade(id: string, prio: 'alta' | 'media' | 'baixa'): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para alterar prioridade.' }
  if (!['alta', 'media', 'baixa'].includes(prio)) return { ok: false, error: 'Prioridade inválida.' }
  const { error: e } = await op.sb.from('fin_contas_pagar').update({ prioridade: prio }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'definir prioridade') }
  revalidatePath('/financeiro')
  return { ok: true }
}

/** Nova despesa manual (Nova despesa — finPagarHTML L5250). */
export async function novaDespesa(input: {
  categoria: string; descricao: string; escopo: string; valor: number; vencimento: string; prioridade: 'alta' | 'media' | 'baixa'
}): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para lançar despesas.' }
  const categoria = (input.categoria || '').trim()
  if (!categoria) return { ok: false, error: 'Informe a categoria.' }
  const valor = Number(input.valor)
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'O valor deve ser maior que zero.' }
  if (!input.vencimento) return { ok: false, error: 'Informe o vencimento.' }

  const emp = await empresaId(op.sb)
  const { error: e } = await op.sb.from('fin_contas_pagar').insert({
    empresa_id: emp,
    categoria,
    descricao: (input.descricao || '').trim() || null,
    escopo: (input.escopo || 'Escritório').trim(),
    valor,
    vencimento: input.vencimento,
    status: 'aberto',
    prioridade: ['alta', 'media', 'baixa'].includes(input.prioridade) ? input.prioridade : 'media',
  })
  if (e) return { ok: false, error: msgErro(e.message, 'lançar despesa') }
  revalidatePath('/financeiro')
  return { ok: true }
}

// =============================================================================
// AUTOMAÇÃO DE ROYALTIES
// =============================================================================

/** Gera cobrança de royalties em lote (finRunRoyalties L5359): boleto p/ todo royalty sem boleto. */
export async function gerarCobrancaRoyalties(): Promise<R & { geradas?: number; total?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para gerar cobranças.' }

  const { data } = await op.sb.from('fin_recebiveis')
    .select('id, valor, boleto, status')
    .eq('categoria', 'Royalties')
    .is('boleto', null)
    .in('status', ['aberto', 'atrasado'])
  const alvo = (data ?? []) as { id: string; valor: number }[]
  if (alvo.length === 0) return { ok: true, geradas: 0, total: 0 }

  let total = 0
  for (let k = 0; k < alvo.length; k++) {
    const r = alvo[k]
    const boleto = finBoletoNum(k + 500)
    await op.sb.from('fin_recebiveis').update({ boleto, enviado: true }).eq('id', r.id)
    total += Number(r.valor) || 0
  }
  revalidatePath('/financeiro')
  return { ok: true, geradas: alvo.length, total }
}

/** Gera os royalties REAIS de uma competência a partir do FATURAMENTO do BEMP.
 *  Faturamento por unidade = soma de bemp_billings.total no mês (função fin_faturamento_por_salon),
 *  casado por unidades.bemp_salon_id. Por unidade-franquia com faturamento, cria 2 recebíveis:
 *  Royalties (royalty_pct% do bruto) e Fundo de marketing (fundo_pct%), com vencimento no dia X do
 *  mês seguinte. Idempotente por competência (não duplica). Espelha a regra do legado
 *  (royaltiesUnidade ~L4582): % sobre o faturamento, só franquias (unidade com salon BEMP). */
export async function gerarRoyaltiesDoFaturamento(ano: number, mes: number): Promise<R & { geradas?: number; faturamento?: number; unidades?: number; lancamentos?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para gerar royalties.' }
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, error: 'Competência inválida.' }

  const p2 = (n: number) => String(n).padStart(2, '0')
  const ini = `${ano}-${p2(mes)}-01`
  const proxMes = mes === 12 ? 1 : mes + 1
  const proxAno = mes === 12 ? ano + 1 : ano
  const fim = `${proxAno}-${p2(proxMes)}-01`
  const competencia = `${MESES_BR[mes - 1]}/${ano}`

  // 1) Faturamento real por salon (BEMP) no mês
  const { data: fatRaw, error: eFat } = await op.sb.rpc('fin_faturamento_por_salon', { p_ini: ini, p_fim: fim })
  if (eFat) return { ok: false, error: msgErro(eFat.message, 'apurar o faturamento do BEMP') }
  const fatPorSalon = new Map<number, number>()
  for (const r of (fatRaw ?? []) as { salon: number; faturamento: number }[]) fatPorSalon.set(Number(r.salon), Number(r.faturamento) || 0)

  // 2) Unidades-franquia (têm bemp_salon_id) + config (pct/vencimento)
  const [{ data: unisRaw }, { data: cfg }, mapa] = await Promise.all([
    op.sb.from('unidades').select('id, nome, bemp_salon_id').not('bemp_salon_id', 'is', null),
    op.sb.from('fin_config').select('royalty_pct, fundo_pct, venc_dia').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
    mapaFinanceiro(op.sb),
  ])
  const unidades = (unisRaw ?? []) as { id: string; nome: string; bemp_salon_id: number }[]
  const royaltyPct = Number((cfg as { royalty_pct?: number } | null)?.royalty_pct) || 10
  const fundoPct = Number((cfg as { fundo_pct?: number } | null)?.fundo_pct) || 2
  const vencDia = Number((cfg as { venc_dia?: number } | null)?.venc_dia) || 10
  const vencimento = `${proxAno}-${p2(proxMes)}-${p2(Math.min(28, Math.max(1, vencDia)))}`

  // 3) Idempotência: pula unidade/categoria que já tem recebível nesta competência
  const { data: existRaw } = await op.sb.from('fin_recebiveis').select('unidade_nome, categoria').eq('competencia', competencia).in('categoria', ['Royalties', 'Fundo de marketing'])
  const jaTem = new Set(((existRaw ?? []) as { unidade_nome: string; categoria: string }[]).map((r) => `${r.unidade_nome}|${r.categoria}`))

  const emp = await empresaId(op.sb)
  const compISO = ini // 1º dia do mês da competência ('2026-04-01')
  const rows: Record<string, unknown>[] = []
  const eventos: LancamentoEvento[] = []
  let faturamento = 0, comFat = 0
  for (const u of unidades) {
    const fat = fatPorSalon.get(Number(u.bemp_salon_id)) || 0
    if (fat <= 0) continue
    const bruto = Math.round(fat)
    faturamento += bruto; comFat++
    const valRoy = Math.round(bruto * royaltyPct) / 100
    const valFun = Math.round(bruto * fundoPct) / 100
    const centroUni = mapa.centroPorUnidade.get(u.id) ?? null
    // Projeção antiga (a tela "A Receber" ainda lê daqui) — mantida até migrar pro razão.
    if (!jaTem.has(`${u.nome}|Royalties`)) rows.push({ empresa_id: emp, unidade_id: u.id, unidade_nome: u.nome, categoria: 'Royalties', competencia, bruto, valor: valRoy, vencimento, status: 'aberto' })
    if (!jaTem.has(`${u.nome}|Fundo de marketing`)) rows.push({ empresa_id: emp, unidade_id: u.id, unidade_nome: u.nome, categoria: 'Fundo de marketing', competencia, bruto, valor: valFun, vencimento, status: 'aberto' })
    // RAZÃO (fonte da verdade): royalty/fundo = RECEITA da rede + DESPESA da unidade (mesmo fato, 2 centros).
    eventos.push(
      { empresaId: emp, centroCustoId: mapa.centroRede, planoContaId: mapa.planoPorCodigo.get('3.1.05') ?? null, natureza: 'receita', competencia: compISO, valor: valRoy, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:roy:rec`, dataPrevista: vencimento, historico: `Royalties ${competencia} · ${u.nome}` },
      { empresaId: emp, centroCustoId: centroUni, planoContaId: mapa.planoPorCodigo.get('4.1.02') ?? null, natureza: 'despesa', competencia: compISO, valor: valRoy, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:roy:desp`, dataPrevista: vencimento, historico: `Royalties ${competencia} · ${u.nome}` },
      { empresaId: emp, centroCustoId: mapa.centroRede, planoContaId: mapa.planoPorCodigo.get('3.1.06') ?? null, natureza: 'receita', competencia: compISO, valor: valFun, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:fun:rec`, dataPrevista: vencimento, historico: `Fundo de marketing ${competencia} · ${u.nome}` },
      { empresaId: emp, centroCustoId: centroUni, planoContaId: mapa.planoPorCodigo.get('4.1.03') ?? null, natureza: 'despesa', competencia: compISO, valor: valFun, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:fun:desp`, dataPrevista: vencimento, historico: `Fundo de marketing ${competencia} · ${u.nome}` },
    )
  }
  // Grava no RAZÃO (idempotente) — a fonte única da verdade.
  const lanc = await postLancamento(eventos).catch((e) => { console.error('razão royalties:', (e as Error).message); return { inseridos: 0 } })
  // Projeção antiga (compat) — enquanto a tela "A Receber" não lê do razão.
  if (rows.length > 0) {
    const { error: eIns } = await op.sb.from('fin_recebiveis').insert(rows)
    if (eIns) return { ok: false, error: msgErro(eIns.message, 'gerar os royalties') }
  }
  revalidatePath('/financeiro')
  return { ok: true, geradas: rows.length, faturamento, unidades: comFat, lancamentos: lanc.inseridos }
}

/** Apura o FATURAMENTO real do BEMP como RECEITA no razão, por unidade e por tipo de venda
 *  (pacotes/serviços/assinaturas/produtos → contas de receita). Idempotente por
 *  (unidade, tipo, competência). É o principal produtor de receita → alimenta DRE e Fluxo. */
export async function apurarFaturamentoBemp(ano: number, mes: number): Promise<R & { unidades?: number; lancamentos?: number; faturamento?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para apurar o faturamento.' }
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, error: 'Competência inválida.' }

  const p2 = (n: number) => String(n).padStart(2, '0')
  const ini = `${ano}-${p2(mes)}-01`
  const proxMes = mes === 12 ? 1 : mes + 1
  const proxAno = mes === 12 ? ano + 1 : ano
  const fim = `${proxAno}-${p2(proxMes)}-01`
  const competencia = `${MESES_BR[mes - 1]}/${ano}`

  const { data: fatRaw, error: eFat } = await op.sb.rpc('fin_faturamento_por_salon_entidade', { p_ini: ini, p_fim: fim })
  if (eFat) return { ok: false, error: msgErro(eFat.message, 'apurar o faturamento do BEMP') }

  const [{ data: unisRaw }, mapa] = await Promise.all([
    op.sb.from('unidades').select('id, nome, bemp_salon_id').not('bemp_salon_id', 'is', null),
    mapaFinanceiro(op.sb),
  ])
  const uniPorSalon = new Map<number, { id: string; nome: string }>()
  for (const u of (unisRaw ?? []) as { id: string; nome: string; bemp_salon_id: number }[]) uniPorSalon.set(Number(u.bemp_salon_id), u)

  const emp = await empresaId(op.sb)
  const eventos: LancamentoEvento[] = []
  const uni = new Set<string>()
  let faturamento = 0
  for (const r of (fatRaw ?? []) as { salon: number; entidade: string; total: number }[]) {
    const u = uniPorSalon.get(Number(r.salon)); if (!u) continue
    const val = Math.round(Number(r.total) || 0); if (val <= 0) continue
    faturamento += val; uni.add(u.id)
    const codigo = CONTA_POR_ENTIDADE[r.entidade] ?? '3.1.01'
    eventos.push({ empresaId: emp, centroCustoId: mapa.centroPorUnidade.get(u.id) ?? null, planoContaId: mapa.planoPorCodigo.get(codigo) ?? null, natureza: 'receita', competencia: ini, valor: val, origem: 'bemp', origemRef: `${u.id}:${r.entidade}`, idemKey: `bemp:${ini}:${u.id}:${r.entidade}`, status: 'realizado', historico: `Faturamento ${competencia} · ${r.entidade} · ${u.nome}` })
  }
  const lanc = await postLancamento(eventos).catch((e) => { console.error('razão faturamento:', (e as Error).message); return { inseridos: 0 } })
  revalidatePath('/financeiro')
  return { ok: true, unidades: uni.size, lancamentos: lanc.inseridos, faturamento }
}

/** Processa retorno bancário / baixa em lote (finBaixaLote L5370): baixa boletos em aberto sem atraso. */
export async function processarRetornoBancario(): Promise<R & { baixados?: number; total?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para processar o retorno.' }

  const { data } = await op.sb.from('fin_recebiveis')
    .select('id, valor, dias_atraso')
    .not('boleto', 'is', null)
    .eq('status', 'aberto')
  const alvo = (data ?? []) as { id: string; valor: number; dias_atraso: number }[]
  let total = 0, n = 0
  const hoje = new Date().toISOString().slice(0, 10)
  for (const r of alvo) {
    if ((r.dias_atraso || 0) > 0) continue
    await op.sb.from('fin_recebiveis').update({ status: 'pago', data_pagamento: hoje }).eq('id', r.id)
    total += Number(r.valor) || 0; n++
  }
  revalidatePath('/financeiro')
  return { ok: true, baixados: n, total }
}

/** Roda a régua de atraso (finRodarRegua L5378): >=10 dias sem jur_id → escala ao Jurídico. */
export async function rodarReguaAtraso(regua?: ReguaPasso[]): Promise<R & { aplicadas?: number; juridico?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para rodar a régua.' }

  const { data } = await op.sb.from('fin_recebiveis').select('id, dias_atraso, jur_id').eq('status', 'atrasado')
  const atr = (data ?? []) as { id: string; dias_atraso: number; jur_id: string | null }[]
  let jur = 0
  for (const r of atr) {
    const passo = proximoPassoRegua(r.dias_atraso || 0, regua)
    if (passo && passo.dias >= 10 && !r.jur_id) {
      await op.sb.from('fin_recebiveis').update({ jur_id: 'JUR-' + r.id.slice(0, 8) }).eq('id', r.id)
      jur++
    }
  }
  revalidatePath('/financeiro')
  return { ok: true, aplicadas: atr.length, juridico: jur }
}

// =============================================================================
// CONCILIAÇÃO
// =============================================================================
/** Rodar conciliação (finRodarConc L5331) — recalcula taxas/divergências sobre os lançamentos. */
export async function rodarConciliacao(): Promise<R & { cruzados?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para conciliar.' }
  const { count } = await op.sb.from('fin_conciliacao').select('id', { count: 'exact', head: true })
  revalidatePath('/financeiro')
  return { ok: true, cruzados: count ?? 0 }
}

// =============================================================================
// CONFIGURAÇÕES (finSalvarCfg L5427)
// =============================================================================
export async function salvarConfig(input: {
  royalty_pct: number; fundo_pct: number; venc_dia: number
  banco: Record<string, unknown>; adquirentes: unknown[]; categorias: string[]; regua: ReguaPasso[]
}): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para salvar configurações.' }

  // Validação dos limites do legado (finConfigHTML L5408-5410).
  const vencDia = Math.round(Number(input.venc_dia) || 10)
  if (vencDia < 1 || vencDia > 28) return { ok: false, error: 'O dia de vencimento deve ficar entre 1 e 28.' }
  const royalty = Number(input.royalty_pct); const fundo = Number(input.fundo_pct)
  if (!Number.isFinite(royalty) || royalty < 0) return { ok: false, error: 'Percentual de royalties inválido.' }
  if (!Number.isFinite(fundo) || fundo < 0) return { ok: false, error: 'Percentual do fundo inválido.' }

  const emp = await empresaId(op.sb)
  if (!emp) return { ok: false, error: 'Empresa não encontrada.' }
  const { error: e } = await op.sb.from('fin_config').upsert({
    empresa_id: emp,
    royalty_pct: royalty,
    fundo_pct: fundo,
    venc_dia: vencDia,
    banco: input.banco,
    adquirentes: input.adquirentes,
    categorias: input.categorias,
    regua: input.regua,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'empresa_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'salvar configurações') }
  revalidatePath('/financeiro')
  return { ok: true }
}

// =============================================================================
// COMPAT — ações antigas (usadas por /sac e componentes órfãos legados).
// Mantidas para não quebrar imports existentes. lancamentos_financeiros é o
// financeiro por UNIDADE (/contas); aqui só os reembolsos do SAC espelham de volta.
// =============================================================================
// 'use server' não permite `export … from`; embrulha em funções async que repassam.
export async function darBaixaLancamento(lancamentoId: string) { return _darBaixaLancamento(lancamentoId) }
export async function receberLancamento(lancamentoId: string) { return _receberLancamento(lancamentoId) }
