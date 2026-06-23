'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ChamadoForm = {
  assunto: string
  etiqueta: string
  de_parte: string
  para_parte: string
  prioridade: 'normal' | 'importante' | 'urgente'
  descricao: string
}
export type ActionResult = { ok: boolean; error?: string; id?: string }
export type MensagemRow = { id: string; autor_nome: string | null; papel_remetente: string; mensagem: string; criada_em: string }

const rlsMsg = (m: string, what: string) =>
  /row-level|policy|permission|denied/i.test(m) ? `Sem permissão para ${what}.` : m

async function ctxUser() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { sb, user: null, perfil: null }
  const { data: perfil } = await sb.from('perfis_usuario').select('nome_completo, unidade_id, papel').eq('id', user.id).single()
  return { sb, user, perfil: perfil as { nome_completo?: string; unidade_id?: string | null; papel?: string } | null }
}

/** Abre um chamado e registra a 1ª mensagem (descrição) na thread. */
export async function abrirChamado(form: ChamadoForm): Promise<ActionResult> {
  const { sb, user, perfil } = await ctxUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const assunto = form.assunto?.trim(); const descricao = form.descricao?.trim()
  if (!assunto || !descricao) return { ok: false, error: 'Preencha assunto e descrição.' }

  let empresa_id: string | null = null
  if (perfil?.unidade_id) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', perfil.unidade_id).single()
    empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id ?? null
  }

  const { data: ins, error } = await sb.from('chamados').insert({
    empresa_id,
    assunto,
    etiqueta: form.etiqueta || 'Solicitação',
    de_parte: form.de_parte,
    para_parte: form.para_parte,
    de_unidade_id: perfil?.unidade_id ?? null,
    prioridade: form.prioridade || 'normal',
    descricao,
    aberto_por: user.id,
    aberto_por_nome: perfil?.nome_completo ?? user.email ?? 'Solicitante',
  }).select('id').single()
  if (error) return { ok: false, error: rlsMsg(error.message, 'abrir chamado') }

  const id = (ins as { id?: string })?.id
  if (id) {
    await sb.from('chamado_mensagens').insert({
      chamado_id: id, autor_id: user.id, autor_nome: perfil?.nome_completo ?? null,
      papel_remetente: 'solicitante', mensagem: descricao,
    })
  }
  revalidatePath('/chamados')
  return { ok: true, id }
}

/** Carrega a thread de um chamado (mensagens em ordem). */
export async function carregarThread(chamadoId: string): Promise<{ ok: boolean; error?: string; mensagens?: MensagemRow[] }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { data, error } = await sb.from('chamado_mensagens')
    .select('id, autor_nome, papel_remetente, mensagem, criada_em')
    .eq('chamado_id', chamadoId).order('criada_em', { ascending: true })
  if (error) return { ok: false, error: error.message }
  return { ok: true, mensagens: (data ?? []) as MensagemRow[] }
}

/** Registra um retorno (mensagem) na thread do chamado. */
export async function responderChamado(chamadoId: string, mensagem: string): Promise<ActionResult> {
  const { sb, user, perfil } = await ctxUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const txt = mensagem?.trim(); if (!txt) return { ok: false, error: 'Escreva uma mensagem.' }

  const { data: cham } = await sb.from('chamados').select('aberto_por, responsavel_id').eq('id', chamadoId).single()
  const c = cham as { aberto_por?: string; responsavel_id?: string } | null
  const ehResp = perfil?.papel === 'admin_geral' || c?.responsavel_id === user.id || (c?.aberto_por !== user.id)
  const { error } = await sb.from('chamado_mensagens').insert({
    chamado_id: chamadoId, autor_id: user.id, autor_nome: perfil?.nome_completo ?? null,
    papel_remetente: ehResp ? 'responsavel' : 'solicitante', mensagem: txt,
  })
  if (error) return { ok: false, error: rlsMsg(error.message, 'responder o chamado') }
  revalidatePath('/chamados')
  return { ok: true }
}

/** Finaliza ou reabre um chamado. */
export async function finalizarChamado(chamadoId: string, finalizar: boolean): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { error } = await sb.from('chamados')
    .update({ finalizado: finalizar, finalizado_em: finalizar ? new Date().toISOString() : null })
    .eq('id', chamadoId)
  if (error) return { ok: false, error: rlsMsg(error.message, 'alterar o chamado') }
  revalidatePath('/chamados')
  return { ok: true }
}
