import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Exporta as origens de cliente (tabela `origens_cliente`) em CSV com BOM, com os mesmos filtros da listagem. */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const ativo = sp.get('ativo') ?? 'Todos'
  const nome = (sp.get('nome') ?? '').trim()

  const sb = await createClient()
  let query = sb
    .from('origens_cliente')
    .select('nome, ativo, auto, campo')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
    .range(0, 9999) // teto de segurança

  if (ativo === 'Sim') query = query.eq('ativo', true)
  else if (ativo === 'Não') query = query.eq('ativo', false)
  if (nome) query = query.ilike('nome', `%${nome}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = { nome: string | null; ativo: boolean | null; auto: boolean | null; campo: boolean | null }
  const rows = (data ?? []) as Row[]

  const header = ['Nome', 'Ativo', 'Preenchido automaticamente', 'Abre campo para especificar']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      r.nome,
      r.ativo === false ? 'Não' : 'Sim',
      r.auto ? 'Sim' : 'Não',
      r.campo ? 'Sim' : 'Não',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="origens_cliente_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
