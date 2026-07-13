import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

const GENERO_LABEL: Record<string, string> = { female: 'Feminino', male: 'Masculino', other: 'Outro' }

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Exporta a lista de clientes (com os mesmos filtros da listagem) em CSV com BOM.
 * Paridade com o botão "Exportar" do legado (view 1334).
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()
  const isAdmin = ctx.isAdmin
  const activeUnit = ctx.activeUnitId ?? null
  const unidade = sp.get('unidade')
  const unidadeFiltro = (isAdmin && unidade) ? unidade : activeUnit

  let q = sb
    .from('clientes')
    .select('nome, telefone, email, cpf, genero, ativo, verificado, cidade, estado, canal_origem')
    .order('nome', { ascending: true })
    .range(0, 19999) // teto de segurança

  if (unidadeFiltro) q = q.eq('unidade_origem_id', unidadeFiltro)
  const ativo = sp.get('ativo') ?? 'sim'
  if (ativo === 'sim') q = q.eq('ativo', true)
  else if (ativo === 'nao') q = q.eq('ativo', false)
  const verificado = sp.get('verificado')
  if (verificado === 'sim') q = q.eq('verificado', true)
  else if (verificado === 'nao') q = q.eq('verificado', false)
  const genero = sp.get('genero')
  if (genero && ['female', 'male', 'other'].includes(genero)) q = q.eq('genero', genero)
  const doc = sp.get('doc')
  if (doc === 'cpf') q = q.not('cpf', 'is', null)
  else if (doc === 'rg') q = q.not('rg', 'is', null)
  else if (doc === 'sem') q = q.is('cpf', null).is('rg', null)
  const bloqueado = sp.get('bloqueado')
  if (bloqueado === 'sim') q = q.eq('bloqueado', true)
  else if (bloqueado === 'nao') q = q.eq('bloqueado', false)
  const app = sp.get('app')
  if (app === 'sim') q = q.eq('tem_app', true)
  else if (app === 'nao') q = q.eq('tem_app', false)
  const cidade = sp.get('cidade')
  if (cidade) q = q.ilike('cidade', `%${cidade}%`)
  const estado = sp.get('estado')
  if (estado) q = q.ilike('estado', `%${estado}%`)
  const livre = sp.get('q')
  if (livre) {
    const qs = livre.replace(/[,()*]/g, ' ').trim()
    if (qs) {
      const dig = qs.replace(/\D/g, '')
      const ors = [`nome.ilike.%${qs}%`, `email.ilike.%${qs}%`]
      if (dig) { ors.push(`cpf.ilike.%${dig}%`, `telefone.ilike.%${dig}%`) }
      q = q.or(ors.join(','))
    }
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = { nome: string | null; telefone: string | null; email: string | null; cpf: string | null; genero: string | null; ativo: boolean | null; verificado: boolean | null; cidade: string | null; estado: string | null; canal_origem: string | null }
  const rows = (data ?? []) as Row[]

  const header = ['Nome', 'Telefone', 'E-mail', 'Documento', 'Gênero', 'Ativo', 'Verificado', 'Cidade', 'Estado', 'Origem']
  const lines = [header.join(';')]
  for (const c of rows) {
    lines.push([
      c.nome, c.telefone, c.email, c.cpf,
      c.genero ? (GENERO_LABEL[c.genero] || c.genero) : '',
      c.ativo === false ? 'Não' : 'Sim',
      c.verificado ? 'Sim' : 'Não',
      c.cidade, c.estado, c.canal_origem,
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clientes_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
