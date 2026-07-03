'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'
import type { NfsePolitica } from '@/lib/nfse'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * NOTAS FISCAIS (NFS-e)  backend lkii (migration scripts/migrations/nfse.sql):
 *   nfse_politica(empresa_id, politica[nenhuma|venda|execucao], por_sessao)
 *   nfse_config_unidade(empresa_id, unidade_id, provedor, aliquota_iss,
 *     inscricao_municipal, certificado_token, ambiente, status_conexao)
 *   nfse(empresa_id, unidade_id, cliente_id, numero, competencia, tipo,
 *     fato_gerador, cliente_nome, valor, status, xml)
 *
 * EMISSÃO FISCAL REAL fica como TODO (integração com provedores municipais).
 * Aqui só registramos/listamos notas e administramos política/config.
 *
 * RBAC (espelha o legado, PERMISSOES L7249  "Notas fiscais", 9 ações):
 *   configurar política / integração / emitir / cancelar / reprocessar /
 *   alterar status manual = admin_geral / gestor / financeiro.
 */
const PAPEIS_FISCAIS = ['gestor', 'financeiro']

function podeAdministrar(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_FISCAIS.includes(papel || '')
}

const POLITICAS: NfsePolitica[] = ['nenhuma', 'venda', 'execucao']
const STATUS_VALIDOS = ['autorizada', 'cancelada', 'processando', 'erro']
const TIPOS_VALIDOS = ['nfse', 'nfe']
const FATO_VALIDO = ['venda', 'sessao']

/** Resolve a empresa do operador via perfil → unidade. */
async function empresaDoOperador(sb: SB, userId: string): Promise<string | null> {
  const { data: perfil } = await sb.from('perfis_usuario').select('unidade_id').eq('id', userId).maybeSingle()
  const uniId = (perfil as { unidade_id?: string | null } | null)?.unidade_id
  if (!uniId) return null
  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', uniId).maybeSingle()
  return (uni as { empresa_id?: string } | null)?.empresa_id ?? null
}

/** Empresa de uma unidade específica (usada nas escritas escopadas por unidade). */
async function empresaDaUnidade(sb: SB, unidadeId: string): Promise<string | null> {
  const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).maybeSingle()
  return (uni as { empresa_id?: string } | null)?.empresa_id ?? null
}

/** Grava 1 linha em audit_log (best-effort  nunca derruba a operação). */
async function audit(userId: string, acao: string, label: string, dados: Record<string, unknown>): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId,
      acao,
      recurso_id: 'notas',
      recurso_label: label,
      dados_depois: dados,
      origem: 'web',
      resultado: 'sucesso',
    })
  } catch {
    /* auditoria é secundária */
  }
}

// ────────────────────────── Política de emissão da rede ──────────────────────────

/**
 * Define a política de emissão da rede (legado nfseSetPolicy L8497) e registra
 * em audit_log a mudança. Upsert por empresa.
 */
