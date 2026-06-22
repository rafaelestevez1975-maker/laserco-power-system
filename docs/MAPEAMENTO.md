# Mapeamento do Sistema — Laser&Co Power System

> **Objetivo deste documento:** inventário técnico completo do protótipo atual (3 SPAs HTML single‑file) para servir de base à reconstrução em **Next.js (App Router) + React + TypeScript + Supabase**, mantendo **layout, tema, fontes e UX idênticos**, com **validação por campo**, **validação de toda chamada Supabase**, **CRUD completo**, **RBAC granular por ação/botão** e **multitenant real por franquia**.
>
> Gerado a partir da leitura integral de `index.html` (9.254 linhas), `vendas-dashboards.html`, `portal-rh.html` e dos docs de homologação. Material bruto de apoio em `docs/_raw/` (gerado por máquina).

---

## 1. Visão geral do que existe hoje

| Arquivo | Papel | Tecnologia atual | Linhas |
|---|---|---|---|
| `index.html` | **Sistema principal** (58 telas, 647 funções) | SPA single‑file, sem framework, router próprio `showView()` | 9.254 |
| `vendas-dashboards.html` | **Dashboards de Vendas** (embarcado via iframe) | JS puro + Chart.js + Supabase (`sales_entries`) | 1.898 |
| `portal-rh.html` | **Portal de RH** (embarcado via iframe) | React/Vite já compilado (bundle minificado) | bundle |

### Estado real do backend hoje (imaturo — ponto crítico da migração)
- Projeto Supabase **`riutcbwillvqjrpaefkb`** (us‑east‑2, Postgres 17). Chaves públicas embutidas (anon key, protegida por RLS).
- **Quase tudo é seed em memória / `localStorage`.** A "nuvem" salva **o estado inteiro como UM blob JSON** na linha `laserco_prototype` da tabela `app_state` (`cloudSave`/`cloudLoad`, debounce 1.2s). **Não há normalização.**
- Tabelas que existem de fato: `app_state` (blob), `profiles` (`id, role, nome`), `sales_entries` (`unit, year, month, day, value`), `customers`, `units_db`, `goals`, `invites`.
- **Multitenant é "de mentira":** a unidade ativa é lida do **texto de um elemento HTML** (`uniAtual()` → `#unitName`). Não há isolamento de dados por franquia.
- **Permissões não são aplicadas:** a matriz `PERMS` (~50 módulos × ações) é renderizada como checkboxes, mas **salvar só dispara um toast**. O único enforcement real é `ROLE_ALLOW` escondendo itens de menu no front‑end (burlável).
- **Auth:** Supabase e‑mail/senha + conta de teste local `teste@lasercompany.com / 123456` + modo demonstração (sem nuvem). Papel vem de `profiles.role`.

> **Conclusão:** a migração é, na prática, **construir o backend de verdade** (modelo normalizado, RLS multitenant, RBAC aplicado, validação server‑side) reaproveitando o front como especificação visual/funcional 1:1.

---

## 2. Inventário de telas por módulo (58 views)

Legenda de prioridade: **P0** = foco do cliente / fundação · **P1** = núcleo operacional · **P2** = complementar.

### 2.1 Operação da Unidade (Acompanhamento)
| View | Tela | Prioridade | Resumo |
|---|---|---|---|
| `view-dashboard` | Dashboard | P1 | Filtro de período, KPIs, funil de vendas vs média da rede, Corridinha de Vendas (ranking diário), ranking de agendamentos. |
| `view-agenda` | Agenda | P1 | Agenda por profissional (colunas), grade GAP 10min, status (bloqueio/agendado/confirmado/OS/finalizado‑lock), banda de eventos da rede, criar agendamento ao clicar no horário. |
| `view-os` | Ordens de serviço | P1 | Lista de OS com filtros extensos (períodos, status, unidades por estado, origem, pagamento, colaborador, serviço/produto), status Aberta/Fechada/Cancelada. |
| `view-pdv` | PDV · Nova Venda | **P0** | Carrinho (serviço/pacote/produto), desconto com **alçada por cargo** + aprovação do gestor, **cortesias** (1/cliente + teto mensal/unidade), forma/parcelas, emite NFS‑e, gera OS fechada e **registra venda na nuvem** (`registrarVendaCloud`). |

