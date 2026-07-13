import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { normalizarSecoes, resumoDocumento, type DocumentoRow } from '@/lib/anamnese'
import { dataBR } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Exporta os documentos de anamnese (com os mesmos filtros da listagem) em CSV com BOM.
 * Paridade com o botão "Exportar" do legado (BEMP).
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()

  let query = sb
    .from('documentos')
    .select('id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo, unidades_ids, secoes, atualizado_em')
    .order('atualizado_em', { ascending: false })

  const ativo = sp.get('ativo') ?? ''
  if (ativo === 'sim') query = query.eq('status', 'Ativo')
  else if (ativo === 'nao') query = query.eq('status', 'Inativo')
  const q = (sp.get('q') ?? '').trim()
  if (q) query = query.ilike('nome', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as DocumentoRow[]

  const header = ['Nome', 'Tipo', 'Obrigatório', 'Status', 'Perguntas', 'Acumulativo', 'Atualizado']
  const lines = [header.join(';')]
  for (const d of rows) {
    const { perguntas } = resumoDocumento(normalizarSecoes(d.secoes))
    lines.push([
      d.nome,
      d.tipo,
      d.obrigatorio ? 'Sim' : 'Não',
      d.status || '',
      perguntas,
      d.acumulativo ? 'Sim' : 'Não',
      dataBR(d.atualizado_em) || '',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="anamnese_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
