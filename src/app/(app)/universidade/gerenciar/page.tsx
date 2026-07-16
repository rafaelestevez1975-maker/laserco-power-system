import { carregarTrilhas, podeGerirUniversidade } from '../data'
import { UniNav } from '@/components/universidade/UniNav'
import { GerenciarLista } from '@/components/universidade/GerenciarLista'

export const dynamic = 'force-dynamic'

/** /universidade/gerenciar — admin: LISTA de trilhas + "Nova trilha" (cai no editor). */
export default async function UniversidadeGerenciarPage() {
  const [{ trilhas }, podeGerir] = await Promise.all([carregarTrilhas(), podeGerirUniversidade()])

  return (
    <div className="view active">
      <UniNav podeGerir={podeGerir} />
      <GerenciarLista trilhas={trilhas} podeGerir={podeGerir} />
    </div>
  )
}
