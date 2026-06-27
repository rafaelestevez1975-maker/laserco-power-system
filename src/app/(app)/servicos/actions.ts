'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { PAGAR_COMISSAO_OPCOES, type PagarComissao } from '@/lib/catalogo'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * Catálogo de serviços é por EMPRESA (não tem escopo de unidade) — não aplicamos
 * scopeUnidade. RBAC: só gestor/admin_geral cria/edita/inativa.
 * Tabela `servicos`: id, empresa_id, nome, descricao, grupo, duracao_min,
 * preco_padrao, dynamic_price, comissionavel, ativo, bemp_id, criado_em, atualizado_em.
 */
const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

export type ServicoInput = {
  nome: string
  grupo?: string | null
  descricao?: string | null
  duracao_min?: number | null
  preco_padrao?: number | null
  desc_max?: number | null // legado SERVICOS[2] — desconto máximo (%)
  pagar_comissao?: PagarComissao // legado SERVICOS[7]
  comissionavel?: boolean
  dynamic_price?: boolean
  ativo?: boolean
}

/** Validação por campo compartilhada (criar/editar). Retorna msg de erro ou null. */
function validar(input: ServicoInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do serviço.'
  if (nome.length < 2) return 'Nome muito curto.'

  const preco = input.preco_padrao
  if (preco != null) {
    if (!Number.isFinite(preco)) return 'Preço inválido.'
    if (preco < 0) return 'O preço não pode ser negativo.'
  }
  const dur = input.duracao_min
  if (dur != null) {
    if (!Number.isInteger(dur)) return 'Duração deve ser em minutos inteiros.'
    if (dur < 0) return 'A duração não pode ser negativa.'
    if (dur > 1440) return 'Duração muito longa (máx. 24h).'
  }
  const dm = input.desc_max
  if (dm != null) {
    if (!Number.isFinite(dm)) return 'Desconto máximo inválido.'
    if (dm < 0 || dm > 100) return 'O desconto máximo deve estar entre 0% e 100%.'
  }
  if (input.pagar_comissao != null && !PAGAR_COMISSAO_OPCOES.includes(input.pagar_comissao)) {
    return 'Opção de "Pagar comissão" inválida.'
  }
  return null
}

/** Monta o payload normalizado a partir do input (campos opcionais → null/false). */
function payload(input: ServicoInput) {
  return {
    nome: (input.nome || '').trim(),
    grupo: (input.grupo || '').trim() || null,
    descricao: (input.descricao || '').trim() || null,
    duracao_min: input.duracao_min != null ? input.duracao_min : 30, // NOT NULL no banco (default 30)
    preco_padrao: input.preco_padrao != null ? input.preco_padrao : 0,
    desc_max: input.desc_max != null ? input.desc_max : 0,
    pagar_comissao: input.pagar_comissao ?? 'Execução', // legado normaliza vazio → 'Execução'
    comissionavel: !!input.comissionavel,
    dynamic_price: !!input.dynamic_price,
    ativo: input.ativo !== false,
  }
}

/** Cria um serviço no catálogo. RBAC: gestor/admin. */
export async function criarServico(input: ServicoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar serviços.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { data, error: e } = await op.sb
    .from('servicos')
    .insert({ ...payload(input) })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar serviço') }
  revalidatePath('/servicos')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita os dados de um serviço. RBAC: gestor/admin. */
export async function salvarServico(id: string, input: ServicoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar serviços.' }
  if (!id) return { ok: false, error: 'Serviço inválido.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { error: e } = await op.sb
    .from('servicos')
    .update({ ...payload(input), atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'salvar serviço') }
  revalidatePath('/servicos')
  return { ok: true }
}

/** Liga/desliga (soft) um serviço. RBAC: gestor/admin. */
export async function toggleServicoAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar serviços.' }
  if (!id) return { ok: false, error: 'Serviço inválido.' }

  const { error: e } = await op.sb
    .from('servicos')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar serviço' : 'inativar serviço') }
  revalidatePath('/servicos')
  return { ok: true }
}

/**
 * Renomeia um "grupo de serviços" — não existe tabela de grupos (404 nas tentativas
 * de introspecção): grupo é só o valor textual em servicos.grupo. Renomear = update em
 * massa de todos os serviços daquele grupo. RBAC: gestor/admin.
 */
export async function renomearGrupo(de: string, para: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar grupos.' }

  const origem = (de || '').trim()
  const destino = (para || '').trim()
  if (!origem) return { ok: false, error: 'Grupo de origem inválido.' }
  if (!destino) return { ok: false, error: 'Informe o novo nome do grupo.' }
  if (origem === destino) return { ok: false, error: 'O novo nome é igual ao atual.' }

  const { error: e } = await op.sb
    .from('servicos')
    .update({ grupo: destino, atualizado_em: new Date().toISOString() })
    .eq('grupo', origem)

  if (e) return { ok: false, error: msgErro(e.message, 'renomear grupo') }
  revalidatePath('/servicos')
  return { ok: true }
}

// "Pagar comissão" (timing Venda/Execução/Não pagar — comTag do legado) e "Desc. Máx (%)"
// agora persistem nas colunas servicos.pagar_comissao / servicos.desc_max (migration catalogo.sql).
// Pendente ainda: "preço por unidade" (matriz de preços por unidade) — depende de tabela própria
// inexistente no backend lkii; dynamic_price segue como flag.
