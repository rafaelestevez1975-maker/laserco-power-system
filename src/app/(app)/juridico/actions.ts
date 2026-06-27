'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import {
  montarAssunto,
  montarCorpo,
  franqueadoNome,
  NOVO_TEMPLATE,
  type DocTipo,
  type RecebivelAtraso,
} from '@/lib/juridico'

/** Status válidos do enum status_documento_assinatura (descobertos no schema real). */
const STATUS_DOC = ['rascunho', 'em_andamento', 'concluido', 'cancelado', 'expirado'] as const
type StatusDoc = (typeof STATUS_DOC)[number]

/** Status válidos do enum status_signatario. */
const STATUS_SIG = ['pendente', 'visualizado', 'assinado', 'recusado'] as const

const ROTA = '/juridico'

/** Só admin geral opera o Jurídico (módulo restrito — igual ao legado). */
function exigeAdmin(papel: string): string | null {
  return ehAdmin(papel) ? null : 'Módulo restrito a administradores.'
}

export type NovoDocumentoInput = {
  titulo: string
  descricao?: string
  arquivo_nome?: string
  prazo?: string | null
  ordem_sequencial?: boolean
  unidade_id?: string | null
}

/**
 * Cria um documento contratual para assinatura (entra como rascunho).
 * O upload do arquivo em si é feito por outro fluxo (storage); aqui registramos
 * o metadado mínimo exigido pelo schema (arquivo_path/arquivo_nome/hash_original
 * são NOT NULL). Usamos placeholders rastreáveis quando o arquivo ainda não subiu.
 */
export async function criarDocumento(input: NovoDocumentoInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }

  const titulo = (input.titulo || '').trim()
  if (!titulo) return { ok: false, error: 'Informe o título do documento.' }

  const arquivoNome = (input.arquivo_nome || '').trim() || `${titulo}.pdf`
  // hash_original / arquivo_path são NOT NULL no schema; ainda não há upload aqui,
  // então gravamos um marcador determinístico (substituído quando o arquivo subir).
  const ref = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  const arquivoPath = `pendente/${ref}/${arquivoNome}`
  const hashOriginal = `pendente:${ref}`

  const { error: e } = await op.sb.from('documentos_assinatura').insert({
    titulo,
    descricao: input.descricao?.trim() || null,
    arquivo_nome: arquivoNome,
    arquivo_path: arquivoPath,
    hash_original: hashOriginal,
    status: 'rascunho',
    prazo: input.prazo?.trim() || null,
    ordem_sequencial: !!input.ordem_sequencial,
    unidade_id: input.unidade_id || null,
    criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'criar o documento') }

  revalidatePath(ROTA)
  return { ok: true }
}

export type EditDocumentoInput = {
  id: string
  titulo?: string
  descricao?: string
  arquivo_nome?: string
  prazo?: string | null
  ordem_sequencial?: boolean
  unidade_id?: string | null
}

/** Edita campos de um documento (parcial). Não altera status aqui (use enviar/cancelar). */
export async function atualizarDocumento(dados: EditDocumentoInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!dados.id) return { ok: false, error: 'Documento inválido.' }
  if (dados.titulo !== undefined && !dados.titulo.trim()) return { ok: false, error: 'O título não pode ficar vazio.' }

  const patch: Record<string, unknown> = {}
  if (dados.titulo !== undefined) patch.titulo = dados.titulo.trim()
  if (dados.descricao !== undefined) patch.descricao = dados.descricao.trim() || null
  if (dados.arquivo_nome !== undefined) patch.arquivo_nome = dados.arquivo_nome.trim() || null
  if (dados.prazo !== undefined) patch.prazo = dados.prazo?.trim() || null
  if (dados.ordem_sequencial !== undefined) patch.ordem_sequencial = !!dados.ordem_sequencial
  if (dados.unidade_id !== undefined) patch.unidade_id = dados.unidade_id || null
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error: e } = await op.sb.from('documentos_assinatura').update(patch).eq('id', dados.id)
  if (e) return { ok: false, error: msgErro(e.message, 'editar o documento') }

  revalidatePath(ROTA)
  return { ok: true }
}

/** Coloca o documento em circulação (rascunho → em_andamento) e marca enviado_em. */
export async function enviarDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Documento inválido.' }

  const { data: doc } = await op.sb.from('documentos_assinatura').select('status').eq('id', id).single()
  const status = (doc as { status?: StatusDoc } | null)?.status
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  if (status !== 'rascunho') return { ok: false, error: 'Só é possível enviar documentos em rascunho.' }

  const { count } = await op.sb
    .from('signatarios_documento')
    .select('id', { count: 'exact', head: true })
    .eq('documento_id', id)
  if (!count) return { ok: false, error: 'Adicione ao menos um signatário antes de enviar.' }

  const { error: e } = await op.sb
    .from('documentos_assinatura')
    .update({ status: 'em_andamento', enviado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'enviar o documento') }

  revalidatePath(ROTA)
  return { ok: true }
}

