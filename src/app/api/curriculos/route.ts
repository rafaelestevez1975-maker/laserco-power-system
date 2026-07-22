import { NextResponse, type NextRequest } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

/**
 * Recebe currículos do SITE (formulário "Trabalhe conosco") e joga no banco de talentos
 * do RH — antes o site não tinha para onde mandar e a tela de Recrutamento ficava vazia.
 *
 * POST /api/curriculos?secret=<CURRICULOS_WEBHOOK_SECRET>
 *   { nome*, email, telefone, cpf, cargo, curriculo_url, linkedin_url, mensagem }
 *
 * Cai no MESMO lugar do cadastro manual: vaga guarda-chuva "Banco de Talentos (Site)",
 * estagio_kanban='triagem', fonte='site' — o recrutador filtra e só então inicia o processo.
 */
type Body = {
  nome?: string; email?: string; telefone?: string; cpf?: string
  cargo?: string; curriculo_url?: string; linkedin_url?: string; mensagem?: string
}

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CURRICULOS_WEBHOOK_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production' // sem secret: só fora de produção
  const got = req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  return got === secret
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Body | null
  const nome = (body?.nome ?? '').trim()
  if (!nome) return NextResponse.json({ error: 'nome-obrigatorio' }, { status: 400 })

  const sb = adminClient()

  // Vaga guarda-chuva do banco de talentos (mesma do cadastro manual em rh/recrutamento).
  const { data: vExist } = await sb.from('vagas').select('id').eq('titulo', 'Banco de Talentos (Site)').limit(1).maybeSingle()
  let vagaId = (vExist as { id?: string } | null)?.id
  if (!vagaId) {
    const { data: u } = await sb.from('unidades').select('id').eq('ativa', true).order('nome', { ascending: true }).limit(1).maybeSingle()
    const uniId = (u as { id?: string } | null)?.id
    if (!uniId) return NextResponse.json({ error: 'sem-unidade' }, { status: 500 })
    const { data: nv, error: ev } = await sb.from('vagas')
      .insert({ unidade_id: uniId, titulo: 'Banco de Talentos (Site)', cargo: (body?.cargo ?? '').trim() || 'consultora_vendas', status: 'aberta', total_vagas: 99 })
      .select('id').single()
    if (ev) return NextResponse.json({ error: ev.message }, { status: 500 })
    vagaId = (nv as { id?: string })?.id
  }

  const notas = [body?.cargo && `Cargo/área: ${body.cargo}`, body?.mensagem].filter(Boolean).join(' · ') || null
  const { data: ins, error } = await sb.from('candidatos').insert({
    vaga_id: vagaId,
    nome,
    email: (body?.email ?? '').trim() || null,
    telefone: (body?.telefone ?? '').trim() || '',
    cpf: (body?.cpf ?? '').trim() || null,
    curriculo_url: (body?.curriculo_url ?? '').trim() || null,
    linkedin_url: (body?.linkedin_url ?? '').trim() || null,
    fonte: 'portal', // constraint candidatos_fonte_check: portal|whatsapp|indicacao|linkedin|outro
    estagio_kanban: 'triagem',
    notas_internas: notas,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (ins as { id?: string })?.id })
}
