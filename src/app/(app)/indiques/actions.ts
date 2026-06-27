'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { LABEL_TO_DB, IND_STATUS, mesRef } from '@/lib/indiques'

export type ActionResult = { ok: boolean; error?: string }
export type IndicadoInput = { nome: string; telefone?: string; email?: string }
export type NovaIndicacaoInput = {
  indicador_nome: string
  indicador_telefone?: string
  indicador_email?: string
  indicador_cpf?: string
  origem?: string
  premio_descricao?: string
  unidade_id?: string | null
  indicados: IndicadoInput[]
}

const STATUS_INDICADO = ['pendente', 'contatado', 'respondeu', 'agendou', 'compareceu', 'comprou', 'desistiu']
const TS_POR_STATUS: Record<string, string> = { respondeu: 'respondeu_em', agendou: 'agendou_em', compareceu: 'compareceu_em', comprou: 'comprou_em', desistiu: 'desistiu_em' }
const ORIGENS_IND = ['balcao', 'site', 'link']

/**
 * Registra uma indicação manual (indicador + 3 a 5 indicados) e, por paridade com o
 * legado (indSalvarManual 8188-8189), cria um lead no CRM para cada indicado.
 * Telefone do indicado é OPCIONAL (legado aceita só o nome — TODO ⚪ regra 3-5).
 */
export async function criarIndicacao(input: NovaIndicacaoInput): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!input.indicador_nome?.trim()) return { ok: false, error: 'Informe o nome de quem indicou.' }
  if (!input.unidade_id) return { ok: false, error: 'Selecione a unidade da indicação.' }

  // Legado exige ao menos 3 indicados com NOME (telefone opcional). Limite 5.
  const indicados = (input.indicados || []).filter((i) => i.nome?.trim())
  if (indicados.length < 3) return { ok: false, error: 'Informe ao menos 3 pessoas indicadas (nome obrigatório, WhatsApp opcional).' }
  if (indicados.length > 5) return { ok: false, error: 'Máximo de 5 indicados por indicação.' }

  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const origem = ORIGENS_IND.includes((input.origem || '').toLowerCase()) ? input.origem!.toLowerCase() : 'balcao'

  const { data: ind, error } = await sb.from('indicacoes').insert({
    empresa_id, unidade_id: input.unidade_id || null,
    indicador_nome: input.indicador_nome.trim(),
    indicador_telefone: input.indicador_telefone?.trim() || null,
    indicador_email: input.indicador_email?.trim() || null,
    indicador_cpf: input.indicador_cpf?.trim() || null,
    origem,
    premio_descricao: input.premio_descricao?.trim() || null,
    qtd_indicados: indicados.length,
    status: 'ativa', criado_por: user.id,
  }).select('id').single()
  if (error) {
    // Se a coluna origem/cpf ainda não existe (migration indiques.sql não aplicada), instrui.
    if (/origem|indicador_cpf/i.test(error.message) && /column|does not exist/i.test(error.message)) {
      return { ok: false, error: 'Aplique a migration scripts/migrations/indiques.sql no lkii (campos CPF/origem).' }
    }
    return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Sem permissão para registrar indicação.' : error.message }
  }

  const indicacao_id = (ind as { id: string }).id
  const { error: e2 } = await sb.from('indicacao_indicados').insert(
    indicados.map((i) => ({ indicacao_id, nome: i.nome.trim(), telefone: i.telefone?.trim() || null, email: i.email?.trim() || null, status: 'pendente' })),
  )
  if (e2) return { ok: false, error: e2.message }

  // Paridade legado: cada indicado vira lead novo no CRM (quadro "Gestão Indicações").
  await criarLeadsCrmDeIndicados(sb, empresa_id, input.unidade_id || null, input.indicador_nome.trim(), indicados)

  revalidatePath('/indiques')
  return { ok: true }
}

/**
 * Atualiza o status de um indicado a partir do RÓTULO do Kanban (legado IND_STATUS).
 * Mapeia o rótulo (Novo/Em contato/…) para o valor do banco (pendente/contatado/…).
 */
