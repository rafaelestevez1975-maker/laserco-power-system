'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'
import { descLimitFor, CORTESIA_LIMIT_MES, FORMAS_PDV, inicioDoMes } from '@/lib/pdv'
import { inserirOSComNumero } from '@/lib/os-numero'

/**
 * PDV / Nova Venda (legacy/index.html: buildPdv 5835, pdvFinish 5877).
 * Finaliza uma venda de balcão criando uma OS já FECHADA (origem PDV) sobre o backend lkii,
 * com itens (os_servicos/os_produtos/os_pacotes), pagamento (os_pagamentos) e auditoria.
 *
 * Regras de negócio reais portadas do legado:
 *  - Alçada de desconto por papel (DESC_LIMIT) — bloqueia finalização sem aprovação do gestor.
 *  - Cortesia (desconto 100% → total 0): 1 por cliente + teto mensal por unidade (R$2000).
 *
 * Origem: o enum `os.origem` do lkii ainda não tem 'PDV' (CHECK = avulsa|agendamento|pacote|
 * assinatura|interna|multa_assinatura). Usamos 'avulsa' (balcão) e marcamos "[PDV]" na observação.
 * //TODO(needs-migration: adicionar 'PDV' ao CHECK os_origem e gravar origem='PDV').
 * NFS-e: não há tabela fiscal no lkii — registramos o pedido na observação.
 * //TODO(needs-table: nfse — emissão fiscal de fato).
 */

export type VendaKind = 'servico' | 'produto' | 'pacote'
export type ActionResult = { ok: boolean; error?: string; id?: string; numero?: number }

export type VendaItemInput = {
  kind: VendaKind
  refId: string
  nome: string // só p/ auditoria/observação
  preco: number
  quantidade: number
}

export type FinalizarVendaInput = {
  unidadeId: string
  clienteId?: string | null
  vendedorNome?: string | null
  itens: VendaItemInput[]
  descontoPct: number // 0–100
  forma: string // value de FORMAS_PDV
  parcelas: number
  emitirNfse: boolean
  observacao?: string | null
}

const TABELA: Record<VendaKind, { tabela: string; refCol: string }> = {
  servico: { tabela: 'os_servicos', refCol: 'servico_id' },
  produto: { tabela: 'os_produtos', refCol: 'produto_id' },
  pacote: { tabela: 'os_pacotes', refCol: 'pacote_id' },
}

const PAPEIS_VENDA = ['operacoes', 'gestor']
const r2 = (n: number) => Math.round(n * 100) / 100

