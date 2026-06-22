import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { IndiquesManager, type Indicacao } from '@/components/indiques/IndiquesManager'

export default async function IndiquesPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const activeUnit = ctx?.activeUnitId ?? null
  const uniNome = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  let q = sb
    .from('indicacoes')
    .select('id, indicador_nome, indicador_telefone, premio_descricao, status, unidade_id, criado_em, indicacao_indicados(id, nome, telefone, email, status, observacoes)')
    .order('criado_em', { ascending: false })
    .limit(300)
  if (activeUnit) q = q.eq('unidade_id', activeUnit)
  const { data } = await q
  const indicacoes = (data ?? []) as Indicacao[]

  const todosIndicados = indicacoes.flatMap((i) => i.indicacao_indicados ?? [])
  const kpis: [string, number, string][] = [
    ['Indicações', indicacoes.length, 'ti-gift'],
    ['Indicados', todosIndicados.length, 'ti-users'],
    ['Agendaram', todosIndicados.filter((i) => ['agendou', 'compareceu', 'comprou'].includes(i.status ?? '')).length, 'ti-calendar-check'],
    ['Converteram', todosIndicados.filter((i) => i.status === 'comprou').length, 'ti-shopping-cart-check'],
  ]

  return (
    <div className="view active">
      <div className="crm-note">
        <i className="ti ti-gift" /> <b>Gestão de Indiques.</b> Indicações do site (e manuais) por unidade — a franqueadora vê todas.
        Abra cada lead para evoluir o andamento (pendente → contato → agendou → comprou).
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '4px 0 16px' }}>
        {kpis.map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: '#F7E7EB', color: 'var(--brand-500)', flexShrink: 0 }}><i className={`ti ${icon}`} style={{ fontSize: 19 }} /></span>
            <span><span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span><b style={{ fontSize: 20 }}>{val}</b></span>
          </div>
        ))}
      </div>

      <IndiquesManager indicacoes={indicacoes} unidades={ctx?.unidades ?? []} activeUnitId={activeUnit} uniNome={uniNome} />
    </div>
  )
}
