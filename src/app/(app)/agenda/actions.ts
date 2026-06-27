'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'

export type ActionResult = { ok: boolean; error?: string; avisoSobreposicao?: boolean }

/** Limites operacionais da grade (espelham o legado: START=8h, END=20h). */
const START_MIN = 8 * 60
const END_MIN = 20 * 60

export type ClienteOpcao = { id: string; nome: string; telefone: string | null }

/**
 * Busca clientes por nome/telefone/cpf (server-side, sobre 347k linhas, escopado por unidade).
 * Nunca devolve a base toda — sempre filtra por termo e limita. Para o autocomplete do modal.
 */
export async function buscarClientes(termo: string, unidadeId: string | null): Promise<ClienteOpcao[]> {
  const { op } = await requireOperador()
  if (!op) return []
  const t = (termo || '').trim()
  if (t.length < 2) return []

  let q = op.sb
    .from('clientes')
    .select('id, nome, telefone')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(20)
  if (unidadeId) q = q.eq('unidade_origem_id', unidadeId)

  const safe = t.replace(/[,()*%]/g, ' ').trim()
  if (!safe) return []
  q = q.or(`nome.ilike.%${safe}%,telefone.ilike.%${safe}%,cpf.ilike.%${safe}%`)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; nome: string | null; telefone: string | null }>)
    .map((c) => ({ id: c.id, nome: c.nome || 'Cliente', telefone: c.telefone }))
}

export type CriarAgendamentoInput = {
  unidade_id: string
  /** perfil_id do profissional (FK agendamentos.profissional_id → perfis_usuario.id). */
  profissional_id: string
  cliente_id: string
  servico_id: string
  /** ISO local "YYYY-MM-DDTHH:mm" — combinado dia+hora pela grade. */
  inicio: string
  /** duração em minutos (vem do serviço; default 10 = GAP padrão da rede). */
  duracao_min?: number
  observacao?: string
  /** quando true, ignora o aviso de sobreposição e grava mesmo assim. */
  forcar?: boolean
}

/**
 * Cria um agendamento. Validação por campo + checagem de sobreposição no mesmo
 * profissional (avisa; só grava à força se `forcar`). Escopo por unidade, RBAC operador.
 */
export async function criarAgendamento(input: CriarAgendamentoInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  // ── Validação por campo ──
  if (!input.unidade_id) return { ok: false, error: 'Selecione a unidade.' }
  if (!input.profissional_id) return { ok: false, error: 'Selecione o profissional.' }
  if (!input.cliente_id) return { ok: false, error: 'Selecione o cliente.' }
  if (!input.servico_id) return { ok: false, error: 'Selecione o serviço.' }
  if (!input.inicio) return { ok: false, error: 'Informe o horário de início.' }

  // input.inicio é o horário de parede BR ("YYYY-MM-DDTHH:mm") que o operador clicou na grade.
  // Interpretamos no fuso BR (-03:00) para gravar o instante correto e validar a janela 08–20h.
  const m = input.inicio.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return { ok: false, error: 'Horário de início inválido.' }
  const hora = Number(m[4])
  const minuto = Number(m[5])
  const inicioDate = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`)
  if (isNaN(inicioDate.getTime())) return { ok: false, error: 'Horário de início inválido.' }

  const mins = hora * 60 + minuto
  if (mins < START_MIN || mins >= END_MIN) {
    return { ok: false, error: 'A agenda atende das 08:00 às 20:00.' }
  }

  const dur = Math.max(5, Number(input.duracao_min) || 10)
  const fimDate = new Date(inicioDate.getTime() + dur * 60_000)

  // empresa_id da unidade (coluna obrigatória do schema). RLS já restringe o que o operador vê.
  const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).maybeSingle()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  // ── Sobreposição no mesmo profissional/unidade (intervalos que se cruzam) ──
  // Conflito = existe agendamento ativo cujo [inicio,fim) cruza [novo.inicio, novo.fim).
  // status_agendamento (enum real do lkii): aberto | confirmado | em_atendimento | concluido | cancelado | no_show.
  const { data: conflitos } = await op.sb
    .from('agendamentos')
    .select('id, inicio, fim, status')
    .eq('unidade_id', input.unidade_id)
    .eq('profissional_id', input.profissional_id)
    .not('status', 'in', '(cancelado,no_show)')
    .lt('inicio', fimDate.toISOString())
    .gt('fim', inicioDate.toISOString())
    .limit(1)

  if ((conflitos?.length ?? 0) > 0 && !input.forcar) {
    return { ok: false, avisoSobreposicao: true, error: 'Já existe um agendamento desse profissional nesse horário. Confirme para sobrepor.' }
  }

  const { error: e } = await op.sb.from('agendamentos').insert({
    empresa_id,
    unidade_id: input.unidade_id,
    profissional_id: input.profissional_id,
    cliente_id: input.cliente_id,
    servico_id: input.servico_id,
    inicio: inicioDate.toISOString(),
    fim: fimDate.toISOString(),
    status: 'aberto', // valor inicial real do enum status_agendamento
    origem: 'manual',
    observacao: input.observacao?.trim() || null,
    criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e, 'criar agendamento') }

  revalidatePath('/agenda')
  return { ok: true }
}

/** Confirma um agendamento (status=confirmado, confirmado_em=now). */
export async function confirmarAgendamento(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!id) return { ok: false, error: 'Agendamento inválido.' }

  const { error: e } = await op.sb
    .from('agendamentos')
    .update({ status: 'confirmado', confirmado_em: new Date().toISOString() })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e, 'confirmar agendamento') }

  revalidatePath('/agenda')
  return { ok: true }
}

/** Cancela um agendamento (status=cancelado, cancelado_em=now, motivo obrigatório). */
export async function cancelarAgendamento(id: string, motivo: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!id) return { ok: false, error: 'Agendamento inválido.' }
  const m = (motivo || '').trim()
  if (!m) return { ok: false, error: 'Informe o motivo do cancelamento.' }

  const { error: e } = await op.sb
    .from('agendamentos')
    .update({ status: 'cancelado', cancelado_em: new Date().toISOString(), motivo_cancelamento: m })
    .eq('id', id)
  if (e) return { ok: false, error: msgErro(e, 'cancelar agendamento') }

  revalidatePath('/agenda')
  return { ok: true }
}

// TODO(legado): "Novo evento" (banda de eventos da rede) — em buildAgenda() a função
//   renderRede()/btnEvtRede cria eventos que NÃO bloqueiam horário. Ainda não há tabela
//   de eventos da rede no schema lkii. Deixado para depois.
// TODO(legado): recorrência de agendamentos (não há campo recorrente em agendamentos;
//   apenas bloqueios_agenda.recorrente). Deixado para depois.
// TODO(legado): "Nova venda" a partir do horário (abrir OS/venda) — buildAgenda() abre OS
//   ao clicar; integração de vendas/OS fora do escopo deste módulo.
