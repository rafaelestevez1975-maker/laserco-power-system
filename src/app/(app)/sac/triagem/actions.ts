'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { listInstances, sendText } from '@/lib/uazapi'

/** Responde uma conversa pelo canal conectado e registra a mensagem (saída). */
export async function responderConversa(chatId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!texto.trim()) return { ok: false, error: 'Escreva a mensagem.' }

  const { data: chat } = await sb.from('sac_whatsapp_chats').select('id, telefone').eq('id', chatId).single()
  const c = chat as { telefone?: string } | null
  if (!c?.telefone) return { ok: false, error: 'Conversa não encontrada.' }

  const all = await listInstances()
  const canal = all.find((i) => /laser/i.test(i.name) && i.status === 'connected')
  if (!canal?.token) return { ok: false, error: 'Nenhum canal WhatsApp conectado  conecte um número em Canais.' }

  const env = await sendText(canal.token, c.telefone, texto.trim())
  if (!env.ok) return { ok: false, error: env.error || 'Falha no envio.' }

  const agora = new Date().toISOString()
  await sb.from('sac_whatsapp_mensagens').insert({
    chat_id: chatId, direcao: 'saida', autor: 'Atendente', tipo: 'text', texto: texto.trim(), status: 'sent', criado_em: agora,
  })
  await sb.from('sac_whatsapp_chats').update({ ultima_msg: texto.trim().slice(0, 120), ultima_msg_tipo: 'text', ultima_msg_em: agora }).eq('id', chatId)

  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Abre um chamado no SAC a partir da conversa e vincula o chat ao ticket. */
export async function abrirChamadoDaConversa(chatId: string): Promise<{ ok: boolean; error?: string; jaExistia?: boolean }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  const { data: chat } = await sb.from('sac_whatsapp_chats').select('id, telefone, nome, ticket_id').eq('id', chatId).single()
  const c = chat as { telefone?: string; nome?: string; ticket_id?: string | null } | null
  if (!c) return { ok: false, error: 'Conversa não encontrada.' }
  if (c.ticket_id) return { ok: true, jaExistia: true }

  const { data: emp } = await sb.from('empresas').select('id').limit(1).single()
  const empresa_id = (emp as { id?: string } | null)?.id
  if (!empresa_id) return { ok: false, error: 'Empresa não encontrada.' }

  const { data: ins, error } = await sb.from('sac_tickets').insert({
    empresa_id, nome_cliente: c.nome || c.telefone || 'Cliente WhatsApp', telefone_cliente: c.telefone || null,
    assunto: 'Atendimento WhatsApp', canal: 'WhatsApp', status: 'aberto', prioridade: 'media', fase: 'Novo',
  }).select('id').single()
  if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para abrir chamado.' : error.message }

  await sb.from('sac_whatsapp_chats').update({ ticket_id: (ins as { id?: string })?.id }).eq('id', chatId)
  revalidatePath('/sac/triagem'); revalidatePath('/sac/chamados'); revalidatePath('/sac')
  return { ok: true }
}
