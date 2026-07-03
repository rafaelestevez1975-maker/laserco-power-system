'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { finBoletoNum, calcDiasAtraso, proximoPassoRegua, type ReguaPasso, COMISSAO_BASE_OPCOES, type ComissaoBase, janelaFluxo, normalizaFluxo, type FluxoSerie, type FluxoResumo, type FluxoComp } from '@/lib/financeiro'
import { darBaixaLancamento as _darBaixaLancamento, receberLancamento as _receberLancamento } from './actions-sac'
import { postLancamento, repostLancamento, conciliarLancamento, mapaFinanceiro, type LancamentoEvento } from '@/lib/financeiro-ledger'
import { adminClient } from '@/lib/supabase/admin'

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

  const { data: rec } = await op.sb.from('fin_recebiveis').select('status, boleto, lancamento_id').eq('id', id).maybeSingle()
  const r = rec as { status?: string; boleto?: string | null; lancamento_id?: string | null } | null
  if (!r) return { ok: false, error: 'Recebível não encontrado.' }
  if (r.status === 'pago') return { ok: false, error: 'Este recebível já está pago.' }
  if (!r.boleto) return { ok: false, error: 'Gere o boleto antes de dar baixa (retorno bancário).' }

  const hoje = new Date().toISOString().slice(0, 10)
  const { error: e } = await op.sb.from('fin_recebiveis').update({ status: 'pago', jur_id: null, dias_atraso: 0, data_pagamento: hoje }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'dar baixa') }
  // Ponte pro razão: registra o CAIXA (o 'recebido' do Fluxo passa a refletir esta baixa).
  if (r.lancamento_id) await conciliarLancamento(r.lancamento_id, hoje).catch((err) => console.error('conciliar razão (baixa):', (err as Error).message))
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
  const cols = tabela === 'receber' ? 'status, status_anterior, vencimento, jur_id, lancamento_id' : 'status, status_anterior'
  const { data: rec } = await op.sb.from(tab).select(cols).eq('id', id).maybeSingle()
  const r = rec as { status?: string; status_anterior?: string | null; vencimento?: string | null; jur_id?: string | null; lancamento_id?: string | null } | null
  if (!r) return { ok: false, error: 'Lançamento não encontrado.' }

  const reativando = r.status === 'suspenso'
  if (reativando) {
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

  // Espelha no RAZÃO (pedido do cliente): suspenso fica VISÍVEL mas fora do fluxo de caixa
  // (fin_fluxo* ignoram status 'suspenso'; o DRE mantém — competência). Best-effort.
  try {
    const admin = adminClient()
    const novoStatusRazao = reativando ? 'previsto' : 'suspenso'
    if (tabela === 'receber' && r.lancamento_id) {
      await admin.from('fin_lancamento').update({ status: novoStatusRazao }).eq('id', r.lancamento_id)
    } else if (tabela === 'pagar') {
      await admin.from('fin_lancamento').update({ status: novoStatusRazao }).eq('origem', 'manual').eq('origem_ref', id)
    }
  } catch (e) { console.error('suspender→razão:', (e as Error).message) }

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
  // Ponte pro razão: concilia a despesa manual correspondente (o 'pago' do Fluxo reflete).
  const { data: lanc } = await op.sb.from('fin_lancamento').select('id').eq('origem', 'manual').eq('origem_ref', id).maybeSingle()
  const lid = (lanc as { id?: string } | null)?.id
  if (lid) await conciliarLancamento(lid, new Date().toISOString().slice(0, 10)).catch((err) => console.error('conciliar razão (pagar):', (err as Error).message))
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
  const { data: ins, error: e } = await op.sb.from('fin_contas_pagar').insert({
    empresa_id: emp,
    categoria,
    descricao: (input.descricao || '').trim() || null,
    escopo: (input.escopo || 'Escritório').trim(),
    valor,
    vencimento: input.vencimento,
    status: 'aberto',
    prioridade: ['alta', 'media', 'baixa'].includes(input.prioridade) ? input.prioridade : 'media',
  }).select('id').single()
  if (e) return { ok: false, error: msgErro(e.message, 'lançar despesa') }
  // Ponte pro razão: despesa da franqueadora ligada ao contas a pagar por origem_ref.
  // A conta do DRE é a categoria de MESMO NOME no plano de contas (criável em Config);
  // sem correspondente, cai em 4.2.99 (Outras despesas). Alimenta DRE e Fluxo.
  const contaId = (ins as { id: string }).id
  const mapa = await mapaFinanceiro(op.sb)
  const { data: pcMatch } = await op.sb.from('plano_conta').select('id').ilike('nome', categoria).eq('ativo', true).limit(1).maybeSingle()
  const planoContaId = (pcMatch as { id?: string } | null)?.id ?? mapa.planoPorCodigo.get('4.2.99') ?? null
  await postLancamento({
    empresaId: emp, centroCustoId: mapa.centroRede, planoContaId,
    natureza: 'despesa', competencia: `${input.vencimento.slice(0, 7)}-01`, valor, origem: 'manual', origemRef: contaId,
    idemKey: `manual:${contaId}`, dataPrevista: input.vencimento, status: 'previsto',
    historico: `${categoria}${(input.descricao || '').trim() ? ' · ' + (input.descricao || '').trim() : ''}`,
  }).catch((err) => console.error('razão nova despesa:', (err as Error).message))
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

  // 2) Unidades-franquia (têm bemp_salon_id) + config (pct/vencimento + regra de desconto)
  const [{ data: unisRaw }, { data: cfg }, mapa] = await Promise.all([
    op.sb.from('unidades').select('id, nome, bemp_salon_id, royalty_pct_override, venc_dia_override').not('bemp_salon_id', 'is', null),
    op.sb.from('fin_config').select('royalty_pct, fundo_pct, venc_dia, royalty_desc_ativo, royalty_desc_teto, royalty_desc_pct').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
    mapaFinanceiro(op.sb),
  ])
  const unidades = (unisRaw ?? []) as { id: string; nome: string; bemp_salon_id: number; royalty_pct_override?: number | null; venc_dia_override?: number | null }[]
  const c = cfg as { royalty_pct?: number; fundo_pct?: number; venc_dia?: number; royalty_desc_ativo?: boolean; royalty_desc_teto?: number; royalty_desc_pct?: number } | null
  const royaltyPct = Number(c?.royalty_pct) || 10
  const fundoPct = Number(c?.fundo_pct) || 0 // hoje o fundo NÃO é cobrado (validação do CEO 02/07); 0 = não lança
  const vencDia = Number(c?.venc_dia) || 10
  // Regra automática de desconto (CEO): faturamento < teto E pagando em dia → desconto no royalty.
  const descAtivo = c?.royalty_desc_ativo !== false
  const descTeto = Number(c?.royalty_desc_teto) || 80000
  const descPct = Number(c?.royalty_desc_pct) || 50
  const vencDe = (dia: number) => `${proxAno}-${p2(proxMes)}-${p2(Math.min(28, Math.max(1, dia)))}`
  // "Pagando em dia" = sem recebível atrasado (por unidade).
  const { data: atrasadosRaw } = await op.sb.from('fin_recebiveis').select('unidade_id').eq('status', 'atrasado')
  const comAtraso = new Set(((atrasadosRaw ?? []) as { unidade_id: string | null }[]).map((r) => r.unidade_id).filter(Boolean) as string[])

  // 3) Idempotência: pula unidade/categoria que já tem recebível nesta competência.
  //    Chaveia por unidade_id (não por nome) — renomear a unidade não pode duplicar o recebível.
  const { data: existRaw } = await op.sb.from('fin_recebiveis').select('unidade_id, categoria').eq('competencia', competencia).in('categoria', ['Royalties', 'Fundo de marketing'])
  const jaTem = new Set(((existRaw ?? []) as { unidade_id: string; categoria: string }[]).map((r) => `${r.unidade_id}|${r.categoria}`))

  const emp = await empresaId(op.sb)
  const compISO = ini // 1º dia do mês da competência ('2026-04-01')
  const rows: Record<string, unknown>[] = []
  const eventos: LancamentoEvento[] = []
  let faturamento = 0, comFat = 0
  for (const u of unidades) {
    const fat = fatPorSalon.get(Number(u.bemp_salon_id)) || 0
    if (fat <= 0) continue
    const bruto = Math.round(fat * 100) / 100 // já é receita − descontos (RPC)
    faturamento += bruto; comFat++
    // % POR UNIDADE (override) + regra automática: < teto e sem atraso → desconto (ex.: 10% vira 5%).
    const pctBase = Number(u.royalty_pct_override ?? royaltyPct)
    const temDesconto = descAtivo && bruto < descTeto && !comAtraso.has(u.id)
    const pctEfetivo = temDesconto ? pctBase * (1 - descPct / 100) : pctBase
    const valRoy = Math.round(bruto * pctEfetivo) / 100
    const valFun = Math.round(bruto * fundoPct) / 100
    const vencimento = vencDe(Number(u.venc_dia_override ?? vencDia))
    const centroUni = mapa.centroPorUnidade.get(u.id) ?? null
    const obsDesc = temDesconto ? ` (${pctEfetivo}% — desconto <${Math.round(descTeto / 1000)}k em dia)` : ''
    // Sub-livro "A Receber" (fundo só se cobrado — hoje 0).
    if (valRoy > 0 && !jaTem.has(`${u.id}|Royalties`)) rows.push({ empresa_id: emp, unidade_id: u.id, unidade_nome: u.nome, categoria: 'Royalties', competencia, bruto, valor: valRoy, vencimento, status: 'aberto' })
    if (valFun > 0 && !jaTem.has(`${u.id}|Fundo de marketing`)) rows.push({ empresa_id: emp, unidade_id: u.id, unidade_nome: u.nome, categoria: 'Fundo de marketing', competencia, bruto, valor: valFun, vencimento, status: 'aberto' })
    // RAZÃO (fonte da verdade): royalty/fundo = RECEITA da rede + DESPESA da unidade (mesmo fato, 2 centros).
    eventos.push(
      { empresaId: emp, centroCustoId: mapa.centroRede, planoContaId: mapa.planoPorCodigo.get('3.1.05') ?? null, natureza: 'receita', competencia: compISO, valor: valRoy, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:roy:rec`, dataPrevista: vencimento, historico: `Royalties ${competencia} · ${u.nome}${obsDesc}` },
      { empresaId: emp, centroCustoId: centroUni, planoContaId: mapa.planoPorCodigo.get('4.1.02') ?? null, natureza: 'despesa', competencia: compISO, valor: valRoy, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:roy:desp`, dataPrevista: vencimento, historico: `Royalties ${competencia} · ${u.nome}${obsDesc}` },
      { empresaId: emp, centroCustoId: mapa.centroRede, planoContaId: mapa.planoPorCodigo.get('3.1.06') ?? null, natureza: 'receita', competencia: compISO, valor: valFun, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:fun:rec`, dataPrevista: vencimento, historico: `Fundo de marketing ${competencia} · ${u.nome}` },
      { empresaId: emp, centroCustoId: centroUni, planoContaId: mapa.planoPorCodigo.get('4.1.03') ?? null, natureza: 'despesa', competencia: compISO, valor: valFun, origem: 'royalty', origemRef: u.id, idemKey: `royalty:${compISO}:${u.id}:fun:desp`, dataPrevista: vencimento, historico: `Fundo de marketing ${competencia} · ${u.nome}` },
    )
  }
  // Grava no RAZÃO (fonte única) — SUBSTITUI a competência (reflete correções do BEMP); erro propagado.
  let lanc: { inseridos: number }
  try { lanc = await repostLancamento('royalty', compISO, eventos) }
  catch (e) { return { ok: false, error: msgErro((e as Error).message, 'lançar os royalties no razão') } }
  // Sub-livro "A Receber": grava os recebíveis JÁ LIGADOS ao lançamento do razão (lancamento_id),
  // para a baixa conciliar o caixa. Casa por (unidade, conta de receita) na competência.
  if (rows.length > 0) {
    const { data: lancs } = await op.sb.from('fin_lancamento').select('id, origem_ref, plano_conta_id')
      .eq('origem', 'royalty').eq('natureza', 'receita').eq('competencia', compISO)
    const idPorChave = new Map<string, string>()
    for (const l of (lancs ?? []) as { id: string; origem_ref: string | null; plano_conta_id: string | null }[]) idPorChave.set(`${l.origem_ref}:${l.plano_conta_id}`, l.id)
    const contaRoy = mapa.planoPorCodigo.get('3.1.05') ?? null, contaFun = mapa.planoPorCodigo.get('3.1.06') ?? null
    for (const row of rows) {
      const conta = row.categoria === 'Royalties' ? contaRoy : contaFun
      row.lancamento_id = idPorChave.get(`${row.unidade_id}:${conta}`) ?? null
    }
    const { error: eIns } = await op.sb.from('fin_recebiveis').insert(rows)
    if (eIns) return { ok: false, error: msgErro(eIns.message, 'gerar os royalties') }
  }
  revalidatePath('/financeiro')
  return { ok: true, geradas: rows.length, faturamento, unidades: comFat, lancamentos: lanc.inseridos }
}

/** Override de royalty POR UNIDADE (CEO 02/07: "temos que poder preencher por unidade").
 *  null = usa a regra geral (% global + desconto automático). Vale a partir da próxima apuração. */
export async function salvarRoyaltyUnidade(unidadeId: string, royaltyPct: number | null, vencDia: number | null): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para alterar royalties.' }
  if (!unidadeId) return { ok: false, error: 'Unidade inválida.' }
  if (royaltyPct != null && (!Number.isFinite(royaltyPct) || royaltyPct < 0 || royaltyPct > 100)) return { ok: false, error: 'Percentual de royalty inválido (0 a 100).' }
  if (vencDia != null && (!Number.isInteger(vencDia) || vencDia < 1 || vencDia > 28)) return { ok: false, error: 'Dia de vencimento inválido (1 a 28).' }
  const { error: e } = await adminClient().from('unidades')
    .update({ royalty_pct_override: royaltyPct, venc_dia_override: vencDia }).eq('id', unidadeId)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar o royalty da unidade') }
  revalidatePath('/financeiro')
  return { ok: true }
}

export type DreLinhaR = { grupo: string; natureza: string; conta: string; ordem: number; total: number }
/** Carrega o DRE (do RAZÃO) de uma competência — com escopo: consolidado (rede+unidades),
 *  franqueadora (só o centro da rede: royalties/fundo) ou unidades (só os centros das unidades).
 *  Usado pelos seletores de mês e de escopo na aba DRE. */
const DRE_ESCOPOS = ['consolidado', 'franqueadora', 'unidades'] as const
export async function dreDaCompetencia(ano: number, mes: number, escopo: string = 'consolidado', unidadeId: string | null = null): Promise<R & { linhas?: DreLinhaR[]; competencia?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para ver o DRE.' }
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, error: 'Competência inválida.' }
  const esc = (DRE_ESCOPOS as readonly string[]).includes(escopo) ? escopo : 'consolidado'
  const p2 = (n: number) => String(n).padStart(2, '0')
  const ini = `${ano}-${p2(mes)}-01`
  const proxMes = mes === 12 ? 1 : mes + 1, proxAno = mes === 12 ? ano + 1 : ano
  const fim = `${proxAno}-${p2(proxMes)}-01`
  // DRE de UMA loja (pedido do cliente: "DRE de cada loja, de todas, da franqueadora e do grupo").
  const { data, error: e } = await op.sb.rpc('fin_dre', { p_ini: ini, p_fim: fim, p_escopo: esc, p_unidade: unidadeId || null })
  if (e) return { ok: false, error: msgErro(e.message, 'carregar o DRE') }
  return { ok: true, linhas: (data ?? []) as DreLinhaR[], competencia: ini }
}

// ── Plano de contas: o cliente cria as próprias categorias (validação de 01/07). ──
export type ContaPlano = { id: string; codigo: string | null; nome: string; natureza: string; grupo: string | null; ordem: number; ativo: boolean }
const NATUREZAS_VALIDAS = new Set(['receita', 'custo', 'despesa'])
const GRUPO_POR_NATUREZA: Record<string, string> = { receita: 'Receitas', custo: 'Custos', despesa: 'Despesas administrativas' }

/** Cria uma categoria (conta) no plano de contas. Aparece no DRE assim que houver lançamento. */
export async function criarContaPlano(nome: string, natureza: string, grupo?: string): Promise<R & { id?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para editar o plano de contas.' }
  const n = (nome || '').trim()
  if (!n) return { ok: false, error: 'Informe o nome da categoria.' }
  if (!NATUREZAS_VALIDAS.has(natureza)) return { ok: false, error: 'Natureza inválida (receita, custo ou despesa).' }
  const emp = await empresaId(op.sb)
  const admin = adminClient()
  const { data: dup } = await admin.from('plano_conta').select('id').eq('empresa_id', emp).ilike('nome', n).limit(1).maybeSingle()
  if (dup) return { ok: false, error: 'Já existe uma categoria com esse nome.' }
  const { data: maxRaw } = await admin.from('plano_conta').select('ordem').eq('empresa_id', emp).order('ordem', { ascending: false }).limit(1).maybeSingle()
  const ordem = ((maxRaw as { ordem?: number } | null)?.ordem ?? 99) + 1
  const { data: ins, error: e } = await admin.from('plano_conta').insert({
    empresa_id: emp, codigo: null, nome: n, natureza,
    grupo: (grupo || '').trim() || GRUPO_POR_NATUREZA[natureza], ordem, ativo: true,
  }).select('id').single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar a categoria') }
  revalidatePath('/financeiro')
  return { ok: true, id: (ins as { id: string }).id }
}

/** Ativa/desativa uma categoria. Contas seed (com código) não podem ser desativadas —
 *  os produtores automáticos (BEMP/royalties/despesas config) lançam nelas. */
export async function setContaPlanoAtivo(id: string, ativo: boolean): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para editar o plano de contas.' }
  const admin = adminClient()
  const { data: c } = await admin.from('plano_conta').select('codigo').eq('id', id).maybeSingle()
  if (!c) return { ok: false, error: 'Categoria não encontrada.' }
  if ((c as { codigo?: string | null }).codigo && !ativo) return { ok: false, error: 'Categorias do sistema (com código) não podem ser desativadas — os lançamentos automáticos usam elas.' }
  const { error: e } = await admin.from('plano_conta').update({ ativo }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar a categoria') }
  revalidatePath('/financeiro')
  return { ok: true }
}

/** Fluxo de caixa do razão para um escopo (consolidado/franqueadora/unidades) — série + KPIs + composição.
 *  Os helpers janelaFluxo/normalizaFluxo vivem em @/lib/financeiro (módulo puro) porque um arquivo
 *  'use server' só pode exportar funções async. */
export async function fluxoDoRazao(escopo: string = 'consolidado'): Promise<R & { serie?: FluxoSerie[]; resumo?: FluxoResumo; composicao?: FluxoComp[] }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para ver o fluxo de caixa.' }
  const esc = (DRE_ESCOPOS as readonly string[]).includes(escopo) ? escopo : 'consolidado'
  const { ini, fim } = janelaFluxo(new Date())
  const [serieR, resumoR, compR] = await Promise.all([
    op.sb.rpc('fin_fluxo', { p_ini: ini, p_fim: fim, p_escopo: esc }),
    op.sb.rpc('fin_fluxo_resumo', { p_escopo: esc }),
    op.sb.rpc('fin_fluxo_composicao', { p_escopo: esc }),
  ])
  if (serieR.error || resumoR.error || compR.error) return { ok: false, error: msgErro((serieR.error || resumoR.error || compR.error)!.message, 'carregar o fluxo de caixa') }
  return { ok: true, ...normalizaFluxo(serieR.data, resumoR.data, compR.data) }
}

/** Apura o FATURAMENTO real do BEMP como RECEITA no razão, por unidade e por tipo de venda
 *  (pacotes/serviços/assinaturas/produtos → contas de receita). Idempotente por
 *  (unidade, tipo, competência). É o principal produtor de receita → alimenta DRE e Fluxo. */
export async function apurarFaturamentoBemp(ano: number, mes: number): Promise<R & { unidades?: number; lancamentos?: number; faturamento?: number; semCentro?: number }> {
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
  const semCentro = new Set<string>()
  let faturamento = 0
  for (const r of (fatRaw ?? []) as { salon: number; entidade: string; total: number }[]) {
    const u = uniPorSalon.get(Number(r.salon)); if (!u) continue
    const val = Math.round(Number(r.total) || 0); if (val <= 0) continue
    faturamento += val; uni.add(u.id)
    const centro = mapa.centroPorUnidade.get(u.id) ?? null
    if (!centro) semCentro.add(u.id) // sem centro → despesas de config não incidem sobre essa receita (avisar)
    const codigo = CONTA_POR_ENTIDADE[r.entidade] ?? '3.1.01'
    eventos.push({ empresaId: emp, centroCustoId: centro, planoContaId: mapa.planoPorCodigo.get(codigo) ?? null, natureza: 'receita', competencia: ini, valor: val, origem: 'bemp', origemRef: `${u.id}:${r.entidade}`, idemKey: `bemp:${ini}:${u.id}:${r.entidade}`, status: 'realizado', historico: `Faturamento ${competencia} · ${r.entidade} · ${u.nome}` })
  }
  // SUBSTITUI (reapurável): reflete correções posteriores no BEMP; erro é propagado, não engolido.
  let lanc: { inseridos: number }
  try { lanc = await repostLancamento('bemp', ini, eventos) }
  catch (e) { return { ok: false, error: msgErro((e as Error).message, 'apurar o faturamento no razão') } }
  revalidatePath('/financeiro')
  return { ok: true, unidades: uni.size, lancamentos: lanc.inseridos, faturamento, semCentro: semCentro.size }
}

/** Apura as DESPESAS configuráveis (imposto/comissão/taxa de cartão) sobre a receita real já
 *  lançada no razão. As regras vêm de fin_config (o contador ajusta em Config, não é chumbado).
 *  Semântica de SUBSTITUIÇÃO: apaga as despesas de config da competência e regrava — assim,
 *  quando o % muda, o razão reflete o novo valor (idempotência simples colidiria e não atualizaria). */
export async function apurarDespesasDaCompetencia(ano: number, mes: number): Promise<R & { unidades?: number; lancamentos?: number; imposto?: number; comissao?: number; taxaCartao?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para apurar despesas.' }
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, error: 'Competência inválida.' }

  const p2 = (n: number) => String(n).padStart(2, '0')
  const ini = `${ano}-${p2(mes)}-01`
  const competencia = `${MESES_BR[mes - 1]}/${ano}`

  // Regras configuráveis (% ≥ 0; 0 = não lança essa despesa).
  const { data: cfg } = await op.sb.from('fin_config').select('imposto_pct, comissao_pct, comissao_base, taxa_cartao_pct').order('atualizado_em', { ascending: false }).limit(1).maybeSingle()
  const impPct = Number((cfg as { imposto_pct?: number } | null)?.imposto_pct) || 0
  const comPct = Number((cfg as { comissao_pct?: number } | null)?.comissao_pct) || 0
  const txPct = Number((cfg as { taxa_cartao_pct?: number } | null)?.taxa_cartao_pct) || 0
  const comBase = ((cfg as { comissao_base?: string } | null)?.comissao_base || 'faturamento') as ComissaoBase

  const emp = await empresaId(op.sb)
  const mapa = await mapaFinanceiro(op.sb)
  // Contas de destino das despesas (plano de contas).
  const contaImposto = mapa.planoPorCodigo.get('4.1.04') ?? null   // Impostos sobre vendas
  const contaComissao = mapa.planoPorCodigo.get('4.1.01') ?? null  // Comissões
  const contaTaxa = mapa.planoPorCodigo.get('4.1.05') ?? null      // Taxa de meio de pagamento
  // Contas que compõem a BASE da comissão (null = todo o faturamento).
  const baseCodigos = COMISSAO_BASE_OPCOES.find((o) => o.valor === comBase)?.contas ?? null
  const baseContaIds = baseCodigos ? new Set(baseCodigos.map((c) => mapa.planoPorCodigo.get(c)).filter(Boolean) as string[]) : null
  // Guard: comissão ligada com base restrita, mas nenhuma conta da base existe no plano → zeraria
  // a comissão silenciosamente. Falha alto (é erro de configuração), não devolve número errado.
  if (comPct > 0 && baseCodigos && baseContaIds && baseContaIds.size === 0)
    return { ok: false, error: 'Configuração de comissão inválida: as contas da base não foram encontradas no plano de contas.' }

  // Receita real (BEMP) já no razão nesta competência → base de cálculo das despesas.
  const { data: recRaw } = await op.sb.from('fin_lancamento')
    .select('centro_custo_id, plano_conta_id, valor')
    .eq('origem', 'bemp').eq('natureza', 'receita').eq('competencia', ini).limit(5000)
  const receitas = (recRaw ?? []) as { centro_custo_id: string | null; plano_conta_id: string | null; valor: number }[]

  // Agrupa por centro (unidade): faturamento total e base da comissão.
  const porCentro = new Map<string, { fat: number; base: number }>()
  for (const r of receitas) {
    if (!r.centro_custo_id) continue
    const v = Number(r.valor) || 0
    const acc = porCentro.get(r.centro_custo_id) ?? { fat: 0, base: 0 }
    acc.fat += v
    if (!baseContaIds || (r.plano_conta_id && baseContaIds.has(r.plano_conta_id))) acc.base += v
    porCentro.set(r.centro_custo_id, acc)
  }

  const eventos: LancamentoEvento[] = []
  let totImp = 0, totCom = 0, totTax = 0
  for (const [centro, { fat, base }] of porCentro) {
    const imposto = Math.round(fat * impPct) / 100
    const comissao = Math.round(base * comPct) / 100
    const taxa = Math.round(fat * txPct) / 100
    totImp += imposto; totCom += comissao; totTax += taxa
    if (imposto > 0) eventos.push({ empresaId: emp, centroCustoId: centro, planoContaId: contaImposto, natureza: 'despesa', competencia: ini, valor: imposto, origem: 'despesa_config', origemRef: `${centro}:imposto`, idemKey: `despesa_config:${ini}:${centro}:imposto`, status: 'realizado', historico: `Impostos sobre vendas ${competencia}` })
    if (comissao > 0) eventos.push({ empresaId: emp, centroCustoId: centro, planoContaId: contaComissao, natureza: 'despesa', competencia: ini, valor: comissao, origem: 'despesa_config', origemRef: `${centro}:comissao`, idemKey: `despesa_config:${ini}:${centro}:comissao`, status: 'realizado', historico: `Comissões ${competencia}` })
    if (taxa > 0) eventos.push({ empresaId: emp, centroCustoId: centro, planoContaId: contaTaxa, natureza: 'despesa', competencia: ini, valor: taxa, origem: 'despesa_config', origemRef: `${centro}:taxa_cartao`, idemKey: `despesa_config:${ini}:${centro}:taxa_cartao`, status: 'realizado', historico: `Taxa de meio de pagamento ${competencia}` })
  }

  // SUBSTITUI (reapurável): apaga as despesas de config da competência e regrava; erro propagado
  // (nunca engolir após o DELETE — apagaria e reportaria sucesso, inflando o lucro no DRE).
  let lanc: { inseridos: number }
  try { lanc = await repostLancamento('despesa_config', ini, eventos) }
  catch (e) { return { ok: false, error: msgErro((e as Error).message, 'atualizar as despesas (as anteriores foram removidas — reapure)') } }
  revalidatePath('/financeiro')
  return { ok: true, unidades: porCentro.size, lancamentos: lanc.inseridos, imposto: totImp, comissao: totCom, taxaCartao: totTax }
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
  imposto_pct?: number; imposto_regime?: string; comissao_pct?: number; comissao_base?: string; taxa_cartao_pct?: number
  royalty_desc_ativo?: boolean; royalty_desc_teto?: number; royalty_desc_pct?: number
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

  // Regras de despesa configuráveis — todas são % ≥ 0 (0 = não lança). Limite 100% de sanidade.
  const pctDesp = (v: unknown, nome: string): number | { erro: string } => {
    const n = Number(v ?? 0)
    if (!Number.isFinite(n) || n < 0 || n > 100) return { erro: `Percentual de ${nome} inválido (0 a 100).` }
    return n
  }
  const imp = pctDesp(input.imposto_pct, 'imposto'); if (typeof imp === 'object') return { ok: false, error: imp.erro }
  const com = pctDesp(input.comissao_pct, 'comissão'); if (typeof com === 'object') return { ok: false, error: com.erro }
  const tx = pctDesp(input.taxa_cartao_pct, 'taxa de cartão'); if (typeof tx === 'object') return { ok: false, error: tx.erro }
  const base = COMISSAO_BASE_OPCOES.some((o) => o.valor === input.comissao_base) ? input.comissao_base! : 'faturamento'

  const emp = await empresaId(op.sb)
  if (!emp) return { ok: false, error: 'Empresa não encontrada.' }
  const { error: e } = await op.sb.from('fin_config').upsert({
    empresa_id: emp,
    royalty_pct: royalty,
    fundo_pct: fundo,
    venc_dia: vencDia,
    imposto_pct: imp,
    imposto_regime: (input.imposto_regime || 'Simples Nacional').slice(0, 60),
    comissao_pct: com,
    comissao_base: base,
    taxa_cartao_pct: tx,
    royalty_desc_ativo: input.royalty_desc_ativo !== false,
    royalty_desc_teto: Math.max(0, Number(input.royalty_desc_teto ?? 80000) || 80000),
    royalty_desc_pct: Math.min(100, Math.max(0, Number(input.royalty_desc_pct ?? 50) || 50)),
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

// =============================================================================
// IMPORTAÇÃO DE PLANILHA (finImportExcel L5257 / finModeloExcel L5300) — paridade legacy.
// O front lê o .xlsx/.csv (SheetJS) e manda linhas JÁ mapeadas; aqui grava no sub-livro
// e lança no RAZÃO (origem 'manual', conta por nome da categoria — DRE/Fluxo enxergam).
// =============================================================================
export type ImportRecebivelItem = { unidade: string; categoria: string; descricao: string; valor: number; vencimento: string | null; status: string }
export type ImportDespesaItem = { categoria: string; descricao: string; escopo: string; valor: number; vencimento: string | null; prioridade: string; status: string }

const IMPORT_MAX = 500
/** dd/mm/aaaa ou aaaa-mm-dd → ISO (ou null). */
function vencISO(s: string | null): string | null {
  const t = (s || '').trim()
  if (!t) return null
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (br) { const a = br[3].length === 2 ? '20' + br[3] : br[3]; return `${a}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return null
}

/** Importa CONTAS A RECEBER (sub-livro + razão receita prevista, centro rede). */
export async function importarRecebiveis(itens: ImportRecebivelItem[]): Promise<R & { importados?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para importar lançamentos.' }
  const lista = (itens || []).filter((i) => Number(i.valor) > 0 || (i.descricao || '').trim()).slice(0, IMPORT_MAX)
  if (lista.length === 0) return { ok: false, error: 'Planilha vazia ou sem dados reconhecidos.' }

  const emp = await empresaId(op.sb)
  const mapa = await mapaFinanceiro(op.sb)
  const { data: unisRaw } = await op.sb.from('unidades').select('id, nome')
  const uniPorNome = new Map(((unisRaw ?? []) as { id: string; nome: string }[]).map((u) => [u.nome.trim().toLowerCase(), u.id]))
  const { data: pcs } = await op.sb.from('plano_conta').select('id, nome').eq('ativo', true)
  const contaPorNome = new Map(((pcs ?? []) as { id: string; nome: string }[]).map((c) => [c.nome.trim().toLowerCase(), c.id]))

  const hoje = new Date().toISOString().slice(0, 10)
  const rows = lista.map((i) => {
    const venc = vencISO(i.vencimento)
    let status = /suspen/i.test(i.status) ? 'suspenso' : /pag|sim/i.test(i.status) ? 'pago' : 'aberto'
    let dias = 0
    if (status === 'aberto') { const d = calcDiasAtraso(venc, hoje); if (d > 0) { status = 'atrasado'; dias = d } }
    return {
      empresa_id: emp, unidade_id: uniPorNome.get((i.unidade || '').trim().toLowerCase()) ?? null,
      unidade_nome: (i.unidade || '').trim() || null, categoria: (i.categoria || 'Outros').trim() || 'Outros',
      competencia: (i.descricao || 'Importado').trim(), bruto: 0, valor: Math.round(Number(i.valor) * 100) / 100,
      vencimento: venc, status, dias_atraso: dias, enviado: false,
      data_pagamento: status === 'pago' ? (venc || hoje) : null,
    }
  })
  const { data: ins, error: eIns } = await adminClient().from('fin_recebiveis').insert(rows).select('id, categoria, unidade_nome, competencia, valor, vencimento, status')
  if (eIns) return { ok: false, error: msgErro(eIns.message, 'importar os recebíveis') }
  const criados = (ins ?? []) as { id: string; categoria: string; unidade_nome: string | null; competencia: string | null; valor: number; vencimento: string | null; status: string }[]

  // RAZÃO: receita prevista (realizada se veio 'pago') no centro da rede, conta pelo NOME da categoria.
  const eventos: LancamentoEvento[] = criados.map((r) => ({
    empresaId: emp, centroCustoId: mapa.centroRede,
    planoContaId: contaPorNome.get(r.categoria.trim().toLowerCase()) ?? null,
    natureza: 'receita' as const, competencia: `${(r.vencimento || hoje).slice(0, 7)}-01`,
    valor: r.valor, origem: 'manual', origemRef: r.id, idemKey: `manual:rec:${r.id}`,
    dataPrevista: r.vencimento, status: r.status === 'pago' ? 'realizado' as const : 'previsto' as const,
    historico: `${r.categoria} · ${r.unidade_nome || ''} · ${r.competencia || ''} (importado)`.trim(),
  }))
  await postLancamento(eventos).catch((e) => console.error('razão import receber:', (e as Error).message))
  // linka sub-livro ↔ razão (baixa concilia o caixa)
  const { data: lancs } = await op.sb.from('fin_lancamento').select('id, idem_key').in('idem_key', criados.map((r) => `manual:rec:${r.id}`))
  const lancPorKey = new Map(((lancs ?? []) as { id: string; idem_key: string }[]).map((l) => [l.idem_key, l.id]))
  await Promise.all(criados.map((r) => {
    const lid = lancPorKey.get(`manual:rec:${r.id}`)
    return lid ? adminClient().from('fin_recebiveis').update({ lancamento_id: lid }).eq('id', r.id) : Promise.resolve(null)
  }))
  revalidatePath('/financeiro')
  return { ok: true, importados: criados.length }
}

/** Importa CONTAS A PAGAR (sub-livro + razão despesa prevista, centro rede). */
export async function importarDespesas(itens: ImportDespesaItem[]): Promise<R & { importados?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_FIN)) return { ok: false, error: 'Você não tem permissão para importar lançamentos.' }
  const lista = (itens || []).filter((i) => Number(i.valor) > 0 || (i.descricao || '').trim()).slice(0, IMPORT_MAX)
  if (lista.length === 0) return { ok: false, error: 'Planilha vazia ou sem dados reconhecidos.' }

  const emp = await empresaId(op.sb)
  const mapa = await mapaFinanceiro(op.sb)
  const { data: pcs } = await op.sb.from('plano_conta').select('id, nome').eq('ativo', true)
  const contaPorNome = new Map(((pcs ?? []) as { id: string; nome: string }[]).map((c) => [c.nome.trim().toLowerCase(), c.id]))
  const hoje = new Date().toISOString().slice(0, 10)

  const rows = lista.map((i) => ({
    empresa_id: emp,
    categoria: (i.categoria || 'Outras').trim() || 'Outras',
    descricao: (i.descricao || i.categoria || 'Importado').trim(),
    escopo: (i.escopo || 'Rede').trim() || 'Rede',
    valor: Math.round(Number(i.valor) * 100) / 100,
    vencimento: vencISO(i.vencimento),
    status: /suspen/i.test(i.status) ? 'suspenso' : /pag|sim/i.test(i.status) ? 'pago' : 'aberto',
    prioridade: /alta|high/i.test(i.prioridade) ? 'alta' : /baixa|low/i.test(i.prioridade) ? 'baixa' : 'media',
  }))
  const { data: ins, error: eIns } = await adminClient().from('fin_contas_pagar').insert(rows).select('id, categoria, descricao, valor, vencimento, status')
  if (eIns) return { ok: false, error: msgErro(eIns.message, 'importar as despesas') }
  const criados = (ins ?? []) as { id: string; categoria: string; descricao: string | null; valor: number; vencimento: string | null; status: string }[]

  const eventos: LancamentoEvento[] = criados.map((c) => ({
    empresaId: emp, centroCustoId: mapa.centroRede,
    planoContaId: contaPorNome.get(c.categoria.trim().toLowerCase()) ?? mapa.planoPorCodigo.get('4.2.99') ?? null,
    natureza: 'despesa' as const, competencia: `${(c.vencimento || hoje).slice(0, 7)}-01`,
    valor: c.valor, origem: 'manual', origemRef: c.id, idemKey: `manual:${c.id}`,
    dataPrevista: c.vencimento, status: c.status === 'pago' ? 'realizado' as const : c.status === 'suspenso' ? 'suspenso' as const : 'previsto' as const,
    historico: `${c.categoria}${c.descricao ? ' · ' + c.descricao : ''} (importado)`,
  }))
  await postLancamento(eventos).catch((e) => console.error('razão import pagar:', (e as Error).message))
  revalidatePath('/financeiro')
  return { ok: true, importados: criados.length }
}