export async function definirPolitica(politica: NfsePolitica): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeAdministrar(op.papel)) return { ok: false, error: 'Você não tem permissão para configurar a política de emissão.' }
  if (!POLITICAS.includes(politica)) return { ok: false, error: 'Política inválida.' }

  const empresaId = await empresaDoOperador(op.sb, op.userId)
  if (!empresaId) return { ok: false, error: 'Usuário sem empresa vinculada.' }

  const { error: e } = await op.sb
    .from('nfse_politica')
    .upsert({ empresa_id: empresaId, politica, atualizado_em: new Date().toISOString(), criado_por: op.userId }, { onConflict: 'empresa_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'salvar a política de emissão') }

  const rotulo = { nenhuma: 'Não emitir', venda: 'Emitir na venda', execucao: 'Emitir na execução' }[politica]
  await audit(op.userId, 'nfse.politica', `NFS-e · política de emissão → ${rotulo}`, { politica })
  revalidatePath('/notas')
  return { ok: true }
}

/** Alterna "Calcular por sessão" (legado nfseTogglePorSessao L8498). Upsert por empresa. */
export async function definirPorSessao(porSessao: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeAdministrar(op.papel)) return { ok: false, error: 'Você não tem permissão para configurar a emissão por sessão.' }

  const empresaId = await empresaDoOperador(op.sb, op.userId)
  if (!empresaId) return { ok: false, error: 'Usuário sem empresa vinculada.' }

  const { error: e } = await op.sb
    .from('nfse_politica')
    .upsert({ empresa_id: empresaId, por_sessao: porSessao, atualizado_em: new Date().toISOString(), criado_por: op.userId }, { onConflict: 'empresa_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'salvar a configuração por sessão') }

  await audit(op.userId, 'nfse.por_sessao', `NFS-e · calcular por sessão → ${porSessao ? 'ligado' : 'desligado'}`, { porSessao })
  revalidatePath('/notas')
  return { ok: true }
}

// ───────────────────────── Configuração da prefeitura por unidade ─────────────────────────

export type ConfigUnidadeInput = {
  unidadeId: string
  provedor?: string | null
  aliquotaIss?: number | null
  inscricaoMunicipal?: string | null
  certificadoToken?: string | null
  ambiente?: string | null
  conectar?: boolean // marca status_conexao = 'conectada'
}

/**
 * Conecta/gerencia a prefeitura de uma unidade (legado nfseConfigUnidade L8501):
 * inscrição municipal, certificado/token e ambiente. Upsert por unidade.
 */
export async function salvarConfigUnidade(input: ConfigUnidadeInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeAdministrar(op.papel)) return { ok: false, error: 'Você não tem permissão para configurar a integração com a prefeitura.' }

  const unidadeId = (input.unidadeId || '').trim()
  if (!unidadeId) return { ok: false, error: 'Unidade inválida.' }

  const empresaId = await empresaDaUnidade(op.sb, unidadeId)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const ambiente = input.ambiente === 'homologacao' ? 'homologacao' : 'producao'
  const patch: Record<string, unknown> = {
    empresa_id: empresaId,
    unidade_id: unidadeId,
    ambiente,
    atualizado_em: new Date().toISOString(),
    criado_por: op.userId,
  }
  if (input.provedor !== undefined) patch.provedor = (input.provedor || '').trim() || null
  if (input.aliquotaIss !== undefined && input.aliquotaIss !== null) patch.aliquota_iss = input.aliquotaIss
  if (input.inscricaoMunicipal !== undefined) patch.inscricao_municipal = (input.inscricaoMunicipal || '').trim() || null
  if (input.certificadoToken !== undefined) patch.certificado_token = (input.certificadoToken || '').trim() || null
  // Considera conectada se marcou o botão Conectar OU informou inscrição + token.
  const temCredenciais = !!(patch.inscricao_municipal && patch.certificado_token)
  if (input.conectar || temCredenciais) patch.status_conexao = 'conectada'

  const { error: e } = await op.sb.from('nfse_config_unidade').upsert(patch, { onConflict: 'unidade_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'salvar a configuração da prefeitura') }

  await audit(op.userId, 'nfse.config_unidade', 'NFS-e · integração com prefeitura', { unidadeId, ambiente })
  revalidatePath('/notas')
  return { ok: true }
}

// ─────────────────────────────── Emitir NFS-e manual ───────────────────────────────

export type EmitirInput = {
  unidadeId: string
  clienteId?: string | null
  clienteNome?: string | null
  competencia?: string | null // 'YYYY-MM'
  tipo?: string | null // nfse | nfe
  fatoGerador?: string | null // venda | sessao
  valor: number
  observacao?: string | null
}

/**
 * Emissão MANUAL de NFS-e (legado: botão "Emitir NFS-e manual" no cabeçalho de
 * Notas emitidas, emitidasCard L8529). A emissão fiscal real (integração com a
 * prefeitura) fica como TODO  aqui registramos a nota como 'processando'.
 */
export async function emitirManual(input: EmitirInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeAdministrar(op.papel)) return { ok: false, error: 'Você não tem permissão para emitir NFS-e.' }

  const unidadeId = (input.unidadeId || '').trim()
  if (!unidadeId) return { ok: false, error: 'Selecione uma unidade para emitir a nota.' }
  const valor = Number(input.valor) || 0
  if (valor <= 0) return { ok: false, error: 'Informe um valor maior que zero.' }

  const empresaId = await empresaDaUnidade(op.sb, unidadeId)
  if (!empresaId) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const tipo = TIPOS_VALIDOS.includes((input.tipo || '').toLowerCase()) ? input.tipo!.toLowerCase() : 'nfse'
  const fato = FATO_VALIDO.includes((input.fatoGerador || '').toLowerCase()) ? input.fatoGerador!.toLowerCase() : 'venda'
  const competencia = (input.competencia || '').trim() || new Date().toISOString().slice(0, 7)

  let clienteNome = (input.clienteNome || '').trim() || null
  const clienteId = (input.clienteId || '').trim() || null
  if (clienteId && !clienteNome) {
    const { data: cli } = await op.sb.from('clientes').select('nome').eq('id', clienteId).maybeSingle()
    clienteNome = (cli as { nome?: string } | null)?.nome ?? null
  }

  const { data, error: e } = await op.sb
    .from('nfse')
    .insert({
      empresa_id: empresaId,
      unidade_id: unidadeId,
      cliente_id: clienteId,
      cliente_nome: clienteNome,
      competencia,
      tipo,
      fato_gerador: fato,
      valor,
      status: 'processando',
      observacao: (input.observacao || '').trim() || null,
      criado_por: op.userId,
    })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'emitir NFS-e') }
  await audit(op.userId, 'nfse.emitir', `NFS-e manual · ${clienteNome || 'sem cliente'}`, { valor, tipo, competencia })
  revalidatePath('/notas')
  return { ok: true, id: (data as { id: string }).id }
}

// ─────────────────── Ações de NF (alçada de operações, legado L7249) ───────────────────

/**
 * Altera o status de uma nota. Cobre as 9 ações da permissão de NF:
 * cancelar (status='cancelada'), reprocessar/atualizar (status='processando'),
 * alterar status manual quando NF com erro (status livre dentre os válidos).
 */
export async function alterarStatusNota(notaId: string, status: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeAdministrar(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar notas.' }
  if (!notaId) return { ok: false, error: 'Nota inválida.' }
  if (!STATUS_VALIDOS.includes(status)) return { ok: false, error: 'Status inválido.' }

  const { error: e } = await op.sb
    .from('nfse')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('id', notaId)
  if (e) return { ok: false, error: msgErro(e.message, 'alterar a nota') }

  await audit(op.userId, 'nfse.status', `NFS-e · status → ${status}`, { notaId, status })
  revalidatePath('/notas')
  return { ok: true }
}
