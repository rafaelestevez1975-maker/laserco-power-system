'use server'

import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/session'
import { listInstances, createInstance, connectInstance, getStatus, disconnectInstance, type ConnState } from '@/lib/uazapi'

async function tokenPorNome(nome: string): Promise<string | null> {
  const all = await listInstances()
  return all.find((i) => i.name === nome)?.token ?? null
}

/** Cria um canal (instância) — só admin (usa o admin token). */
export async function criarCanal(nome: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }
  if (!ctx.isAdmin) return { ok: false, error: 'Apenas o administrador pode criar canais.' }
  const n = nome.trim()
  if (!n) return { ok: false, error: 'Informe o nome do canal.' }
  const finalName = /laser/i.test(n) ? n : `Laser - ${n}`
  const res = await createInstance(finalName)
  if (!res.ok) return { ok: false, error: res.error }
  revalidatePath('/canais')
  return { ok: true }
}

/** Conecta o canal e retorna o QR para escanear. */
export async function conectarCanal(nome: string): Promise<{ ok: boolean; error?: string; state?: ConnState }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }
  const token = await tokenPorNome(nome)
  if (!token) return { ok: false, error: 'Canal não encontrado.' }
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
