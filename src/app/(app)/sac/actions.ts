'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { primeiroPagamentoValido, MSG_DIA15, montarObs, lerObsMeta } from '@/lib/sac'

export type NovoChamadoInput = {
  nome_cliente: string
  cpf_cliente?: string
  telefone_cliente?: string
  email_cliente?: string
  canal: string
  unidade_id?: string | null
  tipo?: string
  data_reclamacao?: string
  motivo_label?: string
  prioridade?: string
  fase?: string
  atribuido_para?: string | null
  area_reclamada?: string
  valor_pago?: number | string | null
  valor_devolucao?: number | string | null
  multa_aplicada?: boolean
  pago?: boolean
  observacoes?: string
}

const CANAIS = ['Manual', 'WhatsApp', 'E-mail', 'Reclame Aqui', 'Procon', 'Telefone', 'Instagram', 'Sults', 'Blip', 'Formulário']
const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente']
// Legado: tipo da unidade (Franquia/Própria) e data da reclamação (sacForm 9243/9246).
// sac_tickets não tem colunas próprias para isso → registramos no prefixo de observações
// (mesmo padrão da importação, que grava "Reclamação: <data>").
const TIPOS = ['Franquia', 'Própria']
const FASES = ['Novo', 'Contato com cliente', 'Contato com unidade', 'Aguardando cliente', 'Aguardando retorno interno', 'Em pagamento', 'Concluído']

/** Converte "1.234,56" / "1234.56" / number em número (ou null). */
function parseNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = v.trim().replace(/[R$\s]/g, '')
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}

