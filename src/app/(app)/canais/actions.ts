'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { msgErro as rlsMsg } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { getSessionContext } from '@/lib/session'
import { listInstances, createInstance, connectInstance, getStatus, disconnectInstance, configurarWebhook, urlWebhook, type ConnState } from '@/lib/uazapi'

// Papéis que operam canais (admin_geral sempre passa via temPapel).
const PAPEIS_CANAL = ['gestor', 'operacoes'] as const

type CanalAlvo = { token: string; binding: { escopo: 'unidade' | 'geral'; unidade_id: string | null } | null }

/** Gate de operação sobre UM canal específico (conectar/desconectar/sincronizar):
 *  exige login + papel de gestão; e o canal precisa estar no ESCOPO do usuário —
 *  admin opera qualquer canal; o gestor só opera canal GERAL ou da SUA unidade ativa.
 *  Canal sem vínculo em canais_whatsapp só é operável por admin. */
async function guardCanalAlvo(nome: string): Promise<{ ok: true; alvo: CanalAlvo } | { ok: false; error: string }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }
  if (!temPapel(ctx.papel, ...PAPEIS_CANAL)) return { ok: false, error: 'Você não tem permissão para gerenciar canais.' }
  const token = await tokenPorNome(nome)
  if (!token) return { ok: false, error: 'Canal não encontrado.' }

  const sb = await createClient()
  const { data } = await sb.from('canais_whatsapp').select('escopo, unidade_id').eq('instancia_nome', nome).maybeSingle()
  const binding = (data as { escopo: 'unidade' | 'geral'; unidade_id: string | null } | null) ?? null

  if (!ctx.isAdmin) {
    if (!binding) return { ok: false, error: 'Canal sem vínculo — peça ao administrador para vinculá-lo a uma unidade.' }
    const noEscopo = binding.escopo === 'geral' || (!!ctx.activeUnitId && binding.unidade_id === ctx.activeUnitId)
    if (!noEscopo) return { ok: false, error: 'Este canal pertence a outra unidade.' }
  }
  return { ok: true, alvo: { token, binding } }
}

export type Escopo = 'unidade' | 'geral'
export type CanalForm = { nome: string; escopo: Escopo; unidadeId?: string | null; rotulo?: string; delayMin?: number; delayMax?: number }

// rlsMsg = msgErro (compartilhado em @/lib/sb — DRY, ver docs/CONSOLIDACAO.md D1)

async function tokenPorNome(nome: string): Promise<string | null> {
  const all = await listInstances()
  return all.find((i) => i.name === nome)?.token ?? null
}

/** Cria um canal (instância UAZAPI) e grava o vínculo (escopo unidade/geral + delay).
 *  - 'geral' (franqueadora): só admin.
 *  - 'unidade': admin (para qualquer unidade) ou gestor (para a própria unidade ativa). */
export async function criarCanal(form: CanalForm): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }
  const n = (form.nome || '').trim()
  if (!n) return { ok: false, error: 'Informe o nome do canal.' }

  let escopo: Escopo = form.escopo === 'geral' ? 'geral' : 'unidade'
  let unidade_id: string | null = null
  if (escopo === 'geral') {
    if (!ctx.isAdmin) return { ok: false, error: 'Apenas o administrador cria o canal geral.' }
  } else {
    unidade_id = ctx.isAdmin ? (form.unidadeId || null) : (ctx.activeUnitId || null)
    if (!unidade_id) return { ok: false, error: 'Selecione a unidade do canal.' }
  }

  const finalName = /laser/i.test(n) ? n : `Laser - ${n}`
  const res = await createInstance(finalName)
  if (!res.ok) return { ok: false, error: res.error }

  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  const { error } = await sb.from('canais_whatsapp').insert({
    instancia_nome: finalName, escopo, unidade_id,
    rotulo: form.rotulo?.trim() || null,
    delay_min: Math.max(1, form.delayMin ?? 20),
    delay_max: Math.max(Math.max(1, form.delayMin ?? 20), form.delayMax ?? 45),
    criado_por: user?.id ?? null,
  })
  if (error) return { ok: false, error: rlsMsg(error.message, 'vincular o canal') }
  revalidatePath('/canais'); revalidatePath('/expansao/disparos')
  return { ok: true }
}

/** Vincula uma instância já existente na UAZAPI a uma unidade/geral (ou edita o vínculo). */
export async function salvarVinculo(form: CanalForm & { id?: string }): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }
  let escopo: Escopo = form.escopo === 'geral' ? 'geral' : 'unidade'
  let unidade_id: string | null = null
  if (escopo === 'geral') {
    if (!ctx.isAdmin) return { ok: false, error: 'Apenas o administrador define o canal geral.' }
  } else {
    unidade_id = ctx.isAdmin ? (form.unidadeId || null) : (ctx.activeUnitId || null)
    if (!unidade_id) return { ok: false, error: 'Selecione a unidade do canal.' }
  }
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  const row = {
    instancia_nome: form.nome, escopo, unidade_id, rotulo: form.rotulo?.trim() || null,
    delay_min: Math.max(1, form.delayMin ?? 20),
    delay_max: Math.max(Math.max(1, form.delayMin ?? 20), form.delayMax ?? 45),
    criado_por: user?.id ?? null,
  }
  const { error } = await sb.from('canais_whatsapp').upsert(row, { onConflict: 'instancia_nome' })
  if (error) return { ok: false, error: rlsMsg(error.message, 'salvar o vínculo') }
  revalidatePath('/canais'); revalidatePath('/expansao/disparos')
  return { ok: true }
}

/** Conecta o canal e retorna o QR para escanear. */
export async function conectarCanal(nome: string): Promise<{ ok: boolean; error?: string; state?: ConnState }> {
  const g = await guardCanalAlvo(nome)
  if (!g.ok) return { ok: false, error: g.error }
  await configurarWebhook(g.alvo.token, urlWebhook()).catch(() => null) // garante que as mensagens cheguem na Triagem/IA
  const state = await connectInstance(g.alvo.token)
  revalidatePath('/canais')
  return { ok: true, state }
}

/** Consulta o status do canal (para o polling do QR). */
export async function statusCanal(nome: string): Promise<{ ok: boolean; state?: ConnState }> {
  const token = await tokenPorNome(nome)
  if (!token) return { ok: false }
  return { ok: true, state: await getStatus(token) }
}

/** Reaplica o webhook do canal apontando pra produção — garante que TODA mensagem
 *  recebida caia na Triagem (sincronização). Idempotente: a UAZAPI casa pelo URL,
 *  então pode ser chamado quantas vezes quiser sem duplicar. Usado no auto-pós-conexão
 *  e no botão "Sincronizar". Retorna se está conectado e a URL aplicada. */
export async function sincronizarCanal(nome: string): Promise<{ ok: boolean; error?: string; conectado?: boolean }> {
  const g = await guardCanalAlvo(nome)
  if (!g.ok) return { ok: false, error: g.error }
  const wh = await configurarWebhook(g.alvo.token, urlWebhook())
  const st = await getStatus(g.alvo.token).catch(() => null)
  revalidatePath('/canais')
  if (!wh.ok) return { ok: false, error: wh.error || 'Falha ao sincronizar (webhook).', conectado: st?.connected }
  return { ok: true, conectado: st?.connected }
}

export async function desconectarCanal(nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guardCanalAlvo(nome)
  if (!g.ok) return { ok: false, error: g.error }
  await disconnectInstance(g.alvo.token)
  revalidatePath('/canais')
  return { ok: true }
}
