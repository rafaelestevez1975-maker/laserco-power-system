'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro, type SB } from '@/lib/sb'
import { temPapel } from '@/lib/rbac'
import { adminClient } from '@/lib/supabase/admin'
import { listInstances, sendText, sendMedia } from '@/lib/uazapi'
import { reHostMidia } from '@/lib/sac-midia'

// Papéis que operam a triagem (admin_geral sempre passa via temPapel).
const PAPEIS_TRIAGEM = ['sac', 'gestor'] as const
const STATUS_VALIDOS = ['aberto', 'pendente', 'em_atendimento', 'resolvido', 'fechado'] as const
type StatusConversa = (typeof STATUS_VALIDOS)[number]

/** Gate-padrão da triagem: exige login + papel de atendimento/gestão.
 *  Centraliza o requireOperador + temPapel repetido em toda ação sensível. */
async function guardTriagem(): Promise<
  | { ok: true; sb: SB; userId: string; nome: string; papel: string }
  | { ok: false; error: string }
> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error: error || 'Sessão expirada.' }
  if (!temPapel(op.papel, ...PAPEIS_TRIAGEM)) return { ok: false, error: 'Você não tem permissão para atender no SAC.' }
  return { ok: true, sb: op.sb, userId: op.userId, nome: op.nome, papel: op.papel }
}

/** Localiza um canal WhatsApp conectado da Laser&Co. */
async function canalConectado(): Promise<{ token?: string; error?: string }> {
  const all = await listInstances()
  const canal = all.find((i) => /laser/i.test(i.name) && i.status === 'connected')
  if (!canal?.token) return { error: 'Nenhum canal WhatsApp conectado — conecte um número em Canais.' }
  return { token: canal.token }
}

/** Responde a conversa pelo canal conectado, registra a saída com o ATENDENTE real
 *  e assume a conversa (atribui ao atendente + pausa o bot). */
