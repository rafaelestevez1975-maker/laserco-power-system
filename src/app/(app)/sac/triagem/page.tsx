import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { TriagemWhatsapp, type Chat, type Msg, type Atendente, type Nota } from '@/components/sac/TriagemWhatsapp'

export const dynamic = 'force-dynamic'

const LISTA_MAX = 800 // cobre a base atual (~500) com folga; nulls por último

/**
 * Conversa — caixa de entrada do SAC.
 *
 * Escopo por unidade: o modelo do projeto exige escopo por unidade_id (como em /sac/chamados).
 * Porém sac_whatsapp_chats é alimentada pelo webhook da UAZAPI (src/app/api/webhooks/uazapi)
 * que NÃO grava unidade_id/empresa_id no chat — e a coluna unidade_id não é confirmada no schema
 * (ver nota em src/app/(app)/expansao/whatsapp/page.tsx:25). Para honrar o escopo sem quebrar em
 * runtime, aplicamos o filtro por unidade de forma DEFENSIVA: tentamos com .eq('unidade_id', ...)
 * e, se a coluna não existir (erro), caímos para a consulta sem filtro. A RLS do Supabase
 * permanece como 2ª linha de defesa.
 */
export default async function SacTriagemPage({ searchParams }: { searchParams?: Promise<{ tel?: string; nome?: string; ticket?: string }> }) {
  const sb = await createClient()
  const ctx = await getSessionContext()
  const { data: { user } } = await sb.auth.getUser()
  const activeUnitId = ctx?.activeUnitId ?? null
  // Vindo do CHAMADO (botão WhatsApp): pré-abre "Nova conversa" com o telefone/nome do cliente.
  const spNova = (await searchParams) ?? {}
  const novaInicial = spNova.tel ? { tel: spNova.tel, nome: spNova.nome || '', ticketId: spNova.ticket || null } : null

  // ── Conversas (mais recentes primeiro) com escopo defensivo por unidade ──
  const baseSelect = 'id, telefone, nome, ultima_msg, ultima_msg_em, nao_lidas, bot_ativo, ticket_id, atendente_id, status'
  let chatsErr: { message?: string } | null = null
  let chatsRaw: Chat[] | null = null
  let escopoUnidade = false

  if (activeUnitId) {
    const r = await sb.from('sac_whatsapp_chats').select(baseSelect).eq('unidade_id', activeUnitId).order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(LISTA_MAX)
    if (!r.error) { chatsRaw = (r.data ?? []) as Chat[]; escopoUnidade = true }
    // r.error => coluna unidade_id inexistente: cai para a consulta sem filtro abaixo.
  }
  if (chatsRaw == null) {
    const r = await sb.from('sac_whatsapp_chats').select(baseSelect).order('ultima_msg_em', { ascending: false, nullsFirst: false }).limit(LISTA_MAX)
    chatsErr = r.error
    chatsRaw = (r.data ?? []) as Chat[]
  }
  const erro = !!chatsErr
  const chats = (erro ? [] : (chatsRaw ?? [])) as Chat[]
  const chatIds = chats.map((c) => c.id)

  // ── Contagens REAIS (count exato, não o tamanho do array capado) — mesmo escopo dos chats ──
  // Só filtra por unidade se o escopo de unidade foi efetivamente aplicado nos chats
  // (escopoUnidade=true significa que a coluna unidade_id existe e respondeu sem erro).
  const escopo = escopoUnidade && activeUnitId ? activeUnitId : null
  const baseCount = () => {
    const q = sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true })
    return escopo ? q.eq('unidade_id', escopo) : q
  }
  const [totalRes, minhasRes, filaRes] = await Promise.all([
    baseCount(),
    user ? baseCount().eq('atendente_id', user.id) : Promise.resolve({ count: 0 }),
    baseCount().is('atendente_id', null),
  ])
  const totalN = erro ? 0 : (totalRes.count ?? chats.length)
  const minhasN = erro ? 0 : (minhasRes.count ?? 0)
  const filaN = erro ? 0 : (filaRes.count ?? 0)
  const amostraCapped = !erro && totalN > chats.length

  // ── Mensagens e notas SÓ das conversas carregadas ──
  // CRÍTICO: o PostgREST corta a resposta em ~1000 linhas. Ordenar ASCENDENTE fazia o corte
  // descartar as mensagens MAIS NOVAS quando o total passou de 1000 — conversas recentes abriam
  // "Sem mensagens" com tudo gravado no banco (bug de 02/07). Buscamos DESC com teto explícito
  // (o corte descarta só o histórico antigo) e revertemos para exibir em ordem cronológica.
  let msgs: Msg[] = []
  let notas: Nota[] = []
  if (!erro && chatIds.length > 0) {
    const [{ data: msgsRaw }, { data: notasRaw }] = await Promise.all([
      sb.from('sac_whatsapp_mensagens')
        .select('id, chat_id, direcao, autor, tipo, texto, midia_url, midia_mimetype, status, criado_em')
        // Desempate por id (ordem de chegada): timestamp do WhatsApp atrasado não embaralha o fio.
        .in('chat_id', chatIds).order('criado_em', { ascending: false }).order('id', { ascending: false }).limit(4000),
      sb.from('sac_whatsapp_notas')
        .select('id, chat_id, autor_nome, texto, criada_em')
        .in('chat_id', chatIds).order('criada_em', { ascending: false }).limit(1000),
    ])
    msgs = ((msgsRaw ?? []) as Msg[]).reverse()
    notas = ((notasRaw ?? []) as Nota[]).reverse()
  }

  // Atendentes do SAC — fonte única (lib/pessoas, liga colaboradores⟷perfis_usuario)
  const atendentes = (await listAtendentesSac(sb)).map((a) => ({ id: a.id, nome: a.nome })) as Atendente[]

  // Motivos do SAC (para o fluxo de abrir chamado, igual ao /sac/chamados)
  const { data: motivosRaw } = await sb.from('sac_motivos').select('label').eq('ativo', true).order('ordem', { ascending: true })
  const motivos = ((motivosRaw ?? []) as { label: string }[]).map((m) => m.label)

  if (erro) {
    return (
      <div className="view active">
        <div className="cli-card" style={{ padding: 18, color: 'var(--red)' }}>
          <i className="ti ti-alert-triangle" /> Não foi possível carregar as conversas do WhatsApp. Recarregue a página — se persistir, verifique a conexão com o backend.
        </div>
      </div>
    )
  }

  // Respostas rápidas (barra "/" na conversa) — pedido das atendentes.
  const { data: rrRaw } = await sb.from('sac_respostas_rapidas').select('id, atalho, texto').order('atalho')
  const respostasRapidas = (rrRaw ?? []) as { id: string; atalho: string; texto: string }[]

  return (
    <div className="view active">
      <TriagemWhatsapp
        chats={chats}
        msgs={msgs}
        atendentes={atendentes}
        notas={notas}
        operadorId={user?.id ?? null}
        unidades={ctx?.unidades ?? []}
        activeUnitId={activeUnitId}
        motivos={motivos}
        totalN={totalN}
        minhasN={minhasN}
        filaN={filaN}
        amostraCapped={amostraCapped}
        respostasRapidas={respostasRapidas}
        novaInicial={novaInicial}
      />
    </div>
  )
}
