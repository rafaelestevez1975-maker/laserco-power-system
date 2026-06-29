import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { dataHoraBR } from '@/lib/fmt'

export const dynamic = 'force-dynamic'

/**
 * Expansão · WhatsApp CRM — relatório read-only.
 *
 * Intenção (legado, exppage="whatsapp" + linhas ~6592/6631): conversas de WhatsApp que
 * alimentam o CRM — respondentes de disparos viram leads e a equipe segue o fluxo de
 * fechamento pela aba Conversas ("Abrir no CRM"). Aqui mostramos os KPIs das conversas
 * (abertas, não lidas, em atendimento, no bot) e a lista das conversas mais recentes.
 *
 * Fonte real CONFIRMADA: sac_whatsapp_chats / sac_whatsapp_mensagens — as únicas tabelas de
 * conversas de WhatsApp usadas no código (src/app/(app)/sac/triagem/page.tsx e o webhook
 * src/app/api/webhooks/uazapi/route.ts). As tabelas hipotéticas whatsapp_conversas /
 * whatsapp_mensagens NÃO existem no código, portanto NÃO são consultadas.
 *
 * Colunas usadas (todas confirmadas na triagem/webhook):
 *   sac_whatsapp_chats: id, telefone, nome, ultima_msg, ultima_msg_em, nao_lidas,
 *                       bot_ativo, atendente_id, status
 *   sac_whatsapp_mensagens: id, chat_id, direcao ('entrada'|'saida'), criado_em
 *
 * Observação de escopo: sac_whatsapp_chats não possui coluna unidade_id confirmada, por isso
 * NÃO filtramos por unidade (evita consultar coluna inexistente → quebra em runtime).
 *
 * ROBUSTEZ: se qualquer query falhar (RLS/coluna/tabela ausente), renderiza um estado vazio
 * "Relatório em preparação" (crm-note) sem quebrar em runtime.
 */

const LIMITE = 500
const LISTA_MAX = 200
const MSG_CAP = 5000

type ChatRow = {
  id: string
  telefone: string | null
  nome: string | null
  ultima_msg: string | null
  ultima_msg_em: string | null
  nao_lidas: number | null
  bot_ativo: boolean | null
  atendente_id: string | null
  status: string | null
}

type MsgMin = { direcao: string | null; criado_em: string | null }

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  pendente: 'Pendente',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

const DIA_MS = 24 * 60 * 60 * 1000

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / DIA_MS))
}

// Pill de status — reaproveita as variantes do legacy.css (wa-pill ok/run/pend/done/draft).
function statusPill(status: string | null) {
  const s = status || 'aberto'
  const variante =
    s === 'resolvido' || s === 'fechado'
      ? 'done'
      : s === 'em_atendimento'
        ? 'run'
        : s === 'pendente'
          ? 'pend'
          : 'ok'
  return <span className={`wa-pill ${variante}`}>{STATUS_LABEL[s] ?? s}</span>
}

