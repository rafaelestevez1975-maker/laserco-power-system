/**
 * Núcleo do razão financeiro (`fin_lancamento`) — a ÚNICA porta de escrita.
 *
 * Arquitetura (revisão do arquiteto): o financeiro é um SERVIÇO CENTRAL. Os módulos
 * (royalties, SAC, folha, compras, taxas…) são PRODUTORES: chamam `postLancamento` com
 * {natureza, valor, plano de conta, centro de custo, competência, origem}. As telas
 * (DRE, fluxo de caixa, a receber/a pagar) DERIVAM do razão — não guardam valor próprio.
 * Assim o número bate igual em todas as telas (sem divergência).
 *
 * Server-only (usa service role — a AUTORIZAÇÃO é feita na action que chama). Idempotente
 * por `idem_key`.
 */
import { adminClient } from '@/lib/supabase/admin'
import type { SB } from '@/lib/sb'

export type LancamentoEvento = {
  empresaId: string | null
  centroCustoId: string | null
  planoContaId: string | null
  natureza: 'receita' | 'despesa' | 'transferencia'
  competencia: string            // 'YYYY-MM-01' (1º dia do mês do fato)
  valor: number
  origem: string                 // royalty | bemp | sac | folha | compra | taxa_cartao | manual
  idemKey?: string | null
  origemRef?: string | null
  dataPrevista?: string | null
  historico?: string | null
  documento?: string | null
  status?: 'previsto' | 'realizado' | 'conciliado' | 'cancelado'
}

/** Grava lançamentos no razão. Idempotente: pula os `idem_key` que já existem. */
export async function postLancamento(eventos: LancamentoEvento | LancamentoEvento[]): Promise<{ inseridos: number }> {
  const sb = adminClient()
  const lista = (Array.isArray(eventos) ? eventos : [eventos]).filter((e) => Number(e.valor) > 0)
  if (lista.length === 0) return { inseridos: 0 }
  const rows = lista.map((e) => ({
    empresa_id: e.empresaId, centro_custo_id: e.centroCustoId, plano_conta_id: e.planoContaId,
    natureza: e.natureza, competencia: e.competencia, valor: Math.round(Number(e.valor) * 100) / 100,
    origem: e.origem, origem_ref: e.origemRef ?? null, idem_key: e.idemKey ?? null,
    data_prevista: e.dataPrevista ?? null, historico: e.historico ?? null,
    documento: e.documento ?? null, status: e.status ?? 'previsto',
  }))
  const keys = rows.map((r) => r.idem_key).filter(Boolean) as string[]
  // Dedup em LOTES de 100 — com centenas de chaves (royalties de dezenas de franquias) um
  // único .in(keys) estoura o tamanho da URL (414). O índice único já barra duplicata, mas
  // checar em lote evita reinserção desnecessária e mantém o request pequeno.
  const jaTem = new Set<string>()
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await sb.from('fin_lancamento').select('idem_key').in('idem_key', keys.slice(i, i + 100))
    for (const r of (data ?? []) as { idem_key: string }[]) jaTem.add(r.idem_key)
  }
  const novos = rows.filter((r) => !r.idem_key || !jaTem.has(r.idem_key))
  if (novos.length === 0) return { inseridos: 0 }
  const { data, error } = await sb.from('fin_lancamento').insert(novos).select('id')
  if (error) throw new Error(error.message)
  return { inseridos: data?.length ?? 0 }
}

/**
 * SUBSTITUI os lançamentos de uma (origem, competência): apaga os antigos e regrava os novos.
 * É a semântica correta para "reapurar" (o valor muda quando o dado-fonte ou o % muda).
 *
 * IMPORTANTE: NÃO engole erro. O PostgREST não dá transação cross-request, então o DELETE
 * comita antes do INSERT; se o post falhar, LANÇAMOS o erro para o chamador sinalizar e o
 * operador reapurar (self-heal na próxima execução — o DELETE seguinte não acha nada e o post
 * grava). Engolir aqui (como no best-effort de produtores que só inserem) apagaria os dados e
 * reportaria sucesso — inflando o resultado no DRE. */
export async function repostLancamento(origem: string, competencia: string, eventos: LancamentoEvento[]): Promise<{ inseridos: number }> {
  const sb = adminClient()
  const { error } = await sb.from('fin_lancamento').delete().eq('origem', origem).eq('competencia', competencia)
  if (error) throw new Error(error.message)
  return postLancamento(eventos)
}

/** Concilia um lançamento (sub-livro A Receber/A Pagar → razão): marca 'conciliado' + data de caixa.
 *  É a ponte do caixa: quando a baixa/pagamento acontece no sub-livro, o razão registra o caixa
 *  (o 'recebido/pago' do Fluxo passa a refletir a realidade). Service role (RLS bloqueia write). */
export async function conciliarLancamento(lancamentoId: string, dataCaixa: string): Promise<void> {
  const { error } = await adminClient().from('fin_lancamento').update({ status: 'conciliado', data_caixa: dataCaixa }).eq('id', lancamentoId)
  if (error) throw new Error(error.message)
}

/** Mapas de apoio: centro de custo por unidade (+ o da rede) e plano de contas por código. */
export async function mapaFinanceiro(sb: SB): Promise<{
  centroPorUnidade: Map<string, string>; centroRede: string | null; planoPorCodigo: Map<string, string>
}> {
  const [{ data: centros }, { data: planos }] = await Promise.all([
    sb.from('centro_custo').select('id, unidade_id, tipo'),
    sb.from('plano_conta').select('id, codigo'),
  ])
  const centroPorUnidade = new Map<string, string>()
  let centroRede: string | null = null
  for (const c of (centros ?? []) as { id: string; unidade_id: string | null; tipo: string }[]) {
    if (c.tipo === 'rede') centroRede = c.id
    else if (c.unidade_id) centroPorUnidade.set(c.unidade_id, c.id)
  }
  const planoPorCodigo = new Map<string, string>()
  for (const p of (planos ?? []) as { id: string; codigo: string | null }[]) if (p.codigo) planoPorCodigo.set(p.codigo, p.id)
  return { centroPorUnidade, centroRede, planoPorCodigo }
}
