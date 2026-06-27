'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { TIPOS_PAGAMENTO, ehRecorrente, type TipoForma } from '@/lib/catalogo'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/**
 * Formas de pagamento — paridade com o legado (buildPgto / PGTO / pgForm / pgSaveForm).
 * Catálogo por EMPRESA (sem escopo de unidade). RBAC: admin_geral / gestor / financeiro.
 * Tabela `formas_pagamento` (migration scripts/migrations/catalogo.sql):
 *   id, empresa_id, nome, tipo, taxa, taxa_comissao, ativo, ordem,
 *   rec_modo, rec_parceiro, rec_token, rec_max_parc, rec_min_parcela, rec_base_royalties.
 */
const PAPEIS_ESCRITA = ['gestor', 'financeiro']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

export type FormaInput = {
  nome: string
  tipo: TipoForma
  taxa?: number | null
  taxa_comissao?: number | null
  ativo?: boolean
  // Bloco PagoLivre (só usado quando tipo = 'Crédito Recorrente')
  rec_modo?: 'Integrado' | 'Manual'
  rec_token?: string | null
  rec_max_parc?: number | null
  rec_min_parcela?: number | null
  rec_base_royalties?: 'recorrencia' | 'venda'
}

type Op = NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>

/** Resolve a empresa do operador (config da rede é por empresa). */
async function resolverEmpresaId(op: Op): Promise<string | null> {
  const { sb, userId } = op
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

/** Validação por campo (criar/editar). Retorna msg de erro ou null. */
function validar(input: FormaInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome da forma de pagamento.'
  if (nome.length < 2) return 'Nome muito curto.'
  if (!TIPOS_PAGAMENTO.includes(input.tipo)) return 'Tipo de pagamento inválido.'

  const checarPct = (v: number | null | undefined, rotulo: string): string | null => {
    if (v == null) return null
    if (!Number.isFinite(v)) return `${rotulo} inválida.`
    if (v < 0 || v > 100) return `${rotulo} deve estar entre 0% e 100%.`
    return null
  }
  const eTaxa = checarPct(input.taxa, 'Taxa')
  if (eTaxa) return eTaxa
  const eTaxaC = checarPct(input.taxa_comissao, 'Taxa a descontar na comissão')
  if (eTaxaC) return eTaxaC

  // Bloco PagoLivre — só validamos quando é recorrente
  if (ehRecorrente(nome, input.tipo)) {
    if (input.rec_max_parc != null) {
      const m = Number(input.rec_max_parc)
      if (!Number.isInteger(m) || m < 1 || m > 12) return 'Parcelamento máximo deve estar entre 1 e 12x.'
    }
    if (input.rec_min_parcela != null) {
      const mp = Number(input.rec_min_parcela)
      if (!Number.isFinite(mp) || mp < 0) return 'Valor mínimo por parcela inválido.'
    }
  }
  return null
}

/** Monta o payload normalizado (zera bloco recorrente quando não se aplica). */
function payload(input: FormaInput) {
  const nome = (input.nome || '').trim()
  const rec = ehRecorrente(nome, input.tipo)
  return {
    nome,
    tipo: input.tipo,
    taxa: input.taxa != null ? input.taxa : 0,
    taxa_comissao: input.taxa_comissao != null ? input.taxa_comissao : 0,
    ativo: input.ativo !== false,
    rec_modo: rec ? input.rec_modo ?? 'Integrado' : 'Integrado',
    rec_parceiro: 'PagoLivre',
    rec_token: rec ? (input.rec_token || '').trim() || null : null,
    rec_max_parc: rec ? Math.min(12, Math.max(1, Number(input.rec_max_parc) || 12)) : 12,
    rec_min_parcela: rec ? (input.rec_min_parcela != null ? input.rec_min_parcela : 50) : 50,
    rec_base_royalties: rec ? input.rec_base_royalties ?? 'recorrencia' : 'recorrencia',
    atualizado_em: new Date().toISOString(),
  }
}

export async function criarForma(input: FormaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para cadastrar formas de pagamento.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const empresa_id = await resolverEmpresaId(op)
  const { data, error: e } = await op.sb
    .from('formas_pagamento')
    .insert({ empresa_id, ...payload(input) })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'cadastrar forma de pagamento') }
  revalidatePath('/cadastros/formas-pagamento')
  return { ok: true, id: (data as { id: string }).id }
}

export async function salvarForma(id: string, input: FormaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar formas de pagamento.' }
  if (!id) return { ok: false, error: 'Forma inválida.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { error: e } = await op.sb.from('formas_pagamento').update(payload(input)).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar forma de pagamento') }
  revalidatePath('/cadastros/formas-pagamento')
  return { ok: true }
}

export async function toggleFormaAtiva(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar formas de pagamento.' }
  if (!id) return { ok: false, error: 'Forma inválida.' }

  const { error: e } = await op.sb
    .from('formas_pagamento')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)

  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar forma' : 'inativar forma') }
  revalidatePath('/cadastros/formas-pagamento')
  return { ok: true }
}

// NOTA (legado pgSyncAdquirente): a sincronização que gera contas a pagar de MDR a partir das
// taxas médias dos cartões ativos × volume de vendas por unidade é gap ⚪ de outro módulo
// (financeiro da franqueadora). Aqui só persistimos as taxas que alimentam esse cálculo.
