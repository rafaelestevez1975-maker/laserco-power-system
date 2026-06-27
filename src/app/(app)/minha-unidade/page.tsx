import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { MinhaUnidadePanel, type UnidadeDados } from '@/components/unidades/MinhaUnidadePanel'

export const dynamic = 'force-dynamic'

/** Dados da unidade ativa (activeUnitId). Aba "Dados básicos" é editável;
 *  Horários/Bloqueios/Fotos/NFS-e são estados-vazios honestos (sem tabela no lkii). */
export default async function MinhaUnidadePage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEditar = ehAdmin(ctx?.papel) || ['gestor', 'proprietario', 'operacoes'].includes(ctx?.papel || '')

  const activeUnitId = ctx?.activeUnitId ?? null

  let dados: UnidadeDados | null = null
  if (activeUnitId) {
    const { data } = await sb
      .from('unidades')
      .select('id, nome, cnpj, endereco, cidade, estado, cep, ativa, bemp_salon_id')
      .eq('id', activeUnitId)
      .maybeSingle()
    dados = (data as UnidadeDados | null) ?? null
  }

  return (
    <MinhaUnidadePanel
      dados={dados}
      podeEditar={!!podeEditar}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
      semUnidade={!activeUnitId}
    />
  )
}
