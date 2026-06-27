'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'

export type ActionResult = { ok: boolean; error?: string; avisoSobreposicao?: boolean; novoClienteId?: string }

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
  // NÃO filtrar por unidade: a base de clientes é compartilhada e unidade_origem_id é NULL em 100% dos registros.

  const safe = t.replace(/[,()*%]/g, ' ').trim()
  if (!safe) return []
  q = q.or(`nome.ilike.%${safe}%,telefone.ilike.%${safe}%,cpf.ilike.%${safe}%`)

  const { data } = await q
  return ((data ?? []) as Array<{ id: string; nome: string | null; telefone: string | null }>)
    .map((c) => ({ id: c.id, nome: c.nome || 'Cliente', telefone: c.telefone }))
}

/** Cap de ocupação da agenda: soma de serviços ocupa no MÁX 60min (regra do legado). */
const CAP_SERVICOS_MIN = 60

export type CriarAgendamentoInput = {
  unidade_id: string
  /** perfil_id do profissional (FK agendamentos.profissional_id → perfis_usuario.id). */
  profissional_id: string
  cliente_id: string
  /** serviço principal (FK agendamentos.servico_id). 1ª opção do legado = Avaliação. */
  servico_id: string
  /** serviços adicionais (legado addServico): a soma das durações é capada em 60min. */
  servico_ids_extra?: string[]
  /** ISO local "YYYY-MM-DDTHH:mm" — combinado dia+hora pela grade. */
  inicio: string
  /** duração em minutos (vem da SOMA dos serviços; capada em 60). default 10 = GAP. */
  duracao_min?: number
  observacao?: string
  /** "Agendou pelo SAC?" — campo customizado do legado. */
  via_sac?: boolean
  /** recorrência (legado recBox): repete a cada N semanas/meses por M vezes. */
  recorrencia?: { intervalo: number; unidade: 'semana' | 'mes'; vezes: number }
  /** quando true, ignora o aviso de sobreposição e grava mesmo assim. */
  forcar?: boolean
}

/** Soma os meses no fuso BR preservando o dia (para recorrência mensal). */
function addPeriodo(base: Date, unidade: 'semana' | 'mes', intervalo: number): Date {
  const d = new Date(base.getTime())
  if (unidade === 'semana') d.setDate(d.getDate() + 7 * intervalo)
  else d.setMonth(d.getMonth() + intervalo)
  return d
}

/**
 * Cria um agendamento. Validação por campo + checagem de sobreposição no mesmo
 * profissional (avisa; só grava à força se `forcar`). Suporta múltiplos serviços
 * (soma de durações capada em 60min) e recorrência (repete N vezes). RBAC operador.
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

  // Duração = soma dos serviços, mas a OCUPAÇÃO na agenda é capada em 60min (regra do legado:
  // "Acima de 1h — limitado a 60 min" pelo alto índice de faltas).
  const durBruta = Math.max(5, Number(input.duracao_min) || 10)
  const dur = Math.min(durBruta, CAP_SERVICOS_MIN)
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

  // Observação: registra serviços extras e marcador de SAC (não há colunas dedicadas no schema:
  // agendamentos tem 1 servico_id; os adicionais ficam anotados na observação).
  const extras = (input.servico_ids_extra ?? []).filter(Boolean)
  const obsPartes = [input.observacao?.trim() || '']
  if (extras.length) obsPartes.push(`[+${extras.length} serviço(s) adicional(is)]`)
  if (input.via_sac) obsPartes.push('[Agendou pelo SAC]')
  const observacao = obsPartes.filter(Boolean).join(' · ') || null

  // ── Recorrência (legado recBox): repete a cada N semanas/meses por M vezes ──
  const rec = input.recorrencia
  const vezes = rec ? Math.max(1, Math.min(52, Number(rec.vezes) || 1)) : 1
  const intervalo = rec ? Math.max(1, Number(rec.intervalo) || 1) : 1
  const linhas: Array<Record<string, unknown>> = []
  let curIni = inicioDate
  let curFim = fimDate
  for (let i = 0; i < vezes; i++) {
    linhas.push({
      empresa_id,
      unidade_id: input.unidade_id,
      profissional_id: input.profissional_id,
      cliente_id: input.cliente_id,
      servico_id: input.servico_id,
      inicio: curIni.toISOString(),
      fim: curFim.toISOString(),
      status: 'aberto', // valor inicial real do enum status_agendamento
      origem: 'manual',
      observacao,
      criado_por: op.userId,
    })
    if (rec && i + 1 < vezes) {
      curIni = addPeriodo(curIni, rec.unidade, intervalo)
      curFim = new Date(curIni.getTime() + dur * 60_000)
    }
  }

  const { error: e } = await op.sb.from('agendamentos').insert(linhas)
  if (e) return { ok: false, error: msgErro(e, 'criar agendamento') }

  revalidatePath('/agenda')
  return { ok: true }
}

/**
 * Confirma um agendamento (status=confirmado, confirmado_em=now).
 * `viaCliente=true` → o cliente confirmou pelo WhatsApp (legado agConfirmar(true)):
 * registra a origem da confirmação na observação ("cliente confirmou via WhatsApp").
 */