export async function responderConversa(chatId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { sb, userId, nome } = g
  if (!texto.trim()) return { ok: false, error: 'Escreva a mensagem.' }

  const { data: chat } = await sb.from('sac_whatsapp_chats').select('id, telefone, atendente_id').eq('id', chatId).single()
  const c = chat as { telefone?: string; atendente_id?: string | null } | null
  if (!c?.telefone) return { ok: false, error: 'Conversa não encontrada.' }

  const canal = await canalConectado()
  if (!canal.token) return { ok: false, error: canal.error }

  const env = await sendText(canal.token, c.telefone, texto.trim())
  if (!env.ok) return { ok: false, error: env.error || 'Falha no envio.' }

  const agora = new Date().toISOString()
  await sb.from('sac_whatsapp_mensagens').insert({
    chat_id: chatId, direcao: 'saida', autor: nome, enviada_por: userId, tipo: 'text', texto: texto.trim(), status: 'sent', criado_em: agora,
  })
  // Ao responder, assume a conversa (se ainda sem dono) e pausa o bot.
  const patch: Record<string, unknown> = { ultima_msg: texto.trim().slice(0, 120), ultima_msg_tipo: 'text', ultima_msg_em: agora, bot_ativo: false }
  if (!c.atendente_id) patch.atendente_id = userId
  await sb.from('sac_whatsapp_chats').update(patch).eq('id', chatId)

  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Envia mídia (imagem/áudio/voz/documento) pelo canal e registra a saída. */
export async function enviarMidia(chatId: string, m: { tipo: 'image' | 'audio' | 'ptt' | 'video' | 'document'; file: string; caption?: string; nomeArquivo?: string; mimetype?: string }): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { sb, userId, nome } = g
  if (!m.file) return { ok: false, error: 'Arquivo vazio.' }

  const { data: chat } = await sb.from('sac_whatsapp_chats').select('id, telefone, atendente_id').eq('id', chatId).single()
  const c = chat as { telefone?: string; atendente_id?: string | null } | null
  if (!c?.telefone) return { ok: false, error: 'Conversa não encontrada.' }

  const canal = await canalConectado()
  if (!canal.token) return { ok: false, error: canal.error }

  const env = await sendMedia(canal.token, c.telefone, m.tipo, m.file, { caption: m.caption, docName: m.nomeArquivo })
  if (!env.ok) return { ok: false, error: env.error || 'Falha no envio da mídia.' }

  // Guarda a mídia ENVIADA num bucket público p/ exibir de volta no chat (a UAZAPI
  // nem sempre devolve URL pública) — usa a fileURL da UAZAPI se houver, senão o arquivo local.
  const midiaUrl = await reHostMidia(env.fileURL || m.file, { mime: m.mimetype, prefixo: 'enviadas' })

  const agora = new Date().toISOString()
  const previewTxt = m.caption || ({ image: '📷 Imagem', audio: '🎤 Áudio', ptt: '🎤 Áudio', video: '🎬 Vídeo', document: '📎 Documento' }[m.tipo] || '📩 Mídia')
  await sb.from('sac_whatsapp_mensagens').insert({
    chat_id: chatId, direcao: 'saida', autor: nome, enviada_por: userId, tipo: m.tipo === 'ptt' ? 'audio' : m.tipo,
    texto: m.caption || null, midia_url: midiaUrl, midia_mimetype: m.mimetype || null, midia_nome: m.nomeArquivo || null, status: 'sent', criado_em: agora,
  })
  const patch: Record<string, unknown> = { ultima_msg: previewTxt.slice(0, 120), ultima_msg_tipo: m.tipo === 'ptt' ? 'audio' : m.tipo, ultima_msg_em: agora, bot_ativo: false }
  if (!c.atendente_id) patch.atendente_id = userId
  await sb.from('sac_whatsapp_chats').update(patch).eq('id', chatId)

  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Assume a conversa: atribui ao atendente atual e pausa o bot. */
export async function assumirConversa(chatId: string): Promise<{ ok: boolean; error?: string; responsavel?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { sb, userId, nome } = g
  const { error } = await sb.from('sac_whatsapp_chats').update({ atendente_id: userId, bot_ativo: false }).eq('id', chatId)
  if (error) return { ok: false, error: msgErro(error, 'assumir a conversa') }
  revalidatePath('/sac/triagem')
  return { ok: true, responsavel: nome }
}

/** Devolve a conversa para a fila (sem dono) — base da transferência. */
export async function devolverConversa(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { error } = await g.sb.from('sac_whatsapp_chats').update({ atendente_id: null }).eq('id', chatId)
  if (error) return { ok: false, error: msgErro(error, 'devolver a conversa') }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Transfere a conversa para outro atendente (direcionada). */
export async function transferirConversa(chatId: string, atendenteId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  if (!atendenteId) return { ok: false, error: 'Selecione o atendente.' }
  const { error } = await g.sb.from('sac_whatsapp_chats').update({ atendente_id: atendenteId, bot_ativo: false }).eq('id', chatId)
  if (error) return { ok: false, error: msgErro(error, 'transferir a conversa') }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Marca a conversa como lida (zera o contador de não-lidas). */
export async function marcarLido(chatId: string): Promise<{ ok: boolean }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false }
  await g.sb.from('sac_whatsapp_chats').update({ nao_lidas: 0 }).eq('id', chatId)
  return { ok: true }
}

export type ClienteResumo = {
  achou: boolean
  id?: string; nome?: string; cpf?: string | null; telefone?: string | null; email?: string | null
  cidade?: string | null; estado?: string | null; ativo?: boolean | null; verificado?: boolean | null
  saldoCreditos?: number | null; saldoPontos?: number | null
  agendamentos?: number; concluidos?: number; totalGasto?: number | null
}

/** Auto-import: identifica o cliente por CPF (caminho preferencial) ou telefone e traz um
 *  resumo do histórico (agendamentos, sessões concluídas, total gasto, saldos) — base para o
 *  atendimento e o cálculo de devolução. */
export async function buscarClientePorContato(telefone?: string | null, cpf?: string | null): Promise<ClienteResumo> {
  const g = await guardTriagem()
  if (!g.ok) return { achou: false }
  const cpfDig = (cpf || '').replace(/\D/g, '')
  const telDig = (telefone || '').replace(/\D/g, '')
  if (cpfDig.length < 11 && telDig.length < 8) return { achou: false }

  const adm = adminClient() // leitura agregada read-only (autorização de papel já validada acima)
  const cols = 'id, nome, cpf, telefone, email, cidade, estado, ativo, verificado, saldo_creditos, saldo_pontos, bemp_id'
  let cli: Record<string, unknown> | null = null
  // CPF é o casamento preferencial (o legado pedia CPF justamente para isso).
  if (cpfDig.length >= 11) {
    const { data } = await adm.from('clientes').select(cols).or(`cpf.eq.${cpfDig},cpf.eq.${cpf}`).limit(1).maybeSingle()
    cli = data as Record<string, unknown> | null
  }
  if (!cli && telDig.length >= 8) {
    const last = telDig.slice(-8)
    const { data } = await adm.from('clientes').select(cols).ilike('telefone', `%${last}%`).limit(1).maybeSingle()
    cli = data as Record<string, unknown> | null
  }
  if (!cli) return { achou: false }

  const id = cli.id as string
  const bempId = cli.bemp_id as string | null
  const { count: ag } = await adm.from('agendamentos').select('id', { count: 'exact', head: true }).eq('cliente_id', id)
  const { count: conc } = await adm.from('agendamentos').select('id', { count: 'exact', head: true }).eq('cliente_id', id).not('concluido_em', 'is', null)
  let totalGasto: number | null = null
  if (bempId) {
    const { data: bills } = await adm.from('bemp_billings').select('total').eq('bemp_customer_id', bempId).limit(2000)
    if (bills) totalGasto = (bills as { total: number | null }[]).reduce((s, b) => s + (Number(b.total) || 0), 0)
  }

  return {
    achou: true, id, nome: cli.nome as string, cpf: cli.cpf as string | null, telefone: cli.telefone as string | null,
    email: cli.email as string | null, cidade: cli.cidade as string | null, estado: cli.estado as string | null,
    ativo: cli.ativo as boolean | null, verificado: cli.verificado as boolean | null,
    saldoCreditos: cli.saldo_creditos as number | null, saldoPontos: cli.saldo_pontos as number | null,
    agendamentos: ag ?? 0, concluidos: conc ?? 0, totalGasto,
  }
}

/** Reativa a IA de atendimento na conversa (volta o bot e remove o atendente humano). */
export async function reativarIA(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { error } = await g.sb.from('sac_whatsapp_chats').update({ bot_ativo: true, atendente_id: null }).eq('id', chatId)
  if (error) return { ok: false, error: msgErro(error, 'reativar a IA') }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Adiciona uma nota interna à conversa (não vai ao cliente). */
export async function adicionarNota(chatId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { sb, userId, nome } = g
  if (!texto.trim()) return { ok: false, error: 'Escreva a nota.' }
  const { error } = await sb.from('sac_whatsapp_notas').insert({ chat_id: chatId, autor_id: userId, autor_nome: nome, texto: texto.trim() })
  if (error) return { ok: false, error: msgErro(error, 'salvar a nota') }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Altera o status da conversa: aberto | pendente | resolvido. */
export async function alterarStatusConversa(chatId: string, status: StatusConversa): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  if (!STATUS_VALIDOS.includes(status)) return { ok: false, error: 'Status inválido.' }
  const patch: Record<string, unknown> = { status }
  if (status === 'resolvido' || status === 'fechado') patch.nao_lidas = 0
  const { error } = await g.sb.from('sac_whatsapp_chats').update(patch).eq('id', chatId)
  if (error) return { ok: false, error: msgErro(error, 'alterar o status') }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

/** Descarta/arquiva a conversa: tira da fila de triagem (paridade do legado sacTriDescartar).
 *  Sem schema próprio de "descartado" → marca status 'fechado' (mesmo conjunto de status já usado
 *  no projeto) e zera não-lidas. As conversas fechadas saem da lista ativa de triagem. */
export async function descartarConversa(chatId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { error } = await g.sb.from('sac_whatsapp_chats').update({ status: 'fechado', nao_lidas: 0, atendente_id: null, bot_ativo: false }).eq('id', chatId)
  if (error) return { ok: false, error: msgErro(error, 'descartar a conversa') }
  revalidatePath('/sac/triagem')
  return { ok: true }
}

export type AbrirChamadoInput = {
  nome?: string
  cpf?: string
  telefone?: string
  email?: string
  unidade_id?: string | null
  motivo?: string
}

/** Resolve a empresa: da unidade escolhida → da empresa única. */
async function resolverEmpresa(sb: SB, unidadeId?: string | null): Promise<string | null> {
  if (unidadeId) {
    const { data } = await sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
    const e = (data as { empresa_id?: string } | null)?.empresa_id
    if (e) return e
  }
  const { data } = await sb.from('empresas').select('id').limit(1).single()
  return (data as { id?: string } | null)?.id ?? null
}

/** Abre um chamado no SAC a partir da conversa e vincula o chat ao ticket.
 *  Porta o "Fluxo inicial — dados do cliente" do legado (sacTriAbrir): captura
 *  nome, CPF, WhatsApp, e-mail, unidade e motivo; valida nome + unidade obrigatórios. */
export async function abrirChamadoDaConversa(chatId: string, input: AbrirChamadoInput = {}): Promise<{ ok: boolean; error?: string; jaExistia?: boolean }> {
  const g = await guardTriagem()
  if (!g.ok) return { ok: false, error: g.error }
  const { sb } = g

  const { data: chat } = await sb.from('sac_whatsapp_chats').select('id, telefone, nome, ticket_id').eq('id', chatId).single()
  const c = chat as { telefone?: string; nome?: string; ticket_id?: string | null } | null
  if (!c) return { ok: false, error: 'Conversa não encontrada.' }
  if (c.ticket_id) return { ok: true, jaExistia: true }

  // Dados do fluxo inicial (legado): nome e unidade são obrigatórios.
  const nome = (input.nome || c.nome || c.telefone || '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome do cliente.' }
  const unidade_id = input.unidade_id || null
  if (!unidade_id) return { ok: false, error: 'Selecione a unidade atendida.' }

  const cpfDig = (input.cpf || '').replace(/\D/g, '')
  if (cpfDig && cpfDig.length !== 11) return { ok: false, error: 'CPF deve ter 11 dígitos.' }
  const email = (input.email || '').trim()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'E-mail inválido.' }

  const empresa_id = await resolverEmpresa(sb, unidade_id)
  if (!empresa_id) return { ok: false, error: 'Não foi possível determinar a empresa.' }

  const motivo = (input.motivo || '').trim()
  const { data: ins, error } = await sb.from('sac_tickets').insert({
    empresa_id, unidade_id,
    nome_cliente: nome,
    cpf_cliente: cpfDig || null,
    telefone_cliente: (input.telefone || c.telefone || '').trim() || null,
    email_cliente: email || null,
    assunto: motivo || 'Atendimento WhatsApp',
    motivo_label: motivo || null,
    canal: 'WhatsApp', status: 'aberto', prioridade: 'media', fase: 'Novo',
  }).select('id').single()
  if (error) return { ok: false, error: msgErro(error, 'abrir o chamado') }

  await sb.from('sac_whatsapp_chats').update({ ticket_id: (ins as { id?: string })?.id }).eq('id', chatId)
  revalidatePath('/sac/triagem'); revalidatePath('/sac/chamados'); revalidatePath('/sac')
  return { ok: true }
}
