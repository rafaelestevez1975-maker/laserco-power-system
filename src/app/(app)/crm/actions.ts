'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string }

export type NovoLeadInput = {
  nome: string
  telefone?: string
  origem?: string
  servico_interesse?: string
  valor_estimado?: number | null
  unidade_id: string
  etapa_id: string
}

/** Cria um lead no CRM (respeita RLS/permissão de escrita do usuário). */
export async function criarLead(input: NovoLeadInput): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  if (!input.nome?.trim()) return { ok: false, error: 'Informe o nome do lead.' }
  if (!input.unidade_id) return { ok: false, error: 'Selecione a unidade.' }
  if (!input.etapa_id) return { ok: false, error: 'Etapa inválida.' }

  // empresa_id vem da unidade escolhida
  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  // Constraints reais (migration 015): origem e status têm CHECK fixo.
  const ORIGENS = ['manual', 'formulario', 'instagram', 'whatsapp', 'indicacao', 'google', 'outros']
  const origem = ORIGENS.includes((input.origem || '').toLowerCase()) ? input.origem!.toLowerCase() : 'manual'

  const { error } = await sb.from('crm_leads').insert({
    empresa_id,
    unidade_id: input.unidade_id,
    etapa_id: input.etapa_id,
    responsavel_id: user.id,
    nome: input.nome.trim(),
    telefone: input.telefone?.trim() || null,
    origem,
    servico_interesse: input.servico_interesse?.trim() || null,
    valor_estimado: input.valor_estimado ?? null,
    status: 'ativo',
  })

  if (error) {
    return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Você não tem permissão para criar leads.' : error.message }
  }
  revalidatePath('/crm')
  return { ok: true }
}

/** Move um lead para outra etapa do funil. */
export async function moverLead(leadId: string, etapaId: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  const { error } = await sb.from('crm_leads').update({ etapa_id: etapaId }).eq('id', leadId)
  if (error) {
    return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para mover o lead.' : error.message }
  }
  revalidatePath('/crm')
  return { ok: true }
}

// ─── Personalização do funil (etapas valem para a rede toda → só admin) ───
const SEM_PERM_FUNIL = 'Apenas o administrador da rede personaliza o funil.'

/** Cria uma nova etapa no fim do funil. */
export async function criarEtapa(nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: SEM_PERM_FUNIL }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome da etapa.' }
  const { data: maxRow } = await op.sb.from('crm_etapas').select('ordem').eq('pipeline', 'cliente').order('ordem', { ascending: false }).limit(1).maybeSingle()
  const ordem = (((maxRow as { ordem?: number } | null)?.ordem) ?? 0) + 1
  const { error: e } = await op.sb.from('crm_etapas').insert({ nome: n, ordem, cor: '#8A2A41', is_sistema: false, ativo: true, pipeline: 'cliente' })
  if (e) return { ok: false, error: msgErro(e.message, 'criar etapa') }
  revalidatePath('/crm')
  return { ok: true }
}

/** Renomeia uma etapa. */
export async function renomearEtapa(id: string, nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: SEM_PERM_FUNIL }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome da etapa.' }
  const { error: e } = await op.sb.from('crm_etapas').update({ nome: n }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'renomear etapa') }
  revalidatePath('/crm')
  return { ok: true }
}

/** Remove (desativa) uma etapa — protege etapas do sistema e etapas com leads. */
export async function excluirEtapa(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: SEM_PERM_FUNIL }
  const { data: et } = await op.sb.from('crm_etapas').select('is_sistema').eq('id', id).single()
  if ((et as { is_sistema?: boolean } | null)?.is_sistema) return { ok: false, error: 'Etapas do sistema não podem ser removidas.' }
  const { count } = await op.sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('etapa_id', id)
  if (count && count > 0) return { ok: false, error: `Há ${count} lead(s) nesta etapa. Mova-os antes de remover.` }
  const { error: e } = await op.sb.from('crm_etapas').update({ ativo: false }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'remover etapa') }
  revalidatePath('/crm')
  return { ok: true }
}
