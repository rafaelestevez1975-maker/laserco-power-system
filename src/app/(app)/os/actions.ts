'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, scopeUnidade } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { inserirOSComNumero } from '@/lib/os-numero'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * ORDENS DE SERVIÇO (backend lkii). Tabelas reais:
 *   os(id, numero, empresa_id, unidade_id, cliente_id, agendamento_id, status[aberta|fechada|cancelada],
 *      origem[avulsa|agendamento|pacote|assinatura|interna|multa_assinatura], preco_total, desconto_total,
 *      total_bruto, total_pago_credito, total, valor_pago, valor_pendente, observacao, criado_por,
 *      criado_em, fechada_em, cancelada_em)
 *   os_servicos / os_produtos / os_pacotes(os_id, <ref>_id, profissional_id, quantidade, preco, preco_total,
 *      desconto, total, payment_kind, criado_em)
 *   os_pagamentos(os_id, data_pagamento, tipo, metodo, parcelas_total, parcela_atual, valor, status, criado_por, criado_em)
 *
 * `numero` é NOT NULL e SEM default  geramos (max(numero)+1 escopado por unidade).
 * `unidade_id` é NOT NULL  uma OS sempre pertence a uma unidade (exige unidade ativa).
 *
 * RBAC: só operacoes/gestor/admin abrem, editam itens, finalizam ou cancelam OS.
 * Multitenant: scopeUnidade por activeUnitId em todas as escritas/consultas.
 */
