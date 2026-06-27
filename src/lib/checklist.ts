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
  k:
    | 'agendamentos_total'
    | 'taxa_comparecimento'
    | 'taxa_conversao'
    | 'taxa_conversao_revenda'
    | 'ticket_medio'
    | 'taxa_noshow'
    | 'taxa_ocupacao'
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

/**
 * Os 7 indicadores do funil — paridade EXATA com o CHK_INDS legado (legacy ~6081).
 * Agendamentos(300) · Comparecimento(85%) · Conversão novos(50%) · Conversão revenda(55%)
 * · Ticket médio(R$1000) · No-show(<=10%, inv) · Ocupação da agenda(80%).
 *
 * Os 3 novos (convR, noshow, ocup) leem colunas que podem não existir ainda no
 * snapshot real — nesse caso o valor vem null (Sem dado) e não geram plano.
 */
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
    k: 'taxa_conversao', lab: 'Conversão · novos', meta: 50, suf: '%', inv: false, peso: 2,
    categoria: 'conversao',
    act: 'Treinar avaliação e oferta; revisar script e ancoragem de preço.',
  },
  {
    k: 'taxa_conversao_revenda', lab: 'Conversão · revenda', meta: 55, suf: '%', inv: false, peso: 1.5,
    categoria: 'conversao',
    act: 'Trabalhar recompra (PDRN, manutenção 8 meses) e ofertas de revenda.',
  },
  {
    k: 'ticket_medio', lab: 'Ticket médio', meta: 1000, suf: ' R$', inv: false, peso: 1,
    categoria: 'ticket_medio',
    act: 'Estimular upgrade de pacote e combos; revisar mix de serviços.',
  },
  {
    k: 'taxa_noshow', lab: 'No-show', meta: 10, suf: '%', inv: true, peso: 1,
    categoria: 'agendamento',
    act: 'Ativar automação de no-show e política de sinal no agendamento.',
  },
  {
    k: 'taxa_ocupacao', lab: 'Ocupação da agenda', meta: 80, suf: '%', inv: false, peso: 1,
    categoria: 'agendamento',
    act: 'Otimizar grade e encaixes; reduzir janelas ociosas.',
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
  /** colunas opcionais (podem não existir no snapshot ainda) */
  taxa_conversao_revenda?: number | null
  ticket_medio: number | null
  taxa_noshow?: number | null
  taxa_ocupacao?: number | null
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

// ═══════════════════════════════════════════════════════════════════════════
// Checklist MENSAL de Indicadores (modelo SULTS · ciclo PDCA) — legacy chkMensal
// (legacy ~6114-6166). Espelha as 6 seções, ~26 questões com itens "auto"
// preenchidos pelos dados da rede/unidade, pontuação 340 e geração de planos.
// Funções PURAS — os valores reais entram via FunilSnapshot + médias da rede.
// ═══════════════════════════════════════════════════════════════════════════

export type MediasRede = {
  ag: number
  comp: number
  conv: number
  ticket: number
}

export type QuestaoMensal = {
  num: string
  txt: string
  resp: string
  /** null = N/A (informativa); true = Conforme; false = Não conforme */
  conf: boolean | null
  /** [obtidos, possiveis] | null para N/A */
  pts: [number, number] | null
  auto: boolean
}

export type SecaoMensal = { titulo: string; questoes: QuestaoMensal[] }

export type PlanoMensal = {
  indicador: string
  acao: string
  situacao: string
  responsavel: string
}

export type ChecklistMensal = {
  secoes: SecaoMensal[]
  planos: PlanoMensal[]
  pontos: number
  total: number
  pct: number
}

function _q(
  num: string,
  txt: string,
  resp: string,
  conf: boolean | null,
  pts: [number, number] | null,
  auto: boolean,
): QuestaoMensal {
  return { num, txt, resp, conf, pts, auto }
}

/**
 * Monta o checklist mensal SULTS a partir do snapshot real da unidade e das
 * médias da rede. Porta fielmente chkMensal (legacy 6114-6166): mesmos textos,
 * mesmas fórmulas auto (projeção 30d, meta 630/mês, >=20% novos, faturamento do
 * funil) e a mesma pontuação (tot=340; 7 itens fixos "Sim" sempre somam 70).
 */
export function montarChecklistMensal(snap: FunilSnapshot | null, avg: MediasRede): ChecklistMensal {
  const ag = Math.round(snap?.agendamentos_total ?? 0)
  const comp = Math.round(snap?.taxa_comparecimento ?? 0)
  const conv = Math.round(snap?.taxa_conversao ?? 0)
  const ticket = Math.round(snap?.ticket_medio ?? 0)

  const proj = Math.round(ag * 0.92) // projeção 30 dias (10 dias × 3 ≈ 0.92 do mês)
  const novos = Math.max(5, Math.round(conv * 0.38))
  const fat = Math.round(ag * (comp / 100) * (conv / 100) * ticket * 1.6)

  const avgAg = avg.ag, avgComp = avg.comp, avgConv = avg.conv, avgTicket = avg.ticket

  const cAg = ag >= 630 || ag >= avgAg
  const cNovos = novos >= 20
  const cComp = comp >= avgComp
  const cConv = conv >= avgConv
  const cTicket = ticket >= avgTicket

  const secoes: SecaoMensal[] = [
    {
      titulo: 'Seção 1 · Introdução',
      questoes: [
        _q('1.1.', 'Quem está participando da reunião?', 'Gerente + Franqueado', null, null, false),
        _q('1.2.', 'A unidade possui contratos em aberto (30 dias) pendentes de assinatura?', ag % 2 ? 'Não' : 'Sim', !(ag % 2 === 0), [ag % 2 ? 10 : 0, 10], true),
        _q('1.3.', 'Possui Ordens de Serviço em aberto (30 dias) ou clientes não reagendados?', 'Não', true, [10, 10], true),
      ],
    },
    {
      titulo: 'Seção 2 · Agendamento',
      questoes: [
        _q('2.1.', 'Quantos agendamentos a unidade teve no último mês?', String(ag), null, null, true),
        _q('2.2.', 'Projeção de agendamento nos próximos 30 dias (10 dias × 3).', String(proj), null, null, true),
        _q('2.3.', 'A unidade agenda ao menos 630/mês (ou 210/dezena) ou acima da média de leads?', cAg ? 'Sim' : 'Não', cAg, [cAg ? 10 : 0, 10], true),
        _q('2.5.', 'Ao menos 20% dos agendamentos são clientes novos?', cNovos ? 'Sim' : 'Não', cNovos, [cNovos ? 10 : 0, 10], true),
        _q('2.6.', 'Percentual de clientes novos no último mês (desejado > 20%)?', novos + '%', null, null, true),
        _q('2.11.', 'A agenda está montada corretamente (fisios em execução; gerente em avaliações; ultrassom nos dias do equipamento)?', 'Sim', true, [10, 10], false),
        _q('2.17.', 'A agenda de Ultrassom está ≥ 40% preenchida com antecedência (8/dia)?', ag >= 300 ? 'Sim' : 'Não', ag >= 300, [ag >= 300 ? 10 : 0, 10], true),
      ],
    },
    {
      titulo: 'Seção 3 · Comparecimento',
      questoes: [
        _q('3.1.', 'Percentual de comparecimento nos últimos 30 dias?', comp + '%', null, null, true),
        _q('3.2.', `O comparecimento está acima da média da rede (${avgComp.toFixed(0)}%)?`, cComp ? 'Sim' : 'Não', cComp, [cComp ? 10 : 0, 10], true),
        _q('3.4.', 'Tendência do indicador nos últimos 3 meses (crescente/estável/decrescente)?', cComp ? 'Crescente' : 'Decrescente', cComp, [cComp ? 20 : 0, 20], true),
        _q('3.5.', 'Confirmação da agenda em 3 etapas via WhatsApp (mensagem padrão)?', 'Sim', true, [10, 10], false),
      ],
    },
    {
      titulo: 'Seção 4 · Conversão',
      questoes: [
        _q('4.1.', 'Percentual de conversão nos últimos 30 dias?', conv + '%', null, null, true),
        _q('4.2.', `A conversão está acima da média da rede (${avgConv.toFixed(0)}%)?`, cConv ? 'Sim' : 'Não', cConv, [cConv ? 10 : 0, 10], true),
        _q('4.4.', 'Tendência da conversão nos últimos 3 meses?', cConv ? 'Crescente' : 'Decrescente', cConv, [cConv ? 20 : 0, 20], true),
        _q('4.6.', 'Equipe tem tabela de preços/parcelamento e margem de desconto à mão?', 'Sim', true, [10, 10], false),
      ],
    },
    {
      titulo: 'Seção 5 · Ticket Médio',
      questoes: [
        _q('5.1.', 'Ticket médio da unidade nos últimos 30 dias?', 'R$ ' + ticket.toLocaleString('pt-BR'), null, null, true),
        _q('5.2.', `O ticket médio está acima da média da rede (R$ ${Math.round(avgTicket).toLocaleString('pt-BR')})?`, cTicket ? 'Sim' : 'Não', cTicket, [cTicket ? 10 : 0, 10], true),
        _q('5.4.', 'Tendência do ticket nos últimos 3 meses?', cTicket ? 'Crescente' : 'Estável', cTicket, [cTicket ? 20 : 0, 20], true),
        _q('5.5.', 'Explora bem os serviços que puxam o ticket (PDRN, Rejuvenescimento, Ultrassom FullFace)?', cTicket ? 'Sim' : 'Não', cTicket, [cTicket ? 10 : 0, 10], true),
      ],
    },
    {
      titulo: 'Seção 6 · Faturamento',
      questoes: [
        _q('6.1.', 'Faturamento estimado da unidade no mês (funil)?', 'R$ ' + fat.toLocaleString('pt-BR'), null, null, true),
        _q('6.2.', 'A unidade projeta faturamento acima da média e do mês anterior?', cAg && cConv ? 'Sim' : 'Não', cAg && cConv, [cAg && cConv ? 10 : 0, 10], true),
        _q('6.4.', 'A unidade conhece metas e super-metas e a sua importância?', 'Sim', true, [10, 10], false),
        _q('6.6.', 'Descontos + gratuidades na semana limitados a 100% do faturamento?', 'Sim', true, [10, 10], false),
      ],
    },
  ]

  // Planos de ação automáticos (indicadores abaixo da média/meta) — legacy chkMensal
  const planos: PlanoMensal[] = []
  if (!cAg) planos.push({ indicador: 'Agendamentos', acao: FUNIL_INDS[0].act, situacao: `${ag} / meta 630`, responsavel: 'Gerente da unidade' })
  if (!cNovos) planos.push({ indicador: '% Clientes novos', acao: 'Prospecção ativa em redes sociais + sorteio por indicações (3–5 leads/cliente).', situacao: `${novos}% / meta 20%`, responsavel: 'Consultor de Vendas' })
  if (!cComp) planos.push({ indicador: 'Comparecimento', acao: FUNIL_INDS[1].act, situacao: `${comp}% / rede ${avgComp.toFixed(0)}%`, responsavel: 'Recepção / SAC' })
  if (!cConv) planos.push({ indicador: 'Conversão', acao: FUNIL_INDS[2].act, situacao: `${conv}% / rede ${avgConv.toFixed(0)}%`, responsavel: 'Gerente / Vendas' })
  if (!cTicket) planos.push({ indicador: 'Ticket médio', acao: FUNIL_INDS[4].act, situacao: `R$ ${ticket} / rede R$ ${Math.round(avgTicket)}`, responsavel: 'Gerente / Vendas' })

  // Pontuação — legacy: itens variáveis + 7 itens fixos "Sim" (70 pts). tot=340.
  const variaveis: [boolean, number][] = [
    [cAg, 10], [cNovos, 10], [ag >= 300, 10], [cComp, 10], [cComp, 20],
    [cConv, 10], [cConv, 20], [cTicket, 10], [cTicket, 20], [cTicket, 10], [cAg && cConv, 10],
  ]
  let pontos = 0
  for (const [ok, p] of variaveis) if (ok) pontos += p
  pontos += 70 // 7 itens fixos "Sim" (10 cada)
  const total = 340
  const pct = Math.round((pontos / total) * 100)

  return { secoes, planos, pontos, total, pct }
}
