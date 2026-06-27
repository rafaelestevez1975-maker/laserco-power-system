'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import type { ActionResult } from '@/lib/types'
import { type PremMonetaria } from '@/lib/sac'

/** Garante operador com papel que pode configurar o SAC. */
async function guard(): Promise<{ sb: SB; error?: undefined } | { sb: null; error: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { sb: null, error: error || 'Sessão expirada.' }
  if (!temPapel(op.papel, 'sac', 'gestor')) return { sb: null, error: 'Você não tem permissão para configurar o SAC.' }
  return { sb: op.sb }
}

async function proximaOrdem(sb: SB, tabela: string): Promise<number> {
  const { data } = await sb.from(tabela).select('ordem').order('ordem', { ascending: false }).limit(1).maybeSingle()
  return (((data as { ordem?: number } | null)?.ordem) ?? 0) + 1
}

// ─── Motivos de atendimento (sac_motivos: label, ativo, ordem) ───
export async function criarMotivo(label: string): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const l = label.trim(); if (!l) return { ok: false, error: 'Informe o nome do motivo.' }
  const { error: e } = await sb.from('sac_motivos').insert({ label: l, ativo: true, ordem: await proximaOrdem(sb, 'sac_motivos') })
  if (e) return { ok: false, error: msgErro(e.message, 'criar motivo') }
  revalidatePath('/sac/config'); return { ok: true }
}
export async function renomearMotivo(id: string, label: string): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const l = label.trim(); if (!l) return { ok: false, error: 'Informe o nome do motivo.' }
  const { error: e } = await sb.from('sac_motivos').update({ label: l }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'renomear motivo') }
  revalidatePath('/sac/config'); return { ok: true }
}
export async function toggleMotivo(id: string, ativo: boolean): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const { error: e } = await sb.from('sac_motivos').update({ ativo }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar motivo') }
  revalidatePath('/sac/config'); return { ok: true }
}

// ─── Tags (sac_tags: nome, cor, ativo) ───
export async function criarTag(nome: string, cor: string): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const n = nome.trim(); if (!n) return { ok: false, error: 'Informe o nome da tag.' }
  const { error: e } = await sb.from('sac_tags').insert({ nome: n, cor: cor || '#8A2A41', ativo: true })
  if (e) return { ok: false, error: msgErro(e.message, 'criar tag') }
  revalidatePath('/sac/config'); return { ok: true }
}
export async function renomearTag(id: string, nome: string, cor: string): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const n = nome.trim(); if (!n) return { ok: false, error: 'Informe o nome da tag.' }
  const { error: e } = await sb.from('sac_tags').update({ nome: n, cor: cor || '#8A2A41' }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'renomear tag') }
  revalidatePath('/sac/config'); return { ok: true }
}
export async function toggleTag(id: string, ativo: boolean): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const { error: e } = await sb.from('sac_tags').update({ ativo }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar tag') }
  revalidatePath('/sac/config'); return { ok: true }
}

// ─── Premiação monetária do SAC (sac_premiacao_config.pesos = PremMonetaria jsonb) ───
// Legado: SAC_PREM (index.html 8913) — prêmio em R$ por atendente. Guardamos os 9 parâmetros
// no jsonb `pesos`; a coluna `premios` (modelo antigo de texto) deixa de ser usada.
export async function salvarPremiacaoConfig(prem: PremMonetaria): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  // Preserva o slaHoras já gravado no jsonb `pesos` (não faz parte do form de premiação).
  const { data: cfg } = await sb.from('sac_premiacao_config').select('empresa_id, pesos').limit(1).maybeSingle()
  const c = cfg as { empresa_id?: string; pesos?: Record<string, unknown> } | null
  const eid = c?.empresa_id
  if (!eid) return { ok: false, error: 'Configuração de premiação não encontrada.' }
  const slaHoras = c?.pesos?.slaHoras
  const pesos = slaHoras != null ? { ...prem, slaHoras } : { ...prem }
  const { error: e } = await sb.from('sac_premiacao_config').update({ pesos, atualizado_em: new Date().toISOString() }).eq('empresa_id', eid)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar premiação') }
  revalidatePath('/sac/ranking'); return { ok: true }
}

// ─── SLA de atendimento (horas) — paridade com o legado (SAC_CFG.slaHoras=48, index.html 9149) ───
// Guardado no jsonb `pesos` da sac_premiacao_config (campo flexível já existente) para
// não exigir nova coluna. Usado para marcar "Em atraso" quando o prazo de resolução estoura.
// (O default `SLA_HORAS_DEFAULT` fica em @/lib/sac-config — arquivos 'use server' só exportam funções.)
export async function salvarSlaHoras(horas: number): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const h = Math.round(Number(horas))
  if (!(h >= 1 && h <= 1000)) return { ok: false, error: 'Informe um prazo de SLA entre 1 e 1000 horas.' }
  const { data: cfg } = await sb.from('sac_premiacao_config').select('empresa_id, pesos').limit(1).maybeSingle()
  const c = cfg as { empresa_id?: string; pesos?: Record<string, unknown> } | null
  const eid = c?.empresa_id
  if (!eid) return { ok: false, error: 'Configuração do SAC não encontrada.' }
  const pesos = { ...(c?.pesos ?? {}), slaHoras: h }
  const { error: e } = await sb.from('sac_premiacao_config').update({ pesos, atualizado_em: new Date().toISOString() }).eq('empresa_id', eid)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar SLA') }
  revalidatePath('/sac/config'); return { ok: true }
}
