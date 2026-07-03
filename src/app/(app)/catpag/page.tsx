import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { CategoriasManager, type CatRow } from '@/components/catcontas/CategoriasManager'

export const dynamic = 'force-dynamic'

const PAPEIS_GESTAO = ['financeiro', 'gestor']

/** /catpag  Categorias de contas a PAGAR (plano_contas tipo=despesa). */
export default async function CatPagPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeGerir = ehAdmin(ctx?.papel) || PAPEIS_GESTAO.includes(ctx?.papel || '')

  const { data, error } = await sb
    .from('plano_contas')
    .select('id, parent_id, codigo, nome, tipo, natureza, aceita_lancamentos, is_sistema, ativo')
    .eq('tipo', 'despesa')
    .order('codigo', { ascending: true })

  // Erro de query (RLS, coluna ausente, banco) não pode virar "Nenhuma
  // categoria" silencioso  mostra estado de erro honesto.
  if (error) {
    return (
      <div className="view active">
        <div className="crm-note" style={{ marginBottom: 14, borderColor: 'var(--red, #D85563)', color: 'var(--red, #D85563)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar as categorias de contas a pagar. Tente novamente; se persistir, avise o suporte.
          <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--text-3)' }}>Detalhe técnico: {error.message}</div>
        </div>
      </div>
    )
  }

  const rows = (data ?? []) as CatRow[]

  return <CategoriasManager tipo="despesa" rows={rows} podeGerir={podeGerir} />
}
