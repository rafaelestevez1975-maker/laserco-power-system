import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Exporta o catálogo de serviços (com os mesmos filtros da listagem) em CSV com BOM.
 * Paridade com o botão "Exportar" de Clientes.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()

  let q = sb
    .from('servicos')
    .select('nome, grupo, duracao_min, preco_padrao, desc_max, comissionavel, pagar_comissao, encaixe, agendamento_online, ordem_app, ativo')
    .order('grupo', { ascending: true, nullsFirst: false })
    .order('nome', { ascending: true })
    .range(0, 19999) // teto de segurança

  const grupo = sp.get('grupo')
  if (grupo) q = q.eq('grupo', grupo)
  const ativo = sp.get('ativo') ?? 'sim'
  if (ativo === 'sim') q = q.eq('ativo', true)
  else if (ativo === 'nao') q = q.eq('ativo', false)
  // Tipo de preço (mesma semântica da listagem): Fixo · Variável · Gratuito
  const tipoPreco = sp.get('tipo_preco') ?? ''
  if (tipoPreco === 'fixo') q = q.eq('dynamic_price', false).gt('preco_padrao', 0)
  else if (tipoPreco === 'variavel') q = q.eq('dynamic_price', true)
  else if (tipoPreco === 'gratuito') q = q.eq('preco_padrao', 0)
  // Comissionável (Sim/Não)
  const comiss = sp.get('comiss') ?? ''
  if (comiss === 'sim') q = q.eq('comissionavel', true)
  else if (comiss === 'nao') q = q.eq('comissionavel', false)
  const livre = sp.get('q')
  if (livre) {
    const qs = livre.replace(/[,()*]/g, ' ').trim()
    if (qs) q = q.or(`nome.ilike.%${qs}%,descricao.ilike.%${qs}%`)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    nome: string | null
    grupo: string | null
    duracao_min: number | null
    preco_padrao: number | null
    desc_max: number | null
    comissionavel: boolean | null
    pagar_comissao: string | null
    encaixe: boolean | null
    agendamento_online: boolean | null
    ordem_app: number | null
    ativo: boolean | null
  }
  const rows = (data ?? []) as Row[]

  const header = ['Nome', 'Grupo', 'Duração (min)', 'Preço', 'Desc. Máx (%)', 'Comissionável', 'Pagar comissão', 'Encaixe', 'Online', 'Ordem', 'Status']
  const lines = [header.join(';')]
  for (const s of rows) {
    lines.push([
      s.nome,
      s.grupo,
      s.duracao_min ?? '',
      s.preco_padrao ?? '',
      s.desc_max ?? '',
      s.comissionavel ? 'Sim' : 'Não',
      s.pagar_comissao || 'Execução',
      s.encaixe ? 'Sim' : 'Não',
      s.agendamento_online ? 'Sim' : 'Não',
      s.ordem_app ?? '',
      s.ativo === false ? 'Inativo' : 'Ativo',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="servicos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