/** Cancela o documento (em qualquer estado não-final) com motivo. */
export async function cancelarDocumento(id: string, motivo?: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Documento inválido.' }

  const { data: doc } = await op.sb.from('documentos_assinatura').select('status').eq('id', id).single()
  const status = (doc as { status?: StatusDoc } | null)?.status
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  if (status === 'concluido') return { ok: false, error: 'Documento já concluído não pode ser cancelado.' }
  if (status === 'cancelado') return { ok: false, error: 'Documento já está cancelado.' }

  const { error: e } = await op.sb
    .from('documentos_assinatura')
    .update({ status: 'cancelado', cancelado_em: new Date().toISOString(), motivo_cancelamento: motivo?.trim() || null })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'cancelar o documento') }

  revalidatePath(ROTA)
  return { ok: true }
}

export type NovoSignatarioInput = {
  documento_id: string
  nome: string
  email: string
  cpf?: string
  papel_signatario?: string
}

/** Adiciona um signatário ao documento (token gerado; ordem = próxima da fila). */
export async function adicionarSignatario(input: NovoSignatarioInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }

  if (!input.documento_id) return { ok: false, error: 'Documento inválido.' }
  const nome = (input.nome || '').trim()
  const email = (input.email || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome do signatário.' }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Informe um e-mail válido.' }

  // documento precisa existir e ainda aceitar novos signatários (rascunho).
  const { data: doc } = await op.sb.from('documentos_assinatura').select('status').eq('id', input.documento_id).single()
  const dstatus = (doc as { status?: StatusDoc } | null)?.status
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  if (dstatus !== 'rascunho') return { ok: false, error: 'Só é possível adicionar signatários em documentos em rascunho.' }

  // próxima ordem
  const { data: ultimo } = await op.sb
    .from('signatarios_documento')
    .select('ordem')
    .eq('documento_id', input.documento_id)
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle()
  const proximaOrdem = ((ultimo as { ordem?: number } | null)?.ordem ?? 0) + 1

  const token = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '')

  const { error: e } = await op.sb.from('signatarios_documento').insert({
    documento_id: input.documento_id,
    nome,
    email,
    cpf: input.cpf?.replace(/\D/g, '') || null,
    papel_signatario: input.papel_signatario?.trim() || null,
    ordem: proximaOrdem,
    token,
    status: 'pendente',
  })
  if (e) return { ok: false, error: msgErro(e.message, 'adicionar o signatário') }

  revalidatePath(ROTA)
  return { ok: true }
}

/** Remove um signatário (somente enquanto o documento está em rascunho). */
export async function removerSignatario(id: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Signatário inválido.' }

  const { data: sig } = await op.sb
    .from('signatarios_documento')
    .select('documento_id, status')
    .eq('id', id)
    .single()
  const row = sig as { documento_id?: string; status?: string } | null
  if (!row) return { ok: false, error: 'Signatário não encontrado.' }
  if (row.status && !STATUS_SIG.includes(row.status as (typeof STATUS_SIG)[number])) {
    return { ok: false, error: 'Estado do signatário inválido.' }
  }
  if (row.documento_id) {
    const { data: doc } = await op.sb.from('documentos_assinatura').select('status').eq('id', row.documento_id).single()
    if ((doc as { status?: StatusDoc } | null)?.status !== 'rascunho') {
      return { ok: false, error: 'Só é possível remover signatários de documentos em rascunho.' }
    }
  }

  const { error: e } = await op.sb.from('signatarios_documento').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'remover o signatário') }

  revalidatePath(ROTA)
  return { ok: true }
}

// =============================================================================
// NOTIFICAÇÕES EXTRAJUDICIAIS / MODELOS / DOCUMENTOS CONTRATUAIS
// Paridade com o legado (legacy/index.html · bloco "Jurídico" 4896-5009).
// Tabelas novas (scripts/migrations/juridico.sql):
//   juridico_notificacoes / juridico_templates / juridico_documentos
// Integração Financeiro → Jurídico via fin_recebiveis.jur_id.
// =============================================================================

export type R = { ok: boolean; error?: string; id?: string }

const DOC_TIPOS_VALIDOS: DocTipo[] = ['contrato', 'pre', 'cof']

