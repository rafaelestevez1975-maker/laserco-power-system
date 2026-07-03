'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { msgErro as rlsMsg } from '@/lib/sb'
import { listInstances, sendText } from '@/lib/uazapi'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/** Estágios canônicos do processo seletivo (CHECK em candidatos.estagio_kanban). */
export const ESTAGIOS = ['triagem', 'entrevista_rh', 'teste_tecnico', 'entrevista_gestor', 'proposta', 'contratado', 'reprovado'] as const
export type Estagio = (typeof ESTAGIOS)[number]
const FONTES = ['portal', 'whatsapp', 'indicacao', 'linkedin', 'outro']

// rlsMsg = msgErro (compartilhado em @/lib/sb  DRY, ver docs/CONSOLIDACAO.md D1)

/** Move um candidato para outro estágio do kanban (com motivo quando reprovado). */
export async function moverCandidato(id: string, estagio: Estagio, motivo?: string): Promise<ActionResult> {
  if (!ESTAGIOS.includes(estagio)) return { ok: false, error: 'Estágio inválido.' }
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const patch: Record<string, unknown> = { estagio_kanban: estagio }
  patch.motivo_reprovacao = estagio === 'reprovado' ? (motivo?.trim() || 'Sem motivo informado') : null
  const { error } = await sb.from('candidatos').update(patch).eq('id', id)
  if (error) return { ok: false, error: rlsMsg(error.message, 'mover o candidato') }
  revalidatePath('/rh/recrutamento')
  return { ok: true }
}

/** Inicia o processo seletivo de um currículo: triagem → entrevista_rh.
 *  (Ação explícita por candidato  anti-ban: NÃO joga a lista toda no kanban.)
 *  A mensagem automática de disponibilidade via WhatsApp dispara quando houver
 *  um canal conectado (UAZAPI)  registrada como nota por enquanto. */
export async function iniciarProcesso(id: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { data: cur } = await sb.from('candidatos').select('notas_internas, estagio_kanban').eq('id', id).single()
  const c = cur as { notas_internas?: string | null; estagio_kanban?: string } | null
  if (!c) return { ok: false, error: 'Currículo não encontrado.' }
  if (c.estagio_kanban !== 'triagem') return { ok: false, error: 'Este currículo já está em processo.' }
  const nota = [c.notas_internas, '• Pré-selecionado  aguardando msg de disponibilidade (WhatsApp)'].filter(Boolean).join('\n')
  const { error } = await sb.from('candidatos').update({ estagio_kanban: 'entrevista_rh', notas_internas: nota }).eq('id', id)
  if (error) return { ok: false, error: rlsMsg(error.message, 'iniciar o processo') }
  revalidatePath('/rh/recrutamento')
  return { ok: true }
}

/** Atualiza as notas internas do candidato (espelhadas no currículo). */
export async function atualizarNotas(id: string, notas: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { error } = await sb.from('candidatos').update({ notas_internas: notas }).eq('id', id)
  if (error) return { ok: false, error: rlsMsg(error.message, 'salvar as notas') }
  revalidatePath('/rh/recrutamento')
  return { ok: true }
}

export type NovoCurriculo = { nome: string; email?: string; telefone?: string; cargo?: string; fonte?: string; notas?: string }
/** Cadastra um currículo manual no banco de talentos (estágio 'triagem'). */
export async function criarCurriculo(form: NovoCurriculo): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const nome = form.nome?.trim()
  if (!nome) return { ok: false, error: 'Informe o nome do candidato.' }

  // vaga guarda-chuva do banco de talentos (mesma usada pelos leads do site).
  const { data: vExist } = await sb.from('vagas').select('id').eq('titulo', 'Banco de Talentos (Site)').limit(1).maybeSingle()
  let vagaId = (vExist as { id?: string } | null)?.id
  if (!vagaId) {
    const { data: u } = await sb.from('unidades').select('id').eq('ativa', true).order('nome', { ascending: true }).limit(1).single()
    const uniId = (u as { id?: string } | null)?.id
    if (!uniId) return { ok: false, error: 'Sem unidade para vincular o banco de talentos.' }
    const { data: nv, error: ev } = await sb.from('vagas')
      .insert({ unidade_id: uniId, titulo: 'Banco de Talentos (Site)', cargo: form.cargo?.trim() || 'consultora_vendas', status: 'aberta', total_vagas: 99 })
      .select('id').single()
    if (ev) return { ok: false, error: rlsMsg(ev.message, 'criar a vaga') }
    vagaId = (nv as { id?: string })?.id
  }
  const fonte = FONTES.includes(form.fonte || '') ? form.fonte : 'outro'
  const notas = [form.cargo && `Cargo/área: ${form.cargo}`, form.notas].filter(Boolean).join(' · ') || null
  const { data: ins, error } = await sb.from('candidatos').insert({
    vaga_id: vagaId, nome, email: form.email?.trim() || null, telefone: form.telefone?.trim() || '',
    fonte, estagio_kanban: 'triagem', notas_internas: notas,
  }).select('id').single()
  if (error) return { ok: false, error: rlsMsg(error.message, 'cadastrar o currículo') }
  revalidatePath('/rh/recrutamento')
  return { ok: true, id: (ins as { id?: string })?.id }
}

/** Envia a mensagem de disponibilidade ao candidato pelo WhatsApp (canal conectado)
 *  e registra na nota. Depende de um número conectado em Canais. */
export async function avisarDisponibilidade(id: string, mensagem?: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }

  const { data: c } = await sb.from('candidatos').select('nome, telefone, notas_internas').eq('id', id).single()
  const cand = c as { nome?: string; telefone?: string | null; notas_internas?: string | null } | null
  if (!cand) return { ok: false, error: 'Candidato não encontrado.' }
  if ((cand.telefone || '').replace(/\D/g, '').length < 10) return { ok: false, error: 'Candidato sem telefone válido.' }

  const canal = (await listInstances()).find((i) => /laser/i.test(i.name) && i.status === 'connected')
  if (!canal?.token) return { ok: false, error: 'Nenhum canal WhatsApp conectado  conecte um número em Canais.' }

  const primeiro = (cand.nome || '').trim().split(/\s+/)[0] || 'tudo bem'
  const texto = mensagem?.trim()
    || `Olá ${primeiro}! Aqui é do RH da Laser&Co. Surgiu uma oportunidade e gostaríamos de saber se você tem interesse e disponibilidade. Pode nos retornar? 😊`
  const env = await sendText(canal.token, cand.telefone as string, texto)
  if (!env.ok) return { ok: false, error: env.error || 'Falha no envio.' }

  const nota = [cand.notas_internas, `• Mensagem de disponibilidade enviada via WhatsApp em ${new Date().toLocaleString('pt-BR')}`].filter(Boolean).join('\n')
  await sb.from('candidatos').update({ notas_internas: nota }).eq('id', id)
  revalidatePath('/rh/recrutamento')
  return { ok: true }
}

/** Define a nota de triagem (0–100) do candidato (score_triagem_ia). */
export async function definirScore(id: string, score: number): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const s = Math.max(0, Math.min(100, Math.round(score || 0)))
  const { error } = await sb.from('candidatos').update({ score_triagem_ia: s }).eq('id', id)
  if (error) return { ok: false, error: rlsMsg(error.message, 'salvar a nota de triagem') }
  revalidatePath('/rh/recrutamento')
  return { ok: true }
}
