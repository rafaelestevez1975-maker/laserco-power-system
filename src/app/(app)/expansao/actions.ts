'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import type { ActionResult } from '@/lib/types'

// Valores aceitos pelo discriminador/colunas da migration 050.
const TIPOS_LEAD = ['Ultracell', 'Quanta', 'Franquia'] as const
const TEMPERATURAS = ['frio', 'morno', 'quente'] as const
// origem: CHECK estendido pela migration 050 (atuais + geolocalizado + site).
const ORIGENS = [
  'manual', 'formulario', 'instagram', 'whatsapp', 'indicacao',
  'google', 'outros', 'geolocalizado', 'site',
] as const

export type NovoLeadFranquiaInput = {
  nome: string
  telefone?: string
  email?: string
  origem?: string
  tipo_lead?: string
  temperatura?: string
  valor_estimado?: number | null
  unidade_id: string
  etapa_id: string
}

/** Erro do PostgREST quando a coluna `pipeline` ainda não existe (migration 050 não aplicada). */
function pipelineAusente(msg: string | undefined): boolean {
  const m = msg || ''
  return /column .*pipeline.* does not exist/i.test(m) || (/pipeline/i.test(m) && /does not exist|schema cache/i.test(m))
}

const MIGRATION_PENDENTE = 'Recurso indisponível: aplique a migration 050 (Expansão) para ativar a captação de franquias.'

/**
 * Cria um lead de FRANQUIA (pipeline='franquia') no crm_leads.
 * Validação por campo + RBAC (escrita) + escopo multitenant.
 * Defensivo: se a coluna `pipeline` ainda não existe, devolve mensagem clara.
 */
export async function criarLeadFranquia(input: NovoLeadFranquiaInput): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }

  // RBAC: captação de franquia é da franqueadora — admin geral pode sempre;
  // demais papéis precisam de unidade ativa (RLS confirma na escrita).
  if (!ehAdmin(op.papel) && !input.unidade_id) {
    return { ok: false, error: 'Selecione a unidade para registrar o lead.' }
  }

  // Validação por campo
  const nome = input.nome?.trim()
  if (!nome) return { ok: false, error: 'Informe o nome do candidato.' }
  if (!input.unidade_id) return { ok: false, error: 'Selecione a unidade.' }
  if (!input.etapa_id) return { ok: false, error: 'Etapa inválida — recarregue a página.' }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return { ok: false, error: 'E-mail inválido.' }
  }
  if (input.valor_estimado != null && (Number.isNaN(input.valor_estimado) || input.valor_estimado < 0)) {
    return { ok: false, error: 'Valor estimado inválido.' }
  }

  const origem = ORIGENS.includes((input.origem || '') as (typeof ORIGENS)[number]) ? input.origem! : 'manual'
  const tipo_lead = TIPOS_LEAD.includes((input.tipo_lead || '') as (typeof TIPOS_LEAD)[number]) ? input.tipo_lead! : 'Franquia'
  const temperatura = TEMPERATURAS.includes((input.temperatura || '') as (typeof TEMPERATURAS)[number]) ? input.temperatura! : 'morno'

  // empresa_id vem da unidade escolhida
  const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', input.unidade_id).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const { error: e } = await op.sb.from('crm_leads').insert({
    empresa_id,
    unidade_id: input.unidade_id,
    etapa_id: input.etapa_id,
    responsavel_id: op.userId,
    nome,
    email: input.email?.trim() || null,
    telefone: input.telefone?.trim() || null,
    origem,
    valor_estimado: input.valor_estimado ?? null,
    status: 'ativo',
    pipeline: 'franquia',
    tipo_lead,
    temperatura,
  })

  if (e) {
    if (pipelineAusente(e.message)) return { ok: false, error: MIGRATION_PENDENTE }
    return { ok: false, error: msgErro(e.message, 'criar lead de franquia') }
  }
  revalidatePath('/expansao')
  return { ok: true }
}

/**
 * Move um lead de franquia para outra etapa do funil de Expansão.
 * Só mexe em leads pipeline='franquia' (defesa em profundidade + RLS).
 */
export async function moverEtapa(leadId: string, etapaId: string): Promise<ActionResult> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!leadId || !etapaId) return { ok: false, error: 'Lead ou etapa inválidos.' }

  let q = op.sb.from('crm_leads').update({ etapa_id: etapaId }).eq('id', leadId)
  // restringe ao pipeline de franquia quando a coluna existe; se não existir, o filtro falha → tratamos abaixo
  q = q.eq('pipeline', 'franquia')

  const { error: e } = await q
  if (e) {
    if (pipelineAusente(e.message)) return { ok: false, error: MIGRATION_PENDENTE }
    return { ok: false, error: msgErro(e.message, 'mover o lead') }
  }
  revalidatePath('/expansao')
  return { ok: true }
}
