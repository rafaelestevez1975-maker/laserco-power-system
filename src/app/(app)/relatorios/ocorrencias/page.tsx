import { getSessionContext } from '@/lib/session'
import { RelTabs, relQuery } from '@/components/relatorios/RelTabs'
import { RelKpis, type RelKpi } from '@/components/relatorios/RelKpis'

export const dynamic = 'force-dynamic'

type SP = { periodo?: string; di?: string; df?: string }

/**
 * Ocorrências e Intercorrências  relatório clínico-operacional.
 * Réplica do REL_DEFS.ocorrencias do legado (legacy/index.html ~4280, special:'ocor').
 *
 * IMPORTANTE (ROBUSTEZ): no legado este relatório era 100% mock  a lista `OCOR`
 * (legacy/index.html ~4432) é um array em memória e a classificação Ocorrência/
 * Intercorrência era um toggle de UI sem persistência. No backend atual NÃO existe
 * tabela de origem:
 *   - `ocorrencias` / `ocorrencias_frequencia` → não existem (nenhum from('...') no código nem migration).
 *   - `acoes` existe, mas é a tabela de AÇÕES de permissão (RBAC: id, descricao), não ocorrências clínicas.
 *   - `atestados` existe, mas é atestado médico de COLABORADOR (RH), não intercorrência de cliente.
 *   - "intercorrência" só aparece como texto de consentimento em scripts/migrations/anamnese.sql.
 * Portanto NÃO consultamos nenhuma tabela (evita erro 42P01 em runtime) e renderizamos o
 * estado "Relatório em preparação / sem fonte de dados ainda".
 *
 * TODO(legado: buildRelatorio special 'ocor'): quando existir a tabela de ocorrências/
 * intercorrências (registro por atendimento: cliente, profissional, serviço, descrição, tipo),
 * substituir o estado vazio por: KPIs (total, ocorrências, intercorrências), gráficos
 * (classificação e por profissional) e a tabela detalhada  escopados por unidade e período.
 */
export default async function RelOcorrenciasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const ctx = await getSessionContext()
  const unidadeId = ctx?.activeUnitId ?? null

  // KPIs em placeholder (sem fonte de dados)  mantém o layout consistente com os demais relatórios.
  const kpis: RelKpi[] = [
    { label: 'Total de registros', value: '', icon: 'ti-clipboard-heart' },
    { label: 'Ocorrências', value: '', icon: 'ti-clipboard-list' },
    { label: 'Intercorrências', value: '', icon: 'ti-alert-triangle' },
  ]

  return (
    <div className="view active">
      <RelTabs active="" query={relQuery(sp)} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 0 6px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Ocorrências e Intercorrências</h2>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {unidadeId ? ctx?.activeUnitName : 'Todas as unidades'}
        </span>
      </div>

      {/* Estado: sem fonte de dados (a tabela de ocorrências clínicas ainda não existe no backend). */}
      <div
        className="crm-note"
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}
      >
        <i className="ti ti-hourglass" style={{ fontSize: 20, color: 'var(--brand-600)', marginTop: 2 }} />
        <div>
          <b>Relatório em preparação  sem fonte de dados ainda.</b>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4 }}>
            O registro de ocorrências e intercorrências por atendimento ainda não está disponível no
            backend (não há tabela de origem). Assim que os registros começarem a ser coletados, este
            relatório passará a exibir os números reais por período e unidade.
          </div>
        </div>
      </div>

      {/* Legenda conceitual (legacy/index.html ~6989)  explica a intenção do relatório. */}
      <div
        className="crm-note"
        style={{ fontSize: 12.5, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.5 }}
      >
        <b>Ocorrência</b> = evento operacional/administrativo do atendimento (atraso, remanejamento,
        equipamento), <b>sem dano clínico</b>. &nbsp;·&nbsp; <b>Intercorrência</b> = reação adversa ou
        efeito clínico no cliente (eritema, bolha, hipersensibilidade) que exige conduta/observação.
      </div>

      <RelKpis kpis={kpis} />

      <div className="rel-card">
        <div className="rel-card-h" style={{ marginBottom: 12, cursor: 'default' }}>
          <span>
            <i className="ti ti-list-details" /> Registros
          </span>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Profissional</th>
                <th>Serviço</th>
                <th>Descrição</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 26, color: 'var(--text-3)' }}>
                  Nenhum registro disponível  fonte de dados em preparação.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
