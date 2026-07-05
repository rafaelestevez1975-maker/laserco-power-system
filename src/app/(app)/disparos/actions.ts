'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { getSessionContext } from '@/lib/session'
import { exigirPapel } from '@/lib/rbac'
import { segLabel, type SegCriterio } from '@/lib/automacoes'
import { normTel } from '@/lib/uazapi'

const PAPEIS_ESCRITA = ['gestor', 'operacoes']

/**
 * Conta DE VERDADE os contatos do segmento na base de clientes (substitui o
 * segCount fabricado do legado  base fixa 1248 × fatores hardcoded  que gravava
 * um número inventado em disparo_bases.contatos). Usa COUNT exato no Supabase
 * aplicando só os critérios que mapeiam para colunas reais de `clientes`
 * (verificado/cidade/estado), escopado pela unidade. Critérios que dependem de
 * histórico de compras (já contratou / contratou serviço X / gasto) ainda não são
 * avaliáveis aqui sem joins pesados: são ignorados na contagem em vez de gerar
 * estimativa falsa  devolve nº real de clientes que casam com os filtros suportados.
 */
async function contarSegmentoReal(sb: SB, crit: SegCriterio[], unidadeId: string | null): Promise<number> {
  let q = sb.from('clientes').select('id', { count: 'exact', head: true }).eq('ativo', true)
  if (unidadeId) q = q.eq('unidade_origem_id', unidadeId)
  for (const c of crit) {
    const v = (c.valor || '').trim()
    if (c.campo === 'verificado') q = q.eq('verificado', /^s/i.test(v))
    else if (c.campo === 'cidade' && v) q = q.ilike('cidade', `%${v}%`)
    else if (c.campo === 'estado' && v) q = q.ilike('estado', `%${v}%`)
    // demais critérios (jaCliente/contratou/naoContratou/gasto/unidade) sem coluna
    // direta confiável → não fabrica fator; permanecem fora da contagem.
  }
  const { count, error } = await q
  return error ? 0 : (count ?? 0)
}

async function empresaDaUnidade(sb: SB, unidadeId: string): Promise<string | null> {
  const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  return (data as { empresa_id?: string } | null)?.empresa_id ?? null
}

async function ctxEmpresaUnidade(sb: SB): Promise<{ empresaId: string | null; unidadeId: string | null }> {
  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? ctx?.unidades?.[0]?.id ?? null
  const empresaId = unidadeId ? await empresaDaUnidade(sb, unidadeId) : null
  return { empresaId, unidadeId: ctx?.activeUnitId ?? null }
}

// ─── Bases & Segmentos (DISP_BASES 6529 / segModal 6678) ───

/** Cria uma base "Sistema" a partir de critérios do segmentador (COUNT real de clientes). */
export async function criarBaseSegmento(criterios: SegCriterio[]): Promise<{ ok: boolean; error?: string; contatos?: number }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'criar bases'); if (neg) return { ok: false, error: neg }
  const crit = (criterios || []).filter((c) => c?.campo)
  if (crit.length === 0) return { ok: false, error: 'Adicione ao menos um critério.' }

  const { empresaId, unidadeId } = await ctxEmpresaUnidade(op.sb)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }
  const n = await contarSegmentoReal(op.sb, crit, unidadeId)
  const { error: e } = await op.sb.from('disparo_bases').insert({
    empresa_id: empresaId, unidade_id: unidadeId, nome: segLabel(crit), tipo: 'sistema',
    contatos: n, criterios: crit, criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'criar a base') }
  revalidatePath('/disparos')
  return { ok: true, contatos: n }
}

/** Importa base externa de números colados/CSV (1 número por linha, ou separados por vírgula/;). */
export async function importarBaseExterna(nome: string, numerosRaw: string): Promise<{ ok: boolean; error?: string; total?: number }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'importar bases'); if (neg) return { ok: false, error: neg }
  const n = (nome || '').trim()
  if (!n) return { ok: false, error: 'Dê um nome à base.' }
  const numeros = [...new Set((numerosRaw || '').split(/[\n,;]+/).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 10).map(normTel))]
  if (numeros.length === 0) return { ok: false, error: 'Cole ao menos um número válido (um por linha ou separados por vírgula).' }

  const { empresaId, unidadeId } = await ctxEmpresaUnidade(op.sb)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }
  const { error: e } = await op.sb.from('disparo_bases').insert({
    empresa_id: empresaId, unidade_id: unidadeId, nome: n, tipo: 'externa',
    contatos: numeros.length, numeros, criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'importar a base') }
  revalidatePath('/disparos')
  return { ok: true, total: numeros.length }
}

export async function excluirBase(id: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'excluir bases'); if (neg) return { ok: false, error: neg }
  const { error: e } = await op.sb.from('disparo_bases').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir a base') }
  revalidatePath('/disparos')
  return { ok: true }
}

// ─── Campanhas (DISP_CAMPS 6536 / dispCampanhas 6615) ───

