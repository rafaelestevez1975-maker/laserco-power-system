'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, scopeUnidade } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
// Enums REAIS (lkii) ficam em labels.ts: arquivo client-safe, pois um arquivo
// 'use server' só pode exportar funções async (não consts/types em runtime).
import { CARGOS, REGIMES, TIPOS, type Cargo, type Regime, type Tipo } from '@/components/colaboradores/labels'

export type ActionResult = { ok: boolean; error?: string; id?: string }

// Papéis que podem cadastrar/editar/inativar colaboradores (admin sempre passa).
// Gate explícito de UI/servidor; a RLS do Supabase é a 2ª linha de defesa.
const PAPEIS_ESCRITA = ['admin_geral', 'gerente', 'recepcao']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || (!!papel && PAPEIS_ESCRITA.includes(papel))
}

/** Só dígitos. */
function dig(s: string | undefined | null): string {
  return (s || '').replace(/\D/g, '')
}

/** Converte "1.234,56" / "1234.56" / "" → number | null. */
function parseMoeda(s: string | undefined | null): number | null {
  const t = (s || '').trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseIntOrNull(s: string | undefined | null): number | null {
  const t = (s || '').trim()
  if (!t) return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

export type ColaboradorInput = {
  nome: string
  cpf: string // obrigatório (NOT NULL no schema)
  rg?: string
  data_nascimento?: string // yyyy-mm-dd
  email?: string
  telefone?: string
  cargo?: string
  departamento?: string
  area?: string
  regime?: string
  tipo?: string
  data_admissao?: string
  // bloco profissional / RH
  salario_bruto?: string
  salario_liquido?: string
  banco?: string
  agencia?: string
  conta?: string
  pix?: string
  jornada_semanal_horas?: string
  jornada_diaria_horas?: string
  home_office_autorizado?: boolean
  endereco_residencial?: string
  unidade_id?: string | null
  // Aba "Agenda & Serviços" (legado colabtab-agenda)
  exibe_agenda?: boolean
  disponivel_online?: boolean
  comissao_pct?: string
  ordem_app?: string
  // Aba "Acesso ao sistema" (legado colabtab-acesso)
  forcar_troca_senha?: boolean
}

/** Validação compartilhada (criar/editar). Retorna mensagem de erro por campo, ou null. */
function validar(input: ColaboradorInput, exigirCpf = true): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do colaborador.'
  if (nome.length < 2) return 'Nome muito curto.'

  const cpf = dig(input.cpf)
  if (exigirCpf && !cpf) return 'CPF é obrigatório.'
  if (cpf && cpf.length !== 11) return 'CPF deve ter 11 dígitos.'

  const email = (input.email || '').trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'E-mail inválido.'

  const tel = dig(input.telefone)
  if (tel && (tel.length < 10 || tel.length > 13)) return 'Telefone inválido (DDD + número).'

  const nasc = (input.data_nascimento || '').trim()
  if (nasc && !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return 'Data de nascimento inválida.'

  const adm = (input.data_admissao || '').trim()
  if (!adm) return 'Informe a data de admissão.' // data_admissao é NOT NULL no banco
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adm)) return 'Data de admissão inválida.'

  const regime = (input.regime || '').trim()
  if (regime && !REGIMES.includes(regime as Regime)) return 'Regime inválido.'

  const tipo = (input.tipo || '').trim()
  if (tipo && !TIPOS.includes(tipo as Tipo)) return 'Tipo inválido.'

  const cargo = (input.cargo || '').trim()
  if (!cargo) return 'Selecione o cargo do colaborador.' // cargo é enum NOT NULL no banco
  if (!CARGOS.includes(cargo as Cargo)) return 'Cargo inválido.'

  return null
}

/** Colunas-base (sempre existem no schema lkii). */
function montarPayloadBase(input: ColaboradorInput) {
  const cargo = (input.cargo || '').trim()
  const regime = (input.regime || '').trim()
  const tipo = (input.tipo || '').trim()
  return {
    nome: (input.nome || '').trim(),
    cpf: dig(input.cpf),
    rg: (input.rg || '').trim() || null,
    data_nascimento: (input.data_nascimento || '').trim() || null,
    email: (input.email || '').trim() || null,
    telefone: dig(input.telefone) || null,
    cargo: cargo || null,
    departamento: (input.departamento || '').trim() || null,
    area: (input.area || '').trim() || null,
    regime: regime || 'clt',
    tipo: tipo || 'loja',
    data_admissao: (input.data_admissao || '').trim() || null,
    salario_bruto: parseMoeda(input.salario_bruto),
    salario_liquido: parseMoeda(input.salario_liquido),
    banco: (input.banco || '').trim() || null,
    agencia: (input.agencia || '').trim() || null,
    conta: (input.conta || '').trim() || null,
    pix: (input.pix || '').trim() || null,
    jornada_semanal_horas: parseIntOrNull(input.jornada_semanal_horas) ?? 44, // NOT NULL (default 44)
    jornada_diaria_horas: parseIntOrNull(input.jornada_diaria_horas) ?? 8, // NOT NULL (default 8)
    home_office_autorizado: !!input.home_office_autorizado,
    endereco_residencial: (input.endereco_residencial || '').trim() || null,
  }
}

