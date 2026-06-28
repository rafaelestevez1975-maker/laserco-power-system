import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { GruposServicosManager, type GrupoRow } from '@/components/grupo-servicos/GruposServicosManager'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['gestor']

export default async function GrupoServicosPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // Cadastro de grupos (grupo_servicos) + contagem de serviços por grupo (servicos.grupo).
  // range() explícito no select de serviços: sem ele o PostgREST corta em 1000 linhas
  // silenciosamente e a contagem de serviços por grupo ficaria truncada se o catálogo crescer.
  const [gruposRes, servRes] = await Promise.all([
    sb.from('grupo_servicos').select('id, nome, ativo').order('ordem', { ascending: true }).order('nome', { ascending: true }),
    sb.from('servicos').select('grupo').range(0, 49999),
  ])

  const semTabela = !!gruposRes.error
  const contagem = new Map<string, number>()
  for (const r of (servRes.data ?? []) as { grupo: string | null }[]) {
    const g = (r.grupo || '').trim()
    if (!g) continue
    contagem.set(g, (contagem.get(g) ?? 0) + 1)
  }

  const grupos: GrupoRow[] = ((gruposRes.data ?? []) as { id: string; nome: string | null; ativo: boolean | null }[])
    .map((g) => ({ id: g.id, nome: g.nome, ativo: g.ativo, servicos: contagem.get((g.nome || '').trim()) ?? 0 }))

  return (
    <GruposServicosManager grupos={grupos} podeEscrever={podeEscrever} vazio={semTabela || grupos.length === 0} />
  )
}
