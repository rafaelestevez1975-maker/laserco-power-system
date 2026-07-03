'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'
import {
  TIPOS_CAMPO_IDS,
  TIPOS_DOCUMENTO,
  PREENCHIMENTOS,
  STATUS_DOC,
  type Secao,
  type StatusDoc,
} from '@/lib/anamnese'

/**
 * Documentos / Anamnese Digital  paridade com o legado (DOCS_LIST / DOC_MODELS /
 * docsRows / openDocEditor / renderDocEditor / docSave / docInativar).
 * Construtor de documentos clínicos: metadados + seções/perguntas (8 tipos) +
 * flags obrig./inviabiliza + unidades com acesso + acumulativo. Catálogo por EMPRESA.
 * RBAC: admin_geral / gestor. Tabela `documentos`.
 */
export type ActionResult = { ok: boolean; error?: string; id?: string }

const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

type Op = NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>

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

async function audit(userId: string, acao: string, label: string): Promise<void> {
  try {
    await adminClient().from('audit_log').insert({
      usuario_id: userId, acao, recurso_id: 'anamnese', recurso_label: label, origem: 'web', resultado: 'sucesso',
    })
  } catch { /* auditoria é secundária */ }
}

export type DocumentoInput = {
  nome: string
  tipo: string
  descricao?: string | null
  preenchimento: string
  obrigatorio: boolean
  status: StatusDoc
  acumulativo: boolean
  unidades_ids: string[] // [] = todas as unidades da rede
  secoes: Secao[]
}

/** Saneia/valida o construtor antes de persistir. Retorna { secoes } limpo ou erro. */
function sanearSecoes(raw: Secao[]): { secoes: Secao[]; erro?: string } {
  if (!Array.isArray(raw)) return { secoes: [], erro: 'Estrutura de seções inválida.' }
  const secoes: Secao[] = []
  for (const s of raw) {
    const titulo = String(s?.titulo ?? '').trim()
    const campos = Array.isArray(s?.campos) ? s.campos : []
    const limpos = campos
      .map((c) => {
        const t = String(c?.t ?? 'simnao')
        return {
          q: String(c?.q ?? '').trim(),
          t: (TIPOS_CAMPO_IDS.includes(t as never) ? t : 'simnao') as Secao['campos'][number]['t'],
          obr: !!c?.obr,
          inv: !!c?.inv,
        }
      })
      .filter((c) => c.q) // descarta perguntas em branco
    // mantém a seção mesmo sem campos se tiver título (igual ao construtor do legado)
    if (titulo || limpos.length) secoes.push({ titulo, campos: limpos })
  }
  return { secoes }
}

function validar(input: DocumentoInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do documento.'
  if (nome.length < 2) return 'Nome muito curto.'
  if (!TIPOS_DOCUMENTO.includes(input.tipo as never)) return 'Tipo de documento inválido.'
  if (!PREENCHIMENTOS.includes(input.preenchimento as never)) return 'Preenchimento inválido.'
  if (!STATUS_DOC.includes(input.status)) return 'Status inválido.'
  return null
}

function payload(input: DocumentoInput) {
  const { secoes } = sanearSecoes(input.secoes)
  // unidades_ids vazio = todas as unidades (NULL no banco para diferenciar).
  const unidades = (input.unidades_ids ?? []).filter(Boolean)
  return {
    nome: (input.nome || '').trim(),
    tipo: input.tipo,
    descricao: (input.descricao || '').trim() || null,
    preenchimento: input.preenchimento,
    obrigatorio: !!input.obrigatorio,
    status: input.status,
    acumulativo: !!input.acumulativo,
    unidades_ids: unidades.length ? unidades : null,
    secoes,
    atualizado_em: new Date().toISOString(),
  }
}

export async function criarDocumento(input: DocumentoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para criar documentos.' }
  const v = validar(input)
  if (v) return { ok: false, error: v }

  const empresa_id = await resolverEmpresaId(op)
  const { data, error: e } = await op.sb
    .from('documentos')
    .insert({ empresa_id, ...payload(input) })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e.message, 'criar documento') }
  await audit(op.userId, 'Criou', input.nome)
  revalidatePath('/cadastros/anamnese')
  return { ok: true, id: (data as { id: string }).id }
}

export async function salvarDocumento(id: string, input: DocumentoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para editar documentos.' }
  if (!id) return { ok: false, error: 'Documento inválido.' }
  const v = validar(input)
  if (v) return { ok: false, error: v }

  const { error: e } = await op.sb.from('documentos').update(payload(input)).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar documento') }
  await audit(op.userId, 'Editou', input.nome)
  revalidatePath('/cadastros/anamnese')
  return { ok: true }
}

/** Toggle de status Ativo<->Inativo (docsRows do legado: alterna e re-renderiza). */
export async function toggleDocumentoStatus(id: string, ativar: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para alterar documentos.' }
  if (!id) return { ok: false, error: 'Documento inválido.' }

  const novo: StatusDoc = ativar ? 'Ativo' : 'Inativo'
  const { error: e } = await op.sb
    .from('documentos')
    .update({ status: novo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativar ? 'ativar documento' : 'inativar documento') }
  await audit(op.userId, ativar ? 'Ativou' : 'Inativou', id)
  revalidatePath('/cadastros/anamnese')
  return { ok: true }
}