/** Empresa default (1ª — matriz/franqueadora), igual ao Financeiro Franqueadora. */
async function empresaIdJur(sb: SB): Promise<string | null> {
  const { data } = await sb.from('empresas').select('id').order('criada_em', { ascending: true }).limit(1).maybeSingle()
  return (data as { id?: string } | null)?.id ?? null
}

/** Grava 1 linha em audit_log (best-effort — nunca derruba a operação). */
async function auditJur(userId: string, acao: string, label: string, dados: Record<string, unknown>): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId, acao, recurso_id: 'juridico', recurso_label: label,
      dados_depois: dados, origem: 'web', resultado: 'sucesso',
    })
  } catch {
    /* auditoria é secundária */
  }
}

// ───────────── Sincronizar Financeiro → Jurídico (jurSyncFinanceiro 4933) ─────────────
/**
 * Varre os recebíveis em atraso (status 'atrasado' OU dias_atraso>0) que ainda
 * não têm notificação jurídica (fin_recebiveis.jur_id null) e gera uma
 * notificação 'pendente' por recebível, com assunto/corpo montados (jurMontarCorpo
 * + finGerarNotifJuridica). Regra de reincidência: dias>=20 → '2ª Notificação'.
 * Marca fin_recebiveis.jur_id p/ não duplicar. Retorna quantas foram criadas.
 */
export async function sincronizarFinanceiro(): Promise<R & { criadas?: number }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }

  const emp = await empresaIdJur(op.sb)
  if (!emp) return { ok: false, error: 'Empresa não encontrada.' }

  const { data: recRaw, error: eRec } = await op.sb
    .from('fin_recebiveis')
    .select('id, unidade_id, unidade_nome, categoria, competencia, valor, vencimento, status, dias_atraso, jur_id')
    .is('jur_id', null)
    .or('status.eq.atrasado,dias_atraso.gt.0')
    .limit(2000)
  if (eRec) return { ok: false, error: msgErro(eRec.message, 'ler recebíveis do Financeiro') }

  const recs = (recRaw ?? []) as Array<{
    id: string; unidade_id: string | null; unidade_nome: string | null; categoria: string | null
    competencia: string | null; valor: number | null; vencimento: string | null
    status: string; dias_atraso: number | null
  }>
  if (recs.length === 0) return { ok: true, criadas: 0 }

  // CNPJ por unidade (unidades não tem responsável → franqueado vai no fallback).
  const uniIds = [...new Set(recs.map((r) => r.unidade_id).filter(Boolean))] as string[]
  const cnpjPorUni: Record<string, string> = {}
  if (uniIds.length) {
    const { data: unis } = await op.sb.from('unidades').select('id, cnpj').in('id', uniIds)
    for (const u of (unis ?? []) as { id: string; cnpj: string | null }[]) cnpjPorUni[u.id] = u.cnpj || ''
  }

  let criadas = 0
  for (const r of recs) {
    const dias = r.dias_atraso || 0
    const ra: RecebivelAtraso = {
      id: r.id,
      unidade_nome: r.unidade_nome,
      franqueado: null,
      cnpj: r.unidade_id ? (cnpjPorUni[r.unidade_id] || '') : '',
      categoria: r.categoria,
      ref: r.competencia,
      valor: Number(r.valor) || 0,
      vencimento: r.vencimento,
      dias_atraso: dias,
    }
    const { error: eIns } = await op.sb.from('juridico_notificacoes').insert({
      empresa_id: emp,
      unidade_id: r.unidade_id,
      fin_id: r.id,
      unidade_nome: r.unidade_nome || '',
      franqueado: franqueadoNome(null),
      cnpj: ra.cnpj,
      categoria: r.categoria,
      ref: r.competencia,
      valor: ra.valor,
      vencimento: r.vencimento,
      dias_atraso: dias,
      assunto: montarAssunto(ra),
      corpo: montarCorpo(ra),
      status: 'pendente',
      criado_por: op.userId,
    })
    if (eIns) {
      if (/duplicate|unique/i.test(eIns.message)) continue // corrida no índice único de fin_id
      return { ok: false, error: msgErro(eIns.message, 'gerar notificação jurídica') }
    }
    await op.sb.from('fin_recebiveis').update({ jur_id: 'JN' + r.id.slice(0, 8) }).eq('id', r.id)
    await auditJur(op.userId, 'Jurídico · notificação gerada',
      (r.unidade_nome || '') + ' · ' + (r.categoria || '') + ' · ' + ra.valor + ' · ' + dias + 'd',
      { fin_id: r.id, valor: ra.valor, dias })
    criadas++
  }

  revalidatePath(ROTA)
  return { ok: true, criadas }
}

