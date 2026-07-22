import { NextResponse, type NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { siteClient } from '@/lib/supabase/site'

/**
 * Traz os CURRÍCULOS do site (Supabase do site → lasercompany_leads, tipo='curriculo')
 * para o banco de talentos do RH (candidatos). Eles chegavam no site e paravam ali:
 * a tela RH · Recrutamento ficava zerada enquanto havia dezenas de candidaturas reais.
 *
 * GET/POST /api/cron/ingest-curriculos?secret=<CRON_SECRET>
 * Idempotente: usa lead.id do site como chave (guardado em notas_internas) e pula o que já veio.
 */
type LeadSite = {
  id: string; nome: string | null; telefone: string | null; email: string | null
  created_at: string | null
  dados: Record<string, string | null> | null
}

const MARCA = 'site_lead_id:' // âncora de idempotência dentro de notas_internas

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const got = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  return got === secret || req.headers.get('authorization') === `Bearer ${secret}`
}

async function ingerir() {
  const site = siteClient()
  if (!site) return { ok: false, error: 'SITE_SUPABASE_SERVICE_KEY ausente' }
  const sb = adminClient()

  const { data: leadsRaw, error: eLeads } = await site
    .from('lasercompany_leads')
    .select('id, nome, telefone, email, created_at, dados')
    .eq('tipo', 'curriculo')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (eLeads) return { ok: false, error: eLeads.message }
  const leads = (leadsRaw ?? []) as LeadSite[]
  if (!leads.length) return { ok: true, novos: 0, jaExistiam: 0, total: 0 }

  // Já importados (marca com o id do lead do site nas notas).
  const { data: jaRaw } = await sb.from('candidatos').select('notas_internas').like('notas_internas', `%${MARCA}%`).limit(5000)
  const ja = new Set<string>()
  for (const r of (jaRaw ?? []) as { notas_internas: string | null }[]) {
    const m = (r.notas_internas ?? '').match(new RegExp(`${MARCA}([\\w-]+)`))
    if (m) ja.add(m[1])
  }

  // Vaga guarda-chuva (mesma do cadastro manual e do POST /api/curriculos).
  const { data: vExist } = await sb.from('vagas').select('id').eq('titulo', 'Banco de Talentos (Site)').limit(1).maybeSingle()
  let vagaId = (vExist as { id?: string } | null)?.id
  if (!vagaId) {
    const { data: u } = await sb.from('unidades').select('id').eq('ativa', true).order('nome', { ascending: true }).limit(1).maybeSingle()
    const uniId = (u as { id?: string } | null)?.id
    if (!uniId) return { ok: false, error: 'sem unidade ativa para a vaga guarda-chuva' }
    const { data: nv, error: ev } = await sb.from('vagas')
      .insert({ unidade_id: uniId, titulo: 'Banco de Talentos (Site)', cargo: 'consultora_vendas', status: 'aberta', total_vagas: 99 })
      .select('id').single()
    if (ev) return { ok: false, error: ev.message }
    vagaId = (nv as { id?: string })?.id
  }

  const pendentes = leads.filter((l) => !ja.has(l.id))
  if (!pendentes.length) return { ok: true, novos: 0, jaExistiam: leads.length, total: leads.length }

  const linhas = pendentes.map((l) => {
    const d = l.dados ?? {}
    // O site manda a candidatura inteira em `dados` — preserva tudo em notas (o RH lê na ficha).
    const notas = [
      `${MARCA}${l.id}`,
      d.vaga && `Vaga pretendida: ${d.vaga}`,
      d.salario && `Pretensão: R$ ${d.salario}`,
      d.cidade && `Cidade: ${d.cidade}${d.estado ? '/' + d.estado : ''}`,
      d.nascimento && `Nascimento: ${d.nascimento}`,
      d.estado_civil && `Estado civil: ${d.estado_civil}`,
      d.filhos && `Filhos: ${d.filhos}`,
      d.fds && `Disponível fim de semana: ${d.fds}`,
      d.dermato && `Experiência dermato: ${d.dermato}`,
      d.ultimo_trabalho && `Último trabalho: ${d.ultimo_trabalho}`,
      d.endereco && `Endereço: ${d.endereco}`,
      d.sobre && `Sobre: ${d.sobre}`,
    ].filter(Boolean).join(' · ')

    return {
      vaga_id: vagaId,
      nome: (l.nome || d.nome || 'Candidato').trim(),
      email: (l.email || d.email || '')?.trim() || null,
      telefone: (l.telefone || d.telefone || '')?.trim() || '',
      cpf: (d.cpf || '')?.trim() || null,
      fonte: 'portal', // constraint candidatos_fonte_check: portal|whatsapp|indicacao|linkedin|outro
      estagio_kanban: 'triagem',
      notas_internas: notas,
      criado_em: l.created_at || new Date().toISOString(),
    }
  })

  const { error: eIns } = await sb.from('candidatos').insert(linhas)
  if (eIns) return { ok: false, error: eIns.message }
  return { ok: true, novos: linhas.length, jaExistiam: leads.length - linhas.length, total: leads.length }
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await ingerir())
}
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await ingerir())
}
