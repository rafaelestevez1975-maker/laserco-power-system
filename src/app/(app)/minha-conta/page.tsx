import { createClient } from '@/lib/supabase/server'
import { MinhaContaPanel, type PerfilDados } from '@/components/unidades/MinhaContaPanel'

export const dynamic = 'force-dynamic'

/** Dados do perfil do usuário logado (perfis_usuario). Nome/telefone editáveis;
 *  e-mail e papel são somente leitura (geridos em RH/auth). */
export default async function MinhaContaPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  let perfil: PerfilDados | null = null
  if (user) {
    const { data } = await sb
      .from('perfis_usuario')
      .select('id, nome_completo, email, telefone, papel, status')
      .eq('id', user.id)
      .maybeSingle()
    perfil = (data as PerfilDados | null) ?? null
    // Fallback de e-mail vindo do auth quando o perfil ainda não tem.
    if (perfil && !perfil.email) perfil.email = user.email ?? null
  }

  return <MinhaContaPanel perfil={perfil} />
}
