'use server'

import { getSessionContext } from '@/lib/session'
import { listInstances, criarCampanhaSimples } from '@/lib/uazapi'

/** Dispara uma campanha de WhatsApp por um canal conectado (envio em massa via UAZAPI). */
export async function dispararCampanha(
  canalNome: string, texto: string, numerosRaw: string, delayMin: number, delayMax: number, nomeCampanha: string,
): Promise<{ ok: boolean; error?: string; total?: number }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }

  if (!texto.trim()) return { ok: false, error: 'Escreva a mensagem.' }
  const numbers = [...new Set(
    numerosRaw.split(/[\n,;]+/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 10),
  )]
  if (numbers.length === 0) return { ok: false, error: 'Informe ao menos um número válido.' }

  const all = await listInstances()
  const canal = all.find((i) => i.name === canalNome)
  if (!canal?.token) return { ok: false, error: 'Canal não encontrado.' }
  if (canal.status !== 'connected') return { ok: false, error: `O canal "${canalNome}" está desconectado — conecte-o em Canais antes de disparar.` }

  const dMin = Math.max(1, delayMin || 0)
  const dMax = Math.max(dMin, delayMax || dMin)

  const res = await criarCampanhaSimples(canal.token, { numbers, text: texto, delayMin: dMin, delayMax: dMax, info: nomeCampanha || 'Campanha' })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, total: numbers.length }
}
