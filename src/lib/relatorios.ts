/**
 * Helpers de leitura para os relatórios construídos sobre DADO REAL do lkii.
 * Server-safe (importa apenas o client server-side via parâmetro). Centraliza o
 * "pull paginado" de OS / pagamentos usado por ranking-vendas, descontos, pagamentos,
 * contratos e ordens-servico  espelha a lógica do legado (buildRelatorio / RANKS).
 *
 * Tabelas reais (introspecção lkii, ver src/app/(app)/os/actions.ts):
 *   os(id, numero, unidade_id, cliente_id, status[aberta|fechada|cancelada], origem,
 *      total, valor_pago, valor_pendente, desconto_total, total_bruto, criado_por,
 *      criado_em, fechada_em, cancelada_em)
 *   os_pagamentos(os_id, data_pagamento, tipo, metodo, valor, status[aprovado|...], criado_em)
 *   os_servicos / os_produtos / os_pacotes(os_id, <ref>_id, profissional_id, quantidade,
 *      preco, preco_total, desconto, total)
 */
import type { createClient } from '@/lib/supabase/server'

type SB = Awaited<ReturnType<typeof createClient>>

const PAGE = 1000
export const PULL_CAP = 20000

/** Builder estrutural mínimo (encadeável + thenable via range)  evita TS2589 do PostgREST. */
type Q = {
  eq: (c: string, v: unknown) => Q
  gte: (c: string, v: unknown) => Q
  lt: (c: string, v: unknown) => Q
  in: (c: string, v: unknown[]) => Q
  range: (a: number, b: number) => Promise<{ data: unknown[] | null }>
}

export type OsLin = {
  id: string
  status: string | null
  origem: string | null
  total: number | null
  valor_pago: number | null
  valor_pendente: number | null
  desconto_total: number | null
  total_bruto: number | null
  cliente_id: string | null
  criado_por: string | null
  criado_em: string | null
}

/**
 * Pagina (range) as OS escopadas por unidade + janela de criação. Devolve até PULL_CAP linhas.
 * `status` opcional restringe (ex.: só 'fechada' p/ vendas efetivadas).
 */
export async function pullOS(
  sb: SB,
  opts: { unidadeId: string | null; ini: string | null; fim: string | null; status?: string | string[] },
): Promise<{ rows: OsLin[]; capped: boolean }> {
  const out: OsLin[] = []
  let from = 0
  let capped = false
  for (;;) {
    let q = sb
      .from('os')
      .select('id, status, origem, total, valor_pago, valor_pendente, desconto_total, total_bruto, cliente_id, criado_por, criado_em') as unknown as Q
    if (opts.unidadeId) q = q.eq('unidade_id', opts.unidadeId)
    if (Array.isArray(opts.status)) q = q.in('status', opts.status)
    else if (opts.status) q = q.eq('status', opts.status)
    if (opts.ini) q = q.gte('criado_em', `${opts.ini}T00:00:00`)
    if (opts.fim) q = q.lt('criado_em', `${opts.fim}T00:00:00`)
    const { data } = await q.range(from, from + PAGE - 1)
    const batch = (data ?? []) as OsLin[]
    out.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
    if (out.length >= PULL_CAP) {
      capped = true
      break
    }
  }
  return { rows: out, capped }
}

export type PagLin = {
  os_id: string | null
  data_pagamento: string | null
  metodo: string | null
  tipo: string | null
  valor: number | null
  status: string | null
}

/** Pagina os pagamentos de OS por janela de data_pagamento (DATE). */
export async function pullPagamentos(
  sb: SB,
  opts: { ini: string | null; fim: string | null; osIds?: string[] | null },
): Promise<{ rows: PagLin[]; capped: boolean }> {
  const out: PagLin[] = []
  let from = 0
  let capped = false
  // Se houver lista de OS da unidade, restringe por ela (a tabela de pagamentos não tem unidade_id).
  if (opts.osIds && opts.osIds.length === 0) return { rows: [], capped: false }
  for (;;) {
    let q = sb
      .from('os_pagamentos')
      .select('os_id, data_pagamento, metodo, tipo, valor, status') as unknown as Q
    if (opts.osIds && opts.osIds.length > 0) q = q.in('os_id', opts.osIds.slice(0, 1000))
    if (opts.ini) q = q.gte('data_pagamento', opts.ini)
    if (opts.fim) q = q.lt('data_pagamento', opts.fim)
    const { data } = await q.range(from, from + PAGE - 1)
    const batch = (data ?? []) as PagLin[]
    out.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
    if (out.length >= PULL_CAP) {
      capped = true
      break
    }
  }
  return { rows: out, capped }
}

/** Rótulos legíveis dos métodos de pagamento (espelha o legado/PDV). */
export const METODO_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  cheque: 'Cheque',
  credito_recorrente: 'Crédito recorrente',
  cartao_presente: 'Cartão presente',
  assinatura: 'Assinatura',
  pix: 'PIX',
  outros: 'Outros',
}

/** Rótulos de status de pagamento. */
export const PAG_STATUS_LABEL: Record<string, string> = {
  aprovado: 'Aprovado',
  pendente: 'Pendente',
  recusado: 'Recusado',
  estornado: 'Estornado',
  cancelado: 'Cancelado',
}

/** Carrega nomes de perfis_usuario (vendedores) por id. */
export async function nomesPerfis(sb: SB, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return out
  const { data } = await sb.from('perfis_usuario').select('id, nome_completo').in('id', uniq.slice(0, 1000))
  for (const r of (data ?? []) as { id: string; nome_completo: string | null }[]) {
    out[r.id] = r.nome_completo || '(sem nome)'
  }
  return out
}

/** Carrega nomes de clientes por id. */
export async function nomesClientes(sb: SB, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return out
  const { data } = await sb.from('clientes').select('id, nome').in('id', uniq.slice(0, 1000))
  for (const r of (data ?? []) as { id: string; nome: string | null }[]) {
    out[r.id] = r.nome || '(sem nome)'
  }
  return out
}