/** Abre um chamado no SAC (cria sac_tickets). Respeita RLS/permissão de escrita. */
export async function criarChamado(input: NovoChamadoInput): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!input.nome_cliente?.trim()) return { ok: false, error: 'Informe o nome do cliente.' }

  const canal = CANAIS.includes(input.canal) ? input.canal : 'Manual'
  const prioridade = PRIORIDADES.includes(input.prioridade || '') ? input.prioridade : 'media'
  const fase = FASES.includes(input.fase || '') ? input.fase! : 'Novo'

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

  // Tipo e data da reclamação não têm coluna própria → vão no prefixo das observações.
  const tipo = TIPOS.includes((input.tipo || '').trim()) ? (input.tipo || '').trim() : ''
  const dataRecl = (input.data_reclamacao || '').trim()
  const observacoes = montarObs(tipo, dataRecl, input.observacoes?.trim() || '')

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
    fase,
    atribuido_para: input.atribuido_para || null,
    area_reclamada: input.area_reclamada?.trim() || null,
    valor_pago: parseNum(input.valor_pago),
    valor_devolucao: parseNum(input.valor_devolucao),
    multa_aplicada: !!input.multa_aplicada,
    pago: !!input.pago,
    observacoes,
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
  area_reclamada?: string; valor_pago?: number | string | null; valor_devolucao?: number | string | null
  multa_aplicada?: boolean; pago?: boolean
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
  if (dados.area_reclamada !== undefined) patch.area_reclamada = dados.area_reclamada.trim() || null
  if (dados.valor_pago !== undefined) patch.valor_pago = parseNum(dados.valor_pago)
  if (dados.valor_devolucao !== undefined) patch.valor_devolucao = parseNum(dados.valor_devolucao)
  if (dados.multa_aplicada !== undefined) patch.multa_aplicada = !!dados.multa_aplicada
  if (dados.pago !== undefined) patch.pago = !!dados.pago
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
  const tk = t as { empresa_id?: string | null; unidade_id?: string | null; nome_cliente?: string; numero?: number; protocolo?: string } | null
  if (!tk) return { ok: false, error: 'Chamado não encontrado.' }
  const empresa_id = await resolverEmpresa(sb, tk.empresa_id, tk.unidade_id)
  if (!empresa_id) return { ok: false, error: 'Não foi possível determinar a empresa.' }

  const { data: cat } = await sb.from('plano_contas').select('id').eq('codigo', '2.3').limit(1).single()
  const categoria_id = (cat as { id?: string } | null)?.id ?? null

  const hoje = new Date().toISOString().slice(0, 10)
  const ref = tk.protocolo || `SAC-${tk.numero ?? ''}`

  const { error: e1 } = await sb.from('lancamentos_financeiros').insert({
    empresa_id,
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

function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

/** Resolve a empresa do chamado: empresa_id do ticket → empresa da unidade → empresa única.
 *  (Os chamados importados vêm sem empresa_id/unidade_id.) */
async function resolverEmpresa(sb: SB, empresaId?: string | null, unidadeId?: string | null): Promise<string | null> {
  if (empresaId) return empresaId
  if (unidadeId) {
    const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
    const e = (data as { empresa_id?: string } | null)?.empresa_id
    if (e) return e
  }
  const { data } = await sb.from('empresas').select('id').limit(1).single()
  return (data as { id?: string } | null)?.id ?? null
}

/** Cria um acordo de pagamento PARCELADO de um chamado (status 'aguardando_ok' até o gestor validar).
 *  Gera as parcelas (valor igual, última ajusta o resto; vencimento mês a mês) e move o chamado p/ Em pagamento. */
export async function criarAcordo(ticketId: string, valorTotal: number, nParcelas: number, data1: string, observacao?: string): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  if (!(valorTotal > 0)) return { ok: false, error: 'Valor total deve ser maior que zero.' }
  const n = Math.round(nParcelas)
  if (!(n >= 1 && n <= 24)) return { ok: false, error: 'Número de parcelas deve ser de 1 a 24.' }
  const d1 = new Date(data1)
  if (isNaN(d1.getTime())) return { ok: false, error: 'Data do 1º pagamento inválida.' }
  // Regra do legado (sacAcordoSalvar): 1º pagamento sempre após o dia 15.
  if (!primeiroPagamentoValido(data1)) return { ok: false, error: MSG_DIA15 }

  const { data: t } = await sb.from('sac_tickets').select('empresa_id, unidade_id, nome_cliente').eq('id', ticketId).single()
  const tk = t as { empresa_id?: string | null; unidade_id?: string | null; nome_cliente?: string } | null
  if (!tk) return { ok: false, error: 'Chamado não encontrado.' }
  const empresa_id = await resolverEmpresa(sb, tk.empresa_id, tk.unidade_id)
  if (!empresa_id) return { ok: false, error: 'Não foi possível determinar a empresa.' }

  const { data: ac, error: ea } = await sb.from('sac_acordos').insert({
    ticket_id: ticketId, empresa_id, unidade_id: tk.unidade_id ?? null,
    cliente: tk.nome_cliente ?? null, valor_total: valorTotal, n_parcelas: n,
    status: 'aguardando_ok', observacao: observacao?.trim() || null, criado_por: user.id,
  }).select('id').single()
  if (ea) return { ok: false, error: msgErro(ea.message, 'criar acordo') }
  const acordoId = (ac as { id: string }).id

  const base = Math.floor((valorTotal / n) * 100) / 100
  const parcelas = Array.from({ length: n }, (_, i) => ({
    acordo_id: acordoId, n: i + 1,
    vencimento: addMonths(d1, i).toISOString().slice(0, 10),
    valor: i === n - 1 ? Math.round((valorTotal - base * (n - 1)) * 100) / 100 : base,
    pago: false,
  }))
  const { error: ep } = await sb.from('sac_parcelas').insert(parcelas)
  if (ep) return { ok: false, error: ep.message }

  await sb.from('sac_tickets').update({ fase: 'Em pagamento', valor_devolucao: valorTotal }).eq('id', ticketId)
  revalidatePath('/sac/pagamentos'); revalidatePath('/sac/kanban'); revalidatePath('/sac/chamados'); revalidatePath('/sac')
  return { ok: true }
}

export type AcordoAvulsoInput = { cliente: string; unidade_id?: string | null; valorTotal: number; nParcelas: number; data1: string; observacao?: string }

/** Cria um acordo AVULSO (sem chamado vinculado) direto na aba Pagamentos.
 *  Mesma regra de parcelamento e do dia 15; entra como 'aguardando_ok'. */
export async function criarAcordoAvulso(input: AcordoAvulsoInput): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const cliente = (input.cliente || '').trim()
  if (!cliente) return { ok: false, error: 'Informe o cliente.' }
  if (!(input.valorTotal > 0)) return { ok: false, error: 'Valor total deve ser maior que zero.' }
  const n = Math.round(input.nParcelas)
  if (!(n >= 1 && n <= 24)) return { ok: false, error: 'Número de parcelas deve ser de 1 a 24.' }
  const d1 = new Date(input.data1)
  if (isNaN(d1.getTime())) return { ok: false, error: 'Data do 1º pagamento inválida.' }
  if (!primeiroPagamentoValido(input.data1)) return { ok: false, error: MSG_DIA15 }

  const empresa_id = await resolverEmpresa(sb, null, input.unidade_id ?? null)
  if (!empresa_id) return { ok: false, error: 'Não foi possível determinar a empresa.' }

  const { data: ac, error: ea } = await sb.from('sac_acordos').insert({
    ticket_id: null, empresa_id, unidade_id: input.unidade_id ?? null,
    cliente, valor_total: input.valorTotal, n_parcelas: n,
    status: 'aguardando_ok', observacao: input.observacao?.trim() || null, criado_por: user.id,
  }).select('id').single()
  if (ea) return { ok: false, error: msgErro(ea.message, 'criar acordo') }
  const acordoId = (ac as { id: string }).id

  const base = Math.floor((input.valorTotal / n) * 100) / 100
  const parcelas = Array.from({ length: n }, (_, i) => ({
    acordo_id: acordoId, n: i + 1,
    vencimento: addMonths(d1, i).toISOString().slice(0, 10),
    valor: i === n - 1 ? Math.round((input.valorTotal - base * (n - 1)) * 100) / 100 : base,
    pago: false,
  }))
  const { error: ep } = await sb.from('sac_parcelas').insert(parcelas)
  if (ep) return { ok: false, error: ep.message }

  revalidatePath('/sac/pagamentos')
  return { ok: true }
}

