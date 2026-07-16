import { carregarTrilhas, carregarAlunos, podeGerirUniversidade } from '../data'
import { UniNav } from '@/components/universidade/UniNav'
import { UniDashboards } from '@/components/universidade/UniDashboards'

export const dynamic = 'force-dynamic'

/** /universidade/dashboards — KPIs e barras de desempenho da Universidade. */
export default async function UniversidadeDashboardsPage() {
  const [{ trilhas }, podeGerir] = await Promise.all([carregarTrilhas(), podeGerirUniversidade()])
  const alunos = await carregarAlunos(trilhas)

  return (
    <div className="view active">
      <UniNav podeGerir={podeGerir} />
      <UniDashboards alunos={alunos} trilhas={trilhas} />
    </div>
  )
}
