import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { temPapel } from '@/lib/rbac'
import { dataBR } from '@/lib/fmt'
import { AGENDA_GAPS, AGENDA_GAP_PADRAO, calcOcupacao } from '@/lib/agenda'
import { AgendaGrade, type AgGridProps, type Profissional, type Agendamento, type Bloqueio, type EventoRede } from '@/components/agenda/AgendaGrade'

export const dynamic = 'force-dynamic'

/** "YYYY-MM-DD" do dia atual no fuso BR (sem depender do TZ do servidor). */
function hojeBR(): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
  return f.format(new Date())
}

function validDia(d: string | undefined): string {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hojeBR()
}

/** Limites [00:00, 24:00) do dia em ISO (interpretado no fuso BR, -03:00). */
function rangeDoDia(dia: string): { ini: string; fim: string } {
  const ini = new Date(`${dia}T00:00:00-03:00`)
  const fim = new Date(ini.getTime() + 24 * 3600 * 1000)
  return { ini: ini.toISOString(), fim: fim.toISOString() }
}

type SP = { d?: string; gap?: string }

function validGap(g: string | undefined): number {
  const n = Number(g)
  return AGENDA_GAPS.includes(n) ? n : AGENDA_GAP_PADRAO
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const dia = validDia(sp.d)
  const gap = validGap(sp.gap)
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
  const podeGerenciarEventos = temPapel(ctx?.papel, 'gestor', 'operacoes')
  const { ini, fim } = rangeDoDia(dia)

  // ── Profissionais = colaboradores ativos da unidade (colunas da grade) ──
  // perfil_id liga o colaborador ao perfis_usuario (alvo do FK agendamentos.profissional_id).
  let qCol = sb
    .from('colaboradores')
    .select('id, nome, cargo, perfil_id, status, unidade_id')
    .eq('status', 'ativo')
    .order('nome', { ascending: true })
  if (unidadeId) qCol = qCol.eq('unidade_id', unidadeId)
  const { data: colsRaw } = await qCol
  const profissionais: Profissional[] = ((colsRaw ?? []) as Array<{ id: string; nome: string | null; cargo: string | null; perfil_id: string | null }>)
    .map((c) => ({ id: c.id, perfilId: c.perfil_id, nome: (c.nome || 'Profissional').trim(), cargo: c.cargo }))

  // ── Agendamentos do dia (só o dia/unidade  nunca os 136k) ──
  // FK profissional_id → perfis_usuario (embed desambiguado). cliente/servico via FK direto.
  let qAg = sb
    .from('agendamentos')
    .select('id, inicio, fim, status, observacao, profissional_id, cliente_id, servico_id, cliente:clientes(nome), servico:servicos(nome, duracao_min), profissional:perfis_usuario!agendamentos_profissional_id_fkey(nome_completo)')
    .gte('inicio', ini)
    .lt('inicio', fim)
    .order('inicio', { ascending: true })
    .limit(800)
  if (unidadeId) qAg = qAg.eq('unidade_id', unidadeId)
  const { data: agRaw } = await qAg

  type AgRow = {
    id: string; inicio: string; fim: string | null; status: string | null; observacao: string | null
    profissional_id: string | null; cliente_id: string | null; servico_id: string | null
    cliente: { nome: string | null } | { nome: string | null }[] | null
    servico: { nome: string | null; duracao_min: number | null } | { nome: string | null; duracao_min: number | null }[] | null
    profissional: { nome_completo: string | null } | { nome_completo: string | null }[] | null
  }
  const pick = <T,>(e: T | T[] | null): T | null => (Array.isArray(e) ? (e[0] ?? null) : e)

  const agendamentos: Agendamento[] = ((agRaw ?? []) as AgRow[]).map((a) => ({
    id: a.id,
    inicio: a.inicio,
    fim: a.fim,
    status: a.status,
    observacao: a.observacao,
    profissionalPerfilId: a.profissional_id,
    clienteNome: pick(a.cliente)?.nome ?? null,
    servicoNome: pick(a.servico)?.nome ?? null,
    servicoDuracao: pick(a.servico)?.duracao_min ?? null,
    profissionalNome: pick(a.profissional)?.nome_completo ?? null,
  }))

  // ── Bloqueios de agenda do dia (introspectado: data_inicio/data_fim date, hora_inicio/fim time) ──
  let qBl = sb
    .from('bloqueios_agenda')
    .select('id, nome, motivo, profissional_id, data_inicio, data_fim, hora_inicio, hora_fim, recorrente')
    .lte('data_inicio', dia)
    .gte('data_fim', dia)
  if (unidadeId) qBl = qBl.eq('unidade_id', unidadeId)
  const { data: blRaw } = await qBl
  const bloqueios: Bloqueio[] = ((blRaw ?? []) as Array<{ id: string; nome: string | null; motivo: string | null; profissional_id: string | null; hora_inicio: string | null; hora_fim: string | null }>)
    .map((b) => ({ id: b.id, nome: b.nome || b.motivo || 'Bloqueio', profissionalPerfilId: b.profissional_id, horaInicio: b.hora_inicio, horaFim: b.hora_fim }))

  // ── Serviços ativos (para o modal de criação) ──
  const { data: servRaw } = await sb
    .from('servicos').select('id, nome, duracao_min').eq('ativo', true).order('nome', { ascending: true }).limit(1000)
  const servicos = ((servRaw ?? []) as Array<{ id: string; nome: string | null; duracao_min: number | null }>)
    .map((s) => ({ id: s.id, nome: s.nome || 'Serviço', duracao_min: s.duracao_min ?? 10 }))

  // ── Eventos da rede do dia (banda informativa; NÃO bloqueiam horário) ──
  // Lê de rede_eventos (scripts/migrations/agenda.sql). Falha silenciosa se a tabela não existe.
  let eventosRede: EventoRede[] = []
  try {
    let qEv = sb
      .from('rede_eventos')
      .select('id, titulo, tipo, data, hora_inicio, hora_fim, link, audiencia, unidade_id')
      .eq('data', dia)
    // eventos da rede inteira (unidade_id null) OU da unidade ativa.
    if (unidadeId) qEv = qEv.or(`unidade_id.is.null,unidade_id.eq.${unidadeId}`)
    const { data: evRaw, error: evErr } = await qEv.order('hora_inicio', { ascending: true })
    if (!evErr) {
      eventosRede = ((evRaw ?? []) as Array<{ id: string; titulo: string | null; tipo: string | null; hora_inicio: string | null; hora_fim: string | null; link: string | null; audiencia: string[] | null }>)
        .map((e) => ({ id: e.id, titulo: e.titulo || 'Evento', tipo: e.tipo || 'Evento', horaInicio: e.hora_inicio, horaFim: e.hora_fim, link: e.link, audiencia: e.audiencia ?? [] }))
    }
  } catch { /* tabela rede_eventos ausente → banda vazia */ }

  // ── Ocupação da agenda (agOcupRender): nProf × 12h ÷ 30min, +45% faltas ──
  const agendadosHoje = agendamentos.filter((a) => a.status !== 'cancelado').length
  const ocupacao = calcOcupacao(profissionais.length, agendadosHoje)

  // ── KPIs do dia (sobre os agendamentos carregados). Enum real: aberto | confirmado |
  //    em_atendimento | concluido | cancelado | no_show (no_show = falta). ──
  const naoCancelados = agendamentos.filter((a) => a.status !== 'cancelado')
  const kpis = {
    total: naoCancelados.length,
    confirmados: agendamentos.filter((a) => a.status === 'confirmado').length,
    faltas: agendamentos.filter((a) => a.status === 'no_show').length,
    concluidos: agendamentos.filter((a) => a.status === 'concluido').length,
  }

  // Navegação de dia (querystring ?d=)
  const diaDate = new Date(`${dia}T12:00:00-03:00`)
  const prev = new Date(diaDate.getTime() - 24 * 3600 * 1000)
  const next = new Date(diaDate.getTime() + 24 * 3600 * 1000)
  const fmtParam = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
  const ehHoje = dia === hojeBR()
  const labelDia = `${dataBR(diaDate)}${ehHoje ? ' · Hoje' : ''}`

  const props: AgGridProps = {
    dia,
    diaPrev: fmtParam(prev),
    diaNext: fmtParam(next),
    labelDia,
    gap,
    profissionais,
    agendamentos,
    bloqueios,
    servicos,
    eventosRede,
    ocupacao,
    unidadeId,
    podeAgendar: !!unidadeId, // criar exige uma unidade ativa selecionada no topo
    podeGerenciarEventos,
  }

  return (
    <div className="view active">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '4px 0 16px' }}>
        <div className="metric-box"><span>Agendamentos do dia</span><b>{kpis.total}</b></div>
        <div className="metric-box"><span>Confirmados</span><b>{kpis.confirmados}</b></div>
        <div className="metric-box"><span>Faltas</span><b>{kpis.faltas}</b></div>
        <div className="metric-box"><span>Concluídos</span><b>{kpis.concluidos}</b></div>
      </div>

      {!unidadeId && (
        <div className="modal-note" style={{ marginBottom: 12, fontSize: 12.5 }}>
          <i className="ti ti-info-circle" /> Você está vendo <b>todas as unidades</b>. Selecione uma unidade no topo para agendar e ver as colunas de profissionais corretas.
        </div>
      )}

      <AgendaGrade {...props} />
    </div>
  )
}
