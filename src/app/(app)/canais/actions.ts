'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listInstances, createInstance, connectInstance, getStatus, disconnectInstance, configurarWebhook, urlWebhook, type ConnState } from '@/lib/uazapi'

export type Escopo = 'unidade' | 'geral'
export type CanalForm = { nome: string; escopo: Escopo; unidadeId?: string | null; rotulo?: string; delayMin?: number; delayMax?: number }

const rlsMsg = (m: string, what: string) =>
  /row-level|policy|permission|denied/i.test(m) ? `Sem permissão para ${what}.` : m

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
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }
  const token = await tokenPorNome(nome)
  if (!token) return { ok: false, error: 'Canal não encontrado.' }
  await configurarWebhook(token, urlWebhook()).catch(() => null) // garante que as mensagens cheguem na Triagem/IA
  const state = await connectInstance(token)
  revalidatePath('/canais')
  return { ok: true, state }
}

/** Consulta o status do canal (para o polling do QR). */
export async function statusCanal(nome: string): Promise<{ ok: boolean; state?: ConnState }> {
  const token = await tokenPorNome(nome)
  if (!token) return { ok: false }
  return { ok: true, state: await getStatus(token) }
}

export async function desconectarCanal(nome: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }
  const token = await tokenPorNome(nome)
  if (!token) return { ok: false, error: 'Canal não encontrado.' }
  await disconnectInstance(token)
  revalidatePath('/canais')
  return { ok: true }
}
