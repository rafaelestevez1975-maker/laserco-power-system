/**
 * Base de conhecimento (Ajuda)  paridade com o legado (HELP_KB / buildAjuda /
 * ajudaScore / ajudaSearch / ajudaCard). 48 tópicos em 7 categorias, busca com
 * ranking (título +6, keywords +4, qualquer +1, top 8) e select por categoria.
 * Dados estáticos (mesma fonte do legado)  namespeado para este módulo.
 */

export type HelpTopic = {
  id: string
  cat: string
  t: string
  ic: string
  k: string
  oque: string
  serve: string
  uso: string
}

/** Data da última atualização da base (HELP_UPDATED do legado). */
export const HELP_UPDATED = '16/06/2026'

/** IDs dos tópicos mais procurados (chips da home  ajudaHome do legado). */
export const HELP_POPULARES = ['agenda', 'notas', 'finFranq', 'comissoes', 'indiques', 'pontoDigital', 'relFat', 'perfis']

export const HELP_KB: HelpTopic[] = [
  // Operação da Loja
  { id: 'dashboard', cat: 'Operação da Loja', t: 'Dashboard', ic: 'ti-layout-dashboard', k: 'inicio home metas funil ranking corridinha visao geral indicadores',
    oque: 'É a tela inicial da unidade, com uma visão executiva do dia e do mês: faturamento, metas, funil de vendas, ranking de colaboradores e a "corridinha" de metas.',
    serve: 'Serve para o gestor da loja enxergar, em segundos, como a unidade está performando e onde precisa agir.',
    uso: 'Acompanhe diariamente. Os cartões de meta mostram o quanto falta para bater o objetivo; o funil mostra onde os atendimentos estão parando; o ranking incentiva a equipe.' },
  { id: 'agenda', cat: 'Operação da Loja', t: 'Agenda', ic: 'ti-calendar', k: 'agendamento horario marcacao sessao bloqueio nova venda calendario',
    oque: 'Calendário de atendimentos por profissional, com cores por status, bloqueios e criação de agendamentos e vendas.',
    serve: 'Serve para marcar, remarcar e controlar sessões, evitando sobreposição e respeitando o GAP de horário configurado na Minha Unidade.',
    uso: 'Clique num horário livre para criar um agendamento ou uma "Nova Venda". As cores indicam confirmado, em atendimento, finalizado, falta (no-show) e bloqueio.' },
  { id: 'clientes', cat: 'Operação da Loja', t: 'Clientes', ic: 'ti-users', k: 'cadastro cliente ficha anamnese foto camera historico sessoes prontuario',
    oque: 'Base de clientes da unidade com ficha completa (dados, anamnese/ficha técnica, fotos, contratos, histórico de sessões e financeiro).',
    serve: 'Serve para centralizar tudo do cliente e dar segurança clínica e comercial ao atendimento.',
    uso: 'Abra a ficha para ver as 6 abas. Use a câmera para registrar evolução, registre a anamnese antes do primeiro procedimento e consulte o histórico de sessões.' },
  { id: 'os', cat: 'Operação da Loja', t: 'Ordens de Serviço', ic: 'ti-clipboard-list', k: 'os ordem servico execucao atendimento comanda procedimento',
    oque: 'Registro de execução dos serviços/procedimentos realizados (a "comanda" do atendimento).',
    serve: 'Serve para comprovar o que foi efetivamente executado  é a base da Visão Execução e do fato gerador da Nota Fiscal.',
    uso: 'Abra/finalize a OS ao realizar a sessão. A OS finalizada alimenta comissões, faturamento por execução e a emissão de NFS-e (quando a política é "emitir na execução").' },
  { id: 'crm', cat: 'Operação da Loja', t: 'CRM (Funil Kanban)', ic: 'ti-layout-kanban', k: 'crm funil kanban lead oportunidade follow up acompanhamento quadro',
    oque: 'Funil de relacionamento em quadro Kanban, com etapas personalizáveis e cartões de leads/clientes.',
    serve: 'Serve para não perder oportunidade: organiza contatos, follow-ups e conversões.',
    uso: 'Arraste os cartões entre as etapas. Crie quadros personalizados e registre o histórico de cada contato.' },
  { id: 'automacoes', cat: 'Operação da Loja', t: 'Automações', ic: 'ti-bolt', k: 'automacao no-show falta regua lembrete gatilho',
    oque: 'Regras automáticas que disparam ações (ex.: lembrete de sessão, régua de no-show/falta).',
    serve: 'Serve para reduzir faltas e padronizar a comunicação sem trabalho manual.',
    uso: 'Ative as automações desejadas; a régua de no-show notifica o cliente automaticamente após uma falta.' },
  // Cadastros
  { id: 'servicos', cat: 'Cadastros', t: 'Serviços', ic: 'ti-sparkles', k: 'servico procedimento tempo duracao preco area',
    oque: 'Cadastro dos serviços/procedimentos ofertados, com tempo de execução e preço.',
    serve: 'Serve de base para agenda, vendas, comissões e relatórios.',
    uso: 'Adicione, edite ou inative serviços. O tempo definido controla a duração do bloco na Agenda.' },
  { id: 'pacotes', cat: 'Cadastros', t: 'Pacotes', ic: 'ti-package', k: 'pacote combo sessoes plano oferta',
    oque: 'Conjuntos de sessões/serviços vendidos como pacote.',
    serve: 'Serve para vender e controlar quantas sessões o cliente adquiriu e já executou.',
    uso: 'Crie pacotes com nº de sessões; o consumo é abatido a cada OS executada.' },
  { id: 'produtos', cat: 'Cadastros', t: 'Produtos', ic: 'ti-box', k: 'produto pdrn estoque venda item',
    oque: 'Cadastro de produtos comercializados (ex.: PDRN).',
    serve: 'Serve para vender produtos avulsos e controlar item de venda.',
    uso: 'Cadastre novos produtos, edite preço ou inative os que saíram de linha.' },
  { id: 'planos', cat: 'Cadastros', t: 'Planos de Assinatura', ic: 'ti-repeat', k: 'assinatura recorrente mensalidade plano clube',
    oque: 'Planos de assinatura (recorrência) que o cliente contrata.',
    serve: 'Serve para gerar receita recorrente (MRR) e fidelizar.',
    uso: 'Configure valor e periodicidade; as cobranças entram na Visão Recorrência dos relatórios.' },
  { id: 'contas', cat: 'Cadastros', t: 'Contas a Pagar/Receber', ic: 'ti-cash', k: 'financeiro conta pagar receber fluxo caixa lancamento',
    oque: 'Lançamentos financeiros da unidade (a pagar e a receber), organizados por categorias hierárquicas.',
    serve: 'Serve para controlar o fluxo de caixa da loja.',
    uso: 'Lance contas com categoria, vencimento e valor; acompanhe no fluxo de caixa e nos dashboards financeiros.' },
  { id: 'catpag', cat: 'Cadastros', t: 'Categorias a Pagar / Receber', ic: 'ti-category', k: 'categoria plano de contas hierarquia despesa receita',
    oque: 'Estrutura hierárquica de categorias para classificar contas a pagar e a receber.',
    serve: 'Serve para organizar o DRE e os relatórios financeiros por natureza.',
    uso: 'Crie categorias e subcategorias; vincule cada lançamento à categoria correta.' },
  { id: 'descontos', cat: 'Cadastros', t: 'Parcerias', ic: 'ti-heart-handshake', k: 'parceria desconto cashback influencer loja unidade alcada',
    oque: 'Cadastro de parcerias da unidade com lojas e influencers, concedendo desconto (%) ou cashback (R$).',
    serve: 'Serve para registrar parcerias comerciais respeitando o teto de desconto do catálogo (serviço/produto/pacote) e a alçada do usuário.',
    uso: 'Cadastre o parceiro, escolha desconto ou cashback, vincule a uma unidade; o sistema valida o limite máximo permitido.' },
  { id: 'pgto', cat: 'Cadastros', t: 'Formas de Pagamento', ic: 'ti-credit-card', k: 'pagamento forma cartao pix recorrente pago livre parcelamento ultrassom',
    oque: 'Formas de pagamento aceitas, incluindo o Crédito Recorrente (parceiro PagoLivre).',
    serve: 'Serve para definir como o cliente paga e como a venda é contabilizada (valor integral vs. parcela mês a mês).',
    uso: 'No Crédito Recorrente o parcelamento é de até 12x e NÃO se aplica ao grupo Ultrassom; integra via token do parceiro PagoLivre.' },
  { id: 'grpserv', cat: 'Cadastros', t: 'Grupos (Serviço/Produto/Assinatura)', ic: 'ti-stack-2', k: 'grupo agrupamento categoria servico produto assinatura ultrassom',
    oque: 'Agrupadores de serviços, produtos e assinaturas.',
    serve: 'Serve para regras e relatórios por grupo (ex.: o grupo Ultrassom tem regras próprias).',
    uso: 'Organize itens em grupos para facilitar comissões, descontos e exclusões (ex.: Ultrassom sem parcelamento recorrente).' },
  { id: 'origens', cat: 'Cadastros', t: 'Origens do Cliente', ic: 'ti-route', k: 'origem captacao canal indicacao marketing',
    oque: 'Cadastro das origens/canais por onde o cliente chegou.',
    serve: 'Serve para medir de onde vêm os clientes e o ROI de marketing.',
    uso: 'Selecione a origem ao cadastrar o cliente; analise os canais nos relatórios.' },
  { id: 'contratos', cat: 'Cadastros', t: 'Modelos de Contrato', ic: 'ti-file-text', k: 'contrato modelo termo assinatura documento',
    oque: 'Modelos de contrato/termos com editor próprio.',
    serve: 'Serve para padronizar a documentação de venda e consentimento.',
    uso: 'Edite o modelo e gere o contrato do cliente a partir dele.' },
  { id: 'motivos', cat: 'Cadastros', t: 'Motivos de Cancelamento', ic: 'ti-ban', k: 'cancelamento motivo no-show falta justificativa',
    oque: 'Lista de motivos para cancelamentos e faltas.',
    serve: 'Serve para padronizar e analisar por que vendas/sessões são canceladas.',
    uso: 'Selecione o motivo ao cancelar; analise os motivos nos relatórios.' },
  { id: 'comissoes', cat: 'Cadastros', t: 'Matriz de Comissões', ic: 'ti-percentage', k: 'comissao premiacao meta matriz tier simulador 80 100 120',
    oque: 'Matriz de comissões em 2 partes: Parte 1 por dezena (faixas 80/100/120/130%) e Parte 2 no fechamento do mês (% sobre o valor final conforme meta/super/hiper), com simulador filtrável por categoria/unidade/colaborador.',
    serve: 'Serve para definir e simular quanto a equipe ganha conforme as metas.',
    uso: 'Configure as faixas; o simulador mostra a comissão para diferentes níveis de venda. Alimenta o Relatório de Pagamentos/Premiações.' },
  { id: 'metas', cat: 'Cadastros', t: 'Metas', ic: 'ti-target', k: 'meta objetivo mensal unidade colaborador',
    oque: 'Definição das metas (da unidade e por colaborador).',
    serve: 'Serve de referência para Dashboard, comissões e premiações.',
    uso: 'Defina a meta do mês; ela aparece no Dashboard e no Relatório de Faturamento (meta e projeção).' },
  // Vendas & Financeiro
  { id: 'notas', cat: 'Vendas & Financeiro', t: 'Notas Fiscais (NFS-e)', ic: 'ti-file-invoice', k: 'nota fiscal nfse emissor iss prefeitura por sessao token execucao venda',
    oque: 'Emissor de Nota Fiscal de Serviço eletrônica integrado, com política de emissão (não emitir / emitir na venda / emitir na execução).',
    serve: 'Serve para emitir NFS-e automaticamente conforme a regra escolhida, calculando por sessão (preço total ÷ nº de sessões) e recolhendo o ISS do município.',
    uso: 'Defina a política por unidade, configure o token da prefeitura. Filtre por unidade (todas/franquias/próprias) e por data (hoje, ontem, semana, 30 dias, mês, mês anterior, período).' },
  { id: 'pdv', cat: 'Vendas & Financeiro', t: 'PDV / Nova Venda', ic: 'ti-shopping-cart', k: 'pdv venda caixa frente checkout',
    oque: 'Ponto de venda para registrar vendas de serviços, pacotes e produtos.',
    serve: 'Serve para fechar a venda e gerar o recebimento e a OS.',
    uso: 'Selecione itens, forma de pagamento e finalize; a venda reflete nos relatórios conforme a visão (venda/recorrência/execução).' },
  { id: 'appCliente', cat: 'Vendas & Financeiro', t: 'App do Cliente', ic: 'ti-device-mobile', k: 'aplicativo cliente mobile agendamento fidelidade',
    oque: 'Protótipo do aplicativo do cliente (mobile) para agendamento e relacionamento.',
    serve: 'Serve para o cliente interagir com a unidade pelo celular.',
    uso: 'Use como demonstração da experiência do cliente final.' },
  // Relatórios & Dashboards
  { id: 'relatorio', cat: 'Relatórios & Dashboards', t: 'Relatórios', ic: 'ti-report', k: 'relatorio faturamento pagamentos premiacao assinaturas periodo filtro',
    oque: 'Central de relatórios com filtro de período. Destaques: Faturamento (todas as unidades, comparativo com mês anterior, meta e projeção) e Pagamentos/Premiações.',
    serve: 'Serve para analisar resultados e remunerar a equipe corretamente.',
    uso: 'No Faturamento veja venda do período, mês passado, meta e projeção (média diária × dias). Em Pagamentos veja as premiações devidas pela matriz e as projeções +20%/+30%/+50%.' },
  { id: 'relFat', cat: 'Relatórios & Dashboards', t: 'Relatório de Faturamento', ic: 'ti-chart-bar', k: 'faturamento vendas recorrencia execucao meta projecao comparativo unidades',
    oque: 'Faturamento por unidade em três visões: Vendas (valor cheio, inclui recorrência total), Recorrência (parcela mês a mês, inclui royalties) e Execução (adquirido+executado = fato gerador da NF).',
    serve: 'Serve para comparar unidades e acompanhar meta vs. realizado.',
    uso: 'Liste todas as unidades, filtre por franquia/própria/ambas e por período; compare com o mês anterior e veja a projeção do mês.' },
  { id: 'relPrem', cat: 'Relatórios & Dashboards', t: 'Pagamentos / Premiações', ic: 'ti-award', k: 'pagamento premiacao comissao colaborador meta projecao 20 30 50',
    oque: 'Relatório que calcula as premiações devidas a cada colaborador pela matriz de metas.',
    serve: 'Serve para o colaborador saber quanto precisa vender para começar a ganhar e quanto ganharia em cenários melhores.',
    uso: 'Veja o quanto falta para o gatilho de premiação e as projeções de ganho para +20%, +30% e +50% de vendas.' },
  { id: 'dashb', cat: 'Relatórios & Dashboards', t: 'Dashboards', ic: 'ti-chart-dots', k: 'dashboard financeiro contabil gerencial grafico top 10 funil',
    oque: 'Painéis analíticos (Financeiro/Contábil e Gerencial) com gráficos, Top 10 e Funil de Vendas.',
    serve: 'Serve para uma leitura visual e profunda do desempenho.',
    uso: 'Escolha o painel; explore os gráficos e rankings para apoiar decisões.' },
  // Gestão (Rede)
  { id: 'disparos', cat: 'Gestão (Rede)', t: 'Disparos WhatsApp API', ic: 'ti-brand-whatsapp', k: 'whatsapp disparo mensagem campanha api notificacao',
    oque: 'Envio de mensagens via WhatsApp API para listas e campanhas.',
    serve: 'Serve para comunicação em escala com clientes e leads.',
    uso: 'Monte a lista e a mensagem; dispare e acompanhe o resultado.' },
  { id: 'comunicados', cat: 'Gestão (Rede)', t: 'Comunicados / Mensagens', ic: 'ti-speakerphone', k: 'comunicado mensagem notificacao padrao personalizada unidade',
    oque: 'Mensagens e notificações da rede. As criadas pela administração são "padrão" (não editáveis por outros); a unidade só escolhe usar ou não.',
    serve: 'Serve para padronizar a comunicação da rede e ainda permitir mensagens locais.',
    uso: 'A unidade pode criar mensagens personalizadas, visíveis só para ela. As padrão da franqueadora ficam bloqueadas para edição.' },
  { id: 'chamados', cat: 'Gestão (Rede)', t: 'Chamados', ic: 'ti-ticket', k: 'chamado suporte ticket solicitacao atendimento interno',
    oque: 'Abertura e acompanhamento de chamados/solicitações internas à franqueadora.',
    serve: 'Serve para registrar e resolver demandas das unidades.',
    uso: 'Abra o chamado, acompanhe o status até a resolução.' },
  { id: 'checklist', cat: 'Gestão (Rede)', t: 'Checklist Mensal (PDCA)', ic: 'ti-checklist', k: 'checklist indicador pdca plano de acao ticket medio agendamento auditoria',
    oque: 'Checklist de indicadores da unidade no modelo PDCA; perguntas sobre dados da rede (ticket médio, agendamentos, dados da unidade) são preenchidas automaticamente.',
    serve: 'Serve para diagnosticar a unidade e gerar planos de ação para o indicador que se quer melhorar.',
    uso: 'Responda o checklist; o sistema preenche o que já conhece e sugere planos de ação conforme o indicador a melhorar.' },
  { id: 'universidade', cat: 'Gestão (Rede)', t: 'Universidade Corporativa', ic: 'ti-school', k: 'universidade treinamento curso prova ead capacitacao',
    oque: 'Trilhas de treinamento e provas para a equipe.',
    serve: 'Serve para capacitar e padronizar a operação da rede.',
    uso: 'Acesse os cursos e responda as provas para concluir as trilhas.' },
  { id: 'rh', cat: 'Gestão (Rede)', t: 'Recursos Humanos', ic: 'ti-users-group', k: 'rh recursos humanos colaborador ponto folha admissao portal',
    oque: 'Portal de RH integrado (gestão de colaboradores e processos de pessoal).',
    serve: 'Serve para centralizar a gestão de pessoas da rede.',
    uso: 'Acesse o portal de RH; colaboradores de escritório e loja podem ter acesso restrito apenas ao Ponto Digital.' },
  { id: 'pontoDigital', cat: 'Gestão (Rede)', t: 'Ponto Digital', ic: 'ti-map-pin-check', k: 'ponto digital gps geolocalizacao google maps cerca virtual registro jornada',
    oque: 'Registro de ponto por geolocalização (GPS) com mapa (Google Maps), validando se o colaborador está no local da unidade (cerca virtual/geofence).',
    serve: 'Serve para controlar a jornada com prova de presença no local.',
    uso: 'Habilite o GPS e marque o ponto. Configure a chave da API do Google Maps; o perfil "Ponto" dá acesso somente a esta tela.' },
  { id: 'marketing', cat: 'Gestão (Rede)', t: 'Marketing', ic: 'ti-photo', k: 'marketing materiais campanhas banco de imagens videos redes sociais noticias atualizacoes',
    oque: 'Central de materiais da rede para o franqueado: Campanhas, Banco de Imagens & Vídeos, Materiais Físicos, Redes Sociais, Extras  além de Atualizações e Notícias.',
    serve: 'Serve para o franqueado acessar sempre a versão mais recente dos materiais da marca.',
    uso: 'Navegue pelas pastas; veja as últimas atualizações (data, o que é, onde está) e receba notificação quando algo novo é publicado. Em Notícias a rede posta matérias e divulgações.' },
  { id: 'indiques', cat: 'Gestão (Rede)', t: 'Gestão de Indiques', ic: 'ti-gift', k: 'indicacao indique lead cliente sorteio premio whatsapp cpf campanha',
    oque: 'Programa de indicações: clientes indicam novos leads (nome, CPF e WhatsApp de quem indica + indicados), com CRM próprio e sorteio mensal premiado.',
    serve: 'Serve para gerar leads por indicação a favor da unidade e premiar quem mais indica.',
    uso: 'Use o link compartilhável por unidade; leads do site entram automaticamente. As listas vão do 1º ao último dia do mês. Cadastre o prêmio e rode o sorteio animado (bonito para Instagram); o ganhador recebe e-mail/WhatsApp de parabéns pedindo para agendar.' },
  // Administração (Franqueadora)
  { id: 'expansao', cat: 'Administração (Franqueadora)', t: 'Expansão (CRM de Franquias)', ic: 'ti-map-pin-plus', k: 'expansao franquia cof captacao funil lead candidato disparo whatsapp',
    oque: 'CRM de captação e qualificação de candidatos a franqueado (Ultracell, Quanta e Franquia), com pipeline até a COF e fechamento.',
    serve: 'Serve para vender novas franquias de forma organizada.',
    uso: 'Acompanhe o funil, registre leads, dispare comunicação e avance os candidatos pelas etapas até a assinatura.' },
  { id: 'implantacao', cat: 'Administração (Franqueadora)', t: 'Implantação de Unidade', ic: 'ti-building-plus', k: 'implantacao abertura nova unidade onboarding obra cronograma',
    oque: 'Acompanhamento do processo de implantação de uma nova unidade.',
    serve: 'Serve para padronizar a abertura de lojas da rede.',
    uso: 'Siga as etapas de implantação até a inauguração da unidade.' },
  { id: 'sac', cat: 'Administração (Franqueadora)', t: 'SAC', ic: 'ti-headset', k: 'sac atendimento cliente central reclamacao suporte',
    oque: 'Central de atendimento ao cliente da rede (sistema SAC Laser&Co integrado).',
    serve: 'Serve para registrar e tratar manifestações e atendimentos de clientes.',
    uso: 'Acesse o SAC pelo menu; registre e acompanhe os atendimentos da rede.' },
  { id: 'finFranq', cat: 'Administração (Franqueadora)', t: 'Financeiro Franqueadora', ic: 'ti-businessplan', k: 'financeiro franqueadora royalties taxa franquia reembolso locacao receber pagar dre fluxo importar excel juros multa atualizacao monetaria',
    oque: 'Financeiro da franqueadora: recebíveis (royalties, taxa de franquia, reembolso de disparos de Ultrassom, locação de equipamentos), pagamentos, fluxo, DRE e cálculos de atualização.',
    serve: 'Serve para gerir o que a franqueadora tem a receber das unidades e a pagar, com atualização automática de valores vencidos.',
    uso: 'Os valores a receber são atualizados automaticamente; ao vencer, aplica atualização monetária, juros de 1% e multa de 10% (padrão), com multas/juros separados do principal e valor nominal ou com acréscimos (editável/excluível). Importe lançamentos por planilha Excel (use o "Modelo").' },
  { id: 'finDre', cat: 'Administração (Franqueadora)', t: 'DRE da Franqueadora', ic: 'ti-table', k: 'dre demonstrativo resultado proprias franquias consolidado',
    oque: 'Demonstrativo de Resultado da franqueadora (lojas próprias, franquias e consolidado).',
    serve: 'Serve para analisar o resultado da operação da franqueadora.',
    uso: 'Alterne entre as visões próprias/franquias/consolidado para leitura gerencial.' },
  { id: 'juridico', cat: 'Administração (Franqueadora)', t: 'Jurídico', ic: 'ti-gavel', k: 'juridico cobranca notificacao inadimplencia atraso ok enviar financeiro',
    oque: 'Módulo jurídico integrado ao recebimento do Financeiro Franqueadora: identifica unidades que atrasaram pagamento e monta automaticamente a notificação padrão.',
    serve: 'Serve para cobrar inadimplentes com respaldo e rastreabilidade.',
    uso: 'Ao haver atraso, o sistema importa os dados (unidade, valores, a que se refere) e gera a notificação; o Jurídico revisa/ajusta e clica em "OK  Enviar".' },
  { id: 'auditoria', cat: 'Administração (Franqueadora)', t: 'Auditoria', ic: 'ti-history', k: 'auditoria log historico rastreabilidade acao registro',
    oque: 'Registro de auditoria de ações relevantes feitas no sistema.',
    serve: 'Serve para rastreabilidade, segurança e compliance.',
    uso: 'Consulte o log para saber quem fez o quê e quando.' },
  // Rede & Conta
  { id: 'minhaUnidade', cat: 'Rede & Conta', t: 'Minha Unidade', ic: 'ti-building-bank', k: 'minha unidade cadastro gap horario tipo loja shopping rua dados',
    oque: 'Cadastro e configurações da sua unidade, incluindo o GAP de horário (padrão 10 min) e o tipo de loja.',
    serve: 'Serve para ajustar como a unidade opera (intervalos da agenda, dados cadastrais).',
    uso: 'Configure o GAP de horário (intervalo entre atendimentos). Em tipo de loja escolha Shopping ou Loja de Rua.' },
  { id: 'unidades', cat: 'Rede & Conta', t: 'Todas as Unidades', ic: 'ti-buildings', k: 'unidades rede todas enderecos telefone email mapa lista',
    oque: 'Visão de todas as 59 unidades ativas da rede, com endereço, telefone e e-mail.',
    serve: 'Serve para a franqueadora e as unidades enxergarem toda a rede.',
    uso: 'Pesquise a unidade; veja dados de contato e localização.' },
  { id: 'minhaConta', cat: 'Rede & Conta', t: 'Minha Conta', ic: 'ti-user-circle', k: 'conta perfil senha usuario dados pessoais',
    oque: 'Dados da sua conta de usuário.',
    serve: 'Serve para gerenciar seu acesso e preferências.',
    uso: 'Atualize seus dados; a alteração de senha/credenciais deve ser feita por você diretamente.' },
  { id: 'perfis', cat: 'Rede & Conta', t: 'Perfis de Acesso', ic: 'ti-shield-lock', k: 'perfil acesso permissao editor visualizar alterar restricao ponto',
    oque: 'Perfis de acesso e editor de permissões: define, por menu, quem visualiza, altera, etc.  inclusive perfis restritos (ex.: acesso só ao Ponto).',
    serve: 'Serve para controlar a segurança e o que cada usuário pode fazer.',
    uso: 'No editor, marque/desmarque as permissões de cada novo menu do sistema. Defina por perfil, na coluna "Bate ponto", se aquele perfil registra ponto (GPS) ou não.' },
  { id: 'ajuda', cat: 'Rede & Conta', t: 'Ajuda (esta tela)', ic: 'ti-help-circle', k: 'ajuda base conhecimento duvida como funciona suporte busca',
    oque: 'Base de conhecimento do próprio sistema: explica o que cada item é, para que serve e como usar.',
    serve: 'Serve para tirar dúvidas sem sair do sistema.',
    uso: 'Escolha um tópico na lista ou digite o assunto que deseja. A base é atualizada sempre que o sistema muda.' },
]

