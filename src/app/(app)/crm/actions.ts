'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
