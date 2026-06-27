'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/** Papéis com permissão de escrita no plano de contas (categorias).
 *  admin_geral sempre passa (via requireOperador + ehAdmin). */
const PAPEIS_GESTAO = ['financeiro', 'gestor']

/** Pode criar/editar/(in)ativar categorias? (admin_geral, financeiro ou gestor). */
function podeGerir(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_GESTAO.includes(papel || '')
}

/** A categoria pertence a este tipo (despesa/receita) e revalida a rota certa. */
type Tipo = 'despesa' | 'receita'
function rotaDe(tipo: Tipo): string {
  return tipo === 'despesa' ? '/catpag' : '/catrec'
}

export type NovaCategoriaInput = {
  tipo: Tipo
  nome: string
  parent_id: string | null // grupo pai (se null => grupo raiz)
  codigo?: string | null // opcional; deixamos manual ou em branco
  aceita_lancamentos: boolean
}

/** Cria uma categoria (grupo ou item) no plano de contas, dentro do tipo (pagar=despesa / receber=receita).
 *  Itens (aceita_lancamentos=true) normalmente têm um grupo pai do mesmo tipo. */
export async function criarCategoria(input: NovaCategoriaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerir(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir categorias.' }

  // ── Validação por campo ──
  if (input.tipo !== 'despesa' && input.tipo !== 'receita') return { ok: false, error: 'Tipo inválido.' }
  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da categoria.' }
  if (nome.length > 120) return { ok: false, error: 'Nome muito longo (máx. 120).' }
  const codigo = (input.codigo || '').trim()
  if (!codigo) return { ok: false, error: 'Informe o código da categoria (ex.: 4.8).' } // codigo é NOT NULL no banco
  if (!/^[0-9.]+$/.test(codigo)) return { ok: false, error: 'Código deve conter apenas números e pontos (ex.: 4.8).' }

  // Se houver pai, ele precisa existir, ser do mesmo tipo e (idealmente) ser um grupo.
  let empresa_id: string | null = null
  if (input.parent_id) {
    const { data: paiRaw } = await op.sb
      .from('plano_contas')
      .select('id, tipo, ativo, empresa_id, aceita_lancamentos')
      .eq('id', input.parent_id)
      .maybeSingle()
    const pai = paiRaw as { tipo?: string; ativo?: boolean; empresa_id?: string | null; aceita_lancamentos?: boolean } | null
    if (!pai) return { ok: false, error: 'Grupo pai não encontrado.' }
    if (pai.tipo !== input.tipo) return { ok: false, error: 'O grupo pai é de outro tipo (pagar/receber).' }
    empresa_id = pai.empresa_id ?? null
  }

  const { data: ins, error: e } = await op.sb
    .from('plano_contas')
    .insert({
      empresa_id,
      parent_id: input.parent_id || null,
      codigo,
      nome,
      tipo: input.tipo,
      // natureza: despesa => devedora, receita => credora (padrão do plano de contas)
      natureza: input.tipo === 'despesa' ? 'devedora' : 'credora',
      aceita_lancamentos: !!input.aceita_lancamentos,
      is_sistema: false,
      ativo: true,
    })
    .select('id')
    .single()
  if (e) return { ok: false, error: /duplicate|23505|unique/i.test(e.message) ? 'Já existe uma categoria com esse código.' : msgErro(e.message, 'criar categoria') }

  revalidatePath(rotaDe(input.tipo))
  return { ok: true, id: (ins as { id?: string } | null)?.id }
}

export type EditarCategoriaInput = {
  id: string
  tipo: Tipo
  nome: string
  codigo?: string | null
  aceita_lancamentos: boolean
}

/** Edita nome/código/aceita_lancamentos de uma categoria. Protege categorias de sistema. */
export async function editarCategoria(input: EditarCategoriaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerir(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir categorias.' }
  if (!input.id) return { ok: false, error: 'Categoria inválida.' }

  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da categoria.' }
  if (nome.length > 120) return { ok: false, error: 'Nome muito longo (máx. 120).' }
  const codigo = (input.codigo || '').trim()
  if (!codigo) return { ok: false, error: 'Informe o código da categoria.' } // codigo é NOT NULL no banco
  if (!/^[0-9.]+$/.test(codigo)) return { ok: false, error: 'Código deve conter apenas números e pontos.' }

  const { data: catRaw } = await op.sb
    .from('plano_contas')
    .select('id, is_sistema, tipo')
    .eq('id', input.id)
    .maybeSingle()
  const cat = catRaw as { is_sistema?: boolean; tipo?: string } | null
  if (!cat) return { ok: false, error: 'Categoria não encontrada.' }
  if (cat.is_sistema) return { ok: false, error: 'Categoria do sistema não pode ser editada.' }

  const { error: e } = await op.sb
    .from('plano_contas')
    .update({ nome, codigo, aceita_lancamentos: !!input.aceita_lancamentos })
    .eq('id', input.id)
    .eq('is_sistema', false) // trava extra: nunca toca em sistema
  if (e) return { ok: false, error: /duplicate|23505|unique/i.test(e.message) ? 'Já existe uma categoria com esse código.' : msgErro(e.message, 'editar categoria') }

  revalidatePath(rotaDe(input.tipo))
  return { ok: true }
}

/** Ativa/inativa uma categoria. Protege categorias de sistema. */
export async function alternarAtivoCategoria(id: string, ativo: boolean, tipo: Tipo): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerir(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir categorias.' }
  if (!id) return { ok: false, error: 'Categoria inválida.' }

  const { data: catRaw } = await op.sb
    .from('plano_contas')
    .select('id, is_sistema, aceita_lancamentos')
    .eq('id', id)
    .maybeSingle()
  const cat = catRaw as { is_sistema?: boolean; aceita_lancamentos?: boolean } | null
  if (!cat) return { ok: false, error: 'Categoria não encontrada.' }
  if (cat.is_sistema) return { ok: false, error: 'Categoria do sistema não pode ser inativada.' }

  // Inativar um grupo (não aceita lançamentos) → inativa os filhos junto (consistência da árvore).
  if (!ativo && cat.aceita_lancamentos === false) {
    await op.sb.from('plano_contas').update({ ativo: false }).eq('parent_id', id).eq('is_sistema', false)
  }

  const { error: e } = await op.sb
    .from('plano_contas')
    .update({ ativo })
    .eq('id', id)
    .eq('is_sistema', false)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar categoria' : 'inativar categoria') }

  revalidatePath(rotaDe(tipo))
  return { ok: true }
}

// TODO(legado: buildCatpag/buildCatrec): renumeração automática de código por nível
//   (legacy gera "4.8" a partir do pai). Hoje o código é manual/opcional — pendente
//   de uma RPC que calcule o próximo código sequencial dentro do grupo.
// TODO(legado: buildCatpag/buildCatrec): exclusão definitiva (DELETE) de categorias
//   sem lançamentos. Por segurança só expusemos inativar (soft) — DELETE exige checar
//   FKs em lancamentos_financeiros.
