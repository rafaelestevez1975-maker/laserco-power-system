import { createClient } from '@/lib/supabase/server'
import { moedaBR } from '@/lib/fmt'
import { AppClienteMockup } from '@/components/app-cliente/AppClienteMockup'
import {
  REGRAS_PONTOS, nivelDePontos, iconeServico,
  type AppData, type AppServ, type AppUnit,
} from '@/lib/app-cliente'

export const dynamic = 'force-dynamic'

/**
 * App do Cliente — prévia navegável do aplicativo do consumidor, agora alimentada
 * com DADOS REAIS do tenant (catálogo de serviços, unidades, profissionais e um
 * cliente real com saldo de pontos/créditos + próximo agendamento e histórico).
 * As ações dentro do telefone seguem sendo demonstrativas (sem persistência).
 */

const fmtDataHora = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dia = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d)
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d)
  return `${dia.replace('.', '')} · ${hora}`
}
const fmtData = (iso: string): string => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d)
}
const enderecoUnidade = (u: { endereco: string | null; cidade: string | null; estado: string | null }): string =>
  [u.endereco, u.cidade, u.estado].filter(Boolean).join(' · ') || 'Endereço não informado'

export default async function AppClientePage() {
  const sb = await createClient()
  const nowISO = new Date().toISOString()

  // Catálogo, unidades e profissionais REAIS + cliente real (de maior saldo de pontos).
  const [servRes, uniRes, colabRes, cliRes] = await Promise.all([
    sb.from('servicos').select('nome, descricao, preco_padrao').eq('ativo', true).order('nome').limit(40),
    sb.from('unidades').select('id, nome, endereco, cidade, estado').eq('ativa', true).order('nome').limit(40),
    sb.from('colaboradores').select('id, nome').eq('status', 'ativo').order('nome').limit(40),
    // Cliente real da prévia. Preferimos quem tem saldo de pontos; se ninguém tiver
    // (fidelidade ainda não populada no backend), cai para um cliente ativo qualquer.
    sb.from('clientes').select('id, nome, saldo_pontos, saldo_creditos').eq('ativo', true)
      .order('saldo_pontos', { ascending: false, nullsFirst: false }).order('criado_em', { ascending: false }).limit(1),
  ])

  const colabMap = new Map(((colabRes.data ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]))
  const uniRows = (uniRes.data ?? []) as { id: string; nome: string; endereco: string | null; cidade: string | null; estado: string | null }[]
  const uniMap = new Map(uniRows.map((u) => [u.id, u.nome.trim()]))

  // Serviços: nome aparado, preço só quando > 0 (senão "Sob consulta"), no máx. 12 visíveis.
  const services: AppServ[] = ((servRes.data ?? []) as { nome: string; descricao: string | null; preco_padrao: number | null }[])
    .map((s) => ({ nome: (s.nome || '').trim(), descricao: s.descricao, preco: Number(s.preco_padrao) || 0 }))
    .filter((s) => s.nome.length > 0)
    .slice(0, 12)
    .map((s) => ({ n: s.nome, d: s.descricao || 'Serviço Laser&Co.', p: s.preco > 0 ? moedaBR(s.preco) : 'Sob consulta', ic: iconeServico(s.nome) }))
  // Unidades: aparadas e sem as marcadas como inativas no nome ("[INATIVA] ...").
  const units: AppUnit[] = uniRows
    .map((u) => ({ ...u, nome: (u.nome || '').trim() }))
    .filter((u) => u.nome.length > 0 && !u.nome.startsWith('['))
    .slice(0, 12)
    .map((u) => ({ n: u.nome, e: enderecoUnidade(u), t: (u.cidade || '').trim() }))
  const professionals = ['Sem preferência', ...Array.from(colabMap.values())]

  let profile: AppData['profile'] = null
  let next: AppData['next'] = null
  let history: [string, string][] = []

  const cli = ((cliRes.data ?? []) as { id: string; nome: string; saldo_pontos: number | null; saldo_creditos: number | null }[])[0]
  if (cli) {
    const pts = Number(cli.saldo_pontos) || 0
    const nivel = nivelDePontos(pts)
    profile = {
      nome: (cli.nome || 'Cliente').trim().split(' ')[0] || 'Cliente',
      nomeCompleto: (cli.nome || 'Cliente').trim(),
      pts,
      nivel,
      cash: Math.round(Number(cli.saldo_creditos) || 0),
      cashPct: REGRAS_PONTOS.cashback[nivel] ?? 3,
    }

    // Próximo agendamento futuro DESTE cliente + histórico realizado DESTE cliente.
    const [proxRes, histRes] = await Promise.all([
      sb.from('agendamentos').select('inicio, servico_id, profissional_id, unidade_id')
        .eq('cliente_id', cli.id).gte('inicio', nowISO).not('status', 'in', '(cancelado)')
        .order('inicio', { ascending: true }).limit(1),
      sb.from('agendamentos').select('servico_id, concluido_em')
        .eq('cliente_id', cli.id).not('concluido_em', 'is', null)
        .order('concluido_em', { ascending: false }).limit(5),
    ])

    // Resolve nomes de serviço (próximo + histórico) em uma consulta.
    const proxRow = ((proxRes.data ?? []) as { inicio: string; servico_id: string | null; profissional_id: string | null; unidade_id: string | null }[])[0]
    const histRows = (histRes.data ?? []) as { servico_id: string | null; concluido_em: string }[]
    const servIds = Array.from(new Set([proxRow?.servico_id, ...histRows.map((h) => h.servico_id)].filter(Boolean))) as string[]
    const servMap = new Map<string, string>()
    if (servIds.length > 0) {
      const { data } = await sb.from('servicos').select('id, nome').in('id', servIds)
      for (const s of (data ?? []) as { id: string; nome: string }[]) servMap.set(s.id, (s.nome || '').trim())
    }

    if (proxRow) {
      next = {
        serv: proxRow.servico_id ? (servMap.get(proxRow.servico_id) || 'Sessão') : 'Sessão',
        data: fmtDataHora(proxRow.inicio),
        prof: proxRow.profissional_id ? (colabMap.get(proxRow.profissional_id) || 'A definir') : 'A definir',
        unid: proxRow.unidade_id ? (uniMap.get(proxRow.unidade_id) || '') : '',
      }
    }
    history = histRows.map((h) => [
      h.servico_id ? (servMap.get(h.servico_id) || 'Sessão') : 'Sessão',
      fmtData(h.concluido_em),
    ] as [string, string])
  }

  const data: AppData = {
    profile,
    next,
    services,
    units,
    professionals,
    history,
    packages: [], // sem tabela de pacotes-por-cliente no backend → seção mostra estado vazio honesto
  }

  return <AppClienteMockup data={data} />
}
