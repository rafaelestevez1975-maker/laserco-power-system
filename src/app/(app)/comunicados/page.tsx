import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/session'
import { ComunicadosManager, type Comunicado } from '@/components/comunicados/ComunicadosManager'

type Row = {
  id: string; titulo: string; mensagem: string; prioridade: string; categoria: string
  audiencia: string[] | null; leitura_obrigatoria: boolean; enviar_email: boolean; status: string
  total_destinatarios: number; publicado_em: string | null; agendado_para: string | null
  autor_nome: string | null; criado_em: string
}

export default async function ComunicadosPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const admin = adminClient()
  const { data: { user } } = await sb.auth.getUser()

  const { data: comsRaw } = await sb.from('comunicados').select('*').order('criado_em', { ascending: false }).limit(500)

  // Pool de destinatários = perfis ATIVOS AGORA (mesma base do roster em rosterLeitura/
  // total_destinatarios em criarComunicado). Mantém LISTA e RELATÓRIO sempre coerentes.
  const { data: ativosRaw } = await admin.from('perfis_usuario').select('id').eq('ativo', true)
  const ativos = new Set(((ativosRaw ?? []) as { id: string }[]).map((p) => p.id))
  const totalDestinatarios = ativos.size

  // Agregado de leituras (via service-role, só contagem) — conta APENAS cientes de perfis
  // ativos hoje (espelha rosterLeitura: cientes = ativos que leram). Evita lidos > dest.
  const { data: leiturasAll } = await admin.from('comunicado_leituras').select('comunicado_id, perfil_id')
  const countMap: Record<string, number> = {}
  for (const r of (leiturasAll ?? []) as { comunicado_id: string; perfil_id: string }[]) {
    if (!ativos.has(r.perfil_id)) continue
    countMap[r.comunicado_id] = (countMap[r.comunicado_id] ?? 0) + 1
  }

  // "Ciente" do próprio usuário (para o gate de leitura obrigatória).
  let myCiente: string[] = []
  if (user) {
    const { data: myL } = await sb.from('comunicado_leituras').select('comunicado_id').eq('perfil_id', user.id)
    myCiente = ((myL ?? []) as { comunicado_id: string }[]).map((r) => r.comunicado_id)
  }

  const comunicados: Comunicado[] = ((comsRaw ?? []) as Row[]).map((r) => ({
    id: r.id, titulo: r.titulo, mensagem: r.mensagem,
    prioridade: (r.prioridade as Comunicado['prioridade']) ?? 'normal',
    categoria: r.categoria || 'Sem categoria',
    audiencia: r.audiencia ?? ['Todos'],
    obrigatorio: !!r.leitura_obrigatoria,
    email: !!r.enviar_email,
    status: (r.status as Comunicado['status']) ?? 'publicado',
    // dest = perfis ativos AGORA (idêntico ao roster.length do relatório), não o
    // snapshot congelado em total_destinatarios — assim a LISTA bate com o RELATÓRIO.
    dest: totalDestinatarios,
    lidos: countMap[r.id] ?? 0,
    autor: r.autor_nome || '',
    quando: r.publicado_em || r.agendado_para || r.criado_em,
  }))

  return (
    <div className="view active">
      <ComunicadosManager
        comunicados={comunicados}
        myCiente={myCiente}
        isAdmin={ctx?.isAdmin ?? false}
        nome={ctx?.nome ?? 'Usuário'}
      />
    </div>
  )
}
