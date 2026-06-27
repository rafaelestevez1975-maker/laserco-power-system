'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'

export type ActionResult = { ok: boolean; error?: string }

export type MinhaContaInput = {
  nome_completo: string
  telefone?: string | null
}

/** Atualiza o perfil do PRÓPRIO usuário logado (perfis_usuario).
 *  Sempre escopado por id = op.userId — ninguém edita o perfil de outro por aqui.
 *  Nome e telefone são editáveis; e-mail/papel não (gerenciados em RH/auth). */
export async function salvarMinhaConta(input: MinhaContaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  const nome = (input.nome_completo || '').trim()
  if (!nome) return { ok: false, error: 'Informe seu nome.' }
  if (nome.length < 2) return { ok: false, error: 'Nome muito curto.' }

  const tel = (input.telefone || '').trim()
  if (tel) {
    const dig = tel.replace(/\D/g, '')
    if (dig.length < 10 || dig.length > 13) return { ok: false, error: 'Telefone inválido (use DDD + número).' }
  }

  const { error: e } = await op.sb
    .from('perfis_usuario')
    .update({ nome_completo: nome, telefone: tel || null, atualizado_em: new Date().toISOString() })
    .eq('id', op.userId) // escopo ao próprio usuário
  if (e) return { ok: false, error: msgErro(e.message, 'salvar seus dados') }

  revalidatePath('/minha-conta')
  return { ok: true }
}

// TODO(legado: buildUni) — tema/cor da marca e subdomínio da organização (Minha Conta no
//   legado tinha abas de personalização visual + subdomínio). Sem colunas/tabela no lkii.
//   //TODO(needs-table: org_config — tema, subdominio)
// TODO(legado: buildUni) — troca de senha / e-mail: fluxo via Supabase Auth (auth.updateUser),
//   não via perfis_usuario. Deixado adiado.
