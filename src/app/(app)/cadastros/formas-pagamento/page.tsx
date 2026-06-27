import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { FormasPagamentoManager, type FormaRow } from '@/components/formas-pagamento/FormasPagamentoManager'

export const dynamic = 'force-dynamic'

// Papéis com escrita (gate de UI; o servidor revalida em cada action).
const PAPEIS_ESCRITA = ['gestor', 'financeiro']

type SP = { nome?: string; ativo?: string }

export default async function FormasPagamentoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ativo = sp.ativo ?? 'Todos' // legado: filtro Ativo (Sim/Não/Todos), default Todos
  const nome = (sp.nome ?? '').trim()
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // Catálogo por empresa (sem escopo de unidade). Ordena por ordem/nome (legado PGTO).
  let query = sb
    .from('formas_pagamento')
    .select('id, nome, tipo, taxa, taxa_comissao, ativo, rec_modo, rec_token, rec_max_parc, rec_min_parcela, rec_base_royalties')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (ativo === 'Sim') query = query.eq('ativo', true)
  else if (ativo === 'Não') query = query.eq('ativo', false)
  if (nome) query = query.ilike('nome', `%${nome}%`)

  const { data, error } = await query
  // Se a migration ainda não foi aplicada (tabela inexistente), tratamos como vazio
  // com banner pedindo para aplicar a migration.
  const formas = (data ?? []) as FormaRow[]
  const semTabela = !!error

  // KPIs sobre o conjunto carregado (lista costuma ter ~30 formas — leve).
  const cartoesRe = /Crédito|Débito|Link de Pagamento/i
  const kpis = {
    total: formas.length,
    ativos: formas.filter((r) => r.ativo !== false).length,
    cartoes: formas.filter((r) => cartoesRe.test(`${r.tipo || ''} ${r.nome || ''}`)).length,
  }

  return (
    <FormasPagamentoManager
      formas={formas}
      podeEscrever={podeEscrever}
      kpis={kpis}
      filtros={{ ativo, nome }}
      vazio={semTabela || formas.length === 0}
    />
  )
}
