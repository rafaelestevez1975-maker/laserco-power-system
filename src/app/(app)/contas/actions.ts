'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string }

/** Papéis com permissão de escrita no contas a pagar/receber da unidade.
 *  admin_geral sempre passa (via requireOperador + ehAdmin). */
const PAPEIS_ESCRITA = ['financeiro', 'gestor']

/** Pode lançar/baixar/editar contas? (admin_geral, financeiro ou gestor). */
function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

export type NovoLancamentoInput = {
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number | null
  categoria_id: string
  data_vencimento: string // YYYY-MM-DD
  data_competencia?: string | null
  status?: 'pago' | 'pendente'
  forma_pagamento?: string | null
  fornecedor?: string | null // legado: campo "Fornecedor" (view-contas)
  observacao?: string | null
  unidade_id: string | null // unidade ativa (escopo)
}

/** Cria um lançamento (conta a pagar=despesa / a receber=receita) na unidade ativa.
 *  Validação por campo + RBAC + escopo multitenant. */
export async function novoLancamento(input: NovoLancamentoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para criar lançamentos.' }

  // ── Validação por campo ──
  if (input.tipo !== 'receita' && input.tipo !== 'despesa') return { ok: false, error: 'Tipo inválido.' }
  const descricao = (input.descricao || '').trim()
  if (!descricao) return { ok: false, error: 'Informe a descrição.' }
  const valor = Number(input.valor)
  if (!input.valor && input.valor !== 0) return { ok: false, error: 'Informe o valor.' }
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'O valor deve ser maior que zero.' }
  if (!input.categoria_id) return { ok: false, error: 'Selecione a categoria.' }
  if (!input.data_vencimento) return { ok: false, error: 'Informe a data de vencimento.' }
  if (isNaN(new Date(input.data_vencimento).getTime())) return { ok: false, error: 'Data de vencimento inválida.' }
  if (!input.unidade_id) return { ok: false, error: 'Selecione a unidade ativa no topo antes de lançar.' }

  // A categoria precisa existir, aceitar lançamentos e bater com o tipo da aba.
  const { data: catRaw } = await op.sb
    .from('plano_contas')
    .select('id, tipo, aceita_lancamentos, ativo')
    .eq('id', input.categoria_id)
    .maybeSingle()
  const cat = catRaw as { tipo?: string; aceita_lancamentos?: boolean; ativo?: boolean } | null
  if (!cat) return { ok: false, error: 'Categoria não encontrada.' }
  if (cat.ativo === false) return { ok: false, error: 'Categoria inativa.' }
  if (cat.aceita_lancamentos === false) return { ok: false, error: 'Esta categoria é um grupo e não aceita lançamentos. Escolha uma subcategoria.' }
  if (cat.tipo !== input.tipo) return { ok: false, error: 'A categoria não corresponde ao tipo (pagar/receber).' }

  // empresa_id vem da unidade ativa (consistente com o padrão do CRM).
  const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id ?? null

  const status = input.status === 'pago' ? 'pago' : 'pendente'
  const hoje = new Date().toISOString().slice(0, 10)

  const { error: e } = await op.sb.from('lancamentos_financeiros').insert({
    empresa_id,
    unidade_id: input.unidade_id,
    tipo: input.tipo,
    categoria_id: input.categoria_id,
    descricao,
    valor,
    data_competencia: input.data_competencia || input.data_vencimento,
    data_vencimento: input.data_vencimento,
    data_pagamento: status === 'pago' ? hoje : null,
    status,
    forma_pagamento: input.forma_pagamento?.trim() || null,
    fornecedor: input.fornecedor?.trim() || null,
    observacao: input.observacao?.trim() || null,
    origem: 'manual',
    criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'criar lançamento') }

  revalidatePath('/contas')
  return { ok: true }
}

/** Dá baixa / registra pagamento: marca status=pago + data_pagamento=hoje.
 *  Serve tanto p/ "Dar baixa" (despesa) quanto "Registrar recebimento" (receita). */
export async function registrarPagamento(lancamentoId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para dar baixa.' }
  if (!lancamentoId) return { ok: false, error: 'Lançamento inválido.' }

  const { data: lf, error: e0 } = await op.sb
    .from('lancamentos_financeiros')
    .select('status')
    .eq('id', lancamentoId)
    .maybeSingle()
  const l = lf as { status?: string } | null
  if (e0 || !l) return { ok: false, error: 'Lançamento não encontrado.' }
  if (l.status === 'pago') return { ok: false, error: 'Este lançamento já está pago.' }

  const { error: e } = await op.sb
    .from('lancamentos_financeiros')
    .update({ status: 'pago', data_pagamento: new Date().toISOString().slice(0, 10) })
    .eq('id', lancamentoId)
  if (e) return { ok: false, error: msgErro(e.message, 'dar baixa no lançamento') }

  revalidatePath('/contas')
  return { ok: true }
}

export type EditarLancamentoInput = {
  id: string
  descricao: string
  valor: number | null
  categoria_id: string
  data_vencimento: string
  forma_pagamento?: string | null
  fornecedor?: string | null
  observacao?: string | null
  tipo: 'receita' | 'despesa'
}

/** Edita um lançamento existente (descrição, valor, categoria, vencimento). */
export async function editarLancamento(input: EditarLancamentoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar lançamentos.' }
  if (!input.id) return { ok: false, error: 'Lançamento inválido.' }

  const descricao = (input.descricao || '').trim()
  if (!descricao) return { ok: false, error: 'Informe a descrição.' }
  const valor = Number(input.valor)
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, error: 'O valor deve ser maior que zero.' }
  if (!input.categoria_id) return { ok: false, error: 'Selecione a categoria.' }
  if (!input.data_vencimento || isNaN(new Date(input.data_vencimento).getTime())) return { ok: false, error: 'Data de vencimento inválida.' }

  const { data: catRaw } = await op.sb
    .from('plano_contas')
    .select('tipo, aceita_lancamentos, ativo')
    .eq('id', input.categoria_id)
    .maybeSingle()
  const cat = catRaw as { tipo?: string; aceita_lancamentos?: boolean; ativo?: boolean } | null
  if (!cat) return { ok: false, error: 'Categoria não encontrada.' }
  if (cat.aceita_lancamentos === false) return { ok: false, error: 'Esta categoria é um grupo e não aceita lançamentos.' }
  if (cat.tipo !== input.tipo) return { ok: false, error: 'A categoria não corresponde ao tipo (pagar/receber).' }

  const { error: e } = await op.sb
    .from('lancamentos_financeiros')
    .update({
      descricao,
      valor,
      categoria_id: input.categoria_id,
      data_vencimento: input.data_vencimento,
      forma_pagamento: input.forma_pagamento?.trim() || null,
      fornecedor: input.fornecedor?.trim() || null,
      observacao: input.observacao?.trim() || null,
    })
    .eq('id', input.id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar lançamento') }

  revalidatePath('/contas')
  return { ok: true }
}

// TODO(legado): buildContas  importação de lançamentos via Excel (Import Excel).
//   Requer parse de planilha + de-para de categorias; deixado para depois.
