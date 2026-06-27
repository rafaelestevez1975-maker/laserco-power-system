import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { JuridicoTabs } from '@/components/juridico/JuridicoTabs'
import type { DocRow } from '@/components/juridico/JuridicoManager'
import type { NotifRow } from '@/components/juridico/CobrancasTab'
import type { ModeloRow } from '@/components/juridico/ModelosTab'
import type { UnidadeJur } from '@/components/juridico/UnidadesTab'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

type SP = {
  status?: string
  q?: string
  unidade?: string
  di?: string
  df?: string
  page?: string
}

type SigEmbed = { id: string; status: string | null }

/** Detecta tabela ausente (migration não aplicada). */
function tabelaAusente(err: { message?: string } | null, tabela: string): boolean {
  const m = err?.message ?? ''
  return new RegExp(`${tabela}|relation|does not exist|42P01`, 'i').test(m)
}

export default async function JuridicoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const isAdmin = ctx?.isAdmin ?? false

  // Módulo restrito (buildJur 4940 — isAdmin): só administrador geral opera.
  if (!isAdmin) {
    return (
      <div className="view active">
        <div className="crm-note" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-shield-lock" style={{ fontSize: 20, color: 'var(--brand-600)' }} />
          <div>
            <b>Módulo restrito a administradores.</b>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              O Jurídico (notificações extrajudiciais e documentos contratuais) é de acesso exclusivo da franqueadora.
            </div>
          </div>
        </div>
      </div>
    )
  }

  const sb = await createClient()
  const unidadeAtiva = ctx?.activeUnitId ?? null
  const unidades = ctx?.unidades ?? []
  const uniNome: Record<string, string> = Object.fromEntries(unidades.map((u) => [u.id, u.nome]))

  let migrationPendente = false

  // ── Notificações jurídicas (juridico_notificacoes) — tolerante à migration ausente ──
  let notificacoes: NotifRow[] = []
  {
    let q = sb
      .from('juridico_notificacoes')
      .select('id, unidade_id, fin_id, unidade_nome, franqueado, cnpj, categoria, ref, valor, vencimento, dias_atraso, assunto, corpo, status, enviada_em, criado_em')
      .order('criado_em', { ascending: false })
      .limit(500)
    if (unidadeAtiva) q = q.eq('unidade_id', unidadeAtiva)
    const { data, error } = await q
    if (error && tabelaAusente(error, 'juridico_notificacoes')) migrationPendente = true
    else notificacoes = (data ?? []) as NotifRow[]
  }

  // ── Modelos de notificação (juridico_templates) ──
  let modelos: ModeloRow[] = []
  {
    const { data, error } = await sb
      .from('juridico_templates')
      .select('id, nome, assunto, corpo, ordem')
      .order('ordem', { ascending: true })
      .limit(200)
    if (error && tabelaAusente(error, 'juridico_templates')) migrationPendente = true
    else modelos = (data ?? []) as ModeloRow[]
  }

  // ── Documentos contratuais (juridico_documentos) por unidade ──
  type DocContratual = { unidade_id: string; tipo: string; arquivo: string; data_doc: string | null }
  let docsContratuais: DocContratual[] = []
  {
    let q = sb.from('juridico_documentos').select('unidade_id, tipo, arquivo, data_doc').limit(2000)
    if (unidadeAtiva) q = q.eq('unidade_id', unidadeAtiva)
    const { data, error } = await q
    if (error && tabelaAusente(error, 'juridico_documentos')) migrationPendente = true
    else docsContratuais = (data ?? []) as DocContratual[]
  }

  // Unidades visíveis (RLS) com cnpj — para a aba Unidades & documentos.
  const { data: unisRaw } = await sb
    .from('unidades')
    .select('id, nome, cnpj, ativa')
    .order('nome', { ascending: true })
    .limit(1000)
  const docsPorUni: Record<string, Record<string, { arquivo: string; data: string | null }>> = {}
  for (const d of docsContratuais) {
    ;(docsPorUni[d.unidade_id] ||= {})[d.tipo] = { arquivo: d.arquivo, data: d.data_doc }
  }
  const unidadesJur: UnidadeJur[] = ((unisRaw ?? []) as { id: string; nome: string; cnpj: string | null; ativa: boolean }[])
    .filter((u) => !unidadeAtiva || u.id === unidadeAtiva)
    .map((u) => ({
      id: u.id,
      nome: (u.nome ?? '').trim(),
      cnpj: u.cnpj,
      ativa: u.ativa,
      docs: {
        contrato: docsPorUni[u.id]?.contrato ?? null,
        pre: docsPorUni[u.id]?.pre ?? null,
        cof: docsPorUni[u.id]?.cof ?? null,
      },
    }))

  // ────────────────────────────────────────────────────────────────────────────
  // Documentos para assinatura (documentos_assinatura) — recurso já existente.
  // ────────────────────────────────────────────────────────────────────────────
  const page = Math.max(1, Number(sp.page) || 1)
  const from = (page - 1) * PAGE_SIZE
  const status = sp.status ?? ''
  const q = (sp.q ?? '').trim()
  const di = sp.di ?? ''
  const df = sp.df ?? ''
  const upFiltro = unidadeAtiva ? '' : (sp.unidade ?? '')
  const escopoUnidade = unidadeAtiva || upFiltro || ''

  let listQ = sb
    .from('documentos_assinatura')
    .select(
      'id, titulo, descricao, arquivo_nome, status, prazo, ordem_sequencial, unidade_id, enviado_em, concluido_em, cancelado_em, motivo_cancelamento, criado_em, signatarios_documento(id, status)',
      { count: 'exact' },
    )
    .order('criado_em', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
  if (status) listQ = listQ.eq('status', status)
  if (escopoUnidade) listQ = listQ.eq('unidade_id', escopoUnidade)
  if (di) listQ = listQ.gte('prazo', di)
  if (df) listQ = listQ.lte('prazo', df)
  if (q) {
    const qs = q.replace(/[,()*]/g, ' ').trim()
    if (qs) listQ = listQ.or(`titulo.ilike.%${qs}%,descricao.ilike.%${qs}%,arquivo_nome.ilike.%${qs}%`)
  }

  const { data: rowsRaw, count, error: listErr } = await listQ
  const carregouOk = !listErr

  const docRows: DocRow[] = ((rowsRaw ?? []) as Array<Record<string, unknown>>).map((r) => {
    const sigs = (r.signatarios_documento as SigEmbed[] | null) ?? []
    return {
      id: String(r.id),
      titulo: (r.titulo as string | null) ?? null,
      descricao: (r.descricao as string | null) ?? null,
      arquivo_nome: (r.arquivo_nome as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      prazo: (r.prazo as string | null) ?? null,
      ordem_sequencial: (r.ordem_sequencial as boolean | null) ?? null,
      unidade_id: (r.unidade_id as string | null) ?? null,
      unidade_nome: r.unidade_id ? uniNome[String(r.unidade_id)] ?? 'Unidade' : 'Franqueadora / rede',
      enviado_em: (r.enviado_em as string | null) ?? null,
      concluido_em: (r.concluido_em as string | null) ?? null,
      cancelado_em: (r.cancelado_em as string | null) ?? null,
      motivo_cancelamento: (r.motivo_cancelamento as string | null) ?? null,
      criado_em: (r.criado_em as string | null) ?? null,
      total_signatarios: sigs.length,
      assinados: sigs.filter((s) => s.status === 'assinado').length,
    }
  })

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function contar(st?: string): Promise<number> {
    let cq = sb.from('documentos_assinatura').select('id', { count: 'exact', head: true })
    if (st) cq = cq.eq('status', st)
    if (escopoUnidade) cq = cq.eq('unidade_id', escopoUnidade)
    const { count: c } = await cq
    return c ?? 0
  }
  const [kTotal, kRascunho, kAndamento, kConcluido, kExpirado] = carregouOk
    ? await Promise.all([contar(), contar('rascunho'), contar('em_andamento'), contar('concluido'), contar('expirado')])
    : [0, 0, 0, 0, 0]

  return (
    <JuridicoTabs
      migrationPendente={migrationPendente}
      activeUnitId={unidadeAtiva}
      activeUnitName={ctx?.activeUnitName ?? 'Todas as unidades'}
      unidades={unidades}
      notificacoes={notificacoes}
      modelos={modelos}
      unidadesJur={unidadesJur}
      assinatura={{
        rows: docRows,
        carregouOk,
        mostrarUnidade: !unidadeAtiva,
        filtros: { status, q, unidade: upFiltro, di, df },
        kpis: { total: kTotal, rascunho: kRascunho, andamento: kAndamento, concluido: kConcluido, expirado: kExpirado },
        page,
        totalPages,
        total,
      }}
    />
  )
}
