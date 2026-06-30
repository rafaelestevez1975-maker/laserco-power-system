'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { siteClient } from '@/lib/supabase/site'
import { FRANQUEADORA_EMPRESA_ID } from '@/lib/sac-ingest'

export type RouteResult = { ok: boolean; error?: string; destino?: 'CRM' | 'SAC' | 'RH' }

type Parsed = { tipo: string; nome: string; email: string | null; tel: string | null; mensagem: string | null; area: string | null }
const ORIGEM_CRM: Record<string, string> = { indicacao: 'indicacao', oferta: 'formulario', avaliacao: 'formulario', agendamento: 'formulario', franquia: 'formulario' }

/** Roteia um lead do site (fonte real riut.lasercompany_leads, ou fallback lkii.site_leads)
 *  para o destino certo (sac → sac_tickets; demais → crm_leads) na unidade escolhida,
 *  e marca a origem como roteada. */
export async function rotearSiteLead(siteLeadId: string, unidadeId: string): Promise<RouteResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

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

  let destino: 'CRM' | 'SAC' | 'RH'
  let novoId: string | undefined

  async function marcarRoteado(dest: string, nid?: string) {
    const at = new Date().toISOString()
    if (site) {
      const { data: cur } = await site.from('lasercompany_leads').select('dados').eq('id', siteLeadId).single()
      const dados = { ...((cur as { dados?: object })?.dados ?? {}), _roteado: true, _routed_to: dest, _routed_id: nid, _routed_at: at }
      await site.from('lasercompany_leads').update({ dados }).eq('id', siteLeadId)
    } else {
      const { data: cur } = await sb.from('site_leads').select('data').eq('id', siteLeadId).single()
      const dataNova = { ...((cur as { data?: object })?.data ?? {}), status: 'roteado', routed_to: dest, routed_id: nid, routed_at: at }
      await sb.from('site_leads').update({ data: dataNova }).eq('id', siteLeadId)
    }
    revalidatePath('/leads-site'); revalidatePath('/crm')
  }

  // Currículo → RH: candidato no "Banco de Talentos (Site)" (candidatos.vaga_id é obrigatório).
  if (parsed.tipo === 'curriculo') {
    destino = 'RH'
    // garante a vaga guarda-chuva
    const { data: vExist } = await sb.from('vagas').select('id').eq('titulo', 'Banco de Talentos (Site)').limit(1).maybeSingle()
    let vagaId = (vExist as { id?: string } | null)?.id
    if (!vagaId) {
      let uniId: string | undefined = unidadeId || undefined
      if (!uniId) { const { data: u } = await sb.from('unidades').select('id').eq('ativa', true).order('nome', { ascending: true }).limit(1).single(); uniId = (u as { id?: string } | null)?.id }
      if (!uniId) return { ok: false, error: 'Sem unidade para vincular o banco de talentos.' }
      const { data: nv, error: ev } = await sb.from('vagas').insert({ unidade_id: uniId, titulo: 'Banco de Talentos (Site)', cargo: 'consultora_vendas', status: 'aberta', total_vagas: 99 }).select('id').single()
      if (ev) return { ok: false, error: /row-level|policy|permission/i.test(ev.message) ? 'Sem permissão p/ criar vaga.' : ev.message }
      vagaId = (nv as { id?: string })?.id
    }
    const notas = [parsed.area && `Cargo/área: ${parsed.area}`, parsed.mensagem].filter(Boolean).join(' · ')
    const { data: ins, error } = await sb.from('candidatos').insert({
      vaga_id: vagaId, nome: parsed.nome, email: parsed.email, telefone: parsed.tel || '',
      fonte: 'portal', estagio_kanban: 'triagem', notas_internas: notas || null,
    }).select('id').single()
    if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão p/ cadastrar candidato.' : error.message }
    novoId = (ins as { id?: string })?.id
    await marcarRoteado(destino, novoId); return { ok: true, destino }
  }

  // SAC é CENTRALIZADO na FRANQUEADORA (não existe SAC em franquia): empresa = franqueadora,
  // unidade_id = null. Não exige unidade — diferente de CRM/RH. (No fluxo normal o SAC nem
  // chega aqui: é ingerido automaticamente por lib/sac-ingest; isto é só o caminho manual.)
  if (parsed.tipo === 'sac') {
    destino = 'SAC'
    const { data: ins, error } = await sb.from('sac_tickets').insert({
      empresa_id: FRANQUEADORA_EMPRESA_ID, unidade_id: null,
      nome_cliente: parsed.nome, email_cliente: parsed.email, telefone_cliente: parsed.tel,
      assunto: parsed.area || 'Atendimento (site)', canal: 'formulario', status: 'aberto', prioridade: 'media',
      area_reclamada: parsed.area, observacoes: parsed.mensagem,
    }).select('id').single()
    if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão p/ criar chamado.' : error.message }
    novoId = (ins as { id?: string })?.id
    await marcarRoteado(destino, novoId)
    return { ok: true, destino }
  }

  // CRM (demais tipos comerciais) — exige unidade de destino.
  if (!unidadeId) return { ok: false, error: 'Selecione a unidade de destino.' }
  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  {
    destino = 'CRM'
    // Etapa inicial DO FUNIL DE CLIENTES (pipeline='cliente') — a migration 050 criou
    // etapas de 'franquia' com a mesma ordem 1..6, então sem o filtro o .single()
    // quebraria por múltiplas linhas (ou pegaria uma etapa de franquia) e o lead sumiria
    // do board do CRM (que só renderiza etapas pipeline='cliente').
    const { data: etapa, error: eEtapa } = await sb.from('crm_etapas')
      .select('id').eq('ativo', true).eq('pipeline', 'cliente')
      .order('ordem', { ascending: true }).limit(1).maybeSingle()
    if (eEtapa) return { ok: false, error: 'Não foi possível ler o funil do CRM.' }
    const etapa_id = (etapa as { id?: string } | null)?.id
    if (!etapa_id) return { ok: false, error: 'Funil do CRM sem etapas.' }
    const { data: ins, error } = await sb.from('crm_leads').insert({
      empresa_id, unidade_id: unidadeId, etapa_id, responsavel_id: user.id, nome: parsed.nome, telefone: parsed.tel, email: parsed.email,
      origem: ORIGEM_CRM[parsed.tipo] || 'formulario', servico_interesse: parsed.area || parsed.tipo || null, observacoes: parsed.mensagem, status: 'ativo', pipeline: 'cliente',
    }).select('id').single()
    if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão p/ criar lead.' : error.message }
    novoId = (ins as { id?: string })?.id
  }

  await marcarRoteado(destino, novoId)
  return { ok: true, destino }
}
