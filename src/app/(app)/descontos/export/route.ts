import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function rotuloValor(tipo: string | null, valor: number | null): string {
  const v = valor ?? 0
  if (tipo === 'percentual') return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Exporta a lista de descontos/parcerias (tabela `descontos`) em CSV com BOM. */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()
  let q = sb
    .from('descontos')
    .select('nome, tipo, valor, ativo')
    .order('criado_em', { ascending: false })
    .range(0, 9999) // teto de segurança
  const busca = (sp.get('q') || '').trim()
  if (busca) q = q.ilike('nome', `%${busca}%`)
  const ativo = sp.get('ativo')
  if (ativo === 'sim') q = q.eq('ativo', true)
  else if (ativo === 'nao') q = q.eq('ativo', false)
  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = { nome: string | null; tipo: string | null; valor: number | null; ativo: boolean | null }
  const rows = (data ?? []) as Row[]

  const header = ['Nome / Parceria', 'Tipo', 'Valor', 'Ativo']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      r.nome,
      r.tipo === 'percentual' ? 'Percentual' : r.tipo === 'valor' ? 'Valor fixo' : (r.tipo || ''),
      rotuloValor(r.tipo, r.valor),
      r.ativo === false ? 'Não' : 'Sim',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="descontos_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
