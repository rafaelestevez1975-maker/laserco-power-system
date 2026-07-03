import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listInstances, uazapiConfigurado } from '@/lib/uazapi'
import { AUTOS_PADRAO, AUTOS_TOTAL } from '@/lib/automacoes'
import { AutomacoesView, type AutoCustom, type WaCanalInfo } from '@/components/automacoes/AutomacoesView'

export const dynamic = 'force-dynamic'

type EstadoRow = { chave: string; ativa: boolean }
type CustomRow = { id: string; nome: string; gatilho: string; acao: string; categoria: string; ativa: boolean; escopo: 'rede' | 'unidade'; unidade_id: string | null }
type NoShowRow = {
  ativa: boolean; primeira_apos: string; max_dia: number; intervalo: string; mensagem: string
  reagenda_se_responde: boolean; exclui_se_sem_resposta: boolean; oculta_dia_seguinte: boolean
}
type Binding = { instancia_nome: string; escopo: 'unidade' | 'geral'; unidade_id: string | null }

const NOSHOW_DEFAULT: NoShowRow = {
  ativa: true, primeira_apos: '2 horas', max_dia: 2, intervalo: '2 horas',
  mensagem: 'Olá {cliente}! 💙 Notamos que você não compareceu à sua sessão de {serviço} hoje às {hora}. Aconteceu algo? Temos horários disponíveis e adoraríamos remarcar para você. É só responder aqui que reagendamos na hora! 😊',
  reagenda_se_responde: true, exclui_se_sem_resposta: true, oculta_dia_seguinte: true,
}

export default async function AutomacoesPage() {
  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null
  const sb = await createClient()

  // ── Estado por unidade (override do default do catálogo) ──
  let estadoMap = new Map<string, boolean>()
  let custom: AutoCustom[] = []
  let noshow: NoShowRow = NOSHOW_DEFAULT
  let semTabela = false

  try {
    const qEstado = unidadeId
      ? sb.from('automacoes_estado').select('chave, ativa').eq('unidade_id', unidadeId)
      : sb.from('automacoes_estado').select('chave, ativa').limit(0)
    // personalizadas: padrão da rede (escopo='rede') + as da unidade ativa
    const qCustom = sb.from('automacoes_custom')
      .select('id, nome, gatilho, acao, categoria, ativa, escopo, unidade_id')
      .order('criado_em', { ascending: false })
    const qNoShow = unidadeId
      ? sb.from('automacao_noshow').select('ativa, primeira_apos, max_dia, intervalo, mensagem, reagenda_se_responde, exclui_se_sem_resposta, oculta_dia_seguinte').eq('unidade_id', unidadeId).maybeSingle()
      : Promise.resolve({ data: null, error: null })

    const [rEstado, rCustom, rNoShow] = await Promise.all([qEstado, qCustom, qNoShow])
    if (rEstado.error && /relation|does not exist|schema cache/i.test(rEstado.error.message)) semTabela = true
    estadoMap = new Map((rEstado.data as EstadoRow[] | null ?? []).map((r) => [r.chave, r.ativa]))
    custom = ((rCustom.data as CustomRow[] | null) ?? [])
      .filter((c) => c.escopo === 'rede' || (unidadeId && c.unidade_id === unidadeId))
      .map((c) => ({ id: c.id, nome: c.nome, gatilho: c.gatilho, acao: c.acao, categoria: c.categoria, ativa: c.ativa, escopo: c.escopo }))
    if (rNoShow.data) noshow = rNoShow.data as NoShowRow
  } catch {
    semTabela = true
  }

  // ── Status do WhatsApp da unidade ativa (reaproveita o vínculo real de /canais) ──
  let wa: WaCanalInfo = { configurado: uazapiConfigurado(), conectado: false, numero: null, nomeCanal: null }
  if (uazapiConfigurado() && unidadeId) {
    try {
      const all = await listInstances()
      const { data } = await sb.from('canais_whatsapp').select('instancia_nome, escopo, unidade_id')
      const bindings = (data as Binding[] | null) ?? []
      // canal da unidade ativa, senão o geral
      const bind = bindings.find((b) => b.escopo === 'unidade' && b.unidade_id === unidadeId)
        ?? bindings.find((b) => b.escopo === 'geral')
      if (bind) {
        const inst = all.find((i) => i.name === bind.instancia_nome)
        wa = {
          configurado: true,
          conectado: inst?.status === 'connected',
          numero: inst?.owner ?? null,
          nomeCanal: bind.instancia_nome,
        }
      }
    } catch { /* mantém wa default */ }
  }

  // ── KPIs (autosKpi 3928): ativas = catálogo (default ou override) + personalizadas ativas ──
  const padraoAtivas = AUTOS_PADRAO.filter((a) => estadoMap.get(a.chave) ?? a.ativoDefault).length
  const customAtivas = custom.filter((c) => c.ativa).length
  // enviadasMes/taxaResposta/recuperados: sem telemetria de envio/no-show no backend
  // ainda → null = estado honesto "" (antes eram 4820/38/64 inventados).
  const kpis = {
    ativas: padraoAtivas + customAtivas,
    total: AUTOS_TOTAL + custom.length,
    enviadasMes: null,
    taxaResposta: null,
    recuperados: null,
  }

  return (
    <div className="view active">
      <AutomacoesView
        catalogo={AUTOS_PADRAO}
        estado={Object.fromEntries(estadoMap)}
        custom={custom}
        noshow={noshow}
        kpis={kpis}
        wa={wa}
        unidadeNome={ctx?.activeUnitName ?? 'Todas as unidades'}
        temUnidadeAtiva={!!unidadeId}
        isAdmin={ctx?.isAdmin ?? false}
        podeEscrever={ctx?.isAdmin || ['gestor', 'operacoes'].includes(ctx?.papel ?? '')}
        semTabela={semTabela}
      />
    </div>
  )
}
