'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { uniNota, UNI_NOTA_MIN, type Questao } from '@/lib/marketing'

/**
 * UNIVERSIDADE CORPORATIVA (paridade legado buildUni/uniRender ~5950).
 * Tabelas (migration scripts/migrations/marketing.sql):
 *   uni_trilhas, uni_etapas (prova jsonb, is_final), uni_progresso (por usuário/etapa).
 * Regras do cliente:
 *   - Nota = round(acertos/total*100)/10 ; aprovação >= 7,0 (uniQuizSubmit, 5985-5989).
 *   - Prova final só libera quando todas as etapas estão concluídas (uniTrilhaDet, 5965).
 *   - CRUD de trilhas/etapas/provas: só admin (uniGerenciar, 6046).
 */

export type ActionResult = { ok: boolean; error?: string; id?: string }

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

// ─────────────── Prova / Quiz (uniQuizSubmit 5982) — qualquer colaborador autenticado ───────────────

export type SubmitQuizInput = {
  trilhaId: string
  etapaId: string
  etapaKey: string          // '0','1',... ou 'final' (espelha id:idx do legado)
  respostas: number[]       // índice escolhido por questão (-1 = não respondida)
}

/**
 * Corrige a prova de uma etapa (ou final), grava nota e conclusão por usuário.
 * Regra: nota = round(acertos/total*100)/10; aprovado se >= 7,0 (5985-5989).
 */
export async function submeterProva(input: SubmitQuizInput): Promise<{ ok: boolean; error?: string; nota?: number; aprovado?: boolean }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  // Carrega a etapa (com a prova) e confere que pertence à trilha da empresa.
  const { data: etapa, error: eE } = await op.sb
    .from('uni_etapas')
    .select('id, trilha_id, prova, is_final, uni_trilhas!inner(empresa_id)')
    .eq('id', input.etapaId)
    .maybeSingle()
  if (eE) return { ok: false, error: msgErro(eE.message, 'carregar prova') }
  const e = etapa as { id: string; trilha_id: string; prova: Questao[]; is_final: boolean; uni_trilhas: { empresa_id: string } | { empresa_id: string }[] } | null
  if (!e) return { ok: false, error: 'Prova não encontrada.' }
  const empE = Array.isArray(e.uni_trilhas) ? e.uni_trilhas[0]?.empresa_id : e.uni_trilhas?.empresa_id
  if (empE !== empresa_id) return { ok: false, error: 'Prova de outra empresa.' }

  // Pré-requisito da prova final: todas as etapas (não-finais) concluídas (uniTrilhaDet 5965/5972).
  if (e.is_final) {
    const { count: etapasN } = await op.sb
      .from('uni_etapas')
      .select('id', { count: 'exact', head: true })
      .eq('trilha_id', e.trilha_id).eq('is_final', false)
    const { count: concl } = await op.sb
      .from('uni_progresso')
      .select('id', { count: 'exact', head: true })
      .eq('trilha_id', e.trilha_id).eq('perfil_id', op.userId).eq('concluido', true).neq('etapa_key', 'final')
    if ((concl ?? 0) < (etapasN ?? 0)) return { ok: false, error: 'Conclua todas as etapas para liberar a prova final.' }
  }

  const qs = (e.prova || []) as Questao[]
  if (!qs.length) return { ok: false, error: 'Esta prova não tem questões.' }
  let acertos = 0
  qs.forEach((q, i) => { if (input.respostas[i] === q.c) acertos++ })
  const nota = uniNota(acertos, qs.length)
  const aprovado = nota >= UNI_NOTA_MIN

  const { error: eUp } = await op.sb
    .from('uni_progresso')
    .upsert({
      empresa_id, trilha_id: e.trilha_id, perfil_id: op.userId, etapa_key: input.etapaKey,
      concluido: aprovado, nota, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'trilha_id,perfil_id,etapa_key' })
  if (eUp) return { ok: false, error: msgErro(eUp.message, 'gravar nota') }

  revalidatePath('/universidade')
  return { ok: true, nota, aprovado }
}

// ─────────────── CRUD de trilhas/etapas (uniGerenciar 6044-6078) — só admin ───────────────

export type EtapaInput = { id?: string; ordem: number; nome: string; yt?: string | null; min: number; prova: Questao[]; is_final?: boolean }
export type TrilhaInput = { nome: string; role: string; prazo: string; cor?: string }