export async function setStatusIndicado(id: string, label: string, observacoes?: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const db = (IND_STATUS as readonly string[]).includes(label) ? LABEL_TO_DB[label as keyof typeof LABEL_TO_DB] : label
  if (!STATUS_INDICADO.includes(db)) return { ok: false, error: 'Status inválido.' }

  const patch: Record<string, unknown> = { status: db }
  if (observacoes != null) patch.observacoes = observacoes.trim() || null
  const tsCol = TS_POR_STATUS[db]
  if (tsCol) patch[tsCol] = new Date().toISOString()

  const { error } = await sb.from('indicacao_indicados').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/indiques')
  return { ok: true }
}

/**
 * Envia ao CRM os indicados que ainda estão como "Novo" (status pendente), criando
 * crm_leads (pipeline cliente, origem indicacao) e marcando-os como "Em contato"
 * (status contatado). Paridade com o legado indEnviarCRM (8161-8165).
 */
export async function enviarNovosAoCrm(unidadeId?: string | null): Promise<{ ok: boolean; error?: string; enviados?: number }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  // Pega indicações (com empresa/unidade) e seus indicados ainda "Novo".
  let q = sb.from('indicacoes')
    .select('id, empresa_id, unidade_id, indicador_nome, indicacao_indicados(id, nome, telefone, status)')
    .order('criado_em', { ascending: false }).limit(300)
  if (unidadeId) q = q.eq('unidade_id', unidadeId)
  const { data, error } = await q
  if (error) return { ok: false, error: error.message }

  type Row = { id: string; empresa_id: string | null; unidade_id: string | null; indicador_nome: string | null; indicacao_indicados: { id: string; nome: string | null; telefone: string | null; status: string | null }[] }
  const rows = (data ?? []) as Row[]

  let enviados = 0
  for (const r of rows) {
    const novos = (r.indicacao_indicados ?? []).filter((x) => (x.status || 'pendente') === 'pendente' && (x.nome || '').trim())
    if (!novos.length || !r.empresa_id) continue
    await criarLeadsCrmDeIndicados(sb, r.empresa_id, r.unidade_id, r.indicador_nome || 'Indicação', novos.map((x) => ({ nome: x.nome || '', telefone: x.telefone || undefined })))
    // marca como "Em contato"
    const ids = novos.map((x) => x.id)
    await sb.from('indicacao_indicados').update({ status: 'contatado' }).in('id', ids)
    enviados += novos.length
  }

  revalidatePath('/indiques')
  revalidatePath('/crm')
  return { ok: true, enviados }
}

/** Helper interno: cria leads no CRM a partir de uma lista de indicados. */
async function criarLeadsCrmDeIndicados(
  sb: Awaited<ReturnType<typeof createClient>>,
  empresa_id: string, unidade_id: string | null, indicadorNome: string,
  indicados: { nome: string; telefone?: string }[],
) {
  // Etapa inicial do funil de clientes (menor ordem).
  const { data: etapa } = await sb.from('crm_etapas')
    .select('id').eq('pipeline', 'cliente').eq('ativo', true)
    .order('ordem', { ascending: true }).limit(1).maybeSingle()
  const etapa_id = (etapa as { id?: string } | null)?.id
  if (!etapa_id) return
  const { data: { user } } = await sb.auth.getUser()
  const rows = indicados.filter((x) => x.nome.trim()).map((x) => ({
    empresa_id, unidade_id, etapa_id, responsavel_id: user?.id ?? null,
    nome: x.nome.trim(), telefone: x.telefone?.trim() || null,
    origem: 'indicacao', servico_interesse: `Indicação de ${indicadorNome}`,
    valor_estimado: null, temperatura: 'morno', status: 'ativo', pipeline: 'cliente',
  }))
  if (rows.length) await sb.from('crm_leads').insert(rows)
}

// ─────────────────────────── Prêmio do mês & meta ───────────────────────────

export type PremioInput = { unidade_id?: string | null; premio: string; valor_ref?: string; observacao?: string; meta_mensal?: number }

