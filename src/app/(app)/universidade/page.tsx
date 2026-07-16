import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { bunnyStreamEmbedUrl } from '@/lib/bunny'
import { UniversidadeManager, type Trilha, type ProgressoUsuario, type AlunoRow } from '@/components/universidade/UniversidadeManager'
import type { Questao } from '@/lib/marketing'

export const dynamic = 'force-dynamic'

type EtapaDb = { id: string; trilha_id: string; ordem: number; nome: string; yt: string | null; bunny_guid: string | null; min: number; prova: Questao[]; is_final: boolean }
type TrilhaDb = { id: string; slug: string; nome: string; role: string; cor: string; prazo: string; ordem: number }
type ProgDb = { trilha_id: string; perfil_id: string; etapa_key: string; concluido: boolean; nota: number | null }

const ABAS_VALIDAS = ['trilhas', 'alunos', 'dash', 'gerenciar'] as const
type AbaUni = (typeof ABAS_VALIDAS)[number]

export default async function UniversidadePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await searchParams
  const abaInicial: AbaUni = (ABAS_VALIDAS as readonly string[]).includes(sp.aba || '') ? (sp.aba as AbaUni) : 'trilhas'
  const ctx = await getSessionContext()
  const sb = await createClient()
  const isAdmin = ehAdmin(ctx?.papel)
  // Pode gerenciar: admin_geral OU cargo "Admin Universidade" (recurso treinamento.curso).
  const podeGerir = isAdmin || !!ctx?.recursos.includes('treinamento.curso')

  let migrationPendente = false

  // Trilhas + etapas (uni_trilhas / uni_etapas).
  let trilhas: Trilha[] = []
  {
    const { data, error } = await sb.from('uni_trilhas').select('id, slug, nome, role, cor, prazo, ordem').order('ordem', { ascending: true })
    if (error && /uni_trilhas|relation|does not exist|schema cache/i.test(error.message)) migrationPendente = true
    else {
      const trs = (data ?? []) as TrilhaDb[]
      const ids = trs.map((t) => t.id)
      let etapas: EtapaDb[] = []
      if (ids.length) {
        const { data: ed } = await sb.from('uni_etapas').select('id, trilha_id, ordem, nome, yt, bunny_guid, min, prova, is_final').in('trilha_id', ids).order('ordem', { ascending: true })
        etapas = (ed ?? []) as EtapaDb[]
      }
      trilhas = trs.map((t) => {
        const f = etapas.find((e) => e.trilha_id === t.id && e.is_final)
        return {
          id: t.id, slug: t.slug, nome: t.nome, role: t.role, cor: t.cor, prazo: t.prazo,
          etapas: etapas.filter((e) => e.trilha_id === t.id && !e.is_final).map((e) => ({ id: e.id, ordem: e.ordem, nome: e.nome, yt: e.yt, bunny_guid: e.bunny_guid, bunnyEmbed: e.bunny_guid ? bunnyStreamEmbedUrl(e.bunny_guid) : null, min: e.min, prova: e.prova || [] })),
          final: f ? { id: f.id, nome: f.nome, prova: f.prova || [] } : null,
        }
      })
    }
  }

  // Progresso do usuário logado (uni_progresso)  perfil_id é o auth.uid.
  const meuProgresso: ProgressoUsuario = {}
  {
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data } = await sb.from('uni_progresso').select('trilha_id, etapa_key, concluido, nota').eq('perfil_id', user.id)
      for (const p of (data ?? []) as ProgDb[]) {
        meuProgresso[`${p.trilha_id}:${p.etapa_key}`] = { concluido: p.concluido, nota: p.nota }
      }
    }
  }

  // Alunos & Notas + Dashboards: agrega progresso de todos os colaboradores (uni_progresso x perfis_usuario).
  const alunos: AlunoRow[] = []
  if (trilhas.length) {
    const { data: progAll } = await sb.from('uni_progresso').select('trilha_id, perfil_id, etapa_key, concluido, nota')
    const progs = (progAll ?? []) as ProgDb[]
    const perfilIds = [...new Set(progs.map((p) => p.perfil_id))]
    const nomes: Record<string, { nome: string; cargo: string }> = {}
    if (perfilIds.length) {
      const { data: pu } = await sb.from('perfis_usuario').select('id, nome_completo, papel').in('id', perfilIds)
      for (const r of (pu ?? []) as { id: string; nome_completo: string | null; papel: string | null }[]) {
        nomes[r.id] = { nome: r.nome_completo || '(sem nome)', cargo: r.papel || '' }
      }
    }
    // Para cada (perfil, trilha) com algum progresso, calcula % concluído e nota média.
    const totalEtapasPorTrilha: Record<string, number> = {}
    for (const t of trilhas) totalEtapasPorTrilha[t.id] = t.etapas.length
    const grupo = new Map<string, ProgDb[]>()
    for (const p of progs) { const k = `${p.perfil_id}|${p.trilha_id}`; if (!grupo.has(k)) grupo.set(k, []); grupo.get(k)!.push(p) }
    for (const [k, rows] of grupo) {
      const [perfilId, trilhaId] = k.split('|')
      const tr = trilhas.find((t) => t.id === trilhaId)
      if (!tr) continue
      const totEt = totalEtapasPorTrilha[trilhaId] || 1
      const etapasConcl = rows.filter((r) => r.etapa_key !== 'final' && r.concluido).length
      const finalConcl = rows.some((r) => r.etapa_key === 'final' && r.concluido)
      const prog = Math.round((etapasConcl / totEt) * 100)
      const notas = rows.filter((r) => r.nota != null).map((r) => Number(r.nota))
      const notaMedia = notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : 0
      const status = finalConcl && etapasConcl >= totEt ? 'Concluído' : 'Em curso'
      alunos.push({
        perfilId, nome: nomes[perfilId]?.nome ?? '(sem nome)', cargo: nomes[perfilId]?.cargo ?? '',
        trilhaId, trilhaNome: tr.nome, prog, nota: notaMedia, prazo: 'No prazo', status,
      })
    }
  }

  return (
    <div className="view active">
      <UniversidadeManager
        podeGerir={podeGerir}
        migrationPendente={migrationPendente}
        trilhas={trilhas}
        meuProgresso={meuProgresso}
        alunos={alunos}
        abaInicial={abaInicial}
      />
    </div>
  )
}
