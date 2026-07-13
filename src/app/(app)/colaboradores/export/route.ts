import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { perfilLabel, regimeLabel, STATUS_LABELS } from '@/components/colaboradores/labels'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

type Row = {
  nome: string | null
  cpf: string | null
  telefone: string | null
  email: string | null
  cargo: string | null
  area: string | null
  departamento: string | null
  regime: string | null
  status: string | null
  exibe_agenda?: boolean | null
  disponivel_online?: boolean | null
  ordem_app?: number | null
}

/**
 * Exporta a lista de colaboradores (com os mesmos filtros da listagem) em CSV com BOM.
 * Paridade com o botão "Exportar" do legado.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const sb = await createClient()
  const activeUnit = ctx.activeUnitId ?? null
  const status = sp.get('status') ?? 'ativo'
  const regime = sp.get('regime')
  const cargo = sp.get('cargo')
  const area = sp.get('area')
  const livre = sp.get('q')

  // Colunas disponivel_online/ordem_app/exibe_agenda podem não existir se a migration
  // não foi aplicada → o select falha e refazemos sem elas (degrade).
  const COLS_FULL = 'nome, cpf, telefone, email, cargo, area, departamento, regime, status, exibe_agenda, disponivel_online, ordem_app'
  const COLS_BASE = 'nome, cpf, telefone, email, cargo, area, departamento, regime, status'

  const montarConsulta = (cols: string) => {
    let qy = sb
      .from('colaboradores')
      .select(cols)
      .order('nome', { ascending: true })
      .range(0, 19999) // teto de segurança
    if (activeUnit) qy = qy.eq('unidade_id', activeUnit)
    if (status === 'ativo') qy = qy.eq('status', 'ativo')
    else if (status === 'inativo') qy = qy.eq('status', 'inativo')
    if (regime === 'clt' || regime === 'pj') qy = qy.eq('regime', regime)
    if (cargo) qy = qy.eq('cargo', cargo)
    if (area) qy = qy.ilike('area', `%${area}%`)
    if (livre) {
      const qs = livre.replace(/[,()*]/g, ' ').trim()
      if (qs) {
        const d = qs.replace(/\D/g, '')
        const ors = [`nome.ilike.%${qs}%`, `email.ilike.%${qs}%`, `cargo.ilike.%${qs}%`]
        if (d) { ors.push(`cpf.ilike.%${d}%`, `telefone.ilike.%${d}%`) }
        qy = qy.or(ors.join(','))
      }
    }
    return qy
  }

  let { data, error } = await montarConsulta(COLS_FULL)
  if (error) { const r2 = await montarConsulta(COLS_BASE); data = r2.data; error = r2.error }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as Row[]

  const header = ['Nome', 'E-mail', 'CPF', 'Telefone', 'Perfil de acesso', 'Área', 'Departamento', 'Regime', 'Exibe na agenda', 'Disponível online', 'Ordem no App', 'Status']
  const lines = [header.join(';')]
  for (const c of rows) {
    lines.push([
      c.nome, c.email, c.cpf, c.telefone,
      perfilLabel(c.cargo), c.area, c.departamento, regimeLabel(c.regime),
      c.exibe_agenda == null ? '' : (c.exibe_agenda ? 'Sim' : 'Não'),
      c.disponivel_online == null ? '' : (c.disponivel_online ? 'Sim' : 'Não'),
      c.ordem_app ?? '',
      c.status ? (STATUS_LABELS[c.status] ?? c.status) : '',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="colaboradores_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
