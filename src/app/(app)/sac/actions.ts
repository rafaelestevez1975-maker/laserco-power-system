'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type NovoChamadoInput = {
  nome_cliente: string
  cpf_cliente?: string
  telefone_cliente?: string
  email_cliente?: string
  canal: string
  unidade_id?: string | null
  motivo_label?: string
  prioridade?: string
  observacoes?: string
}

const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente']
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']

/** Abre um chamado no SAC (cria sac_tickets). Respeita RLS/permissão de escrita. */
export async function criarChamado(input: NovoChamadoInput): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!input.nome_cliente?.trim()) return { ok: false, error: 'Informe o nome do cliente.' }

  const canal = CANAIS.includes(input.canal) ? input.canal : 'Manual'
  const prioridade = PRIORIDADES.includes(input.prioridade || '') ? input.prioridade : 'media'

  // empresa_id: da unidade escolhida, senão da empresa única
  let empresa_id: string | undefined
  if (input.unidade_id) {
    const { data: uni } = await sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).single()
    empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  } else {
    const { data: emp } = await sb.from('empresas').select('id').limit(1).single()
    empresa_id = (emp as { id?: string } | null)?.id
  }
  if (!empresa_id) return { ok: false, error: 'Não foi possível determinar a empresa.' }

  const { error } = await sb.from('sac_tickets').insert({
    empresa_id,
    unidade_id: input.unidade_id || null,
    nome_cliente: input.nome_cliente.trim(),
    cpf_cliente: input.cpf_cliente?.trim() || null,
    telefone_cliente: input.telefone_cliente?.trim() || null,
    email_cliente: input.email_cliente?.trim() || null,
    assunto: input.motivo_label?.trim() || 'Atendimento',
    motivo_label: input.motivo_label?.trim() || null,
    canal,
    status: 'aberto',
    prioridade,
    fase: 'Novo',
    observacoes: input.observacoes?.trim() || null,
  })

  if (error) {
    return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Você não tem permissão para abrir chamados.' : error.message }
  }
  revalidatePath('/sac/chamados')
  revalidatePath('/sac/kanban')
  revalidatePath('/sac')
  return { ok: true }
}

export type EditChamadoInput = {
  nome_cliente?: string; telefone_cliente?: string; email_cliente?: string; cpf_cliente?: string
  motivo_label?: string; prioridade?: string; fase?: string; atribuido_para?: string | null; observacoes?: string
}

/** Edita um chamado existente (campos parciais). Valida prioridade/fase contra os CHECKs. */
export async function atualizarChamado(id: string, dados: EditChamadoInput): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (dados.nome_cliente !== undefined && !dados.nome_cliente.trim()) return { ok: false, error: 'O nome do cliente não pode ficar vazio.' }
  if (dados.prioridade && !PRIORIDADES.includes(dados.prioridade)) return { ok: false, error: 'Prioridade inválida.' }
  if (dados.fase && !FASES.includes(dados.fase)) return { ok: false, error: 'Fase inválida.' }

  const patch: Record<string, unknown> = {}
  if (dados.nome_cliente !== undefined) patch.nome_cliente = dados.nome_cliente.trim()
  if (dados.telefone_cliente !== undefined) patch.telefone_cliente = dados.telefone_cliente.trim() || null
  if (dados.email_cliente !== undefined) patch.email_cliente = dados.email_cliente.trim() || null
  if (dados.cpf_cliente !== undefined) patch.cpf_cliente = dados.cpf_cliente.replace(/\D/g, '') || null
  if (dados.motivo_label !== undefined) patch.motivo_label = dados.motivo_label.trim() || null
  if (dados.prioridade) patch.prioridade = dados.prioridade
  if (dados.fase) patch.fase = dados.fase
  if (dados.atribuido_para !== undefined) patch.atribuido_para = dados.atribuido_para || null
  if (dados.observacoes !== undefined) patch.observacoes = dados.observacoes.trim() || null
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await sb.from('sac_tickets').update(patch).eq('id', id)
  if (error) return { ok: false, error: /row-level|policy|permission/i.test(error.message) ? 'Você não tem permissão para editar chamados.' : error.message }
  revalidatePath('/sac/chamados'); revalidatePath('/sac/kanban'); revalidatePath('/sac')
  return { ok: true }
}

/** Solicita reembolso de um chamado: cria o ESPELHO no Financeiro (Contas a Pagar 
 *  lançamento despesa, categoria "Devoluções e Descontos", origem_ref_id = ticket) e
 *  move o chamado para "Em pagamento". O Financeiro valida/paga depois. */
export async function solicitarReembolso(
  ticketId: string, valor: number, multaPct: number, observacao?: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!(valor > 0)) return { ok: false, error: 'Valor de reembolso deve ser maior que zero.' }

  const { data: t } = await sb
    .from('sac_tickets')
    .select('id, empresa_id, unidade_id, nome_cliente, numero, protocolo')
    .eq('id', ticketId).single()
  const tk = t as { empresa_id?: string; unidade_id?: string | null; nome_cliente?: string; numero?: number; protocolo?: string } | null
  if (!tk?.empresa_id) return { ok: false, error: 'Chamado não encontrado.' }

  const { data: cat } = await sb.from('plano_contas').select('id').eq('codigo', '2.3').limit(1).single()
  const categoria_id = (cat as { id?: string } | null)?.id ?? null

  const hoje = new Date().toISOString().slice(0, 10)
  const ref = tk.protocolo || `SAC-${tk.numero ?? ''}`

  const { error: e1 } = await sb.from('lancamentos_financeiros').insert({
    empresa_id: tk.empresa_id,
    unidade_id: tk.unidade_id ?? null,
    tipo: 'despesa',
    categoria_id,
    descricao: `Reembolso SAC · ${tk.nome_cliente ?? 'Cliente'} · ${ref}`,
    valor,
    data_competencia: hoje,
    data_vencimento: hoje,
    status: 'pendente',
    origem: 'manual',
    origem_ref_id: ticketId,
    observacao: `Solicitação do SAC (multa ${multaPct}%).${observacao ? ' ' + observacao : ''}`,
    criado_por: user.id,
  })
  if (e1) return { ok: false, error: /row-level|policy|permission/i.test(e1.message) ? 'Sem permissão para lançar no Financeiro.' : e1.message }

  // multa_aplicada é boolean no schema; o % fica na observação do lançamento.
  await sb.from('sac_tickets').update({
    valor_devolucao: valor, multa_aplicada: multaPct > 0, fase: 'Em pagamento',
  }).eq('id', ticketId)

  revalidatePath('/sac/kanban')
  revalidatePath('/sac/chamados')
  revalidatePath('/sac')
  return { ok: true }
}
