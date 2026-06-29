/**
 * Estrutura de navegação portada 1:1 do protótipo (legacy/index.html):
 * mesmas seções, rótulos, ícones (Tabler) e badges. Cada item vira uma rota Next.
 *
 * Convenção do badge NOVO (definida com o cliente p/ homologação): NOVO = tela
 * FUNCIONAL, pronta para testar. Itens sem NOVO ainda são clone visual (sem dados/ações).
 */
export type Badge = 'NOVO' | 'ADMIN' | 'GPS' | 'BASE'

export type Leaf = {
  label: string
  href: string
  icon: string // classe tabler, ex. 'ti-layout-dashboard'
  title?: string // título exibido na topbar (default = label)
  badge?: Badge
  admin?: boolean
  /** recurso de RBAC exigido (ex.: 'crm.lead'); sufixo '.' = prefixo (ex.: 'rh.'). Sem perm = visível a todos os logados. */
  perm?: string
}
export type Group = {
  label: string
  icon: string
  key: string
  admin?: boolean
  badge?: Badge
  perm?: string
  children: Leaf[]
}
export type Item = Leaf | Group
export type Section = { title: string; items: Item[] }

export function isGroup(i: Item): i is Group {
  return (i as Group).children !== undefined
}

export const MENU: Section[] = [
  {
    title: 'Acompanhamento',
    items: [
      { label: 'Dashboard', href: '/', icon: 'ti-layout-dashboard' },
      { label: 'Agenda', href: '/agenda', icon: 'ti-calendar-event' },
      // { label: 'PDV / Nova Venda', href: '/pdv', icon: 'ti-shopping-cart', perm: 'operacoes.os' },
      { label: 'Ordens de serviço', href: '/os', icon: 'ti-clipboard-list', perm: 'operacoes.os' },
    ],
  },
  {
    title: 'Cadastros',
    items: [
      {
        label: 'Cadastros básicos', icon: 'ti-folders', key: 'cad', children: [
          { label: 'Anamnese / Ficha Técnica', href: '/cadastros/anamnese', icon: 'ti-file-text' },
          { label: 'Categorias de Contas a pagar', href: '/cadastros/categorias-pagar', icon: 'ti-category' },
          { label: 'Categorias de Contas a receber', href: '/cadastros/categorias-receber', icon: 'ti-category-2' },
          { label: 'Parcerias', href: '/cadastros/parcerias', icon: 'ti-heart-handshake' },
          { label: 'Formas de pagamento', href: '/cadastros/formas-pagamento', icon: 'ti-credit-card' },
          { label: 'Grupo de serviços', href: '/cadastros/grupo-servicos', icon: 'ti-list-details' },
          { label: 'Matriz de comissões', href: '/cadastros/comissoes', icon: 'ti-table' },
          { label: 'Metas', href: '/cadastros/metas', icon: 'ti-target' },
          { label: 'Modelos de contrato', href: '/cadastros/contratos', icon: 'ti-file-description' },
          { label: 'Motivos de cancelamento', href: '/cadastros/motivos', icon: 'ti-circle-x' },
          { label: 'Planos de Assinatura', href: '/cadastros/planos', icon: 'ti-id-badge-2' },
          { label: 'Perfis de acesso', href: '/cadastros/perfis', icon: 'ti-shield-lock', perm: 'sistema.cargo' },
          { label: 'Origens de Cliente', href: '/cadastros/origens', icon: 'ti-route' },
        ],
      },
      { label: 'Clientes', href: '/clientes', icon: 'ti-users' },
      { label: 'Colaboradores', href: '/colaboradores', icon: 'ti-user-star', perm: 'rh.colaborador' },
      { label: 'Contas a pagar / receber', href: '/contas', icon: 'ti-cash' },
      { label: 'Pacotes', href: '/pacotes', icon: 'ti-box' },
      { label: 'Produtos', href: '/produtos', icon: 'ti-package' },
      { label: 'Serviços', href: '/servicos', icon: 'ti-sparkles' },
    ],
  },
  {
    title: 'Gestão',
    items: [
      {
        label: 'Relatórios', icon: 'ti-chart-bar', key: 'rel', children: [
          { label: 'Assinaturas', href: '/relatorios/assinaturas', icon: 'ti-id-badge-2' },
          { label: 'Ocorrências e Intercorrências', href: '/relatorios/ocorrencias', icon: 'ti-clipboard-heart' },
          { label: 'Agendamentos', href: '/relatorios/agendamentos', icon: 'ti-calendar' },
          { label: 'Anamnese / Ficha Técnica', href: '/relatorios/anamnese', icon: 'ti-file-text' },
          { label: 'Atendimentos', href: '/relatorios/atendimentos', icon: 'ti-user-cog' },
          { label: 'Avaliações', href: '/relatorios/avaliacoes', icon: 'ti-speakerphone' },
          { label: 'Clientes', href: '/relatorios/clientes', icon: 'ti-bookmark' },
          { label: 'Contratos', href: '/relatorios/contratos', icon: 'ti-file-description' },
          { label: 'Crédito em dinheiro', href: '/relatorios/credito-dinheiro', icon: 'ti-coins' },
          { label: 'CRM', href: '/relatorios/crm', icon: 'ti-affiliate' },
          { label: 'Crédito Recorrente', href: '/relatorios/credito-recorrente', icon: 'ti-credit-card' },
          { label: 'Descontos', href: '/relatorios/descontos', icon: 'ti-discount' },
          { label: 'Estatísticas', href: '/relatorios/estatisticas', icon: 'ti-chart-line' },
          { label: 'Exportações', href: '/relatorios/exportacoes', icon: 'ti-download' },
          { label: 'Faturamento', href: '/relatorios/faturamento', icon: 'ti-currency-dollar' },
          { label: 'Ranking de Vendas', href: '/relatorios/ranking-vendas', icon: 'ti-medal' },
          { label: 'Fidelidade', href: '/relatorios/fidelidade', icon: 'ti-thumb-up' },
          { label: 'Financeiro / Contábil', href: '/relatorios/financeiro', icon: 'ti-report-money' },
          { label: 'Mensagens WhatsApp API', href: '/relatorios/whatsapp', icon: 'ti-brand-whatsapp' },
          { label: 'Metas', href: '/relatorios/metas', icon: 'ti-target' },
          { label: 'Notas Fiscais', href: '/relatorios/notas-fiscais', icon: 'ti-file-invoice' },
          { label: 'Ordens de serviço', href: '/relatorios/ordens-servico', icon: 'ti-clipboard-list' },
          { label: 'Pacotes', href: '/relatorios/pacotes', icon: 'ti-package' },
          { label: 'Pagamentos', href: '/relatorios/pagamentos', icon: 'ti-percentage' },
          { label: 'Perfis de acesso', href: '/relatorios/perfis-acesso', icon: 'ti-users' },
        ],
      },
      {
        label: 'Dashboards', icon: 'ti-gauge', key: 'dash', children: [
          { label: 'Financeiro / Contábil', href: '/dashboards/financeiro', icon: 'ti-report-money' },
          { label: 'Gerencial', href: '/dashboards/gerencial', icon: 'ti-chart-pie' },
          { label: 'Funil de Vendas', href: '/dashboards/funil', icon: 'ti-filter-cog' },
          { label: 'Vendas · Visão Geral', href: '/dashboards/vendas-geral', icon: 'ti-layout-dashboard', admin: true },
          { label: 'Vendas · Mês Atual', href: '/dashboards/vendas-mes', icon: 'ti-calendar-stats', admin: true },
          { label: 'Vendas · Comparativo', href: '/dashboards/vendas-comparativo', icon: 'ti-arrows-diff', admin: true },
          { label: 'Vendas · Histórico', href: '/dashboards/vendas-historico', icon: 'ti-history', admin: true },
        ],
      },
      { label: 'Mensagens e Automações', href: '/automacoes', icon: 'ti-brand-whatsapp', perm: 'marketing.campanha' },
      { label: 'Disparos WhatsApp API', href: '/disparos', icon: 'ti-brand-whatsapp', perm: 'marketing.campanha' },
      { label: 'CRM', href: '/crm', icon: 'ti-affiliate', perm: 'crm.lead' },
      { label: 'Leads do Site', href: '/leads-site', icon: 'ti-inbox', perm: 'crm.lead' },
      { label: 'Canais WhatsApp', href: '/canais', icon: 'ti-brand-whatsapp' },
      { label: 'Gestão de Indiques', href: '/indiques', icon: 'ti-gift', perm: 'crm.lead' },
      {
        label: 'Recursos Humanos', icon: 'ti-briefcase', key: 'rh', perm: 'rh.', children: [
          { label: 'Ponto Digital', href: '/ponto', icon: 'ti-map-pin-check', badge: 'GPS', perm: 'rh.ponto' },
          { label: 'Dashboard', href: '/rh', icon: 'ti-layout-dashboard', title: 'RH · Dashboard' },
          { label: 'Colaboradores', href: '/rh/colaboradores', icon: 'ti-users', title: 'RH · Colaboradores' },
          { label: 'Ponto', href: '/rh/ponto', icon: 'ti-clock', title: 'RH · Ponto' },
          { label: 'Recrutamento', href: '/rh/recrutamento', icon: 'ti-user-plus', title: 'RH · Recrutamento' },
          { label: 'Folha de Pagamento', href: '/rh/folha', icon: 'ti-cash', title: 'RH · Folha de Pagamento' },
          { label: 'Férias e Ausências', href: '/rh/ferias', icon: 'ti-calendar', title: 'RH · Férias e Ausências' },
          { label: 'Desempenho', href: '/rh/desempenho', icon: 'ti-chart-bar', title: 'RH · Desempenho' },
          { label: 'Regras da Rede', href: '/rh/regras', icon: 'ti-book', title: 'RH · Regras da Rede' },
        ],
      },
      { label: 'Marketing', href: '/marketing', icon: 'ti-ad-2', perm: 'marketing.' },
      { label: 'Comunicados', href: '/comunicados', icon: 'ti-speakerphone' },
      { label: 'Chamados', href: '/chamados', icon: 'ti-ticket' },
      { label: 'Checklist de Indicadores', href: '/checklist', icon: 'ti-checklist' },
      { label: 'Universidade Corporativa', href: '/universidade', icon: 'ti-school', perm: 'treinamento.curso' },
      { label: 'Disco Virtual', href: '/disco', icon: 'ti-cloud' },
      { label: 'Notas Fiscais', href: '/notas', icon: 'ti-file-invoice' },
    ],
  },
  {
    title: 'Administração',
    items: [
      {
        label: 'Expansão', icon: 'ti-map-pin-plus', key: 'exp', perm: 'crm.lead', children: [
          { label: 'Dashboard', href: '/expansao', icon: 'ti-chart-pie', title: 'Expansão · Dashboard' },
          { label: 'Captação de Leads', href: '/expansao/captacao', icon: 'ti-map-pin-share', title: 'Expansão · Captação (Geo + Site)' },
          { label: 'Funil', href: '/expansao/funil', icon: 'ti-filter-cog', title: 'Expansão · Funil de Vendas' },
          { label: 'Leads', href: '/expansao/leads', icon: 'ti-list-check', title: 'Expansão · Leads (Kanban / Lista)' },
          { label: 'Disparos WhatsApp', href: '/expansao/disparos', icon: 'ti-send', title: 'Expansão · Disparos WhatsApp' },
          { label: 'WhatsApp CRM', href: '/expansao/whatsapp', icon: 'ti-brand-whatsapp', title: 'Expansão · WhatsApp CRM' },
          { label: 'Tipo de Lead', href: '/expansao/tipos', icon: 'ti-tag', title: 'Expansão · Tipo de Lead' },
        ],
      },
      { label: 'Implantação de Unidade', href: '/implantacao', icon: 'ti-building-plus' },
      {
        label: 'SAC', icon: 'ti-headset', key: 'sacm', perm: 'sac.', children: [
          { label: 'Dashboard', href: '/sac', icon: 'ti-layout-dashboard', title: 'SAC · Dashboard' },
          { label: 'Chamados', href: '/sac/chamados', icon: 'ti-headset', title: 'SAC · Chamados' },
          { label: 'Kanban', href: '/sac/kanban', icon: 'ti-layout-kanban', title: 'SAC · Kanban' },
          { label: 'Conversa', href: '/sac/triagem', icon: 'ti-brand-whatsapp', title: 'SAC · Conversa' },
          { label: 'Relatórios', href: '/sac/relatorios', icon: 'ti-chart-bar', title: 'SAC · Relatórios' },
          { label: 'Pagamentos', href: '/sac/pagamentos', icon: 'ti-cash', title: 'SAC · Pagamentos' },
          { label: 'Atendentes', href: '/sac/atendentes', icon: 'ti-users', title: 'SAC · Atendentes' },
          { label: 'Ranking', href: '/sac/ranking', icon: 'ti-trophy', title: 'SAC · Ranking' },
          { label: 'Importar Leads', href: '/sac/importar', icon: 'ti-file-import', title: 'SAC · Importar Leads' },
          { label: 'Configurações', href: '/sac/config', icon: 'ti-settings', title: 'SAC · Configurações' },
        ],
      },
      {
        label: 'Financeiro Franqueadora', icon: 'ti-businessplan', key: 'finfranq', perm: 'financeiro.', children: [
          { label: 'Fluxo de Caixa', href: '/financeiro', icon: 'ti-cash', title: 'Financeiro · Fluxo de Caixa' },
          { label: 'Contas a Receber', href: '/contas?aba=receber', icon: 'ti-arrow-down-left', title: 'Financeiro · Contas a Receber' },
          { label: 'Contas a Pagar', href: '/contas?aba=pagar', icon: 'ti-arrow-up-right', title: 'Financeiro · Contas a Pagar' },
          { label: 'DRE', href: '/financeiro/dre', icon: 'ti-report-money', title: 'Financeiro · DRE' },
          { label: 'Conciliação Bancária', href: '/financeiro/conciliacao', icon: 'ti-building-bank', title: 'Financeiro · Conciliação Bancária' },
          { label: 'Automação de Royalties', href: '/financeiro/royalties', icon: 'ti-percentage', title: 'Financeiro · Automação de Royalties' },
          { label: 'Cobrança & Régua', href: '/financeiro/cobranca', icon: 'ti-gavel', title: 'Financeiro · Cobrança & Régua' },
          { label: 'Configurações', href: '/financeiro/config', icon: 'ti-settings', title: 'Financeiro · Configurações' },
        ],
      },
      { label: 'Jurídico', href: '/juridico', icon: 'ti-gavel', admin: true },
      { label: 'Auditoria', href: '/auditoria', icon: 'ti-history', perm: 'sistema.audit' },
    ],
  },
  {
    title: 'Rede & Conta',
    items: [
      { label: 'Minha Unidade', href: '/minha-unidade', icon: 'ti-building-bank' },
      { label: 'Todas unidades', href: '/unidades', icon: 'ti-buildings', perm: 'sistema.unidade' },
      { label: 'Minha conta', href: '/minha-conta', icon: 'ti-user-circle' },
      { label: 'App do Cliente', href: '/app-cliente', icon: 'ti-device-mobile' },
      { label: 'Exportações', href: '/exportacoes', icon: 'ti-download' },
      { label: 'Ajuda', href: '/ajuda', icon: 'ti-help-circle', badge: 'BASE' },
    ],
  },
]

