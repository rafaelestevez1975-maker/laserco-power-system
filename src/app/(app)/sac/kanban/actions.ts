'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, scopeUnidade } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { getSessionContext } from '@/lib/session'
import { moedaBR } from '@/lib/fmt'

const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']
const FASE_FINAL = 'Concluído'
// Papéis com permissão de operar o SAC (mesmo conjunto de criarChamado/atualizarChamado/distribuir).
const PAPEIS_SAC = ['sac', 'gestor'] as const

/** Move um ticket do SAC para outra fase (Novo → Contato → Em pagamento → Concluído).
 *  Espelha o sacAvancar do legado: ao cair em "Concluído", FECHA o caso (status='resolvido');
 *  ao sair de "Concluído" para uma fase ativa, reabre (status='aberto'). Mantém status e fase
 *  coerentes (o que o legado fazia com c.status='Concluído'). RBAC por papel + escopo por unidade. */
export async function moverTicketFase(ticketId: string, fase: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_SAC)) return { ok: false, error: 'Você não tem permissão para mover chamados.' }
  if (!FASES.includes(fase)) return { ok: false, error: 'Fase inválida.' }
  const sb = op.sb

  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null

  // Confere que o ticket pertence à unidade ativa antes de escrever (não confia só na RLS).
  let chk = sb.from('sac_tickets').select('id, fase, status').eq('id', ticketId)
  chk = scopeUnidade(chk, unidadeId)
  const { data: atual } = await chk.maybeSingle()
  const tk = atual as { fase?: string | null; status?: string | null } | null
  if (!tk) return { ok: false, error: 'Chamado não encontrado nesta unidade.' }
  if ((tk.fase || 'Novo') === fase) return { ok: true }

  // Coerência fase↔status (paridade sacAvancar): Concluído → resolvido; reabrir → aberto.
  // Marca/limpa concluido_em para alimentar o "Tempo médio de resolução" do dashboard (J.02).
  const patch: Record<string, unknown> = { fase }
  if (fase === FASE_FINAL) { patch.status = 'resolvido'; patch.concluido_em = new Date().toISOString() }
  else if ((tk.fase || '') === FASE_FINAL) { patch.status = 'aberto'; patch.concluido_em = null }

  let upd = sb.from('sac_tickets').update(patch).eq('id', ticketId)
  upd = scopeUnidade(upd, unidadeId)
  const { error: e } = await upd
  if (e) return { ok: false, error: msgErro(e, 'mover o chamado') }

  revalidatePath('/sac/kanban')
  revalidatePath('/sac/chamados')
  revalidatePath('/sac')
  return { ok: true }
}

/** Gera o PEDIDO DE CANCELAMENTO (paridade sacGerarPedido do legado, index.html:9225).
 *  NÃO lança no Financeiro  apenas registra o pedido no chamado: marca motivo=Reembolso,
 *  move para "Em pagamento", grava o valor de reembolso solicitado (valor_devolucao) e
 *  ANEXA na observação o texto "PEDIDO DE CANCELAMENTO anexado à ficha. Reembolso calculado
 *  automaticamente: R$ X (saldo de N sessões restantes, …)". O lançamento financeiro fica a
 *  cargo de "Lançar reembolso no Financeiro" (solicitarReembolso), separado e idempotente. */
export async function gerarPedidoCancelamento(
  ticketId: string, valorReembolso: number, sessoesRestantes: number, temMulta: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, ...PAPEIS_SAC)) return { ok: false, error: 'Você não tem permissão para gerar pedido de cancelamento.' }
  const sb = op.sb

  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null

  let q = sb.from('sac_tickets').select('id, observacoes').eq('id', ticketId)
  q = scopeUnidade(q, unidadeId)
  const { data: t } = await q.maybeSingle()
  const tk = t as { observacoes?: string | null } | null
  if (!tk) return { ok: false, error: 'Chamado não encontrado nesta unidade.' }

  const valor = Math.max(0, Math.round(Number(valorReembolso) || 0))
  const nRest = Math.max(0, Math.floor(Number(sessoesRestantes) || 0))
  const nota = `PEDIDO DE CANCELAMENTO anexado à ficha. Reembolso calculado automaticamente: ${moedaBR(valor)} (saldo de ${nRest} sessão(ões) restante(s)${temMulta ? ', menos multa de rescisão' : ', sem multa'}).`
  const obsAtual = (tk.observacoes || '').trim()
  const observacoes = obsAtual ? `${obsAtual}\n${nota}` : nota

  let upd = sb.from('sac_tickets').update({
    motivo_label: 'Reembolso',
    fase: 'Em pagamento',
    valor_devolucao: valor,
    multa_aplicada: temMulta,
    observacoes,
  }).eq('id', ticketId)
  upd = scopeUnidade(upd, unidadeId)
  const { error: e } = await upd
  if (e) return { ok: false, error: msgErro(e, 'gerar o pedido de cancelamento') }

  revalidatePath('/sac/kanban')
  revalidatePath('/sac/chamados')
  revalidatePath('/sac')
  return { ok: true }
}
