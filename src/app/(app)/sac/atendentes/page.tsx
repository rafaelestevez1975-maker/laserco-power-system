import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { listAtendentesSac } from '@/lib/pessoas'
import { AtendentesManager, type AtendenteRow } from '@/components/sac/AtendentesManager'

export default async function SacAtendentesPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const uniNome = new Map((ctx?.unidades ?? []).map((u) => [u.id, u.nome]))

  // Fonte única de atendentes (perfis_usuario papel SAC + ficha RH via colaboradores.perfil_id)
  const atendentes = await listAtendentesSac(sb)

  // Carga atual por atendente: conversas atribuídas + chamados abertos atribuídos
  const rows: AtendenteRow[] = await Promise.all(atendentes.map(async (a) => {
    const [{ count: conversas }, { count: tickets }] = await Promise.all([
      sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).eq('atendente_id', a.id),
      sb.from('sac_tickets').select('id', { count: 'exact', head: true }).eq('atribuido_para', a.id).neq('fase', 'Concluído'),
    ])
    return {
      id: a.id, nome: a.nome, papel: a.papel, cargo: a.cargo, area: a.area,
      unidadeNome: a.unidadeId ? (uniNome.get(a.unidadeId) ?? null) : null, email: a.email, ativo: a.ativo,
      conversas: conversas ?? 0, tickets: tickets ?? 0,
    }
  }))

  // Filas não atribuídas (precisam de distribuição)
  const [{ count: filaConversas }, { count: filaTickets }] = await Promise.all([
    sb.from('sac_whatsapp_chats').select('id', { count: 'exact', head: true }).is('atendente_id', null).eq('bot_ativo', false),
    sb.from('sac_tickets').select('id', { count: 'exact', head: true }).is('atribuido_para', null).neq('fase', 'Concluído'),
  ])

  const podeDistribuir = !!(ctx?.isAdmin || ctx?.papel === 'sac' || ctx?.papel === 'gestor')
  const podeCriar = !!ctx?.isAdmin // criar login de atendente é só do admin
  const unidades = (ctx?.unidades ?? []).map((u) => ({ id: u.id, nome: u.nome }))

  return (
    <div className="view active">
      <AtendentesManager
        atendentes={rows} filaConversas={filaConversas ?? 0} filaTickets={filaTickets ?? 0}
        podeDistribuir={podeDistribuir} podeCriar={podeCriar} unidades={unidades}
      />
    </div>
  )
}
