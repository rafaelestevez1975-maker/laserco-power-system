'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, scopeUnidade } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { generoEnum } from '@/lib/clientes'

export type ActionResult = { ok: boolean; error?: string; id?: string }

// Papéis que podem cadastrar/inativar cliente (admin sempre passa via temPapel/ehAdmin).
// Mantém o gate explícito mesmo com a RLS atrás como 2ª linha de defesa.
const PAPEIS_ESCRITA = ['admin_geral', 'sac', 'crm', 'operacoes'] // alinhado à RLS clientes_ins/upd (tem_acesso_cliente_final AND papel<>gestor)

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || (!!papel && PAPEIS_ESCRITA.includes(papel))
}

export type NovoClienteInput = {
  nome: string
  telefone?: string
  email?: string
  cpf?: string
  rg?: string
  genero?: string
  data_nascimento?: string // yyyy-mm-dd
  canal_origem?: string // "Onde nos conheceu?" (legado)
  cep?: string
  rua?: string
  numero?: string
  complemento?: string
  bairro?: string
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
      rg: (input.rg || '').trim() || null,
      genero: genero || null,
      data_nascimento: nasc || null,
      canal_origem: (input.canal_origem || '').trim() || null,
      cep: dig(input.cep) || null,
      rua: (input.rua || '').trim() || null,
      numero: (input.numero || '').trim() || null,
      complemento: (input.complemento || '').trim() || null,
      bairro: (input.bairro || '').trim() || null,
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
    rg: (input.rg || '').trim() || null,
    genero: (input.genero || '').trim() || null,
    data_nascimento: (input.data_nascimento || '').trim() || null,
    canal_origem: (input.canal_origem || '').trim() || null,
    cep: dig(input.cep) || null,
    rua: (input.rua || '').trim() || null,
    numero: (input.numero || '').trim() || null,
    complemento: (input.complemento || '').trim() || null,
    bairro: (input.bairro || '').trim() || null,
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

// ───────────────────────────────────── Importação de clientes ─────────────────────────────────────
// Paridade com legado impDoImport (legacy 3286-3324): grava em batches de 500.
// O parse/auto-map/dedup/inferência rodam no client (src/lib/clientes.ts); aqui só persistimos.

export type ImportRecord = {
  nome: string
  telefone: string
  email: string
  documento: string
  genero: '' | 'Feminino' | 'Masculino'
  ativo: boolean
  verificado: boolean
  origem: string
}

/**
 * Insere os clientes processados em lotes de 500. `unidadeId` define a unidade de origem
 * (e a empresa herdada). RBAC: exige papel de escrita. Retorna quantos gravou.
 */
export async function importarClientes(
  registros: ImportRecord[],
  unidadeId: string | null,
): Promise<{ ok: boolean; error?: string; gravados?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para importar clientes.' }
  if (!Array.isArray(registros) || registros.length === 0) return { ok: false, error: 'Nenhum registro para importar.' }
  if (registros.length > 50000) return { ok: false, error: 'Importação muito grande (máx. 50.000 por vez).' }

  const uni = unidadeId || null
  let empresa_id: string | null = null
  if (uni) {
    const { data: u } = await op.sb.from('unidades').select('empresa_id').eq('id', uni).maybeSingle()
    empresa_id = (u as { empresa_id?: string | null } | null)?.empresa_id ?? null
  }

  const linhas = registros.map((r) => ({
    nome: (r.nome || '(sem nome)').slice(0, 120),
    telefone: dig(r.telefone) || null,
    email: (r.email || '').trim() || null,
    cpf: dig(r.documento) || null,
    genero: generoEnum(r.genero) || null,
    canal_origem: (r.origem || '').trim() || null,
    ativo: r.ativo !== false,
    verificado: !!r.verificado,
    importado_do_bemp: true,
    unidade_origem_id: uni,
    empresa_id,
  }))

  let gravados = 0
  for (let i = 0; i < linhas.length; i += 500) {
    const batch = linhas.slice(i, i + 500)
    const { error: e } = await op.sb.from('clientes').insert(batch)
    if (e) return { ok: false, error: msgErro(e.message, `importar clientes (lote ${Math.floor(i / 500) + 1})`), gravados }
    gravados += batch.length
  }

  revalidatePath('/clientes')
  return { ok: true, gravados }
}

// ───────────────────────────────── Detecção de duplicados + unificação ─────────────────────────────
// Paridade com legado cliScore/cliUnificar/cliUnificarConfirm (legacy 3035-3058).

export type DupCliente = {
  id: string
  nome: string | null
  cpf: string | null
  telefone: string | null
  criado_em: string | null
  saldo_pontos: number | null
  saldo_creditos: number | null
  score: number // pacotes 2 + contratos 2 + imagens 2 + legado 1 (proxy com dado real)
}

/** Score de preferência do cadastro (legado cliScore): tem saldo/pontos > tem agendamentos > legado. */
function scoreCli(c: { saldo_pontos: number | null; saldo_creditos: number | null; importado: boolean; ags: number; verificado: boolean }): number {
  return (c.saldo_creditos ? 2 : 0) + (c.ags ? 2 : 0) + (c.saldo_pontos ? 2 : 0) + (c.importado ? 1 : 0) + (c.verificado ? 1 : 0)
}

/** Lista cadastros com o MESMO nome (case/acento-insensível) do cliente informado, ordenados por score. */
export async function listarDuplicados(id: string): Promise<{ ok: boolean; error?: string; duplicados?: DupCliente[] }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!id) return { ok: false, error: 'Cliente inválido.' }

  const { data: base } = await op.sb.from('clientes').select('nome, unidade_origem_id').eq('id', id).maybeSingle()
  const nome = ((base as { nome?: string } | null)?.nome || '').trim()
  if (!nome) return { ok: true, duplicados: [] }

  let q = op.sb
    .from('clientes')
    .select('id, nome, cpf, telefone, criado_em, saldo_pontos, saldo_creditos, verificado, importado_do_bemp')
    .ilike('nome', nome)
    .limit(20)
  q = scopeUnidade(q, (base as { unidade_origem_id?: string | null } | null)?.unidade_origem_id ?? null, 'unidade_origem_id')
  const { data } = await q

  type Row = { id: string; nome: string | null; cpf: string | null; telefone: string | null; criado_em: string | null; saldo_pontos: number | null; saldo_creditos: number | null; verificado: boolean | null; importado_do_bemp: boolean | null }
  const rows = (data ?? []) as Row[]
  if (rows.length < 2) return { ok: true, duplicados: [] }

  // contagem de agendamentos por cliente (proxy de "tem histórico / pacotes")
  const ids = rows.map((r) => r.id)
  const agCount: Record<string, number> = {}
  const { data: ags } = await op.sb.from('agendamentos').select('cliente_id').in('cliente_id', ids)
  for (const a of (ags ?? []) as { cliente_id: string }[]) agCount[a.cliente_id] = (agCount[a.cliente_id] || 0) + 1

  const duplicados: DupCliente[] = rows
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      cpf: r.cpf,
      telefone: r.telefone,
      criado_em: r.criado_em,
      saldo_pontos: r.saldo_pontos,
      saldo_creditos: r.saldo_creditos,
      score: scoreCli({ saldo_pontos: r.saldo_pontos, saldo_creditos: r.saldo_creditos, importado: !!r.importado_do_bemp, ags: agCount[r.id] || 0, verificado: !!r.verificado }),
    }))
    .sort((a, b) => b.score - a.score)

  return { ok: true, duplicados }
}

