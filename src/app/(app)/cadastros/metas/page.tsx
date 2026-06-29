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

  // Baseline REAL do simulador de metas (antes era 274/305 chumbado): agendamentos
  // não-cancelados do MÊS ANTERIOR — média da rede (total / nº unidades) e a própria
  // unidade ativa. A RLS limita a leitura ao que o perfil enxerga.
  const _h = new Date()
  const mesAntDe = new Date(_h.getFullYear(), _h.getMonth() - 1, 1).toISOString()
  const mesAntAte = new Date(_h.getFullYear(), _h.getMonth(), 1).toISOString()
  const agMesAntBase = () => sb.from('agendamentos').select('id', { count: 'exact', head: true })
    .gte('inicio', mesAntDe).lt('inicio', mesAntAte).not('status', 'in', '(cancelado)')
  const [{ count: agRedeMesAnt }, { count: agUniMesAnt }] = await Promise.all([
    agMesAntBase(),
    ctx?.activeUnitId
      ? agMesAntBase().eq('unidade_id', ctx.activeUnitId)
      : Promise.resolve({ count: null as number | null }),
  ])
  const nUnitsMeta = Math.max(1, unidades.length)
  const mediaRedeAg = Math.round((agRedeMesAnt ?? 0) / nUnitsMeta)
  const mesAnteriorAg = ctx?.activeUnitId ? (agUniMesAnt ?? 0) : mediaRedeAg

  // Colaboradores ativos da unidade ativa (multitenant).
  let cq = sb.from('colaboradores').select('id, nome, cargo, unidade_id').eq('status', 'ativo').order('nome', { ascending: true }).limit(500)
  if (ctx?.activeUnitId) cq = cq.eq('unidade_id', ctx.activeUnitId)
  const { data: colabRaw, error: colabErr } = await cq
  const colaboradores: ColabOpt[] = ((colabRaw ?? []) as { id: string; nome: string; cargo: string | null }[]).map((c) => ({ id: c.id, nome: c.nome, cargo: c.cargo }))
  const mapaColab = new Map(colaboradores.map((c) => [c.id, c.nome]))
  const colabIds = colaboradores.map((c) => c.id)

  // KPI "Colaboradores ativos" → contagem REAL (count exato), nunca o .length de uma lista
  // capada a 500. Mesmo escopo de unidade da lista acima.
  let countQ = sb.from('colaboradores').select('id', { count: 'exact', head: true }).eq('status', 'ativo')
  if (ctx?.activeUnitId) countQ = countQ.eq('unidade_id', ctx.activeUnitId)
  const { count: colabAtivosCount } = await countQ
  const totalColaboradoresAtivos = colabAtivosCount ?? colaboradores.length

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
    const metasBase = (metasRaw ?? []) as Omit<MetaRow, 'colaboradorNome'>[]

    // Sem escopo de unidade (admin/todas) as metas vêm globalmente, mas mapaColab cobre só
    // os 500 primeiros colaboradores em ordem alfabética → nomes ficariam '—'. Resolve os
    // nomes faltantes consultando exatamente os colaborador_id presentes nestas metas.
    const idsFaltantes = Array.from(new Set(metasBase.map((m) => m.colaborador_id).filter((id) => id && !mapaColab.has(id))))
    if (idsFaltantes.length > 0) {
      const { data: extraColab } = await sb.from('colaboradores').select('id, nome').in('id', idsFaltantes)
      for (const c of (extraColab ?? []) as { id: string; nome: string }[]) mapaColab.set(c.id, c.nome)
    }

    metas = metasBase.map((m) => ({
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

      {colabErr && (
        <div className="crm-note" style={{ borderColor: 'var(--red, #D85563)', color: 'var(--red, #D85563)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar os colaboradores. Os indicadores podem estar incompletos.
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, margin: '0 0 18px' }}>
        {([
          ['Colaboradores ativos', totalColaboradoresAtivos, 'ti-users'],
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
      <MetasUnidadeSimulador unidades={unidades} mediaRede={mediaRedeAg} mesAnterior={mesAnteriorAg} />

      {/* CRUD real de metas por colaborador */}
      <MetasColaboradorCrud metas={metas} colaboradores={colaboradores} podeEscrever={podeEscrever} />
    </div>
  )
}
