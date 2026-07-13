import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { FRANQUEADORA_EMPRESA_ID } from '@/lib/sac-ingest'
import { OrganizacaoConfig, type OrganizacaoDados } from '@/components/minha-conta/OrganizacaoConfig'
import { type PerfilDados } from '@/components/unidades/MinhaContaPanel'

export const dynamic = 'force-dynamic'

/**
 * "Minha conta" espelha o BEMP: o foco é a CONFIGURAÇÃO DA ORGANIZAÇÃO
 * (organizacao_config), não o perfil pessoal. O perfil pessoal do usuário
 * continua acessível numa seção "Meu perfil" no fim da tela.
 * Edição da organização só para admin_geral (getSessionContext.isAdmin).
 */
export default async function MinhaContaPage() {
  const sb = await createClient()
  const [{ data: { user } }, ctx] = await Promise.all([sb.auth.getUser(), getSessionContext()])

  const { data: orgRow } = await sb
    .from('organizacao_config')
    .select('empresa_id, nome, tema, subdominio, validade_pontos_meses, informar_vendedor_os, bloquear_inadimplente, agendamento_online, razao_social, cnpj')
    .eq('empresa_id', FRANQUEADORA_EMPRESA_ID)
    .maybeSingle()

  const org = (orgRow as OrganizacaoDados | null) ?? null

  let perfil: PerfilDados | null = null
  if (user) {
    const { data } = await sb
      .from('perfis_usuario')
      .select('id, nome_completo, email, telefone, papel, status')
      .eq('id', user.id)
      .maybeSingle()
    perfil = (data as PerfilDados | null) ?? null
    if (perfil && !perfil.email) perfil.email = user.email ?? null
  }

  return <OrganizacaoConfig org={org} perfil={perfil} ehAdmin={!!ctx?.isAdmin} />
}
