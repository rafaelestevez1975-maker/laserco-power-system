'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'
import { discoExt } from '@/lib/marketing'

/**
 * DISCO VIRTUAL  Drive da rede (paridade legado buildDisco ~9417).
 * Tabelas (migration scripts/migrations/marketing.sql):
 *   disco_config (vínculo Google Drive), disco_pastas (hierárquicas), disco_arquivos.
 * Storage: bucket PRIVADO 'disco-virtual' (arquivo_path -> objeto). Download via signed URL.
 * RBAC (legado): leitura/download p/ todos; criar pasta/upload/excluir/Drive só admin.
 */

export type ActionResult = { ok: boolean; error?: string; id?: string }
const BUCKET = 'disco-virtual'

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

/** Nome de exibição do operador (legado _discoUser). */
function nomeOperador(nome: string): string {
  return (nome || '').trim() || 'Administração'
}

// ─────────────── Pastas (discoNovaPasta 9408 / discoExcluirPasta 9412) ───────────────

/** Cria pasta na pasta atual (parent). Só admin (legado 9408). */
export async function novaPasta(input: { nome: string; parentId?: string | null }): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores criam pastas.' }

  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da pasta.' }
  if (nome.length > 120) return { ok: false, error: 'Nome muito longo (máx. 120).' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  // Se o Drive está vinculado, marca a pasta como replicada (legado: drive=DISCO_CFG.driveLinked).
  const { data: cfg } = await op.sb.from('disco_config').select('drive_linked').eq('empresa_id', empresa_id).maybeSingle()
  const drive = !!(cfg as { drive_linked?: boolean } | null)?.drive_linked

  const { data, error: e } = await op.sb
    .from('disco_pastas')
    .insert({ empresa_id, parent_id: (input.parentId || '').trim() || null, nome, por: nomeOperador(op.nome), drive, criado_por: op.userId })
    .select('id')
    .single()

  if (e) return { ok: false, error: msgErro(e.message, 'criar pasta') }
  revalidatePath('/disco')
  return { ok: true, id: (data as { id: string }).id }
}

