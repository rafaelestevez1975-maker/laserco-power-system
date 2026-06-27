'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { getSessionContext } from '@/lib/session'
import { exigirPapel } from '@/lib/rbac'
import { AUTOS_PADRAO } from '@/lib/automacoes'

const PAPEIS_ESCRITA = ['gestor', 'operacoes']

/** Resolve empresa_id da unidade (igual ao padrão do CRM/leads-site). */
async function empresaDaUnidade(sb: SB, unidadeId: string): Promise<string | null> {
  const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  return (data as { empresa_id?: string } | null)?.empresa_id ?? null
}

/**
 * Liga/desliga uma automação PADRÃO na unidade ativa (legado: switch renderAutos 3967).
 * Grava override em automacoes_estado (upsert por unidade+chave).
 */
export async function alternarAutomacao(chave: string, ativa: boolean): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'ativar/inativar automações'); if (neg) return { ok: false, error: neg }
  if (!AUTOS_PADRAO.some((a) => a.chave === chave)) return { ok: false, error: 'Automação inválida.' }

  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId
  if (!unidadeId) return { ok: false, error: 'Selecione uma unidade ativa para configurar as automações.' }
  const empresaId = await empresaDaUnidade(op.sb, unidadeId)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const { error: e } = await op.sb.from('automacoes_estado').upsert(
    { empresa_id: empresaId, unidade_id: unidadeId, chave, ativa, atualizado_por: op.userId, atualizado_em: new Date().toISOString() },
    { onConflict: 'unidade_id,chave' },
  )
  if (e) return { ok: false, error: msgErro(e.message, 'salvar o estado da automação') }
  revalidatePath('/automacoes')
  return { ok: true }
}

/**
 * Cria automação nova (legado mensNova 3972).
 *  - admin → escopo 'rede' (vale p/ todas as unidades, sem unidade_id);
 *  - gestor/operacoes → escopo 'unidade' (visível só na unidade ativa).
 */
export async function criarAutomacao(input: { nome: string; gatilho?: string; acao?: string }): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'criar automações'); if (neg) return { ok: false, error: neg }
  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da automação.' }

  const ctx = await getSessionContext()
  const isAdmin = ctx?.isAdmin ?? false
  const unidadeId = ctx?.activeUnitId ?? null
  // empresa vem da unidade ativa; se admin sem unidade ativa, pega a 1ª unidade visível
  const unidadeRef = unidadeId ?? ctx?.unidades?.[0]?.id ?? null
  if (!unidadeRef) return { ok: false, error: 'Nenhuma unidade disponível.' }
  const empresaId = await empresaDaUnidade(op.sb, unidadeRef)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const escopo = isAdmin ? 'rede' : 'unidade'
  if (escopo === 'unidade' && !unidadeId) return { ok: false, error: 'Selecione uma unidade ativa.' }

  const { error: e } = await op.sb.from('automacoes_custom').insert({
    empresa_id: empresaId,
    unidade_id: escopo === 'unidade' ? unidadeId : null,
    escopo,
    nome,
    gatilho: (input.gatilho || '').trim() || 'condição definida pela unidade',
    acao: (input.acao || '').trim() || 'envia uma mensagem ao cliente',
    categoria: 'Personalizada',
    ativa: true,
    criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'criar a automação') }
  revalidatePath('/automacoes')
  return { ok: true }
}

/** Edita automação personalizada/padrão (legado mensEditarCustom 3990 / mensEditarPadrao 4001). */
export async function editarAutomacao(id: string, input: { nome: string; gatilho?: string; acao?: string }): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'editar automações'); if (neg) return { ok: false, error: neg }
  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'O nome não pode ficar vazio.' }
  const ctx = await getSessionContext()
  // padrão da rede só admin edita
  const { data: row } = await op.sb.from('automacoes_custom').select('escopo').eq('id', id).single()
  const escopo = (row as { escopo?: string } | null)?.escopo
  if (escopo === 'rede' && !ctx?.isAdmin) return { ok: false, error: 'Apenas administradores editam automações padrão da rede.' }

  const patch: Record<string, string> = { nome }
  if (input.gatilho?.trim()) patch.gatilho = input.gatilho.trim()
  if (input.acao?.trim()) patch.acao = input.acao.trim()
  const { error: e } = await op.sb.from('automacoes_custom').update(patch).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar a automação') }
  revalidatePath('/automacoes')
  return { ok: true }
}

/** Exclui automação personalizada (legado mensExcluirCustom 3997). Padrão da rede só admin. */
export async function excluirAutomacao(id: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'excluir automações'); if (neg) return { ok: false, error: neg }
  const ctx = await getSessionContext()
  const { data: row } = await op.sb.from('automacoes_custom').select('escopo').eq('id', id).single()
  const escopo = (row as { escopo?: string } | null)?.escopo
  if (escopo === 'rede' && !ctx?.isAdmin) return { ok: false, error: 'Apenas administradores excluem automações padrão da rede.' }
  const { error: e } = await op.sb.from('automacoes_custom').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir a automação') }
  revalidatePath('/automacoes')
  return { ok: true }
}

// ─── Config da automação de NÃO COMPARECIMENTO (no-show) — view-motivos 1762-1788 ───
export type NoShowForm = {
  ativa: boolean
  primeiraApos: string
  maxDia: number
  intervalo: string
  mensagem: string
  reagendaSeResponde: boolean
  excluiSeSemResposta: boolean
  ocultaDiaSeguinte: boolean
}

export async function salvarNoShow(form: NoShowForm): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'configurar a automação de não comparecimento'); if (neg) return { ok: false, error: neg }
  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId
  if (!unidadeId) return { ok: false, error: 'Selecione uma unidade ativa.' }
  const empresaId = await empresaDaUnidade(op.sb, unidadeId)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const maxDia = Math.min(2, Math.max(1, Math.round(form.maxDia || 2)))
  const { error: e } = await op.sb.from('automacao_noshow').upsert({
    unidade_id: unidadeId,
    empresa_id: empresaId,
    ativa: form.ativa,
    primeira_apos: form.primeiraApos?.trim() || '2 horas',
    max_dia: maxDia,
    intervalo: form.intervalo?.trim() || '2 horas',
    mensagem: form.mensagem?.trim() || '',
    reagenda_se_responde: form.reagendaSeResponde,
    exclui_se_sem_resposta: form.excluiSeSemResposta,
    oculta_dia_seguinte: form.ocultaDiaSeguinte,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'unidade_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'salvar a automação de não comparecimento') }
  revalidatePath('/automacoes')
  return { ok: true }
}
