/**
 * Modelo de avaliação do Checklist PDCA de Indicadores (cliente-safe: funções puras).
 * Espelha o legado buildChecklist / CHK_INDS (legacy ~6081): cada indicador do funil
 * recebe nota 0–10 contra a meta; abaixo de 7 gera plano de ação sugerido.
 *
 * Os VALORES reais vêm de `kpis_unidade_snapshot` (taxa_comparecimento, taxa_conversao,
 * ticket_medio, agendamentos_total…). Aqui só calculamos nota/status — sem I/O.
 */

export type IndicadorDef = {
  /** chave de leitura no snapshot real (kpis_unidade_snapshot) */
  k: 'agendamentos_total' | 'taxa_comparecimento' | 'taxa_conversao' | 'ticket_medio'
  lab: string
  /** meta (mesma unidade do valor: % p/ taxas, R$ p/ ticket, qtd p/ agendamentos) */
  meta: number
  /** sufixo de exibição */
  suf: '' | '%' | ' R$'
  /** true = menor é melhor (não usado nos 4 do funil, mantido p/ paridade com legado) */
  inv: boolean
  peso: number
  /** categoria do plano_acao_tarefas correspondente (enum real: captacao, …) */
  categoria: string
  /** ação sugerida (PDCA · Plan→Do) quando abaixo da meta */
  act: string
}

/** Os 4 indicadores do funil exigidos pelo módulo (subset do CHK_INDS legado). */
export const FUNIL_INDS: IndicadorDef[] = [
  {
    k: 'agendamentos_total', lab: 'Agendamentos', meta: 300, suf: '', inv: false, peso: 1,
    categoria: 'captacao',
    act: 'Intensificar captação: campanha geolocalizada + reativação da base no WhatsApp.',
  },
  {
    k: 'taxa_comparecimento', lab: 'Comparecimento', meta: 85, suf: '%', inv: false, peso: 1.5,
    categoria: 'comparecimento',
    act: 'Reforçar confirmação D-1 e lembrete 2h; ativar lista de espera para encaixes.',
  },
  {
    k: 'taxa_conversao', lab: 'Conversão', meta: 50, suf: '%', inv: false, peso: 2,
    categoria: 'conversao',
    act: 'Treinar avaliação e oferta; revisar script e ancoragem de preço.',
  },
  {
    k: 'ticket_medio', lab: 'Ticket médio', meta: 1000, suf: ' R$', inv: false, peso: 1,
    categoria: 'ticket_medio',
    act: 'Estimular upgrade de pacote e combos; revisar mix de serviços.',
  },
]

/** Categorias válidas de tarefa (enum observado em plano_acao_tarefas.categoria). */
export const CATEGORIAS_TAREFA = [
  'agendamento', 'captacao', 'comparecimento', 'conversao', 'ticket_medio', 'retencao', 'geral',
] as const
export type CategoriaTarefa = (typeof CATEGORIAS_TAREFA)[number]

/** Nota 0–10 de um indicador dado o valor real (null = sem dado). */
export function notaIndicador(ind: IndicadorDef, val: number | null | undefined): number | null {
  if (val == null) return null
  const r = ind.inv ? ind.meta / Math.max(val, 0.1) : val / ind.meta
  return Math.max(0, Math.min(10, r * 10))
}

/** Status textual + classe wa-pill a partir da nota. */
export function statusNota(n: number | null): { cls: 'ok' | 'pend' | 'crit' | 'draft'; label: string } {
  if (n == null) return { cls: 'draft', label: 'Sem dado' }
  if (n >= 8) return { cls: 'ok', label: 'Bom' }
  if (n >= 6) return { cls: 'pend', label: 'Atenção' }
  return { cls: 'crit', label: 'Crítico' }
}

/** Cor (var CSS) da nota — para o número grande de pontuação. */
export function corNota(n: number | null): string {
  if (n == null) return 'var(--text-3)'
  if (n >= 8) return 'var(--green)'
  if (n >= 6) return 'var(--amber)'
  return 'var(--red)'
}

/** Formata o valor de um indicador para exibição (R$, %, inteiro). */
export function fmtValorInd(ind: IndicadorDef, v: number | null | undefined): string {
  if (v == null) return '—'
  if (ind.suf === ' R$') return 'R$ ' + Math.round(v).toLocaleString('pt-BR')
  return (Math.round(v * 10) / 10).toLocaleString('pt-BR') + ind.suf
}

/** Snapshot real lido de kpis_unidade_snapshot (só os campos do funil). */
export type FunilSnapshot = {
  agendamentos_total: number | null
  taxa_comparecimento: number | null
  taxa_conversao: number | null
  ticket_medio: number | null
  data_referencia: string | null
  periodo: string | null
}

/** Linha avaliada (indicador + valor real + nota + status). */
export type LinhaAvaliacao = {
  ind: IndicadorDef
  valor: number | null
  nota: number | null
  status: ReturnType<typeof statusNota>
}

/** Avalia os 4 indicadores do funil contra o snapshot real. */
export function avaliarFunil(snap: FunilSnapshot | null): LinhaAvaliacao[] {
  return FUNIL_INDS.map((ind) => {
    const valor = snap ? (snap[ind.k] ?? null) : null
    const nota = notaIndicador(ind, valor)
    return { ind, valor, nota, status: statusNota(nota) }
  })
}

/** Nota geral ponderada (ignora indicadores sem dado). null se nenhum tiver dado. */
export function notaGeral(linhas: LinhaAvaliacao[]): number | null {
  let s = 0
  let w = 0
  for (const l of linhas) {
    if (l.nota == null) continue
    s += l.nota * l.ind.peso
    w += l.ind.peso
  }
  return w > 0 ? s / w : null
}

/** Indicadores abaixo de 7 → viram sugestões de plano/tarefa. */
export function gargalos(linhas: LinhaAvaliacao[]): LinhaAvaliacao[] {
  return linhas.filter((l) => l.nota != null && l.nota < 7)
}
