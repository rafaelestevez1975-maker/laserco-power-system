import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { MetasUnidadeSimulador } from '@/components/metas/MetasUnidadeSimulador'
import { MetasColaboradorCrud, type MetaRow, type ColabOpt } from '@/components/metas/MetasColaboradorCrud'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['gestor']

/**
 * Metas — duas seções:
 *  1) Painel de metas da UNIDADE (venda mín. R$100k, agendamentos, clientes novos 25%,
 *     indicações) com apuração mensal/quinzenal/decendial. É SIMULADOR — não há tabela
 *     metas_unidade no backend lkii. //TODO(needs-table: metas_unidade).
 *  2) CRUD real de metas POR COLABORADOR sobre a tabela `metas_colaborador` (estava vazia).
 *
 * Multitenant: a tabela metas_colaborador NÃO tem coluna unidade_id → escopo aplicado via
 * o conjunto de colaboradores da unidade ativa (filtramos colaboradores por unidade_id e
 * só trazemos metas desses colaboradores). RBAC: só gestor/admin escreve.
 */
export default async function MetasPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))

  // Colaboradores ativos da unidade ativa (multitenant).
  let cq = sb.from('colaboradores').select('id, nome, cargo, unidade_id').eq('status', 'ativo').order('nome', { ascending: true }).limit(500)
  if (ctx?.activeUnitId) cq = cq.eq('unidade_id', ctx.activeUnitId)
  const { data: colabRaw } = await cq
  const colaboradores: ColabOpt[] = ((colabRaw ?? []) as { id: string; nome: string; cargo: string | null }[]).map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo }))
  const mapaColab = new Map(colaboradores.map((c) => [c.id, c.nome]))
  const colabIds = colaboradores.map((c) => c.id)

  // Metas dos colaboradores visíveis. Se houver escopo de unidade e existirem colaboradores,
  // restringe por colaborador_id; sem colaboradores na unidade, não há metas a mostrar.
  let metas: MetaRow[] = []
  if (!ctx?.activeUnitId || colabIds.length > 0) {
    let mq = sb
      .from('metas_colaborador')
      .select('id, colaborador_id, indicador, unidade_medida, valor_alvo, valor_realizado, peso, periodo_inicio, periodo_fim, status')
      .order('criado_em', { ascending: false })
      .limit(500)
    if (ctx?.activeUnitId && colabIds.length > 0) mq = mq.in('colaborador_id', colabIds)
    const { data: metasRaw } = await mq
    metas = ((metasRaw ?? []) as Omit<MetaRow, 'colaboradorNome'>[]).map((m) => ({
      ...m,
      colaboradorNome: mapaColab.get(m.colaborador_id) ?? '—',
    }))
  }

  // KPIs simples das metas de colaborador.
  const totalMetas = metas.length
  const batidas = metas.filter((m) => (m.valor_alvo ?? 0) > 0 && (m.valor_realizado ?? 0) >= (m.valor_alvo ?? 0)).length

  return (
    <div className="view active">
      <p style={{ color: 'var(--text-2)', fontSize: 13.5, marginBottom: 16 }}>
        Metas da unidade — ficam visíveis no Dashboard principal ao acessar o sistema. Defina meta de venda, de agendamentos e de clientes novos (avaliações), com apuração por mês, quinzena ou dezena e alertas em tempo real. Abaixo, gerencie também as <b>metas individuais por colaborador</b>.
      </p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Colaboradores ativos', colaboradores.length, 'ti-users'],
          ['Metas cadastradas', totalMetas, 'ti-target'],
          ['Metas batidas', batidas, 'ti-trophy'],
        ] as [string, number, string][]).map(([label, val, icon]) => (
          <div key={label} className="metric-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 9, background: 'var(--brand-50,#F7E7EB)', color: 'var(--brand-500)', flexShrink: 0 }}>
              <i className={`ti ${icon}`} style={{ fontSize: 19 }} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>{label}</span>
              <b style={{ fontSize: 20 }}>{val.toLocaleString('pt-BR')}</b>
            </span>
          </div>
        ))}
      </div>

      {/* Painel de metas da unidade (simulador) */}
      <MetasUnidadeSimulador unidades={unidades} />

      {/* CRUD real de metas por colaborador */}
      <MetasColaboradorCrud metas={metas} colaboradores={colaboradores} podeEscrever={podeEscrever} />
    </div>
  )
}
