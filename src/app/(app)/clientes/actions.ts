'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, scopeUnidade } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

// Papéis que podem cadastrar/inativar cliente (admin sempre passa via temPapel/ehAdmin).
// Mantém o gate explícito mesmo com a RLS atrás como 2ª linha de defesa.
const PAPEIS_ESCRITA = ['admin_geral', 'gerente', 'recepcao', 'colaborador']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || (!!papel && PAPEIS_ESCRITA.includes(papel))
}

export type NovoClienteInput = {
  nome: string
  telefone?: string
  email?: string
  cpf?: string
  genero?: string
  data_nascimento?: string // yyyy-mm-dd
  cidade?: string
  estado?: string
  observacoes?: string
  unidade_origem_id?: string | null
}

/** Só dígitos. */
function dig(s: string | undefined | null): string {
  return (s || '').replace(/\D/g, '')
}

/**
 * Verifica se já existe cliente com o mesmo documento > telefone > nome (nesta ordem de força),
 * dentro do escopo de unidade quando houver. Retorna o nome do duplicado encontrado, ou null.
 */
export async function checarDuplicado(input: {
  cpf?: string; telefone?: string; nome?: string; unidade_origem_id?: string | null
}): Promise<{ ok: true; duplicado: { id: string; nome: string; criterio: 'cpf' | 'telefone' | 'nome' } | null } | { ok: false; error: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error! }

  const cpf = dig(input.cpf)
  const tel = dig(input.telefone)
  const nome = (input.nome || '').trim()
  const uni = input.unidade_origem_id ?? null

  const buscar = async (col: string, val: string) => {
    let q = op.sb.from('clientes').select('id, nome').limit(1)
    q = col === 'nome' ? q.ilike('nome', val) : q.eq(col, val)
    q = scopeUnidade(q, uni, 'unidade_origem_id')
    const { data } = await q.maybeSingle()
    return (data as { id: string; nome: string } | null) ?? null
  }

  if (cpf) {
    const r = await buscar('cpf', cpf)
    if (r) return { ok: true, duplicado: { id: r.id, nome: r.nome, criterio: 'cpf' } }
  }
  if (tel) {
    const r = await buscar('telefone', tel)
    if (r) return { ok: true, duplicado: { id: r.id, nome: r.nome, criterio: 'telefone' } }
  }
  if (nome) {
    const r = await buscar('nome', nome)
    if (r) return { ok: true, duplicado: { id: r.id, nome: r.nome, criterio: 'nome' } }
  }
  return { ok: true, duplicado: null }
}

/**
 * Cria um cliente. Validação por campo + dedup (documento>telefone>nome) + RBAC.
 * `forcar=true` ignora o aviso de duplicado (usuário confirmou cadastrar mesmo assim).
 */
export async function criarCliente(input: NovoClienteInput, forcar = false): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar clientes.' }

  // ── Validação por campo ──
  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome do cliente.' }
  if (nome.length < 2) return { ok: false, error: 'Nome muito curto.' }

  const email = (input.email || '').trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'E-mail inválido.' }

  const cpf = dig(input.cpf)
  if (cpf && cpf.length !== 11) return { ok: false, error: 'CPF deve ter 11 dígitos.' }

  const tel = dig(input.telefone)
  if (tel && (tel.length < 10 || tel.length > 13)) return { ok: false, error: 'Telefone inválido (DDD + número).' }

  const genero = (input.genero || '').trim()
  if (genero && !['female', 'male', 'other'].includes(genero)) return { ok: false, error: 'Gênero inválido.' }

  const nasc = (input.data_nascimento || '').trim()
  if (nasc && !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return { ok: false, error: 'Data de nascimento inválida.' }

  const uni = input.unidade_origem_id ?? null

  // ── Dedup (documento > telefone > nome) ──
  if (!forcar) {
    const dup = await checarDuplicado({ cpf, telefone: tel, nome, unidade_origem_id: uni })
    if (!dup.ok) return { ok: false, error: dup.error }
    if (dup.duplicado) {
      const rotulo = dup.duplicado.criterio === 'cpf' ? 'CPF' : dup.duplicado.criterio === 'telefone' ? 'telefone' : 'nome'
      return { ok: false, error: `Já existe cliente com o mesmo ${rotulo}: "${dup.duplicado.nome}". Confirme para cadastrar mesmo assim.` }
    }
  }

  // empresa_id herdado da unidade (quando houver); a tabela permite null.
  let empresa_id: string | null = null
  if (uni) {
    const { data: u } = await op.sb.from('unidades').select('empresa_id').eq('id', uni).maybeSingle()
    empresa_id = (u as { empresa_id?: string | null } | null)?.empresa_id ?? null
  }

  const { data, error: e } = await op.sb
    .from('clientes')
    .insert({
      nome,
      telefone: tel || null,
      email: email || null,
      cpf: cpf || null,
      genero: genero || null,
      data_nascimento: nasc || null,
      cidade: (input.cidade || '').trim() || null,
      estado: (input.estado || '').trim() || null,
      observacoes: (input.observacoes || '').trim() || null,
      unidade_origem_id: uni,
      empresa_id,
      ativo: true,
      verificado: false,
    })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar cliente') }
  revalidatePath('/clientes')
  return { ok: true, id: (data as { id: string }).id }
}

/** Inativa (soft-delete: ativo=false) um cliente. RBAC: exige papel de escrita. */
export async function inativarCliente(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para inativar clientes.' }
  if (!id) return { ok: false, error: 'Cliente inválido.' }

  const { error: e } = await op.sb.from('clientes').update({ ativo: false }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'inativar cliente') }
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
  return { ok: true }
}

/** Reativa um cliente inativado (ativo=true). */
export async function reativarCliente(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para reativar clientes.' }
  if (!id) return { ok: false, error: 'Cliente inválido.' }

  const { error: e } = await op.sb.from('clientes').update({ ativo: true }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'reativar cliente') }
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
  return { ok: true }
}

/** Salva edição dos dados básicos na ficha. RBAC: exige papel de escrita. */
export async function salvarCliente(id: string, input: NovoClienteInput & { verificado?: boolean }): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar clientes.' }
  if (!id) return { ok: false, error: 'Cliente inválido.' }

  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome do cliente.' }

  const email = (input.email || '').trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'E-mail inválido.' }

  const cpf = dig(input.cpf)
  if (cpf && cpf.length !== 11) return { ok: false, error: 'CPF deve ter 11 dígitos.' }

  const tel = dig(input.telefone)
  if (tel && (tel.length < 10 || tel.length > 13)) return { ok: false, error: 'Telefone inválido.' }

  const { error: e } = await op.sb.from('clientes').update({
    nome,
    telefone: tel || null,
    email: email || null,
    cpf: cpf || null,
    genero: (input.genero || '').trim() || null,
    data_nascimento: (input.data_nascimento || '').trim() || null,
    cidade: (input.cidade || '').trim() || null,
    estado: (input.estado || '').trim() || null,
    observacoes: (input.observacoes || '').trim() || null,
    verificado: !!input.verificado,
  }).eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, 'salvar cliente') }
  revalidatePath('/clientes')
  revalidatePath(`/clientes/${id}`)
  return { ok: true }
}

// TODO(legado): importação CSV/XLSX (buildClientes / impParse / impDoImport — legacy linhas 3241-3324):
// parser de planilha, auto-map de colunas, inferência de gênero por nome, dedup em lote e insert
// em batches de 500. Fica como ação futura (precisa de upload + worker server-side).
