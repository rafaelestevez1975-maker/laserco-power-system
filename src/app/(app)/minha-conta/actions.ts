'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { exigirPapel } from '@/lib/rbac'
import { FRANQUEADORA_EMPRESA_ID } from '@/lib/sac-ingest'

export type ActionResult = { ok: boolean; error?: string }

export type TemaOrg = 'azul_claro' | 'roxo' | 'dourado' | 'escuro'
export type InformarVendedorOs = 'obrigatorio' | 'opcional' | 'nao'

export type OrganizacaoInput = {
  nome: string
  tema: TemaOrg
  subdominio: string
  validade_pontos_meses: number | null
  informar_vendedor_os: InformarVendedorOs
  agendamento_online: boolean
  bloquear_inadimplente: boolean
  razao_social: string | null
  cnpj: string | null
}

const TEMAS: TemaOrg[] = ['azul_claro', 'roxo', 'dourado', 'escuro']
const VENDEDOR: InformarVendedorOs[] = ['obrigatorio', 'opcional', 'nao']

/** Configuração da ORGANIZAÇÃO (organizacao_config). Espelha "Minha conta" do BEMP.
 *  RBAC: só admin_geral escreve (RLS do Supabase é a 2ª linha de defesa).
 *  Escopo fixo à franqueadora (empresa_id = FRANQUEADORA_EMPRESA_ID). */
export async function salvarOrganizacao(input: OrganizacaoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  const negar = exigirPapel(op.papel, [], 'editar a configuração da organização')
  if (negar) return { ok: false, error: negar }

  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da organização.' }
  if (nome.length < 2) return { ok: false, error: 'Nome muito curto.' }

  const tema: TemaOrg = TEMAS.includes(input.tema) ? input.tema : 'azul_claro'
  const informar: InformarVendedorOs = VENDEDOR.includes(input.informar_vendedor_os) ? input.informar_vendedor_os : 'opcional'

  const sub = (input.subdominio || '').trim().toLowerCase()
  if (sub && !/^[a-z0-9-]+$/.test(sub)) {
    return { ok: false, error: 'Subdomínio inválido (use apenas letras minúsculas, números e hífen).' }
  }

  let validade: number | null = null
  if (input.validade_pontos_meses != null && `${input.validade_pontos_meses}` !== '') {
    const n = Number(input.validade_pontos_meses)
    if (!Number.isInteger(n) || n < 0 || n > 240) return { ok: false, error: 'Validade dos pontos inválida (0 a 240 meses).' }
    validade = n
  }

  const cnpj = (input.cnpj || '').trim()
  if (cnpj) {
    const dig = cnpj.replace(/\D/g, '')
    if (dig.length !== 14) return { ok: false, error: 'CNPJ inválido (14 dígitos).' }
  }

  const { error: e } = await adminClient()
    .from('organizacao_config')
    .update({
      nome,
      tema,
      subdominio: sub || null,
      validade_pontos_meses: validade,
      informar_vendedor_os: informar,
      agendamento_online: !!input.agendamento_online,
      bloquear_inadimplente: !!input.bloquear_inadimplente,
      razao_social: (input.razao_social || '').trim() || null,
      cnpj: cnpj || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('empresa_id', FRANQUEADORA_EMPRESA_ID)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar a organização') }

  revalidatePath('/minha-conta')
  return { ok: true }
}

export type MinhaContaInput = {
  nome_completo: string
  telefone?: string | null
}

/** Atualiza o perfil do PRÓPRIO usuário logado (perfis_usuario).
 *  Sempre escopado por id = op.userId  ninguém edita o perfil de outro por aqui.
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

  // RLS de perfis_usuario só deixa admin escrever; usamos service-role ESCOPADO ao próprio id (vindo do auth, não do input).
  const { error: e } = await adminClient()
    .from('perfis_usuario')
    .update({ nome_completo: nome, telefone: tel || null, atualizado_em: new Date().toISOString() })
    .eq('id', op.userId) // escopo ao próprio usuário
  if (e) return { ok: false, error: msgErro(e.message, 'salvar seus dados') }

  revalidatePath('/minha-conta')
  return { ok: true }
}

// TODO(legado: buildUni)  tema/cor da marca e subdomínio da organização (Minha Conta no
//   legado tinha abas de personalização visual + subdomínio). Sem colunas/tabela no lkii.
//   //TODO(needs-table: org_config  tema, subdominio)
// TODO(legado: buildUni)  troca de senha / e-mail: fluxo via Supabase Auth (auth.updateUser),
//   não via perfis_usuario. Deixado adiado.