// ───────────── Notificações: salvar ajuste / enviar / descartar ─────────────

/** Salva rascunho (assunto + corpo) sem mudar status (jurSalvarAjuste 4961). */
export async function salvarAjusteNotif(id: string, assunto: string, corpo: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Notificação inválida.' }

  const { data: n } = await op.sb.from('juridico_notificacoes').select('status').eq('id', id).maybeSingle()
  if (!n) return { ok: false, error: 'Notificação não encontrada.' }
  if ((n as { status: string }).status !== 'pendente') return { ok: false, error: 'Só é possível ajustar notificações pendentes.' }

  const { error: e } = await op.sb.from('juridico_notificacoes')
    .update({ assunto: (assunto || '').trim(), corpo: corpo || '' }).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar ajuste') }
  revalidatePath(ROTA)
  return { ok: true }
}

/**
 * Envia a notificação (jurEnviarNotif 4962): salva ajuste, status='enviada',
 * grava data de envio, marca o recebível como notificado (enviado=true) e audita.
 * (Envio de e-mail real ao franqueado é placeholder — sem provedor configurado.)
 */
export async function enviarNotif(id: string, assunto?: string, corpo?: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Notificação inválida.' }

  const { data: nRaw } = await op.sb
    .from('juridico_notificacoes')
    .select('id, status, fin_id, unidade_nome, categoria, valor')
    .eq('id', id).maybeSingle()
  const n = nRaw as { id: string; status: string; fin_id: string | null; unidade_nome: string; categoria: string | null; valor: number } | null
  if (!n) return { ok: false, error: 'Notificação não encontrada.' }
  if (n.status !== 'pendente') return { ok: false, error: 'Notificação já enviada.' }

  const patch: Record<string, unknown> = { status: 'enviada', enviada_em: new Date().toISOString() }
  if (typeof assunto === 'string') patch.assunto = assunto.trim()
  if (typeof corpo === 'string') patch.corpo = corpo

  const { error: e } = await op.sb.from('juridico_notificacoes').update(patch).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'enviar notificação') }

  if (n.fin_id) await op.sb.from('fin_recebiveis').update({ enviado: true }).eq('id', n.fin_id)
  await auditJur(op.userId, 'Jurídico · notificação enviada',
    n.unidade_nome + ' · ' + (n.categoria || '') + ' · ' + n.valor, { id, fin_id: n.fin_id, valor: n.valor })

  revalidatePath(ROTA)
  return { ok: true }
}

/**
 * Descarta a notificação (jurDescartarNotif 4966): remove e desvincula o
 * recebível (jur_id=null) p/ poder ser regerado na próxima sincronização.
 */
export async function descartarNotif(id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Notificação inválida.' }

  const { data: nRaw } = await op.sb.from('juridico_notificacoes').select('fin_id').eq('id', id).maybeSingle()
  const finId = (nRaw as { fin_id: string | null } | null)?.fin_id ?? null

  const { error: e } = await op.sb.from('juridico_notificacoes').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'descartar notificação') }
  if (finId) await op.sb.from('fin_recebiveis').update({ jur_id: null }).eq('id', finId)

  revalidatePath(ROTA)
  return { ok: true }
}

// ───────────── Modelos (jurNewTpl 4995 / onchange 4989 / jurDelTpl 4996) ─────────────

/** Cria um novo modelo em branco (jurNewTpl 4995). */
export async function criarModelo(): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  const emp = await empresaIdJur(op.sb)
  if (!emp) return { ok: false, error: 'Empresa não encontrada.' }

  const { count } = await op.sb.from('juridico_templates').select('id', { count: 'exact', head: true }).eq('empresa_id', emp)
  const { data, error: e } = await op.sb.from('juridico_templates').insert({
    empresa_id: emp, nome: NOVO_TEMPLATE.nome, assunto: NOVO_TEMPLATE.assunto, corpo: NOVO_TEMPLATE.corpo,
    ordem: (count ?? 0) + 1, criado_por: op.userId,
  }).select('id').single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar modelo') }
  revalidatePath(ROTA)
  return { ok: true, id: (data as { id: string }).id }
}

/** Salva edição inline (nome/assunto/corpo) de um modelo (jurModelos onchange). */
export async function salvarModelo(id: string, campos: { nome?: string; assunto?: string; corpo?: string }): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Modelo inválido.' }

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (typeof campos.nome === 'string') patch.nome = campos.nome.trim() || 'Modelo sem nome'
  if (typeof campos.assunto === 'string') patch.assunto = campos.assunto.trim()
  if (typeof campos.corpo === 'string') patch.corpo = campos.corpo

  const { error: e } = await op.sb.from('juridico_templates').update(patch).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar modelo') }
  revalidatePath(ROTA)
  return { ok: true }
}