### 2.2 Cadastros de Cliente
| View | Tela | Prio | Resumo |
|---|---|---|---|
| `view-clientes` | Clientes | P1 | Lista com filtros amplos + paginação; Novo, **Importar (CSV/XLSX → Supabase `customers`)**, Base na nuvem (paginada). |
| `view-cliente-ficha` | Ficha do Cliente | P1 | Abas: Dados básicos, Acompanhamento (documentos + **registro fotográfico** câmera/upload), Agendamentos, OS, Contratos, Carteira (fidelidade/cashback/pacotes). Unificar (dedup), Bloqueios, App, Inativar. |
| `view-docs` / `view-doc-editor` | Anamnese / Fichas digitais | P2 | Documentos clínicos; editor com seções/campos dinâmicos, unidades com acesso, comportamento acumulativo de sessões. |
| `view-origens` | Origens de Cliente | P2 | CRUD de origens (Geolocalizado auto via CRM, Passante, Indicação, Parcerias, Outros). |

### 2.3 Catálogo & Cadastros básicos
| View | Tela | Prio | Resumo |
|---|---|---|---|
| `view-servicos` | Serviços | P1 | Catálogo (preço, desc. máx, duração, grupo, comissionável, online, ordem). |
| `view-pacotes` | Pacotes | P1 | Pacotes com composição serviços×sessões, cobertura de créditos, validade, comissão venda/execução. |
| `view-produtos` | Produtos | P1 | Produtos (grupo, preço, desc. máx, insumo). |
| `view-planos` | Planos de Assinatura | P1 | Bronze/Prata/Ouro (adesão, mensalidade, modo, comissão). |
| `view-grpserv` / `view-grpprod` / `view-grpassin` | Grupos (serviço/produto/assinatura) | P2 | CRUD simples (nome, ativo). |
| `view-pgto` | Formas de pagamento | P1 | Tipo, taxa %, taxa a descontar na comissão %, ativo. |
| `view-descontos` | Descontos / Parcerias | P2 | Cupons (% serviço/produto/pacote, expiração, unidades) + parcerias (desc/cashback). |
| `view-catpag` / `view-catrec` | Categorias contas a pagar/receber | P2 | Editor em árvore grupo→itens (ativar/inativar/excluir). |
| `view-fornecedores` | Fornecedores | P2 | CNPJ/CPF, telefone, estratégia a pagar, ativo. |
| `view-motivos` | Motivos de cancelamento | P2 | Cadastro + **automação de não comparecimento** (WhatsApp, timing, template). |
| `view-comissoes` | Matriz de comissões | **P0** | Categorias da equipe + premiação (venda individual/meta loja/sessão) por faixa de atingimento + **simulador em tempo real**. Base do módulo **Saque**. |
| `view-metas` | Metas | P1 | Apuração mensal/quinzenal/decendial; meta venda (mín R$100k), agendamentos, clientes novos (25%). |
| `view-contratos` / `view-contrato-editor` | Modelos de contrato | P2 | Gatilho de emissão, envio por e‑mail p/ assinatura, termos, upload de assinatura. |
| `view-perfis` / `view-perfil-editor` | Perfis de acesso | **P0** | Lista de perfis + **grade de permissões `PERMS`** (será o coração do RBAC). |

