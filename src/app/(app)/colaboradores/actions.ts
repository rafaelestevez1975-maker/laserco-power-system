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
  if (adm && !/^\d{4}-\d{2}-\d{2}$/.test(adm)) return 'Data de admissão inválida.'

  const regime = (input.regime || '').trim()
  if (regime && !REGIMES.includes(regime as Regime)) return 'Regime inválido.'

  const tipo = (input.tipo || '').trim()
  if (tipo && !TIPOS.includes(tipo as Tipo)) return 'Tipo inválido.'

  const cargo = (input.cargo || '').trim()
  // cargo é enum no banco — só valida contra a lista conhecida quando preenchido;
  // se vier um valor fora da lista (cargo legado do banco na edição), deixamos o
  // servidor do Postgres rejeitar com mensagem clara, em vez de bloquear aqui.
  if (cargo && !CARGOS.includes(cargo as Cargo)) {
    // não bloqueia — pode ser um cargo válido não mapeado (ver TODO cargoEnumCompleto)
  }

  return null
}

/** Monta o payload de colunas a partir do input (campos null quando vazios). */
function montarPayload(input: ColaboradorInput) {
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
    jornada_semanal_horas: parseIntOrNull(input.jornada_semanal_horas),
    jornada_diaria_horas: parseIntOrNull(input.jornada_diaria_horas),
    home_office_autorizado: !!input.home_office_autorizado,
    endereco_residencial: (input.endereco_residencial || '').trim() || null,
  }
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

  let q = op.sb.from('colaboradores').select('id, nome').eq('cpf', d).limit(1)
  q = scopeUnidade(q, unidadeId, 'unidade_id')
  const { data } = await q.maybeSingle()
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

  const payload = montarPayload(input)
  const { data, error: e } = await op.sb
    .from('colaboradores')
    .insert({ ...payload, unidade_id: uni, status: 'ativo' })
    .select('id')
    .single()

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

  const payload = montarPayload(input)
  const { error: e } = await op.sb.from('colaboradores').update(payload).eq('id', id)
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

// TODO(legado: buildInatividadeAuto): inativação automática de colaboradores com
// >15 dias sem acesso ao sistema (legacy aplicarRegraInatividade / INATIVIDADE_DIAS,
// index.html ~7045). Precisa de coluna de "último acesso" (não existe em colaboradores)
// + job agendado (pg_cron) — fica como ação futura.

// TODO(legado: buildServicosExecutados): bloco "Serviços que o colaborador executa"
// (legacy colabServRender / colabServGroups, index.html ~7110). A tabela de junção
// colaborador_servicos NÃO existe no schema lkii — exige migration. O bloco profissional
// (cargo/comissão/serviços) fica como leitura informativa por enquanto.

// TODO(legado: buildComissao): % de comissão padrão por colaborador (legacy aba Agenda).
// Não há coluna de comissão em colaboradores nem tabela comissoes — exige migration.
