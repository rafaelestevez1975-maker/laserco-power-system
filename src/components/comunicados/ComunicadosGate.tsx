import { createClient } from '@/lib/supabase/server'
import { CienteModal, type PendenteCom } from './CienteModal'

type Row = { id: string; titulo: string; mensagem: string; prioridade: string; autor_nome: string | null; publicado_em: string | null }

/** Server component montado no layout: levanta os comunicados obrigatórios
 *  publicados que o usuário ainda NÃO confirmou e exibe o gate de "ciente". */
export async function ComunicadosGate() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data: obrig } = await sb.from('comunicados')
    .select('id, titulo, mensagem, prioridade, autor_nome, publicado_em')
    .eq('leitura_obrigatoria', true).eq('status', 'publicado')
    .order('publicado_em', { ascending: true })
  const list = (obrig ?? []) as Row[]
  if (list.length === 0) return null

  const { data: lid } = await sb.from('comunicado_leituras').select('comunicado_id').eq('perfil_id', user.id)
  const lidos = new Set(((lid ?? []) as { comunicado_id: string }[]).map((r) => r.comunicado_id))

  const pendentes: PendenteCom[] = list
    .filter((c) => !lidos.has(c.id))
    .map((c) => ({ id: c.id, titulo: c.titulo, mensagem: c.mensagem, prioridade: c.prioridade, autor: c.autor_nome, quando: c.publicado_em }))
  if (pendentes.length === 0) return null

  return <CienteModal comunicados={pendentes} />
}