### 2.4 Cadastros da Conta/Rede
| View | Tela | Prio | Resumo |
|---|---|---|---|
| `view-unidades` | Todas as unidades (+ Escritórios) | **P0** | Gestão de franquias (KPIs total/ativas/teste/inativas), criação só Proprietário, status Ativa/Teste/Inativa com efeitos. **Entidade multitenant central.** |
| `view-minha-unidade` | Minha Unidade | P1 | Abas: Dados básicos, Horários, Bloqueios, Fotos, Cadastros vinculados, **NFS‑e** completa. |
| `view-minha-conta` | Minha conta (Organização) | P2 | Identificação, tema, subdomínio, validade de pontos, regras de OS, logos, agendamento online. |
| `view-colaboradores` / `view-colaborador-form` | Colaboradores | P1 | Cadastro + acesso ao sistema + bloco profissional (agenda, % comissão, serviços que executa). Inativação automática >15 dias. Sincroniza com Portal RH. |

### 2.5 Gestão (núcleo do cliente)
| View | Tela | Prio | Resumo |
|---|---|---|---|
| `view-crm` | CRM (funil Kanban) | **P0** | Leads com drag&drop entre etapas, KPIs (leads/valor/conversão/SLA 48h), quadros (Geolocalizado/Indicações/Orçamentos). **Destino dos leads do site.** |
| `view-indiques` | Gestão de Indiques | P1 | Indicação premiada; leads entram no CRM de indicações; sorteio mensal; link/prêmio por unidade. |
| `view-automacoes` / `view-autos` | Mensagens e Automações | P1 | Automações padrão da rede (admin) + personalizadas da unidade; canais WhatsApp + push. |
| `view-disparos` | Disparos WhatsApp API | P1 | Campanhas, central de conversas, bases & contatos, config da API por unidade, Grupo VIP. |
| `view-marketing` | Marketing da Rede | P2 | Materiais, banco de imagens/vídeos, redes sociais, notícias da rede. |
| `view-comunicados` | Comunicados | P1 | Avisos oficiais com **leitura obrigatória + "ciente"**; criação só admin (audiência, prioridade, e‑mail). |
| `view-chamados` | Chamados | P1 | Tickets entre departamentos/franqueados, SLA 2 dias, thread, finalizar/reabrir. |
| `view-universidade` | Universidade Corporativa | P2 | EAD por cargo: trilhas de vídeo + provas + certificado; alunos & notas. |
| `view-checklist` | Checklist de Indicadores (PDCA) | P1 | Avaliação mensal/semanal por indicadores do funil, ranking, evolução, modelos editáveis. |
| `view-disco` | Disco Virtual | P2 | Drive da rede (pastas + Google Drive); upload só admin. |
| `view-notas` | Notas Fiscais | P1 | Emissor NFS‑e multi‑prefeitura, política de emissão, IBS/CBS, crédito recorrente PagoLivre. |
| `view-app-cliente` | App do Cliente | P2 | Mockup do app nativo (home, agendar, sessões, fidelidade, unidades, Indique & Ganhe). |
| `view-dashb` | Dashboards (financeiro/gerencial/funil/vendas) | **P0** | Container; vendas via iframe `vendas-dashboards.html` (dados ao vivo Supabase). |
| `view-relatorio` | Relatórios (28 relatórios) | P1 | Container declarativo (`REL_DEFS`) com filtros/KPIs/colunas/gráficos por relatório. |

