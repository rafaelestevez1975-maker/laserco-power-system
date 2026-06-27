import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ContratosManager } from '@/components/contratos/ContratosManager'
import type { ContratoRow } from '@/lib/contratos'

export const dynamic = 'force-dynamic'

// Quem escreve modelos de contrato (gate de UI; o servidor revalida em cada action).
const PAPEIS_ESCRITA = ['gestor']

type SP = { ativo?: string; nome?: string }

/**
 * /cadastros/contratos — Modelos de contrato (paridade com buildContratos do legado).
 * DB-backed: tabela contratos_modelo (migration scripts/migrations/categorias.sql).
 * Era um CLONE estático (snapshot inerte); agora é funcional (lista + editor + anexo).
 */
export default async function ContratosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ativoFil = sp.ativo ?? 'Sim' // legado: filtro Ativo (Sim/Não/Todos), default Sim
  const nomeFil = (sp.nome ?? '').trim()

  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  let query = sb
    .from('contratos_modelo')
    .select('id, nome, quando_emitido, enviar_email, todas_unidades, titulo, termos, arquivo_nome, arquivo_path, ativo, ordem')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (ativoFil === 'Sim') query = query.eq('ativo', true)
  else if (ativoFil === 'Não') query = query.eq('ativo', false)
  if (nomeFil) query = query.ilike('nome', `%${nomeFil}%`)

  const { data, error } = await query
  // Se a migration ainda não foi aplicada (tabela inexistente), tratamos como vazio
  // com banner pedindo para aplicar a migration.
  const modelos = (data ?? []) as ContratoRow[]
  const semTabela = !!error

  // KPIs (lista pequena — ~7 modelos no seed). Para "ativos" total, contagem leve.
  const { count: totalAtivos } = await sb
    .from('contratos_modelo')
    .select('id', { count: 'exact', head: true })
    .eq('ativo', true)
  const { count: totalComArquivo } = await sb
    .from('contratos_modelo')
    .select('id', { count: 'exact', head: true })
    .not('arquivo_path', 'is', null)

  return (
    <ContratosManager
      modelos={modelos}
      podeEscrever={podeEscrever}
      semTabela={semTabela}
      filtros={{ ativo: ativoFil, nome: nomeFil }}
      kpis={{ ativos: totalAtivos ?? 0, comArquivo: totalComArquivo ?? 0 }}
    />
  )
}
