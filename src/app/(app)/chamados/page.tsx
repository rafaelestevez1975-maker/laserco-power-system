import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { ChamadosManager, type Chamado } from '@/components/chamados/ChamadosManager'

type Row = {
  id: string; numero: number; assunto: string; etiqueta: string
  de_parte: string; para_parte: string; prioridade: string
  responsavel_nome: string | null; aberto_por_nome: string | null
  finalizado: boolean; aberto_em: string; descricao: string | null
}

export default async function ChamadosPage() {
  const ctx = await getSessionContext()
  const isAdmin = ctx?.isAdmin ?? false
  const activeUnit = ctx?.activeUnitName ?? ''
  // Usuário de unidade (não-admin com unidade ativa) abre como "Franqueado · <unidade>"
  // → cai em "Recebidos" sob a ótica da franqueadora. Admin abre a partir de um departamento.
  const origemFranqueado = !isAdmin && activeUnit && activeUnit !== 'Todas as unidades' ? `Franqueado · ${activeUnit}` : null
  const sb = await createClient()
  let q = sb.from('chamados').select('*').order('aberto_em', { ascending: false }).limit(500)
  if (ctx?.activeUnitId) q = q.eq('de_unidade_id', ctx.activeUnitId) // respeita a unidade ativa do topo
  const { data } = await q

  const chamados: Chamado[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id, numero: r.numero, assunto: r.assunto, etiqueta: r.etiqueta || 'Solicitação',
    de: r.de_parte, para: r.para_parte,
    prioridade: (r.prioridade as Chamado['prioridade']) ?? 'normal',
    responsavel: r.responsavel_nome || '',
    abertoPor: r.aberto_por_nome || '',
    finalizado: !!r.finalizado,
    abertoEm: r.aberto_em,
    descricao: r.descricao ?? '',
    // Classificação franqueadora-cêntrica (igual ao protótipo): aberto por franqueado = recebido.
    box: /franquead/i.test(r.de_parte) ? 'recebidos' : 'enviados',
  }))

  return (
    <div className="view active">
      <ChamadosManager chamados={chamados} isAdmin={isAdmin} origemFranqueado={origemFranqueado} />
    </div>
  )
}
