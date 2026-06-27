'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * Grupo de serviços — paridade com o legado (buildGrpserv / GRPSERV).
 * Cadastro por EMPRESA. RBAC: admin_geral / gestor.
 * Tabela `grupo_servicos` (migration scripts/migrations/catalogo.sql):
 *   id, empresa_id, nome, ativo, ordem.
 * Renomear propaga para servicos.grupo (texto) para manter o catálogo coerente.
 */
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

export async function criarGrupo(nome: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para criar grupos.' }

  const n = (nome || '').trim()
  if (!n) return { ok: false, error: 'Informe o nome do grupo.' }
  if (n.length < 2) return { ok: false, error: 'Nome muito curto.' }

  const empresa_id = await resolverEmpresaId(op)
  const { data, error: e } = await op.sb
    .from('grupo_servicos')
    .insert({ empresa_id, nome: n, ativo: true })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'criar grupo') }
  revalidatePath('/cadastros/grupo-servicos')
  revalidatePath('/servicos')
  return { ok: true, id: (data as { id: string }).id }
}

/** Renomeia o grupo e propaga para servicos.grupo (todos os serviços do grupo antigo). */
export async function renomearGrupo(id: string, nomeAntigo: string, nomeNovo: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar grupos.' }
  if (!id) return { ok: false, error: 'Grupo inválido.' }

  const novo = (nomeNovo || '').trim()
  const antigo = (nomeAntigo || '').trim()
  if (!novo) return { ok: false, error: 'Informe o novo nome do grupo.' }
  if (novo === antigo) return { ok: false, error: 'O novo nome é igual ao atual.' }

  const { error: e } = await op.sb
    .from('grupo_servicos')
    .update({ nome: novo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'renomear grupo') }

  // Propaga para o catálogo de serviços (grupo é texto em servicos.grupo).
  if (antigo) {
    await op.sb.from('servicos').update({ grupo: novo, atualizado_em: new Date().toISOString() }).eq('grupo', antigo)
  }

  revalidatePath('/cadastros/grupo-servicos')
  revalidatePath('/servicos')
  return { ok: true }
}

export async function toggleGrupoAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar grupos.' }
  if (!id) return { ok: false, error: 'Grupo inválido.' }

  const { error: e } = await op.sb
    .from('grupo_servicos')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar grupo' : 'inativar grupo') }
  revalidatePath('/cadastros/grupo-servicos')
  revalidatePath('/servicos')
  return { ok: true }
}
