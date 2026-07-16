import { carregarTrilhas, carregarMeuProgresso, podeGerirUniversidade } from './data'
import { UniNav } from '@/components/universidade/UniNav'
import { AlunoTrilhas } from '@/components/universidade/AlunoTrilhas'

export const dynamic = 'force-dynamic'

/** /universidade — visão do ALUNO: trilhas por cargo, player Bunny, provas e certificado. */
export default async function UniversidadePage() {
  const [{ trilhas, migrationPendente }, meuProgresso, podeGerir] = await Promise.all([
    carregarTrilhas(),
    carregarMeuProgresso(),
    podeGerirUniversidade(),
  ])

  return (
    <div className="view active">
      <UniNav podeGerir={podeGerir} />
      <AlunoTrilhas trilhas={trilhas} meuProgresso={meuProgresso} migrationPendente={migrationPendente} />
    </div>
  )
}
