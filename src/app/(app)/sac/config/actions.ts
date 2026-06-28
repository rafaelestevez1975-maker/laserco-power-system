'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import type { ActionResult } from '@/lib/types'
import { PREM_DEFAULT, type PremMonetaria } from '@/lib/sac'

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

/** Normaliza/valida uma cor hex (#RGB ou #RRGGBB). Aceita sem '#'. Fallback p/ a cor da marca. */
function corHex(raw: string | null | undefined): string {
  const v = (raw || '').trim()
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(v)
  return m ? '#' + m[1].toLowerCase() : '#8a2a41'
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
  const { error: e } = await sb.from('sac_tags').insert({ nome: n, cor: corHex(cor), ativo: true })
  if (e) return { ok: false, error: msgErro(e.message, 'criar tag') }
  revalidatePath('/sac/config'); return { ok: true }
}
export async function renomearTag(id: string, nome: string, cor: string): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const n = nome.trim(); if (!n) return { ok: false, error: 'Informe o nome da tag.' }
  const { error: e } = await sb.from('sac_tags').update({ nome: n, cor: corHex(cor) }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'renomear tag') }
  revalidatePath('/sac/config'); return { ok: true }
}
export async function toggleTag(id: string, ativo: boolean): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const { error: e } = await sb.from('sac_tags').update({ ativo }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'atualizar tag') }
  revalidatePath('/sac/config'); return { ok: true }
}

// ─── Configuração única do SAC (sac_premiacao_config) ───────────────────────────
// Resolve a linha de config. Modelo single-tenant (1 empresa) igual aos demais actions
// do SAC: se não existir linha, devolve a empresa única para permitir o 1º insert
// (assim SLA/premiação podem ser salvos numa base sem seed prévio de config).
type CfgRow = { empresa_id?: string; pesos?: Record<string, unknown> } | null
async function carregarCfg(sb: SB): Promise<{ eid: string | null; pesos: Record<string, unknown>; existe: boolean }> {
  const { data } = await sb.from('sac_premiacao_config').select('empresa_id, pesos').limit(1).maybeSingle()
  const c = data as CfgRow
  if (c?.empresa_id) return { eid: c.empresa_id, pesos: c.pesos ?? {}, existe: true }
  const { data: emp } = await sb.from('empresas').select('id').limit(1).maybeSingle()
  const eid = (emp as { id?: string } | null)?.id ?? null
  return { eid, pesos: {}, existe: false }
}

/** Grava `pesos` na linha de config: faz UPDATE se existir, senão INSERT (cria a config). */
async function gravarPesos(sb: SB, eid: string, pesos: Record<string, unknown>, existe: boolean, oQue: string): Promise<{ error?: string }> {
  if (existe) {
    const { error } = await sb.from('sac_premiacao_config').update({ pesos, atualizado_em: new Date().toISOString() }).eq('empresa_id', eid)
    return error ? { error: msgErro(error.message, oQue) } : {}
  }
  const { error } = await sb.from('sac_premiacao_config').insert({ empresa_id: eid, pesos, atualizado_em: new Date().toISOString() })
  return error ? { error: msgErro(error.message, oQue) } : {}
}

// ─── Premiação monetária do SAC (sac_premiacao_config.pesos = PremMonetaria jsonb) ───
// Legado: SAC_PREM (index.html 8913) — prêmio em R$ por atendente. Guardamos os 9 parâmetros
// no jsonb `pesos`; a coluna `premios` (modelo antigo de texto) deixa de ser usada.
export async function salvarPremiacaoConfig(prem: PremMonetaria): Promise<ActionResult> {
  const { sb, error } = await guard(); if (!sb) return { ok: false, error }
  const { eid, pesos: atuais, existe } = await carregarCfg(sb)
  if (!eid) return { ok: false, error: 'Nenhuma empresa encontrada para salvar a configuração do SAC.' }
  // Preserva o slaHoras já gravado no jsonb `pesos` (não faz parte do form de premiação).
  const slaHoras = atuais.slaHoras
  const pesos = slaHoras != null ? { ...prem, slaHoras } : { ...prem }
  const r = await gravarPesos(sb, eid, pesos, existe, 'salvar premiação')
  if (r.error) return { ok: false, error: r.error }
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
  const { eid, pesos: atuais, existe } = await carregarCfg(sb)
  if (!eid) return { ok: false, error: 'Nenhuma empresa encontrada para salvar a configuração do SAC.' }
  // Ao criar a config pela 1ª vez, semeia também os pesos de premiação (PREM_DEFAULT)
  // para o ranking não cair em valores vazios; em update preserva o que já existe.
  const base = existe ? atuais : { ...PREM_DEFAULT }
  const pesos = { ...base, slaHoras: h }
  const r = await gravarPesos(sb, eid, pesos, existe, 'salvar SLA')
  if (r.error) return { ok: false, error: r.error }
  revalidatePath('/sac/config'); revalidatePath('/sac/ranking'); return { ok: true }
}