export default async function ExpansaoWhatsappPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()

  // ── Conversas (sac_whatsapp_chats) — mais recentes primeiro ──
  const { data: chatsRaw, error: chatsErr } = await sb
    .from('sac_whatsapp_chats')
    .select('id, telefone, nome, ultima_msg, ultima_msg_em, nao_lidas, bot_ativo, atendente_id, status')
    .order('ultima_msg_em', { ascending: false })
    .limit(LIMITE)

  // Estado robusto: query falhou (RLS/coluna/tabela ausente) → renderiza vazio sem quebrar.
  const semFonte = !!chatsErr
  const chats = (semFonte ? [] : (chatsRaw ?? [])) as ChatRow[]

  // ── Total REAL de conversas (count exato, não o tamanho do array capado em LIMITE) ──
  let totalConversas = chats.length
  if (!semFonte) {
    const { count } = await sb
      .from('sac_whatsapp_chats')
      .select('id', { count: 'exact', head: true })
    totalConversas = count ?? chats.length
  }
  // A amostra carregada (chats) bateu no teto? Então KPIs derivados só da amostra são parciais.
  const chatsCapped = totalConversas > chats.length

  // ── Volume de mensagens (sac_whatsapp_mensagens) — só consultamos se a fonte respondeu ──
  let totalMsgs = 0
  let entrada = 0
  let saida = 0
  let msgsCapped = false
  if (!semFonte) {
    const { data: msgsRaw, error: msgsErr } = await sb
      .from('sac_whatsapp_mensagens')
      .select('direcao, criado_em')
      .order('criado_em', { ascending: false })
      .limit(MSG_CAP)
    if (!msgsErr) {
      const msgs = (msgsRaw ?? []) as MsgMin[]
      totalMsgs = msgs.length
      for (const m of msgs) {
        if (m.direcao === 'entrada') entrada++
        else if (m.direcao === 'saida') saida++
      }
      if (totalMsgs >= MSG_CAP) msgsCapped = true
    }
  }

  // ── KPIs das conversas ──
  // total = contagem REAL (count exato). amostra = quanto carregamos para detalhar.
  const total = totalConversas
  const amostra = chats.length
  // Os agregados abaixo são calculados sobre a AMOSTRA (chats capados em LIMITE); quando
  // chatsCapped, são parciais e marcamos com '+' / nota de amostra.
  const naoLidas = chats.reduce((a, c) => a + (c.nao_lidas ?? 0), 0)
  const comAtendente = chats.filter((c) => !!c.atendente_id).length
  const noBot = chats.filter((c) => c.bot_ativo !== false && !c.atendente_id).length
  const novas7d = chats.filter((c) => {
    const d = diasDesde(c.ultima_msg_em)
    return d != null && d <= 7
  }).length

  // ── Distribuição por status ──
  const porStatus = new Map<string, number>()
  for (const c of chats) {
    const s = c.status || 'aberto'
    porStatus.set(s, (porStatus.get(s) ?? 0) + 1)
  }
  const distStatus = [...porStatus.entries()]
    .map(([s, n]) => ({ status: s, count: n }))
    .sort((a, b) => b.count - a.count)

  // ── Lista detalhada (mais recentes primeiro) ──
  const detalhe = chats.slice(0, LISTA_MAX)
  const taxaResposta = entrada > 0 ? ((saida / entrada) * 100).toFixed(0) : null

  return (
    <div className="view active">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Expansão · WhatsApp CRM</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          Conversas · {ctx?.activeUnitId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      <div className="crm-note">
        <i className="ti ti-brand-whatsapp" /> Conversas de <b>WhatsApp</b> da rede — respondentes de disparos e
        clientes que escrevem entram aqui e alimentam o CRM, onde a equipe segue o fluxo de fechamento. Use a{' '}
        <b>Conversa</b> (SAC) para responder; este painel é o resumo gerencial das conversas.
      </div>

      {semFonte ? (
        <div className="cli-card" style={{ padding: '22px 18px' }}>
          <div className="crm-note" style={{ marginBottom: 0 }}>
            <i className="ti ti-database-off" /> Relatório em preparação — sem fonte de dados de conversas de WhatsApp
            disponível no momento (consulta indisponível para o seu perfil/unidade). Assim que as conversas começarem a
            ser registradas, os números aparecerão aqui automaticamente.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '14px 0 18px' }}>
            <div className="metric-box">
              <span>Conversas (total)</span>
              <b>{total.toLocaleString('pt-BR')}</b>
            </div>
            <div className="metric-box">
              <span>Não lidas{chatsCapped ? ' (amostra)' : ''}</span>
              <b>{naoLidas.toLocaleString('pt-BR')}{chatsCapped ? '+' : ''}</b>
            </div>
            <div className="metric-box">
              <span>Em atendimento humano{chatsCapped ? ' (amostra)' : ''}</span>
              <b>{comAtendente.toLocaleString('pt-BR')}{chatsCapped ? '+' : ''}</b>
            </div>
            <div className="metric-box">
              <span>No bot (IA){chatsCapped ? ' (amostra)' : ''}</span>
              <b>{noBot.toLocaleString('pt-BR')}{chatsCapped ? '+' : ''}</b>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, margin: '0 0 18px' }}>
            <div className="metric-box">
              <span>Ativas (7 dias){chatsCapped ? ' (amostra)' : ''}</span>
              <b>{novas7d.toLocaleString('pt-BR')}{chatsCapped ? '+' : ''}</b>
            </div>
            <div className="metric-box">
              <span>Mensagens recebidas</span>
              <b>
                {entrada.toLocaleString('pt-BR')}
                {msgsCapped ? '+' : ''}
              </b>
            </div>
            <div className="metric-box">
              <span>Mensagens enviadas</span>
              <b>
                {saida.toLocaleString('pt-BR')}
                {msgsCapped ? '+' : ''}
              </b>
            </div>
            <div className="metric-box">
              <span>Taxa de resposta</span>
              <b>{taxaResposta != null ? `${taxaResposta}%` : '—'}</b>
            </div>
          </div>

          <div className="cli-card">
            <div className="rel-head" style={{ marginBottom: 12 }}>
              <span>
                <i className="ti ti-chart-pie" /> Conversas por status
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 600 }}>
                {chatsCapped
                  ? `amostra de ${amostra.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`
                  : `${total.toLocaleString('pt-BR')} no total`}
              </span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th className="num-r">Conversas</th>
                    <th className="num-r">% da amostra</th>
                  </tr>
                </thead>
                <tbody>
                  {amostra === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhuma conversa registrada ainda.
                      </td>
                    </tr>
                  )}
                  {amostra > 0 &&
                    distStatus.map((s) => (
                      <tr key={s.status}>
                        <td>{statusPill(s.status)}</td>
                        <td className="num-r" style={{ fontWeight: 600 }}>
                          {s.count.toLocaleString('pt-BR')}
                        </td>
                        <td className="num-r">{amostra > 0 ? ((s.count / amostra) * 100).toFixed(1) : '0,0'}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cli-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rel-head" style={{ padding: '14px 18px' }}>
              <span>
                <i className="ti ti-messages" /> Conversas recentes
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                {total.toLocaleString('pt-BR')} conversa(s){detalhe.length < total ? ` · exibindo ${detalhe.length}` : ''}
              </span>
            </div>
            <div className="cli-scroll">
              <table className="cli-table">
                <thead>
                  <tr>
                    <th>Contato</th>
                    <th>Telefone</th>
                    <th>Última mensagem</th>
                    <th>Status</th>
                    <th>Atendimento</th>
                    <th className="num-r">Não lidas</th>
                    <th>Atualizada</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                        Nenhuma conversa de WhatsApp registrada até o momento.
                      </td>
                    </tr>
                  )}
                  {detalhe.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="cli-name">{c.nome || c.telefone || '—'}</span>
                      </td>
                      <td>{c.telefone || '—'}</td>
                      <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.ultima_msg || '—'}
                      </td>
                      <td>{statusPill(c.status)}</td>
                      <td>
                        {c.atendente_id ? (
                          <span className="os-st os-fechada">
                            <i className="ti ti-user" /> Humano
                          </span>
                        ) : c.bot_ativo !== false ? (
                          <span className="os-st os-aberta">
                            <i className="ti ti-robot" /> Bot (IA)
                          </span>
                        ) : (
                          <span className="os-st">Fila</span>
                        )}
                      </td>
                      <td className="num-r" style={{ fontWeight: 600 }}>
                        {(c.nao_lidas ?? 0) > 0 ? (c.nao_lidas ?? 0).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td>{c.ultima_msg_em ? dataHoraBR(c.ultima_msg_em) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crm-note" style={{ marginTop: 14 }}>
            <i className="ti ti-affiliate" /> Cada respondente vira um lead no CRM como <b>Disparo WhatsApp</b> para a
            equipe seguir o fluxo de fechamento. Para responder e atribuir atendentes, use a{' '}
            <b>Conversa</b> em SAC. Última atualização:{' '}
            <b>{chats[0]?.ultima_msg_em ? dataHoraBR(chats[0].ultima_msg_em) : '—'}</b>.
          </div>
        </>
      )}
    </div>
  )
}