export async function finalizarVenda(input: FinalizarVendaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!(ehAdmin(op.papel) || PAPEIS_VENDA.includes(op.papel))) {
    return { ok: false, error: 'Você não tem permissão para registrar vendas.' }
  }

  const unidadeId = (input.unidadeId || '').trim()
  if (!unidadeId) return { ok: false, error: 'Selecione uma unidade ativa para registrar a venda.' }

  // ── Itens ──
  const itens = (input.itens ?? []).filter((i) => i && i.refId && Number.isFinite(i.preco))
  if (itens.length === 0) return { ok: false, error: 'Adicione ao menos um item ao carrinho.' }
  for (const it of itens) {
    if (!TABELA[it.kind]) return { ok: false, error: 'Tipo de item inválido.' }
    if (it.preco < 0) return { ok: false, error: 'Preço não pode ser negativo.' }
    if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) return { ok: false, error: 'Quantidade inválida.' }
  }

  // ── Forma de pagamento ──
  const forma = FORMAS_PDV.find((f) => f.value === input.forma)
  if (!forma) return { ok: false, error: 'Forma de pagamento inválida.' }
  const parcelas = Number.isFinite(input.parcelas) && input.parcelas > 0 ? Math.min(12, Math.floor(input.parcelas)) : 1

  // ── Totais + alçada de desconto ──
  const subtotal = r2(itens.reduce((s, i) => s + i.preco * i.quantidade, 0))
  const pct = Math.max(0, Math.min(100, Number(input.descontoPct) || 0))
  const limite = descLimitFor(op.papel)
  if (pct > limite) {
    return { ok: false, error: `Desconto de ${pct}% acima da sua alçada (máx ${limite}%). Necessária aprovação do gestor.` }
  }
  const total = r2(subtotal * (1 - pct / 100))
  const descontoValor = r2(subtotal - total)

  // ── Cortesia (desconto 100% → total 0): 1 por cliente + teto mensal por unidade ──
  if (total <= 0 && subtotal > 0) {
    const clienteId = (input.clienteId || '').trim()
    if (clienteId) {
      // Limite de 1 cortesia por cliente (regra do legado): conta TODAS as cortesias do cliente
      // na unidade (sem gate de mês — é "1 por cliente", não "1 por mês"), via count exato.
      const { count, error: eCliente } = await op.sb
        .from('os')
        .select('id', { count: 'exact', head: true })
        .eq('unidade_id', unidadeId)
        .eq('cliente_id', clienteId)
        .eq('status', 'fechada')
        .eq('total', 0)
      if (eCliente) return { ok: false, error: msgErro(eCliente.message, 'validar cortesia do cliente') }
      if ((count ?? 0) > 0) {
        return { ok: false, error: 'Este cliente já recebeu uma sessão cortesia (limite de 1 por cliente).' }
      }
    }
    // Teto mensal: gate por `criado_em` (sempre preenchido) e não por `fechada_em` — cortesias
    // legadas/importadas sem `fechada_em` precisam contar, senão o teto da unidade é furado.
    // Mesma regra que alimenta o saldo exibido em pdv/page.tsx (precisam bater).
    const desde = inicioDoMes(new Date().toISOString())
    const { data: cortesias, error: eCortesias } = await op.sb
      .from('os')
      .select('total_bruto')
      .eq('unidade_id', unidadeId)
      .eq('status', 'fechada')
      .eq('total', 0)
      .gte('criado_em', desde)
    if (eCortesias) return { ok: false, error: msgErro(eCortesias.message, 'validar o teto de cortesias') }
    const usado = ((cortesias ?? []) as { total_bruto: number | null }[]).reduce((s, r) => s + (Number(r.total_bruto) || 0), 0)
    if (usado + subtotal > CORTESIA_LIMIT_MES) {
      const restante = Math.max(0, CORTESIA_LIMIT_MES - usado)
      return { ok: false, error: `Teto mensal de cortesias da unidade atingido (R$ ${CORTESIA_LIMIT_MES.toLocaleString('pt-BR')}). Restam R$ ${restante.toLocaleString('pt-BR')}.` }
    }
  }

  // ── Observação (marca PDV + vendedor + NFS-e) ──
  const obsPartes = ['[PDV]']
  if (input.vendedorNome?.trim()) obsPartes.push(`Vendedor(a): ${input.vendedorNome.trim()}`)
  if (input.emitirNfse) obsPartes.push('NFS-e solicitada')
  if (input.observacao?.trim()) obsPartes.push(input.observacao.trim())
  const observacao = obsPartes.join(' · ')

  // ── Cria a OS já fechada (numero max+1 com retry anti-corrida — sem sequence no lkii) ──
  const osNova = await inserirOSComNumero(op.sb, unidadeId, {
    cliente_id: (input.clienteId || '').trim() || null,
    status: 'fechada',
    origem: 'avulsa',
    observacao,
    criado_por: op.userId,
    fechada_em: new Date().toISOString(),
    preco_total: total,
    desconto_total: descontoValor,
    total_bruto: subtotal,
    total,
    valor_pago: total,
    valor_pendente: 0,
  })
  if ('error' in osNova) return { ok: false, error: msgErro(osNova.error, 'registrar a venda') }
  const osId = osNova.id
  const numero = osNova.numero

  // ── Itens (desconto distribuído proporcionalmente pelo % da venda) ──
  for (const it of itens) {
    const precoTotal = r2(it.preco * it.quantidade)
    const desconto = r2(precoTotal * (pct / 100))
    const cfg = TABELA[it.kind]
    const { error: eItem } = await op.sb.from(cfg.tabela).insert({
      os_id: osId,
      [cfg.refCol]: it.refId,
      quantidade: it.quantidade,
      preco: it.preco,
      preco_total: precoTotal,
      desconto,
      total: r2(precoTotal - desconto),
      payment_kind: 'full',
    })
    if (eItem) {
      // rollback best-effort: remove a OS órfã p/ não deixar venda sem itens.
      await op.sb.from('os').delete().eq('id', osId)
      return { ok: false, error: msgErro(eItem.message, `adicionar ${it.nome}`) }
    }
  }

  // ── Pagamento (só quando há valor a pagar; cortesia total 0 não gera pagamento) ──
  if (total > 0) {
    const { error: ePag } = await op.sb.from('os_pagamentos').insert({
      os_id: osId,
      data_pagamento: new Date().toISOString().slice(0, 10),
      tipo: 'pagamento',
      metodo: forma.metodo,
      parcelas_total: parcelas,
      parcela_atual: 1,
      valor: total,
      status: 'aprovado',
      criado_por: op.userId,
    })
    if (ePag) return { ok: false, error: msgErro(ePag.message, 'registrar o pagamento') }
  }

  // ── Auditoria (best-effort; não derruba a venda) ──
  try {
    const admin = adminClient()
    await admin.from('audit_log').insert({
      usuario_id: op.userId,
      acao: 'venda.pdv.finalizar',
      recurso_id: 'operacoes.os',
      recurso_uuid: osId,
      recurso_label: `Venda PDV · OS #${numero}`,
      dados_depois: {
        total, subtotal, descontoPct: pct, forma: forma.label, parcelas,
        itens: itens.length, nfse: input.emitirNfse, cortesia: total <= 0 && subtotal > 0,
      },
      origem: 'web',
      resultado: 'sucesso',
    })
  } catch {
    // auditoria é secundária
  }

  revalidatePath('/os')
  revalidatePath('/pdv')
  revalidatePath('/dashboards/vendas-geral')
  return { ok: true, id: osId, numero }
}
