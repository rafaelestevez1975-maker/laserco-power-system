import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Exporta os modelos de contrato (tabela `contratos_modelo`) em CSV com BOM, com os mesmos filtros da listagem. */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const ativoFil = sp.get('ativo') ?? 'Sim' // legado: default Sim
  const nomeFil = (sp.get('nome') ?? '').trim()

  const sb = await createClient()
  let query = sb
    .from('contratos_modelo')
    .select('nome, quando_emitido, enviar_email, todas_unidades, arquivo_nome, ativo')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
    .range(0, 9999) // teto de segurança

  if (ativoFil === 'Sim') query = query.eq('ativo', true)
  else if (ativoFil === 'Não') query = query.eq('ativo', false)
  if (nomeFil) query = query.ilike('nome', `%${nomeFil}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    nome: string | null
    quando_emitido: string | null
    enviar_email: boolean | null
    todas_unidades: boolean | null
    arquivo_nome: string | null
    ativo: boolean | null
  }
  const rows = (data ?? []) as Row[]

  const header = ['Nome do modelo', 'Quando o contrato é emitido', 'Enviar por e-mail para assinatura', 'Todas as unidades', 'Arquivo', 'Ativo']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      r.nome || '(sem nome)',
      r.quando_emitido || '',
      r.enviar_email === false ? 'Não' : 'Sim',
      r.todas_unidades === false ? 'Não' : 'Sim',
      r.arquivo_nome || '',
      r.ativo === false ? 'Não' : 'Sim',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="modelos_contrato_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
