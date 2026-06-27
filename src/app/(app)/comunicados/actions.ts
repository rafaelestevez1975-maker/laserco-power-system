'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { msgErro as rlsMsg } from '@/lib/sb'

export type ComunicadoForm = {
  titulo: string
  mensagem: string
  prioridade: 'normal' | 'importante' | 'urgente'
  categoria: string
  audiencia: string[]
  leitura_obrigatoria: boolean
  enviar_email: boolean
  status: 'rascunho' | 'agendado' | 'publicado'
  agendado_para?: string | null
}
export type ActionResult = { ok: boolean; error?: string; id?: string }

// rlsMsg = msgErro (compartilhado em @/lib/sb — DRY, ver docs/CONSOLIDACAO.md D1)

/** Cria um comunicado (somente admin_geral  garantido pela RLS). */
export async function criarComunicado(form: ComunicadoForm): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  const titulo = form.titulo?.trim()
  const mensagem = form.mensagem?.trim()
  if (!titulo || !mensagem) return { ok: false, error: 'Preencha título e mensagem.' }

  const { data: perfil } = await sb.from('perfis_usuario').select('nome_completo, unidade_id, papel').eq('id', user.id).single()
  const p = perfil as { nome_completo?: string; unidade_id?: string | null; papel?: string } | null
  if (p?.papel !== 'admin_geral') return { ok: false, error: 'Somente administradores enviam comunicados.' }

  let empresa_id: string | null = null
  if (p?.unidade_id) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', p.unidade_id).single()
    empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id ?? null
  }

  // total_destinatarios = pool real de pessoas que precisam ler (perfis ativos).
  const { count } = await sb.from('perfis_usuario').select('id', { count: 'exact', head: true }).eq('ativo', true)
  const total_destinatarios = count ?? 0

  const audiencia = form.audiencia?.length ? form.audiencia : ['Todos']
  const publicado_em = form.status === 'publicado' ? new Date().toISOString() : null

  const { data: ins, error } = await sb.from('comunicados').insert({
    empresa_id, titulo, mensagem,
    prioridade: form.prioridade || 'normal',
    categoria: form.categoria || 'Sem categoria',
    audiencia,
    leitura_obrigatoria: !!form.leitura_obrigatoria,
    enviar_email: !!form.enviar_email,
    status: form.status || 'publicado',
    total_destinatarios,
    publicado_em,
    agendado_para: form.status === 'agendado' ? (form.agendado_para || null) : null,
    autor_id: user.id,
    autor_nome: p?.nome_completo ?? user.email ?? 'Administrador',
  }).select('id').single()

  if (error) return { ok: false, error: rlsMsg(error.message, 'criar comunicado') }
  revalidatePath('/comunicados')
  return { ok: true, id: (ins as { id?: string })?.id }
}

/** Registra o "ciente" (leitura) do usuário atual num comunicado. */
export async function marcarCiente(comunicadoId: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { data: perfil } = await sb.from('perfis_usuario').select('unidade_id').eq('id', user.id).single()
  const unidade_id = (perfil as { unidade_id?: string | null } | null)?.unidade_id ?? null

  // ignoreDuplicates → ON CONFLICT DO NOTHING (evita o caminho de UPDATE, que não
  // tem policy self em comunicado_leituras; reconfirmar "ciente" é no-op).
  const { error } = await sb.from('comunicado_leituras')
    .upsert({ comunicado_id: comunicadoId, perfil_id: user.id, unidade_id, ciente: true }, { onConflict: 'comunicado_id,perfil_id', ignoreDuplicates: true })
  if (error) return { ok: false, error: rlsMsg(error.message, 'registrar ciente') }
  revalidatePath('/comunicados')
  return { ok: true }
}

