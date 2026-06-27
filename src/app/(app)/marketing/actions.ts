'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { getSessionContext } from '@/lib/session'
import { exigirPapel, ehAdmin } from '@/lib/rbac'
import { STATUS_CAMPANHA, SEGMENTACAO_TIPOS, type StatusCampanha, type SegmentacaoTipo } from '@/lib/marketing'

/**
 * Marketing — campanhas de WhatsApp da unidade (campanhas_whatsapp).
 * Cada unidade dispara para a sua própria base segmentada; o relatório de
 * entrega/leitura/resposta vem dos destinatários (campanha_destinatarios).
 * Substitui o snapshot estático da rota /marketing pelo módulo real.
 */

// Papéis que podem criar/editar campanhas (além do admin_geral, que sempre passa).
const PAPEIS_ESCRITA = ['gestor', 'operacoes', 'marketing']

export type NovaCampanhaInput = {
  nome: string
  descricao?: string
  mensagem_base: string
  template_id?: string | null
  segmentacao_tipo: string
  status?: string
  agendado_para?: string | null
  ia_personalizar?: boolean
  ia_instrucao?: string
}

export type EditCampanhaInput = {
  id: string
  nome?: string
  descricao?: string
  mensagem_base?: string
  template_id?: string | null
  segmentacao_tipo?: string
  status?: string
  agendado_para?: string | null
  ia_personalizar?: boolean
  ia_instrucao?: string
}

/** Resolve a empresa da unidade (campanhas_whatsapp.empresa_id é obrigatório). */
async function empresaDaUnidade(sb: SB, unidadeId: string): Promise<string | null> {
  const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  return (data as { empresa_id?: string } | null)?.empresa_id ?? null
}

/** Resolve o nome do template (campanhas_whatsapp.template_nome é desnormalizado). */
async function nomeTemplate(sb: SB, templateId: string): Promise<string | null> {
  const { data } = await sb.from('whatsapp_templates').select('nome').eq('id', templateId).single()
  return (data as { nome?: string } | null)?.nome ?? null
}

/** Normaliza um datetime-local ("2026-06-14T09:00") para ISO; null se vazio/ inválido. */
function parseAgenda(v: string | null | undefined): string | null {
  const t = (v || '').trim()
  if (!t) return null
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/** Cria uma campanha de WhatsApp na unidade ativa (entra como rascunho ou agendada). */
export async function criarCampanha(input: NovaCampanhaInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'criar campanhas')
  if (neg) return { ok: false, error: neg }
  const sb = op.sb

  // Validação por campo.
  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Dê um nome à campanha.' }
  const mensagem = (input.mensagem_base || '').trim()
  if (!mensagem) return { ok: false, error: 'Escreva a mensagem da campanha.' }
  const seg = (input.segmentacao_tipo || '').trim()
  if (!SEGMENTACAO_TIPOS.includes(seg as SegmentacaoTipo)) return { ok: false, error: 'Selecione um público-alvo válido.' }
  const status = STATUS_CAMPANHA.includes((input.status || '') as StatusCampanha) ? (input.status as StatusCampanha) : 'rascunho'
  const agendado_para = parseAgenda(input.agendado_para)
  if (status === 'agendada' && !agendado_para) return { ok: false, error: 'Informe a data/hora do agendamento.' }

  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null
  if (!unidadeId) return { ok: false, error: 'Selecione uma unidade no topo para criar a campanha.' }
  const empresaId = await empresaDaUnidade(sb, unidadeId)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const template_id = input.template_id?.trim() || null
  const template_nome = template_id ? await nomeTemplate(sb, template_id) : null

  const { data, error: e } = await sb
    .from('campanhas_whatsapp')
    .insert({
      empresa_id: empresaId,
      unidade_id: unidadeId,
      nome,
      descricao: input.descricao?.trim() || null,
      mensagem_base: mensagem,
      template_id,
      template_nome,
      segmentacao_tipo: seg,
      status,
      agendado_para,
      ia_personalizar: !!input.ia_personalizar,
      ia_instrucao: input.ia_personalizar ? (input.ia_instrucao?.trim() || null) : null,
      criado_por: op.userId,
    })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'criar a campanha') }
  revalidatePath('/marketing')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita uma campanha existente (campos parciais). Só permite enquanto não está em disparo/concluída. */
