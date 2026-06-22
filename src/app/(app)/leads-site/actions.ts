'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type RouteResult = { ok: boolean; error?: string; destino?: 'CRM' | 'SAC' }

type SiteLeadData = {
  tipo?: string
  origem?: string
  status?: string | null
  dados?: { nome?: string; email?: string; whatsapp?: string; telefone?: string; mensagem?: string; area?: string; servico?: string }
  [k: string]: unknown
}

const ORIGEM_CRM: Record<string, string> = { indicacao: 'indicacao', oferta: 'formulario', avaliacao: 'formulario', agendamento: 'formulario', franquia: 'formulario' }

/** Roteia um lead do site para o destino certo (SAC para tipo 'sac'; CRM para os demais),
 *  vinculando à unidade escolhida, e marca o site_lead como roteado. */
export async function rotearSiteLead(siteLeadId: string, unidadeId: string): Promise<RouteResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!unidadeId) return { ok: false, error: 'Selecione a unidade de destino.' }

  const { data: leadRow } = await sb.from('site_leads').select('id, data').eq('id', siteLeadId).single()
  const row = leadRow as { id: string; data: SiteLeadData } | null
  if (!row) return { ok: false, error: 'Lead do site não encontrado.' }
  if (row.data?.status === 'roteado') return { ok: false, error: 'Este lead já foi roteado.' }

  const d = row.data?.dados ?? {}
  const tipo = (row.data?.tipo ?? '').toLowerCase()
  const nome = d.nome?.trim() || 'Lead do site'
  const tel = d.whatsapp || d.telefone || null

  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  let destino: 'CRM' | 'SAC'
  let novoId: string | undefined

  if (tipo === 'sac') {
    destino = 'SAC'
    const { data: ins, error } = await sb.from('sac_tickets').insert({
      empresa_id, unidade_id: unidadeId,
      nome_cliente: nome, email_cliente: d.email || null, telefone_cliente: tel,
      assunto: d.area || 'Atendimento (site)', canal: 'formulario',
      status: 'aberto', prioridade: 'media',
      area_reclamada: d.area || null, observacoes: d.mensagem || null,
    }).select('id').single()
    if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para criar chamado no SAC.' : error.message }
    novoId = (ins as { id?: string } | null)?.id
  } else {
    destino = 'CRM'
    const { data: etapa } = await sb.from('crm_etapas').select('id').eq('ativo', true).order('ordem', { ascending: true }).limit(1).single()
    const etapa_id = (etapa as { id?: string } | null)?.id
    if (!etapa_id) return { ok: false, error: 'Funil do CRM sem etapas.' }
    const { data: ins, error } = await sb.from('crm_leads').insert({
      empresa_id, unidade_id: unidadeId, etapa_id, responsavel_id: user.id,
      nome, telefone: tel, email: d.email || null,
      origem: ORIGEM_CRM[tipo] || 'formulario',
      servico_interesse: d.servico || d.area || tipo || null,
      observacoes: d.mensagem || null, status: 'ativo',
    }).select('id').single()
    if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para criar lead no CRM.' : error.message }
    novoId = (ins as { id?: string } | null)?.id
  }

  // marca o site_lead como roteado (preserva o jsonb original)
  const novaData = { ...row.data, status: 'roteado', routed_to: destino, routed_id: novoId, routed_unidade: unidadeId, routed_at: new Date().toISOString() }
  await sb.from('site_leads').update({ data: novaData }).eq('id', siteLeadId)

  revalidatePath('/leads-site')
  revalidatePath('/crm')
  return { ok: true, destino }
}
