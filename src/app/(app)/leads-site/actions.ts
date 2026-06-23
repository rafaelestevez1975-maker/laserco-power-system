'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { siteClient } from '@/lib/supabase/site'

export type RouteResult = { ok: boolean; error?: string; destino?: 'CRM' | 'SAC' }

type Parsed = { tipo: string; nome: string; email: string | null; tel: string | null; mensagem: string | null; area: string | null }
const ORIGEM_CRM: Record<string, string> = { indicacao: 'indicacao', oferta: 'formulario', avaliacao: 'formulario', agendamento: 'formulario', franquia: 'formulario' }

/** Roteia um lead do site (fonte real riut.lasercompany_leads, ou fallback lkii.site_leads)
 *  para o destino certo (sac → sac_tickets; demais → crm_leads) na unidade escolhida,
 *  e marca a origem como roteada. */
export async function rotearSiteLead(siteLeadId: string, unidadeId: string): Promise<RouteResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!unidadeId) return { ok: false, error: 'Selecione a unidade de destino.' }

  const site = siteClient()
  let parsed: Parsed | null = null
  let jaRoteado = false

  if (site) {
    const { data } = await site.from('lasercompany_leads').select('id, tipo, nome, telefone, email, dados').eq('id', siteLeadId).single()
    const r = data as { tipo?: string; nome?: string; telefone?: string; email?: string; dados?: Record<string, unknown> } | null
    if (!r) return { ok: false, error: 'Lead do site não encontrado.' }
    const d = (r.dados ?? {}) as Record<string, string | boolean | undefined>
    jaRoteado = d._roteado === true
    parsed = { tipo: (r.tipo ?? '').toLowerCase(), nome: r.nome || (d.nome as string) || 'Lead do site',
      email: r.email || (d.email as string) || null, tel: r.telefone || (d.telefone as string) || (d.whatsapp as string) || null,
      mensagem: (d.mensagem as string) || null, area: (d.area as string) || null }
  } else {
    const { data } = await sb.from('site_leads').select('id, data').eq('id', siteLeadId).single()
    const row = data as { data?: { tipo?: string; status?: string; dados?: Record<string, string> } } | null
    if (!row) return { ok: false, error: 'Lead do site não encontrado.' }
    jaRoteado = row.data?.status === 'roteado'
    const d = row.data?.dados ?? {}
    parsed = { tipo: (row.data?.tipo ?? '').toLowerCase(), nome: d.nome?.trim() || 'Lead do site', email: d.email || null,
      tel: d.whatsapp || d.telefone || null, mensagem: d.mensagem || null, area: d.area || null }
  }
  if (jaRoteado) return { ok: false, error: 'Este lead já foi roteado.' }

  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  let destino: 'CRM' | 'SAC'
  let novoId: string | undefined

  if (parsed.tipo === 'sac') {
    destino = 'SAC'
    const { data: ins, error } = await sb.from('sac_tickets').insert({
      empresa_id, unidade_id: unidadeId, nome_cliente: parsed.nome, email_cliente: parsed.email, telefone_cliente: parsed.tel,
      assunto: parsed.area || 'Atendimento (site)', canal: 'formulario', status: 'aberto', prioridade: 'media',
      area_reclamada: parsed.area, observacoes: parsed.mensagem,
    }).select('id').single()
    if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão p/ criar chamado.' : error.message }
    novoId = (ins as { id?: string })?.id
  } else {
    destino = 'CRM'
    const { data: etapa } = await sb.from('crm_etapas').select('id').eq('ativo', true).order('ordem', { ascending: true }).limit(1).single()
    const etapa_id = (etapa as { id?: string } | null)?.id
    if (!etapa_id) return { ok: false, error: 'Funil do CRM sem etapas.' }
    const { data: ins, error } = await sb.from('crm_leads').insert({
      empresa_id, unidade_id: unidadeId, etapa_id, responsavel_id: user.id, nome: parsed.nome, telefone: parsed.tel, email: parsed.email,
      origem: ORIGEM_CRM[parsed.tipo] || 'formulario', servico_interesse: parsed.area || parsed.tipo || null, observacoes: parsed.mensagem, status: 'ativo',
    }).select('id').single()
    if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão p/ criar lead.' : error.message }
    novoId = (ins as { id?: string })?.id
  }

  // marca a origem como roteada
  const marca = { _roteado: true, _routed_to: destino, _routed_id: novoId, _routed_at: new Date().toISOString() }
  if (site) {
    const { data: cur } = await site.from('lasercompany_leads').select('dados').eq('id', siteLeadId).single()
    const dados = { ...((cur as { dados?: object })?.dados ?? {}), ...marca }
    await site.from('lasercompany_leads').update({ dados }).eq('id', siteLeadId)
  } else {
    const { data: cur } = await sb.from('site_leads').select('data').eq('id', siteLeadId).single()
    const dataNova = { ...((cur as { data?: object })?.data ?? {}), status: 'roteado', routed_to: destino, routed_id: novoId, routed_at: marca._routed_at }
    await sb.from('site_leads').update({ data: dataNova }).eq('id', siteLeadId)
  }

  revalidatePath('/leads-site'); revalidatePath('/crm')
  return { ok: true, destino }
}
