'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { QUANDO_EMITIDO, ARQ_MIME_OK, type QuandoEmitido } from '@/lib/contratos'

export type ActionResult = { ok: boolean; error?: string; id?: string }

const BUCKET = 'contratos'

/**
 * Modelos de contrato — paridade com o legado (buildContratos / openContratoEditor /
 * contSalvar / contInativar). Catálogo por EMPRESA. RBAC: admin_geral / gestor.
 * Tabela `contratos_modelo` (migration scripts/migrations/categorias.sql):
 *   id, empresa_id, nome, quando_emitido, enviar_email, todas_unidades, titulo,
 *   termos, arquivo_nome, arquivo_path, ativo, ordem, criado_por.
 */
const PAPEIS_ESCRITA = ['gestor']

function podeEscrever(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_ESCRITA.includes(papel || '')
}

type Op = NonNullable<Awaited<ReturnType<typeof requireOperador>>['op']>

/** Resolve a empresa do operador (catálogo de contratos é por empresa). */
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

export type ContratoInput = {
  nome: string
  quando_emitido: string
  enviar_email: boolean
  todas_unidades: boolean
  titulo?: string | null
  termos?: string | null
  // Anexo: o cliente manda um data URI base64 (input file -> FileReader). Opcional.
  arquivo_data?: string | null // 'data:<mime>;base64,...'
  arquivo_nome?: string | null
}

function validar(input: ContratoInput): string | null {
  const nome = (input.nome || '').trim()
  if (!nome) return 'Informe o nome do modelo.'
  if (nome.length < 3) return 'Nome do modelo muito curto.'
  if (nome.length > 200) return 'Nome do modelo muito longo (máx. 200).'
  if (!QUANDO_EMITIDO.includes(input.quando_emitido as QuandoEmitido)) return 'Selecione quando o contrato é emitido.'
  const termos = (input.termos || '').trim()
  if (!termos) return 'Os termos do contrato são obrigatórios.'
  return null
}

/** Sobe o anexo (data URI) no bucket privado 'contratos' e devolve {path, nome}. */
async function subirArquivo(dataUri: string, nomeOriginal: string | null): Promise<{ path: string; nome: string } | { erro: string }> {
  const m = dataUri.match(/^data:([^;]+);base64,([\s\S]*)$/)
  if (!m) return { erro: 'Arquivo inválido.' }
  const mime = m[1] || 'application/octet-stream'
  if (!ARQ_MIME_OK.includes(mime)) return { erro: 'Arquivo deve ser PDF, DOC ou DOCX.' }
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.byteLength === 0) return { erro: 'Arquivo vazio.' }
  if (bytes.byteLength > 10 * 1024 * 1024) return { erro: 'Arquivo muito grande (máx. 10 MB).' }
  const ext = mime.includes('pdf') ? 'pdf' : mime.includes('wordprocessingml') ? 'docx' : 'doc'
  const path = `modelos/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
  const sb = adminClient()
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
  if (error) return { erro: 'Falha ao anexar arquivo: ' + error.message }
  return { path, nome: (nomeOriginal || '').trim() || `contrato.${ext}` }
}

async function montarPayload(input: ContratoInput): Promise<Record<string, unknown> | { erro: string }> {
  const base: Record<string, unknown> = {
    nome: (input.nome || '').trim(),
    quando_emitido: input.quando_emitido,
    enviar_email: input.enviar_email !== false,
    todas_unidades: input.todas_unidades !== false,
    titulo: (input.titulo || '').trim() || null,
    termos: (input.termos || '').trim() || null,
    atualizado_em: new Date().toISOString(),
  }
  if (input.arquivo_data) {
    const up = await subirArquivo(input.arquivo_data, input.arquivo_nome ?? null)
    if ('erro' in up) return { erro: up.erro }
    base.arquivo_path = up.path
    base.arquivo_nome = up.nome
  }
  return base
}

/** Cria um modelo de contrato (botão "Novo"). RBAC: gestor/admin. */
export async function criarContrato(input: ContratoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir modelos de contrato.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const payload = await montarPayload(input)
  if ('erro' in payload) return { ok: false, error: payload.erro as string }

  const empresa_id = await resolverEmpresaId(op)
  const { data, error: e } = await op.sb
    .from('contratos_modelo')
    .insert({ empresa_id, criado_por: op.userId, ativo: true, ...payload })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'criar modelo de contrato') }
  revalidatePath('/cadastros/contratos')
  return { ok: true, id: (data as { id: string }).id }
}

/** Edita um modelo de contrato (editor view-contrato-editor / contSalvar). */
export async function salvarContrato(id: string, input: ContratoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir modelos de contrato.' }
  if (!id) return { ok: false, error: 'Modelo inválido.' }

  const v = validar(input)
  if (v) return { ok: false, error: v }

  const payload = await montarPayload(input)
  if ('erro' in payload) return { ok: false, error: payload.erro as string }

  const { error: e } = await op.sb.from('contratos_modelo').update(payload).eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar modelo de contrato') }
  revalidatePath('/cadastros/contratos')
  return { ok: true }
}

/** Ativa/inativa um modelo de contrato (botão "Inativar" do editor / contInativar). */
export async function alternarAtivoContrato(id: string, ativo: boolean): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEscrever(op.papel)) return { ok: false, error: 'Você não tem permissão para gerir modelos de contrato.' }
  if (!id) return { ok: false, error: 'Modelo inválido.' }

  const { error: e } = await op.sb
    .from('contratos_modelo')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e.message, ativo ? 'ativar modelo' : 'inativar modelo') }
  revalidatePath('/cadastros/contratos')
  return { ok: true }
}

/** Gera uma URL assinada (curta) para baixar/ver o arquivo anexado do modelo. */
export async function urlArquivoContrato(id: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!id) return { ok: false, error: 'Modelo inválido.' }

  const { data: row } = await op.sb.from('contratos_modelo').select('arquivo_path').eq('id', id).maybeSingle()
  const path = (row as { arquivo_path?: string | null } | null)?.arquivo_path ?? null
  if (!path) return { ok: false, error: 'Este modelo não tem arquivo anexado.' }

  const sb = adminClient()
  const { data, error: e } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 5)
  if (e || !data?.signedUrl) return { ok: false, error: 'Não foi possível gerar o link do arquivo.' }
  return { ok: true, url: data.signedUrl }
}
