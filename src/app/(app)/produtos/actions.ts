'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * Catálogo de produtos é por EMPRESA (não escopamos por unidade, mesmo a tabela tendo
 * unidade_id  o catálogo é compartilhado). RBAC: só gestor/admin_geral cria/edita/inativa.
 * Tabela `produtos` (vazia no momento, mas o CRUD está pronto): id, empresa_id, unidade_id,
 * nome, descricao, grupo, preco_padrao, custo, estoque_atual, estoque_minimo,
 * default_product, feedstock, ativo, bemp_id, criado_em, atualizado_em.
 */
const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

export type ProdutoInput = {
  nome: string
  grupo?: string | null
  descricao?: string | null
  preco_padrao?: number | null
  desc_max?: number | null // legado PRODUTOS[2]  desconto máximo (%)
  custo?: number | null
  estoque_atual?: number | null
  estoque_minimo?: number | null
  feedstock?: boolean // legado coluna "Insumo"
  ativo?: boolean
}

/** Validação por campo compartilhada (criar/editar). Retorna msg de erro ou null. */
function validar(input: ProdutoInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do produto.'
  if (nome.length < 2) return 'Nome muito curto.'

  const checarValor = (v: number | null | undefined, rotulo: string): string | null => {
    if (v == null) return null
    if (!Number.isFinite(v)) return `${rotulo} inválido.`
    if (v < 0) return `${rotulo} não pode ser negativo.`
    return null
  }
  const checarInteiro = (v: number | null | undefined, rotulo: string): string | null => {
    if (v == null) return null
    if (!Number.isInteger(v)) return `${rotulo} deve ser inteiro.`
    if (v < 0) return `${rotulo} não pode ser negativo.`
    return null
  }

  const dm = input.desc_max
  if (dm != null && (!Number.isFinite(dm) || dm < 0 || dm > 100)) {
    return 'O desconto máximo deve estar entre 0% e 100%.'
  }

  return (
    checarValor(input.preco_padrao, 'Preço') ||
    checarValor(input.custo, 'Custo') ||
    checarInteiro(input.estoque_atual, 'Estoque atual') ||
    checarInteiro(input.estoque_minimo, 'Estoque mínimo')
  )
}

function payload(input: ProdutoInput) {
  return {
    nome: (input.nome || '').trim(),
    grupo: (input.grupo || '').trim() || null,
    descricao: (input.descricao || '').trim() || null,
    preco_padrao: input.preco_padrao != null ? input.preco_padrao : 0,
    desc_max: input.desc_max != null ? input.desc_max : 0,
    custo: input.custo != null ? input.custo : null,
    estoque_atual: input.estoque_atual != null ? input.estoque_atual : 0,
    estoque_minimo: input.estoque_minimo != null ? input.estoque_minimo : 0,
    feedstock: !!input.feedstock,
    ativo: input.ativo !== false,
  }
}

/** Cria um produto no catálogo. RBAC: gestor/admin. */
export async function criarProduto(input: ProdutoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar produtos.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { data, error: e } = await op.sb
    .from('produtos')
    .insert({ ...payload(input) })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar produto') }
  revalidatePath('/produtos')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita os dados de um produto. RBAC: gestor/admin. */
export async function salvarProduto(id: string, input: ProdutoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar produtos.' }
  if (!id) return { ok: false, error: 'Produto inválido.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { error: e } = await op.sb
    .from('produtos')
    .update({ ...payload(input), atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'salvar produto') }
  revalidatePath('/produtos')
  return { ok: true }
}

/** Liga/desliga (soft) um produto. RBAC: gestor/admin. */
export async function toggleProdutoAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar produtos.' }
  if (!id) return { ok: false, error: 'Produto inválido.' }

  const { error: e } = await op.sb
    .from('produtos')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar produto' : 'inativar produto') }
  revalidatePath('/produtos')
  return { ok: true }
}

// "Desc. Máx (%)" (PRODUTOS[2]) e "Insumo" (coluna feedstock) agora persistem (migration
// catalogo.sql expõe desc_max e garante feedstock).
// TODO(legado: buildProdutos): movimentação de estoque (entrada/saída com histórico) e
// consumo automático por serviço (default_product no schema). Precisa de tabela de movimentos
// de estoque ainda inexistente no backend lkii.