/** Exclui pasta + conteúdo (CASCADE no DB cobre subpastas e arquivos). Só admin (legado 9412). */
export async function excluirPasta(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores podem excluir.' }
  if (!id) return { ok: false, error: 'Pasta inválida.' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  // Apaga os objetos do storage de todos os arquivos sob a pasta (incl. subpastas).
  // Coleta recursiva dos ids de pasta.
  const { data: todasPastas } = await op.sb.from('disco_pastas').select('id, parent_id').eq('empresa_id', empresa_id)
  const filhos = new Map<string | null, string[]>()
  for (const p of (todasPastas ?? []) as { id: string; parent_id: string | null }[]) {
    const k = p.parent_id ?? null
    if (!filhos.has(k)) filhos.set(k, [])
    filhos.get(k)!.push(p.id)
  }
  const alvo: string[] = [id]
  for (let i = 0; i < alvo.length; i++) (filhos.get(alvo[i]) ?? []).forEach((c) => alvo.push(c))

  const { data: arqs } = await op.sb.from('disco_arquivos').select('arquivo_path').in('pasta_id', alvo)
  const paths = ((arqs ?? []) as { arquivo_path: string | null }[]).map((a) => a.arquivo_path).filter(Boolean) as string[]
  if (paths.length) { try { await adminClient().storage.from(BUCKET).remove(paths) } catch { /* ignore */ } }

  const { error: e } = await op.sb.from('disco_pastas').delete().eq('id', id).eq('empresa_id', empresa_id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir pasta') }
  revalidatePath('/disco')
  return { ok: true }
}

// ─────────────── Arquivos (discoUpload 9409 / discoBaixar 9410 / discoExcluirArq 9411) ───────────────

export type UploadInput = {
  pastaId?: string | null
  arquivo_data: string // data URI 'data:<mime>;base64,...'
  arquivo_nome: string
}

/** Sobe 1 arquivo (data URI) no bucket e cria o registro. Só admin (legado 9409). */
export async function uploadArquivo(input: UploadInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores podem enviar arquivos.' }

  const nome = (input.arquivo_nome || '').trim()
  if (!nome) return { ok: false, error: 'Arquivo sem nome.' }
  const m = (input.arquivo_data || '').match(/^data:([^;]+);base64,([\s\S]*)$/)
  if (!m) return { ok: false, error: 'Arquivo inválido.' }
  const mime = m[1] || 'application/octet-stream'
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.byteLength === 0) return { ok: false, error: 'Arquivo vazio.' }
  if (bytes.byteLength > 25 * 1024 * 1024) return { ok: false, error: 'Arquivo muito grande (máx. 25 MB).' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { data: cfg } = await op.sb.from('disco_config').select('drive_linked').eq('empresa_id', empresa_id).maybeSingle()
  const drive = !!(cfg as { drive_linked?: boolean } | null)?.drive_linked

  const ext = (nome.split('.').pop() || 'bin').toLowerCase()
  const path = `${empresa_id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`
  const sbAdmin = adminClient()
  const { error: upErr } = await sbAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
  if (upErr) return { ok: false, error: 'Falha ao enviar arquivo: ' + upErr.message }

  const { data, error: e } = await op.sb
    .from('disco_arquivos')
    .insert({
      empresa_id, pasta_id: (input.pastaId || '').trim() || null,
      nome, tipo: discoExt(nome), bytes: bytes.byteLength, arquivo_path: path,
      por: nomeOperador(op.nome), drive, criado_por: op.userId,
    })
    .select('id')
    .single()

  if (e) { try { await sbAdmin.storage.from(BUCKET).remove([path]) } catch { /* ignore */ }; return { ok: false, error: msgErro(e.message, 'registrar arquivo') } }
  revalidatePath('/disco')
  return { ok: true, id: (data as { id: string }).id }
}

/** Gera URL assinada (curta) para baixar/ver o arquivo (legado discoBaixar 9410). Todos podem. */
export async function urlArquivo(id: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!id) return { ok: false, error: 'Arquivo inválido.' }

  const { data: row } = await op.sb.from('disco_arquivos').select('arquivo_path').eq('id', id).maybeSingle()
  const path = (row as { arquivo_path?: string | null } | null)?.arquivo_path ?? null
  if (!path) return { ok: false, error: 'Arquivo de exemplo  disponível na nuvem da rede.' }

  const { data, error: e } = await adminClient().storage.from(BUCKET).createSignedUrl(path, 60 * 5)
  if (e || !data?.signedUrl) return { ok: false, error: 'Não foi possível gerar o link do arquivo.' }
  return { ok: true, url: data.signedUrl }
}

/** Exclui um arquivo (storage + registro). Só admin (legado discoExcluirArq 9411). */
export async function excluirArquivo(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores podem excluir.' }
  if (!id) return { ok: false, error: 'Arquivo inválido.' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { data: row } = await op.sb.from('disco_arquivos').select('arquivo_path').eq('id', id).eq('empresa_id', empresa_id).maybeSingle()
  const path = (row as { arquivo_path?: string | null } | null)?.arquivo_path ?? null
  if (path) { try { await adminClient().storage.from(BUCKET).remove([path]) } catch { /* ignore */ } }

  const { error: e } = await op.sb.from('disco_arquivos').delete().eq('id', id).eq('empresa_id', empresa_id)
  if (e) return { ok: false, error: msgErro(e.message, 'excluir arquivo') }
  revalidatePath('/disco')
  return { ok: true }
}

// ─────────────── Google Drive (discoVincularDrive 9413 / discoDesvincular 9414 / discoImportarDrive 9415) ───────────────

/** Vincula uma pasta do Google Drive como raiz. Valida link drive.google.com. Só admin. */
export async function vincularDrive(driveUrl: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores vinculam o Google Drive.' }

  const url = (driveUrl || '').trim()
  if (!/drive\.google\.com/.test(url)) return { ok: false, error: 'Link inválido  use um link do Google Drive.' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { error: e } = await op.sb
    .from('disco_config')
    .upsert({ empresa_id, drive_linked: true, drive_url: url, atualizado_em: new Date().toISOString() }, { onConflict: 'empresa_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'vincular Google Drive') }
  revalidatePath('/disco')
  return { ok: true }
}

/** Desvincula o Google Drive (pastas locais permanecem). Só admin (legado 9414). */
export async function desvincularDrive(): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores podem desvincular.' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { error: e } = await op.sb
    .from('disco_config')
    .upsert({ empresa_id, drive_linked: false, atualizado_em: new Date().toISOString() }, { onConflict: 'empresa_id' })
  if (e) return { ok: false, error: msgErro(e.message, 'desvincular Google Drive') }
  revalidatePath('/disco')
  return { ok: true }
}

/** Importa as pastas padrão do Drive na raiz (legado discoImportarDrive 9415). Só admin. */
export async function importarDrive(): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas administradores podem importar.' }

  const empresa_id = await resolverEmpresaId(op.sb, op.userId)
  if (!empresa_id) return { ok: false, error: 'Não foi possível resolver a empresa.' }

  const { data: cfg } = await op.sb.from('disco_config').select('drive_linked').eq('empresa_id', empresa_id).maybeSingle()
  if (!(cfg as { drive_linked?: boolean } | null)?.drive_linked) return { ok: false, error: 'Vincule o Google Drive primeiro.' }

  const padroes = ['Fotos Institucionais', 'Vídeos da Rede', 'Planilhas Financeiras']
  const { data: existentes } = await op.sb.from('disco_pastas').select('nome').eq('empresa_id', empresa_id).is('parent_id', null)
  const jaTem = new Set(((existentes ?? []) as { nome: string }[]).map((p) => p.nome))
  const novas = padroes.filter((n) => !jaTem.has(n)).map((n) => ({ empresa_id, parent_id: null, nome: n, por: 'Google Drive', drive: true, criado_por: op.userId }))
  if (novas.length) {
    const { error: e } = await op.sb.from('disco_pastas').insert(novas)
    if (e) return { ok: false, error: msgErro(e.message, 'importar pastas do Drive') }
  }
  revalidatePath('/disco')
  return { ok: true }
}
