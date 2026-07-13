import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { normalizarSecoes, type DocumentoRow } from '@/lib/anamnese'
import { AnamneseManager, type DocViewRow } from '@/components/anamnese/AnamneseManager'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['gestor']

type SP = { q?: string; ativo?: string } // ativo: '' (todos, default) | 'sim' | 'nao'

export default async function AnamnesePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const ativo = sp.ativo ?? ''
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  let query = sb
    .from('documentos')
    .select('id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo, unidades_ids, secoes, atualizado_em')
    .order('atualizado_em', { ascending: false })
  // Ativo (Sim/Não): Sim = status 'Ativo' · Não = status 'Inativo' · vazio = todos
  if (ativo === 'sim') query = query.eq('status', 'Ativo')
  else if (ativo === 'nao') query = query.eq('status', 'Inativo')
  if (q) query = query.ilike('nome', `%${q}%`)

  const { data, error } = await query

  const semTabela = !!error
  const rows = (data ?? []) as DocumentoRow[]

  // Normaliza o JSONB de seções (defensivo) e mantém shape pronto p/ o cliente.
  const documentos: DocViewRow[] = rows.map((d) => ({
    ...d,
    secoes: normalizarSecoes(d.secoes),
  }))

  // Unidades reais da rede (para a seção "Unidades com acesso" do editor).
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))

  return (
    <AnamneseManager
      documentos={documentos}
      unidades={unidades}
      podeEscrever={podeEscrever}
      semTabela={semTabela}
      filtros={{ q, ativo }}
    />
  )
}
