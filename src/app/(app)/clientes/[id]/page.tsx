import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ehAdmin } from '@/lib/rbac'
import { ClienteFicha, type ClienteFull, type AgendamentoRow } from '@/components/clientes/ClienteFicha'

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

  return (
    <div className="view active">
      <Link href="/clientes" className="doc-back" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--text-2)', fontSize: 13, marginBottom: 8 }}>
        <i className="ti ti-arrow-left" /> Voltar aos clientes
      </Link>
      <ClienteFicha
        cliente={cliente}
        agendamentos={agendamentos}
        unidadeOrigemNome={unidadeOrigemNome}
        podeEscrever={podeEscrever}
      />
    </div>
  )
}