export async function confirmarAgendamento(id: string, viaCliente = false): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!id) return { ok: false, error: 'Agendamento inválido.' }

  // Anexa quem/como confirmou na observação (schema não tem coluna dedicada de origem).
  const { data: cur } = await op.sb.from('agendamentos').select('observacao').eq('id', id).maybeSingle()
  const obsAtual = (cur as { observacao?: string | null } | null)?.observacao || ''
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const tag = viaCliente
    ? `[Confirmado · cliente confirmou via WhatsApp em ${quando}]`
    : `[Confirmado · equipe em ${quando}]`
  const observacao = [obsAtual, tag].filter(Boolean).join(' · ')

  const { error: e } = await op.sb
    .from('agendamentos')
    .update({ status: 'confirmado', confirmado_em: new Date().toISOString(), observacao })
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

/**
 * Cadastro rápido de cliente direto no modal de agendamento (legado: quickReg).
 * Cria com nome + telefone + e-mail e devolve o id para já vincular ao agendamento.
 */
export async function cadastrarClienteRapido(input: {
  nome: string; telefone?: string; email?: string; unidade_id?: string | null
}): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  const nome = (input.nome || '').trim()
  if (nome.length < 2) return { ok: false, error: 'Informe o nome do cliente.' }
  const email = (input.email || '').trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'E-mail inválido.' }
  const tel = (input.telefone || '').replace(/\D/g, '')

  // empresa_id herdado da unidade ativa (quando houver).
  let empresa_id: string | null = null
  if (input.unidade_id) {
    const { data: u } = await op.sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).maybeSingle()
    empresa_id = (u as { empresa_id?: string | null } | null)?.empresa_id ?? null
  }

  const { data, error: e } = await op.sb
    .from('clientes')
    .insert({
      nome,
      telefone: tel || null,
      email: email || null,
      canal_origem: 'Agenda',
      unidade_origem_id: input.unidade_id ?? null,
      empresa_id,
      ativo: true,
      verificado: false,
    })
    .select('id')
    .single()
  if (e) return { ok: false, error: msgErro(e, 'cadastrar cliente') }
  return { ok: true, novoClienteId: (data as { id: string }).id }
}

/**
 * Cria um bloqueio de horário na agenda (legado: botão "Criar bloqueio").
 * Grava em bloqueios_agenda (a grade já lê de lá). RBAC: operações/gestor/admin.
 */