const PAPEIS_ESCRITA = ['operacoes', 'gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

// ───────────────────────────────────────── Abrir OS ─────────────────────────────────────────

export type NovaOSInput = {
  unidadeId: string
  clienteId?: string | null
  origem?: string | null
  observacao?: string | null
}

const ORIGENS = ['avulsa', 'agendamento', 'pacote', 'assinatura', 'interna', 'multa_assinatura']

/**
 * Abre uma nova OS (status 'aberta'). Gera o próximo `numero` para a unidade.
 * Não persiste itens aqui  os itens entram via adicionarItem após a criação.
 */
export async function abrirOS(input: NovaOSInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para abrir ordens de serviço.' }

  const unidadeId = (input.unidadeId || '').trim()
  if (!unidadeId) return { ok: false, error: 'Selecione uma unidade ativa para abrir a OS.' }

  const origem = (input.origem || 'avulsa').trim()
  if (!ORIGENS.includes(origem)) return { ok: false, error: 'Origem inválida.' }

  // Próximo número: max(numero) na unidade + 1 (escopo multitenant). Sem sequence no backend.
  // Sob concorrência, dois abrirOS na mesma unidade podem ler o mesmo max → numero duplicado.
  // Mitigação: insere de forma otimista e, se colidir (unique violation 23505), recomputa e tenta de novo.
  const novo = await inserirOSComNumero(op.sb, unidadeId, {
    cliente_id: (input.clienteId || '').trim() || null,
    status: 'aberta',
    origem,
    observacao: (input.observacao || '').trim() || null,
    criado_por: op.userId,
  })
  if ('error' in novo) return { ok: false, error: msgErro(novo.error, 'abrir OS') }
  revalidatePath('/os')
  return { ok: true, id: novo.id }
}

// ─────────────────────────────────────── Itens da OS ────────────────────────────────────────

export type ItemKind = 'servico' | 'produto' | 'pacote'

export type ItemInput = {
  osId: string
  kind: ItemKind
  refId: string // servico_id | produto_id | pacote_id
  quantidade?: number | null
  preco?: number | null
  desconto?: number | null
  profissionalId?: string | null
}

const TABELA: Record<ItemKind, { tabela: string; refCol: string }> = {
  servico: { tabela: 'os_servicos', refCol: 'servico_id' },
  produto: { tabela: 'os_produtos', refCol: 'produto_id' },
  pacote: { tabela: 'os_pacotes', refCol: 'pacote_id' },
}

/** Garante que a OS existe, é da unidade ativa e está aberta. Retorna a OS ou erro. */
async function carregarOSAberta(
  op: NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>,
  osId: string,
  activeUnitId: string | null,
): Promise<{ os: { id: string; status: string; unidade_id: string } } | { error: string }> {
  if (!osId) return { error: 'OS inválida.' }
  let q = op.sb.from('os').select('id, status, unidade_id').eq('id', osId)
  q = scopeUnidade(q, activeUnitId)
  const { data, error } = await q.maybeSingle()
  if (error) return { error: msgErro(error.message, 'carregar OS') }
  const os = data as { id: string; status: string; unidade_id: string } | null
  if (!os) return { error: 'OS não encontrada nesta unidade.' }
  if (os.status !== 'aberta') return { error: 'Só é possível alterar itens de uma OS aberta.' }
  return { os }
}

/** Recalcula e persiste os totais da OS a partir das tabelas filhas. */
async function recalcularTotais(
  op: NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>,
  osId: string,
): Promise<void> {
  let bruto = 0
  let desconto = 0
  for (const k of Object.values(TABELA)) {
    const { data } = await op.sb.from(k.tabela).select('preco_total, desconto, total').eq('os_id', osId)
    for (const r of (data ?? []) as { preco_total: number | null; desconto: number | null; total: number | null }[]) {
      bruto += Number(r.preco_total) || 0
      desconto += Number(r.desconto) || 0
    }
  }
  const total = Math.max(0, bruto - desconto)

  // Pagamentos aprovados → valor_pago.
  const { data: pagos } = await op.sb
    .from('os_pagamentos')
    .select('valor, status')
    .eq('os_id', osId)
    .eq('status', 'aprovado')
  const valorPago = ((pagos ?? []) as { valor: number | null }[]).reduce((s, p) => s + (Number(p.valor) || 0), 0)

  await op.sb
    .from('os')
    .update({
      preco_total: total,
      desconto_total: desconto,
      total_bruto: bruto,
      total,
      valor_pago: valorPago,
      valor_pendente: Math.max(0, total - valorPago),
    })
    .eq('id', osId)
}

/** Adiciona um item (serviço/produto/pacote) à OS aberta e recalcula totais. */
export async function adicionarItem(input: ItemInput, activeUnitId: string | null): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar itens da OS.' }

  const guard = await carregarOSAberta(op, input.osId, activeUnitId)
  if ('error' in guard) return { ok: false, error: guard.error }

  const refId = (input.refId || '').trim()
  if (!refId) return { ok: false, error: 'Selecione um item para adicionar.' }

  const qtd = input.quantidade != null && Number.isFinite(input.quantidade) ? input.quantidade : 1
  if (qtd <= 0) return { ok: false, error: 'A quantidade deve ser maior que zero.' }

  const preco = input.preco != null && Number.isFinite(input.preco) ? input.preco : 0
  if (preco < 0) return { ok: false, error: 'O preço não pode ser negativo.' }

  const desconto = input.desconto != null && Number.isFinite(input.desconto) ? input.desconto : 0
  if (desconto < 0) return { ok: false, error: 'O desconto não pode ser negativo.' }

  const precoTotal = preco * qtd
  if (desconto > precoTotal) return { ok: false, error: 'O desconto não pode ser maior que o subtotal.' }
  const total = Math.max(0, precoTotal - desconto)

  const cfg = TABELA[input.kind]
  const { error: e } = await op.sb.from(cfg.tabela).insert({
    os_id: input.osId,
    [cfg.refCol]: refId,
    profissional_id: (input.profissionalId || '').trim() || null,
    quantidade: qtd,
    preco,
    preco_total: precoTotal,
    desconto,
    total,
    payment_kind: 'full',
  })
  if (e) return { ok: false, error: msgErro(e.message, 'adicionar item') }

  await recalcularTotais(op, input.osId)
  revalidatePath('/os')
  return { ok: true }
}

/** Remove um item da OS aberta e recalcula totais. */
export async function removerItem(
  kind: ItemKind,
  itemId: string,
  osId: string,
  activeUnitId: string | null,
): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar itens da OS.' }

  const guard = await carregarOSAberta(op, osId, activeUnitId)
  if ('error' in guard) return { ok: false, error: guard.error }
  if (!itemId) return { ok: false, error: 'Item inválido.' }

  const cfg = TABELA[kind]
  const { error: e } = await op.sb.from(cfg.tabela).delete().eq('id', itemId).eq('os_id', osId)
  if (e) return { ok: false, error: msgErro(e.message, 'remover item') }

  await recalcularTotais(op, osId)
  revalidatePath('/os')
  return { ok: true }
}

// ──────────────────────────────────── Finalizar / Cancelar ──────────────────────────────────