### 2.6 Administração (admin‑only)
| View | Tela | Prio | Resumo |
|---|---|---|---|
| `view-finFranq` | Financeiro Franqueadora | **P0** | Abas: Fluxo de caixa, DRE gerencial, **Cálculos** (correção/juros/multa via API BCB SGS), Contas a Receber/Pagar, Conciliação bancária, **Automação de Royalties**, Cobrança & Jurídico, Configurações. |
| `view-contas` | Contas a pagar/receber (unidade) | P1 | Lançamentos previstos/realizados, status, categoria, fornecedor; import Excel. |
| `view-juridico` | Jurídico | P2 | Documentos contratuais por unidade + notificações extrajudiciais (integra recebíveis em atraso do Financeiro). |
| `view-auditoria` | Auditoria & Rastreabilidade | P1 | Log append‑only (máx 400 em memória hoje); política soft‑delete (nada se apaga, só Ativo/Inativo). |
| `view-implantacao` | Implantação de Unidade | P2 | 5 fases / ~64 tarefas até a inauguração, responsáveis, KPIs de progresso. |
| `view-expansao` | Expansão · Funil de Franquias | P1 | CRM de captação de candidatos a franqueado até a COF. |
| `view-sac` | SAC · Central de Atendimento | P1 | Dashboard, chamados, kanban, triagem WhatsApp, **pagamentos/reembolsos** (acordo parcelado → Contas a Pagar), atendentes, ranking, importar leads. |
| `view-rh` | Recursos Humanos | P1 | Iframe `portal-rh.html` (ponte por `localStorage`): Dashboard, Colaboradores, Ponto, Recrutamento, Folha, Férias, Desempenho, Regras, Configurações. |
| `view-ponto-digital` | Ponto Digital (GPS) | P2 | Registro de ponto por geolocalização + Google Maps + cerca virtual. |

### 2.7 Outras
| View | Tela | Prio | Resumo |
|---|---|---|---|
| `view-ajuda` | Ajuda | P2 | Base de conhecimento. |
| `view-ph` | Exportações / placeholder | P2 | Telas "em desenvolvimento" (rotas BEMP legadas). |

---

## 3. Entidades e CRUD (o que precisa virar tabela + API)

> Hoje quase tudo é seed em memória com soft‑delete via `Set` de inativados (ex.: `SERV_OFF`, `PAC_OFF`, `PROD_OFF`). Tudo abaixo precisa de tabela normalizada, `unit_id`/`tenant`, RLS e endpoints com validação.

