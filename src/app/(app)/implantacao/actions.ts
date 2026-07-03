'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'
import { IMPL_WF, IMPL_ST } from '@/lib/implantacao'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * IMPLANTAÇÃO DE UNIDADE  backend lkii (migration scripts/migrations/implantacao.sql):
 *   implantacao_projetos(id, empresa_id, unidade_id, nome, inicio, inauguracao, status)
 *   implantacao_etapas(id, projeto_id, cod, nome, ordem)
 *   implantacao_tarefas(id, etapa_id, cod, descricao, responsavel, duracao_dias, situacao, ordem)
 *
 * RBAC (espelha o legado: "só admin edita o fluxo; demais perfis atualizam a
 * situação"): criar/editar/excluir projeto/etapa/tarefa = admin_geral / gestor;
 * alterar SITUAÇÃO de tarefa = qualquer operador logado.
 */
const PAPEIS_EDITA = ['gestor']

function podeEditar(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_EDITA.includes(papel || '')
}

/** Grava 1 linha em audit_log (best-effort  nunca derruba a operação). */
async function audit(userId: string, acao: string, label: string, dados: Record<string, unknown>): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId,
      acao,
      recurso_id: 'implantacao',
      recurso_label: label,
      dados_depois: dados,
      origem: 'web',
      resultado: 'sucesso',
    })
  } catch {
    /* auditoria é secundária */
  }
}

// ───────────────────────────── Cabeçalho do projeto ─────────────────────────

export type ProjetoInput = {
  projetoId: string
  nome: string
  inicio: string | null // YYYY-MM-DD
  inauguracao: string | null
  unidadeId?: string | null
}

export async function salvarProjeto(input: ProjetoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Somente administradores e gestores editam o projeto de implantação.' }
  if (!input.projetoId) return { ok: false, error: 'Projeto inválido.' }
  const nome = (input.nome || '').trim()
  if (nome.length < 3) return { ok: false, error: 'Informe a unidade / projeto.' }
  if (input.inicio && input.inauguracao && input.inauguracao < input.inicio) {
    return { ok: false, error: 'A inauguração não pode ser anterior ao início.' }
  }

  const patch: Record<string, unknown> = {
    nome,
    inicio: input.inicio || null,
    inauguracao: input.inauguracao || null,
    atualizado_em: new Date().toISOString(),
  }
  if (input.unidadeId !== undefined) patch.unidade_id = input.unidadeId || null

  const { error: e } = await op.sb.from('implantacao_projetos').update(patch).eq('id', input.projetoId)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar projeto de implantação') }

  await audit(op.userId, 'implantacao.projeto.editar', nome, { inicio: input.inicio, inauguracao: input.inauguracao })
  revalidatePath('/implantacao')
  return { ok: true }
}

// ───────────────────────────── Situação da tarefa ───────────────────────────

/** Qualquer operador pode mudar a situação de uma tarefa (recalcula progresso no render). */
export async function definirSituacao(tarefaId: string, situacao: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!tarefaId) return { ok: false, error: 'Tarefa inválida.' }
  if (!IMPL_ST.includes(situacao as (typeof IMPL_ST)[number])) return { ok: false, error: 'Situação inválida.' }

  const { error: e } = await op.sb
    .from('implantacao_tarefas')
    .update({ situacao, atualizado_em: new Date().toISOString() })
    .eq('id', tarefaId)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar situação da tarefa') }

  await audit(op.userId, 'implantacao.tarefa.situacao', `Tarefa → ${situacao}`, { tarefaId, situacao })
  revalidatePath('/implantacao')
  return { ok: true }
}

// ───────────────────────────── Editar tarefa (admin) ────────────────────────

export type TarefaPatch = {
  tarefaId: string
  descricao?: string
  responsavel?: string
  duracao_dias?: number
}

export async function editarTarefa(input: TarefaPatch): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Somente administradores e gestores editam tarefas.' }
  if (!input.tarefaId) return { ok: false, error: 'Tarefa inválida.' }

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (input.descricao !== undefined) {
    const d = input.descricao.trim()
    if (d.length < 2) return { ok: false, error: 'Descrição muito curta.' }
    patch.descricao = d
  }
  if (input.responsavel !== undefined) {
    if (!IMPL_WF.includes(input.responsavel as (typeof IMPL_WF)[number])) return { ok: false, error: 'Responsável inválido.' }
    patch.responsavel = input.responsavel
  }
  if (input.duracao_dias !== undefined) {
    const n = Number(input.duracao_dias)
    if (!Number.isInteger(n) || n < 1 || n > 365) return { ok: false, error: 'Duração deve ser entre 1 e 365 dias.' }
    patch.duracao_dias = n
  }

  const { error: e } = await op.sb.from('implantacao_tarefas').update(patch).eq('id', input.tarefaId)
  if (e) return { ok: false, error: msgErro(e.message, 'editar tarefa') }
  revalidatePath('/implantacao')
  return { ok: true }
}

