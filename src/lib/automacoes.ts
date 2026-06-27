/**
 * Catálogo das automações PADRÃO da rede — espelho fiel do AUTOS do legado
 * (legacy/index.html 3880-3910). No legado o estado vive em memória; aqui o
 * catálogo é estático (texto/gatilho/ação/categoria/ícone) e o ESTADO ativo
 * por unidade é persistido em automacoes_estado.
 *
 * `chave` é o identificador estável usado em automacoes_estado.chave.
 * `canais` mantém a regra do legado (3916): META = só 'push'; demais sempre
 * incluem 'wa' (e-mail/sms suspensos). Canal 'push' = Sistema.
 */
export type AutoCanal = 'wa' | 'push'
export type AutoPasso = { dia: string; titulo: string; desc: string }
export type AutoDet = { servicos: string[]; janela: string; passos: AutoPasso[] }

export type AutomacaoPadrao = {
  chave: string
  nome: string
  cat: string
  ic: string
  gat: string
  ac: string
  canais: AutoCanal[]
  ativoDefault: boolean
  stat?: string
  det?: AutoDet
}

export const AUTO_CATEGORIAS = ['Todas', 'Revenda', 'Agendamentos', 'Pós-venda', 'CRM', 'Fidelização', 'META', 'Cadastro', 'Personalizada'] as const

/** Cores por categoria (espelha AUTO_COL do legado 3915, em CSS vars do app). */
export const AUTO_COR: Record<string, [string, string]> = {
  Revenda: ['var(--gold-soft, #F6EAD2)', 'var(--gold-600, #9A7B27)'],
  Agendamentos: ['var(--blue-bg, #E7F0FA)', 'var(--blue, #3D7FD1)'],
  'Pós-venda': ['var(--green-bg, #E7F9EE)', 'var(--green, #1a8a4f)'],
  CRM: ['#F7E7EB', 'var(--brand-500, #A8455C)'],
  Fidelização: ['var(--gold-soft, #F6EAD2)', 'var(--gold-600, #9A7B27)'],
  META: ['var(--amber-bg, #FBF0DD)', 'var(--amber, #E0922A)'],
  Cadastro: ['#F7E7EB', 'var(--brand-500, #A8455C)'],
  Personalizada: ['#E7F0EC', '#0f6b3a'],
}

export const CANAL_LBL: Record<AutoCanal, string> = { wa: 'WhatsApp', push: 'Sistema' }

