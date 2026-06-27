'use server'

import { revalidatePath } from 'next/cache'
import { requireOperador, msgErro } from '@/lib/sb'
import { ehAdmin } from '@/lib/rbac'
import type { ActionResult } from '@/lib/types'

// Valores aceitos pelo discriminador/colunas da migration 050.
// Legado EXP_TIPOS (8537): 5 linhas de oferta.
const TIPOS_LEAD = ['Ultracell', 'Quanta', 'Franquia', 'Ultracell Pro', 'Quanta Light'] as const
// Legado EXP_TEMPS (8539): 5 níveis.
const TEMPERATURAS = ['gelado', 'frio', 'morno', 'quente', 'ardente'] as const
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
  empresa?: string
  uf?: string
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

  // Campos opcionais do legado (empresa/UF) — colunas adicionadas pela migration 050.
  const uf = (input.uf || '').trim().toUpperCase().slice(0, 2) || null
  const empresa = input.empresa?.trim() || null

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
    empresa,
    uf,
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

// Nomes/sobrenomes para o lead simulado (paridade com _premNome do legado).
const SIM_NOMES = ['Mariana', 'Eduardo', 'Patrícia', 'Rafael', 'Camila', 'Bruno', 'Juliana', 'Henrique', 'Larissa', 'Felipe']
const SIM_SOBR = ['Castro', 'Lemos', 'Nunes', 'Andrade', 'Ferreira', 'Tavares', 'Prado', 'Sales', 'Moraes', 'Vieira']
const SIM_UFS = ['SP', 'RS', 'SC', 'MG', 'PR', 'BA', 'GO', 'RJ']

/**
 * Simula a chegada de um novo lead de captação (webhook de teste) — legado expSimularLead (8587).
 * Cria um lead origem 'site' ou 'geolocalizado' na etapa "Novo Lead" do funil de franquia,
 * com temperatura 'morno'. Usado para validar a integração do formulário do site.
 */
export async function simularLeadFranquia(unidadeId: string): Promise<{ ok: boolean; error?: string; origem?: string }> {
  const { op, error } = await requireOperador()
  if (!op) return { ok: false, error }
  if (!ehAdmin(op.papel) && !unidadeId) return { ok: false, error: 'Selecione a unidade ativa para simular.' }
  if (!unidadeId) return { ok: false, error: 'Selecione a unidade.' }

  // Busca a etapa "Novo Lead" do pipeline de franquia (onde o legado deposita o lead).
  const { data: etapaNovo, error: eEt } = await op.sb
    .from('crm_etapas')
    .select('id')
    .eq('pipeline', 'franquia')
    .eq('nome', 'Novo Lead')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (eEt) {
    if (pipelineAusente(eEt.message)) return { ok: false, error: MIGRATION_PENDENTE }
    return { ok: false, error: msgErro(eEt.message, 'localizar a etapa Novo Lead') }
  }
  const etapaId = (etapaNovo as { id?: string } | null)?.id
  if (!etapaId) return { ok: false, error: 'Etapa "Novo Lead" não encontrada — aplique a migration 050.' }

  const { data: uni } = await op.sb.from('unidades').select('empresa_id').eq('id', unidadeId).single()
  const empresa_id = (uni as { empresa_id?: string } | null)?.empresa_id
  if (!empresa_id) return { ok: false, error: 'Unidade sem empresa vinculada.' }

  const seed = Date.now()
  const origem = seed % 2 ? 'geolocalizado' : 'site'
  const nome = `${SIM_NOMES[seed % SIM_NOMES.length]} ${SIM_SOBR[(seed >> 3) % SIM_SOBR.length]}`
  const tipo_lead = TIPOS_LEAD[(seed >> 5) % TIPOS_LEAD.length]
  const uf = SIM_UFS[(seed >> 7) % SIM_UFS.length]
  const tel = `(11) 9${1000 + (seed % 9000)}-${1000 + ((seed >> 4) % 9000)}`

  const { error: e } = await op.sb.from('crm_leads').insert({
    empresa_id,
    unidade_id: unidadeId,
    etapa_id: etapaId,
    responsavel_id: op.userId,
    nome,
    telefone: tel,
    email: 'novo@email.com',
    empresa: `Clínica ${SIM_SOBR[(seed >> 9) % SIM_SOBR.length]}`,
    uf,
    origem,
    valor_estimado: null,
    status: 'ativo',
    pipeline: 'franquia',
    tipo_lead,
    temperatura: 'morno',
  })
  if (e) {
    if (pipelineAusente(e.message)) return { ok: false, error: MIGRATION_PENDENTE }
    return { ok: false, error: msgErro(e.message, 'simular novo lead') }
  }
  revalidatePath('/expansao')
  return { ok: true, origem }
}