| Entidade | Operações hoje | Telas | Observações de regra de negócio |
|---|---|---|---|
| **Cliente** (`customers`) | create, read, update, inativar, **import (lotes 500)**, cloud‑sync, **merge/dedup** | Clientes, Ficha | Dedup por documento>telefone>nome; badge de duplicado; unificação remove duplicados e mantém preferido. |
| **Agendamento** | create, read, update (confirmar), cancel, bloqueio, recorrente | Agenda, Ficha | Sobreposição com "ciência"; não comparecimento → automação WhatsApp; finalizado = lock. |
| **Ordem de Serviço (OS)** | create (via PDV), read, update‑status, filtros | OS, PDV | Origem (Agenda/Pacote/Balcão/App/Site); tipos Compra/Execução; finalizar bloqueado até contrato assinado. |
| **Venda/PDV** | create | PDV | Desconto com alçada por cargo; cortesias; emite NFS‑e; alimenta `sales_entries`. |
| **Serviço / Pacote / Produto / Plano** | create, read, update, toggle‑ativo | Catálogos | Inativação por `Set` (vira coluna `ativo`). |
| **Forma de pagamento** | create, read, update, toggle‑ativo | Formas de pagamento | Taxa % + taxa a descontar na comissão. |
| **Desconto / Parceria** | create, read, update, delete, toggle‑ativo | Descontos | Teto por catálogo + alçada. |
| **Categoria (pagar/receber)** | create, read, update, delete, toggle‑ativo | Categorias | Árvore grupo→itens. |
| **Fornecedor** | create, read, toggle‑ativo | Fornecedores | CNPJ/CPF. |
| **Colaborador** | create, read, update, toggle‑ativo (auto >15d), reativar | Colaboradores | Sincroniza com Portal RH; tem acesso ao sistema (vira `users`/`memberships`). |
| **Unidade/Franquia** | create (só Proprietário), read, update, toggle‑status | Unidades, Minha Unidade | Status Ativa/Teste/Inativa com efeitos; **entidade tenant**. Sem delete. |
| **Escritório** | create, read, update, toggle‑ativo | Unidades > Escritórios | Locais administrativos. |
| **Perfil de acesso** | create, read, update (permissões), toggle‑ativo, delete | Perfis | Grade `PERMS` → `role_permissions`. |
| **Meta** | read, update, save | Metas | Reajuste automático; apuração mensal/quinzenal/decendial. |
| **Comissão / Premiação** | create, read, update | Matriz de comissões | Base do **Saque**. Faixas 80/100/120% por categoria. |
| **Lead/CRM** | create, read, update‑stage (drag&drop), delete‑stage, rename‑stage, **import** | CRM, Expansão | SLA 48h; origens disparo/venda tardia; **entrada do site institucional**. |
| **Indicação** | create (manual), read, update‑status, sorteio | Gestão de Indiques, App | +50 pts por amigo; sorteio mensal. |
| **Comunicado** | create (admin), read, ack‑ciente | Comunicados | Leitura obrigatória no 1º acesso. |
| **Chamado (interno/SAC)** | create, read, update‑status, reply, finalizar/reabrir, acordo‑pagamento | Chamados, SAC | SLA 2 dias; acordo → espelho em Contas a Pagar. |
| **Automação/Mensagem** | create, read, update, toggle, delete (só personalizada) | Automações | Padrão da rede (admin, sem delete) vs personalizada por unidade. |
| **Integração WhatsApp (por unidade)** | conectar, desconectar, read | Automações | `UNI_WA` por unidade. |
| **Documento/Anamnese** | create, read, update, inativar, preview | Anamnese | Seções/campos dinâmicos; acumulativo. |
| **Modelo de contrato** | create, read, update, inativar, preview | Contratos | Gatilho de emissão. |
| **Foto de sessão** | create, read | Ficha (Acompanhamento) | Câmera (getUserMedia) ou upload → **Supabase Storage** (LGPD!). |
| **Nota Fiscal** | create, read, update‑status, cancel, reprocess, config‑política | Notas, Minha Unidade | NFS‑e por prefeitura; IBS/CBS; CPF padrão; Lei do Salão Parceiro. |
| **Conta a Receber (franqueadora)** | create (import Excel), read, update, gerar boleto, baixa (un/lote), toggle‑suspenso | Financeiro Franqueadora | Royalties, fundo, aluguel, taxa de franquia; sem delete (soft via suspenso). |
| **Conta a Pagar (franqueadora)** | create, read, pagar, toggle‑suspenso, definir prioridade | Financeiro Franqueadora | Escopo Escritório/Rede/Lojas; prioridade Alta/Média/Baixa. |
| **Conciliação bancária** | read, rodar | Financeiro Franqueadora | Vendas × extrato × taxa adquirente → divergências. |
| **Cálculo de débito (correção)** | create, read, update, delete | Financeiro Franqueadora | Correção (IGP‑M/IPCA/INPC/SELIC/CDI via **API BCB SGS**) + multa 10% + juros 1% a.m. |
| **Royalties (automação)** | gerar cobrança, processar retorno, régua de atraso | Financeiro Franqueadora | 10% do bruto → boleto → crédito → e‑mail/WhatsApp → baixa → atraso aciona Jurídico. |
| **Notificação/Template jurídico** | create, read, update, delete, enviar | Jurídico | Gerada de recebível em atraso; merge fields. |
| **Trilha/Aluno/Prova (Universidade)** | create, read, update, delete, quiz, certificado | Universidade | Aprovação ≥7. |
| **Modelo de Checklist / Indicador** | create, read, update, delete, aplicar, ranking | Checklist | Modelos do sistema só copiáveis. |
| **Fase/Tarefa de implantação** | create, read, update, delete, toggle‑situação | Implantação | Admin edita tudo; demais só situação. |
| **Auditoria** | create, read | Auditoria | Append‑only; sem update/delete (política soft‑delete). |
| **Organização / Config da unidade** | read, update | Minha conta / Minha unidade | Tema, subdomínio, GAP, NFS‑e, limites. |
| **Carteira/Fidelidade** | read (+ resgate create) | Ficha, App | Pontos (1pt/R$1, validade 12m) + cashback (Bronze 3%/Prata 5%/Ouro 8%, validade 6m, uso mín R$10). |

---