/** Registra uma campanha (rascunho/agendada/concluída) no histórico. */
export async function registrarCampanha(input: {
  nome: string; baseNome?: string | null; baseId?: string | null; canalNome?: string | null
  status?: 'draft' | 'sched' | 'run' | 'done'; enviadas?: number; agendadaPara?: string | null; uazapiId?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'registrar campanhas'); if (neg) return { ok: false, error: neg }
  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da campanha.' }
  const { empresaId, unidadeId } = await ctxEmpresaUnidade(op.sb)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const { error: e } = await op.sb.from('disparo_campanhas').insert({
    empresa_id: empresaId, unidade_id: unidadeId, nome,
    base_nome: input.baseNome ?? null, base_id: input.baseId ?? null, canal_nome: input.canalNome ?? null,
    status: input.status ?? 'draft', enviadas: input.enviadas ?? 0,
    agendada_para: input.agendadaPara ?? null, uazapi_id: input.uazapiId ?? null, criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'registrar a campanha') }
  revalidatePath('/disparos')
  return { ok: true }
}

export async function excluirCampanha(id: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'excluir campanhas'); if (neg) return { ok: false, error: neg }
  const { error: e } = await op.sb.from('disparo_campanhas').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir a campanha') }
  revalidatePath('/disparos')
  return { ok: true }
}

/**
 * "Enviar respondentes ao CRM" (legado dispRespToCRM 6610): cria N leads flegados
 * como Disparo WhatsApp na 1ª etapa do funil da unidade da campanha.
 */
export async function respondentesParaCRM(campanhaId: string): Promise<{ ok: boolean; error?: string; total?: number }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'enviar respondentes ao CRM'); if (neg) return { ok: false, error: neg }

  const { data: camp } = await op.sb.from('disparo_campanhas').select('nome, respostas, empresa_id, unidade_id').eq('id', campanhaId).single()
  const c = camp as { nome: string; respostas: number; empresa_id: string; unidade_id: string | null } | null
  if (!c) return { ok: false, error: 'Campanha não encontrada.' }
  const n = c.respostas || 0
  if (n <= 0) return { ok: false, error: 'Esta campanha ainda não tem respondentes.' }
  if (!c.unidade_id) return { ok: false, error: 'Campanha sem unidade  defina a unidade da campanha.' }

  // 1ª etapa do funil de CLIENTE (QA 05/07: sem o filtro pipeline='cliente', a etapa de
  // FRANQUIA (mesma ordem 1..6) podia ser escolhida e o lead ficava invisível no board /crm).
  const { data: etapa } = await op.sb.from('crm_etapas').select('id').eq('ativo', true).eq('pipeline', 'cliente').order('ordem', { ascending: true }).limit(1).maybeSingle()
  const etapaId = (etapa as { id?: string } | null)?.id
  if (!etapaId) return { ok: false, error: 'Funil do CRM sem etapas.' }

  // origem/temperatura respeitam o CHECK real do crm_leads (ver crm/actions.ts):
  //   origem 'whatsapp' (flega o lead como vindo do Disparo WhatsApp), temperatura 'morno'.
  const rows = Array.from({ length: n }, (_, k) => ({
    empresa_id: c.empresa_id, unidade_id: c.unidade_id, etapa_id: etapaId, responsavel_id: op.userId,
    nome: `Lead ${c.nome.split(' ')[0]} #${k + 1}`, origem: 'whatsapp',
    servico_interesse: c.nome, temperatura: 'morno', status: 'ativo',
  }))
  const { error: e } = await op.sb.from('crm_leads').insert(rows)
  if (e) return { ok: false, error: msgErro(e.message, 'enviar respondentes ao CRM') }
  revalidatePath('/crm')
  return { ok: true, total: n }
}

// ─── Grupo VIP (VIP_GROUPS 6542 / dispVIP 6713) ───

export async function agendarGrupoVip(input: {
  nome: string; dataConvite?: string; dataAquecimento?: string; dataOfertaIni?: string; dataOfertaFim?: string
}): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'agendar grupos VIP'); if (neg) return { ok: false, error: neg }
  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Dê um nome ao Grupo VIP.' }
  const { empresaId, unidadeId } = await ctxEmpresaUnidade(op.sb)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const slug = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const { error: e } = await op.sb.from('vip_grupos').insert({
    empresa_id: empresaId, unidade_id: unidadeId, nome,
    data_convite: input.dataConvite || null, data_aquecimento: input.dataAquecimento || null,
    data_oferta_ini: input.dataOfertaIni || null, data_oferta_fim: input.dataOfertaFim || null,
    status: 'sched', link_publico: `laserco.app/vip/${slug}`, criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'agendar o Grupo VIP') }
  revalidatePath('/disparos')
  return { ok: true }
}

export async function excluirGrupoVip(id: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador(); if (!op) return { ok: false, error }
  const neg = exigirPapel(op.papel, PAPEIS_ESCRITA, 'excluir grupos VIP'); if (neg) return { ok: false, error: neg }
  const { error: e } = await op.sb.from('vip_grupos').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir o Grupo VIP') }
  revalidatePath('/disparos')
  return { ok: true }
}
