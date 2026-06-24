import { createClient } from '@/lib/supabase/server'
import { getSessionContext } from '@/lib/session'
import { RecrutamentoManager, type Candidato } from '@/components/rh/RecrutamentoManager'

type Embed = { titulo?: string; cargo?: string; unidade_id?: string; unidades?: { nome?: string; cidade?: string; estado?: string } | { nome?: string; cidade?: string; estado?: string }[] | null }
type Row = {
  id: string; nome: string; email: string | null; telefone: string | null; cpf: string | null
  fonte: string | null; estagio_kanban: string; score_triagem_ia: number | null
  notas_internas: string | null; motivo_reprovacao: string | null; criado_em: string
  vagas?: Embed | Embed[] | null
}
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export default async function RecrutamentoPage() {
  const ctx = await getSessionContext()
  const sb = await createClient()
  const { data } = await sb
    .from('candidatos')
    .select('id,nome,email,telefone,cpf,fonte,estagio_kanban,score_triagem_ia,notas_internas,motivo_reprovacao,criado_em,vaga_id,vagas(titulo,cargo,unidade_id,unidades(nome,cidade,estado))')
    .order('criado_em', { ascending: false })
    .limit(1000)

  const candidatos: Candidato[] = ((data ?? []) as Row[]).map((r) => {
    const vaga = one<Embed>(r.vagas)
    const uni = one(vaga?.unidades)
    return {
      id: r.id, nome: r.nome, email: r.email, telefone: r.telefone, cpf: r.cpf,
      fonte: r.fonte || 'outro',
      estagio: r.estagio_kanban,
      score: r.score_triagem_ia,
      notas: r.notas_internas,
      motivoReprovacao: r.motivo_reprovacao,
      criado: r.criado_em,
      cargo: vaga?.cargo || '—',
      vagaTitulo: vaga?.titulo || null,
      unidade: uni?.nome || null,
      cidade: uni?.cidade || null,
      estado: uni?.estado || null,
    }
  })

  return (
    <div className="view active">
      <RecrutamentoManager candidatos={candidatos} isAdmin={ctx?.isAdmin ?? false} />
    </div>
  )
}