/** Finaliza (fecha) a OS. Marca status 'fechada' + fechada_em. RBAC: operacoes/gestor/admin. */
export async function finalizarOS(osId: string, activeUnitId: string | null): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para finalizar ordens de serviço.' }

  const guard = await carregarOSAberta(op, osId, activeUnitId)
  if ('error' in guard) return { ok: false, error: guard.error }

  // TODO(legado: buildOS): bloqueio de finalização até contrato assinado (osEhVenda → contrato).
  // O legado exige assinatura digital do contrato antes de fechar OS de venda; não há tabela de
  // contratos/assinaturas no lkii ainda. //TODO(needs-table: os_contratos)

  const { error: e } = await op.sb
    .from('os')
    .update({ status: 'fechada', fechada_em: new Date().toISOString() })
    .eq('id', osId)
  if (e) return { ok: false, error: msgErro(e.message, 'finalizar OS') }
  revalidatePath('/os')
  return { ok: true }
}

/** Cancela a OS. Marca status 'cancelada' + cancelada_em. RBAC: operacoes/gestor/admin. */
export async function cancelarOS(osId: string, activeUnitId: string | null): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cancelar ordens de serviço.' }
  if (!osId) return { ok: false, error: 'OS inválida.' }

  let q = op.sb.from('os').select('id, status').eq('id', osId)
  q = scopeUnidade(q, activeUnitId)
  const { data } = await q.maybeSingle()
  const os = data as { id: string; status: string } | null
  if (!os) return { ok: false, error: 'OS não encontrada nesta unidade.' }
  if (os.status === 'cancelada') return { ok: false, error: 'Esta OS já está cancelada.' }
  if (os.status === 'fechada') return { ok: false, error: 'Não é possível cancelar uma OS já fechada.' }

  const { error: e } = await op.sb
    .from('os')
    .update({ status: 'cancelada', cancelada_em: new Date().toISOString() })
    .eq('id', osId)
  if (e) return { ok: false, error: msgErro(e.message, 'cancelar OS') }
  revalidatePath('/os')
  return { ok: true }
}

// ──────────────────────────────────────── Pagamentos ────────────────────────────────────────

export type PagamentoInput = {
  osId: string
  metodo: string
  valor: number
  parcelasTotal?: number | null
}

const METODOS = ['dinheiro', 'cartao_credito', 'cartao_debito', 'cheque', 'credito_recorrente', 'cartao_presente', 'assinatura', 'pix', 'outros']

/** Registra um pagamento aprovado na OS e recalcula valor_pago/valor_pendente. */
export async function registrarPagamento(input: PagamentoInput, activeUnitId: string | null): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para registrar pagamentos.' }

  if (!input.osId) return { ok: false, error: 'OS inválida.' }
  if (!METODOS.includes(input.metodo)) return { ok: false, error: 'Método de pagamento inválido.' }
  if (!Number.isFinite(input.valor) || input.valor <= 0) return { ok: false, error: 'Informe um valor de pagamento válido.' }

  // OS precisa existir na unidade (pode estar aberta ou fechada  pagamento pós-fechamento é válido).
  let q = op.sb.from('os').select('id, status').eq('id', input.osId)
  q = scopeUnidade(q, activeUnitId)
  const { data } = await q.maybeSingle()
  const os = data as { id: string; status: string } | null
  if (!os) return { ok: false, error: 'OS não encontrada nesta unidade.' }
  if (os.status === 'cancelada') return { ok: false, error: 'OS cancelada não recebe pagamentos.' }

  const parcelas = input.parcelasTotal != null && input.parcelasTotal > 0 ? Math.floor(input.parcelasTotal) : 1

  const { error: e } = await op.sb.from('os_pagamentos').insert({
    os_id: input.osId,
    data_pagamento: new Date().toISOString().slice(0, 10),
    tipo: 'pagamento', // CHECK os_pagamentos_tipo só aceita pagamento|parcela_recorrente|mensalidade
    metodo: input.metodo,
    parcelas_total: parcelas,
    parcela_atual: 1,
    valor: input.valor,
    status: 'aprovado',
    criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'registrar pagamento') }

  await recalcularTotais(op, input.osId)
  revalidatePath('/os')
  return { ok: true }
}

// ─────────────────────────────────── Detalhe da OS (read) ───────────────────────────────────

