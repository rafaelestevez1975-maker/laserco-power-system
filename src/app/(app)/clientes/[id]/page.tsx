import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { bunnySignedUrl } from '@/lib/bunny'
import { ClienteFicha, type ClienteFull, type AgendamentoRow, type OSRow, type ContratoRow, type DocumentoRow } from '@/components/clientes/ClienteFicha'

export const dynamic = 'force-dynamic'

const PAPEIS_ESCRITA = ['admin_geral', 'sac', 'crm', 'operacoes'] // alinhado à RLS de escrita de clientes

export default async function ClienteFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getSessionContext()
  const sb = await createClient()
  const podeEscrever = ehAdmin(ctx?.papel) || (!!ctx?.papel && PAPEIS_ESCRITA.includes(ctx.papel))

  // Cliente (a RLS já garante o escopo; se a unidade ativa não bate, vem null)
  const { data: cli } = await sb
    .from('clientes')
    .select('id, nome, telefone, email, cpf, rg, data_nascimento, genero, canal_origem, observacoes, cep, rua, numero, complemento, bairro, cidade, estado, saldo_pontos, saldo_creditos, ativo, verificado, unidade_origem_id, criado_em')
    .eq('id', id)
    .maybeSingle()

  const cliente = cli as ClienteFull | null
  if (!cliente) notFound()

  // Agendamentos do cliente (escopo natural por cliente_id; embeds que o PostgREST aceita)
  const { data: agsRaw } = await sb
    .from('agendamentos')
    .select('id, inicio, fim, status, profissional_id, servico_id, servicos(nome), unidades(nome)')
    .eq('cliente_id', id)
    .order('inicio', { ascending: false })
    .limit(100)

  // Total real de agendamentos (a lista acima é capada em 100) → KPI/rodapé honesto.
  const { count: agsTotal } = await sb
    .from('agendamentos')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', id)

  type RawAg = {
    id: string; inicio: string | null; fim: string | null; status: string | null
    profissional_id: string | null; servico_id: string | null
    servicos: { nome: string | null } | { nome: string | null }[] | null
    unidades: { nome: string | null } | { nome: string | null }[] | null
  }
  const rawAgs = (agsRaw ?? []) as RawAg[]

  // nome do profissional não tem FK no cache do PostgREST → busca em lote por id
  const profIds = [...new Set(rawAgs.map((a) => a.profissional_id).filter((x): x is string => !!x))]
  let profNome: Record<string, string> = {}
  if (profIds.length) {
    const { data: profs } = await sb.from('colaboradores').select('id, nome').in('id', profIds)
    profNome = Object.fromEntries(((profs ?? []) as { id: string; nome: string | null }[]).map((p) => [p.id, p.nome || '']))
  }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const agendamentos: AgendamentoRow[] = rawAgs.map((a) => ({
    id: a.id,
    inicio: a.inicio,
    status: a.status,
    servico: one(a.servicos)?.nome ?? null,
    unidade: one(a.unidades)?.nome ?? null,
    profissional: a.profissional_id ? (profNome[a.profissional_id] || null) : null,
  }))

  // nome da unidade de origem (para exibição)
  let unidadeOrigemNome: string | null = null
  if (cliente.unidade_origem_id) {
    const { data: u } = await sb.from('unidades').select('nome').eq('id', cliente.unidade_origem_id).maybeSingle()
    unidadeOrigemNome = (u as { nome: string | null } | null)?.nome ?? null
  }

  // Ordens de Serviço do cliente (aba OS + base p/ contratos emitidos via OS)
  const { data: osRaw } = await sb
    .from('os')
    .select('id, numero, status, origem, total, observacao, criado_em, fechada_em')
    .eq('cliente_id', id)
    .order('criado_em', { ascending: false, nullsFirst: false })
    .limit(100)
  type RawOS = { id: string; numero: number | null; status: string | null; origem: string | null; total: number | null; observacao: string | null; criado_em: string | null; fechada_em: string | null }
  const ordens: OSRow[] = ((osRaw ?? []) as RawOS[]).map((o) => ({
    id: o.id, numero: o.numero, status: o.status, origem: o.origem,
    total: o.total, observacao: o.observacao, criado_em: o.criado_em, fechada_em: o.fechada_em,
  }))

  // Total real de OS (a lista acima é capada em 100) → KPI/rodapé honesto.
  const { count: osTotal } = await sb
    .from('os')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', id)

  // Contratos/assinatura reais do cliente (tabela `contratos`, scripts/migrations/relatorios.sql).
  // A tabela pode não existir ainda → trata o erro p/ não inventar plano. cliente_id é FK real.
  let contratos: ContratoRow[] = []
  {
    const { data: ctRaw, error: ctErr } = await sb
      .from('contratos')
      .select('id, plano, status, valor_mensal, criado_em, assinado_em')
      .eq('cliente_id', id)
      .order('criado_em', { ascending: false })
    if (!ctErr) {
      type RawCt = { id: string; plano: string | null; status: string | null; valor_mensal: number | null; criado_em: string | null; assinado_em: string | null }
      contratos = ((ctRaw ?? []) as RawCt[]).map((c) => ({
        id: c.id, plano: c.plano, status: c.status, valor_mensal: c.valor_mensal,
        criado_em: c.criado_em, assinado_em: c.assinado_em,
      }))
    }
  }

  // Documentos do cliente importados do BEMP (fotos/anamneses + contratos assinados em PDF).
  // O ARQUIVO mora no Bunny (bucket clientes-docs); a tabela guarda só o vínculo. A URL é
  // assinada aqui no servidor (proxy /api/arquivo valida o HMAC e faz o stream com a AccessKey).
  const DOCS_BUCKET = 'clientes-docs'
  let documentos: DocumentoRow[] = []
  {
    const { data: docsRaw, error: dErr } = await sb
      .from('clientes_documentos')
      .select('id, tipo, titulo, arquivo_path, mime, tamanho_bytes, baixado_em')
      .eq('cliente_id', id)
      .order('tipo', { ascending: true })
      .order('baixado_em', { ascending: false })
      .limit(500)
    if (!dErr) {
      type RawDoc = { id: string; tipo: string; titulo: string | null; arquivo_path: string; mime: string | null; tamanho_bytes: number | null; baixado_em: string | null }
      documentos = ((docsRaw ?? []) as RawDoc[]).map((d) => ({
        id: d.id, tipo: d.tipo, titulo: d.titulo, mime: d.mime,
        tamanho_bytes: d.tamanho_bytes, baixado_em: d.baixado_em,
        url: bunnySignedUrl(DOCS_BUCKET, d.arquivo_path, 60 * 60), // 1h: cobre a navegação na aba
      }))
    }
  }

  // Contagem de cadastros com o MESMO nome (badge de duplicidade na ficha)
  let duplicados = 0
  if (cliente.nome) {
    let dq = sb.from('clientes').select('id', { count: 'exact', head: true }).ilike('nome', cliente.nome.trim())
    if (cliente.unidade_origem_id) dq = dq.eq('unidade_origem_id', cliente.unidade_origem_id)
    const { count } = await dq
    duplicados = count ?? 0
  }

  return (
    <div className="view active">
      <Link href="/clientes" className="doc-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--text-2)', fontSize: 13, marginBottom: 8 }}>
        <i className="ti ti-arrow-left" /> Voltar aos clientes
      </Link>
      <ClienteFicha
        cliente={cliente}
        agendamentos={agendamentos}
        agendamentosTotal={agsTotal ?? agendamentos.length}
        ordens={ordens}
        ordensTotal={osTotal ?? ordens.length}
        contratos={contratos}
        documentos={documentos}
        duplicados={duplicados}
        unidadeOrigemNome={unidadeOrigemNome}
        podeEscrever={podeEscrever}
      />
    </div>
  )
}
