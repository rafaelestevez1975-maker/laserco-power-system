'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type IndicadoInput = { nome: string; telefone?: string; email?: string }
export type NovaIndicacaoInput = {
  indicador_nome: string
  indicador_telefone?: string
  indicador_email?: string
  premio_descricao?: string
  unidade_id?: string | null
  indicados: IndicadoInput[]
}

const STATUS_INDICADO = ['pendente', 'contatado', 'respondeu', 'agendou', 'compareceu', 'comprou', 'desistiu']
const TS_POR_STATUS: Record<string, string> = { respondeu: 'respondeu_em', agendou: 'agendou_em', compareceu: 'compareceu_em', comprou: 'comprou_em', desistiu: 'desistiu_em' }

/** Registra uma indicação manual (indicador + 3 a 5 indicados). */
export async function criarIndicacao(input: NovaIndicacaoInput): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!input.indicador_nome?.trim()) return { ok: false, error: 'Informe o nome de quem indicou.' }
  if (!input.unidade_id) return { ok: false, error: 'Selecione a unidade da indicação.' }
  // indicado exige nome + telefone (telefone é NOT NULL no schema)
  const indicados = (input.indicados || []).filter((i) => i.nome?.trim() && i.telefone?.trim())
  if (indicados.length === 0) return { ok: false, error: 'Adicione ao menos um indicado com nome e WhatsApp.' }

  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const { data: ind, error } = await sb.from('indicacoes').insert({
    empresa_id, unidade_id: input.unidade_id || null,
    indicador_nome: input.indicador_nome.trim(),
    indicador_telefone: input.indicador_telefone?.trim() || null,
    indicador_email: input.indicador_email?.trim() || null,
    premio_descricao: input.premio_descricao?.trim() || null,
    qtd_indicados: indicados.length,
    status: 'ativa', criado_por: user.id,
  }).select('id').single()
  if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para registrar indicação.' : error.message }

  const indicacao_id = (ind as { id: string }).id
  const { error: e2 } = await sb.from('indicacao_indicados').insert(
    indicados.map((i) => ({ indicacao_id, nome: i.nome.trim(), telefone: i.telefone?.trim() || null, email: i.email?.trim() || null, status: 'pendente' })),
  )
  if (e2) return { ok: false, error: e2.message }

  revalidatePath('/indiques')
  return { ok: true }
}

/** Atualiza o andamento de um indicado (status + observação)  "abrir o lead". */
export async function atualizarIndicado(id: string, status: string, observacoes?: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!STATUS_INDICADO.includes(status)) return { ok: false, error: 'Status inválido.' }

  const patch: Record<string, unknown> = { status, observacoes: observacoes?.trim() || null }
  const tsCol = TS_POR_STATUS[status]
  if (tsCol) patch[tsCol] = new Date().toISOString()

  const { error } = await sb.from('indicacao_indicados').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/indiques')
  return { ok: true }
}
