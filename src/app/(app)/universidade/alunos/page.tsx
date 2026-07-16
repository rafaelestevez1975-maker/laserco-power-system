import { carregarTrilhas, carregarAlunos, podeGerirUniversidade } from '../data'
import { UniNav } from '@/components/universidade/UniNav'
import { AlunosNotas } from '@/components/universidade/AlunosNotas'

export const dynamic = 'force-dynamic'

/** /universidade/alunos — Alunos & Notas: progresso, notas e geração de certificado. */
export default async function UniversidadeAlunosPage() {
  const [{ trilhas }, podeGerir] = await Promise.all([carregarTrilhas(), podeGerirUniversidade()])
  const alunos = await carregarAlunos(trilhas)

  return (
    <div className="view active">
      <UniNav podeGerir={podeGerir} />
      <AlunosNotas alunos={alunos} />
    </div>
  )
}
