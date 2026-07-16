import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { bunnyStreamEmbedUrl } from '@/lib/bunny'
import type { Questao } from '@/lib/marketing'
import type { Trilha, ProgressoUsuario, AlunoRow, TrilhaEdit, EtapaEdit } from '@/components/universidade/tipos'

/**
 * Leitura da Universidade (uni_trilhas / uni_etapas / uni_progresso), consumida pelos
 * server components de cada rota (/universidade, /alunos, /dashboards, /gerenciar[/id]).
 * Módulo puro de servidor (SEM 'use server': exporta helpers, não server actions).
 *
 * O embed do Bunny é resolvido AQUI (server) e passado como prop pro client — `bunny.ts`
 * usa AccessKey privada e nunca deve ser importado no cliente.
 */

type EtapaDb = { id: string; trilha_id: string; ordem: number; nome: string; yt: string | null; bunny_guid: string | null; min: number; prova: Questao[]; is_final: boolean }
type TrilhaDb = { id: string; slug: string; nome: string; role: string; cor: string; prazo: string; ordem: number }
type ProgDb = { trilha_id: string; perfil_id: string; etapa_key: string; concluido: boolean; nota: number | null }

/** Pode gerir a Universidade? admin_geral OU cargo com recurso `treinamento.*` (Admin Universidade). */
export async function podeGerirUniversidade(): Promise<boolean> {
  const ctx = await getSessionContext()
  return ehAdmin(ctx?.papel) || !!ctx?.recursos.some((r) => r.startsWith('treinamento'))
}

/** Trilhas + etapas (não-finais) + prova final, com o embed do Bunny já resolvido. */
export async function carregarTrilhas(): Promise<{ trilhas: Trilha[]; migrationPendente: boolean }> {
  const sb = await createClient()
  const { data, error } = await sb.from('uni_trilhas').select('id, slug, nome, role, cor, prazo, ordem').order('ordem', { ascending: true })
  if (error) {
    if (/uni_trilhas|relation|does not exist|schema cache/i.test(error.message)) return { trilhas: [], migrationPendente: true }
    return { trilhas: [], migrationPendente: false }
  }
  const trs = (data ?? []) as TrilhaDb[]
  const ids = trs.map((t) => t.id)
  let etapas: EtapaDb[] = []
  if (ids.length) {
    const { data: ed } = await sb.from('uni_etapas').select('id, trilha_id, ordem, nome, yt, bunny_guid, min, prova, is_final').in('trilha_id', ids).order('ordem', { ascending: true })
    etapas = (ed ?? []) as EtapaDb[]
  }
  const trilhas: Trilha[] = trs.map((t) => {
    const f = etapas.find((e) => e.trilha_id === t.id && e.is_final)
    return {
      id: t.id, slug: t.slug, nome: t.nome, role: t.role, cor: t.cor, prazo: t.prazo,
      etapas: etapas
        .filter((e) => e.trilha_id === t.id && !e.is_final)
        .map((e) => ({ id: e.id, ordem: e.ordem, nome: e.nome, bunny_guid: e.bunny_guid, bunnyEmbed: e.bunny_guid ? bunnyStreamEmbedUrl(e.bunny_guid) : null, min: e.min, prova: e.prova || [] })),
      final: f ? { id: f.id, nome: f.nome, bunny_guid: f.bunny_guid, bunnyEmbed: f.bunny_guid ? bunnyStreamEmbedUrl(f.bunny_guid) : null, min: f.min, prova: f.prova || [] } : null,
    }
  })
  return { trilhas, migrationPendente: false }
}

/** Progresso do usuário logado (uni_progresso). perfil_id = auth.uid. */
export async function carregarMeuProgresso(): Promise<ProgressoUsuario> {
  const sb = await createClient()
  const meuProgresso: ProgressoUsuario = {}
  const { data: { user } } = await sb.auth.getUser()
  if (user) {
    const { data } = await sb.from('uni_progresso').select('trilha_id, etapa_key, concluido, nota').eq('perfil_id', user.id)
    for (const p of (data ?? []) as ProgDb[]) meuProgresso[`${p.trilha_id}:${p.etapa_key}`] = { concluido: p.concluido, nota: p.nota }
  }
  return meuProgresso
}

/** Agrega o progresso de todos os colaboradores (Alunos & Notas + Dashboards). */
export async function carregarAlunos(trilhas: Trilha[]): Promise<AlunoRow[]> {
  const alunos: AlunoRow[] = []
  if (!trilhas.length) return alunos
  const sb = await createClient()
  const { data: progAll } = await sb.from('uni_progresso').select('trilha_id, perfil_id, etapa_key, concluido, nota')
  const progs = (progAll ?? []) as ProgDb[]
  const perfilIds = [...new Set(progs.map((p) => p.perfil_id))]
  const nomes: Record<string, { nome: string; cargo: string }> = {}
  if (perfilIds.length) {
    const { data: pu } = await sb.from('perfis_usuario').select('id, nome_completo, papel').in('id', perfilIds)
    for (const r of (pu ?? []) as { id: string; nome_completo: string | null; papel: string | null }[]) nomes[r.id] = { nome: r.nome_completo || '(sem nome)', cargo: r.papel || '' }
  }
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
    alunos.push({ perfilId, nome: nomes[perfilId]?.nome ?? '(sem nome)', cargo: nomes[perfilId]?.cargo ?? '', trilhaId, trilhaNome: tr.nome, prog, nota: notaMedia, prazo: 'No prazo', status })
  }
  return alunos
}

/** Uma trilha + TODAS as etapas (não-finais e a final) para o editor admin. */
export async function carregarTrilhaEdicao(id: string): Promise<TrilhaEdit | null> {
  const sb = await createClient()
  const { data: t, error } = await sb.from('uni_trilhas').select('id, slug, nome, role, cor, prazo, ordem').eq('id', id).maybeSingle()
  if (error || !t) return null
  const tr = t as TrilhaDb
  const { data: ed } = await sb.from('uni_etapas').select('id, trilha_id, ordem, nome, yt, bunny_guid, min, prova, is_final').eq('trilha_id', id).order('ordem', { ascending: true })
  const etapas = (ed ?? []) as EtapaDb[]
  const toEdit = (e: EtapaDb): EtapaEdit => ({ id: e.id, ordem: e.ordem, nome: e.nome, yt: e.yt, bunny_guid: e.bunny_guid, bunnyEmbed: e.bunny_guid ? bunnyStreamEmbedUrl(e.bunny_guid) : null, min: e.min, prova: e.prova || [], is_final: e.is_final })
  const f = etapas.find((e) => e.is_final)
  return {
    id: tr.id, slug: tr.slug, nome: tr.nome, role: tr.role, cor: tr.cor, prazo: tr.prazo,
    etapas: etapas.filter((e) => !e.is_final).map(toEdit),
    final: f ? toEdit(f) : null,
  }
}
