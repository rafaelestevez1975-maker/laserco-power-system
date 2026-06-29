'use server'

import { createClient } from '@/lib/supabase/server'

export type Notificacao = {
  tipo: 'chamado_atraso' | 'chamado_novo' | 'comunicado'
  titulo: string
  detalhe: string
  href: string
  quando: string | null
}

const SLA_MS = 48 * 3600 * 1000

/** Notificações de intranet (EPIC 18.4 / anotação nº 9 + nº 10):
 *  - chamado que chegou (aberto nas últimas 48h, não finalizado)
 *  - chamado que entrou em atraso (passou do SLA de 48h)
 *  - comunicado obrigatório pendente de "ciente"
 *  O escopo dos chamados já é filtrado pela RLS (admin vê tudo). */
export async function carregarNotificacoes(): Promise<{ total: number; itens: Notificacao[] }> {
  const sb = await createClient()
  // getSession() lê/valida o token localmente (sem round-trip de rede ao Auth do Supabase) —
  // suficiente para a contagem de notificações (não-sensível; a RLS ainda protege as queries).
  const { data: { session } } = await sb.auth.getSession()
  const user = session?.user
  if (!user) return { total: 0, itens: [] }

  const itens: Notificacao[] = []
  const now = Date.now()

  const { data: chs } = await sb.from('chamados')
    .select('numero, assunto, de_parte, para_parte, aberto_em, finalizado')
    .eq('finalizado', false).order('aberto_em', { ascending: false }).limit(100)
  for (const c of (chs ?? []) as { numero: number; assunto: string; de_parte: string; para_parte: string; aberto_em: string }[]) {
    const aberto = new Date(c.aberto_em).getTime()
    const detalhe = `${c.assunto} · ${c.de_parte} → ${c.para_parte}`
    if (now > aberto + SLA_MS) itens.push({ tipo: 'chamado_atraso', titulo: `Chamado #${c.numero} atrasado`, detalhe, href: '/chamados', quando: c.aberto_em })
    else if (now - aberto < SLA_MS) itens.push({ tipo: 'chamado_novo', titulo: `Novo chamado #${c.numero}`, detalhe, href: '/chamados', quando: c.aberto_em })
  }

  const { data: obrig } = await sb.from('comunicados')
    .select('id, titulo').eq('leitura_obrigatoria', true).eq('status', 'publicado')
  const obrigList = (obrig ?? []) as { id: string; titulo: string }[]
  if (obrigList.length) {
    const { data: lid } = await sb.from('comunicado_leituras').select('comunicado_id').eq('perfil_id', user.id)
    const lidos = new Set(((lid ?? []) as { comunicado_id: string }[]).map((r) => r.comunicado_id))
    for (const c of obrigList) if (!lidos.has(c.id)) itens.push({ tipo: 'comunicado', titulo: 'Comunicado obrigatório', detalhe: c.titulo, href: '/comunicados', quando: null })
  }

  // Prioridade visual: atraso > novo chamado > comunicado.
  const ordem = { chamado_atraso: 0, chamado_novo: 1, comunicado: 2 }
  itens.sort((a, b) => ordem[a.tipo] - ordem[b.tipo])
  return { total: itens.length, itens: itens.slice(0, 30) }
}
