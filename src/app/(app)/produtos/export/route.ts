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
 * Exporta o catálogo de produtos (com os mesmos filtros da listagem) em CSV com BOM.
 * Paridade com o botão "Exportar" de Clientes.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()

  let q = sb
    .from('produtos')
    .select('nome, grupo, preco_padrao, feedstock, default_product, ativo')
    .order('nome', { ascending: true })
    .range(0, 19999) // teto de segurança

  const grupo = sp.get('grupo')
  if (grupo) q = q.eq('grupo', grupo)
  const ativo = sp.get('ativo') ?? 'sim'
  if (ativo === 'sim') q = q.eq('ativo', true)
  else if (ativo === 'nao') q = q.eq('ativo', false)
  const insumo = sp.get('insumo')
  if (insumo === 'sim') q = q.eq('feedstock', true)
  else if (insumo === 'nao') q = q.eq('feedstock', false)
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
    preco_padrao: number | null
    feedstock: boolean | null
    default_product: boolean | null
    ativo: boolean | null
  }
  const rows = (data ?? []) as Row[]

  const header = ['Nome', 'Grupo', 'Preço', 'Insumo', 'Padrão', 'Status']
  const lines = [header.join(';')]
  for (const p of rows) {
    lines.push([
      p.nome,
      p.grupo,
      p.preco_padrao ?? '',
      p.feedstock ? 'Sim' : 'Não',
      p.default_product ? 'Sim' : 'Não',
      p.ativo === false ? 'Inativo' : 'Ativo',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="produtos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