## 4. Modelo de dados → tabelas Supabase propostas

> Cada tabela operacional ganha `id uuid pk`, `unit_id uuid` (tenant), `created_at/updated_at`, `active boolean` (soft‑delete) e RLS por `unit_id`. Estruturas globais da rede (catálogo padrão, perfis, índices) podem ser por organização.

**Tenancy & acesso:** `organizations` · `franchises`/`units` (de `UNI_RAW`, ~60) · `offices` · `users` (auth) · `memberships` (user × unit × role — **usuário em N franquias**) · `roles` · `permissions` · `role_permissions`.

**Operação:** `customers` · `appointments` · `service_orders` · `service_order_items` · `sales_entries` (já existe) · `network_events` · `client_documents`/`document_sections`/`document_fields` · `session_photos` (Storage).

**Catálogo:** `services` · `packages`/`package_items` · `products` · `subscription_plans` · `service_groups`/`product_groups`/`subscription_groups` · `payment_methods` · `discounts`/`partnerships` · `suppliers` · `cancel_reasons`.

**Comissão/Meta/Saque:** `commission_categories` · `goals` (já existe) · `commission_runs`/`commission_entries` · **`withdrawals`** (a definir com o cliente).

**CRM/Marketing:** `crm_stages` · `leads` · `referrals` · `automations`/`custom_automations` · `whatsapp_integrations` · `campaigns`/`contact_bases` · `communications`/`communication_reads` · `tickets`/`ticket_messages`.

**Financeiro franqueadora:** `fin_receivables` · `fin_payables` · `bank_reconciliation` · `calc_parcels`/`calc_indices` · `royalty_config`/`acquirer_fees`/`dunning_rules` · `dre_lines` · `legal_documents`/`legal_templates`/`legal_notifications`.

**Fiscal:** `nfse`/`nfse_config` (por unidade).

**RH:** `rh_employees` · `rh_timecards` · `rh_payroll` · `rh_vacations` · `rh_recruitment` · `rh_performance` (hoje em `localStorage` `rh_employees`/`rh_session`).

**EAD/Checklist/Implantação:** `tracks`/`track_steps`/`student_progress`/`quiz_results`/`certificates` · `checklist_models`/`checklist_sections`/`checklist_items`/`checklist_results` · `impl_phases`/`impl_tasks`.

**Config/Audit:** `organization_config` · `unit_config` · `audit_log` · `discount_limits` (por cargo) · `unit_discount_max` · `courtesy_limits`.

**Seeds de referência mapeados (em `docs/_raw/datamodel.txt`):** `UNI_RAW`, `CRM_STAGES/CRM_LEADS`, `SERVICOS`, `PACOTES`, `PRODUTOS`, `PLANOS`, `PGTO`, `DESC`, `COLAB`, `PERFIS`, `PERMS`, `COM_CATS`, `FIN_REC/FIN_PAG/FIN_CONC/FIN_CFG`, `CALC_IDX/CALC_CFG`, `DRE_LINHAS`, `DESC_LIMIT/DESC_MAX_UNIDADE`, `CORTESIA_*`, `UNI_TRILHAS`, `CHK_*`, `IMPL_*`, `JUR_*`, `APP_*`, etc.

---

## 5. RBAC — Permissões e Perfis

### 5.1 Matriz de permissões (`PERMS`) — ~52 módulos com ações
Cada módulo tem uma lista de ações granulares (a serem aplicadas **por botão**). Exemplos do código atual:
- **Clientes:** Bloquear agendamentos · Exportar · Incluir/Alterar/Inativar · Modificar clientes com OS finalizada · Unificar Clientes · Visualizar · Visualizar dados completos.
- **Ordens de serviço:** Alterar/remover insumos · Aplicar descontos manuais · Cancelar OSs fechadas · Incluir/Alterar/Cancelar OS · Informar data de fechamento.
- **Notas Fiscais:** Criar/Cancelar/Antecipar/Reprocessar NF · Alterar status quando erro · Configurar política de emissão · Integração com prefeituras · Emitir NFS‑e manual.
- **Financeiro Franqueadora:** Ver fluxo de caixa · Cobrar unidades · Gerenciar pagamentos · Conciliação · Configurar royalties · Projeção de caixa · Upload Excel · Cálculos · DRE · Exportar.
- **Pacotes/Fidelidade:** Transferir créditos/pontos/dinheiro entre clientes e **entre unidades** (relevante ao multitenant).
- (Lista completa dos ~52 módulos no código: `PERMS` linhas 6716–6772, replicada em `docs/_raw/`.)

