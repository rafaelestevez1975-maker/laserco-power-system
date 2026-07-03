'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { catToColumns, type ComCat } from '@/lib/comissoes'

export type ActionResult = { ok: boolean; error?: string }

// Quem pode salvar a matriz (mesmo gate da page + RLS da tabela matriz_comissoes).
const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || (!!papel && PAPEIS_ESCRITA.includes(papel))
}

type Op = NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>

/** Resolve a empresa do usuário via perfis_usuario → unidades.empresa_id (fallback: 1ª empresa). */
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

/**
 * Salva a matriz de comissões inteira (uma linha por categoria) para a empresa.
 * Estratégia simples e idempotente: apaga as categorias da empresa e regrava as
 * recebidas (a matriz é pequena  5..10 linhas). Fiel à edição livre do legado
 * (readComCards/novaCategoria) que reescrevia COM_CATS por completo.
 */
export async function salvarMatriz(cats: ComCat[]): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para salvar a matriz de comissões.' }

  if (!Array.isArray(cats) || cats.length === 0) return { ok: false, error: 'A matriz não pode ficar vazia.' }
  for (const c of cats) {
    if (!(c.nome || '').trim()) return { ok: false, error: 'Toda categoria precisa de um nome.' }
  }

  const empresa_id = await resolverEmpresaId(op)
  if (!empresa_id) return { ok: false, error: 'Não foi possível identificar a empresa.' }

  // Apaga as categorias atuais da empresa (RLS garante o escopo de papel).
  const { error: delErr } = await op.sb.from('matriz_comissoes').delete().eq('empresa_id', empresa_id)
  if (delErr) return { ok: false, error: msgErro(delErr.message, 'salvar a matriz de comissões') }

  const rows = cats.map((c, i) => ({ empresa_id, ...catToColumns(c, i + 1) }))
  const { error: insErr } = await op.sb.from('matriz_comissoes').insert(rows)
  if (insErr) return { ok: false, error: msgErro(insErr.message, 'salvar a matriz de comissões') }

  revalidatePath('/cadastros/comissoes')
  return { ok: true }
}
