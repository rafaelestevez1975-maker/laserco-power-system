import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { MarketingManager } from '@/components/marketing/MarketingManager'
import type { CampanhaRow, TemplateOpt } from '@/components/marketing/CampanhasWhatsapp'
import type { MaterialNode, AtualizacaoRow, NoticiaRow } from '@/components/marketing/MateriaisRede'

export const dynamic = 'force-dynamic'

const LIMITE = 200 // teto de campanhas listadas (a unidade tem volume baixo)

type SP = { status?: string; seg?: string; q?: string }

type CampDb = {
  id: string; nome: string; descricao: string | null; mensagem_base: string | null
  template_id: string | null; template_nome: string | null; segmentacao_tipo: string | null
  status: string | null; agendado_para: string | null; iniciado_em: string | null; concluido_em: string | null
  ia_personalizar: boolean | null; ia_instrucao: string | null
  total_destinatarios: number | null; total_enviados: number | null; total_entregues: number | null
  total_lidos: number | null; total_responderam: number | null; total_falhou: number | null
  unidade_id: string | null; criado_em: string | null
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const isAdmin = ehAdmin(ctx?.papel)
  const uniNome: Record<string, string> = Object.fromEntries((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))
  const podeEscrever = isAdmin || ['gestor', 'operacoes', 'marketing'].includes(ctx?.papel ?? '')

  // ─────────────── CENTRAL DE MATERIAIS DA REDE (legado buildMarketing) ───────────────
  let migrationPendente = false

  // Atualizações da rede (mkt_atualizacoes).
  let atualizacoes: AtualizacaoRow[] = []
  {
    const { data, error } = await sb
      .from('mkt_atualizacoes')
      .select('id, data_ref, tipo, descricao, onde, novo')
      .order('data_ref', { ascending: false })
    if (error && /mkt_atualizacoes|relation|does not exist|schema cache/i.test(error.message)) migrationPendente = true
    else atualizacoes = (data ?? []) as AtualizacaoRow[]
  }

  // Notícias (mkt_noticias).
  let noticias: NoticiaRow[] = []
  {
    const { data, error } = await sb
      .from('mkt_noticias')
      .select('id, data_ref, titulo, resumo, autor')
      .order('data_ref', { ascending: false })
    if (error && /mkt_noticias|relation|does not exist|schema cache/i.test(error.message)) migrationPendente = true
    else noticias = (data ?? []) as NoticiaRow[]
  }

  // Árvore de materiais (mkt_materiais)  carrega tudo da empresa e monta a árvore no client.
  let materiais: MaterialNode[] = []
  {
    const { data, error } = await sb
      .from('mkt_materiais')
      .select('id, parent_id, kind, nome, link_url, ordem')
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true })
    if (error && /mkt_materiais|relation|does not exist|schema cache/i.test(error.message)) migrationPendente = true
    else materiais = (data ?? []) as MaterialNode[]
  }

  const naoLidos = atualizacoes.filter((u) => u.novo).length

  // ─────────────── CAMPANHAS DE WHATSAPP (feature existente) ───────────────
  let campanhas: CampanhaRow[] = []
  let semTabelaCampanhas = false
  let q = sb
    .from('campanhas_whatsapp')
    .select(
      'id, nome, descricao, mensagem_base, template_id, template_nome, segmentacao_tipo, status, agendado_para, iniciado_em, concluido_em, ia_personalizar, ia_instrucao, total_destinatarios, total_enviados, total_entregues, total_lidos, total_responderam, total_falhou, unidade_id, criado_em',
    )
    .order('criado_em', { ascending: false })
    .limit(LIMITE)
  if (unidadeId) q = q.eq('unidade_id', unidadeId)
  if (sp.status) q = q.eq('status', sp.status)
  if (sp.seg) q = q.eq('segmentacao_tipo', sp.seg)
  if (sp.q) {
    const qs = sp.q.replace(/[,()*]/g, ' ').trim()
    if (qs) q = q.ilike('nome', `%${qs}%`)
  }

  const { data: campData, error: campErr } = await q
  if (campErr && /relation|does not exist|schema cache/i.test(campErr.message)) semTabelaCampanhas = true
  campanhas = ((campData as CampDb[] | null) ?? []).map((c) => ({
    id: c.id, nome: c.nome, descricao: c.descricao, mensagem_base: c.mensagem_base,
    template_id: c.template_id, template_nome: c.template_nome, segmentacao_tipo: c.segmentacao_tipo,
    status: c.status ?? 'rascunho', agendado_para: c.agendado_para, iniciado_em: c.iniciado_em, concluido_em: c.concluido_em,
    ia_personalizar: !!c.ia_personalizar, ia_instrucao: c.ia_instrucao,
    enviados: c.total_enviados ?? 0, entregues: c.total_entregues ?? 0, lidos: c.total_lidos ?? 0,
    responderam: c.total_responderam ?? 0, falhou: c.total_falhou ?? 0, destinatarios: c.total_destinatarios ?? 0,
    unidade: c.unidade_id ? uniNome[c.unidade_id] ?? 'Unidade' : 'Todas',
  }))

  let cEnviados = 0, cEntregues = 0, cLidos = 0, cResponderam = 0
  for (const c of campanhas) { cEnviados += c.enviados; cEntregues += c.entregues; cLidos += c.lidos; cResponderam += c.responderam }

  const { data: tplRaw } = await sb
    .from('whatsapp_templates')
    .select('id, nome, finalidade, conteudo, ativo')
    .eq('ativo', true)
    .order('nome', { ascending: true })
  const templates: TemplateOpt[] = ((tplRaw as { id: string; nome: string; finalidade: string | null; conteudo: string | null }[] | null) ?? [])
    .map((t) => ({ id: t.id, nome: t.nome, finalidade: t.finalidade ?? '', conteudo: t.conteudo ?? '' }))
    .sort((a, b) => (a.finalidade === 'marketing' ? -1 : 0) - (b.finalidade === 'marketing' ? -1 : 0))

  return (
    <MarketingManager
      isAdmin={isAdmin}
      migrationPendente={migrationPendente}
      atualizacoes={atualizacoes}
      noticias={noticias}
      materiais={materiais}
      naoLidos={naoLidos}
      campanhasProps={{
        campanhas,
        templates,
        podeEscrever,
        activeUnitId: unidadeId,
        activeUnitName: ctx?.activeUnitName ?? 'Todas as unidades',
        filtros: { status: sp.status ?? '', seg: sp.seg ?? '', q: sp.q ?? '' },
        kpis: { totalCampanhas: campanhas.length, enviados: cEnviados, entregues: cEntregues, lidos: cLidos, responderam: cResponderam },
        semTabela: semTabelaCampanhas,
        erro: campErr && !semTabelaCampanhas ? campErr.message : null,
      }}
    />
  )
}
