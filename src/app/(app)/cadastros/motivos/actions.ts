'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'

/**
 * Motivos de Cancelamento  paridade com o legado (buildMotivos / MOTIVOS /
 * motNovo / motEdit / motToggle / motDel). Catálogo por EMPRESA.
 * RBAC: admin_geral / gestor. Tabela `motivos_cancelamento`.
 * Regra: motivos com sistema=true (padrão do sistema) só podem ser inativados,
 * nunca excluídos (motDel bloqueia  legado 7320).
 * Toda ação grava auditoria (legado _motSave -> persistState + auditLog).
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

async function audit(userId: string, acao: string, label: string): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId, acao, recurso_id: 'motivos', recurso_label: label, origem: 'web', resultado: 'sucesso',
    })
  } catch { /* auditoria é secundária */ }
}

export async function criarMotivo(nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar motivos.' }
  const n = (nome || '').trim()
  if (!n) return { ok: false, error: 'Informe o nome do motivo.' }

  const empresa_id = await resolverEmpresaId(op)
  // Personalizado: sistema=false (legado motNovo).
  const { data, error: e } = await op.sb
    .from('motivos_cancelamento')
    .insert({ empresa_id, nome: n, sistema: false, ativo: true })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar motivo') }
  await audit(op.userId, 'Criou', n)
  revalidatePath('/cadastros/motivos')
  return { ok: true, id: (data as { id: string }).id }
}

export async function salvarMotivo(id: string, nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar motivos.' }
  if (!id) return { ok: false, error: 'Motivo inválido.' }
  const n = (nome || '').trim()
  if (!n) return { ok: false, error: 'Informe o nome do motivo.' }

  const { error: e } = await op.sb
    .from('motivos_cancelamento')
    .update({ nome: n, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar motivo') }
  await audit(op.userId, 'Editou', n)
  revalidatePath('/cadastros/motivos')
  return { ok: true }
}

export async function toggleMotivoAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar motivos.' }
  if (!id) return { ok: false, error: 'Motivo inválido.' }

  const { error: e } = await op.sb
    .from('motivos_cancelamento')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar motivo' : 'inativar motivo') }
  await audit(op.userId, ativo ? 'Ativou' : 'Inativou', id)
  revalidatePath('/cadastros/motivos')
  return { ok: true }
}

export async function excluirMotivo(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para excluir motivos.' }
  if (!id) return { ok: false, error: 'Motivo inválido.' }

  // Regra do legado (motDel 7320): motivo padrão do sistema só pode ser inativado.
  const { data: row } = await op.sb.from('motivos_cancelamento').select('sistema, nome').eq('id', id).maybeSingle()
  const m = row as { sistema?: boolean; nome?: string } | null
  if (m?.sistema) return { ok: false, error: 'Motivo padrão do sistema só pode ser inativado.' }

  const { error: e } = await op.sb.from('motivos_cancelamento').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir motivo') }
  await audit(op.userId, 'Excluiu', m?.nome || id)
  revalidatePath('/cadastros/motivos')
  return { ok: true }
}

/** Config de automação de não comparecimento (singleton por empresa). */
export type NoshowConfig = {
  ativa: boolean
  primeira_apos: string
  max_mensagens: number
  intervalo: string
  mensagem: string
  regra_reagenda: boolean
  regra_exclui: boolean
  regra_oculta: boolean
}

export async function salvarNoshowConfig(cfg: NoshowConfig): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar a automação.' }

  const empresa_id = await resolverEmpresaId(op)
  if (!empresa_id) return { ok: false, error: 'Empresa não encontrada.' }

  const max = Math.max(1, Math.min(10, Number(cfg.max_mensagens) || 2))
  const { error: e } = await op.sb
    .from('noshow_automacao')
    .upsert({
      empresa_id,
      ativa: !!cfg.ativa,
      primeira_apos: (cfg.primeira_apos || '').trim() || '2 horas',
      max_mensagens: max,
      intervalo: (cfg.intervalo || '').trim() || '2 horas',
      mensagem: cfg.mensagem || '',
      regra_reagenda: !!cfg.regra_reagenda,
      regra_exclui: !!cfg.regra_exclui,
      regra_oculta: !!cfg.regra_oculta,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'salvar automação de não comparecimento') }
  await audit(op.userId, 'Editou', 'Automação de não comparecimento (WhatsApp)')
  revalidatePath('/cadastros/motivos')
  return { ok: true }
}
