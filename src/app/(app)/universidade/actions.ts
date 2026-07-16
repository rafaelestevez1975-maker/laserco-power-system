'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB, type Operador } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { getSessionContext } from '@/lib/session'
import { bunnyStreamOn, bunnyStreamCriarVideo, bunnyStreamUpload, bunnyStreamRemover, bunnyStreamTus } from '@/lib/bunny'
import { uniNota, UNI_NOTA_MIN, type Questao } from '@/lib/marketing'

/**
 * Gate de ESCRITA da Universidade. Passa admin_geral (ehAdmin) OU quem tem o cargo
 * "Admin Universidade" (recurso `treinamento.curso` resolvido em getSessionContext).
 * admin_geral tem recursos=[] mas isAdmin=true → por isso checamos ehAdmin PRIMEIRO.
 * Mantém requireOperador (exige login) em todos os casos.
 */
async function podeGerirUni(): Promise<{ ok: true; op: Operador } | { ok: false; error: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error ?? 'Sessão expirada.' }
  if (ehAdmin(op.papel)) return { ok: true, op }
  const ctx = await getSessionContext()
  if (ctx?.recursos.some((r) => r.startsWith('treinamento'))) return { ok: true, op }
  return { ok: false, error: 'Sem permissão para gerenciar a Universidade.' }
}

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

// ─────────────── Prova / Quiz (uniQuizSubmit 5982)  qualquer colaborador autenticado ───────────────

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

// ─────────────── CRUD de trilhas/etapas (uniGerenciar 6044-6078)  só admin ───────────────

export type EtapaInput = { id?: string; ordem: number; nome: string; yt?: string | null; min: number; prova: Questao[]; is_final?: boolean }
export type TrilhaInput = { nome: string; role: string; prazo: string; cor?: string }

/** Cria uma nova trilha com 1 etapa exemplo + prova final (uniGerNew 6074). Só admin. */
export async function criarTrilha(input: TrilhaInput): Promise<ActionResult> {
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g

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
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
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
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
  if (!id) return { ok: false, error: 'Trilha inválida.' }

  const { error: e } = await op.sb.from('uni_trilhas').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir trilha') }
  revalidatePath('/universidade')
  return { ok: true }
}

/** Adiciona uma etapa (vídeo) à trilha (uniAddEtapa 6076). Só admin. */
export async function adicionarEtapa(trilhaId: string): Promise<ActionResult> {
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
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
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
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
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
  if (!id) return { ok: false, error: 'Etapa inválida.' }

  const { error: e } = await op.sb.from('uni_etapas').delete().eq('id', id).eq('is_final', false)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir etapa') }
  revalidatePath('/universidade')
  return { ok: true }
}

// ─────────────── Vídeo da etapa via Bunny Stream (fallback do YouTube) ───────────────

export type VideoResult = { ok: boolean; error?: string; guid?: string }

const UNI_VIDEO_MAX_BYTES = 500 * 1024 * 1024 // ~500 MB

/**
 * Sobe um vídeo para o Bunny Stream e vincula o guid à etapa (uni_etapas.bunny_guid).
 * Quando a etapa tem bunny_guid, o player usa o Bunny; senão cai no YouTube (yt).
 * Gate: mesmo `podeGerirUni` (admin_geral ou Admin Universidade).
 */
export async function subirVideoEtapa(etapaId: string, dataUri: string, titulo: string): Promise<VideoResult> {
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
  if (!etapaId) return { ok: false, error: 'Etapa inválida.' }
  if (!bunnyStreamOn()) return { ok: false, error: 'Configure o Bunny Stream para enviar vídeos.' }

  // data URI (data:video/mp4;base64,XXXX) → bytes.
  const base64 = (dataUri || '').split(',')[1] ?? ''
  if (!base64) return { ok: false, error: 'Arquivo de vídeo vazio ou inválido.' }
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) return { ok: false, error: 'Arquivo de vídeo vazio.' }
  if (bytes.length > UNI_VIDEO_MAX_BYTES) return { ok: false, error: 'Vídeo acima do limite de 500 MB.' }

  const criado = await bunnyStreamCriarVideo((titulo || 'Aula').trim() || 'Aula')
  if ('error' in criado) return { ok: false, error: criado.error }
  const guid = criado.guid

  const up = await bunnyStreamUpload(guid, bytes)
  if (up.error) {
    await bunnyStreamRemover(guid) // limpa o vídeo órfão no Bunny
    return { ok: false, error: up.error }
  }

  const { error: e } = await op.sb.from('uni_etapas').update({ bunny_guid: guid }).eq('id', etapaId)
  if (e) {
    await bunnyStreamRemover(guid)
    return { ok: false, error: msgErro(e.message, 'salvar vídeo') }
  }

  revalidatePath('/universidade')
  return { ok: true, guid }
}

export type TusInit =
  | { ok: true; endpoint: string; libraryId: string; guid: string; signature: string; expiration: number }
  | { ok: false; error: string }

/**
 * Inicia um upload DIRETO do navegador → Bunny (TUS): cria o vídeo, já vincula o guid à etapa
 * e devolve a assinatura temporária. Serve p/ vídeos GRANDES de treinamento (não passa pelo
 * nosso servidor, então não bate no limite de body do Vercel). Gate: podeGerirUni.
 */
export async function iniciarUploadVideoTus(etapaId: string, titulo: string): Promise<TusInit> {
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
  if (!etapaId) return { ok: false, error: 'Etapa inválida.' }
  if (!bunnyStreamOn()) return { ok: false, error: 'Configure o Bunny Stream para enviar vídeos.' }

  const criado = await bunnyStreamCriarVideo((titulo || 'Aula').trim() || 'Aula')
  if ('error' in criado) return { ok: false, error: criado.error }
  const guid = criado.guid

  const tus = bunnyStreamTus(guid)
  if (!tus) { await bunnyStreamRemover(guid); return { ok: false, error: 'Falha ao assinar o upload.' } }

  // vincula já o guid (o vídeo processa no Bunny; o player passa a usá-lo)
  const { error: e } = await op.sb.from('uni_etapas').update({ bunny_guid: guid }).eq('id', etapaId)
  if (e) { await bunnyStreamRemover(guid); return { ok: false, error: msgErro(e.message, 'vincular vídeo') } }

  revalidatePath('/universidade')
  return { ok: true, ...tus }
}

/** Remove o vídeo do Bunny e zera uni_etapas.bunny_guid (volta ao fallback YouTube). */
export async function removerVideoEtapa(etapaId: string): Promise<ActionResult> {
  const g = await podeGerirUni()
  if (!g.ok) return { ok: false, error: g.error }
  const { op } = g
  if (!etapaId) return { ok: false, error: 'Etapa inválida.' }

  const { data, error: eSel } = await op.sb.from('uni_etapas').select('bunny_guid').eq('id', etapaId).maybeSingle()
  if (eSel) return { ok: false, error: msgErro(eSel.message, 'carregar vídeo') }
  const guid = (data as { bunny_guid?: string | null } | null)?.bunny_guid ?? null
  if (guid) await bunnyStreamRemover(guid)

  const { error: e } = await op.sb.from('uni_etapas').update({ bunny_guid: null }).eq('id', etapaId)
  if (e) return { ok: false, error: msgErro(e.message, 'remover vídeo') }

  revalidatePath('/universidade')
  return { ok: true }
}
