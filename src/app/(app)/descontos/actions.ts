'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

const PAPEIS_GESTAO = ['financeiro', 'gestor']
function podeGerir(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_GESTAO.includes(papel || '')
}

// Tipos suportados de desconto (schema real: coluna `tipo` é texto livre; padronizamos aqui).
export const TIPOS_DESCONTO = ['percentual', 'valor'] as const
export type TipoDesconto = (typeof TIPOS_DESCONTO)[number]

export type DescontoInput = {
  nome: string
  tipo: TipoDesconto
  valor: number | null
  ativo: boolean
}

/** Valida nome/tipo/valor de um desconto. Retorna mensagem de erro ou null. */
function validar(input: DescontoInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do desconto/parceria.'
  if (nome.length > 120) return 'Nome muito longo (máx. 120).'
  if (!TIPOS_DESCONTO.includes(input.tipo)) return 'Tipo inválido.'
  const valor = Number(input.valor)
  if (input.valor == null || !Number.isFinite(valor)) return 'Informe um valor numérico.'
  if (valor <= 0) return 'O valor deve ser maior que zero.'
  if (input.tipo === 'percentual' && valor > 100) return 'Percentual não pode passar de 100%.'
  return null
}

/** Cria um desconto/parceria. RBAC: financeiro/gestor/admin. */
export async function criarDesconto(input: DescontoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerir(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir descontos.' }

  const erro = validar(input)
  if (erro) return { ok: false, error: erro }

  const { data: ins, error: e } = await op.sb
    .from('descontos')
    .insert({
      nome: input.nome.trim(),
      tipo: input.tipo,
      valor: Number(input.valor),
      ativo: !!input.ativo,
    })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar desconto') }

  revalidatePath('/descontos')
  return { ok: true, id: (ins as { id?: string } | null)?.id }
}

export type EditarDescontoInput = DescontoInput & { id: string }

/** Edita um desconto/parceria existente. */
export async function editarDesconto(input: EditarDescontoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerir(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir descontos.' }
  if (!input.id) return { ok: false, error: 'Desconto inválido.' }

  const erro = validar(input)
  if (erro) return { ok: false, error: erro }

  const { error: e } = await op.sb
    .from('descontos')
    .update({ nome: input.nome.trim(), tipo: input.tipo, valor: Number(input.valor), ativo: !!input.ativo })
    .eq('id', input.id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar desconto') }

  revalidatePath('/descontos')
  return { ok: true }
}

/** Ativa/inativa um desconto. */
export async function alternarAtivoDesconto(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerir(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir descontos.' }
  if (!id) return { ok: false, error: 'Desconto inválido.' }

  const { error: e } = await op.sb.from('descontos').update({ ativo }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar desconto' : 'inativar desconto') }

  revalidatePath('/descontos')
  return { ok: true }
}

// TODO(legado: buildDescontos): vincular parceria a unidade, contato/validade e
//   regra de aplicação (Todos/Pacotes). O schema atual de `descontos` só tem
//   nome/tipo/valor/ativo — campos de parceria (contato, validade, unidade, aplica)
//   ficam pendentes de evolução do schema.
