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
// Lote do filtro IN: UUIDs grandes estouram a URL do PostgREST (~800 ids → 400 Bad Request)
// e, pior, .slice(0,1000) truncava SILENCIOSAMENTE a lista de OS → subcontagem de pagamentos.
const IN_CHUNK = 150
const PAR = 8 // lotes de chunks rodando em paralelo

function emLotes<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/** Builder estrutural mínimo (encadeável + thenable via range)  evita TS2589 do PostgREST. */
type Q = {
  eq: (c: string, v: unknown) => Q
  gte: (c: string, v: unknown) => Q
  lt: (c: string, v: unknown) => Q
  in: (c: string, v: unknown[]) => Q
  order: (c: string, o?: { ascending?: boolean }) => Q
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
    // ORDER estável (mais recentes primeiro): paginar com range() SEM order deixa a ordem instável
    // entre páginas → linhas puladas/duplicadas. Também torna real a "amostra das mais recentes"
    // do RANK_MAX_OS em pullServicosPorOS (que fatia os primeiros N destes).
    q = q.order('criado_em', { ascending: false })
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

/**
 * Pagina os pagamentos de OS por janela de data_pagamento (DATE).
 * Quando há lista de OS da unidade (a tabela de pagamentos não tem unidade_id), escopamos por
 * ela em LOTES pequenos (IN_CHUNK) — antes o `.slice(0,1000)` truncava a lista e subcontava o
 * dinheiro de unidades grandes. Os lotes rodam em paralelo (PAR) e paginam internamente.
 */
export async function pullPagamentos(
  sb: SB,
  opts: { ini: string | null; fim: string | null; osIds?: string[] | null },
): Promise<{ rows: PagLin[]; capped: boolean }> {
  if (opts.osIds && opts.osIds.length === 0) return { rows: [], capped: false }

  let capped = false

  // Puxa um "chunk" (lista de os_id, ou null = sem filtro de OS) paginando por range().
  // Respeita PULL_CAP INTERNAMENTE (crucial no caminho sem osIds = admin/rede: sem o corte, uma
  // janela ampla puxaria a tabela os_pagamentos inteira p/ a memória do server component → 500/OOM).
  // Order estável por data_pagamento evita pular/duplicar linha entre páginas.
  async function puxarChunk(ids: string[] | null): Promise<PagLin[]> {
    const acc: PagLin[] = []
    let from = 0
    for (;;) {
      let q = sb
        .from('os_pagamentos')
        .select('os_id, data_pagamento, metodo, tipo, valor, status') as unknown as Q
      if (ids) q = q.in('os_id', ids)
      if (opts.ini) q = q.gte('data_pagamento', opts.ini)
      if (opts.fim) q = q.lt('data_pagamento', opts.fim)
      q = q.order('data_pagamento', { ascending: false })
      const { data } = await q.range(from, from + PAGE - 1)
      const batch = (data ?? []) as PagLin[]
      acc.push(...batch)
      if (batch.length < PAGE) break
      from += PAGE
      if (acc.length >= PULL_CAP) { capped = true; break }
    }
    return acc
  }

  const out: PagLin[] = []

  if (!opts.osIds) {
    out.push(...(await puxarChunk(null)))
  } else {
    const grupos = emLotes(opts.osIds, IN_CHUNK)
    for (let i = 0; i < grupos.length; i += PAR) {
      const res = await Promise.all(grupos.slice(i, i + PAR).map((g) => puxarChunk(g)))
      for (const r of res) out.push(...r)
      if (out.length >= PULL_CAP) {
        capped = true
        break
      }
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

/** Carrega nomes de perfis_usuario (vendedores) por id — em lotes (antes só resolvia 1000). */
export async function nomesPerfis(sb: SB, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return out
  const res = await Promise.all(
    emLotes(uniq, IN_CHUNK).map((g) => sb.from('perfis_usuario').select('id, nome_completo').in('id', g)),
  )
  for (const { data } of res) {
    for (const r of (data ?? []) as { id: string; nome_completo: string | null }[]) {
      out[r.id] = r.nome_completo || '(sem nome)'
    }
  }
  return out
}

/** Mapa os_id → cliente_id resolvido em lotes (os_pagamentos não tem cliente_id direto). */
export async function mapaOsCliente(sb: SB, osIds: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  const uniq = [...new Set(osIds.filter(Boolean))]
  if (uniq.length === 0) return out
  const res = await Promise.all(
    emLotes(uniq, IN_CHUNK).map((g) => sb.from('os').select('id, cliente_id').in('id', g)),
  )
  for (const { data } of res) {
    for (const o of (data ?? []) as { id: string; cliente_id: string | null }[]) out[o.id] = o.cliente_id
  }
  return out
}

/** Carrega nomes de clientes por id — em lotes (antes só resolvia 1000). */
export async function nomesClientes(sb: SB, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return out
  const res = await Promise.all(
    emLotes(uniq, IN_CHUNK).map((g) => sb.from('clientes').select('id, nome').in('id', g)),
  )
  for (const { data } of res) {
    for (const r of (data ?? []) as { id: string; nome: string | null }[]) {
      out[r.id] = r.nome || '(sem nome)'
    }
  }
  return out
}