/**
 * Unifica cadastros duplicados: mantém o `manterId` (preferido), copia campos vazios dos demais
 * para ele, reaponta os agendamentos e inativa os secundários. Paridade com cliUnificarConfirm.
 */
export async function unificarClientes(manterId: string, removerIds: string[]): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para unificar clientes.' }
  if (!manterId || !Array.isArray(removerIds) || removerIds.length === 0) return { ok: false, error: 'Selecione os cadastros a unificar.' }

  const todos = [manterId, ...removerIds]
  const { data } = await op.sb
    .from('clientes')
    .select('id, cpf, telefone, email, rg, data_nascimento, canal_origem, cep, rua, numero, bairro, cidade, estado')
    .in('id', todos)
  type Row = Record<string, string | null> & { id: string }
  const map = Object.fromEntries(((data ?? []) as Row[]).map((r) => [r.id, r]))
  const keep = map[manterId]
  if (!keep) return { ok: false, error: 'Cadastro preferido não encontrado.' }

  // copia para o "keep" os campos que ele não tem, a partir dos secundários (ordem recebida)
  const campos = ['cpf', 'telefone', 'email', 'rg', 'data_nascimento', 'canal_origem', 'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado']
  const patch: Record<string, string> = {}
  for (const rid of removerIds) {
    const r = map[rid]
    if (!r) continue
    for (const c of campos) {
      if (!keep[c] && !patch[c] && r[c]) patch[c] = r[c]!
    }
  }
  if (Object.keys(patch).length) {
    const { error: e } = await op.sb.from('clientes').update(patch).eq('id', manterId)
    if (e) return { ok: false, error: msgErro(e.message, 'unificar (merge de campos)') }
  }

  // reaponta agendamentos dos secundários para o preferido (best-effort)
  await op.sb.from('agendamentos').update({ cliente_id: manterId }).in('cliente_id', removerIds)

  // inativa os secundários (soft-delete; não apagamos histórico)
  const { error: e2 } = await op.sb.from('clientes').update({ ativo: false }).in('id', removerIds)
  if (e2) return { ok: false, error: msgErro(e2.message, 'unificar (inativar secundários)') }

  revalidatePath('/clientes')
  revalidatePath(`/clientes/${manterId}`)
  return { ok: true, id: manterId }
}
