'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'

/**
 * Origens de Cliente  paridade com o legado (buildOrigens / ORIGENS / origNova /
 * origEdit / origToggle / origDel). Catálogo por EMPRESA. RBAC: admin_geral / gestor.
 * Tabela `origens_cliente` (migration scripts/migrations/anamnese.sql).
 * Toda ação grava auditoria (legado _origSave -> persistState + auditLog).
 */
export type ActionResult = { ok: boolean; error?: string; id?: string }

const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

type Op = NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>

async function resolverEmpresaId(op: Op): Promise<string | null> {
  const { sb, userId } = op
  const { data: perfil } = await sb.from('perfis_usuario').select('unidade_id').eq('id', userId).maybeSingle()
  const unidadeId = (perfil as { unidade_id?: string | null } | null)?.unidade_id ?? null
  if (unidadeId) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).maybeSingle()
    const eid = (uni as { empresa_id?: string | null } | null)?.empresa_id ?? null
    if (eid) return eid
  }
  const { data: emp } = await sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  return (emp as { id?: string } | null)?.id ?? null
}

/** Auditoria best-effort (legado auditLog('Origens de cliente', ...)). */
async function audit(userId: string, acao: string, label: string): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId, acao, recurso_id: 'origens', recurso_label: label, origem: 'web', resultado: 'sucesso',
    })
  } catch { /* auditoria é secundária */ }
}

export async function criarOrigem(nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar origens.' }
  const n = (nome || '').trim()
  if (!n) return { ok: false, error: 'Informe o nome da origem.' }

  const empresa_id = await resolverEmpresaId(op)
  const { data, error: e } = await op.sb
    .from('origens_cliente')
    .insert({ empresa_id, nome: n, ativo: true })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar origem') }
  await audit(op.userId, 'Criou', n)
  revalidatePath('/cadastros/origens')
  return { ok: true, id: (data as { id: string }).id }
}

export async function salvarOrigem(id: string, nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar origens.' }
  if (!id) return { ok: false, error: 'Origem inválida.' }
  const n = (nome || '').trim()
  if (!n) return { ok: false, error: 'Informe o nome da origem.' }

  const { error: e } = await op.sb
    .from('origens_cliente')
    .update({ nome: n, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar origem') }
  await audit(op.userId, 'Editou', n)
  revalidatePath('/cadastros/origens')
  return { ok: true }
}

export async function toggleOrigemAtiva(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar origens.' }
  if (!id) return { ok: false, error: 'Origem inválida.' }

  const { error: e } = await op.sb
    .from('origens_cliente')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar origem' : 'inativar origem') }
  await audit(op.userId, ativo ? 'Ativou' : 'Inativou', id)
  revalidatePath('/cadastros/origens')
  return { ok: true }
}

export async function excluirOrigem(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para excluir origens.' }
  if (!id) return { ok: false, error: 'Origem inválida.' }

  const { error: e } = await op.sb.from('origens_cliente').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir origem') }
  await audit(op.userId, 'Excluiu', id)
  revalidatePath('/cadastros/origens')
  return { ok: true }
}
