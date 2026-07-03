import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'

export const dynamic = 'force-dynamic'

// TEMPORÁRIO (diagnóstico 03/07): o SSR de produção renderiza as listas do financeiro
// vazias enquanto a MESMA query via REST retorna linhas. v2 replica a sequência EXATA
// do financeiro/page.tsx (getSessionContext → Promise.all) e expõe cada erro que o
// destructure da página engole. Só devolve dados da PRÓPRIA sessão (RLS) — remover após o fix.
export async function GET() {
  const ck = await cookies()
  const sbCookies = ck.getAll().filter((c) => c.name.startsWith('sb-')).map((c) => `${c.name}(${c.value.length})`)

  // 1) igual à página: contexto primeiro (memoizado), depois client
  const ctx = await getSessionContext()
  const sb = await createClient()

  // 2) fin_recebiveis (feature-detect da página  se falhar, a página pula o resto)
  let qRec = sb
    .from('fin_recebiveis')
    .select('id, unidade_nome, categoria, competencia, bruto, valor, vencimento, status, dias_atraso, boleto, enviado, data_pagamento, jur_id', { count: 'exact' })
    .order('vencimento', { ascending: true, nullsFirst: false })
    .limit(2000)
  if (ctx?.activeUnitId) qRec = qRec.eq('unidade_id', ctx.activeUnitId)
  const rec = await qRec

  // 3) Promise.all igual à página
  let qPag = sb.from('fin_contas_pagar').select('id, categoria, descricao, escopo, valor, vencimento, status, prioridade', { count: 'exact' }).order('vencimento', { ascending: true, nullsFirst: false }).limit(2000)
  if (ctx?.activeUnitName && ctx.activeUnitId) qPag = qPag.eq('escopo', ctx.activeUnitName)
  const [pag, cfg] = await Promise.all([
    qPag,
    sb.from('fin_config').select('royalty_pct, adquirentes, categorias').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
  ])

  return NextResponse.json({
    runtime: { env: process.env.VERCEL_ENV ?? 'local', sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) },
    cookies: sbCookies,
    ctx: ctx ? { papel: ctx.papel, activeUnitId: ctx.activeUnitId, activeUnitName: ctx.activeUnitName, unidades: ctx.unidades.length } : null,
    rec: { rows: rec.data?.length ?? null, count: rec.count, error: rec.error?.message ?? null },
    pag: { rows: pag.data?.length ?? null, count: pag.count, error: pag.error?.message ?? null },
    cfg: { temLinha: Boolean(cfg.data), error: cfg.error?.message ?? null },
  })
}
