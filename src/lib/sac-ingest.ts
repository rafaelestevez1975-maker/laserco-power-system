/**
 * Ingestão automática dos FORMULÁRIOS DE SAC do site → Chamados.
 *
 * Regra do cliente (Julio): o SAC é CENTRALIZADO na FRANQUEADORA — não existe SAC em
 * franquia. Logo, todo formulário tipo "sac" do site vira um chamado com
 *   empresa_id = franqueadora  e  unidade_id = null  (= rede/franqueadora, não uma franquia),
 * SEM passo manual de "rotear" (o lead de SAC nem aparece no inbox do comercial).
 *
 * Idempotente: marca o lead de origem como `_roteado` (mesmo mecanismo do rotearSiteLead),
 * então rodar de novo não duplica. Server-only: usa a service key do site (LER) e do lkii (GRAVAR).
 */
import { adminClient } from '@/lib/supabase/admin'
import { siteClient } from '@/lib/supabase/site'
import { candidatosOnline } from '@/lib/sac-distribuicao'

// Única empresa = a franqueadora. unidade_id null => chamado da REDE, não de uma franquia.
export const FRANQUEADORA_EMPRESA_ID = '00000000-0000-0000-0000-000000000001'

// Rótulos de `tipo` no site que representam um FORMULÁRIO DE SAC (case-insensitive).
// Hoje o site emite oferta/agendamento/avaliacao/curriculo/indicacao/franquia — NENHUM SAC.
// Quando o formulário de SAC for publicado, ele deve gravar `tipo` = um destes valores.
const TIPOS_SAC = new Set(['sac', 'reclamacao', 'reclamação', 'suporte', 'pos_venda', 'pos-venda', 'posvenda'])

type SiteLead = { id: string; tipo?: string; nome?: string; telefone?: string; email?: string; dados?: Record<string, unknown> | null }

function campo(d: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  for (const k of keys) { const v = d?.[k]; if (typeof v === 'string' && v.trim()) return v.trim() }
  return null
}

/** Cria UM chamado de SAC na franqueadora a partir de um lead do site. Retorna o id (ou null). */
async function criarChamadoSac(sb: ReturnType<typeof adminClient>, lead: SiteLead): Promise<string | null> {
  const d = (lead.dados ?? {}) as Record<string, unknown>
  const area = campo(d, 'area', 'assunto', 'servico')
  const { data, error } = await sb.from('sac_tickets').insert({
    empresa_id: FRANQUEADORA_EMPRESA_ID,
    unidade_id: null, // franqueadora/rede — não existe SAC em franquia
    nome_cliente: lead.nome || campo(d, 'nome') || 'Cliente (site)',
    email_cliente: lead.email || campo(d, 'email'),
    telefone_cliente: lead.telefone || campo(d, 'telefone', 'whatsapp'),
    assunto: area || 'Atendimento (site)',
    canal: 'formulario',
    area_reclamada: area,
    observacoes: campo(d, 'mensagem'),
  }).select('id').single()
  if (error) { console.error('[ingest-sac] insert:', error.message); return null }
  const id = (data as { id?: string })?.id ?? null
  if (id) await atribuirChamado(sb, id)
  return id
}

/** Atribui o chamado à atendente ONLINE operacional com menos chamados abertos (rede/franqueadora).
 *  Se ninguém online, fica na fila (a IA/humano pega depois). Best-effort — nunca quebra o ingest. */
async function atribuirChamado(sb: ReturnType<typeof adminClient>, ticketId: string): Promise<void> {
  try {
    const cands = await candidatosOnline(sb, null) // SAC é da rede (unidade null) → aceita as online
    if (cands.length === 0) return
    let best = cands[0], min = Infinity
    for (const id of cands) {
      const { count } = await sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', id).neq('fase', 'Concluído')
      if ((count ?? 0) < min) { min = count ?? 0; best = id }
    }
    await sb.from('sac_tickets').update({ atribuido_para: best }).eq('id', ticketId)
  } catch (e) { console.error('[ingest-sac] atribuir:', (e as Error).message) }
}

export type IngestResult = { criados: number; erros: number; jaRoteados: number }

/** Varre os formulários SAC do site ainda não roteados e cria o chamado na franqueadora. */
export async function ingestSacLeadsDoSite(): Promise<IngestResult> {
  const site = siteClient()
  if (!site) return { criados: 0, erros: 0, jaRoteados: 0 }
  const sb = adminClient()

  // Busca leves o suficiente (poucas centenas) — filtramos o tipo em JS p/ tolerar
  // variação de caixa/rótulo do formulário de SAC do site.
  const { data, error } = await site.from('lasercompany_leads')
    .select('id, tipo, nome, telefone, email, dados')
  if (error) { console.error('[ingest-sac] read site:', error.message); return { criados: 0, erros: 1, jaRoteados: 0 } }

  let criados = 0, erros = 0, jaRoteados = 0
  for (const lead of (data ?? []) as SiteLead[]) {
    if (!TIPOS_SAC.has((lead.tipo ?? '').toLowerCase().trim())) continue
    const dados = (lead.dados ?? {}) as Record<string, unknown>
    if (dados._roteado === true) { jaRoteados++; continue }
    const id = await criarChamadoSac(sb, lead)
    if (!id) { erros++; continue }
    const novos = { ...dados, _roteado: true, _routed_to: 'SAC', _routed_id: id, _routed_at: new Date().toISOString() }
    const { error: eUp } = await site.from('lasercompany_leads').update({ dados: novos }).eq('id', lead.id)
    if (eUp) console.error('[ingest-sac] mark routed:', eUp.message)
    criados++
  }
  return { criados, erros, jaRoteados }
}

// Throttle da chamada oportunista (página de Chamados) — evita varrer o site a cada load.
let ultimaIngestao = 0
const INTERVALO_MS = 60_000
/** Best-effort: roda no máx. 1x/min e NUNCA lança (a página não pode quebrar por isso). */
export async function ingestSacBestEffort(): Promise<void> {
  const agora = Date.now()
  if (agora - ultimaIngestao < INTERVALO_MS) return
  ultimaIngestao = agora
  try { await ingestSacLeadsDoSite() } catch (e) { console.error('[ingest-sac] best-effort:', (e as Error).message) }
}
