import { createClient } from '@/lib/supabase/server'
import { TriagemWhatsapp, type Chat, type Msg } from '@/components/sac/TriagemWhatsapp'

export default async function SacTriagemPage() {
  const sb = await createClient()

  const { data: chatsRaw } = await sb
    .from('sac_whatsapp_chats')
    .select('id, telefone, nome, ultima_msg, ultima_msg_em, nao_lidas, bot_ativo, ticket_id')
    .order('ultima_msg_em', { ascending: false })
    .limit(100)
  const chats = (chatsRaw ?? []) as Chat[]

  const { data: msgsRaw } = await sb
    .from('sac_whatsapp_mensagens')
    .select('id, chat_id, direcao, autor, tipo, texto, criado_em')
    .order('criado_em', { ascending: true })
    .limit(800)
  const msgs = (msgsRaw ?? []) as Msg[]

  return (
    <div className="view active">
      <div className="crm-note">
        <i className="ti ti-brand-whatsapp" /> <b>Triagem WhatsApp.</b> Conversas recebidas pelo WhatsApp — o bot coleta os dados
        e a atendente abre o chamado. Entradas novas chegam pelo webhook da UAZAPI.
      </div>
      <TriagemWhatsapp chats={chats} msgs={msgs} />
    </div>
  )
}