export async function adicionarTarefa(etapaId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Somente administradores e gestores adicionam tarefas.' }
  if (!etapaId) return { ok: false, error: 'Etapa inválida.' }

  const { data: ult } = await op.sb
    .from('implantacao_tarefas')
    .select('ordem')
    .eq('etapa_id', etapaId)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ordem = ((ult as { ordem: number } | null)?.ordem ?? 0) + 1
  const cod = 'T' + String(Date.now()).slice(-3)

  const { data, error: e } = await op.sb
    .from('implantacao_tarefas')
    .insert({ etapa_id: etapaId, cod, descricao: 'Nova tarefa', responsavel: 'Implantação', duracao_dias: 1, situacao: 'Aberto', ordem })
    .select('id')
    .single()
  if (e || !data) return { ok: false, error: msgErro(e?.message, 'adicionar tarefa') }
  revalidatePath('/implantacao')
  return { ok: true, id: (data as { id: string }).id }
}

export async function excluirTarefa(tarefaId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Somente administradores e gestores excluem tarefas.' }
  if (!tarefaId) return { ok: false, error: 'Tarefa inválida.' }

  const { error: e } = await op.sb.from('implantacao_tarefas').delete().eq('id', tarefaId)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir tarefa') }
  await audit(op.userId, 'implantacao.tarefa.excluir', 'Tarefa excluída', { tarefaId })
  revalidatePath('/implantacao')
  return { ok: true }
}

// ───────────────────────────── Etapas (admin) ───────────────────────────────

export async function editarEtapa(etapaId: string, nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Somente administradores e gestores editam etapas.' }
  if (!etapaId) return { ok: false, error: 'Etapa inválida.' }
  const n = (nome || '').trim()
  if (n.length < 3) return { ok: false, error: 'Nome de etapa muito curto.' }

  const { error: e } = await op.sb.from('implantacao_etapas').update({ nome: n }).eq('id', etapaId)
  if (e) return { ok: false, error: msgErro(e.message, 'editar etapa') }
  revalidatePath('/implantacao')
  return { ok: true }
}

export async function adicionarEtapa(projetoId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Somente administradores e gestores adicionam etapas.' }
  if (!projetoId) return { ok: false, error: 'Projeto inválido.' }

  const { data: ult } = await op.sb
    .from('implantacao_etapas')
    .select('ordem')
    .eq('projeto_id', projetoId)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ordem = ((ult as { ordem: number } | null)?.ordem ?? 0) + 1
  const cod = 'F' + String(ordem).padStart(2, '0')

  const { data, error: e } = await op.sb
    .from('implantacao_etapas')
    .insert({ projeto_id: projetoId, cod, nome: 'NOVA ETAPA', ordem })
    .select('id')
    .single()
  if (e || !data) return { ok: false, error: msgErro(e?.message, 'adicionar etapa') }

  // Cria uma tarefa inicial na etapa nova (espelha implAddF do legado).
  await op.sb
    .from('implantacao_tarefas')
    .insert({ etapa_id: (data as { id: string }).id, cod: 'T' + String(Date.now()).slice(-3), descricao: 'Nova tarefa', responsavel: 'Implantação', duracao_dias: 1, situacao: 'Aberto', ordem: 1 })

  await audit(op.userId, 'implantacao.etapa.adicionar', cod, { projetoId })
  revalidatePath('/implantacao')
  return { ok: true, id: (data as { id: string }).id }
}

export async function excluirEtapa(etapaId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Somente administradores e gestores excluem etapas.' }
  if (!etapaId) return { ok: false, error: 'Etapa inválida.' }

  // ON DELETE CASCADE remove as tarefas da etapa.
  const { error: e } = await op.sb.from('implantacao_etapas').delete().eq('id', etapaId)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir etapa') }
  await audit(op.userId, 'implantacao.etapa.excluir', 'Etapa excluída', { etapaId })
  revalidatePath('/implantacao')
  return { ok: true }
}