export async function criarBloqueio(input: {
  unidade_id: string; profissional_id: string | null; dia: string
  hora_inicio: string; hora_fim: string; nome?: string
}): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'gestor', 'operacoes')) return { ok: false, error: 'Você não tem permissão para criar bloqueios.' }
  if (!input.unidade_id) return { ok: false, error: 'Selecione a unidade.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dia)) return { ok: false, error: 'Data inválida.' }
  if (!/^\d{2}:\d{2}/.test(input.hora_inicio) || !/^\d{2}:\d{2}/.test(input.hora_fim)) return { ok: false, error: 'Informe o intervalo do bloqueio.' }
  if (input.hora_fim <= input.hora_inicio) return { ok: false, error: 'O fim do bloqueio deve ser depois do início.' }

  const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).maybeSingle()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const motivoTxt = (input.nome || '').trim() || 'Bloqueio de horário'
  const { error: e } = await op.sb.from('bloqueios_agenda').insert({
    empresa_id,
    unidade_id: input.unidade_id,
    profissional_id: input.profissional_id,
    nome: motivoTxt,
    motivo: motivoTxt,
    data_inicio: input.dia,
    data_fim: input.dia,
    hora_inicio: input.hora_inicio,
    hora_fim: input.hora_fim,
    recorrente: false,
  })
  if (e) return { ok: false, error: msgErro(e, 'criar bloqueio') }

  revalidatePath('/agenda')
  return { ok: true }
}

// ─────────────────────────── Eventos da rede (banda da agenda) ───────────────────────────
export type EventoRedeInput = {
  titulo: string; tipo: string; data: string
  hora_inicio?: string; hora_fim?: string; link?: string; audiencia: string[]
}

/**
 * Publica um evento da rede (legado: saveEvt / btnEvtRede). Só admin/gestor.
 * Eventos aparecem na banda informativa do dia na agenda e NÃO bloqueiam horário.
 * Requer a tabela rede_eventos (scripts/migrations/agenda.sql).
 */
export async function publicarEventoRede(input: EventoRedeInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'gestor', 'operacoes')) {
    return { ok: false, error: 'Somente administradores podem adicionar eventos.' }
  }
  const titulo = (input.titulo || '').trim()
  if (!titulo) return { ok: false, error: 'Informe o assunto do evento.' }
  if (!Array.isArray(input.audiencia) || input.audiencia.length === 0) {
    return { ok: false, error: 'Selecione ao menos um direcionamento.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data)) return { ok: false, error: 'Informe a data do evento.' }

  // empresa_id do perfil (via unidade ativa do operador; fallback: 1ª unidade visível).
  const { data: perfil } = await op.sb.from('perfis_usuario').select('unidade_id').eq('id', op.userId).maybeSingle()
  let empresa_id: string | null = null
  const uid = (perfil as { unidade_id?: string | null } | null)?.unidade_id ?? null
  if (uid) {
    const { data: u } = await op.sb.from('unidades').select('empresa_id').eq('id', uid).maybeSingle()
    empresa_id = (u as { empresa_id?: string | null } | null)?.empresa_id ?? null
  }
  if (!empresa_id) {
    const { data: u } = await op.sb.from('unidades').select('empresa_id').limit(1).maybeSingle()
    empresa_id = (u as { empresa_id?: string | null } | null)?.empresa_id ?? null
  }
  if (!empresa_id) return { ok: false, error: 'Não foi possível identificar a empresa.' }

  const { error: e } = await op.sb.from('rede_eventos').insert({
    empresa_id,
    unidade_id: uid,
    titulo,
    tipo: input.tipo || 'Evento',
    data: input.data,
    hora_inicio: (input.hora_inicio || '').trim() || null,
    hora_fim: (input.hora_fim || '').trim() || null,
    link: (input.link || '').trim() || null,
    audiencia: input.audiencia,
    criado_por: op.userId,
  })
  if (e) return { ok: false, error: msgErro(e, 'publicar evento') }

  revalidatePath('/agenda')
  return { ok: true }
}

/** Remove um evento da rede (admin/gestor). */
export async function excluirEventoRede(id: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!temPapel(op.papel, 'gestor', 'operacoes')) {
    return { ok: false, error: 'Sem permissão para excluir eventos.' }
  }
  if (!id) return { ok: false, error: 'Evento inválido.' }
  const { error: e } = await op.sb.from('rede_eventos').delete().eq('id', id)
  if (e) return { ok: false, error: msgErro(e, 'excluir evento') }
  revalidatePath('/agenda')
  return { ok: true }
}

// TODO(legado): "Nova venda" a partir do horário (abrir OS/venda) — buildAgenda() abre OS
//   ao clicar; integração de vendas/OS fora do escopo deste módulo.
