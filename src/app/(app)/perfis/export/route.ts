import { NextResponse, type NextRequest } from 'next/server'
import { getSessionContext } from '@/lib/session'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Escapa um campo para CSV (separador ;). */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Exporta os perfis de acesso (cargos) em CSV com nº de permissões e de usuários.
 * Paridade com o "Exportar" da tela de Perfis de acesso do BEMP.
 */
export async function GET(req: NextRequest) {
  const ctx = await getSessionContext()
  if (!ctx) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = adminClient()
  const sel = 'id, nome, slug, descricao, is_sistema, ativo, atualizado_em'
  const { data: cargosRaw, error } = await admin
    .from('cargos')
    .select(sel)
    .order('is_sistema', { ascending: true })
    .order('nome', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Contagens via VIEWS agregadas (cargo_permissoes tem 9k+ linhas; contar em JS cortaria em 1000).
  const [{ data: cpRaw }, { data: ucRaw }] = await Promise.all([
    admin.from('cargo_perm_count').select('cargo_id, n'),
    admin.from('cargo_user_count').select('cargo_id, n'),
  ])
  const perm: Record<string, number> = {}
  for (const r of (cpRaw ?? []) as { cargo_id: string; n: number }[]) perm[r.cargo_id] = r.n
  const users: Record<string, number> = {}
  for (const r of (ucRaw ?? []) as { cargo_id: string; n: number }[]) users[r.cargo_id] = r.n

  type Cargo = { id: string; nome: string | null; descricao: string | null; is_sistema: boolean | null; ativo: boolean | null; atualizado_em: string | null }
  const cargos = (cargosRaw ?? []) as Cargo[]

  const header = ['Perfil', 'Descrição', 'Tipo', 'Permissões', 'Usuários', 'Ativo', 'Última atualização']
  const lines = [header.join(';')]
  for (const c of cargos) {
    lines.push([
      c.nome,
      c.descricao,
      c.is_sistema ? 'Interno do sistema' : 'Operação',
      String(perm[c.id] ?? 0),
      String(users[c.id] ?? 0),
      c.ativo === false ? 'Não' : 'Sim',
      c.atualizado_em ? new Date(c.atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
    ].map(csvCell).join(';'))
  }
  const csv = '﻿' + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="perfis_acesso_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