/** Colunas das abas novas (scripts/migrations/comissoes.sql)  só existem pós-migration. */
function montarPayloadExt(input: ColaboradorInput) {
  return {
    exibe_agenda: input.exibe_agenda === undefined ? true : !!input.exibe_agenda,
    disponivel_online: input.disponivel_online === undefined ? true : !!input.disponivel_online,
    comissao_pct: parseMoeda(input.comissao_pct) ?? 0,
    ordem_app: parseIntOrNull(input.ordem_app) ?? 1,
    forcar_troca_senha: !!input.forcar_troca_senha,
  }
}

/** Payload completo (base + extensão). */
function montarPayload(input: ColaboradorInput) {
  return { ...montarPayloadBase(input), ...montarPayloadExt(input) }
}

/** Erro "coluna inexistente" (migration comissoes.sql ainda não aplicada). */
function ehColunaInexistente(msg: string | undefined): boolean {
  return /column .* does not exist|could not find the .* column|schema cache/i.test(msg || '')
}

/**
 * Verifica duplicidade por CPF dentro do escopo de unidade. Retorna o nome do
 * colaborador existente, ou null. (CPF é a chave natural mais forte aqui.)
 */
export async function checarCpfDuplicado(
  cpf: string,
  unidadeId: string | null,
  ignorarId?: string,
): Promise<{ ok: true; duplicado: { id: string; nome: string } | null } | { ok: false; error: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error! }
  const d = dig(cpf)
  if (!d) return { ok: true, duplicado: null }

  // CPF é UNIQUE GLOBAL no banco (colaboradores_cpf_key)  checa duplicidade sem escopo de unidade.
  void unidadeId
  const { data } = await op.sb.from('colaboradores').select('id, nome').eq('cpf', d).limit(1).maybeSingle()
  const row = (data as { id: string; nome: string } | null) ?? null
  if (row && row.id !== ignorarId) return { ok: true, duplicado: row }
  return { ok: true, duplicado: null }
}

/**
 * Cria um colaborador. Validação por campo + dedup por CPF + RBAC + multitenant.
 * `forcar=true` ignora o aviso de CPF duplicado.
 */
export async function criarColaborador(input: ColaboradorInput, forcar = false): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar colaboradores.' }

  const v = validar(input, true)
  if (v) return { ok: false, error: v }

  const uni = input.unidade_id ?? null
  if (!uni) return { ok: false, error: 'Selecione a unidade de lotação do colaborador.' }

  const cpf = dig(input.cpf)
  if (!forcar) {
    const dup = await checarCpfDuplicado(cpf, uni)
    if (!dup.ok) return { ok: false, error: dup.error }
    if (dup.duplicado) {
      return { ok: false, error: `Já existe colaborador com este CPF: "${dup.duplicado.nome}". Confirme para cadastrar mesmo assim.` }
    }
  }

  const base = { ...montarPayloadBase(input), unidade_id: uni, status: 'ativo' as const }
  let { data, error: e } = await op.sb
    .from('colaboradores')
    .insert({ ...base, ...montarPayloadExt(input) })
    .select('id')
    .single()
  // Migration comissoes.sql pendente? Reinsere só com as colunas-base.
  if (e && ehColunaInexistente(e.message)) {
    const r = await op.sb.from('colaboradores').insert(base).select('id').single()
    data = r.data; e = r.error
  }

  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar colaborador') }
  revalidatePath('/colaboradores')
  return { ok: true, id: (data as { id: string }).id }
}