export const AUTOS_PADRAO: AutomacaoPadrao[] = [
  {
    chave: 'revenda_8m', nome: 'Revenda de serviço recorrente (8 meses)', cat: 'Revenda', ic: 'ti-rotate-clockwise-2',
    gat: 'um serviço recorrente completa 8 meses desde a última sessão realizada',
    ac: 'dispara um fluxo de 7 dias oferecendo a nova sessão do mesmo serviço para manter o resultado no tempo, e registra a oportunidade de revenda no CRM',
    canais: ['wa'], ativoDefault: true, stat: 'recupera 22% em revenda',
    det: {
      servicos: ['Ultrassom — todos (UltraCel / microfocado)', 'Rejuvenescimento Facial 4D', 'Rejuvenescimento das Mãos', 'Rejuvenescimento Colo e Pescoço', 'PDRN e Exossomos', 'Melasma'],
      janela: 'Oferta válida por 7 dias (condição especial para resgatar a revenda)',
      passos: [
        { dia: 'Dia 0', titulo: 'Oferta', desc: '"Já fazem 8 meses do seu {serviço} 💜 Para manter o resultado, preparamos uma condição especial válida por 7 dias." + link de agendamento' },
        { dia: 'Dia 3', titulo: 'Reforço', desc: 'relembra os benefícios de manter o protocolo no tempo e a condição ativa' },
        { dia: 'Dia 6', titulo: 'Último aviso', desc: '"Sua condição especial encerra amanhã" + CTA de agendar' },
        { dia: 'Dia 7', titulo: 'Encerramento', desc: 'sem agendamento → registra a oportunidade de revenda no CRM (etapa Reativação) para a equipe abordar' },
      ],
    },
  },
  { chave: 'venda_tardia', nome: 'Venda Tardia — recuperação pós-avaliação', cat: 'CRM', ic: 'ti-clock-hour-9', gat: 'passam 5 dias da avaliação ou do orçamento sem fechamento', ac: 'lança o cliente automaticamente no CRM como "Venda Tardia" e abre o fluxo Kanban (Novo → 1º contato → …), com prazo de andamento de 48h', canais: ['wa'], ativoDefault: true, stat: 'recupera vendas perdidas' },
  { chave: 'boas_vindas', nome: 'Boas-vindas ao novo cliente', cat: 'Cadastro', ic: 'ti-confetti', gat: 'um novo cliente é cadastrado', ac: 'envia WhatsApp de boas-vindas com o link da Anamnese Digital para preencher', canais: ['wa'], ativoDefault: true, stat: '92% de abertura' },
  { chave: 'entrada_crm', nome: 'Entrada automática no CRM', cat: 'CRM', ic: 'ti-user-plus', gat: 'um novo cliente ou lead é cadastrado', ac: 'cria o lead na etapa "Novo Lead" do funil e atribui um responsável', canais: ['push'], ativoDefault: true, stat: '100% dos leads' },
  { chave: 'confirma_agenda', nome: 'Confirmação de agendamento', cat: 'Agendamentos', ic: 'ti-calendar-check', gat: 'um agendamento é criado', ac: 'envia confirmação com data, hora, serviço e unidade', canais: ['wa'], ativoDefault: true },
  { chave: 'lembrete_24h', nome: 'Lembrete 24h antes da sessão', cat: 'Agendamentos', ic: 'ti-clock', gat: 'faltam 24 horas para a sessão', ac: 'envia lembrete pedindo confirmação de presença', canais: ['wa'], ativoDefault: true },
  { chave: 'lembrete_2h', nome: 'Lembrete final 2h antes', cat: 'Agendamentos', ic: 'ti-bell', gat: 'faltam 2 horas para a sessão', ac: 'envia o lembrete final com endereço da unidade', canais: ['wa'], ativoDefault: true },
  { chave: 'no_show', nome: 'Recuperação de não comparecimento', cat: 'Agendamentos', ic: 'ti-calendar-x', gat: 'o cliente não comparece', ac: '2h depois envia até 2 mensagens oferecendo remarcação; sem resposta, exclui e computa o no-show', canais: ['wa'], ativoDefault: true, stat: '64 recuperados/mês' },
  { chave: 'pos_sessao', nome: 'Orientações pós-sessão', cat: 'Pós-venda', ic: 'ti-clipboard-heart', gat: '3 horas após a sessão', ac: 'envia os cuidados pós-procedimento personalizados ao serviço feito', canais: ['wa'], ativoDefault: true },
  { chave: 'nps_google', nome: 'Pedido de avaliação (NPS / Google)', cat: 'Pós-venda', ic: 'ti-star', gat: '1 dia após a sessão', ac: 'pede avaliação e review no Google; se nota alta, incentiva indicação', canais: ['wa'], ativoDefault: true, stat: '4,8★ média' },
  { chave: 'aniversario', nome: 'Aniversário do cliente', cat: 'Fidelização', ic: 'ti-cake', gat: 'é o aniversário do cliente', ac: 'envia os parabéns com um cupom de desconto exclusivo', canais: ['wa'], ativoDefault: true },
  { chave: 'reativa_inativos', nome: 'Reativação de inativos', cat: 'Fidelização', ic: 'ti-refresh', gat: 'o cliente está sem retorno há 60 dias', ac: 'envia oferta de retorno e agenda uma avaliação', canais: ['wa'], ativoDefault: false, stat: 'reengaja 18%' },
  { chave: 'expira_pacote', nome: 'Alerta de expiração de pacote', cat: 'Pós-venda', ic: 'ti-package', gat: 'faltam 30 dias para o pacote expirar', ac: 'avisa o cliente para agendar as sessões restantes', canais: ['wa'], ativoDefault: true },
  { chave: 'nutre_leads', nome: 'Nutrição de leads (3 mensagens)', cat: 'CRM', ic: 'ti-messages', gat: 'o lead não responde à abordagem', ac: 'envia a 1ª, 2ª e 3ª mensagem padronizada em sequência (Gestão de Geolocalizado)', canais: ['wa'], ativoDefault: true },
  { chave: 'recupera_orcamento', nome: 'Recuperação de orçamento', cat: 'CRM', ic: 'ti-receipt', gat: 'o lead está parado em "Proposta" há 2 dias', ac: 'envia follow-up de fechamento com condição especial', canais: ['wa'], ativoDefault: true },
  { chave: 'oferta_dia', nome: 'REVENDA · Oferta do dia (30 min antes da sessão)', cat: 'Revenda', ic: 'ti-discount-2', gat: 'faltam 30 minutos para a sessão do cliente', ac: 'envia por WhatsApp a "Oferta do Dia" com condições imperdíveis (relação de serviços e ofertas configurável) para o cliente aproveitar e adquirir na hora, antes da sessão', canais: ['wa'], ativoDefault: true, stat: 'oferta-relâmpago pré-sessão' },
  { chave: 'meta_geral', nome: 'META · Alerta geral de meta para a equipe', cat: 'META', ic: 'ti-target', gat: 'faltam menos de 20% para a meta da unidade', ac: 'notifica pelo sistema o gestor e a equipe (colaboradores cadastrados) do quanto falta vender no período. Lembrete: o sistema faz análise trimestral de desempenho de cada colaborador', canais: ['push'], ativoDefault: true },
  { chave: 'meta_gerente', nome: 'META · Gerente e Sub-gerente da unidade', cat: 'META', ic: 'ti-user-shield', gat: 'a cada 3 dias (exceto domingo), ao medir os indicadores da unidade', ac: 'notifica pelo sistema a Gerente e a Sub-gerente cadastradas quando: agendamentos da unidade abaixo da meta projetada do mês; clientes novos abaixo de 25% do total agendado; menos de 10 indicações por dia; ticket médio 20% abaixo da média da rede; conversão 20% abaixo da média da rede; ou meta individual 20% abaixo do projetado. Lembrete: o sistema faz análise trimestral de desempenho de cada colaborador', canais: ['push'], ativoDefault: true, stat: 'medição a cada 3 dias · exceto domingo' },
  { chave: 'meta_consultora', nome: 'META · Consultora de Vendas (meta individual)', cat: 'META', ic: 'ti-user-dollar', gat: 'a cada 3 dias (exceto domingo), ao medir os indicadores individuais da consultora', ac: 'notifica pelo sistema a consultora cadastrada quando, na sua meta individual: agendamentos abaixo do projetado; clientes novos abaixo de 25% do agendado; menos de 10 indicações por dia; ticket médio 20% abaixo da média da rede; conversão 20% abaixo da média da rede; ou meta individual 20% abaixo do projetado. Lembrete: o sistema faz análise trimestral de desempenho de cada colaborador', canais: ['push'], ativoDefault: true, stat: 'por meta individual · a cada 3 dias' },
  { chave: 'meta_fisio', nome: 'META · Fisioterapeuta (revenda e meta)', cat: 'META', ic: 'ti-stethoscope', gat: 'a cada 3 dias (exceto domingo), ao medir revenda e meta individual', ac: 'notifica pelo sistema o(a) fisioterapeuta cadastrado(a) quando está abaixo da média na revenda de serviços ou 20% abaixo da projeção da sua meta individual. Lembrete: o sistema faz análise trimestral de desempenho de cada colaborador', canais: ['push'], ativoDefault: true, stat: 'revenda + meta individual' },
]

