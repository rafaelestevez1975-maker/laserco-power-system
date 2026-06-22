/* ============================================================================
 *  Gerador do Checklist de Homologação (QA) — Laser&Co Power System
 *  ---------------------------------------------------------------------------
 *  Lê a base de funcionalidades (abaixo) e emite um HTML otimizado para A4
 *  paisagem. Converta para PDF com:  weasyprint checklist-homologacao.html \
 *      "Checklist-Homologacao-LaserCo.pdf"
 *
 *  Cada item: [funcionalidade, comportamento esperado, observação técnica]
 *  A observação técnica vem da análise do código (o que é funcional x
 *  protótipo/stub x integração x regra de negócio x validação).
 * ==========================================================================*/

const META = {
  sistema: 'Laser&Co Power System',
  versao: 'Build de 2026-06-16 (PWA + Disco Virtual + SAC)',
  geradoEm: '18/06/2026',
  escopo: 'index.html (SPA) + portal-rh.html (RH) + vendas-dashboards.html (Dashboards de Vendas)',
};

/* Cada seção: { id, titulo, nota?, rows: [[f, c, o], ...] } */
const SECOES = [

/* =====================================================================
 * A. ACESSO, AUTENTICAÇÃO, PERMISSÕES E PLATAFORMA
 * ===================================================================*/
{ id:'A', titulo:'Acesso, Autenticação, Permissões e Plataforma (transversal)', rows:[
['Tela de login','Overlay central com logo, campos E-mail e Senha, botão Entrar e alternância Entrar/Cadastrar; Enter na senha submete.','Integração real Supabase Auth.'],
['Login e-mail/senha','Autentica via Supabase (signInWithPassword); em sucesso carrega o perfil e entra no sistema; credenciais inválidas exibem mensagem traduzida.','Integração real. Valida campos não vazios.'],
['Cadastro de usuário (sign-up)','Cria usuário via Supabase signUp; se exigir confirmação por e-mail, exibe aviso e volta ao login.','Integração real; depende de confirmação por e-mail.'],
['Mensagens de erro de autenticação','Traduz erros do Supabase ("E-mail ou senha incorretos", "E-mail já cadastrado", "Confirme seu e-mail"); botão mostra "Aguarde…" durante a chamada.','Validação client-side + tradução.'],
['Modo demonstração (sem nuvem)','Entra sem backend como perfil Proprietário, com dados de exemplo; avisa que alterações ficam só no navegador; oculta a opção "Sair".','Sem persistência em nuvem; fallback quando Supabase ausente.'],
['Conta de teste','Atalho com teste@lasercompany.com / 123456 entra em modo local mantendo a opção "Sair"; registra na Auditoria.','PROTÓTIPO: não autentica na nuvem (estado local).'],
['Logout','Encerra sessão (signOut), zera estado autenticado e reabre a tela de login; opção visível só após login.','Integração real.'],
['Recuperação de senha','Deve permitir redefinir a senha por e-mail.','AUSENTE no index.html — não há "Esqueci minha senha" (existe apenas no app de Vendas).'],
['Sessão persistente','Ao recarregar, restaura a sessão ativa (getSession) e entra direto.','Integração real.'],
['Persistência local (localStorage)','Salva ~40 coleções (clientes, CRM, financeiro, auditoria, etc.) em localStorage; autosave a cada 8s, ao sair e ao ocultar a aba; restaura na abertura.','Real. Chave lcps_v1.'],
['Sincronização em nuvem (app_state)','Quando autenticado, faz upsert/seleção do estado em Supabase (tabela app_state) com debounce; toast "Dados sincronizados".','Real. Row único compartilhado (não por usuário).'],
['Registro de venda em nuvem','PDV soma a venda do dia em sales_entries (alimenta os Dashboards de Vendas); trata erro de permissão (RLS) com fallback local e toast informativo.','Real. Escrita exige perfil admin (RLS).'],
['Troca de perfil ativo','Seletor no topo troca o perfil simulado (Proprietário, Gerente, Profissional, SAC, Marketing, Financeiro, Expansão, Implantação, Ponto), reaplica restrições e registra na Auditoria.','Simulação local de papéis (não altera o role real do Supabase).'],
['Restrição de menu por perfil (applyRole)','Cada perfil enxerga apenas as telas permitidas (allowOnly/hideView/hideSub); se a tela ativa ficar oculta, redireciona ao dashboard.','Regra de UI; não impede acesso via console.'],
['Itens exclusivos de administrador','Expansão, Financeiro Franqueadora, Jurídico e Auditoria só aparecem para Proprietário (ou perfis com adminOK).','isAdmin = perfil Proprietário.'],
['Editor de perfis de acesso','Grid de ~50 grupos de permissões (Agenda, Clientes, Financeiro, Relatórios, RH, etc.) com checkboxes; botões "Marcar/Desmarcar todas" e clique no título alterna o grupo.','Catálogo PERMS extenso.'],
['Salvar perfil de acesso','Deve persistir as permissões marcadas do perfil.','PROTÓTIPO: botão "Salvar" só exibe toast; não grava os checkboxes.'],
['Listagem de perfis (CRUD)','Lista perfis com nº de usuários, data e status; permite editar, inativar/ativar e excluir (com confirmação).','13 perfis pré-cadastrados.'],
['Alçada de desconto por cargo/unidade','Desconto efetivo aplicado é o menor entre o limite do cargo e o máximo da unidade; usado no PDV.','Regra de negócio real (persistida).'],
['Vedação de downloads para não-admin','Cliques em botões/links de exportar/baixar são bloqueados para não-administradores, com registro na Auditoria e toast.','Real (navegação não é bloqueada).'],
['Barra superior — título da tela','Atualiza título e ícone conforme o item de menu selecionado.','Real.'],
['Barra superior — unidade ativa','Seletor por estado/UF troca a unidade ativa; exibe banner quando a unidade é de Treinamento (fora de relatórios).','Real (estado em memória).'],
['Barra superior — notificações (sino)','Badge com contagem real (comunicados pendentes, chamados novos, OS abertas, leads vencidos, royalties em atraso); clicar navega à tela.','Real (deriva de dados em memória).'],
['Barra superior — busca global','Busca em Clientes, OS, Chamados e Comunicados; dropdown agrupado; clicar navega ao item.','Real sobre dados em memória.'],
['Barra superior — menu do usuário','Deve exibir o usuário logado e ações de conta.','PROTÓTIPO: bloco "Rafael Estevez · Administrador" é fixo/cosmético.'],
['Barra superior — Nova Venda','Dropdown (Venda de Pacote / Assinatura) abre modais; salvar exibe toast e, no fluxo PDV, registra a venda em nuvem.','Modais reais; salvar parcialmente simulado.'],
['Exportar CSV da tela (botão global)','Serializa a primeira tabela da tela ativa em CSV (UTF-8) e baixa.','Real; restrito a administrador.'],
['PWA — manifesto','App instalável (standalone), nome/short_name, tema bordô #230A10, ícones 192/512 e maskable, categorias business/productivity/finance, pt-BR.','Manifesto válido e completo.'],
['PWA — service worker','Estratégia network-first para GET same-origin, atualiza cache a cada fetch, fallback offline e para index.html; limpa caches antigos.','Real (cache lcps-v2).'],
['PWA — botão "Instalar app"','Captura beforeinstallprompt e exibe botão flutuante; dispara o prompt nativo; some após instalação.','Real (instalabilidade nativa).'],
['Navegação — sidebar e roteador','Itens [data-view] ativam a seção e disparam o build da tela (render sob demanda); submenus expansíveis.','Real.'],
['Navegação — menu mobile (hambúrguer)','Em telas ≤900px a sidebar vira off-canvas com backdrop; fecha ao escolher um item.','Real.'],
['Responsividade (desktop/tablet/mobile)','Breakpoints 1080/900/760px: oculta busca/textos, colapsa grids para 1 coluna, sidebar off-canvas; componentes (KPIs, PDV, chat, grids de permissão) adaptam.','Real e abrangente — validar em 3 larguras.'],
['Tema visual','Tema único claro vinho/dourado via variáveis CSS; cor do tema #230A10.','Sem modo escuro / sem seletor de tema.'],
['Feedback — toasts','showToast exibe notificação temporária (2,8s) como padrão de feedback de toda ação.','Real.'],
['Feedback — modais e confirmações','Modais genéricos abrem/fecham por botão ou clique no overlay; exclusões usam confirm() nativo do navegador.','Confirmação nativa (sem modal customizado).'],
['Auditoria — registro de eventos','auditLog registra login, troca de perfil, vendas, financeiro, jurídico, descontos, downloads bloqueados, etc. (máx. 400).','Real e amplamente instrumentado. Data do carimbo é fixa (só a hora é real).'],
['Auditoria — tela','KPIs (eventos, hoje, usuários, política Soft-delete), filtro por ação e tabela data/usuário/perfil/ação/detalhe.','Restrita a administrador.'],
['Política de soft-delete','Registros deveriam mudar para Ativo/Inativo, sem exclusão definitiva.','PARCIAL: coexistem exclusões reais (descontos, categorias, mensagens, etapas, leads).'],
]},

/* =====================================================================
 * B. OPERAÇÃO DA LOJA
 * ===================================================================*/
{ id:'B', titulo:'Operação da Loja', rows:[
['Dashboard — saudação e contexto','Cabeçalho com nome do usuário, unidade e período selecionado.','-'],
['Dashboard — filtro de período','7 opções (Hoje, Ontem, Última semana, Este mês, Mês anterior, Últimos 30 dias, Personalizado) atualizam KPIs e funil.','Sem seletor real de datas para "personalizado".'],
['Dashboard — KPIs e tendências','Cards de agendamentos do período, próximos 7 dias e meta da unidade com tendência vs período anterior, barra de progresso e sub-métricas.','Dados ilustrativos; reage ao filtro.'],
['Dashboard — funil de conversão','Etapas Agendamentos→Comparecimentos→Conversões→Ticket médio com percentuais; comparação com a média da rede.','Atualiza pelo filtro de período.'],
['Dashboard — Corridinha de Vendas','Ranking diário e mensal entre unidades; botão "Atualizar agora" recalcula e exibe toast.','Dados simulados (random).'],
['Dashboard — rankings e gráficos','Ranking de agendamentos por unidade e gráficos de barras (faturamento, leads por origem, conversão por colaborador).','Gráficos em HTML/CSS próprios (não Chart.js).'],
['Agenda — grade por profissional','Grade 08h–20h por profissional, com slots por intervalo (padrão 10 min) e marcação de horas/meias-horas.','-'],
['Agenda — renderizar agendamentos','Eventos posicionados por horário, com cores por status; finalizado exibe cadeado.','-'],
['Agenda — novo agendamento','Em slot vazio abre modal (cliente, serviços multi-seleção, recálculo de duração); avisa sobreposição > 60 min e exige ciência para confirmar.','Validação: conflito de horário e teto de 60 min.'],
['Agenda — editar agendamento','Clicar em evento reabre o modal preenchido; finalizado é restrito a admin; bloqueio remete às Configurações.','Validação de status.'],
['Agenda — eventos da rede','Faixa com eventos do dia/próximos; checkbox para mostrar na agenda; criar novo evento (modal) restrito a gestores, valida título e ≥1 direcionamento.','auditLog; restrição por gestor.'],
['Agenda — navegação de datas','Botões anterior/próximo e mini-calendário; dia atual destacado.','-'],
['Agenda — resolução da grade (GAP)','Configurar intervalo 10/15/20/30 min nas Configurações da Unidade; persiste e registra na Auditoria.','Real.'],
['Ordens de Serviço — listar','Tabela de OS (cliente, unidade, comanda, origem, status, datas, desconto, total) com estado vazio.','Dados em memória.'],
['Ordens de Serviço — filtrar por status/unidade','Filtros de Status e de Unidade(s) reaplicam a lista.','Únicos filtros funcionais.'],
['Ordens de Serviço — demais filtros e ações','Filtros (período, origem, pagamento, colaborador, serviço, vendedor), botão "Visualizar", "Exportar", paginação e configurações.','PROTÓTIPO: campos e botões inertes/sem ação.'],
['Anamnese/Fichas — listar documentos','Tabela de modelos (nome, tipo, unidades, obrigatoriedade, status, data).','-'],
['Anamnese/Fichas — criar/editar modelo','Editor com nome, tipo (Anamnese/Ficha/Termo), descrição, obrigatoriedade e seções/campos.','-'],
['Anamnese/Fichas — estrutura de campos','Adicionar/remover/reordenar seções e campos; tipos: Sim/Não, texto curto/longo, número, seleção, consentimento, assinatura, imagem.','-'],
['Anamnese/Fichas — regras do campo','Marcar campo obrigatório e "inviabilizante" (resposta positiva invalida o serviço); documento acumulativo entre sessões.','Regra de negócio clínica.'],
['Anamnese/Fichas — acesso por unidade','Definir quais unidades veem o documento (por unidade ou "todas").','-'],
['Anamnese/Fichas — pré-visualizar/salvar/inativar','Pré-visualizar (toast), salvar (toast de disponibilização) e inativar/reativar.','Pré-visualização é stub (sem render real).'],
['PDV — selecionar cliente','Campo de busca de cliente obrigatório para finalizar.','Validação: "Informe o cliente".'],
['PDV — catálogo e carrinho','Abas Serviços/Pacotes/Produtos com busca; adicionar item, ajustar quantidade (+/−) e remover; recálculo automático.','-'],
['PDV — desconto por alçada','Campo de % 0–100 comparado ao limite do perfil; acima do limite exige aprovação do gestor para liberar a finalização.','Validação por perfil/alçada.'],
['PDV — forma de pagamento/parcelas','Seleção de forma (PIX, Dinheiro, Débito, Crédito, Link, Crédito Recorrente PagoLivre) e parcelas 1x–12x.','PagoLivre "até 12x · não Ultrassom" é apenas rótulo.'],
['PDV — controle de cortesias','Itens gratuitos: limite de 1 por cliente e por venda; teto mensal de cortesias por unidade; toasts de bloqueio ao exceder.','Regra de negócio.'],
['PDV — finalizar venda','Gera nº de OS, insere em OS_DATA (fechada), exibe toast com valor/forma/parcelas e NFS-e (se marcada); registra a venda em nuvem; reseta o PDV.','Emissão de NFS-e é só texto no toast (sem emissão real).'],
['App do Cliente — navegação','5 telas (Início, Agendar, Sessões, Fidelidade, Unidades) com relógio do status bar.','PROTÓTIPO navegável.'],
['App do Cliente — agendar/confirmar','Selecionar unidade/serviço/profissional/data/horário e confirmar; reagendar/confirmar próximo agendamento.','PROTÓTIPO: ações resultam em toast (sem persistência).'],
['App do Cliente — fidelidade e resgate','Saldo de pontos, nível (Bronze/Prata/Ouro), cashback e resgate de itens.','PROTÓTIPO: regras descritivas; resgate é toast sem validar saldo.'],
['App do Cliente — indicar amigos','Até 5 amigos (nome/telefone/unidade); valida limite e nome; "+50 pts" por amigo.','Envio à unidade é simulado (toast).'],
['App do Cliente — unidades e rotas','Lista de unidades; "Rotas" e "Agendar aqui".','"Rotas" é toast (não abre o mapa).'],
]},

/* =====================================================================
 * C. CLIENTES E COLABORADORES
 * ===================================================================*/
{ id:'C', titulo:'Clientes e Colaboradores', rows:[
['Clientes — listar','Tabela com clientes importados + fictícios (nome, telefone, e-mail, documento, gênero, ativo, verificado, app); link WhatsApp; clique abre a ficha.','Dados mock/local.'],
['Clientes — filtros e paginação','Painel de filtros (ativo, nome, e-mail, telefone, documento, gênero, cidade, unidade…) e paginação.','PROTÓTIPO: "Pesquisar"/"Exportar" sem ação; paginação cosmética.'],
['Clientes — base na nuvem','Consulta paginada na tabela customers do Supabase (50/página), busca por nome; estados de carregando/vazio/erro.','Integração Supabase (somente leitura); exige login.'],
['Clientes — novo cliente','Modal com campos obrigatórios (Nome, Telefone, E-mail, Onde nos conheceu) e extras (CPF, gênero, cidade, unidade).','PROTÓTIPO: "Salvar cadastro" sem ação; validações apenas visuais.'],
['Clientes — importar (ler/mapear)','Lê CSV/XLSX, auto-mapeia colunas por sinônimos, prévia editável de 3 linhas com seletores de mapeamento.','Integração XLSX (SheetJS).'],
['Clientes — importar (processar)','Limpa nomes, infere gênero, normaliza ativo/verificado, deduplica (documento>telefone>nome), vincula unidade/origem e atualiza a lista.','Validação: exige arquivo; toasts de gênero/duplicados.'],
['Clientes — gravar importação na nuvem','Com "Gravar no banco" e login, insere em lotes de 500 na tabela customers, com progresso e total.','Integração Supabase.'],
['Clientes — baixar modelo de importação','Gera e baixa modelo_importacao_clientes.csv (com exemplo).','Real (download client-side).'],
['Clientes — exportar','Deve exportar clientes para Excel.','PROTÓTIPO: botão "Exportar" sem ação.'],
['Ficha do cliente — abrir e abas','6 abas: Dados básicos, Acompanhamento, Agendamentos, Ordens de Serviço, Contratos, Carteira.','Dados mock.'],
['Ficha — dados básicos','Formulário (nome, e-mail, telefone, nascimento, gênero, documento, observação, endereço) e "Verificado"; salvar.','PROTÓTIPO: sem validação de CPF/e-mail; "Salvar" é toast.'],
['Ficha — registro fotográfico','Abre a câmera do dispositivo (getUserMedia), captura/anexa foto à galeria da sessão; fallback para arquivo.','API de mídia real; fotos só em memória.'],
['Ficha — acompanhamento (termos)','Lista de termos/documentos do cliente (anamnese, sessão, autorização de imagem) com status.','PROTÓTIPO: links "Abrir" sem navegação.'],
['Ficha — agendamentos/OS/contratos','Tabelas do histórico do cliente.','PROTÓTIPO: dados fixos; links sem ação.'],
['Ficha — carteira/fidelidade','Cards de pontos, cashback e plano de assinatura; histórico de sessões dos pacotes (modal).','Valores fixos; modal de sessões funcional.'],
['Ficha — inativar/unificar/bloqueios/app','Ações de rodapé da ficha.','PROTÓTIPO: sem ação.'],
['Colaboradores — listar','Lista COLAB + cadastros vindos do RH (tag "via RH"); nome, perfil, telefone, último acesso, exibe na agenda, ativo; contadores.','Sincroniza com o módulo RH (localStorage).'],
['Colaboradores — inativação por inatividade','Usuário sem acesso há mais de 15 dias é inativado automaticamente; alerta visual a partir de 5 dias antes; registra na Auditoria.','Regra de negócio real.'],
['Colaboradores — reativar','Reativa colaborador inativo, registra novo acesso e Auditoria; toast.','Real.'],
['Colaboradores — novo/editar (form)','Form com Dados básicos, Acesso ao sistema (senha) e Profissional (exibe na agenda, % comissão, ordem no app); itens vindos do RH abrem "no RH".','Senha/foto/e-mail sem validação real.'],
['Colaboradores — serviços executados','Checklist de serviços por grupo (marcar todos/por grupo/item), com sincronização pai/filho.','Real (em memória).'],
['Colaboradores — salvar','Valida nome obrigatório, insere em COLAB, envia ao RH e recarrega o iframe; Auditoria; toast; volta à lista.','Integração RH; valida só o nome.'],
['Colaboradores — exportar','Deve exportar colaboradores.','PROTÓTIPO: botão "Exportar" sem ação.'],
]},

/* =====================================================================
 * D. CADASTROS E CATÁLOGO
 * ===================================================================*/
{ id:'D', titulo:'Cadastros e Catálogo', rows:[
['Categorias a pagar — CRUD','Editor em árvore (10 grupos) com sinal "(−)"; incluir grupo/categoria, editar inline, inativar/ativar, excluir (grupo com confirmação).','Persiste; Auditoria.'],
['Categorias a pagar — salvar','Persiste a estrutura, registra na Auditoria e exibe toast.','Real.'],
['Categorias a receber — CRUD/salvar','Igual a "a pagar", com sinal "(+)" e árvore própria (Vendas / Formas de Recebimento).','Real; Auditoria.'],
['Descontos — listar','Tabela (nome, % serviço/produto/pacote, validade, unidades, ativo).','Coluna unidades: vazio = "Todas".'],
['Descontos — incluir','Modal com nome (obrigatório), %, validade opcional e multisseleção de unidade; normaliza vírgula decimal; persiste; Auditoria.','Validação: nome. Não há editar/inativar.'],
['Descontos — excluir','Confirmação, remove, persiste e registra na Auditoria.','Real.'],
['Limite de desconto por cargo/unidade','Configurar limite por cargo (DESC_LIMIT) e máximo por unidade; teto mensal de cortesias; GAP da agenda.','Edição só Proprietário/Gerente de Campo; persiste.'],
['Formas de pagamento — listar','Tabela (nome, tipo, taxa %, taxa a descontar na comissão, ativo).','Crédito Recorrente PagoLivre no topo.'],
['Formas de pagamento — incluir/alterar','Modal (nome obrigatório, tipo, taxas, ativo); editar/criar; persiste e Auditoria.','Validação: nome.'],
['Formas de pagamento — inativar/ativar','Alterna o status (sem exclusão); persiste; toast.','Real.'],
['Crédito Recorrente (PagoLivre)','Bloco extra: modo Integrado/Manual, token, parcelamento máx 1–12, valor mín/parcela, base de royalties (recorrência/venda), exclui grupo Ultrassom; Auditoria detalha config.','Integração gateway é configuração/stub (token guardado, sem chamada real).'],
['Fornecedores — consultar/incluir','Filtros (ativo, nome, telefone, documento), tabela com estado vazio e botão Novo.','PROTÓTIPO: sem CRUD real (botão Novo só toast).'],
['Grupo de serviços','Lista (Depilação/Estético/Ultrassom) com filtros; incluir.','Read-only; "Novo" só toast.'],
['Grupo de produtos / assinaturas','Filtros e tabela com estado vazio; incluir.','PROTÓTIPO: telas placeholder sem CRUD.'],
['Matriz de comissões — editar categorias','Cards por cargo (5): premiação base (venda individual, meta da loja, sessão executada) e adicional por meta nos tiers 80/100/120%; edição inline.','Persiste; ticket de sessão R$250; meta R$100.000.'],
['Matriz de comissões — incluir/remover','Adicionar nova categoria e remover (sem confirmação).','-'],
['Matriz de comissões — simulador','Calcula base + adicional por tier; <80% = sem prêmio; mensagens de falta/atingimento; barra com marcas 80/100/120.','Regra de negócio real; divisor por período (mês/quinzena/dezena).'],
['Metas — editar/calcular','Inputs de meta de venda (piso R$100.000) e agendamentos; sliders de realizado; supermeta = meta×1,2; alertas de atingimento.','Cálculo real; por período.'],
['Metas — salvar','Publica as metas no Dashboard da unidade (toast).','Sem persistência/Auditoria explícita.'],
['Modelos de contrato — listar/editar','Lista (7 modelos) e editor (dados básicos, quando emitido, enviar e-mail, conteúdo/termos, upload de assinatura).','Texto vem do BEMP quando existe.'],
['Modelos de contrato — incluir/salvar/preview/inativar','Novo, salvar, pré-visualizar e inativar.','PROTÓTIPO: ações são toast; sem persistência.'],
['Motivos de cancelamento — CRUD','Lista (padrão do sistema x personalizado); incluir/editar (prompt), inativar/ativar, excluir.','REGRA: itens padrão do sistema só inativam (não excluem).'],
['Planos de Assinatura — listar','Lista (6 planos) com adesão, mensalidade, modo de utilização, tipo de comissão, identificador.','Read-only; "Novo" só toast.'],
['Origens de Cliente — CRUD','Lista (Geolocalizado, Passante, Indicação, Parcerias, Outros); incluir/editar (prompt), inativar/ativar, excluir.','"Geolocalizado" é preenchido pelo CRM via geolocalização.'],
['Serviços — listar/filtrar','Tabela (nome, preço, desc. máx, duração, comissionável, grupo, ativo, ordem) com filtros.','112 itens (ilustrativo).'],
['Serviços — incluir/alterar/inativar','Modal (nome obrigatório, preço, desc. máx, duração, grupo, comissionável); inativar/reativar (sem exclusão).','Validação: nome.'],
['Pacotes — listar/CRUD','Tabela (nome, cobertura de créditos, comissão na execução, validade, valor, desc. máx, ativo); incluir/alterar/inativar.','199 itens (ilustrativo).'],
['Produtos — listar/CRUD','Tabela (nome, grupo, preço, desc. máx, ativo, insumo); incluir/alterar/inativar.','Controle de estoque é config da unidade.'],
]},

/* =====================================================================
 * E. FINANCEIRO E FISCAL
 * ===================================================================*/
{ id:'E', titulo:'Financeiro e Fiscal', rows:[
['Contas a pagar/receber (menu)','Tela com segmentação, filtros e tabela.','PROTÓTIPO: tela estática; "Novo lançamento"/"Pesquisar"/"Exportar" sem ação. O módulo real fica no Financeiro Franqueadora.'],
['Financeiro — acesso ao módulo','Financeiro Franqueadora restrito a administrador ou perfil Financeiro; demais veem aviso de acesso restrito.','Permissão.'],
['Contas a Receber — listar/filtrar','Lista recebíveis (royalties 10%, taxa de franquia, fundo de marketing, etc.) com filtros por categoria e status (inclui Suspenso); totais.','Dados seed/local.'],
['Contas a Receber — gerar/ver boleto','Gera nº de boleto e marca enviado (toast); "ver boleto" abre detalhamento.','Simulado (nº fictício; envio é toast).'],
['Contas a Receber — dar baixa','Marca como pago, registra data e atualiza notificações.','Simulado (retorno bancário fictício).'],
['Contas a Receber — suspender/reativar','Suspenso sai dos totais em aberto e dashboards; reativar recalcula o atraso; bloqueia suspender se já pago.','Regra de negócio (Suspenso = em discussão).'],
['Contas a Receber — importar Excel/modelo','Lê planilha (detecta colunas, valores em pt-BR) e cria lançamentos; baixar modelo .xlsx.','Integração XLSX.'],
['Contas a Pagar — listar/filtrar','Lista despesas (folha, impostos, aluguel, fornecedores, reembolso SAC); filtros por escopo e prioridade; cards de totais.','Dados seed/local.'],
['Contas a Pagar — prioridade/pagar/suspender','Definir prioridade (padrão por categoria); pagar (toast); suspender/reativar.','Regra de prioridade; pagamento simulado.'],
['Contas a Pagar — importar Excel/modelo','Lê planilha e cria lançamentos; baixar modelo .xlsx.','Integração XLSX.'],
['Contas a Pagar — nova despesa/comprovante','Cadastro de nova despesa e comprovante de pagamento.','PROTÓTIPO: toasts ("disponível na versão integrada").'],
['Financeiro — fluxo de caixa','KPIs (a receber, recebido, inadimplência, a pagar, resultado projetado), gráfico de 6 meses e composição de recebíveis.','Série parcialmente ilustrativa.'],
['Financeiro — projeção de caixa','Projeção 7/10/15/30 dias (ou custom): entradas diluídas em dias úteis × saídas por vencimento; saldo dia a dia; destaca negativo.','Cálculo funcional sobre dados mock; data-base fixa.'],
['Financeiro — DRE','Visões Consolidado/Lojas próprias/Franquias/Franqueadora, drill por loja, AV% sobre receita; KPIs receita/EBITDA/lucro com margens.','Cálculo derivado.'],
['Financeiro — cálculos (atualização de débito)','Importa recebíveis em atraso e calcula correção monetária + multa (10%) + juros mora (1% a.m. pro rata), com encargos separados; modo nominal x com acréscimos.','Regra de negócio central; índices/percentuais editáveis.'],
['Financeiro — atualizar índices (BCB)','Busca índices na API SGS do Banco Central (IGP-M/IPCA/INPC/SELIC/CDI), com timeout e fallback aos índices embarcados.','INTEGRAÇÃO REAL (HTTP).'],
['Financeiro — demonstrativo (HTML/PDF)','Gera demonstrativo de atualização em HTML (download) e PDF (impressão do navegador) com metodologia.','Real (usa print do navegador).'],
['Financeiro — conciliação bancária','Cruza venda × extrato × taxa do adquirente, marca divergências e inconsistências; "rodar conciliação".','Conciliação é mock; "rodar" não reprocessa (toast).'],
['Financeiro — automação de royalties','Gera boletos, baixa em lote (sem atraso) e roda a régua (escala atraso ≥ D+10 ao Jurídico).','PROTÓTIPO declarado: simula; integração bancária real seria via servidor.'],
['Financeiro — cobrança & régua','Lista inadimplentes com contato e próxima ação da régua; notificar (e-mail+WhatsApp) e escalar ao Jurídico.','Envios simulados; escalonamento integra ao Jurídico.'],
['Financeiro — configurações','% royalties/fundo, dia de vencimento, banco de cobrança, categorias de recebíveis, taxas de adquirentes e régua editáveis; salvar.','Senha/token não trafegam pelo navegador (aviso); persiste.'],
['Notas Fiscais — política de emissão','Segmentação: não emitir / na venda / na execução; mensagem contextual; Auditoria.','Real (variável em memória).'],
['Notas Fiscais — cálculo por sessão','Preço por sessão = total ÷ nº de sessões; cada execução gera NFS-e + comissão proporcional.','Regra ilustrativa (sem motor real de geração).'],
['Notas Fiscais — integração prefeituras','Tabela de unidades com município, provedor (ABRASF/Betha/ISSNet/WebISS/Nota Carioca/Paulistana/ADN), alíquota ISS, política, status, ambiente; "Conectar/Gerenciar".','PROTÓTIPO: provedor/alíquota/conexão são determinísticos (mock); configuração é stub.'],
['Notas Fiscais — emitidas e filtros','KPIs (emitidas, valor, canceladas, processando), filtros e ações (Pesquisar, Exportar XMLs, Exportar, Emitir NFS-e manual).','PROTÓTIPO: lista mock; filtros/exportações/emitir manual sem ação.'],
['Jurídico — fila de cobranças','Varre recebíveis em atraso sem vínculo jurídico e gera notificações padrão (2ª notificação se ≥20 dias); KPIs; cards editáveis.','Integração direta com recebíveis; restrito a admin.'],
['Jurídico — OK/enviar/ajustar/descartar','Enviar notificação (status enviada; e-mail simulado), salvar ajuste de texto e descartar (confirmação, libera o vínculo).','Badge de pendentes; envio simulado.'],
['Jurídico — unidades e documentos','Filtra por status; anexar/substituir/remover PDF (Contrato/Pré-contrato/COF).','Anexo guarda só o nome (sem upload real).'],
['Jurídico — modelos de notificação','7 modelos editáveis com placeholders ({unidade}, {franqueado}, {cnpj}, {prazo}, {data}); novo/excluir (confirmação).','Persiste.'],
['Jurídico — notificação manual','Modal preenche o template escolhido e envia (e-mail simulado).','Envio simulado.'],
]},

/* =====================================================================
 * F. COMUNICAÇÃO, CRM E MARKETING
 * ===================================================================*/
{ id:'F', titulo:'Comunicação, CRM e Marketing', rows:[
['Mensagens e Automações — catálogo','17 automações (recompra, boas-vindas, lembretes, no-show, pós-sessão, NPS, aniversário, reativação, etc.) com gatilho→ação e canais.','Disparo não é real (rótulos).'],
['Mensagens — filtro por categoria','Chips filtram o grid (Recompra, Agendamentos, Pós-venda, CRM, Fidelização, Financeiro, Cadastro, Personalizada).','Funcional.'],
['Mensagens — ativar/inativar','Liga/desliga a automação; recalcula KPIs; persiste e Auditoria.','Padrão da rede só admin edita; unidade apenas usa/não usa.'],
['Mensagens — criar/editar/excluir','Admin cria mensagem padrão da rede; não-admin cria personalizada (isolada por unidade); editar/excluir (confirmação).','Permissão por perfil; persiste.'],
['Disparos — campanhas','Lista de campanhas (unidade, base, status, enviadas/lidas/respostas) e KPIs; relatório com funil e destinatários.','Dados estáticos; "Nova campanha" é stub.'],
['Disparos — enviar respondentes ao CRM','Cria leads no CRM a partir dos respondentes (origem "Disparo WhatsApp").','Funcional (integração interna).'],
['Disparos — conversas','Central de chat das conversas vindas de disparos; responder; abrir no CRM.','Envio é stub (sem WhatsApp API); abrir no CRM é funcional.'],
['Disparos — bases','Lista bases (sistema/externa); criar base por filtros (tipo de cliente, último serviço, etc.); importar/disparar/exportar.','Criar base é simulada (random); importar/disparar/exportar são stub.'],
['Disparos — configuração da API','Lista número/credenciais WhatsApp Cloud API por unidade, status e token mascarado; conectar/testar/editar.','PROTÓTIPO: dados estáticos; sem integração Meta real.'],
['Disparos — Grupo VIP','Ciclo de grupo WhatsApp temporário conduzido por IA; KPIs e tabela; agendar/ofertas/convidar/link/stories.','PROTÓTIPO: ações são toast.'],
['CRM — KPIs do funil','Leads no funil, valor em negociação, taxa de conversão e prazos vencidos (>48h) com alerta.','Funcional (calculado).'],
['CRM — kanban','8 estágios (Novo→Ganho/Perdido); cards com dados, SLA, responsável e link WhatsApp; mover por arrastar; busca.','Funcional; link wa.me real.'],
['CRM — personalizar funil','Adicionar/renomear/excluir etapas (modo edição).','Funcional; não persiste em nuvem.'],
['CRM — novo lead','Modal cria lead (nome, telefone, origem, serviço, valor, responsável, temperatura, etapa).','Persiste (localStorage + nuvem).'],
['Indiques — lista de indicações','Cards por indicador (CPF, WhatsApp, unidade) com indicados e "última informação"; KPIs; filtro por unidade.','Dados gerados.'],
['Indiques — alterar status','Atualiza o status do indicado (CRM de indicações); persiste e Auditoria.','Funcional.'],
['Indiques — enviar ao CRM','Cria leads no CRM a partir dos indicados novos (origem Indicação) e muda o status.','Funcional (integração interna).'],
['Indiques — indicação manual','Form (quem indica: nome+WhatsApp obrigatórios; 3 a 5 indicados); cria registro + leads no CRM.','Validação: nome + ≥3 indicados.'],
['Indiques — prêmio & link','Cadastrar prêmio do mês (admin) e link compartilhável por unidade + mensagem pronta; copiar.','Edição só admin; copiar via clipboard (real).'],
['Indiques — sorteio animado','Rola os nomes com desaceleração, destaca o ganhador com confete (para transmissão ao vivo).','Validação: ≥2 participantes; Auditoria.'],
['Indiques — notificar ganhador','Mensagem por e-mail e WhatsApp + link para agendar.','Envio simulado (toast).'],
['Indiques — exportar','Deve exportar a planilha de indicações.','PROTÓTIPO: "Exportar" é toast.'],
['Comunicados — listar e relatório de leitura','Lista com % lido, autor, data, audiência, obrigatório; relatório "quem leu e quando" com filtro.','Roster é amostra gerada.'],
['Comunicados — exportar CSV da leitura','Exporta a lista de leitura para CSV (UTF-8).','Real; só administrador.'],
['Comunicados — novo comunicado','Modal (título, mensagem, prioridade, categoria, audiência, obrigatório, e-mail); calcula destinatários; se obrigatório, dispara leitura.','Validação: título+mensagem+≥1 audiência; e-mail é só flag.'],
['Comunicados — leitura obrigatória no 1º acesso','No login, abre o 1º comunicado obrigatório não lido e exige ciência para liberar; marca como visto.','Persistência do "visto" em localStorage.'],
['Marketing — abas e novidades','Abas Atualizações/Materiais/Notícias com badge de novidades; ao abrir Atualizações, marca tudo como visto.','Badge não persiste.'],
['Marketing — navegador de materiais','Árvore de pastas (Campanhas, Imagens & Vídeos, Físicos, Redes Sociais, Extras) com breadcrumb; baixar arquivo.','Download é stub (sem arquivo real); diferencia permissão.'],
['Marketing — notícias','Lista de notícias; publicar (admin, via prompt).','Publicar é funcional (persiste); bloqueia não-admin.'],
['Chamados — listar/KPIs/filtros','KPIs (abertos, aguardando, atrasados, resolvidos) e caixas Recebidos/Enviados com filtro de status.','Dados estáticos; filtros funcionais.'],
['Chamados — abrir/responder/status','Abrir chamado (assunto+descrição obrigatórios), thread tipo chat, responder e alterar status.','Funcional (sem notificação externa).'],
]},

/* =====================================================================
 * G. GESTÃO E CONTEÚDO
 * ===================================================================*/
{ id:'G', titulo:'Gestão e Conteúdo', rows:[
['Checklist PDCA — mensal','Checklist mensal por unidade (6 seções) auto-preenchido pelos indicadores vs metas/média; pontuação e %.','Cálculo real a partir dos indicadores.'],
['Checklist PDCA — planos de ação','Gera planos (Plan→Do) para indicadores abaixo da meta, com responsável e prazo.','"Aplicar/enviar planos" e "Exportar PDF" são stub (toast).'],
['Checklist — semanal e ranking','Ranking automático das unidades por nota, status e planos; detalhe por unidade.','Cálculo real; ações de envio são stub.'],
['Checklist — evolução','Histórico de 4 semanas por unidade com variação; média da rede por semana.','Histórico simulado.'],
['Checklist — modelos (CRUD)','Criar (admin), editar, copiar, excluir e salvar modelos (seções, itens, tipo de resposta, peso).','Valida nome + ≥1 item; persiste; aplicar é stub.'],
['Checklist — automação','Descreve rotina automática (segunda 06:00): preenche, gera planos, envia e ranqueia; parâmetros editáveis.','PROTÓTIPO: "Executar agora"/toggles são stub.'],
['Universidade — trilhas','5 trilhas por cargo com vídeos, provas e prazo; progresso por trilha.','Progresso em memória (não persiste).'],
['Universidade — etapas/vídeos','Lista de etapas com link YouTube; prova final liberada só com etapas concluídas; libera certificado.','Links YouTube externos; regra de conclusão.'],
['Universidade — provas','Quiz de múltipla escolha; nota = acertos/total×10; aprovação ≥7,0 conclui a etapa.','Funcional; nota mínima 7,0.'],
['Universidade — alunos e dashboard','Painel de progresso/notas/prazo/status e dashboard (nota média, ranking, conclusão).','Cálculo real sobre dados de alunos.'],
['Universidade — certificado','Gera certificado HTML com código de validação (download + impressão) para aluno concluído.','Real (gera HTML); Auditoria.'],
['Universidade — gerenciar (CRUD)','Nova trilha, editar dados/etapas, add/remover etapa, editar prova, excluir trilha.','Só admin; persiste.'],
['Disco Virtual — navegador','Pastas/arquivos do drive da rede (nome, tamanho, enviado por, data) com breadcrumb e busca.','Dados iniciais estáticos; não persiste entre sessões.'],
['Disco — nova pasta/upload/excluir','Criar pasta (prompt), enviar arquivos (objectURL) e excluir arquivo/pasta (confirmação, recursivo).','Só admin; upload é local (não sobe a servidor).'],
['Disco — baixar arquivo','Download via objectURL; arquivos de exemplo exibem toast.','Funcional p/ enviados; stub p/ exemplos.'],
['Disco — vincular Google Drive','Admin cola link de pasta do Drive (valida domínio), importa 3 pastas fixas, abre no Drive, desvincula.','PROTÓTIPO: integração Drive simulada (guarda URL/flag; sem API).'],
]},

/* =====================================================================
 * H. RELATÓRIOS E DASHBOARDS
 * ===================================================================*/
{ id:'H', titulo:'Relatórios e Dashboards', nota:'Filtros comuns: período (7 presets + intervalo de datas), unidade (multisseleção por estado/UF + tipo). O botão "Exportar" está presente em TODOS os relatórios, porém SEM ação (protótipo).', rows:[
['Relatório de Assinaturas','Abas Assinaturas/Pagamentos; KPIs (ativas, novas, MRR, churn / previsto, recebido, taxa) e tabela.','Export stub.'],
['Relatório de Ocorrências e Intercorrências','Reclassifica cada registro (Ocorrência/Intercorrência); KPIs e gráficos por classificação/profissional.','Interativo (real); export stub.'],
['Relatório de Agendamentos','KPIs (total, confirmados, finalizados, cancelados, no-show, ocupação) e tabela; filtros ricos.','Export stub.'],
['Relatório de Anamnese / Ficha Técnica','KPIs (docs preenchidos, anamneses, pendentes, taxa) e tabela.','Export stub.'],
['Relatório de Atendimentos','KPIs (atendimentos, profissionais, duração média, ticket) e tabela.','Export stub.'],
['Relatório de Avaliações','KPIs (avaliações, nota média, NPS) e tabela.','Export stub.'],
['Relatório de Clientes','8 abas (Aniversariantes, Ranking, Retornos, Novos, Abandonos, Atendidos, Origens, Duplicados); Duplicados tem "Mesclar".','Export stub.'],
['Relatório de Contratos','KPIs (ativos, assinados, inadimplentes, valor) e tabela.','Export stub.'],
['Relatório de Crédito em dinheiro','Abas Situação/Movimentação; KPIs (clientes c/ saldo, saldo, concedidos x utilizados).','Export stub.'],
['Relatório de CRM','Abas Funil/Leads; KPIs (leads, negociação, conversão, receita prevista) e etapas.','Export stub.'],
['Relatório de Crédito Recorrente','KPIs (assinaturas recorrentes, MRR, falhas, cancelamentos) e tabela.','Export stub.'],
['Relatório de Descontos','KPIs (concedidos R$, nº, % médio, maior impacto) e tabela.','Export stub.'],
['Relatório de Estatísticas','Abas Unidade/Colaborador; KPIs (faturamento, atendimentos, ocupação, ticket) e comparativo.','Export stub.'],
['Relatório de Exportações','Log das exportações realizadas (data, relatório, usuário, formato, status).','É auditoria de exports; export stub.'],
['Relatório de Faturamento','3 visões (Vendas/Recorrência/Execução) com legenda, KPIs, gráfico e tabela; total por unidade.','3 visões reais alternáveis; export stub.'],
['Relatório de Ranking de Vendas','KPIs (total vendido, vendedores, líder, ticket) e tabela por colaborador.','Export stub.'],
['Relatório de Fidelidade','Abas Situação/Movimentação; KPIs (clientes, pontos em circulação, resgates).','Export stub.'],
['Relatório Financeiro / Contábil','5 abas (DRE, Extrato, Contas a pagar, Contas a receber, Vales); KPIs e tabela por aba.','Export stub.'],
['Relatório de Mensagens WhatsApp API','KPIs (créditos, gasto, enviadas, com erro) e tabela.','Export stub.'],
['Relatório de Metas','KPIs (meta, realizado, % atingido, premiação) e tabela por unidade.','Export stub.'],
['Relatório de Notas Fiscais','KPIs (emitidas, valor, canceladas, erro) e tabela; filtros amplos (competência, tipo, ambiente).','Export stub.'],
['Relatório de Ordens de serviço','KPIs (OS, finalizadas, em aberto, canceladas) e tabela.','Export stub.'],
['Relatório de Pacotes','KPIs (vendidos, sessões consumidas, saldo, receita) e tabela.','Export stub.'],
['Relatório de Pagamentos (Premiações)','Apura a premiação por colaborador pela Matriz de Metas; KPIs, visão do colaborador (barra 80/100/120%) e tabela.','Cálculo real; export stub.'],
['Relatório de Perfis de acesso','KPIs (perfis, usuários ativos, proprietários, inativos) e tabela perfil/usuário.','Export stub.'],
['Exportações (view dedicada)','Deveria centralizar exportações de dados.','NÃO EXISTE como tela própria; exports reais só para modelos de importação e CSV de Comunicados.'],
['Dashboard Financeiro / Contábil','KPIs (contas a pagar/receber previstas/realizadas) e 3 widgets (movimentação, categorias).','Período padrão "Mês atual"; export stub.'],
['Dashboard Gerencial','KPIs (faturamento, ticket, atendimentos, sessões, retorno) e ~13 widgets + top 10 serviços.','Export stub.'],
['Dashboard Funil de Vendas','Segmentação novos/revenda/todos; funil em SVG, KPIs e widgets de apoio.','Interativo; export stub.'],
['Dashboards de Vendas (Visão Geral/Mês/Comparativo/Histórico)','Embarcados via iframe do app de Vendas; navega por showPage(); botões Atualizar e "Abrir em nova aba".','Integração: iframe + injeção de CSS/tema; dados ao vivo (Supabase).'],
]},

/* =====================================================================
 * I. FRANQUEADORA, EXPANSÃO E UNIDADES
 * ===================================================================*/
{ id:'I', titulo:'Franqueadora, Expansão e Unidades', rows:[
['Expansão — dashboard','KPIs (total leads, fechados, reunião, quentes, novos 30d, perdidos, conversão, pipeline) e gráficos de funil/origem/tipo.','Somente leitura; dados mock. Restrito a admin.'],
['Expansão — captação (Geo + Site)','KPIs (leads 7d, via Geo, via Site, novos não vistos), entrada por origem e endpoint de integração com o site; tabela recente.','Endpoint/webhook é texto; "Copiar endpoint" só toast.'],
['Expansão — simular novo lead / notificação','Insere lead aleatório no topo, dispara badge de novo lead e toast.','Funcional (demonstra a notificação).'],
['Expansão — funil','Pipeline por etapa com barras proporcionais e tabela de leads.','Filtros de tipo são decorativos (stub).'],
['Expansão — leads (kanban/lista)','Alterna kanban (colunas por status) e lista; "Adicionar lead" e "Importar .xlsx".','Adicionar/Importar são stub.'],
['Expansão — disparos WhatsApp','KPIs, form de novo disparo (lista + {nome}), tabela de listas e histórico.','Disparador é protótipo (sem WhatsApp real); importar CSV stub.'],
['Expansão — WhatsApp CRM','UI estilo WhatsApp Web (conversas + chat), abas e botão Z-API.','PROTÓTIPO visual; sem integração Z-API.'],
['Expansão — tipo de lead','Tabela de tipos (Ultracell, Quanta, Franquia, etc.) com cor e contagem; novo/editar.','CRUD é stub.'],
['Implantação — cabeçalho do projeto','Edita unidade, início e inauguração; KPIs (progresso, tarefas, etapa atual, dias até inauguração).','Campos editáveis só por admin.'],
['Implantação — cronograma (5 etapas/64 tarefas)','Por tarefa: nome, responsável, duração, situação (Aberto/Em Andamento/Concluído); barras e gráficos por etapa/responsável.','Persiste.'],
['Implantação — editar/add/del tarefa e etapa','Alterar situação, adicionar/remover tarefa e etapa (com confirmação).','Add/del só admin.'],
['Minha Unidade — cadastro e configs','Horários, bloqueios, galeria de fotos, relatórios habilitados e franqueados (add/del/edit).','Tabelas estáticas.'],
['Minha Unidade — limites e GAP da agenda','Desconto máx por cargo/unidade, teto de cortesias e GAP da agenda; salvar.','Edição só Proprietário/Gerente de Campo.'],
['Todas as Unidades — listar/filtrar','59 unidades ativas (+ Treinamento); filtros (nome, CNPJ, estoque, caixa, NFS-e, tipo) e KPIs (total/ativas/teste/inativas).','-'],
['Todas as Unidades — criar/mudar status','Nova unidade (só Proprietário) e mudar status (Ativa/Teste/Inativa) com avisos.','Criação simplificada; persiste.'],
['Minha Conta — organização','Dados básicos, regras de OS, funcionalidades, logotipos e agendamento online.','Estático/decorativo (sem persistência).'],
['Ajuda — base de conhecimento','~50 tópicos por categoria, busca textual rankeada, chips populares e cartões "O que é / Para que serve / Como usar".','Funcional, 100% client-side.'],
['Ponto Digital — marcar ponto (GPS)','Obtém a localização (geolocation), calcula distância à unidade (cerca virtual) e registra entrada/saída/almoço como "No local" ou "Fora".','INTEGRAÇÃO REAL com GPS do navegador.'],
['Ponto Digital — mapa','Exibe Google Maps Embed se houver chave configurada; senão OpenStreetMap.','Integração Google Maps real (depende de chave); fallback OSM.'],
['Ponto Digital — configuração (admin)','Configura chave do Google Maps, raio da cerca e coordenadas da unidade; salva.','Só admin; persiste em localStorage.'],
['Ponto Digital — espelho do ponto','Tabela das marcações do dia (hora, unidade, coordenadas, distância, validação).','Apenas registros da sessão (não persiste).'],
]},

/* =====================================================================
 * J. SAC
 * ===================================================================*/
{ id:'J', titulo:'SAC — Serviço de Atendimento ao Cliente', rows:[
['SAC — navegação por abas','10 sub-páginas (Dashboard, Chamados, Kanban, Triagem, Relatórios, Atendentes, Ranking, Importar, Configurações, Pagamentos); aba ativa destacada.','Funcional.'],
['SAC — Dashboard','Filtros por período e atendente; KPIs (total, em andamento, concluídos, em atraso, SLA), gráficos por canal/motivo/fase e chamados recentes.','"Tempo médio" é valor fixo; SLA é calculado.'],
['SAC — Chamados (listar/filtrar)','Lista com filtros (motivo, atendente, unidade, canal, status, período) e busca ao vivo.','Funcional.'],
['SAC — criar/editar chamado','Form (cliente, CPF, WhatsApp, e-mail, canal, unidade, motivo, prioridade, responsável, fase, datas, valor, reembolso, observações); salvar gera protocolo.','Validação: só o nome do cliente bloqueia.'],
['SAC — Kanban','Quadro por fases (Novo→Concluído) com cards por prioridade; avançar fase; ao concluir muda o status.','Só avança (sem voltar/arrastar).'],
['SAC — Triagem WhatsApp','Lista de conversas (WhatsApp/Instagram) com bot; abrir chamado a partir da conversa (valida nome+unidade) ou descartar.','PROTÓTIPO: conversas seed; sem WhatsApp real.'],
['SAC — Relatórios','Gráficos por canal/motivo/unidade e tabela de reembolsos.','PROTÓTIPO: filtro de período e "Aplicar" só dão toast (não refiltram).'],
['SAC — Atendentes','Performance por atendente (chamados, resolvidos, SLA%); botões "Cadastrar no Colaboradores" e "Matriz de Comissões".','Integrações de navegação (não criam/sincronizam).'],
['SAC — Ranking/premiação','Ranking por pontos (resolvidos×10 + bônus sem atraso + SLA), medalhas e destaque do mês.','Cálculo local; só atendentes ativos.'],
['SAC — Importar Leads','Baixar modelo .xlsx e importar planilha (cria chamados; ignora linhas sem cliente).','Integração XLSX; trata erro de leitura.'],
['SAC — Configurações','SLA em horas, canais ativos, integrações (BLIP/Sults/Reclame Aqui/Procon/Instagram) e motivos de reclamação.','PROTÓTIPO: SLA salvo mas não usado no cálculo; integrações com status fixo.'],
['SAC — reembolso automático','Busca contrato/sessões por nome+CPF; calcula saldo por sessões restantes, multa (30% editável) e reembolso; gera pedido de cancelamento.','Busca é simulada (hash); cálculo real; multa isentável ("por nossa culpa").'],
['SAC — Pagamentos (acordos)','Cria acordo parcelado (chamado, cliente, unidade, valor, parcelas 1–24, 1º pgto); calcula parcelas com preview.','Funcional.'],
['SAC — regra do dia 15','O 1º pagamento deve ser após o dia 15; preview e salvar bloqueiam se dia ≤ 15.','Valida só o dia do mês.'],
['SAC — OK do gestor e espelho em Contas a Pagar','Validar o acordo (só admin) muda o status e espelha cada parcela em Contas a Pagar (categoria "Reembolso SAC"); chamado vai a "Em pagamento".','Integração SAC→Financeiro real.'],
['SAC — observação ao credor','Em acordo validado, registra observação e data prevista (prompt) com box no card.','Funcional.'],
['SAC — baixa e encerramento automático','Pagar a parcela no Financeiro marca a parcela; quando todas pagas, acordo vira "Pago" e o chamado é concluído automaticamente.','Integração Financeiro→SAC real.'],
]},

/* =====================================================================
 * K. RH (app embarcado — portal-rh.html)
 * ===================================================================*/
{ id:'K', titulo:'Recursos Humanos (app embarcado)', nota:'App React buildado; persiste em localStorage (chaves rh_*); não usa Supabase. Algumas validações de formulário não são legíveis no build minificado.', rows:[
['RH — login/sessão','Login (e-mail + senha) com mensagem de erro; sessão persistida; "Logado como" + logout; papéis admin/gestor/colaborador.','localStorage rh_session/rh_systemUsers.'],
['RH — controle de acesso por papel','Colaborador vê visão restrita/própria; admin/gestor veem visão completa e ações de aprovação.','Gating client-side.'],
['RH — Dashboard','KPIs (total/ativos, em férias, turnover, admissões), média por departamento, recentes e pendências de aprovação; gráficos.','Dados seed; gráficos Recharts.'],
['RH — Colaboradores (listar/buscar)','Tabela (nome, cargo, departamento, unidade, status) com busca por nome/cargo.','Store employees.'],
['RH — cadastrar/editar colaborador','Form (nome, e-mail, celular, cargo, departamento, unidade, cidade, tipo de contrato, admissão, gestor, status); salvar/cancelar.','Sem exclusão/demissão.'],
['RH — Ponto (bater ponto)','Registra Entrada/Saída/Intervalo com alerta de hora e "localização válida".','PROTÓTIPO: geolocalização simulada (texto fixo).'],
['RH — Ponto (saldo/histórico)','Saldo semanal/mensal (trabalhado/esperado/saldo), alertas e histórico de registros.','Dados seed.'],
['RH — Recrutamento (vagas/kanban)','Vagas abertas com candidatos; pipeline arrastável de 6 estágios; busca de candidatos.','Store vagas/candidates.'],
['RH — importar candidatos','Arrastar .xlsx/.csv, ver preview dos 5 primeiros e confirmar a importação.','FUNCIONAL via SheetJS.'],
['RH — Trabalhe Conosco (público)','Página pública com formulário (nome, cargo, pretensão, formação, experiência, currículo) e toast de envio.','Cria candidato no store.'],
['RH — Folha de Pagamento','Holerite por colaborador (salário bruto, INSS, IRRF, FGTS, líquido), filtro por mês/ano e histórico.','PROTÓTIPO: não calcula encargos (valores semeados; bruto editável).'],
['RH — Férias e Ausências','Nova solicitação (tipo, datas, período, motivo) com fluxo aprovar/rejeitar; registro de atestados (CID, médico, data).','Store vacationRequests/atestados.'],
['RH — Desempenho','Avaliações trimestrais (comercial, técnica, assiduidade, metas) com nota final, ranking geral e média por departamento.','Store evaluations.'],
['RH — Regras da Rede','Manual de normas por categoria (atendimento, conduta, jornada, pagamentos, etc.) com busca; "leitura obrigatória".','Conteúdo estático.'],
['RH — Configurações','Cadastrar/editar unidades e departamentos.','Store units/departments.'],
['RH — Administração de usuários','Criar usuário (nome, e-mail, senha, papel, status, vincular colaborador).','Só admin; store systemUsers.'],
['RH — exportação','Deveria exportar dados de RH.','AUSENTE: não há exportação funcional (só import de candidatos).'],
]},

/* =====================================================================
 * L. DASHBOARDS DE VENDAS (app embarcado — vendas-dashboards.html)
 * ===================================================================*/
{ id:'L', titulo:'Dashboards de Vendas (app embarcado)', nota:'App em JS puro + Chart.js + Supabase. Integrações Supabase reais (tabelas sales_entries, units_db, goals, invites, profiles).', rows:[
['Vendas — login/cadastro/recuperação','Login (Supabase); cadastro só por convite (valida token em invites, não usado/não expirado); recuperar senha por e-mail; setup do 1º admin via parâmetro.','Integração Supabase Auth + invites + profiles.'],
['Vendas — controle de acesso por papel','Admin x leitor: admin vê ações de escrita (.admin-only); leitor só visualiza; toda escrita checa o papel.','profiles.role.'],
['Vendas — filtros globais','Multisseleção de Ano, Mês, Tipo (Própria/Franquia), UF e Unidade (com busca); aplica e re-renderiza.','Funcional.'],
['Vendas — Visão Geral (KPIs)','Faturamento do mês (Δ%), projeção, vs mesmo mês do ano anterior, faturamento do ano, meta global (+falta) e status das unidades.','Projeção = média/dia × dias do mês.'],
['Vendas — Visão Geral (alertas e gráficos)','Banners crítico/atenção por unidade; gráficos (evolução ano vs ano-1, franquias×próprias, top 10, % meta) e ranking detalhado.','Chart.js.'],
['Vendas — Mês Atual','KPIs (acumulado, média diária, projeção, meta, comparativos) e tabela por unidade + total; gráfico diário/acumulado.','Chart.js; "+ Lançar" só admin.'],
['Vendas — Comparativo','Gráficos (faturamento ano-1 vs ano, crescimento %, acumulado) e tabela por unidade com Δ%.','Chart.js.'],
['Vendas — Histórico','Evolução mensal de todos os anos e tabela anual por unidade com CAGR.','Chart.js.'],
['Vendas — Unidades','Gráficos por estado e franquias×próprias; tabela de todas as unidades mês a mês + total do ano.','Chart.js.'],
['Vendas — Lançamento (grade diária)','Grade unidade × dias do mês editável (admin), com totais/meta/projeção; célula valida valor.','upsert sales_entries + localStorage; admin.'],
['Vendas — lançar venda (modal)','Modal (unidade, data, valor) com validação "Preencha todos os campos".','upsert Supabase; admin.'],
['Vendas — exportar CSV','Gera a grade do mês em CSV (por dia + total) com nome do arquivo.','FUNCIONAL; todos os papéis. Sem PDF/XLSX.'],
['Vendas — Gestão de unidades','CRUD de unidades (nome obrigatório, cidade, UF, tipo, supervisor); desativar/reativar preserva histórico.','upsert units_db; admin.'],
['Vendas — metas por unidade','12 metas mensais por ano e resumo Metas vs Realizado colorido.','upsert goals; admin.'],
['Vendas — convidar usuário','E-mail + papel (Leitor/Administrador).','INCERTO: função de envio do convite não confirmada no arquivo.'],
['Vendas — sincronização','Lê sales_entries, units_db e goals no carregamento e a cada escrita.','Sem tempo real (sincroniza no load).'],
]},

];

