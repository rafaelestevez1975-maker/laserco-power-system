import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** "199,90" (com centavos, pt-BR). */
function valor2(v: number | null | undefined): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Exporta os planos de assinatura (tabela `planos_assinatura`) em CSV com BOM, com os mesmos filtros da listagem. */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const ativo = sp.get('ativo') ?? 'sim'
  const q = (sp.get('q') ?? '').trim()

  const sb = await createClient()
  let query = sb
    .from('planos_assinatura')
    .select('id, nome, descricao, valor_mensal, valor_adesao, duracao_meses, beneficios, ativo')
    .order('valor_mensal', { ascending: true })
    .range(0, 9999) // teto de segurança
  if (ativo === 'sim') query = query.eq('ativo', true)
  else if (ativo === 'nao') query = query.eq('ativo', false)
  if (q) query = query.ilike('nome', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    id: string
    nome: string | null
    descricao: string | null
    valor_mensal: number | null
    valor_adesao: number | null
    duracao_meses: number | null
    beneficios: string[] | null
    ativo: boolean | null
  }
  const rows = (data ?? []) as Row[]

  // Serviços incluídos (plano_assinatura_servicos) com nome — mesma coluna "Incluído" da tela.
  const ids = rows.map((r) => r.id)
  const servByPlano: Record<string, string[]> = {}
  if (ids.length) {
    const { data: itRaw } = await sb
      .from('plano_assinatura_servicos')
      .select('plano_id, quantidade_mensal, servicos(nome)')
      .in('plano_id', ids)
    for (const it of (itRaw ?? []) as Array<{
      plano_id: string
      quantidade_mensal: number | null
      servicos: { nome?: string } | { nome?: string }[] | null
    }>) {
      const s = Array.isArray(it.servicos) ? it.servicos[0] : it.servicos
      ;(servByPlano[it.plano_id] ??= []).push(`${s?.nome ?? '(serviço removido)'} (${it.quantidade_mensal ?? 1}x)`)
    }
  }

  const header = ['Plano', 'Descrição', 'Adesão', 'Mensalidade', 'Duração (meses)', 'Serviços incluídos', 'Benefícios', 'Ativo']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      r.nome,
      r.descricao || '',
      r.valor_adesao ? valor2(r.valor_adesao) : 'Sem adesão',
      valor2(r.valor_mensal),
      r.duracao_meses != null ? String(r.duracao_meses) : '',
      (servByPlano[r.id] ?? []).join(' | '),
      (r.beneficios ?? []).filter(Boolean).join(' | '),
      r.ativo === false ? 'Não' : 'Sim',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="planos_assinatura_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