/** Quantas automações vêm ativas por default no catálogo (para o KPI X/Y). */
export const AUTOS_TOTAL = AUTOS_PADRAO.length
export const AUTOS_ATIVAS_DEFAULT = AUTOS_PADRAO.filter((a) => a.ativoDefault).length

// ─── Segmentador de base (SEG_CAMPOS 6645 + segCount 6675 do legado) ───

export type SegOps = string[]
export type SegCampoDef = { l: string; type: 'sel' | 'serv' | 'num' | 'uni' | 'txt'; ops: SegOps; vals?: string[] }

export const SEG_CAMPOS: Record<string, SegCampoDef> = {
  verificado: { l: 'Verificado', type: 'sel', ops: ['é'], vals: ['Sim', 'Não'] },
  jaCliente: { l: 'Já contratou algo', type: 'sel', ops: ['é'], vals: ['Sim (algum pacote/serviço)', 'Não (nunca contratou)'] },
  contratou: { l: 'Contratou o serviço', type: 'serv', ops: ['='] },
  naoContratou: { l: 'NÃO contratou o serviço', type: 'serv', ops: ['='] },
  gasto: { l: 'Gasto total (R$)', type: 'num', ops: ['maior que', 'menor que'] },
  unidade: { l: 'Unidade', type: 'uni', ops: ['='] },
  cidade: { l: 'Cidade', type: 'txt', ops: ['='] },
  estado: { l: 'Estado (UF)', type: 'txt', ops: ['='] },
}

export type SegCriterio = { campo: string; op: string; valor: string }

/** Estima nº de contatos do segmento (espelha segCount 6675 — base 1248 × fatores). */
export function segCount(criterios: SegCriterio[]): number {
  let n = 1248
  const f: Record<string, number> = { verificado: 0.45, jaCliente: 0.55, contratou: 0.22, naoContratou: 0.8, gasto: 0.35, unidade: 0.09, cidade: 0.13, estado: 0.28 }
  criterios.forEach((c) => { if (f[c.campo] != null) n *= f[c.campo] })
  return Math.max(0, Math.round(n))
}

/** Rótulo legível do segmento (segLabel 6677). */
export function segLabel(criterios: SegCriterio[]): string {
  return criterios.map((c) => `${SEG_CAMPOS[c.campo]?.l ?? c.campo} ${c.op || ''} ${c.valor || ''}`.trim()).join(' · ') || 'Segmento personalizado'
}

/** Status pill (WA_ST 6546): chave → [classe, rótulo]. */
export const WA_PILL: Record<string, [string, string]> = {
  ok: ['ok', 'Conectada'], pend: ['pend', 'Pendente'], run: ['run', 'Em disparo'],
  sched: ['pend', 'Agendada'], done: ['done', 'Concluída'], draft: ['draft', 'Rascunho'],
  warm: ['run', 'Aquecendo'], live: ['run', 'Ao vivo'],
}
