import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { dataBR } from '@/lib/fmt'
import { AgendaGrade, type AgGridProps, type Profissional, type Agendamento, type Bloqueio } from '@/components/agenda/AgendaGrade'

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

type SP = { d?: string }

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const dia = validDia(sp.d)
  const ctx = await getSessionContext()
  const sb = await createClient()
  const unidadeId = ctx?.activeUnitId ?? null
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

  // ── Agendamentos do dia (só o dia/unidade — nunca os 136k) ──
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
    profissionais,
    agendamentos,
    bloqueios,
    servicos,
    unidadeId,
    podeAgendar: !!unidadeId, // criar exige uma unidade ativa selecionada no topo
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

// TODO(legado): banda de eventos da rede (renderRede / redeBand / btnEvtRede em buildAgenda)
//   — não há tabela de eventos da rede no schema lkii. Toggle "Mostrar eventos" omitido.
// TODO(legado): "Ocupação" (agOcup / agOcupRender em buildAgenda) — barra de ocupação por
//   profissional acima da grade. Deixado para depois.
// TODO(legado): seletor de GAP por unidade (uniSetGap) — usamos GAP fixo de 10min (padrão da rede).
