/**
 * Implantação de Unidade — constantes/helpers puros (cliente-safe).
 * Espelha o legado buildImpl / implRender (legacy ~4827-4895): 9 áreas de
 * workflow (IMPL_WF), 4 situações (IMPL_ST) com seus pills, e os cálculos de
 * progresso/prazo (implDiff/implTotals).
 */

/** IMPL_WF — 9 áreas responsáveis por uma tarefa (legacy 4827). */
export const IMPL_WF = [
  'Implantação', 'Expansão', 'Franqueado', 'Treinamento', 'Diretoria', 'Marketing', 'RH', 'Comercial', 'Compras',
] as const
export type ImplWf = (typeof IMPL_WF)[number]

/** IMPL_ST — 4 estados da tarefa (legacy 4828). */
export const IMPL_ST = ['Aberto', 'Em Andamento', 'Aguardando Predecessora', 'Concluído'] as const
export type ImplSt = (typeof IMPL_ST)[number]

/** IMPL_STPILL — classe wa-pill por situação (legacy 4829). */
export const IMPL_STPILL: Record<string, 'draft' | 'run' | 'pend' | 'ok'> = {
  Aberto: 'draft',
  'Em Andamento': 'run',
  'Aguardando Predecessora': 'pend',
  Concluído: 'ok',
}

export function pillSituacao(s: string): 'draft' | 'run' | 'pend' | 'ok' {
  return IMPL_STPILL[s] ?? 'draft'
}

/** Dias entre duas datas ISO (YYYY-MM-DD). null se faltar alguma — implDiff. */
export function implDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

/** Dias entre hoje e a inauguração projetada (pode ser negativo se passou). */
export function diasAteInauguracao(inauguracao: string | null): number | null {
  if (!inauguracao) return null
  const di = new Date(inauguracao + 'T00:00:00')
  if (isNaN(di.getTime())) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((di.getTime() - hoje.getTime()) / 86_400_000)
}

export type TarefaImpl = {
  id: string
  etapa_id: string
  cod: string
  descricao: string
  responsavel: string
  duracao_dias: number
  situacao: string
  ordem: number
}

export type EtapaImpl = {
  id: string
  projeto_id: string
  cod: string
  nome: string
  ordem: number
  tarefas: TarefaImpl[]
}

export type ProjetoImpl = {
  id: string
  nome: string
  inicio: string | null
  inauguracao: string | null
  status: string
}

/** Totais de tarefas (concluídas / total) de uma lista de etapas — implTotals. */
export function implTotals(etapas: EtapaImpl[]): { tot: number; done: number } {
  let tot = 0
  let done = 0
  for (const e of etapas) {
    for (const t of e.tarefas) {
      tot++
      if (t.situacao === 'Concluído') done++
    }
  }
  return { tot, done }
}

/** % de progresso de uma etapa (0–100). */
export function progressoEtapa(e: EtapaImpl): number {
  if (e.tarefas.length === 0) return 0
  const d = e.tarefas.filter((t) => t.situacao === 'Concluído').length
  return Math.round((d / e.tarefas.length) * 100)
}

/** Etapa atual = primeira fase com tarefa não concluída (legacy faseAtual). */
export function etapaAtual(etapas: EtapaImpl[]): EtapaImpl | null {
  return etapas.find((e) => e.tarefas.some((t) => t.situacao !== 'Concluído')) ?? null
}

/** Contagem de tarefas por responsável (gráfico "Tarefas por responsável"). */
export function tarefasPorResponsavel(etapas: EtapaImpl[]): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const e of etapas) for (const t of e.tarefas) m.set(t.responsavel, (m.get(t.responsavel) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
