import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

const TIPO_LOJA_LABEL: Record<string, string> = { franquia: 'Franquia', propria: 'Loja própria' }

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

type Row = {
  nome: string | null
  cnpj: string | null
  cidade: string | null
  estado: string | null
  ativa: boolean | null
  tipo_loja?: string | null
}

/**
 * Exporta a lista de unidades (com os mesmos filtros da listagem) em CSV com BOM.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()
  const busca = (sp.get('q') || '').trim()
  const uf = (sp.get('uf') || '').trim().toUpperCase()
  const status = sp.get('status') === 'inativa' ? 'inativa' : sp.get('status') === 'ativa' ? 'ativa' : ''

  const COLS_FULL = 'nome, cnpj, cidade, estado, ativa, tipo_loja'
  const COLS_BASE = 'nome, cnpj, cidade, estado, ativa'

  const montarConsulta = (cols: string) => {
    let q = sb
      .from('unidades')
      .select(cols)
      .order('nome', { ascending: true })
      .range(0, 19999) // teto de segurança
    if (busca) q = q.or(`nome.ilike.%${busca}%,cidade.ilike.%${busca}%,cnpj.ilike.%${busca}%`)
    if (uf) q = q.eq('estado', uf)
    if (status === 'ativa') q = q.eq('ativa', true)
    else if (status === 'inativa') q = q.eq('ativa', false)
    return q
  }

  let { data, error } = await montarConsulta(COLS_FULL)
  if (error) { const r2 = await montarConsulta(COLS_BASE); data = r2.data; error = r2.error }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as Row[]

  const header = ['Nome', 'CNPJ', 'Cidade', 'Estado', 'Ativa', 'Tipo de loja']
  const lines = [header.join(';')]
  for (const u of rows) {
    lines.push([
      u.nome, u.cnpj, u.cidade, u.estado,
      u.ativa === false ? 'Não' : 'Sim',
      u.tipo_loja ? (TIPO_LOJA_LABEL[u.tipo_loja] ?? u.tipo_loja) : '',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="unidades_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
