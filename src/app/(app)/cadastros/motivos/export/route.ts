import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Exporta os motivos de cancelamento (tabela `motivos_cancelamento`) em CSV com BOM. */
export async function GET(_req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sb = await createClient()
  const { data, error } = await sb
    .from('motivos_cancelamento')
    .select('nome, sistema, ativo')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
    .range(0, 9999) // teto de segurança

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = { nome: string | null; sistema: boolean | null; ativo: boolean | null }
  const rows = (data ?? []) as Row[]

  const header = ['Motivo', 'Tipo', 'Ativo']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      r.nome,
      r.sistema ? 'Padrão do sistema' : 'Personalizado',
      r.ativo === false ? 'Não' : 'Sim',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="motivos_cancelamento_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