/** Cria uma nova trilha com 1 etapa exemplo + prova final (uniGerNew 6074). Só admin. */
export async function criarTrilha(input: TrilhaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'A gestão de trilhas é restrita a administradores.' }

  const nome = (input.nome || '').trim() || 'Nova trilha'
  const role = (input.role || '').trim() || 'Novo cargo'
  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const slug = 'tr' + Date.now()
  const { data, error: e } = await op.sb
    .from('uni_trilhas')
    .insert({ empresa_id, slug, nome, role, cor: input.cor || '#8A2A41', prazo: (input.prazo || '30 dias').trim() })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar trilha') }
  const trilhaId = (data as { id: string }).id

  await op.sb.from('uni_etapas').insert([
    { trilha_id: trilhaId, ordem: 0, nome: 'Etapa 1', yt: '', min: 10, prova: [{ q: 'Pergunta exemplo?', opts: ['Opção A', 'Opção B'], c: 0 }], is_final: false },
    { trilha_id: trilhaId, ordem: 99, nome: 'Prova final', yt: null, min: 0, prova: [{ q: 'Pergunta final?', opts: ['Sim', 'Não'], c: 0 }], is_final: true },
  ])

  revalidatePath('/universidade')
  return { ok: true, id: trilhaId }
}

/** Edita dados da trilha (nome/cargo/prazo/cor). Só admin (uniGerEditor 6065). */
export async function salvarTrilha(id: string, input: TrilhaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'A gestão de trilhas é restrita a administradores.' }
  if (!id) return { ok: false, error: 'Trilha inválida.' }

  const patch: Record<string, unknown> = {}
  if (input.nome !== undefined) patch.nome = (input.nome || '').trim() || 'Trilha'
  if (input.role !== undefined) patch.role = (input.role || '').trim() || 'Cargo'
  if (input.prazo !== undefined) patch.prazo = (input.prazo || '').trim() || '30 dias'
  if (input.cor !== undefined) patch.cor = input.cor

  const { error: e } = await op.sb.from('uni_trilhas').update(patch).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar trilha') }
  revalidatePath('/universidade')
  return { ok: true }
}

/** Exclui uma trilha (CASCADE remove etapas e progresso). Só admin (uniGerDel 6075). */
export async function excluirTrilha(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'A gestão de trilhas é restrita a administradores.' }
  if (!id) return { ok: false, error: 'Trilha inválida.' }

  const { error: e } = await op.sb.from('uni_trilhas').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir trilha') }
  revalidatePath('/universidade')
  return { ok: true }
}

/** Adiciona uma etapa (vídeo) à trilha (uniAddEtapa 6076). Só admin. */
export async function adicionarEtapa(trilhaId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'A gestão de trilhas é restrita a administradores.' }
  if (!trilhaId) return { ok: false, error: 'Trilha inválida.' }

  // Próxima ordem entre as etapas não-finais.
  const { data: ets } = await op.sb.from('uni_etapas').select('ordem').eq('trilha_id', trilhaId).eq('is_final', false).order('ordem', { ascending: false }).limit(1)
  const prox = (((ets ?? [])[0] as { ordem?: number } | undefined)?.ordem ?? -1) + 1

  const { error: e } = await op.sb.from('uni_etapas').insert({
    trilha_id: trilhaId, ordem: prox, nome: 'Nova etapa', yt: '', min: 10, prova: [{ q: 'Nova pergunta?', opts: ['A', 'B'], c: 0 }], is_final: false,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'adicionar etapa') }
  revalidatePath('/universidade')
  return { ok: true }
}

/** Atualiza uma etapa (nome/yt/min/prova) (uniGerEditor inline 6058 / uniEditProva 6078). Só admin. */
export async function salvarEtapa(input: EtapaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'A gestão de trilhas é restrita a administradores.' }
  if (!input.id) return { ok: false, error: 'Etapa inválida.' }

  const prova = Array.isArray(input.prova) ? input.prova.filter((q) => q && q.q && Array.isArray(q.opts) && q.opts.length >= 2) : []
  const patch: Record<string, unknown> = {
    nome: (input.nome || '').trim() || 'Etapa',
    yt: (input.yt || '').trim() || null,
    min: Math.max(0, Number(input.min) || 0),
    prova,
  }
  const { error: e } = await op.sb.from('uni_etapas').update(patch).eq('id', input.id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar etapa') }
  revalidatePath('/universidade')
  return { ok: true }
}

/** Remove uma etapa (uniDelEtapa 6077). Só admin. */
export async function excluirEtapa(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'A gestão de trilhas é restrita a administradores.' }
  if (!id) return { ok: false, error: 'Etapa inválida.' }

  const { error: e } = await op.sb.from('uni_etapas').delete().eq('id', id).eq('is_final', false)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir etapa') }
  revalidatePath('/universidade')
  return { ok: true }
}