export type LeitorRow = { nome: string; unidade: string | null; lido_em: string }
/** Relatório de leitura (quem deu "ciente")  somente admin. */
export async function relatorioLeitura(comunicadoId: string): Promise<{ ok: boolean; error?: string; leitores?: LeitorRow[] }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { data: perfil } = await sb.from('perfis_usuario').select('papel').eq('id', user.id).single()
  if ((perfil as { papel?: string } | null)?.papel !== 'admin_geral') return { ok: false, error: 'Apenas administradores.' }

  const { data, error } = await sb
    .from('comunicado_leituras')
    .select('lido_em, perfis_usuario(nome_completo), unidades(nome)')
    .eq('comunicado_id', comunicadoId)
    .order('lido_em', { ascending: false })
  if (error) return { ok: false, error: error.message }
  const leitores = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const pu = r.perfis_usuario as { nome_completo?: string } | { nome_completo?: string }[] | null
    const un = r.unidades as { nome?: string } | { nome?: string }[] | null
    const perfilNome = Array.isArray(pu) ? pu[0]?.nome_completo : pu?.nome_completo
    const uniNome = Array.isArray(un) ? un[0]?.nome : un?.nome
    return { nome: perfilNome || '', unidade: uniNome ?? null, lido_em: r.lido_em as string }
  })
  return { ok: true, leitores }
}

export type RosterRow = { nome: string; unidade: string | null; lido: boolean; lido_em: string | null }
/** Roster completo do comunicado: TODOS os destinatários ativos com status Ciente/Pendente
 *  e a data do ciente (espelha comRoster/comReportRender do legado 6461-6488). Só admin. */
export async function rosterLeitura(comunicadoId: string): Promise<{ ok: boolean; error?: string; roster?: RosterRow[] }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { data: perfil } = await sb.from('perfis_usuario').select('papel').eq('id', user.id).single()
  if ((perfil as { papel?: string } | null)?.papel !== 'admin_geral') return { ok: false, error: 'Apenas administradores.' }

  const admin = adminClient()
  // Pool de destinatários = perfis ativos (mesma base de total_destinatarios em criarComunicado).
  const { data: pessoas, error: ePessoas } = await admin
    .from('perfis_usuario')
    .select('id, nome_completo, unidades(nome)')
    .eq('ativo', true)
    .order('nome_completo', { ascending: true })
  if (ePessoas) return { ok: false, error: ePessoas.message }

  // Quem deu ciente (com a data) neste comunicado.
  const { data: lidasRaw } = await admin
    .from('comunicado_leituras')
    .select('perfil_id, lido_em')
    .eq('comunicado_id', comunicadoId)
  const lidasMap: Record<string, string | null> = {}
  for (const r of (lidasRaw ?? []) as { perfil_id: string; lido_em: string | null }[]) lidasMap[r.perfil_id] = r.lido_em

  const roster: RosterRow[] = ((pessoas ?? []) as Array<Record<string, unknown>>).map((p) => {
    const un = p.unidades as { nome?: string } | { nome?: string }[] | null
    const uniNome = Array.isArray(un) ? un[0]?.nome : un?.nome
    const id = p.id as string
    const lido = Object.prototype.hasOwnProperty.call(lidasMap, id)
    return { nome: (p.nome_completo as string) || '', unidade: uniNome ?? null, lido, lido_em: lido ? lidasMap[id] : null }
  })
  // Cientes primeiro, depois pendentes (ordenação amigável para a tela).
  roster.sort((a, b) => (a.lido === b.lido ? 0 : a.lido ? -1 : 1))
  return { ok: true, roster }
}

/** Encerra (ou reabre) um comunicado  admin. */
export async function definirStatusComunicado(id: string, status: 'publicado' | 'encerrado' | 'agendado'): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const patch: Record<string, unknown> = { status }
  if (status === 'publicado') patch.publicado_em = new Date().toISOString()
  const { error } = await sb.from('comunicados').update(patch).eq('id', id)
  if (error) return { ok: false, error: rlsMsg(error.message, 'alterar o comunicado') }
  revalidatePath('/comunicados')
  return { ok: true }
}
