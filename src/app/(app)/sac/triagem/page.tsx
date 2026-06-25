import { createClient } from '@/lib/supabase/server'
import { listAtendentesSac } from '@/lib/pessoas'
import { TriagemWhatsapp, type Chat, type Msg, type Atendente, type Nota } from '@/components/sac/TriagemWhatsapp'

export default async function SacTriagemPage() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()

  const { data: chatsRaw } = await sb
    .from('sac_whatsapp_chats')
    .select('id, telefone, nome, ultima_msg, ultima_msg_em, nao_lidas, bot_ativo, ticket_id, atendente_id, status')
    .order('ultima_msg_em', { ascending: false })
    .limit(100)
  const chats = (chatsRaw ?? []) as Chat[]

  const { data: notasRaw } = await sb
    .from('sac_whatsapp_notas').select('id, chat_id, autor_nome, texto, criada_em').order('criada_em', { ascending: true }).limit(500)
  const notas = (notasRaw ?? []) as Nota[]

  const { data: msgsRaw } = await sb
    .from('sac_whatsapp_mensagens')
    .select('id, chat_id, direcao, autor, tipo, texto, midia_url, midia_mimetype, status, criado_em')
    .order('criado_em', { ascending: true })
    .limit(800)
  const msgs = (msgsRaw ?? []) as Msg[]

  // Atendentes do SAC — fonte única (lib/pessoas, liga colaboradores⟷perfis_usuario)
  const atendentes = (await listAtendentesSac(sb)).map((a) => ({ id: a.id, nome: a.nome })) as Atendente[]

  return (
    <div className="view active">
      <TriagemWhatsapp chats={chats} msgs={msgs} atendentes={atendentes} notas={notas} operadorId={user?.id ?? null} />
    </div>
  )
}
