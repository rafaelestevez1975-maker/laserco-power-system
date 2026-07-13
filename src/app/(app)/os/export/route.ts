import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { moedaBR, dataHoraBR } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', fechada: 'Fechada', cancelada: 'Cancelada' }
const ORIGEM_LABEL: Record<string, string> = {
  avulsa: 'Avulsa', agendamento: 'Agendamento', pacote: 'Pacote', assinatura: 'Assinatura', interna: 'Interna', multa_assinatura: 'Multa',
}
const STATUS_FILTRO = ['aberta', 'fechada', 'cancelada']

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Builder mínimo p/ os filtros — evita a explosão de tipos do PostgREST (TS2589).
type FiltroQuery = {
  eq(c: string, v: unknown): FiltroQuery
  gte(c: string, v: unknown): FiltroQuery
  lte(c: string, v: unknown): FiltroQuery
}

type Raw = {
  numero: number | null
  status: string
  origem: string | null
  total: number | null
  valor_pago: number | null
  valor_pendente: number | null
  criado_em: string | null
  fechada_em: string | null
  cancelada_em: string | null
  cliente_id: string | null
}

/**
 * Exporta a lista de OS (com os mesmos filtros da listagem) em CSV com BOM.
 * Replica `aplicarFiltros` da page (unidade, status, cliente, colaborador, origem, período).
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()
  const unidadeId = ctx.activeUnitId ?? null

  const statusF = sp.get('status')
  const cliente = sp.get('cliente')
  const colaborador = sp.get('colaborador')
  const origem = sp.get('origem')
  const di = sp.get('di')
  const df = sp.get('df')

  // Sem embed de cliente (a RLS por linha dentro do join estoura o statement timeout);
  // resolvemos os nomes num 2º lookup por PK, em lotes.
  let q: FiltroQuery = sb
    .from('os')
    .select('numero, status, origem, total, valor_pago, valor_pendente, criado_em, fechada_em, cancelada_em, cliente_id')
    .order('criado_em', { ascending: false, nullsFirst: false })
    .range(0, 19999) as unknown as FiltroQuery
  if (unidadeId) q = q.eq('unidade_id', unidadeId)
  if (statusF && STATUS_FILTRO.includes(statusF)) q = q.eq('status', statusF)
  if (cliente) q = q.eq('cliente_id', cliente)
  if (colaborador) q = q.eq('criado_por', colaborador)
  if (origem) q = q.eq('origem', origem)
  if (di) q = q.gte('criado_em', `${di}T00:00:00`)
  if (df) q = q.lte('criado_em', `${df}T23:59:59`)

  const { data: rowsRaw, error } = await (q as unknown as PromiseLike<{ data: Raw[] | null; error: { message: string } | null }>)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (rowsRaw ?? []) as Raw[]

  // Nomes dos clientes por PK, em lotes de 500 (a lista pode ter até 20k linhas).
  const clienteIds = [...new Set(rows.map((r) => r.cliente_id).filter(Boolean))] as string[]
  const nomesCli = new Map<string, string | null>()
  for (let i = 0; i < clienteIds.length; i += 500) {
    const lote = clienteIds.slice(i, i + 500)
    const { data: cliRaw } = await sb.from('clientes').select('id, nome').in('id', lote)
    for (const c of (cliRaw ?? []) as { id: string; nome: string | null }[]) nomesCli.set(c.id, c.nome)
  }

  const header = ['Número', 'Status', 'Origem', 'Cliente', 'Total', 'Valor pago', 'Valor pendente', 'Criado em', 'Fechada em', 'Cancelada em']
  const lines = [header.join(';')]
  for (const r of rows) {
    lines.push([
      r.numero ?? '',
      r.status ? (STATUS_LABEL[r.status] ?? r.status) : '',
      r.origem ? (ORIGEM_LABEL[r.origem] ?? r.origem) : '',
      (r.cliente_id ? nomesCli.get(r.cliente_id) : null) ?? '',
      moedaBR(r.total),
      moedaBR(r.valor_pago),
      moedaBR(r.valor_pendente),
      r.criado_em ? dataHoraBR(r.criado_em) : '',
      r.fechada_em ? dataHoraBR(r.fechada_em) : '',
      r.cancelada_em ? dataHoraBR(r.cancelada_em) : '',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="os_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
