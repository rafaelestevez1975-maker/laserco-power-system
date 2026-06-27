import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { temPapel } from '@/lib/rbac'
import { FinanceiroTabs } from '@/components/financeiro/FinanceiroTabs'
import {
  FIN_CATS_REC, FIN_REGUA, FIN_ADQUIRENTES, FIN_BANCO_DEFAULT,
  ROYALTY_PCT_DEFAULT, FUNDO_PCT_DEFAULT, VENC_DIA_DEFAULT,
  calcDiasAtraso,
} from '@/lib/financeiro'

export const dynamic = 'force-dynamic'

export type Recebivel = {
  id: string; unidade_nome: string | null; categoria: string; competencia: string | null
  bruto: number | null; valor: number | null; vencimento: string | null; status: string
  dias_atraso: number; boleto: string | null; enviado: boolean; data_pagamento: string | null; jur_id: string | null
}
export type ContaPagar = {
  id: string; categoria: string; descricao: string | null; escopo: string
  valor: number | null; vencimento: string | null; status: string; prioridade: string
}
export type Conciliacao = {
  id: string; data: string | null; unidade_nome: string | null; adquirente: string | null
  venda: number | null; taxa_pct: number | null; taxa: number | null; esperado: number | null
  recebido: number | null; status: string; observacao: string | null
}
export type FinConfig = {
  royalty_pct: number; fundo_pct: number; venc_dia: number
  banco: Record<string, unknown>; adquirentes: unknown[]; categorias: string[]; regua: { dias: number; acao: string; canal: string }[]
}

const ABAS_VALIDAS = ['fluxo', 'dre', 'calc', 'receber', 'pagar', 'conciliacao', 'royalties', 'cobranca', 'config'] as const

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams
  const tabInicial = (ABAS_VALIDAS as readonly string[]).includes(sp.tab || '') ? (sp.tab as string) : 'fluxo'
  const ctx = await getSessionContext()
  const sb = await createClient()
  // Gate de acesso: admin OU perfil financeiro (legado: isAdmin() || USER_ROLE==='Financeiro').
  const permitido = temPapel(ctx?.papel, 'financeiro', 'gestor')

  if (!permitido) {
    return (
      <div className="view active">
        <div className="rel-legend" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-shield-lock" style={{ fontSize: 18, color: 'var(--brand-600)' }} />
          <span>Módulo restrito a <b>administradores</b> e ao perfil <b>Financeiro</b>.</span>
        </div>
      </div>
    )
  }

  const hojeISO = new Date().toISOString().slice(0, 10)

  // ── Feature-detect: a migration cria fin_recebiveis. Se a tabela não existe,
  //    a query falha → banner de migration + tela em modo vazio. ──
  let migracaoOk = true
  let recebiveis: Recebivel[] = []
  {
    const { data, error } = await sb
      .from('fin_recebiveis')
      .select('id, unidade_nome, categoria, competencia, bruto, valor, vencimento, status, dias_atraso, boleto, enviado, data_pagamento, jur_id')
      .order('vencimento', { ascending: true, nullsFirst: false })
      .limit(2000)
    if (error) migracaoOk = false
    else recebiveis = ((data ?? []) as Recebivel[]).map((r) => ({
      ...r,
      // Recalcula dias de atraso em runtime (calcDias) p/ status 'atrasado'.
      dias_atraso: r.status === 'atrasado' ? (r.dias_atraso || calcDiasAtraso(r.vencimento, hojeISO)) : r.dias_atraso,
    }))
  }

  let contasPagar: ContaPagar[] = []
  let conciliacao: Conciliacao[] = []
  let config: FinConfig | null = null
  if (migracaoOk) {
    const [{ data: pagRaw }, { data: concRaw }, { data: cfgRaw }] = await Promise.all([
      sb.from('fin_contas_pagar').select('id, categoria, descricao, escopo, valor, vencimento, status, prioridade').order('vencimento', { ascending: true, nullsFirst: false }).limit(2000),
      sb.from('fin_conciliacao').select('id, data, unidade_nome, adquirente, venda, taxa_pct, taxa, esperado, recebido, status, observacao').order('data', { ascending: true, nullsFirst: false }).limit(1000),
      sb.from('fin_config').select('royalty_pct, fundo_pct, venc_dia, banco, adquirentes, categorias, regua').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
    ])
    contasPagar = (pagRaw ?? []) as ContaPagar[]
    conciliacao = (concRaw ?? []) as Conciliacao[]
    config = cfgRaw as FinConfig | null
  }

  // Config com defaults do legado quando não houver linha salva.
  const cfg: FinConfig = config ?? {
    royalty_pct: ROYALTY_PCT_DEFAULT, fundo_pct: FUNDO_PCT_DEFAULT, venc_dia: VENC_DIA_DEFAULT,
    banco: { ...FIN_BANCO_DEFAULT }, adquirentes: [...FIN_ADQUIRENTES], categorias: [...FIN_CATS_REC], regua: [...FIN_REGUA],
  }

  return (
    <div className="view active">
      <FinanceiroTabs
        migracaoOk={migracaoOk}
        recebiveis={recebiveis}
        contasPagar={contasPagar}
        conciliacao={conciliacao}
        config={cfg}
        hojeISO={hojeISO}
        tabInicial={tabInicial as 'fluxo'}
      />
    </div>
  )
}