/** Salva edição dos dados de um colaborador. Não altera status (use inativar/reativar). */
export async function salvarColaborador(id: string, input: ColaboradorInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar colaboradores.' }
  if (!id) return { ok: false, error: 'Colaborador inválido.' }

  // CPF na edição é obrigatório (coluna NOT NULL), mas não força dedup (mesmo registro).
  const v = validar(input, true)
  if (v) return { ok: false, error: v }

  let { error: e } = await op.sb.from('colaboradores').update(montarPayload(input)).eq('id', id)
  // Migration comissoes.sql pendente? Atualiza só com as colunas-base.
  if (e && ehColunaInexistente(e.message)) {
    const r = await op.sb.from('colaboradores').update(montarPayloadBase(input)).eq('id', id)
    e = r.error
  }
  if (e) return { ok: false, error: msgErro(e.message, 'salvar colaborador') }
  revalidatePath('/colaboradores')
  revalidatePath(`/colaboradores/${id}`)
  return { ok: true }
}

/** Inativa um colaborador (status='inativo'). Registra data_demissao = hoje. */
export async function inativarColaborador(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para inativar colaboradores.' }
  if (!id) return { ok: false, error: 'Colaborador inválido.' }

  const hoje = new Date().toISOString().slice(0, 10)
  const { error: e } = await op.sb
    .from('colaboradores')
    .update({ status: 'inativo', data_demissao: hoje })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'inativar colaborador') }
  revalidatePath('/colaboradores')
  revalidatePath(`/colaboradores/${id}`)
  return { ok: true }
}

/** Reativa um colaborador (status='ativo', limpa data_demissao). */
export async function reativarColaborador(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para reativar colaboradores.' }
  if (!id) return { ok: false, error: 'Colaborador inválido.' }

  const { error: e } = await op.sb
    .from('colaboradores')
    .update({ status: 'ativo', data_demissao: null })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'reativar colaborador') }
  revalidatePath('/colaboradores')
  revalidatePath(`/colaboradores/${id}`)
  return { ok: true }
}

// ── Serviços que o colaborador executa (legado colabServRender, ~7120) ──
// Junção colaborador_servicos (scripts/migrations/comissoes.sql).

export type ServicoOpcao = { id: string; nome: string; grupo: string }

/** Lista os serviços ativos (para os checkboxes por grupo) + ids já vinculados ao colaborador. */
export async function carregarServicosColaborador(
  colaboradorId: string,
): Promise<{ ok: true; servicos: ServicoOpcao[]; selecionados: string[]; tabelaPronta: boolean } | { ok: false; error: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error! }

  const { data: servRaw } = await op.sb
    .from('servicos')
    .select('id, nome, grupo')
    .eq('ativo', true)
    .order('grupo', { ascending: true })
    .order('nome', { ascending: true })
    .limit(1000)
  const servicos = ((servRaw ?? []) as { id: string; nome: string | null; grupo: string | null }[]).map((s) => ({
    id: s.id, nome: s.nome || '(sem nome)', grupo: s.grupo || 'Outros',
  }))

  // A tabela de junção pode não existir ainda (migration pendente) → degrade graciosamente.
  const { data: linkRaw, error: linkErr } = await op.sb
    .from('colaborador_servicos')
    .select('servico_id')
    .eq('colaborador_id', colaboradorId)
  if (linkErr) return { ok: true, servicos, selecionados: [], tabelaPronta: false }
  const selecionados = ((linkRaw ?? []) as { servico_id: string }[]).map((r) => r.servico_id)
  return { ok: true, servicos, selecionados, tabelaPronta: true }
}

/** Substitui o conjunto de serviços executados pelo colaborador (delete + insert). */
export async function salvarServicosColaborador(colaboradorId: string, servicoIds: string[]): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar serviços do colaborador.' }
  if (!colaboradorId) return { ok: false, error: 'Colaborador inválido.' }

  const ids = [...new Set((servicoIds || []).filter(Boolean))]
  const { error: delErr } = await op.sb.from('colaborador_servicos').delete().eq('colaborador_id', colaboradorId)
  if (delErr) return { ok: false, error: msgErro(delErr.message, 'salvar serviços do colaborador') }
  if (ids.length) {
    const rows = ids.map((servico_id) => ({ colaborador_id: colaboradorId, servico_id }))
    const { error: insErr } = await op.sb.from('colaborador_servicos').insert(rows)
    if (insErr) return { ok: false, error: msgErro(insErr.message, 'salvar serviços do colaborador') }
  }
  revalidatePath(`/colaboradores/${colaboradorId}`)
  return { ok: true }
}

// TODO(legado: buildInatividadeAuto): a regra de inatividade automática (>15 dias sem
// acesso, legacy aplicarRegraInatividade / INATIVIDADE_DIAS) usa a coluna
// colaboradores.ultimo_acesso (criada em scripts/migrations/comissoes.sql). A inativação
// em lote ainda depende de job agendado (pg_cron)  fica como ação futura; a lista já
// exibe os dias sem acesso e destaca o alerta de +15d.