/** Validação do gestor: gera as parcelas como lançamentos em Contas a Pagar (espelho parcelado). */
export async function validarAcordo(acordoId: string): Promise<{ ok: boolean; error?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'gestor', 'financeiro')) return { ok: false, error: 'Apenas gestor, financeiro ou admin valida o acordo.' }
  const sb = op.sb

  const { data: ac } = await sb.from('sac_acordos').select('id, ticket_id, empresa_id, unidade_id, cliente, status').eq('id', acordoId).single()
  const acordo = ac as { ticket_id?: string | null; empresa_id?: string; unidade_id?: string | null; cliente?: string; status?: string } | null
  if (!acordo) return { ok: false, error: 'Acordo não encontrado.' }
  if (acordo.status !== 'aguardando_ok') return { ok: false, error: 'Este acordo já foi validado ou finalizado.' }

  const { data: parc } = await sb.from('sac_parcelas').select('id, n, vencimento, valor, lancamento_id').eq('acordo_id', acordoId).order('n', { ascending: true })
  const parcelas = (parc ?? []) as { id: string; n: number; vencimento: string; valor: number; lancamento_id: string | null }[]
  const { data: cat } = await sb.from('plano_contas').select('id').eq('codigo', '2.3').limit(1).single()
  const categoria_id = (cat as { id?: string } | null)?.id ?? null
  let ref = 'acordo'
  if (acordo.ticket_id) {
    const { data: tkr } = await sb.from('sac_tickets').select('protocolo, numero').eq('id', acordo.ticket_id).single()
    const tr = tkr as { protocolo?: string; numero?: number } | null
    ref = tr?.protocolo || `SAC-${tr?.numero ?? ''}`
  }

  for (const p of parcelas) {
    if (p.lancamento_id) continue
    const { data: lf, error: e } = await sb.from('lancamentos_financeiros').insert({
      empresa_id: acordo.empresa_id, unidade_id: acordo.unidade_id ?? null, tipo: 'despesa', categoria_id,
      descricao: `Reembolso SAC · acordo · parcela ${p.n}/${parcelas.length} · ${acordo.cliente ?? ''} · ${ref}`,
      valor: p.valor, data_competencia: p.vencimento, data_vencimento: p.vencimento, status: 'pendente',
      origem: 'manual', origem_ref_id: acordo.ticket_id ?? null, observacao: `Parcela ${p.n}/${parcelas.length} do acordo`, criado_por: op.userId,
    }).select('id').single()
    if (e) return { ok: false, error: msgErro(e.message, 'gerar as parcelas no Financeiro') }
    await sb.from('sac_parcelas').update({ lancamento_id: (lf as { id: string }).id }).eq('id', p.id)
  }
  await sb.from('sac_acordos').update({ status: 'validado' }).eq('id', acordoId)
  revalidatePath('/sac/pagamentos'); revalidatePath('/financeiro')
  return { ok: true }
}
