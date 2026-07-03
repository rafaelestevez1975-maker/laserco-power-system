import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// TEMPORÁRIO (diagnóstico 03/07): lançamentos existem no banco e a MESMA query via REST
// retorna linhas, mas o SSR de produção renderiza contasPagar=[]. Esta rota roda a query
// exata do page.tsx no runtime da Vercel e expõe o erro real (que o destructure engole).
// Só devolve dados visíveis à PRÓPRIA sessão do chamador (RLS) — remover após o fix.
export async function GET() {
  const ck = await cookies()
  const sbCookies = ck.getAll().filter((c) => c.name.startsWith('sb-')).map((c) => `${c.name}(${c.value.length})`)
  const sb = await createClient()
  const { data: u, error: eUser } = await sb.auth.getUser()
  const { data: sess } = await sb.auth.getSession()
  const { data, error, count } = await sb
    .from('fin_contas_pagar')
    .select('id, categoria, descricao, escopo, valor, vencimento, status, prioridade', { count: 'exact' })
    .order('vencimento', { ascending: true, nullsFirst: false })
    .limit(2000)
  return NextResponse.json({
    runtime: { node: process.version, env: process.env.VERCEL_ENV ?? 'local', sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) },
    cookies: sbCookies,
    user: u?.user?.email ?? null,
    userError: eUser?.message ?? null,
    temSessao: Boolean(sess?.session),
    tokenExp: sess?.session?.expires_at ?? null,
    agora: Math.floor(Date.now() / 1000),
    query: { rows: data?.length ?? null, count, error: error?.message ?? null, code: (error as { code?: string } | null)?.code ?? null },
  })
}