/**
 * Fonte de verdade do estado FUNCIONAL de cada tela (convenção com o cliente p/ homologação):
 * rota AQUI = tela funcional → cor normal/ativa no menu. Fora daqui = ainda é clone visual do
 * legado (aspecto apagado/inativo + tag "prévia"). Quando uma tela ficar 100% pronta (igual ao
 * HTML e com dados), basta ADICIONAR a rota aqui que ela "acende" sozinha no menu.
 * Classificação auditada em 27/06 (5 agentes lendo cada page.tsx + cross-check no filesystem).
 */
export const ROTAS_FUNCIONAIS = new Set<string>([
  // Acompanhamento
  '/', '/agenda', '/pdv', '/os',
  // Cadastros
  '/cadastros/anamnese', '/cadastros/categorias-pagar', '/cadastros/categorias-receber', '/cadastros/parcerias',
  '/cadastros/formas-pagamento', '/cadastros/grupo-servicos', '/cadastros/comissoes', '/cadastros/metas',
  '/cadastros/contratos', '/cadastros/motivos', '/cadastros/planos', '/cadastros/perfis', '/cadastros/origens',
  '/clientes', '/colaboradores', '/contas', '/pacotes', '/produtos', '/servicos',
  // Gestão · Relatórios (só os com tela real; os demais ainda são snapshot)
  '/relatorios/agendamentos', '/relatorios/clientes', '/relatorios/contratos', '/relatorios/descontos',
  '/relatorios/faturamento', '/relatorios/metas', '/relatorios/ordens-servico',
  '/relatorios/pagamentos', '/relatorios/ranking-vendas',
  // (Relatório Financeiro/DRE ainda é parcial — só receitas, sem despesas → prévia)
  // Gestão · Dashboards (vendas-* ainda são iframe de HTML estático do legado → prévia)
  '/dashboards/financeiro', '/dashboards/gerencial', '/dashboards/funil',
  // Gestão · diversos
  '/automacoes', '/disparos', '/crm', '/leads-site', '/canais', '/indiques',
  '/marketing', '/comunicados', '/chamados', '/checklist', '/universidade', '/disco', '/notas',
  // Gestão · RH
  '/ponto', '/rh', '/rh/colaboradores', '/rh/ponto', '/rh/recrutamento', '/rh/folha', '/rh/ferias', '/rh/desempenho', '/rh/regras',
  // Administração · Expansão
  '/expansao', '/expansao/disparos', '/implantacao',
  // Administração · SAC
  '/sac', '/sac/chamados', '/sac/kanban', '/sac/triagem', '/sac/relatorios', '/sac/pagamentos',
  '/sac/atendentes', '/sac/ranking', '/sac/importar', '/sac/config',
  // Administração · Financeiro Franqueadora
  '/financeiro', '/financeiro/dre', '/financeiro/conciliacao', '/financeiro/royalties', '/financeiro/cobranca', '/financeiro/config',
  '/juridico', '/auditoria',
  // Rede & Conta
  '/unidades', '/minha-conta', '/exportacoes', '/ajuda', '/minha-unidade', '/app-cliente',
  // Re-classificação 2026-06-29 (certificação botão-a-botão, 6 agentes): estas telas já estão
  // funcionais (queries reais / empty-state honesto) e antes apareciam apagadas como "prévia".
  // Dashboards de vendas (migrados p/ VendasReal):
  '/dashboards/vendas-geral', '/dashboards/vendas-mes', '/dashboards/vendas-comparativo', '/dashboards/vendas-historico',
  // Expansão (CRM de franquias + sub-abas):
  '/expansao/captacao', '/expansao/funil', '/expansao/leads', '/expansao/tipos', '/expansao/whatsapp',
  // Relatórios (todos com dado real do Supabase ou estado vazio honesto):
  '/relatorios/anamnese', '/relatorios/assinaturas', '/relatorios/atendimentos', '/relatorios/avaliacoes',
  '/relatorios/credito-dinheiro', '/relatorios/credito-recorrente', '/relatorios/crm', '/relatorios/estatisticas',
  '/relatorios/exportacoes', '/relatorios/fidelidade', '/relatorios/financeiro', '/relatorios/notas-fiscais',
  '/relatorios/ocorrencias', '/relatorios/pacotes', '/relatorios/perfis-acesso', '/relatorios/whatsapp',
])

/** A rota (sem querystring) corresponde a uma tela funcional? Usado pelo Sidebar p/ acender/apagar. */
export function ehFuncional(href: string): boolean {
  return ROTAS_FUNCIONAIS.has(href.split('?')[0])
}

/** Título + ícone para a topbar a partir do pathname. */
export function titleFor(pathname: string): { icon: string; title: string } {
  for (const section of MENU) {
    for (const item of section.items) {
      if (isGroup(item)) {
        const hit = item.children.find((c) => c.href === pathname)
        if (hit) return { icon: hit.icon, title: hit.title ?? `${item.label} · ${hit.label}` }
      } else if (item.href === pathname) {
        return { icon: item.icon, title: item.title ?? item.label }
      }
    }
  }
  return { icon: 'ti-layout-dashboard', title: 'Dashboard' }
}
