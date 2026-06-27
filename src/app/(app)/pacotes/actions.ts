'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/** Papéis com permissão de escrita no catálogo de pacotes (config da rede).
 *  admin_geral sempre passa (via requireOperador + ehAdmin). */
const PAPEIS_ESCRITA = ['gestor', 'operacoes']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

/** Item da composição: serviço × nº de sessões (pacote_itens.quantidade). */
export type ItemPacoteInput = { servico_id: string; quantidade: number }

export type PacoteInput = {
  nome: string
  descricao?: string | null
  preco: number | null
  validade_dias: number | null
  itens: ItemPacoteInput[]
}

type Op = NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>

/** Resolve a empresa do operador: empresa da unidade do perfil > 1ª empresa visível.
 *  pacotes é escopado por empresa_id (config da franqueadora), não por unidade. */
async function resolverEmpresaId(op: Op): Promise<string | null> {
  const { sb, userId } = op
  const { data: perfil } = await sb.from('perfis_usuario').select('unidade_id').eq('id', userId).maybeSingle()
  const unidadeId = (perfil as { unidade_id?: string | null } | null)?.unidade_id ?? null
  if (unidadeId) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).maybeSingle()
    const eid = (uni as { empresa_id?: string | null } | null)?.empresa_id ?? null
    if (eid) return eid
  }
  // fallback: 1ª empresa visível
  const { data: emp } = await sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  return (emp as { id?: string } | null)?.id ?? null
}

/** Valida os itens da composição contra serviços reais e ativos. Retorna msg de erro ou null. */
async function validarItens(sb: Op['sb'], itens: ItemPacoteInput[]): Promise<string | null> {
  if (!Array.isArray(itens) || itens.length === 0) return 'Adicione ao menos um serviço ao pacote.'
  const ids = itens.map((i) => i.servico_id).filter(Boolean)
  if (ids.length !== itens.length) return 'Selecione o serviço em cada linha da composição.'
  if (new Set(ids).size !== ids.length) return 'Há serviços repetidos na composição. Some as sessões em uma única linha.'
  for (const it of itens) {
    const q = Number(it.quantidade)
    if (!Number.isFinite(q) || q < 1) return 'A quantidade de sessões de cada serviço deve ser 1 ou mais.'
  }
  const { data: servs } = await sb.from('servicos').select('id, ativo').in('id', ids)
  const found = new Map<string, boolean>(((servs ?? []) as { id: string; ativo: boolean | null }[]).map((s) => [s.id, s.ativo !== false]))
  for (const id of ids) {
    if (!found.has(id)) return 'Um dos serviços selecionados não existe mais.'
    if (!found.get(id)) return 'Um dos serviços selecionados está inativo. Remova-o da composição.'
  }
  return null
}

/** Validação de campos comuns (nome/preço/validade). Retorna msg de erro ou null. */
function validarCampos(input: PacoteInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do pacote.'
  if (nome.length < 3) return 'Nome muito curto.'
  if (input.preco == null) return 'Informe o preço do pacote.'
  const preco = Number(input.preco)
  if (!Number.isFinite(preco) || preco < 0) return 'Preço inválido.'
  if (input.validade_dias != null) {
    const v = Number(input.validade_dias)
    if (!Number.isInteger(v) || v < 0) return 'Validade em dias inválida.'
  }
  return null
}

/** Cria um pacote + a composição de serviços (pacote_itens). RBAC + validação por campo. */
export async function criarPacote(input: PacoteInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para criar pacotes.' }

  const errCampo = validarCampos(input)
  if (errCampo) return { ok: false, error: errCampo }
  const errItens = await validarItens(op.sb, input.itens)
  if (errItens) return { ok: false, error: errItens }

  const empresa_id = await resolverEmpresaId(op)

  const { data, error: e } = await op.sb
    .from('pacotes')
    .insert({
      empresa_id,
      nome: input.nome.trim(),
      descricao: (input.descricao || '').trim() || null,
      preco: Number(input.preco),
      validade_dias: input.validade_dias != null ? Number(input.validade_dias) : null,
      ativo: true,
    })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar pacote') }

  const pacoteId = (data as { id: string }).id
  const linhas = input.itens.map((it) => ({ pacote_id: pacoteId, servico_id: it.servico_id, quantidade: Number(it.quantidade) }))
  const { error: e2 } = await op.sb.from('pacote_itens').insert(linhas)
  if (e2) {
    // rollback do cabeçalho p/ não deixar pacote sem itens
    await op.sb.from('pacotes').delete().eq('id', pacoteId)
    return { ok: false, error: msgErro(e2.message, 'salvar a composição do pacote') }
  }

  revalidatePath('/pacotes')
  return { ok: true, id: pacoteId }
}

/** Edita um pacote: cabeçalho + recria a composição (delete + insert). */
export async function editarPacote(id: string, input: PacoteInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar pacotes.' }
  if (!id) return { ok: false, error: 'Pacote inválido.' }

  const errCampo = validarCampos(input)
  if (errCampo) return { ok: false, error: errCampo }
  const errItens = await validarItens(op.sb, input.itens)
  if (errItens) return { ok: false, error: errItens }

  const { error: e } = await op.sb
    .from('pacotes')
    .update({
      nome: input.nome.trim(),
      descricao: (input.descricao || '').trim() || null,
      preco: Number(input.preco),
      validade_dias: input.validade_dias != null ? Number(input.validade_dias) : null,
    })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar pacote') }

  // Recria a composição: apaga as linhas atuais e insere as novas.
  const { error: eDel } = await op.sb.from('pacote_itens').delete().eq('pacote_id', id)
  if (eDel) return { ok: false, error: msgErro(eDel.message, 'atualizar a composição') }
  const linhas = input.itens.map((it) => ({ pacote_id: id, servico_id: it.servico_id, quantidade: Number(it.quantidade) }))
  const { error: eIns } = await op.sb.from('pacote_itens').insert(linhas)
  if (eIns) return { ok: false, error: msgErro(eIns.message, 'salvar a composição do pacote') }

  revalidatePath('/pacotes')
  return { ok: true, id }
}

/** Liga/desliga o pacote (toggle ativo). */
export async function togglePacoteAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar pacotes.' }
  if (!id) return { ok: false, error: 'Pacote inválido.' }

  const { error: e } = await op.sb.from('pacotes').update({ ativo }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'reativar pacote' : 'inativar pacote') }
  revalidatePath('/pacotes')
  return { ok: true }
}

// TODO(legado: buildPacotes): coluna "Pagar comissão" (Venda/Execução/Não pagar) — legacy ~4108,
//   campo pf_com. Não há coluna de comissão em `pacotes` no schema lkii; pendente de migração
//   (ex.: pacotes.comissao_timing). Marcado para não perder o requisito do legado.
// TODO(legado: buildPacotes): "Desconto máximo (%)" (campo pf_desc) e "Cobertura de créditos"
//   (Qualquer unidade / Unidade que realiza a venda) — sem coluna no schema; pendente de migração.
//   Descontos são de outro agente; aqui fica só registrado.
