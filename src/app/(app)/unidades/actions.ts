'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string }

/** Quem pode editar/inativar uma unidade da rede: a franqueadora (admin_geral)
 *  ou um proprietário. No legado o gate era USER_ROLE==='Proprietário'; aqui
 *  admin_geral sempre passa e 'proprietario' fica como hook caso o papel exista. */
const PAPEIS_GESTAO_UNIDADE = ['proprietario']

function podeGerirUnidade(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_GESTAO_UNIDADE.includes(papel || '')
}

export type EditarUnidadeInput = {
  id: string
  nome: string
  cnpj?: string | null
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
}

/** Edita os dados cadastrais de uma unidade da rede (modal de /unidades).
 *  RBAC: só franqueadora/proprietário. Validação por campo. */
export async function editarUnidade(input: EditarUnidadeInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerirUnidade(op.papel)) return { ok: false, error: 'Você não tem permissão para editar unidades.' }
  if (!input.id) return { ok: false, error: 'Unidade inválida.' }

  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da unidade.' }

  const estado = (input.estado || '').trim().toUpperCase()
  if (estado && estado.length !== 2) return { ok: false, error: 'UF deve ter 2 letras (ex.: SP).' }

  const { error: e } = await op.sb
    .from('unidades')
    .update({
      nome,
      cnpj: input.cnpj?.trim() || null,
      endereco: input.endereco?.trim() || null,
      cidade: input.cidade?.trim() || null,
      estado: estado || null,
      cep: input.cep?.trim() || null,
    })
    .eq('id', input.id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar unidade') }

  revalidatePath('/unidades')
  revalidatePath('/minha-unidade')
  return { ok: true }
}

/** Liga/desliga a unidade (coluna `ativa`). Unidade inativa = acesso do franqueado
 *  cortado (legado). RBAC: só franqueadora/proprietário. */
export async function toggleAtivaUnidade(id: string, ativa: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerirUnidade(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar o status de unidades.' }
  if (!id) return { ok: false, error: 'Unidade inválida.' }

  const { error: e } = await op.sb.from('unidades').update({ ativa }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'alterar status da unidade') }

  revalidatePath('/unidades')
  return { ok: true }
}

// TODO(legado: buildUnidades)  status 'Teste' (unidade fora dos relatórios): o schema
//   real só tem boolean `ativa`. Sem coluna de status tri-estado não dá para persistir
//   "Em teste" de verdade. //TODO(needs-table/coluna: unidades.status enum ativa|teste|inativa)
// TODO(legado: buildUnidades)  Escritórios (locais administrativos da rede). Não há
//   tabela de escritórios no lkii. //TODO(needs-table: escritorios)
// TODO(legado: buildUnidades)  criar nova unidade só Proprietário. Criação envolve
//   empresa_id + provisionamento (bemp_salon_id) e foge do escopo de cadastro simples;
//   deixado adiado. //TODO(legado: criar unidade)

export type NovaUnidadeInput = {
  nome: string
  cnpj?: string | null
  cidade?: string | null
  estado?: string | null
  tipoLoja?: 'propria' | 'franquia'
}

/** Cria uma unidade da rede (pedido 03/07). Já provisiona o CENTRO DE CUSTO da unidade —
 *  sem ele o financeiro (razão/DRE/royalties) não enxerga a loja. RBAC: franqueadora/proprietário. */
export async function criarUnidade(input: NovaUnidadeInput): Promise<ActionResult & { id?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerirUnidade(op.papel)) return { ok: false, error: 'Você não tem permissão para criar unidades.' }

  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da unidade.' }
  const estado = (input.estado || '').trim().toUpperCase()
  if (estado && estado.length !== 2) return { ok: false, error: 'UF deve ter 2 letras (ex.: SP).' }

  const { data: dup } = await op.sb.from('unidades').select('id').ilike('nome', nome).limit(1).maybeSingle()
  if (dup) return { ok: false, error: 'Já existe uma unidade com esse nome.' }

  const { data: emp } = await op.sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  const empresaId = (emp as { id?: string } | null)?.id
  if (!empresaId) return { ok: false, error: 'Empresa da rede não encontrada.' }

  const { data: ins, error: e } = await op.sb.from('unidades').insert({
    nome, empresa_id: empresaId, ativa: true,
    cnpj: input.cnpj?.trim() || null, cidade: input.cidade?.trim() || null, estado: estado || null,
    tipo_loja: input.tipoLoja === 'propria' ? 'propria' : 'franquia',
  }).select('id').single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar unidade') }
  const id = (ins as { id: string }).id

  // Centro de custo da loja (razão/DRE/royalties dependem dele).
  const { error: eCc } = await op.sb.from('centro_custo').insert({ empresa_id: empresaId, nome, tipo: 'unidade', unidade_id: id })
  if (eCc) console.error('criarUnidade: centro de custo falhou:', eCc.message)

  revalidatePath('/unidades'); revalidatePath('/financeiro')
  return { ok: true, id }
}

/** Remove uma unidade SEM histórico. Se houver qualquer vínculo (lançamentos, agendamentos,
 *  chats…), o banco barra por FK e orientamos usar INATIVAR — histórico nunca é apagado. */
export async function removerUnidade(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerirUnidade(op.papel)) return { ok: false, error: 'Você não tem permissão para remover unidades.' }
  if (!id) return { ok: false, error: 'Unidade inválida.' }

  // Centro de custo primeiro (se tiver lançamentos no razão, a FK barra aqui — mensagem amiga).
  const { error: eCc } = await op.sb.from('centro_custo').delete().eq('unidade_id', id)
  if (eCc) {
    return { ok: false, error: /foreign key|violates|constraint/i.test(eCc.message) ? 'Esta unidade tem lançamentos financeiros vinculados — use “Inativar” (o histórico é preservado).' : msgErro(eCc.message, 'remover unidade') }
  }
  const { error: e } = await op.sb.from('unidades').delete().eq('id', id)
  if (e) {
    return { ok: false, error: /foreign key|violates|constraint/i.test(e.message) ? 'Esta unidade tem histórico vinculado (agendamentos, conversas ou cadastros) — use “Inativar” em vez de remover.' : msgErro(e.message, 'remover unidade') }
  }
  revalidatePath('/unidades'); revalidatePath('/financeiro')
  return { ok: true }
}