export type OsItemDetalhe = {
  id: string
  kind: ItemKind
  nome: string
  quantidade: number
  preco: number
  desconto: number
  total: number
  profissionalNome: string | null
}

export type OsPagamentoDetalhe = {
  id: string
  data: string | null
  metodo: string | null
  valor: number
  status: string | null
  parcelas: number | null
}

export type OsDetalhe = {
  itens: OsItemDetalhe[]
  pagamentos: OsPagamentoDetalhe[]
}

/** Carrega itens (serviços/produtos/pacotes) + pagamentos de uma OS para o modal de detalhe. */
export async function carregarDetalheOS(osId: string, activeUnitId: string | null): Promise<{ ok: true; data: OsDetalhe } | { ok: false; error: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }
  if (!osId) return { ok: false, error: 'OS inválida.' }

  // Confirma que a OS é visível na unidade ativa (multitenant).
  let q = op.sb.from('os').select('id').eq('id', osId)
  q = scopeUnidade(q, activeUnitId)
  const { data: osRow } = await q.maybeSingle()
  if (!osRow) return { ok: false, error: 'OS não encontrada nesta unidade.' }

  const itens: OsItemDetalhe[] = []

  const { data: servs } = await op.sb
    .from('os_servicos')
    .select('id, quantidade, preco, desconto, total, servico:servicos(nome), profissional:perfis_usuario!os_servicos_profissional_id_fkey(nome_completo)')
    .eq('os_id', osId)
  for (const r of (servs ?? []) as Array<Record<string, unknown>>) {
    itens.push(mapItem(r, 'servico', 'servico'))
  }

  const { data: prods } = await op.sb
    .from('os_produtos')
    .select('id, quantidade, preco, desconto, total, produto:produtos(nome), profissional:perfis_usuario!os_produtos_profissional_id_fkey(nome_completo)')
    .eq('os_id', osId)
  for (const r of (prods ?? []) as Array<Record<string, unknown>>) {
    itens.push(mapItem(r, 'produto', 'produto'))
  }

  const { data: pacs } = await op.sb
    .from('os_pacotes')
    .select('id, quantidade, preco, desconto, total, pacote:pacotes(nome), profissional:perfis_usuario!os_pacotes_profissional_id_fkey(nome_completo)')
    .eq('os_id', osId)
  for (const r of (pacs ?? []) as Array<Record<string, unknown>>) {
    itens.push(mapItem(r, 'pacote', 'pacote'))
  }

  const { data: pags } = await op.sb
    .from('os_pagamentos')
    .select('id, data_pagamento, metodo, valor, status, parcelas_total')
    .eq('os_id', osId)
    .order('criado_em', { ascending: true })
  const pagamentos: OsPagamentoDetalhe[] = ((pags ?? []) as Array<Record<string, unknown>>).map((p) => ({
    id: String(p.id),
    data: (p.data_pagamento as string) ?? null,
    metodo: (p.metodo as string) ?? null,
    valor: Number(p.valor) || 0,
    status: (p.status as string) ?? null,
    parcelas: (p.parcelas_total as number) ?? null,
  }))

  return { ok: true, data: { itens, pagamentos } }
}

/** Normaliza o embed (objeto ou array) e monta um OsItemDetalhe. */
function mapItem(r: Record<string, unknown>, kind: ItemKind, embedKey: string): OsItemDetalhe {
  const refEmbed = r[embedKey] as { nome?: string } | { nome?: string }[] | null | undefined
  const ref = Array.isArray(refEmbed) ? refEmbed[0] : refEmbed
  const profEmbed = r.profissional as { nome_completo?: string } | { nome_completo?: string }[] | null | undefined
  const prof = Array.isArray(profEmbed) ? profEmbed[0] : profEmbed
  return {
    id: String(r.id),
    kind,
    nome: ref?.nome || '(item)',
    quantidade: Number(r.quantidade) || 0,
    preco: Number(r.preco) || 0,
    desconto: Number(r.desconto) || 0,
    total: Number(r.total) || 0,
    profissionalNome: prof?.nome_completo ?? null,
  }
}

// TODO(legado: buildOS): origem real (Agenda/Pacote/Balcão) ligando agendamento_id e os_pacotes a
// fluxos de PDV; bloqueio até contrato assinado (needs-table: os_contratos); integração com o caixa
// (sessoes_caixa.id já existe em os_pagamentos) e impressão da OS.
