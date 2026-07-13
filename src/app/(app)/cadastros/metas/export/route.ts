import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { one } from '@/lib/sb'
import { INDICADOR_LBL, CICLO_LBL, fmtValor } from '@/components/metas/MetasLista'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Exporta o catálogo de metas (tabela `metas`) em CSV com BOM, respeitando os mesmos
 * filtros da listagem. Paridade com o botão "Exportar" do BEMP.
 * Colunas: Nome, Indicador, Ciclo, Valor, Unidade, Ativo.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()

  let q = sb
    .from('metas')
    .select('nome, indicador, ciclo, valor, ativo, unidade_id, unidades(nome)')
    .order('nome', { ascending: true })
    .range(0, 19999)

  // Escopo multitenant: unidade ativa OU metas globais (unidade_id null).
  if (ctx.activeUnitId) q = q.or(`unidade_id.eq.${ctx.activeUnitId},unidade_id.is.null`)

  // Filtros da listagem.
  const ativo = sp.get('ativo')
  if (ativo === 'sim') q = q.eq('ativo', true)
  else if (ativo === 'nao') q = q.eq('ativo', false)
  const indicador = sp.get('indicador')
  if (indicador) q = q.eq('indicador', indicador)
  const ciclo = sp.get('ciclo')
  if (ciclo) q = q.eq('ciclo', ciclo)
  const livre = sp.get('q')
  if (livre) { const qs = livre.replace(/[,()*]/g, ' ').trim(); if (qs) q = q.ilike('nome', `%${qs}%`) }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = { nome: string | null; indicador: string; ciclo: string; valor: number | null; ativo: boolean | null; unidade_id: string | null; unidades: { nome: string | null } | { nome: string | null }[] | null }
  const rows = (data ?? []) as Row[]

  const header = ['Nome', 'Indicador', 'Ciclo', 'Valor', 'Unidade', 'Ativo']
  const lines = [header.join(';')]
  for (const m of rows) {
    const uni = one(m.unidades)
    lines.push([
      m.nome,
      INDICADOR_LBL[m.indicador] ?? m.indicador,
      CICLO_LBL[m.ciclo] ?? m.ciclo,
      fmtValor(m.indicador, m.valor),
      uni?.nome ?? 'Todas',
      m.ativo === false ? 'Não' : 'Sim',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="metas_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
