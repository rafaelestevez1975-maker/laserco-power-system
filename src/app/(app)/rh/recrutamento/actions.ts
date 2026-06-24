'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { ok: boolean; error?: string; id?: string }

/** Estágios canônicos do processo seletivo (CHECK em candidatos.estagio_kanban). */
export const ESTAGIOS = ['triagem', 'entrevista_rh', 'teste_tecnico', 'entrevista_gestor', 'proposta', 'contratado', 'reprovado'] as const
export type Estagio = (typeof ESTAGIOS)[number]
const FONTES = ['portal', 'whatsapp', 'indicacao', 'linkedin', 'outro']

const rlsMsg = (m: string, what: string) =>
  /row-level|policy|permission|denied/i.test(m) ? `Sem permissão para ${what}.` : m

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
 *  (Ação explícita por candidato — anti-ban: NÃO joga a lista toda no kanban.)
 *  A mensagem automática de disponibilidade via WhatsApp dispara quando houver
 *  um canal conectado (UAZAPI) — registrada como nota por enquanto. */
export async function iniciarProcesso(id: string): Promise<ActionResult> {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { ok: false, error: 'Sessão expirada.' }
  const { data: cur } = await sb.from('candidatos').select('notas_internas, estagio_kanban').eq('id', id).single()
  const c = cur as { notas_internas?: string | null; estagio_kanban?: string } | null
  if (!c) return { ok: false, error: 'Currículo não encontrado.' }
  if (c.estagio_kanban !== 'triagem') return { ok: false, error: 'Este currículo já está em processo.' }
  const nota = [c.notas_internas, '• Pré-selecionado — aguardando msg de disponibilidade (WhatsApp)'].filter(Boolean).join('\n')
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