/** Exclui um modelo (jurDelTpl 4996). */
export async function excluirModelo(id: string): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!id) return { ok: false, error: 'Modelo inválido.' }
  const { error: e } = await op.sb.from('juridico_templates').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir modelo') }
  revalidatePath(ROTA)
  return { ok: true }
}

// ───────────── Documentos contratuais (jurAnexar 4985 / jurRemover 4986) ─────────────

/**
 * Anexa/substitui um documento contratual de uma unidade (jurAnexar 4985).
 * Restrito a PDF. Registra nome do arquivo + data atual. Upsert por (unidade,tipo).
 */
export async function anexarDocumentoContratual(input: {
  unidadeId: string; tipo: DocTipo; arquivo: string; storagePath?: string | null
}): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }

  const unidadeId = (input.unidadeId || '').trim()
  if (!unidadeId) return { ok: false, error: 'Unidade inválida.' }
  if (!DOC_TIPOS_VALIDOS.includes(input.tipo)) return { ok: false, error: 'Tipo de documento inválido.' }
  const arquivo = (input.arquivo || '').trim()
  if (!arquivo) return { ok: false, error: 'Selecione um arquivo PDF.' }
  if (!/\.pdf$/i.test(arquivo)) return { ok: false, error: 'O documento deve ser um PDF.' }

  const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', unidadeId).maybeSingle()
  const emp = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!emp) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const { error: e } = await op.sb.from('juridico_documentos').upsert({
    empresa_id: emp, unidade_id: unidadeId, tipo: input.tipo, arquivo,
    storage_path: input.storagePath || null, data_doc: new Date().toISOString().slice(0, 10), criado_por: op.userId,
  }, { onConflict: 'unidade_id,tipo' })
  if (e) return { ok: false, error: msgErro(e.message, 'anexar documento') }
  revalidatePath(ROTA)
  return { ok: true }
}

/** Remove um documento contratual anexado (jurRemover 4986). */
export async function removerDocumentoContratual(unidadeId: string, tipo: DocTipo): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  if (!unidadeId) return { ok: false, error: 'Unidade inválida.' }
  if (!DOC_TIPOS_VALIDOS.includes(tipo)) return { ok: false, error: 'Tipo de documento inválido.' }
  const { error: e } = await op.sb.from('juridico_documentos').delete().eq('unidade_id', unidadeId).eq('tipo', tipo)
  if (e) return { ok: false, error: msgErro(e.message, 'remover documento') }
  revalidatePath(ROTA)
  return { ok: true }
}

// ───────────── Notificação manual por modelo (openJurNotif 4998 / jurEnviar 5008) ─────────────
/**
 * Envia notificação manual a partir de um modelo já mesclado (jurEnviar 5008).
 * Persiste como notificação 'enviada' avulsa (sem vínculo a recebível).
 */
export async function enviarNotifManual(input: {
  unidadeId: string; unidadeNome: string; assunto: string; corpo: string
}): Promise<R> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  const semPermissao = exigeAdmin(op.papel)
  if (semPermissao) return { ok: false, error: semPermissao }
  const emp = await empresaIdJur(op.sb)
  if (!emp) return { ok: false, error: 'Empresa não encontrada.' }

  const assunto = (input.assunto || '').trim()
  const corpo = input.corpo || ''
  if (!assunto && !corpo) return { ok: false, error: 'Preencha o assunto ou o corpo da notificação.' }

  const { data: uni } = await op.sb.from('unidades').select('cnpj').eq('id', input.unidadeId).maybeSingle()
  const cnpj = (uni as { cnpj?: string | null } | null)?.cnpj ?? ''

  const { error: e } = await op.sb.from('juridico_notificacoes').insert({
    empresa_id: emp, unidade_id: input.unidadeId || null, fin_id: null,
    unidade_nome: input.unidadeNome || '', franqueado: franqueadoNome(null), cnpj,
    categoria: 'Notificação manual', valor: 0, dias_atraso: 0,
    assunto, corpo, status: 'enviada', enviada_em: new Date().toISOString(), criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e.message, 'enviar notificação') }
  await auditJur(op.userId, 'Jurídico · notificação enviada', (input.unidadeNome || '') + ' · manual', { assunto })
  revalidatePath(ROTA)
  return { ok: true }
}
