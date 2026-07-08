'use server'

import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { ok: boolean; error?: string }

const SENHA_PADRAO = '12345678'
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Conclui o PRIMEIRO ACESSO do colaborador: troca o e-mail temporário e a senha padrão pelos
 * definitivos. Aplica direto via Admin API (updateUserById) → sem e-mail de confirmação, muda na
 * hora. Escopado SEMPRE ao próprio usuário logado (op.userId vem do auth, nunca do input).
 * Limpa a flag must_change (metadata) para o gate do middleware liberar o resto do sistema.
 */
export async function concluirPrimeiroAcesso(input: { email: string; senha: string }): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  const email = (input.email || '').trim().toLowerCase()
  const senha = input.senha || ''

  if (!RE_EMAIL.test(email)) return { ok: false, error: 'Informe um e-mail válido.' }
  if (email.endsWith('@laserco.app')) return { ok: false, error: 'Use seu e-mail definitivo (não o temporário @laserco.app).' }
  if (senha.length < 8) return { ok: false, error: 'A senha precisa ter ao menos 8 caracteres.' }
  if (senha === SENHA_PADRAO) return { ok: false, error: 'Escolha uma senha diferente da padrão (12345678).' }

  const admin = adminClient()

  // GATE: só quem está DE FATO em primeiro acesso (app_metadata.must_change) pode trocar por aqui.
  // Sem isto, qualquer sessão logada (ex.: sequestrada) trocaria e-mail+senha pulando a confirmação
  // por e-mail do Supabase (email_confirm:true) — takeover. Lido do auth server, não do input.
  const { data: alvo } = await admin.auth.admin.getUserById(op.userId)
  if (alvo?.user?.app_metadata?.must_change !== true) {
    return { ok: false, error: 'Este passo é só do primeiro acesso e já foi concluído.' }
  }

  // e-mail já em uso por outra conta? (evita erro cru do auth)
  const { data: existentes } = await admin.from('perfis_usuario').select('id').eq('email', email).neq('id', op.userId).limit(1)
  if (existentes && existentes.length > 0) return { ok: false, error: 'Esse e-mail já está em uso por outra conta.' }

  // Troca e-mail + senha e derruba a flag de primeiro acesso (Admin API = sem confirmação por e-mail).
  // must_change vai em app_metadata (protegido; o usuário não reescreve) — o gate do middleware lê dali.
  const { error: e } = await admin.auth.admin.updateUserById(op.userId, {
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { must_change: false, primeiro_acesso_em: new Date().toISOString() },
  })
  if (e) return { ok: false, error: msgErro(e.message, 'concluir o primeiro acesso') }

  // Mantém o perfil em sincronia + limpa o forçar-troca do cadastro do colaborador.
  await admin.from('perfis_usuario').update({ email, atualizado_em: new Date().toISOString() }).eq('id', op.userId)
  await admin.from('colaboradores').update({ forcar_troca_senha: false }).eq('perfil_id', op.userId)

  // Trocar o e-mail invalida a sessão atual; re-autentica com a nova credencial (já ativa) para
  // a pessoa cair direto no sistema em vez de voltar pro /login.
  try {
    const sb = await createClient()
    await sb.auth.signInWithPassword({ email, password: senha })
  } catch {
    // Se a re-autenticação falhar por algum motivo, o usuário só faz login manual com a nova senha.
  }

  return { ok: true }
}