> **Hoje a matriz NÃO é aplicada** (salvar = toast). No alvo, cada ação vira uma chave `modulo.acao` consultada por um hook/guard.

### 5.2 Perfis e visibilidade (`ROLE_ALLOW`) — 9 perfis
| Perfil | Acesso |
|---|---|
| **Proprietário** | tudo (admin) |
| **Gerente** | tudo exceto `minhaConta`, `implantacao` |
| **Profissional** | dashboard, agenda, clientes, colaboradores, serviços, pacotes, produtos, universidade, comunicados, chamados, app (sem relatórios/dashboards) |
| **SAC** | dashboard, agenda, clientes, crm, serviços, pacotes, produtos, universidade, comunicados, chamados, app |
| **Marketing** | dashboard, automações, disparos, comunicados, serviços, pacotes, produtos, app, relatórios |
| **Financeiro** | dashboard, contas, finFranq, notas, relatórios, dashboards (finFranq liberado mesmo sendo admin) |
| **Expansão** | dashboard, unidades, implantação, crm, rh, relatórios |
| **Implantação** | dashboard, implantação, unidades, checklist, universidade, chamados, comunicados |
| **Ponto** | pontoDigital, minhaConta |

### 5.3 Alçadas embutidas (regras de negócio de permissão)
- **Desconto por cargo** (`DESC_LIMIT`): Consultora 5% · Profissional 5% · SAC 10% · Gerente 15% · Gerente de Campo 25% · Administrador/Proprietário 100%. Acima da alçada → aprovação do gestor no PDV.
- **Desconto máximo por unidade** (`DESC_MAX_UNIDADE`, default 30%).
- **Cortesias:** 1 por cliente + teto mensal por unidade (default R$2.000).
- **Criação de unidade:** só Proprietário. **Upload no Disco:** só admin. **Edição de modelos do sistema (checklist/jurídico):** só admin.

---

## 6. Multitenant — modelo alvo

- **Tenant = Franquia/Unidade** (`units`, ~60 reais de `UNI_RAW` + "Unidade Treinamento" que fica fora de relatórios/dashboards).
- **Usuário pertence a N franquias** via `memberships (user_id, unit_id, role_id)`. Ex.: um RH responde por "franquia A" e "franquia B".
- **Escopo de dados por `unit_id`** com **RLS** no Postgres; o cliente da unidade ativa define o filtro (substituir o atual `uniAtual()` por contexto de sessão server‑side).
- **Status da unidade** (Ativa/Teste/Inativa) afeta: Teste fica fora de relatórios/dashboards; Inativa corta acesso do franqueado.
- **Operações cross‑tenant** existem e precisam de permissão especial: transferir créditos/pontos/dinheiro **entre unidades**; visão "Todas as unidades" (franqueadora); DRE consolidado vs por loja.
- **Papéis da rede** (franqueadora) vs **papéis da unidade** (franqueado) — admin da rede enxerga todas, franqueado só a(s) sua(s).

---

## 7. Integrações externas

