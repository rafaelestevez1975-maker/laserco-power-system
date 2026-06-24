'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { listInstances, sendText } from '@/lib/uazapi'

type Perfil = { nome_completo?: string; papel?: string; unidade_id?: string | null }
async function operador(sb: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { user: null, nome: '', perfil: null as Perfil | null }
  const { data } = await sb.from('perfis_usuario').select('nome_completo, papel, unidade_id').eq('id', user.id).single()
  const p = data as Perfil | null
  return { user, nome: p?.nome_completo || user.email || 'Atendente', perfil: p }
}

/** Responde a conversa pelo canal conectado, registra a saída com o ATENDENTE real
 *  e assume a conversa (atribui ao atendente + pausa o bot). */
export async function responderConversa(chatId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { user, nome } = await operador(sb)
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!texto.trim()) return { ok: false, error: 'Escreva a mensagem.' }

  const { data: chat } = await sb.from('sac_whatsapp_chats').select('id, telefone, atendente_id').eq('id', chatId).single()
  const c = chat as { telefone?: string; atendente_id?: string | null } | null
  if (!c?.telefone) return { ok: false, error: 'Conversa não encontrada.' }

  const all = await listInstances()
  const canal = all.find((i) => /laser/i.test(i.name) && i.status === 'connected')
  if (!canal?.token) return { ok: false, error: 'Nenhum canal WhatsApp conectado — conecte um número em Canais.' }

  const env = await sendText(canal.token, c.telefone, texto.trim())
  if (!env.ok) return { ok: false, error: env.error || 'Falha no envio.' }

  const agora = new Date().toISOString()
  await sb.from('sac_whatsapp_mensagens').insert({
    chat_id: chatId, direcao: 'saida', autor: nome, enviada_por: user.id, tipo: 'text', texto: texto.trim(), status: 'sent', criado_em: agora,
  })
  // Ao responder, assume a conversa (se ainda sem dono) e pausa o bot.
  const patch: Record<string, unknown> = { ultima_msg: texto.trim().slice(0, 120), ultima_msg_tipo: 'text', ultima_msg_em: agora, bot_ativo: false }
  if (!c.atendente_id) patch.atendente_id = user.id
  await sb.from('sac_whatsapp_chats').update(patch).eq('id', chatId)

  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Assume a conversa: atribui ao atendente atual e pausa o bot. */
export async function assumirConversa(chatId: string): Promise<{ ok: boolean; error?: string; responsavel?: string }> {
  const sb = await createClient()
  const { user, nome } = await operador(sb)
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { error } = await sb.from('sac_whatsapp_chats').update({ atendente_id: user.id, bot_ativo: false }).eq('id', chatId)
  if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão.' : error.message }
  revalidatePath('/sac/triagem')
  return { ok: true, responsavel: nome }
}

/** Devolve a conversa para a fila (sem dono) — base da transferência. */
export async function devolverConversa(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { user } = await operador(sb)
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { error } = await sb.from('sac_whatsapp_chats').update({ atendente_id: null }).eq('id', chatId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Transfere a conversa para outro atendente (direcionada). */
export async function transferirConversa(chatId: string, atendenteId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { user } = await operador(sb)
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!atendenteId) return { ok: false, error: 'Selecione o atendente.' }
  const { error } = await sb.from('sac_whatsapp_chats').update({ atendente_id: atendenteId, bot_ativo: false }).eq('id', chatId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Marca a conversa como lida (zera o contador de não-lidas). */
export async function marcarLido(chatId: string): Promise<{ ok: boolean }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false }
  await sb.from('sac_whatsapp_chats').update({ nao_lidas: 0 }).eq('id', chatId)
  return { ok: true }
}

/** Reativa a IA de atendimento na conversa (volta o bot e remove o atendente humano). */
export async function reativarIA(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { error } = await sb.from('sac_whatsapp_chats').update({ bot_ativo: true, atendente_id: null }).eq('id', chatId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Adiciona uma nota interna à conversa (não vai ao cliente). */
export async function adicionarNota(chatId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { user, nome } = await operador(sb)
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!texto.trim()) return { ok: false, error: 'Escreva a nota.' }
  const { error } = await sb.from('sac_whatsapp_notas').insert({ chat_id: chatId, autor_id: user.id, autor_nome: nome, texto: texto.trim() })
  if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão.' : error.message }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Altera o status da conversa: aberto | pendente | resolvido. */
export async function alterarStatusConversa(chatId: string, status: 'aberto' | 'pendente' | 'resolvido'): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!['aberto', 'pendente', 'resolvido'].includes(status)) return { ok: false, error: 'Status inválido.' }
  const patch: Record<string, unknown> = { status }
  if (status === 'resolvido') patch.nao_lidas = 0
  const { error } = await sb.from('sac_whatsapp_chats').update(patch).eq('id', chatId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Abre um chamado no SAC a partir da conversa e vincula o chat ao ticket. */
export async function abrirChamadoDaConversa(chatId: string): Promise<{ ok: boolean; error?: string; jaExistia?: boolean }> {
  const sb = await createClient()
  const { user, perfil } = await operador(sb)
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  const { data: chat } = await sb.from('sac_whatsapp_chats').select('id, telefone, nome, ticket_id').eq('id', chatId).single()
  const c = chat as { telefone?: string; nome?: string; ticket_id?: string | null } | null
  if (!c) return { ok: false, error: 'Conversa não encontrada.' }
  if (c.ticket_id) return { ok: true, jaExistia: true }

  // empresa da unidade do atendente (multitenant); fallback p/ 1ª empresa.
  let empresa_id: string | undefined
  let unidade_id: string | null = perfil?.unidade_id ?? null
  if (unidade_id) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidade_id).single()
    empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  }
  if (!empresa_id) {
    const { data: emp } = await sb.from('empresas').select('id').limit(1).single()
    empresa_id = (emp as { id?: string } | null)?.id
  }
  if (!empresa_id) return { ok: false, error: 'Empresa não encontrada.' }

  const { data: ins, error } = await sb.from('sac_tickets').insert({
    empresa_id, unidade_id, nome_cliente: c.nome || c.telefone || 'Cliente WhatsApp', telefone_cliente: c.telefone || null,
    assunto: 'Atendimento WhatsApp', canal: 'WhatsApp', status: 'aberto', prioridade: 'media', fase: 'Novo',
  }).select('id').single()
  if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para abrir chamado.' : error.message }

  await sb.from('sac_whatsapp_chats').update({ ticket_id: (ins as { id?: string })?.id }).eq('id', chatId)
  revalidatePath('/sac/triagem'); revalidatePath('/sac/chamados'); revalidatePath('/sac')
  return { ok: true }
}
