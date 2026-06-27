'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel, ehAdmin } from '@/lib/rbac'
import { listAtendentesSac } from '@/lib/pessoas'
import { adminClient } from '@/lib/supabase/admin'
import type { SB } from '@/lib/sb'

export type DistribResult = { ok: boolean; error?: string; conversas?: number; atendentes?: number }

export type CriarAtendenteInput = { nome: string; email: string; senha: string; telefone?: string; unidadeId?: string | null }

const emailValido = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

/** Cria o ACESSO de login de uma atendente SAC: usuário de autenticação (auth) +
 *  perfil com papel 'sac' (mesmo id). É o fluxo que o ADMIN usa para liberar o login
 *  das consultoras (o trigger handle_new_user já cria o perfil por metadata; o upsert
 *  garante o perfil e grava o telefone). Ver project-laserco-people-model. */
export async function criarAcessoAtendente(input: CriarAtendenteInput): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel)) return { ok: false, error: 'Apenas o administrador pode criar acessos de atendente.' }

  const nome = input.nome?.trim()
  const email = input.email?.trim().toLowerCase()
  const senha = input.senha ?? ''
  if (!nome) return { ok: false, error: 'Informe o nome da atendente.' }
  if (!emailValido(email)) return { ok: false, error: 'Informe um e-mail válido.' }
  if (senha.length < 8) return { ok: false, error: 'A senha deve ter ao menos 8 caracteres.' }

  const admin = adminClient()

  // 1) cria o login (e-mail já confirmado para a atendente conseguir entrar de imediato)
  const { data: created, error: eAuth } = await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: { nome_completo: nome, papel: 'sac', unidade_id: input.unidadeId || '' },
  })
  if (eAuth || !created?.user) {
    const m = eAuth?.message || ''
    if (/already|registered|exist|duplicate/i.test(m)) return { ok: false, error: 'Já existe um usuário com esse e-mail.' }
    return { ok: false, error: m || 'Não foi possível criar o login.' }
  }
  const uid = created.user.id

  // 2) garante o perfil (papel SAC) ligado ao mesmo id + grava telefone
  const { error: ePerfil } = await admin.from('perfis_usuario').upsert({
    id: uid, nome_completo: nome, email,
    telefone: input.telefone?.trim() || null,
    papel: 'sac', unidade_id: input.unidadeId || null,
    status: 'ativo', ativo: true,
  }, { onConflict: 'id' })
  if (ePerfil) {
    await admin.auth.admin.deleteUser(uid).catch(() => {}) // sem perfil o login é inútil → desfaz
    return { ok: false, error: msgErro(ePerfil.message, 'criar o perfil da atendente') }
  }

  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Carga atual (conversas atribuídas + tickets abertos atribuídos) por atendente. */
async function cargaPorAtendente(sb: SB, ids: string[]): Promise<Map<string, number>> {
  const carga = new Map<string, number>()
  await Promise.all(ids.map(async (id) => {
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).eq('atendente_id', id),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', id).neq('fase', 'Concluído'),
    ])
    carga.set(id, (c1 ?? 0) + (c2 ?? 0))
  }))
  return carga
}

/** Distribuição automática IGUALITÁRIA: atribui a fila não-atribuída (conversas que
 *  precisam de humano + chamados abertos) round-robin ao atendente menos carregado.
 *  Atribuição usa o id do perfis_usuario (ver project-laserco-people-model). */
export async function distribuirFila(): Promise<DistribResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'sac', 'gestor')) return { ok: false, error: 'Você não tem permissão para distribuir o atendimento.' }
  const sb = op.sb

  const atendentes = await listAtendentesSac(sb)
  if (atendentes.length === 0) return { ok: false, error: 'Nenhum atendente SAC ativo para distribuir.' }

  const carga = await cargaPorAtendente(sb, atendentes.map((a) => a.id))
  const menosCarregado = () => {
    let best = atendentes[0].id, min = Infinity
    for (const a of atendentes) { const c = carga.get(a.id) ?? 0; if (c < min) { min = c; best = a.id } }
    return best
  }

  // Distribui o ATENDIMENTO VIVO: conversas que precisam de humano (sem atendente e
  // com bot desligado). Chamados (backlog histórico) são atribuídos ao serem trabalhados,
  // não em massa, para não despejar centenas de uma vez.
  const { data: convs } = await sb
    .from('sac_whatsapp_chats').select('id').is('atendente_id', null).eq('bot_ativo', false)
    .order('ultima_msg_em', { ascending: true }).limit(300)
  let nConv = 0
  for (const c of (convs ?? []) as { id: string }[]) {
    const aid = menosCarregado()
    const { error: e } = await sb.from('sac_whatsapp_chats').update({ atendente_id: aid }).eq('id', c.id)
    if (!e) { carga.set(aid, (carga.get(aid) ?? 0) + 1); nConv++ }
  }

  revalidatePath('/sac/atendentes'); revalidatePath('/sac/triagem')
  return { ok: true, conversas: nConv, atendentes: atendentes.length }
}