| Integração | Onde aparece | Estado | Alvo |
|---|---|---|---|
| **Site institucional (lasercompany.com) → Leads** | CRM, Expansão | Hoje leads chegam por **WhatsApp** manualmente | **P0** — webhook/endpoint que recebe leads do site e cai no CRM (`leads`) com origem/etiqueta; notificação. |
| **WhatsApp API / Web** | Automações, Disparos, SAC, Motivos | Mock | Provedor (Meta Cloud API / 360dialog / Z‑API) por unidade (`whatsapp_integrations`). |
| **Asaas / PagoLivre (Crédito Recorrente)** | PDV, Notas, Planos | Mencionado | Cobrança recorrente até 12x (não Ultrassom). |
| **NFS‑e (prefeituras)** | Notas, Minha Unidade | Config UI | Emissor por município (inscrição + token), IBS/CBS, Lei do Salão Parceiro. |
| **Banco Central — API SGS** | Financeiro › Cálculos | Referenciado | Índices IGP‑M/IPCA/INPC/SELIC/CDI para correção monetária. |
| **Banco/Boleto (retorno bancário)** | Royalties, Cobrança | Mock | Geração de boleto + baixa por retorno. |
| **Google Drive** | Disco Virtual | UI | Vincular pastas (upload só admin). |
| **Google Maps / GPS** | Ponto Digital | UI | Cerca virtual valida presença na unidade. |
| **E‑mail** | Comunicados, Jurídico, Indicações, Contratos | Mock | Envio transacional. |
| **Instagram** | Indiques (sorteio ao vivo) | UI | Sorteio mensal. |
| **Import/Export Excel** | Clientes, Contas (pagar/receber) | Parser no front | Import em lote validado server‑side. |
| **Supabase Storage** | Fotos de sessão, logos, assinaturas, anexos jurídicos | — | Buckets com RLS (LGPD: fotos clínicas). |

---

## 8. Chamadas Supabase existentes (a substituir por camada validada)

| Tabela | Operação | Onde |
|---|---|---|
| `app_state` | upsert/select (blob `laserco_prototype`) | `cloudSave`/`cloudLoad` — **substituir por modelo normalizado** |
| `profiles` | select (`role, nome` por `id`) | `onAuthed` |
| `sales_entries` | upsert/select (`unit,year,month,day,value`) | `registrarVendaCloud`, dashboards de vendas |
| `customers` | insert (lotes 500) / select (paginado, ilike, range) | importação + base na nuvem |
| `auth` | signUp / signInWithPassword / signOut / getSession | autenticação |

> Toda chamada nova deve: validar input (Zod), tratar erro de RLS/policy explicitamente, e retornar feedback ao usuário (hoje há tratamento ad‑hoc de erro de policy em `registrarVendaCloud`).

---

## 9. Tema / Design System a preservar (1:1)

- Variáveis CSS de marca: `--brand-500: #6B4E9E` (roxo), `--gold-500` (dourado), `--brand-400/600`, paleta de status (`--green/amber/red`), tema PWA bordô `#230A10`.
- Classes existentes a portar como componentes: `.nav-item`, `.sub-item`, `.submenu`, `.rel-card`, `.cli-table`, `.kpi`, `.os-st`, `.perm-card`, `.perm-item`, `.doc-card`, `.pill-yes/.pill-no`, `.orig-tag`, etc.
- Ícones: **Tabler Icons** (`ti ti-*`). Fonte e espaçamentos atuais devem ser replicados exatamente.
- **PWA** (`manifest.webmanifest`, `sw.js` network‑first) deve ser preservado no Next.

---

## 10. Helpers reutilizáveis hoje (viram componentes/utils no Next)

`relKpis()`, `relTable()`, `dashWidget()`, `barChart()`, filtros `rfPeriod/rfUni/rfSel/rfDate/rfText`, `showToast()`, `auditLog()`, `isAdmin()`, `uniAtual()`, router `showView()`, `applyRole()`. → No alvo: `<KpiRow>`, `<DataTable>`, `<ChartCard>`, `<ReportFilters>`, `toast()`, `audit()`, `usePermission()`, `useTenant()`, App Router.

---

*Apêndice bruto (gerado por máquina, apoio): `docs/_raw/screens.txt`, `forms.txt`, `cruds.txt`, `datamodel.txt`, `supabase.txt`.*