/** Agrupa os tópicos por categoria (preserva a ordem de inserção). */
export function ajudaCats(): Record<string, HelpTopic[]> {
  const o: Record<string, HelpTopic[]> = {}
  for (const e of HELP_KB) {
    ;(o[e.cat] = o[e.cat] || []).push(e)
  }
  return o
}

/** Score de relevância (legado ajudaScore): título +6, keywords +4, qualquer +1. */
export function ajudaScore(e: HelpTopic, terms: string[]): number {
  let s = 0
  const hay = `${e.t} ${e.cat} ${e.k} ${e.oque} ${e.serve} ${e.uso}`.toLowerCase()
  for (const t of terms) {
    if (!t) continue
    if (e.t.toLowerCase().includes(t)) s += 6
    if (e.k.toLowerCase().includes(t)) s += 4
    if (hay.includes(t)) s += 1
  }
  return s
}

/** Busca com ranking  retorna top 8 (legado ajudaSearch). */
export function ajudaBuscar(q: string): HelpTopic[] {
  const query = (q || '').trim().toLowerCase()
  if (!query) return []
  const terms = query.split(/\s+/)
  return HELP_KB.map((e) => [e, ajudaScore(e, terms)] as const)
    .filter((x) => x[1] > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map((x) => x[0])
}
