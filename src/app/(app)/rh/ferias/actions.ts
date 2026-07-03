'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type Operador } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string }

/**
 * RH · Férias e Ausências  Server Actions.
 *
 * Tabelas reais (lkii):
 *   solicitacoes_ferias(colaborador_id, periodo_aquisitivo, data_inicio, data_fim,
 *                       dias_solicitados, vender_dias, status, motivo, aprovado_por)
 *   atestados(colaborador_id, data_inicio, dias, cid, data_entrega, status, observacoes)
 *
 * RBAC (legado: permissão "Férias e Afastamentos  Gerenciar"):
 *   - rh / gestor / gerente / admin_geral: aprovam, recusam e lançam para qualquer colaborador da unidade.
 *   - colaborador comum: só cria solicitação/atestado para o SEU próprio registro (colaboradores.perfil_id = user).
 */
const PAPEIS_APROVA = ['gestor', 'gerente', 'rh']

/** Diferença em dias (inclusive) entre duas datas YYYY-MM-DD. */
function difDias(ini: string, fim: string): number {
  const a = new Date(ini + 'T00:00:00')
  const b = new Date(fim + 'T00:00:00')
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

/** Pode gerenciar (aprovar/recusar/lançar para terceiros)? */
function podeGerenciar(papel: string | null | undefined): boolean {
  return temPapel(papel, ...PAPEIS_APROVA)
}

/** Resolve o colaborador vinculado ao usuário logado (colaboradores.perfil_id). */
async function meuColaboradorId(op: Operador): Promise<string | null> {
  const { data } = await op.sb.from('colaboradores').select('id').eq('perfil_id', op.userId).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

/**
 * Confere se o operador pode lançar para `colaboradorId`.
 * Gestão/RH: qualquer um. Colaborador comum: só o seu próprio registro.
 */
async function podeLancarPara(op: Operador, colaboradorId: string): Promise<ActionResult> {
  if (podeGerenciar(op.papel)) return { ok: true }
  const meu = await meuColaboradorId(op)
  if (!meu) return { ok: false, error: 'Seu usuário não está vinculado a um colaborador de RH. Procure o RH.' }
  if (meu !== colaboradorId) return { ok: false, error: 'Você só pode lançar solicitações para si mesmo.' }
  return { ok: true }
}

// ─────────────────────────── Férias ───────────────────────────

export type NovaFeriasInput = {
  colaborador_id: string
  periodo_aquisitivo?: string
  data_inicio: string
  data_fim: string
  vender_dias?: number
  motivo?: string
}

/** Cria uma solicitação de férias (status pendente). Colaborador comum só cria a sua. */
export async function solicitarFerias(input: NovaFeriasInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  if (!input.colaborador_id) return { ok: false, error: 'Selecione o colaborador.' }
  if (!input.data_inicio || !input.data_fim) return { ok: false, error: 'Informe o período de férias.' }
  if (isNaN(new Date(input.data_inicio).getTime()) || isNaN(new Date(input.data_fim).getTime())) {
    return { ok: false, error: 'Datas inválidas.' }
  }
  const dias = difDias(input.data_inicio, input.data_fim)
  if (dias <= 0) return { ok: false, error: 'Período inválido (a data fim deve ser igual ou após o início).' }
  if (dias > 30) return { ok: false, error: 'O período de férias não pode exceder 30 dias.' }
  // Abono pecuniário: até 1/3 das férias (10 de 30 dias)  regra CLT.
  const vender = Math.max(0, Math.min(10, Math.round(input.vender_dias || 0)))

  const perm = await podeLancarPara(op, input.colaborador_id)
  if (!perm.ok) return perm

  const { error: e } = await op.sb.from('solicitacoes_ferias').insert({
    colaborador_id: input.colaborador_id,
    periodo_aquisitivo: input.periodo_aquisitivo?.trim() || null,
    data_inicio: input.data_inicio,
    data_fim: input.data_fim,
    dias_solicitados: dias,
    vender_dias: vender,
    status: 'pendente',
    motivo: input.motivo?.trim() || null,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'solicitar as férias') }

  revalidatePath('/rh/ferias')
  return { ok: true }
}

/** Aprova / recusa / cancela uma solicitação de férias. Só gestão/RH. */
export async function decidirFerias(
  id: string,
  status: 'aprovada' | 'reprovada' | 'cancelada',
  motivo?: string,
): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerenciar(op.papel)) return { ok: false, error: 'Você não tem permissão para decidir férias.' }
  if (!id) return { ok: false, error: 'Solicitação inválida.' }
  if (!['aprovada', 'reprovada', 'cancelada'].includes(status)) return { ok: false, error: 'Status inválido.' }

  // Confere o estado atual: só decide quem está pendente (evita re-decidir).
  const { data: atualRaw } = await op.sb.from('solicitacoes_ferias').select('status').eq('id', id).maybeSingle()
  const atual = atualRaw as { status?: string } | null
  if (!atual) return { ok: false, error: 'Solicitação não encontrada.' }
  if (atual.status !== 'pendente') return { ok: false, error: 'Esta solicitação já foi decidida.' }

  const patch: Record<string, unknown> = {
    status,
    aprovado_por: op.userId,
    atualizado_em: new Date().toISOString(),
  }
  if (status !== 'aprovada' && motivo?.trim()) patch.motivo = motivo.trim()

  const { error: e } = await op.sb.from('solicitacoes_ferias').update(patch).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'decidir as férias') }

  revalidatePath('/rh/ferias')
  return { ok: true }
}

