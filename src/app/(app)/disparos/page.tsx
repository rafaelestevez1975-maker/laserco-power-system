import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listInstances, uazapiConfigurado } from '@/lib/uazapi'
import { listarTemplates, dadosDisparos } from '@/app/(app)/expansao/disparos/actions'
import { DisparosTabs, type CampanhaRow, type BaseRow, type VipRow, type CanalOpt2 } from '@/components/disparos/DisparosTabs'

export const dynamic = 'force-dynamic'

type Binding = { instancia_nome: string; escopo: 'unidade' | 'geral'; unidade_id: string | null; rotulo: string | null; status?: string }
type CampDb = { id: string; nome: string; base_nome: string | null; canal_nome: string | null; status: string; enviadas: number; entregues: number; lidas: number; respostas: number; agendada_para: string | null; criado_em: string; unidade_id: string | null }
type BaseDb = { id: string; nome: string; tipo: string; contatos: number; criado_em: string }
type VipDb = { id: string; nome: string; data_convite: string | null; data_aquecimento: string | null; data_oferta_ini: string | null; data_oferta_fim: string | null; membros: number; status: string; link_publico: string | null }

export default async function DisparosPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null
  const uniNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))
  const sb = await createClient()

  // ── Canais conectados (público da campanha) ──
  let canais: CanalOpt2[] = []
  let apiCards: { unidade: string; canal: string; status: string; numero: string | null }[] = []
  if (uazapiConfigurado()) {
    try {
      const all = (await listInstances()).filter((i) => /laser/i.test(i.name))
      const { data } = await sb.from('canais_whatsapp').select('instancia_nome, escopo, unidade_id, rotulo')
      const byNome = new Map<string, Binding>(((data as Binding[] | null) ?? []).map((b) => [b.instancia_nome, b]))
      canais = all.filter((i) => i.status === 'connected').map((i) => {
        const b = byNome.get(i.name)
        const label = b?.rotulo || (b?.escopo === 'geral' ? 'Geral (franqueadora)' : (b?.unidade_id ? uniNome.get(b.unidade_id) ?? i.name : i.name))
        return { nome: i.name, label, escopo: b?.escopo ?? null }
      })
      apiCards = all.map((i) => {
        const b = byNome.get(i.name)
        return {
          unidade: b?.rotulo || (b?.escopo === 'geral' ? 'Geral (franqueadora)' : (b?.unidade_id ? uniNome.get(b.unidade_id) ?? i.name : i.name)),
          canal: i.name, status: i.status, numero: i.owner ?? null,
        }
      })
    } catch { /* vazio */ }
  }

  // ── Campanhas / Bases / VIP do DB ──
  let campanhas: CampanhaRow[] = []
  let campanhasTotal = 0
  let bases: BaseRow[] = []
  let vip: VipRow[] = []
  let semTabela = false
  try {
    let qCamp = sb.from('disparo_campanhas').select('id, nome, base_nome, canal_nome, status, enviadas, entregues, lidas, respostas, agendada_para, criado_em, unidade_id').order('criado_em', { ascending: false }).limit(100)
    if (unidadeId) qCamp = qCamp.eq('unidade_id', unidadeId)
    // count exato do total (não derivado do array capado em .limit(100)) p/ o KPI "Campanhas".
    let qCampCount = sb.from('disparo_campanhas').select('id', { count: 'exact', head: true })
    if (unidadeId) qCampCount = qCampCount.eq('unidade_id', unidadeId)
    const [rCamp, rCampCount, rBase, rVip] = await Promise.all([
      qCamp,
      qCampCount,
      sb.from('disparo_bases').select('id, nome, tipo, contatos, criado_em').order('criado_em', { ascending: false }).limit(100),
      sb.from('vip_grupos').select('id, nome, data_convite, data_aquecimento, data_oferta_ini, data_oferta_fim, membros, status, link_publico').order('criado_em', { ascending: false }).limit(100),
    ])
    if (rCamp.error && /relation|does not exist|schema cache/i.test(rCamp.error.message)) semTabela = true
    campanhasTotal = rCampCount.error ? 0 : (rCampCount.count ?? 0)
    campanhas = ((rCamp.data as CampDb[] | null) ?? []).map((c) => ({
      id: c.id, nome: c.nome, base: c.base_nome ?? '—', canal: c.canal_nome ?? '—', status: c.status,
      enviadas: c.enviadas, entregues: c.entregues, lidas: c.lidas, respostas: c.respostas,
      quando: c.agendada_para ? `Agendada ${new Date(c.agendada_para).toLocaleString('pt-BR')}` : new Date(c.criado_em).toLocaleDateString('pt-BR'),
      unidade: c.unidade_id ? uniNome.get(c.unidade_id) ?? '—' : 'Todas',
    }))
    bases = ((rBase.data as BaseDb[] | null) ?? []).map((b) => ({ id: b.id, nome: b.nome, tipo: b.tipo, contatos: b.contatos, criada: new Date(b.criado_em).toLocaleDateString('pt-BR') }))
    vip = ((rVip.data as VipDb[] | null) ?? []).map((g) => ({
      id: g.id, nome: g.nome, convite: g.data_convite, aquecimento: g.data_aquecimento,
      ofertaIni: g.data_oferta_ini, ofertaFim: g.data_oferta_fim, membros: g.membros, status: g.status, link: g.link_publico,
    }))
  } catch { semTabela = true }

  // ── Opções do segmentador (serviços + unidades reais) ──
  const { data: servRaw } = await sb.from('servicos').select('nome').eq('ativo', true).order('nome', { ascending: true }).limit(300)
  const servicos = ((servRaw as { nome: string }[] | null) ?? []).map((s) => s.nome)
  const unidades = (ctx?.unidades ?? []).map((u) => u.nome)

  // ── Composer (reaproveita o disparo real do expansao) ──
  const templates = await listarTemplates()
  const { listas } = await dadosDisparos(unidadeId)

  const podeEscrever = ctx?.isAdmin || ['gestor', 'operacoes'].includes(ctx?.papel ?? '')

  return (
    <div className="view active">
      <DisparosTabs
        tabInicial={sp.tab || 'campanhas'}
        canais={canais}
        apiCards={apiCards}
        campanhas={campanhas}
        campanhasTotal={campanhasTotal}
        bases={bases}
        vip={vip}
        servicos={servicos}
        unidades={unidades}
        listas={listas.map((l) => ({ nome: l.nome, qtd: l.qtd }))}
        templates={templates}
        activeUnitId={unidadeId}
        podeEscrever={!!podeEscrever}
        uazapiConfigurado={uazapiConfigurado()}
        semTabela={semTabela}
      />
    </div>
  )
}