/** Salva o prêmio/meta do mês (admin) — grava em indique_config (migration indiques.sql). */
export async function salvarPremio(input: PremioInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador define o prêmio do mês.' }
  if (!input.premio?.trim()) return { ok: false, error: 'Informe o prêmio do mês.' }

  // empresa do usuário (pela unidade ativa) — necessária p/ a RLS por empresa.
  const uniId = input.unidade_id || null
  let empresa_id: string | null = null
  if (uniId) {
    const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', uniId).single()
    empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id ?? null
  } else {
    const { data: p } = await op.sb.from('perfis_usuario').select('unidade_id').eq('id', op.userId).maybeSingle()
    const pUni = (p as { unidade_id?: string } | null)?.unidade_id
    if (pUni) { const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', pUni).single(); empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id ?? null }
  }
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa da unidade.' }

  const row = {
    empresa_id, unidade_id: uniId, mes_ref: mesRef(),
    premio: input.premio.trim(), valor_ref: input.valor_ref?.trim() || null,
    observacao: input.observacao?.trim() || null,
    meta_mensal: input.meta_mensal && input.meta_mensal > 0 ? Math.round(input.meta_mensal) : 60,
    atualizado_em: new Date().toISOString(), criado_por: op.userId,
  }
  const { error: e } = await op.sb.from('indique_config').upsert(row, { onConflict: 'empresa_id,unidade_id,mes_ref' })
  if (e) {
    if (/indique_config|does not exist|relation/i.test(e.message)) return { ok: false, error: 'Aplique a migration scripts/migrations/indiques.sql no lkii.' }
    return { ok: false, error: msgErro(e.message, 'salvar prêmio') }
  }
  revalidatePath('/indiques')
  return { ok: true }
}

// ─────────────────────────── Sorteio ───────────────────────────

export type RegistrarSorteioInput = { unidade_id?: string | null; ganhador_nome: string; ganhador_whats?: string; ganhador_email?: string; premio?: string }

/** Registra o ganhador do sorteio do mês em indique_sorteios (legado IND_ULTIMO_SORTEIO). */
export async function registrarSorteio(input: RegistrarSorteioInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!input.ganhador_nome?.trim()) return { ok: false, error: 'Informe o ganhador.' }

  const uniId = input.unidade_id || null
  let empresa_id: string | null = null
  if (uniId) {
    const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', uniId).single()
    empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id ?? null
  } else {
    const { data: p } = await op.sb.from('perfis_usuario').select('unidade_id').eq('id', op.userId).maybeSingle()
    const pUni = (p as { unidade_id?: string } | null)?.unidade_id
    if (pUni) { const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', pUni).single(); empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id ?? null }
  }
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { data, error: e } = await op.sb.from('indique_sorteios').insert({
    empresa_id, unidade_id: uniId, mes_ref: mesRef(),
    ganhador_nome: input.ganhador_nome.trim(), ganhador_whats: input.ganhador_whats?.trim() || null,
    ganhador_email: input.ganhador_email?.trim() || null, premio: input.premio?.trim() || null,
    sorteado_por: op.userId,
  }).select('id').single()
  if (e) {
    if (/indique_sorteios|does not exist|relation/i.test(e.message)) return { ok: false, error: 'Aplique a migration scripts/migrations/indiques.sql no lkii.' }
    return { ok: false, error: msgErro(e.message, 'registrar sorteio') }
  }
  revalidatePath('/indiques')
  return { ok: true, id: (data as { id: string }).id }
}

/** Marca o sorteio como notificado (e-mail + WhatsApp) — legado indNotificarGanhador (8291-8296). */
export async function notificarGanhador(sorteioId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!sorteioId) return { ok: false, error: 'Realize o sorteio primeiro.' }
  const { error: e } = await op.sb.from('indique_sorteios').update({ notificado: true }).eq('id', sorteioId)
  if (e) return { ok: false, error: msgErro(e.message, 'notificar ganhador') }
  revalidatePath('/indiques')
  return { ok: true }
}
