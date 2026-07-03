'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/** Papéis com permissão de escrita nos planos de assinatura (config da rede). */
const PAPEIS_ESCRITA = ['gestor', 'operacoes']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

type Op = NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>

/** Serviço incluído no plano × nº de sessões/mês (plano_assinatura_servicos.quantidade_mensal). */
export type ItemPlanoInput = { servico_id: string; quantidade_mensal: number }

export type PlanoInput = {
  nome: string
  descricao?: string | null
  valor_mensal: number | null
  valor_adesao: number | null
  duracao_meses: number | null
  beneficios: string[]
  itens: ItemPlanoInput[]
}

/** Resolve a empresa do operador (planos é escopo da franqueadora, não da unidade). */
async function resolverEmpresaId(op: Op): Promise<string | null> {
  const { sb, userId } = op
  const { data: perfil } = await sb.from('perfis_usuario').select('unidade_id').eq('id', userId).maybeSingle()
  const unidadeId = (perfil as { unidade_id?: string | null } | null)?.unidade_id ?? null
  if (unidadeId) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).maybeSingle()
    const eid = (uni as { empresa_id?: string | null } | null)?.empresa_id ?? null
    if (eid) return eid
  }
  const { data: emp } = await sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  return (emp as { id?: string } | null)?.id ?? null
}

/** Valida campos comuns. Retorna msg de erro ou null. */
function validarCampos(input: PlanoInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do plano.'
  if (nome.length < 3) return 'Nome muito curto.'
  const vm = Number(input.valor_mensal)
  if (input.valor_mensal == null || !Number.isFinite(vm) || vm < 0) return 'Informe a mensalidade (R$).'
  if (input.valor_adesao != null) {
    const va = Number(input.valor_adesao)
    if (!Number.isFinite(va) || va < 0) return 'Valor de adesão inválido.'
  }
  if (input.duracao_meses != null) {
    const d = Number(input.duracao_meses)
    if (!Number.isInteger(d) || d < 0) return 'Duração (meses) inválida.'
  }
  return null
}

/** Valida itens (serviços incluídos) contra serviços reais e ativos. Sem itens é permitido
 *  (plano pode ser só de benefícios/descontos). Retorna msg de erro ou null. */
async function validarItens(sb: Op['sb'], itens: ItemPlanoInput[]): Promise<string | null> {
  if (!Array.isArray(itens) || itens.length === 0) return null
  const ids = itens.map((i) => i.servico_id).filter(Boolean)
  if (ids.length !== itens.length) return 'Selecione o serviço em cada linha incluída.'
  if (new Set(ids).size !== ids.length) return 'Há serviços repetidos. Some as sessões/mês em uma única linha.'
  for (const it of itens) {
    const q = Number(it.quantidade_mensal)
    if (!Number.isFinite(q) || q < 1) return 'A quantidade de sessões/mês deve ser 1 ou mais.'
  }
  const { data: servs } = await sb.from('servicos').select('id, ativo').in('id', ids)
  const found = new Map<string, boolean>(((servs ?? []) as { id: string; ativo: boolean | null }[]).map((s) => [s.id, s.ativo !== false]))
  for (const id of ids) {
    if (!found.has(id)) return 'Um dos serviços incluídos não existe mais.'
    if (!found.get(id)) return 'Um dos serviços incluídos está inativo. Remova-o do plano.'
  }
  return null
}

/** Normaliza a lista de benefícios (text[]): trim, sem vazios, sem duplicados. */
function limparBeneficios(b: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of b ?? []) {
    const t = (raw || '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** Cria um plano de assinatura + serviços incluídos. RBAC + validação por campo. */
export async function criarPlano(input: PlanoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para criar planos.' }

  const errCampo = validarCampos(input)
  if (errCampo) return { ok: false, error: errCampo }
  const errItens = await validarItens(op.sb, input.itens)
  if (errItens) return { ok: false, error: errItens }

  const empresa_id = await resolverEmpresaId(op)

  const { data, error: e } = await op.sb
    .from('planos_assinatura')
    .insert({
      empresa_id,
      nome: input.nome.trim(),
      descricao: (input.descricao || '').trim() || null,
      valor_mensal: Number(input.valor_mensal),
      valor_adesao: input.valor_adesao != null ? Number(input.valor_adesao) : 0,
      duracao_meses: input.duracao_meses != null ? Number(input.duracao_meses) : null,
      beneficios: limparBeneficios(input.beneficios),
      ativo: true,
    })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar plano') }

  const planoId = (data as { id: string }).id
  if (input.itens.length) {
    const linhas = input.itens.map((it) => ({ plano_id: planoId, servico_id: it.servico_id, quantidade_mensal: Number(it.quantidade_mensal) }))
    const { error: e2 } = await op.sb.from('plano_assinatura_servicos').insert(linhas)
    if (e2) {
      await op.sb.from('planos_assinatura').delete().eq('id', planoId)
      return { ok: false, error: msgErro(e2.message, 'salvar os serviços do plano') }
    }
  }

  revalidatePath('/planos')
  return { ok: true, id: planoId }
}

/** Edita um plano: cabeçalho + recria os serviços incluídos (delete + insert). */
export async function editarPlano(id: string, input: PlanoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar planos.' }
  if (!id) return { ok: false, error: 'Plano inválido.' }

  const errCampo = validarCampos(input)
  if (errCampo) return { ok: false, error: errCampo }
  const errItens = await validarItens(op.sb, input.itens)
  if (errItens) return { ok: false, error: errItens }

  const { error: e } = await op.sb
    .from('planos_assinatura')
    .update({
      nome: input.nome.trim(),
      descricao: (input.descricao || '').trim() || null,
      valor_mensal: Number(input.valor_mensal),
      valor_adesao: input.valor_adesao != null ? Number(input.valor_adesao) : 0,
      duracao_meses: input.duracao_meses != null ? Number(input.duracao_meses) : null,
      beneficios: limparBeneficios(input.beneficios),
    })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar plano') }

  const { error: eDel } = await op.sb.from('plano_assinatura_servicos').delete().eq('plano_id', id)
  if (eDel) return { ok: false, error: msgErro(eDel.message, 'atualizar os serviços do plano') }
  if (input.itens.length) {
    const linhas = input.itens.map((it) => ({ plano_id: id, servico_id: it.servico_id, quantidade_mensal: Number(it.quantidade_mensal) }))
    const { error: eIns } = await op.sb.from('plano_assinatura_servicos').insert(linhas)
    if (eIns) return { ok: false, error: msgErro(eIns.message, 'salvar os serviços do plano') }
  }

  revalidatePath('/planos')
  return { ok: true, id }
}

/** Liga/desliga o plano (toggle ativo). */
export async function togglePlanoAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar planos.' }
  if (!id) return { ok: false, error: 'Plano inválido.' }

  const { error: e } = await op.sb.from('planos_assinatura').update({ ativo }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'reativar plano' : 'inativar plano') }
  revalidatePath('/planos')
  return { ok: true }
}

// TODO(legado: buildPlanos): coluna "Pagar comissão" (ex.: "Comissão na mensalidade · Divisão por
//   quantidade de serviços [%]")  legacy ~7720. Não há coluna de comissão em `planos_assinatura`
//   no schema lkii; pendente de migração (ex.: planos_assinatura.comissao_regra/percentual).
// TODO(legado: buildPlanos): "Cobertura de créditos" (Unidade que realiza a venda) e variações
//   "com/sem adesão" como registros distintos  modeladas no legado como linhas separadas; aqui
//   o valor_adesao=0 já cobre o caso "sem adesão" no mesmo cadastro.