/* ====================== Geração do HTML ===================================*/
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
const STUB_RE=/(PROTÓTIPO|STUB|AUSENTE|NÃO EXISTE|sem ação|sem CRUD|não persiste|simulad|inertes|inert|decorativ|cosmétic|placeholder|INCERTO|não calcula|não refiltra|não reprocessa|toast\)?$|só toast)/i;
const REAL_RE=/(INTEGRAÇÃO REAL|REAL \(|Integração real|FUNCIONAL|Real\.|Real;|Real \()/;

let totalItens=0;
SECOES.forEach(s=>totalItens+=s.rows.length);
let totalStub=0;
SECOES.forEach(s=>s.rows.forEach(r=>{ if(STUB_RE.test(r[2])) totalStub++; }));

const indexRows = SECOES.map(s=>`<tr><td class="ix-id">${s.id}</td><td>${esc(s.titulo)}</td><td class="num">${s.rows.length}</td></tr>`).join('');

const sectionsHTML = SECOES.map(sec=>{
  let n=0;
  const body = sec.rows.map(r=>{
    n++;
    const id = `${sec.id}.${String(n).padStart(2,'0')}`;
    const obs = r[2]==='-' ? '' : esc(r[2]);
    const cls = STUB_RE.test(r[2]) ? 'obs stub' : 'obs';
    return `<tr>
      <td class="id">${id}</td>
      <td class="func">${esc(r[0])}</td>
      <td class="comp">${esc(r[1])}</td>
      <td class="${cls}">${obs}</td>
      <td class="status">
        <span class="chk">&#9744; NT</span>
        <span class="chk">&#9744; AP</span>
        <span class="chk">&#9744; RE</span>
      </td>
      <td class="ev"></td>
      <td class="resp"></td>
    </tr>`;
  }).join('');
  const nota = sec.nota ? `<p class="secnote">${esc(sec.nota)}</p>` : '';
  return `<section class="sec">
    <h2><span class="secid">${sec.id}</span> ${esc(sec.titulo)} <span class="seccount">(${sec.rows.length} itens)</span></h2>
    ${nota}
    <table class="chk-table">
      <thead><tr>
        <th class="id">ID</th>
        <th class="func">Funcionalidade</th>
        <th class="comp">Comportamento esperado</th>
        <th class="obs">Observações (análise técnica)</th>
        <th class="status">Status</th>
        <th class="ev">Evidência</th>
        <th class="resp">Responsável</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Checklist de Homologação — ${esc(META.sistema)}</title>
<style>
  @page { size: A4 landscape; margin: 11mm 10mm 14mm 10mm;
    @bottom-center { content: "Checklist de Homologação — ${META.sistema}"; font-size: 7pt; color:#8a6f78; }
    @bottom-right  { content: "Página " counter(page) " / " counter(pages); font-size: 7pt; color:#8a6f78; }
  }
  @page :first { @bottom-center{content:""} @bottom-right{content:""} }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", Arial, sans-serif; color:#241016; font-size:8.2pt; line-height:1.32; margin:0; }
  h1 { font-size:23pt; margin:0 0 4pt; color:#5b1726; }
  h2 { font-size:12pt; color:#fff; background:#6B2233; padding:5pt 8pt; border-radius:4px; margin:0 0 6pt; }
  .secid { display:inline-block; background:#C9A227; color:#3A2A06; font-weight:700; border-radius:3px; padding:0 6pt; margin-right:4pt; }
  .seccount { font-weight:400; font-size:8.5pt; opacity:.85; }
  /* ---- Cover ---- */
  .cover { height: 178mm; display:flex; flex-direction:column; justify-content:center; }
  .cover .brand { color:#C9A227; font-weight:700; letter-spacing:2px; font-size:11pt; text-transform:uppercase; }
  .cover h1 { font-size:34pt; margin:6pt 0 2pt; }
  .cover .sub { font-size:14pt; color:#6B2233; font-weight:600; }
  .cover .meta { margin-top:20pt; border-top:2px solid #C9A227; padding-top:12pt; max-width:170mm; }
  .cover .meta div { margin:3pt 0; font-size:10pt; }
  .cover .meta b { display:inline-block; width:165px; color:#6B2233; }
  .pill { display:inline-block; background:#6B2233; color:#fff; padding:2pt 9pt; border-radius:20px; font-size:9pt; margin-top:14pt; }
  /* ---- Intro ---- */
  .intro { page-break-before: always; }
  .intro h1 { font-size:18pt; border-bottom:2px solid #C9A227; padding-bottom:4pt; }
  .intro h3 { color:#6B2233; margin:12pt 0 4pt; font-size:11pt; }
  .intro p, .intro li { font-size:9pt; }
  .legend { border:1px solid #d8c4cb; border-radius:5px; padding:8pt 12pt; margin:8pt 0; background:#faf5f6; }
  .legend table { width:100%; border-collapse:collapse; }
  .legend td { padding:3pt 6pt; vertical-align:top; font-size:8.6pt; border-bottom:1px solid #eadfe2; }
  .legend td:first-child { white-space:nowrap; font-weight:700; color:#6B2233; width:140px; }
  table.summary { border-collapse:collapse; width:60%; margin:6pt 0; font-size:9pt; }
  table.summary td, table.summary th { border:1px solid #d8c4cb; padding:4pt 8pt; text-align:left; }
  table.summary th { background:#6B2233; color:#fff; }
  table.ix { border-collapse:collapse; width:100%; font-size:9pt; }
  table.ix th, table.ix td { border:1px solid #d8c4cb; padding:3.5pt 7pt; }
  table.ix th { background:#6B2233; color:#fff; text-align:left; }
  table.ix .ix-id { font-weight:700; color:#6B2233; text-align:center; width:34px; }
  table.ix .num { text-align:center; width:60px; }
  /* ---- Checklist tables ---- */
  .sec { page-break-before: always; }
  .secnote { font-size:8pt; background:#fff7e6; border-left:3px solid #C9A227; padding:5pt 8pt; margin:0 0 6pt; }
  table.chk-table { width:100%; border-collapse:collapse; table-layout:fixed; }
  table.chk-table th { background:#3A2A06; color:#fff; font-size:7.6pt; padding:4pt 4pt; text-align:left; border:.5pt solid #b9a14e; }
  table.chk-table td { border:.5pt solid #cdb9bf; padding:3pt 4pt; vertical-align:top; font-size:7.9pt; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background:#faf6f7; }
  td.id, th.id { width:30px; font-weight:700; color:#6B2233; text-align:center; }
  td.func, th.func { width:16%; font-weight:600; }
  td.comp, th.comp { width:30%; }
  td.obs, th.obs { width:21%; color:#5c4a4f; }
  td.obs.stub { background:#fdeccf !important; color:#7a4b00; }
  td.status, th.status { width:74px; }
  td.ev, th.ev { width:11%; }
  td.resp, th.resp { width:9%; }
  .chk { display:block; white-space:nowrap; font-size:7.6pt; }
  /* ---- Sign-off ---- */
  .signoff { page-break-before: always; }
  .signoff h1 { font-size:16pt; border-bottom:2px solid #C9A227; padding-bottom:4pt; }
  .sigbox { margin-top:30pt; display:flex; gap:40pt; }
  .sigbox .line { flex:1; border-top:1px solid #241016; padding-top:5pt; font-size:9pt; text-align:center; }
</style></head>
<body>

<!-- ============ CAPA ============ -->
<div class="cover">
  <div class="brand">Laser&amp;Co — Homologação / QA</div>
  <h1>Checklist Funcional de Homologação</h1>
  <div class="sub">Validação completa do sistema — telas, módulos, regras de negócio, integrações e interface</div>
  <div class="meta">
    <div><b>Sistema:</b> ${esc(META.sistema)}</div>
    <div><b>Versão / Build:</b> ${esc(META.versao)}</div>
    <div><b>Escopo:</b> ${esc(META.escopo)}</div>
    <div><b>Total de itens de validação:</b> ${totalItens}</div>
    <div><b>Gerado em:</b> ${esc(META.geradoEm)}</div>
  </div>
  <div><span class="pill">Documento de QA &middot; Processo formal de validação</span></div>
</div>

<!-- ============ INTRODUÇÃO ============ -->
<div class="intro">
  <h1>1. Objetivo e instruções de uso</h1>
  <p>Este documento estabelece o processo formal de validação (QA / Homologação) do <b>${esc(META.sistema)}</b>.
  Cada funcionalidade deve ser testada e validada antes da entrega. O checklist cobre telas e módulos, funcionalidades
  de negócio, ações e botões, formulários e validações, fluxos de CRUD e consulta, regras de negócio, integrações com
  serviços externos, permissões e perfis, mensagens (erro/alerta/sucesso), relatórios/exportações/importações,
  responsividade e comportamento geral.</p>

  <h3>Como preencher</h3>
  <ul>
    <li><b>Status</b> — marque uma das caixas em cada linha: <b>NT</b> (Não Testado), <b>AP</b> (Aprovado) ou <b>RE</b> (Reprovado).</li>
    <li><b>Evidência</b> — registre o comprovante do teste (nome do print/arquivo, link, nº do vídeo ou caso de teste).</li>
    <li><b>Responsável</b> — quem executou a validação (iniciais ou nome).</li>
    <li><b>Observações</b> — já vem preenchida com a <b>análise técnica do código</b> (o que é funcional, integração real ou protótipo). O validador pode complementar com achados do teste.</li>
  </ul>

  <h3>Legenda das observações técnicas</h3>
  <div class="legend"><table>
    <tr><td>Célula destacada (laranja)</td><td>Funcionalidade identificada como <b>protótipo/stub</b> na análise do código (botão sem ação, dado simulado, ausência de persistência ou integração não implementada). Tende a <b>reprovar</b> se o critério for "funcionalidade completa em produção"; pode <b>aprovar</b> se o critério for "protótipo navegável".</td></tr>
    <tr><td>INTEGRAÇÃO REAL</td><td>Integração externa efetivamente implementada (ex.: Supabase Auth/dados, GPS, Google Maps, API do Banco Central, SheetJS/Excel).</td></tr>
    <tr><td>Regra de negócio</td><td>Cálculo ou regra relevante a validar (ex.: comissão por tier, juros/multa, alçada de desconto, dia 15 do SAC).</td></tr>
    <tr><td>Validação</td><td>Validação de formulário a testar (campo obrigatório, formato, limites).</td></tr>
  </table></div>

  <h3>Resumo</h3>
  <table class="summary">
    <tr><th>Indicador</th><th>Quantidade</th></tr>
    <tr><td>Seções</td><td>${SECOES.length}</td></tr>
    <tr><td>Itens de validação (total)</td><td>${totalItens}</td></tr>
    <tr><td>Itens marcados como protótipo/stub na análise</td><td>${totalStub}</td></tr>
    <tr><td>Itens com integração/comportamento funcional</td><td>${totalItens-totalStub}</td></tr>
  </table>

  <h3>Índice de seções</h3>
  <table class="ix"><thead><tr><th>#</th><th>Seção</th><th>Itens</th></tr></thead>
  <tbody>${indexRows}</tbody></table>

  <h3>Observação sobre o ambiente de teste</h3>
  <p>Recomenda-se homologar servindo por HTTP (ex.: <i>python3 -m http.server 8080</i>) por causa dos iframes (RH e Vendas)
  e do login Supabase. O "Modo demonstração" permite validar a maioria das telas sem credenciais. Validar responsividade
  em três larguras de referência: <b>Desktop</b> (&ge;1280px), <b>Tablet</b> (~768–1024px) e <b>Mobile</b> (&le;430px).</p>
</div>

<!-- ============ SEÇÕES ============ -->
${sectionsHTML}

<!-- ============ ENCERRAMENTO ============ -->
<div class="signoff">
  <h1>Encerramento da homologação</h1>
  <p>Ao final da execução do checklist, registre o parecer geral de homologação do sistema, listando os itens
  reprovados e as pendências que impedem a liberação para produção.</p>
  <table class="summary" style="width:100%">
    <tr><th>Parecer</th><th>Itens NT</th><th>Itens AP</th><th>Itens RE</th><th>Data</th></tr>
    <tr><td style="height:26pt"></td><td></td><td></td><td></td><td></td></tr>
  </table>
  <div class="sigbox">
    <div class="line">Responsável QA</div>
    <div class="line">Gestor do Produto</div>
    <div class="line">Aprovação Final</div>
  </div>
</div>

</body></html>`;

require('fs').writeFileSync(__dirname + '/checklist-homologacao.html', html);
console.log('OK — checklist-homologacao.html gerado. Seções:', SECOES.length, '| Itens:', totalItens, '| Stub:', totalStub);