// ─────────────────────────── Atestados ───────────────────────────

export type NovoAtestadoInput = {
  colaborador_id: string
  data_inicio: string
  dias: number
  cid?: string
  data_entrega?: string
  observacoes?: string
}

/** Registra um atestado médico (status pendente). Colaborador comum só registra o seu. */
export async function registrarAtestado(input: NovoAtestadoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  if (!input.colaborador_id) return { ok: false, error: 'Selecione o colaborador.' }
  if (!input.data_inicio) return { ok: false, error: 'Informe a data de início do atestado.' }
  if (isNaN(new Date(input.data_inicio).getTime())) return { ok: false, error: 'Data de início inválida.' }
  const dias = Math.max(1, Math.round(input.dias || 1))
  if (dias > 365) return { ok: false, error: 'Número de dias inválido.' }
  if (input.data_entrega && isNaN(new Date(input.data_entrega).getTime())) {
    return { ok: false, error: 'Data de entrega inválida.' }
  }

  const perm = await podeLancarPara(op, input.colaborador_id)
  if (!perm.ok) return perm

  const { error: e } = await op.sb.from('atestados').insert({
    colaborador_id: input.colaborador_id,
    data_inicio: input.data_inicio,
    dias,
    cid: input.cid?.trim() || null,
    data_entrega: input.data_entrega || null,
    status: 'pendente',
    observacoes: input.observacoes?.trim() || null,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'registrar o atestado') }

  revalidatePath('/rh/ferias')
  return { ok: true }
}

/** Aprova / recusa um atestado. Só gestão/RH. */
export async function decidirAtestado(id: string, status: 'aprovado' | 'reprovado'): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeGerenciar(op.papel)) return { ok: false, error: 'Você não tem permissão para decidir atestados.' }
  if (!id) return { ok: false, error: 'Atestado inválido.' }
  if (!['aprovado', 'reprovado'].includes(status)) return { ok: false, error: 'Status inválido.' }

  const { data: atualRaw } = await op.sb.from('atestados').select('status').eq('id', id).maybeSingle()
  const atual = atualRaw as { status?: string } | null
  if (!atual) return { ok: false, error: 'Atestado não encontrado.' }
  if (atual.status !== 'pendente') return { ok: false, error: 'Este atestado já foi decidido.' }

  const { error: e } = await op.sb
    .from('atestados')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'decidir o atestado') }

  revalidatePath('/rh/ferias')
  return { ok: true }
}
