'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { adminClient } from '@/lib/supabase/admin'
import { ehAdmin } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string }

/** Quem pode editar os dados da própria unidade: gestor/franqueado da unidade,
 *  admin_geral ou proprietário. Colaborador comum não edita. */
const PAPEIS_EDITA_UNIDADE = ['gestor', 'proprietario', 'operacoes']

function podeEditar(papel: string | null | undefined): boolean {
  return ehAdmin(papel) || PAPEIS_EDITA_UNIDADE.includes(papel || '')
}

export type DadosUnidadeInput = {
  id: string
  nome: string
  cnpj?: string | null
  endereco?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
}

/** Atualiza os dados básicos da unidade ativa (aba "Dados básicos" de /minha-unidade).
 *  Confere que a unidade é visível ao usuário (RLS) antes de gravar. */
export async function salvarDadosUnidade(input: DadosUnidadeInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!podeEditar(op.papel)) return { ok: false, error: 'Você não tem permissão para editar os dados da unidade.' }
  if (!input.id) return { ok: false, error: 'Unidade inválida.' }

  const nome = (input.nome || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da unidade.' }
  const estado = (input.estado || '').trim().toUpperCase()
  if (estado && estado.length !== 2) return { ok: false, error: 'UF deve ter 2 letras (ex.: SP).' }

  // A unidade precisa estar visível pela RLS (escopo do usuário) — confere ANTES de gravar.
  const { data: alvo } = await op.sb.from('unidades').select('id').eq('id', input.id).maybeSingle()
  if (!alvo) return { ok: false, error: 'Unidade não encontrada ou fora do seu acesso.' }

  // RLS de unidades só deixa admin escrever; após o gate de papel + a confirmação de visibilidade,
  // gravamos via service-role escopado ao id já validado.
  const { error: e } = await adminClient()
    .from('unidades')
    .update({
      nome,
      cnpj: input.cnpj?.trim() || null,
      endereco: input.endereco?.trim() || null,
      cidade: input.cidade?.trim() || null,
      estado: estado || null,
      cep: input.cep?.trim() || null,
    })
    .eq('id', input.id)
  if (e) return { ok: false, error: msgErro(e.message, 'salvar dados da unidade') }

  revalidatePath('/minha-unidade')
  revalidatePath('/unidades')
  return { ok: true }
}

// TODO(needs-table: unidade_horarios) — aba "Horários" de funcionamento da unidade.
//   No legado UNI_HORARIOS é mock; não há tabela no lkii. UI fiel + estado vazio honesto.
// TODO(needs-table: unidade_bloqueios) — aba "Bloqueios" de agenda (almoço, manutenção).
//   No legado UNI_BLOCKS é mock; sem tabela no lkii.
// TODO(needs-table: unidade_fotos) — galeria de fotos da unidade (mock no legado).
// TODO(needs-table: unidade_nfse_config) — configuração de emissão de NFS-e por unidade.