export async function atualizarCampanha(input: EditCampanhaInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'editar campanhas')
  if (neg) return { ok: false, error: neg }
  const sb = op.sb

  if (!input.id) return { ok: false, error: 'Campanha inválida.' }

  // Não permite editar conteúdo de uma campanha já processada/concluída (relatório fechado).
  const { data: atual } = await sb.from('campanhas_whatsapp').select('status').eq('id', input.id).single()
  const statusAtual = (atual as { status?: string } | null)?.status
  if (!atual) return { ok: false, error: 'Campanha não encontrada.' }
  if (statusAtual === 'concluida' || statusAtual === 'processando') {
    return { ok: false, error: 'Campanha em disparo ou concluída não pode ser editada.' }
  }

  const patch: Record<string, unknown> = {}
  if (input.nome !== undefined) {
    const nome = input.nome.trim()
    if (!nome) return { ok: false, error: 'O nome não pode ficar vazio.' }
    patch.nome = nome
  }
  if (input.descricao !== undefined) patch.descricao = input.descricao.trim() || null
  if (input.mensagem_base !== undefined) {
    const m = input.mensagem_base.trim()
    if (!m) return { ok: false, error: 'A mensagem não pode ficar vazia.' }
    patch.mensagem_base = m
  }
  if (input.segmentacao_tipo !== undefined) {
    const seg = input.segmentacao_tipo.trim()
    if (!SEGMENTACAO_TIPOS.includes(seg as SegmentacaoTipo)) return { ok: false, error: 'Público-alvo inválido.' }
    patch.segmentacao_tipo = seg
  }
  if (input.status !== undefined) {
    if (!STATUS_CAMPANHA.includes(input.status as StatusCampanha)) return { ok: false, error: 'Status inválido.' }
    patch.status = input.status
  }
  if (input.agendado_para !== undefined) patch.agendado_para = parseAgenda(input.agendado_para)
  if (input.ia_personalizar !== undefined) patch.ia_personalizar = !!input.ia_personalizar
  if (input.ia_instrucao !== undefined) patch.ia_instrucao = input.ia_instrucao.trim() || null
  if (input.template_id !== undefined) {
    const tid = input.template_id?.trim() || null
    patch.template_id = tid
    patch.template_nome = tid ? await nomeTemplate(sb, tid) : null
  }

  // Coerência: agendada exige data; status agendada sem data -> erro.
  if (patch.status === 'agendada' && patch.agendado_para === null && input.agendado_para !== undefined) {
    return { ok: false, error: 'Informe a data/hora do agendamento.' }
  }

  if (Object.keys(patch).length === 0) return { ok: true }
  patch.atualizado_em = new Date().toISOString()

  const { error: e } = await sb.from('campanhas_whatsapp').update(patch).eq('id', input.id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar a campanha') }
  revalidatePath('/marketing')
  return { ok: true }
}

/** Cancela uma campanha (status -> cancelada). Não exclui o histórico. */
export async function cancelarCampanha(id: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'cancelar campanhas')
  if (neg) return { ok: false, error: neg }
  if (!id) return { ok: false, error: 'Campanha inválida.' }

  const { data: atual } = await op.sb.from('campanhas_whatsapp').select('status').eq('id', id).single()
  if (!atual) return { ok: false, error: 'Campanha não encontrada.' }
  if ((atual as { status?: string }).status === 'concluida') return { ok: false, error: 'Campanha concluída não pode ser cancelada.' }

  const { error: e } = await op.sb
    .from('campanhas_whatsapp')
    .update({ status: 'cancelada', atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'cancelar a campanha') }
  revalidatePath('/marketing')
  return { ok: true }
}

// ═══════════════════ CENTRAL DE MATERIAIS DA REDE (paridade buildMarketing ~8372) ═══════════════════

/** Resolve a empresa do usuário (via unidade do perfil; fallback 1ª empresa). */
async function resolverEmpresaId(sb: SB, userId: string): Promise<string | null> {
  const { data: perfil } = await sb.from('perfis_usuario').select('unidade_id').eq('id', userId).maybeSingle()
  const unidadeId = (perfil as { unidade_id?: string | null } | null)?.unidade_id ?? null
  if (unidadeId) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).maybeSingle()
    const eid = (uni as { empresa_id?: string | null } | null)?.empresa_id ?? null
    if (eid) return eid
  }
  const { data: emp } = await sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  return (emp as { id?: string } | null)?.id ?? null
}

/** Publica uma notícia da rede (mktNovaNoticia, 8358). Só admin; autor 'Marketing da Rede'. */
export async function publicarNoticia(input: { titulo: string; resumo?: string | null }): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores publicam notícias da rede.' }

  const titulo = (input.titulo || '').trim()
  if (!titulo) return { ok: false, error: 'Informe o título da notícia.' }
  if (titulo.length > 200) return { ok: false, error: 'Título muito longo (máx. 200).' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { data, error: e } = await op.sb
    .from('mkt_noticias')
    .insert({ empresa_id, titulo, resumo: (input.resumo || '').trim() || null, autor: 'Marketing da Rede', criado_por: op.userId })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'publicar notícia') }
  revalidatePath('/marketing')
  return { ok: true, id: (data as { id: string }).id }
}

/** Marca todas as atualizações da empresa como lidas (mktGo aba atualizacoes, 8354). */
export async function marcarAtualizacoesLidas(): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { error: e } = await op.sb
    .from('mkt_atualizacoes')
    .update({ novo: false })
    .eq('empresa_id', empresa_id)
    .eq('novo', true)

  if (e) return { ok: false, error: msgErro(e.message, 'marcar como lido') }
  revalidatePath('/marketing')
  return { ok: true }
}
