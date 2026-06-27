'use server'

import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/session'
import { requireOperador, msgErro } from '@/lib/sb'
import { listInstances, criarCampanhaSimples } from '@/lib/uazapi'
import type { ActionResult } from '@/lib/types'
import type { ExpLista, ExpDisparo } from '@/components/expansao/types'

export type Template = { id: string; nome: string; texto: string }

/**
 * "Listas disponíveis" para disparo (legado expDisparos / EXP_LISTS 8545), porém
 * derivadas de DADOS REAIS do lkii em vez de mock:
 *   - Base de clientes (ativos da unidade ativa / rede)
 *   - Clientes inativos (ativo=false)
 *   - Leads de captação de franquia (pipeline='franquia', origem geo/site)
 * Cada lista vira público de uma campanha. O histórico ainda não é persistido
 * (não há tabela de campanhas), então vem vazio até a integração de histórico.
 */
export async function dadosDisparos(activeUnitId: string | null): Promise<{ listas: ExpLista[]; historico: ExpDisparo[] }> {
  const { op } = await requireOperador()
  if (!op) return { listas: [], historico: [] }

  // count head:true → só o total, sem trazer linhas. Clientes escopam por unidade_origem_id.
  // Inline do filtro de unidade (evita o generic de scopeUnidade estourar a profundidade do tipo — TS2589).
  let cBase = op.sb.from('clientes').select('id', { count: 'exact', head: true }).eq('ativo', true)
  if (activeUnitId) cBase = cBase.eq('unidade_origem_id', activeUnitId)
  let cInativos = op.sb.from('clientes').select('id', { count: 'exact', head: true }).eq('ativo', false)
  if (activeUnitId) cInativos = cInativos.eq('unidade_origem_id', activeUnitId)
  let cCaptacao = op.sb.from('crm_leads').select('id', { count: 'exact', head: true }).eq('pipeline', 'franquia').in('origem', ['geolocalizado', 'site'])
  if (activeUnitId) cCaptacao = cCaptacao.eq('unidade_id', activeUnitId)

  const [base, inativos, captacao] = await Promise.all([cBase, cInativos, cCaptacao])

  const listas: ExpLista[] = [
    { nome: 'Base de clientes do sistema', qtd: base.error ? 0 : (base.count ?? 0), fonte: 'Sistema' },
    { nome: 'Clientes inativos', qtd: inativos.error ? 0 : (inativos.count ?? 0), fonte: 'Sistema' },
    { nome: 'Leads de captação (Geo + Site)', qtd: captacao.error ? 0 : (captacao.count ?? 0), fonte: 'Captação' },
  ]

  // Histórico real ainda não persistido (sem tabela de campanhas no lkii).
  const historico: ExpDisparo[] = []
  return { listas, historico }
}

/** Dispara (ou agenda) uma campanha de WhatsApp por um canal conectado (envio em massa via UAZAPI).
 *  agendarISO (opcional) = data/hora local do input datetime-local; vazio = envia agora.
 *  A mensagem pode usar placeholders da UAZAPI ({{first_name}}, {{name}}) para personalizar. */
export async function dispararCampanha(
  canalNome: string, texto: string, numerosRaw: string, delayMin: number, delayMax: number, nomeCampanha: string, agendarISO?: string,
): Promise<{ ok: boolean; error?: string; total?: number; agendado?: boolean }> {
  const ctx = await getSessionContext()
  if (!ctx) return { ok: false, error: 'Sessão expirada.' }

  if (!texto.trim()) return { ok: false, error: 'Escreva a mensagem.' }
  const numbers = [...new Set(numerosRaw.split(/[\n,;]+/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 10))]
  if (numbers.length === 0) return { ok: false, error: 'Informe ao menos um número válido.' }

  let scheduledFor = 0
  if (agendarISO) {
    const ts = new Date(agendarISO).getTime()
    if (!Number.isFinite(ts)) return { ok: false, error: 'Data de agendamento inválida.' }
    if (ts < Date.now() - 60_000) return { ok: false, error: 'A data de agendamento já passou.' }
    scheduledFor = ts
  }

  const all = await listInstances()
  const canal = all.find((i) => i.name === canalNome)
  if (!canal?.token) return { ok: false, error: 'Canal não encontrado.' }
  if (canal.status !== 'connected') return { ok: false, error: `O canal "${canalNome}" está desconectado — conecte-o em Canais antes de disparar.` }

  const dMin = Math.max(1, delayMin || 0)
  const dMax = Math.max(dMin, delayMax || dMin)

  const res = await criarCampanhaSimples(canal.token, { numbers, text: texto, delayMin: dMin, delayMax: dMax, info: nomeCampanha || 'Campanha', scheduledFor })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, total: numbers.length, agendado: scheduledFor > 0 }
}

// ─── Modelos de mensagem (disparo_templates, RLS authenticated) ───
export async function listarTemplates(): Promise<Template[]> {
  const { op } = await requireOperador()
  if (!op) return []
  const { data } = await op.sb.from('disparo_templates').select('id, nome, texto').order('nome', { ascending: true })
  return (data ?? []) as Template[]
}

export async function salvarTemplate(nome: string, texto: string): Promise<ActionResult> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const n = nome.trim(), t = texto.trim()
  if (!n) return { ok: false, error: 'Dê um nome ao modelo.' }
  if (!t) return { ok: false, error: 'O modelo não pode ser vazio.' }
  const { error: e } = await op.sb.from('disparo_templates').insert({ nome: n, texto: t, criado_por: op.userId })
  if (e) return { ok: false, error: msgErro(e.message, 'salvar modelo') }
  revalidatePath('/expansao/disparos')
  return { ok: true }
}

export async function excluirTemplate(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const { error: e } = await op.sb.from('disparo_templates').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir modelo') }
  revalidatePath('/expansao/disparos')
  return { ok: true }
}
