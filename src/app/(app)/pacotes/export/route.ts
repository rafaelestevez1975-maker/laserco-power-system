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
 * Exporta o catálogo de pacotes (com os mesmos filtros da listagem) em CSV com BOM.
 * Paridade com o botão "Exportar" de Clientes.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()

  let q = sb
    .from('pacotes')
    .select('id, nome, preco, validade_dias, cobertura_creditos, desc_max, pagar_comissao, ativo')
    .order('nome', { ascending: true })
    .range(0, 19999) // teto de segurança

  const ativo = sp.get('ativo') ?? 'sim'
  if (ativo === 'sim') q = q.eq('ativo', true)
  else if (ativo === 'nao') q = q.eq('ativo', false)
  const livre = (sp.get('q') ?? '').trim()
  if (livre) q = q.ilike('nome', `%${livre}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    id: string
    nome: string | null
    preco: number | null
    validade_dias: number | null
    cobertura_creditos: string | null
    desc_max: number | null
    pagar_comissao: string | null
    ativo: boolean | null
  }
  const rows = (data ?? []) as Row[]

  // ── Composição (pacote_itens) dos pacotes exportados, com nome do serviço ──
  const ids = rows.map((p) => p.id)
  const composicao: Record<string, string> = {}
  if (ids.length) {
    const { data: itRaw } = await sb
      .from('pacote_itens')
      .select('pacote_id, quantidade, servicos(nome)')
      .in('pacote_id', ids)
    const acc: Record<string, string[]> = {}
    for (const r of (itRaw ?? []) as Array<{
      pacote_id: string
      quantidade: number | null
      servicos: { nome?: string } | { nome?: string }[] | null
    }>) {
      const s = Array.isArray(r.servicos) ? r.servicos[0] : r.servicos
      const nome = s?.nome ?? '(serviço removido)'
      ;(acc[r.pacote_id] ??= []).push(`${nome} (${r.quantidade ?? 1}x)`)
    }
    for (const [k, v] of Object.entries(acc)) composicao[k] = v.join(', ')
  }

  const header = ['Nome', 'Composição', 'Cobertura', 'Validade (dias)', 'Preço', 'Desc. Máx (%)', 'Pagar comissão', 'Status']
  const lines = [header.join(';')]
  for (const p of rows) {
    lines.push([
      p.nome,
      composicao[p.id] ?? '',
      p.cobertura_creditos || 'Qualquer unidade',
      p.validade_dias ?? '',
      p.preco ?? '',
      p.desc_max ?? '',
      p.pagar_comissao || 'Execução',
      p.ativo === false ? 'Inativo' : 'Ativo',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pacotes_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
