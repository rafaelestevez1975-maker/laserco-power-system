import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { SacConfigManager, type Motivo, type Tag, type CanalUso } from '@/components/sac/SacConfigManager'
import { PremiacaoConfig } from '@/components/sac/PremiacaoConfig'
import { PREM_DEFAULT, type PremMonetaria } from '@/lib/sac'
import { SLA_HORAS_DEFAULT } from '@/lib/sac-config'

// Canais canônicos (mesma lista do write path / dashboard / kanban). Aqui só servem de
// "esqueleto" para os Canais ativos: cada um é cruzado com o uso real em sac_tickets.
const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']

export default async function SacConfigPage() {
  const ctx = await getSessionContext()
  const activeUnit = ctx?.activeUnitId ?? null
  const sb = await createClient()

  // Contagem real por canal (sac_tickets), escopada pela unidade ativa  substitui a
  // lista estática de "Canais ativos" por algo derivado do uso real (count exact, head).
  // Filtro de unidade aplicado inline (não pelo helper genérico) p/ não disparar a
  // recursão de tipos do Supabase (TS2589) no encadeamento do query builder.
  const canalCount = (k: string) => {
    let q = sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('canal', k)
    if (activeUnit) q = q.eq('unidade_id', activeUnit)
    return q
  }

  const [motRes, tgRes, cfgRes, canaisRes] = await Promise.all([
    sb.from('sac_motivos').select('id, label, ativo, ordem').order('ordem', { ascending: true }),
    sb.from('sac_tags').select('id, nome, cor, ativo').order('nome', { ascending: true }),
    sb.from('sac_premiacao_config').select('pesos').limit(1).maybeSingle(),
    Promise.all(CANAIS.map((k) => canalCount(k))),
  ])

  // Estado de erro honesto: falha de RLS/conexão não pode parecer "catálogo vazio".
  const erro = !!(motRes.error || tgRes.error || cfgRes.error || canaisRes.some((r) => r.error))

  const slaRaw = (cfgRes.data as { pesos?: { slaHoras?: number } } | null)?.pesos?.slaHoras
  const slaHoras = Number.isFinite(Number(slaRaw)) && Number(slaRaw) > 0 ? Number(slaRaw) : SLA_HORAS_DEFAULT

  // Regras de premiação do SAC (mesma fonte sac_premiacao_config.pesos)  vivem AQUI na config.
  const prem: PremMonetaria = { ...PREM_DEFAULT, ...((cfgRes.data as { pesos?: Partial<PremMonetaria> } | null)?.pesos ?? {}) }

  const canais: CanalUso[] = CANAIS.map((nome, i) => ({ nome, n: canaisRes[i].count ?? 0 }))

  const podeEditar = !!(ctx?.isAdmin || ctx?.papel === 'sac' || ctx?.papel === 'gestor')

  if (erro) {
    return (
      <div className="view active">
        <div className="lc-card" style={{ padding: 24, textAlign: 'center' }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 28, color: 'var(--red)' }} />
          <h3 style={{ fontSize: 15, margin: '8px 0 4px' }}>Não foi possível carregar a configuração do SAC</h3>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Houve uma falha ao consultar os catálogos. Recarregue a página; se persistir, verifique suas permissões.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view active">
      <SacConfigManager
        motivos={(motRes.data ?? []) as Motivo[]}
        tags={(tgRes.data ?? []) as Tag[]}
        slaHoras={slaHoras}
        canais={canais}
        unidadeAtiva={ctx?.activeUnitName ?? 'Todas as unidades'}
        podeEditar={podeEditar}
      />
      <div style={{ marginTop: 14 }}>
        <PremiacaoConfig prem={prem} podeEditar={podeEditar} />
      </div>
    </div>
  )
}
