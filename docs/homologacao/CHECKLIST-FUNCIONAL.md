# Checklist de Homologação  Laser&Co Power System (funcional)

> **Escopo:** este checklist cobre **o que já está FUNCIONAL** no Power System (app em produção,
> backend Supabase `lkii`), no nível de **tela, ação, botão/link, campo, validação, regra de negócio,
> integração, permissão e mensagem**. Itens que hoje são apenas **clone visual (snapshot do protótipo)**
> estão listados à parte (§ "Telas ainda não funcionais") e **não entram em homologação** nesta fase.
>
> **Ambiente de homologação:** https://laserco-power-system.vercel.app
> **Data-base:** 2026-06-24 · **Versão:** commits `edbe24f` (Comunicados/Chamados) + `afd9c10` (RH/Recrutamento)

## Sobre "os três sistemas"
O ecossistema tem **3 apps** sobre o **mesmo backend `lkii`**: **(1) Power System** (este  front unificado,
em homologação), **(2) app RH** e **(3) app SAC**. A estratégia aprovada é **unificar tudo no Power System**;
as funcionalidades de **SAC** e **Recrutamento (RH)** já estão **reescritas nativamente** aqui e cobertas abaixo.
Os apps RH/SAC legados continuam existindo como origem do schema, mas a homologação do cliente é **no Power System**.

---

## Como usar este checklist
1. Cada item tem: **Funcionalidade · Comportamento esperado · Status · Evidência · Observações · Responsável**.
2. **Status:** `⬜ Não Testado` · `✅ Aprovado` · `❌ Reprovado`.
3. **Evidência:** print da tela, ID do registro criado no banco, código HTTP, ou link do ticket/lead/chamado gerado.
4. **Responsável:** quem validou (preencher).
5. Teste com os **usuários de teste** (senha única `LaserCo@2026`)  ver matriz de perfis abaixo  para cobrir RBAC/multitenant.
6. Versão planilha (para preencher Status/Responsável): [`checklist-funcional.csv`](checklist-funcional.csv).

### Legenda de prioridade
`P0` crítico · `P1` importante · `P2` desejável.

---

## Matriz de perfis de acesso (usuários de teste)
| Perfil | E-mail | Papel | Escopo esperado |
|---|---|---|---|
| Dono da Rede | `dono.rede@laserco.teste` | admin_geral | Vê e edita **tudo** (todas as unidades) |
| SAC da Rede | `sac.rede@laserco.teste` | sac | Atendimento/SAC de **toda a rede** |
| RH da Rede | `rh.rede@laserco.teste` | rh | RH/Recrutamento de **toda a rede** |
| Financeiro da Rede | `financeiro.rede@laserco.teste` | financeiro | Financeiro de **toda a rede** |
| Dono de Franquia | `dono.suzano@laserco.teste` | gestor | **Só a unidade Suzano** |
| SAC de Franquia | `sac.suzano@laserco.teste` | sac | SAC **só de Suzano** |
| RH de Franquia | `rh.suzano@laserco.teste` | rh | RH **só de Suzano** |
| Gerente de Franquia | `gerente.suzano@laserco.teste` | gestor | Gestão **só de Suzano** |

**Testes de RBAC/multitenant a validar (P0):**

| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| RBAC-1 | Menu por papel | Cada perfil vê no menu lateral **apenas** os módulos a que tem permissão | ⬜ | Print do menu de 3 perfis distintos | admin vê tudo | |
| RBAC-2 | Escopo de unidade (franquia) | Perfil de franquia vê **apenas dados da sua unidade** (leads, chamados, currículos, financeiro) | ⬜ | Comparar listas: rede vs Suzano | Validado em banco: RH rede=11 currículos, RH Suzano=2 | |
| RBAC-3 | Escopo de rede (cross-unidade) | Perfil "da Rede" vê dados de **todas** as unidades no seu domínio | ⬜ | Print contagem rede vs franquia | migration 041 | |
| RBAC-4 | Isolamento de domínio | SAC **não** acessa RH/Financeiro; RH **não** acessa SAC; etc. | ⬜ | Print menu/empty state | SAC vê 0 currículos | |
| RBAC-5 | Bloqueio sem sessão | Acessar URL protegida sem login **redireciona para /login** | ⬜ | `307 → /login?redirect=…` | middleware | |

---

## Itens transversais (todo o sistema)

### Segurança & Sessão
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| SEG-1 | Login (e-mail+senha) | Credencial válida autentica e entra no app; inválida mostra erro | ⬜ | Print login OK e erro | Supabase Auth (lkii) | |
| SEG-2 | Logout | Encerra a sessão e volta para /login | ⬜ | Print | | |
| SEG-3 | Persistência de sessão | Recarregar a página mantém logado | ⬜ | Print | cookie @supabase/ssr | |
| SEG-4 | RLS no banco | Usuário só lê/escreve o que sua RLS permite (não burla por API) | ⬜ | Tentar ler outra unidade | RLS por papel/unidade | |
| SEG-5 | Acesso público à tela de login | Página de login abre publicamente (proteção Vercel desligada) | ⬜ | `/login` = 200 | | |

### Integrações externas
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| INT-1 | Supabase `lkii` (dados) | Telas leem/gravam no backend real (CRM, SAC, RH, Financeiro, etc.) | ⬜ | Registro criado aparece após refresh | | |
| INT-2 | Supabase `riut` (site) | Inbox de Leads do Site lê os leads reais do site | ⬜ | Print 77 leads | service key do site | |
| INT-3 | UAZAPI (WhatsApp) | Listar/criar/conectar canal; disparo em massa; webhook de entrada | ⬜ | QR + status conectado | **Depende de conectar 1 número** | |
| INT-4 | Webhook de entrada | Mensagem recebida grava chat/mensagem e alimenta a Triagem | ⬜ | Registro em sac_whatsapp_* | precisa canal conectado | |

### Mensagens (padrão de UX)
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| MSG-1 | Sucesso | Ações concluídas mostram confirmação e atualizam a tela | ⬜ | Print | | |
| MSG-2 | Erro de permissão | Sem permissão → mensagem "Sem permissão para …" (não erro técnico) | ⬜ | Print | tratamento RLS | |
| MSG-3 | Validação de formulário | Campo obrigatório vazio → bloqueia e avisa | ⬜ | Print | | |
| MSG-4 | Sessão expirada | Ação sem sessão → "Sessão expirada." | ⬜ | Print | | |

### Responsividade
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| RESP-1 | Desktop (≥1280px) | Layout completo, sidebar fixa, tabelas/kanban sem quebra | ⬜ | Print | layout 1:1 do protótipo | |
| RESP-2 | Tablet (~768–1024px) | Conteúdo se ajusta; sidebar colapsável | ⬜ | Print | **a validar** | |
| RESP-3 | Mobile (≤480px) | Sidebar vira menu móvel; tabelas com scroll horizontal | ⬜ | Print | **a validar  foco era desktop** | |

### Performance / comportamento geral
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| PERF-1 | Carregamento de tela | Telas abrem em tempo aceitável (< ~2s) | ⬜ | Print/Network | listas limitadas a 500–1000 | |
| PERF-2 | Drag&drop (kanban) | Mover card é fluido e persiste (otimista + servidor) | ⬜ | Print antes/depois | CRM, SAC, Recrutamento | |
| PERF-3 | Refresh pós-ação | Após criar/editar, a lista reflete a mudança sem recarregar manualmente | ⬜ | Print | revalidatePath | |

---

## Módulos funcionais (homologáveis)

> Colunas: **Funcionalidade · Comportamento esperado · Status · Evidência · Observações · Responsável**.
> Status inicial = `⬜ Não Testado`.

### 1. Shell / Navegação / Perfil  (`/` em diante)
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| SHL-1 | Sidebar (menu lateral) | Lista seções/itens conforme o protótipo, com ícones; item ativo destacado | ⬜ | | gateado por permissão (RBAC-1) | |
| SHL-2 | Navegação entre telas | Clicar no item abre a rota correspondente | ⬜ | | | |
| SHL-3 | Topbar  usuário | Mostra nome/iniciais e papel do usuário logado | ⬜ | | perfis_usuario | |
| SHL-4 | Seletor de unidade | Admin troca a unidade ativa; franquia vê só as suas | ⬜ | | cookie `lc_unit` | |
| SHL-5 | Sino de notificações | Exibe contador e lista (chamado novo/atrasado, comunicado pendente) | ⬜ | | ver módulo Notificações | |
| SHL-6 | Logout | Encerra sessão e volta ao login | ⬜ | | | |

### 2. CRM  (`/crm`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| CRM-1 | Quadro Kanban | Mostra etapas reais (`crm_etapas`) e leads por etapa, por unidade | ⬜ | | dados reais lkii | |
| CRM-2 | KPIs do funil | Total de leads/valor/conversão refletem os dados | ⬜ | | | |
| CRM-3 | Busca de lead | Filtra cards por nome/serviço | ⬜ | | | |
| CRM-4 | Botão "Novo lead" | Abre modal | ⬜ | | | |
| CRM-5 | Campos do novo lead | Nome (obrigatório), telefone, valor, serviço, origem, etapa, unidade (obrigatória) | ⬜ | | validação nome+unidade | |
| CRM-6 | Criar lead | Grava em `crm_leads` (status 'ativo', origem válida) e aparece na etapa | ⬜ | ID do lead | CHECK origem/status | |
| CRM-7 | Mover por drag&drop | Arrastar card muda a etapa e persiste | ⬜ | print antes/depois | otimista + servidor | |
| CRM-8 | Link WhatsApp do card | Abre wa.me do telefone | ⬜ | | | |
| CRM-9 | Permissão/escopo | Franquia vê só seus leads; rede vê todos | ⬜ | | RLS | |

### 3. Gestão de Indiques  (`/indiques`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| IND-1 | Lista de indicações | Mostra indicações por unidade (franqueadora vê todas) | ⬜ | | | |
| IND-2 | KPIs | Indicações/indicados/agendaram/converteram reais | ⬜ | | | |
| IND-3 | Botão "Nova indicação" | Abre formulário (indicador + 3–5 indicados) | ⬜ | | | |
| IND-4 | Validações | Unidade obrigatória; indicado precisa de telefone | ⬜ | | NOT NULL no banco | |
| IND-5 | Criar indicação | Grava `indicacoes` + `indicados` | ⬜ | IDs | validado 201 | |
| IND-6 | "Abrir o lead" / evoluir | Avança o status do indicado (pendente→…→comprou) | ⬜ | | validado 200 | |
| IND-7 | Escopo multitenant | Franquia só as suas; rede todas | ⬜ | | | |

### 4. Leads do Site  (`/leads-site`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| LDS-1 | Inbox de leads do site | Lista os leads reais do site (`riut.lasercompany_leads`) | ⬜ | print | 77 leads reais | |
| LDS-2 | Badge de tipo | SAC/oferta/avaliação/franquia/currículo/indicação com cor | ⬜ | | | |
| LDS-3 | Auto-match de unidade | Sugere a unidade certa a partir do rótulo do site (selo "✨ sugerida") | ⬜ | | testado 37/37 | |
| LDS-4 | Selecionar unidade | Pode trocar a unidade sugerida antes de rotear | ⬜ | | | |
| LDS-5 | Rotear → SAC | Lead tipo `sac` vira ticket em `sac_tickets` | ⬜ | ID ticket | | |
| LDS-6 | Rotear → RH | Lead `curriculo` vira candidato (vaga "Banco de Talentos (Site)") | ⬜ | ID candidato | aparece no Recrutamento | |
| LDS-7 | Rotear → CRM | Demais viram lead em `crm_leads` | ⬜ | ID lead | | |
| LDS-8 | Marca como roteado | Lead roteado não pode ser roteado de novo | ⬜ | | _roteado=true | |
| LDS-9 | Fallback sem service key | Se o site não estiver conectado, mostra aviso e base de teste | ⬜ | | | |

### 5. SAC  Dashboard / Chamados / Kanban  (`/sac`, `/sac/chamados`, `/sac/kanban`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| SAC-1 | Dashboard (KPIs) | Mostra indicadores reais de chamados | ⬜ | | | |
| SAC-2 | Lista de chamados | Tabela filtrável de `sac_tickets` | ⬜ | | | |
| SAC-3 | Filtros | Filtra por status/assunto/etc. | ⬜ | | | |
| SAC-4 | "Novo chamado" | Modal com campos; assunto obrigatório | ⬜ | | status 'aberto', prioridade 'media' | |
| SAC-5 | Criar chamado | Grava `sac_tickets` | ⬜ | ID | | |
| SAC-6 | Kanban SAC | Arrastar ticket muda fase e persiste | ⬜ | | | |
| SAC-7 | Reembolso/Acordo | Calcula multa % → cria espelho no Financeiro + move p/ "Em pagamento" | ⬜ | lançamento criado | regra de negócio P0 | |
| SAC-8 | Escopo | Franquia só seus; rede todos | ⬜ | | | |

### 6. SAC  Conversa  (`/sac/triagem`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| TRI-1 | Janela de conversas | Lista conversas reais estilo WhatsApp Web | ⬜ | | alimentada pelo webhook | |
| TRI-2 | Responder | Envia pelo canal conectado e grava a saída | ⬜ | | **depende de canal conectado** | |
| TRI-3 | Abrir chamado da conversa | Cria ticket vinculado (`ticket_id`) | ⬜ | ID ticket | validado 201 | |

### 7. Financeiro  Contas a Pagar  (`/financeiro`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| FIN-1 | Lista de despesas | Mostra `lancamentos_financeiros` (despesas) + KPIs | ⬜ | | | |
| FIN-2 | "Dar baixa" | Marca como pago (status 'pago') | ⬜ | | | |
| FIN-3 | Ciclo SAC↔Financeiro | Se for reembolso do SAC (origem_ref_id), dar baixa **conclui o chamado** | ⬜ | ticket concluído | regra P0 validada ponta a ponta | |
| FIN-4 | Escopo | Franquia só sua; rede toda | ⬜ | | | |

### 8. Canais WhatsApp (UAZAPI)  (`/canais`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| CAN-1 | Listar instâncias | Mostra as instâncias e status real | ⬜ | | admin token UAZAPI | |
| CAN-2 | "Criar canal" (admin) | Cria nova instância | ⬜ | | | |
| CAN-3 | Conectar via QR | Gera QR real e faz polling até conectar | ⬜ | print QR + status | **ação do usuário** | |
| CAN-4 | Desconectar | Encerra a instância | ⬜ | | | |
| CAN-5 | Integração UAZAPI | Chamadas reais à API (instance/all, connect, status) | ⬜ | | | |

### 9. Disparos WhatsApp  (`/expansao/disparos`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| DIS-1 | Compositor | Seleciona canal conectado, mensagem, base de números, delay | ⬜ | | | |
| DIS-2 | Validação | Exige canal conectado e base de números | ⬜ | | | |
| DIS-3 | Criar campanha | Dispara envio em massa (`/sender/simple`, delay anti-ban) | ⬜ | campanha na UAZAPI | **envio real depende de canal conectado** | |
| DIS-4 | Personalização `{nome}` | (Pendente)  via /sender/advanced | ⬜ | | **não implementado** | |

### 10. Webhook UAZAPI (entrada)  (`/api/webhooks/uazapi`)   P0
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| WHK-1 | Recebe eventos | Endpoint aceita o POST da UAZAPI | ⬜ | 200 | secret | |
| WHK-2 | Grava entrada | Cria/atualiza `sac_whatsapp_chats`/`_mensagens` (dedup por wa_id) | ⬜ | registro | valida 201 | |
| WHK-3 | Alimenta a Triagem | Mensagem recebida aparece na Triagem | ⬜ | | precisa canal conectado | |

### 11. Comunicados  (`/comunicados`)   P1
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| COM-1 | Lista + abas | Tabela de comunicados com abas Todos/Publicados/Agendados/Encerrados | ⬜ | | | |
| COM-2 | KPIs | Comunicados/Destinatários/Cientes/**Taxa de leitura** | ⬜ | | | |
| COM-3 | Filtros | Período, destinatário (5 segmentos), assunto | ⬜ | | | |
| COM-4 | Dashboards | Barras por assunto e por destinatário | ⬜ | | | |
| COM-5 | "Novo comunicado" (admin) | Botão **só aparece p/ admin**; abre modal | ⬜ | | RBAC | |
| COM-6 | Campos do comunicado | Título+mensagem (obrigatórios), prioridade, categoria, **audiência (5 segmentos)**, leitura obrigatória, e-mail, status (publicar/agendar/rascunho) | ⬜ | | | |
| COM-7 | Criar comunicado | Grava `comunicados` (snapshot de destinatários) | ⬜ | ID | validado 201; só admin (RLS) | |
| COM-8 | Gate de leitura obrigatória | Comunicado obrigatório não lido **bloqueia** no 1º acesso até dar "ciente" | ⬜ | print modal | regra P1 | |
| COM-9 | "Estou ciente" | Registra leitura (`comunicado_leituras`) e libera | ⬜ | registro | upsert ignoreDuplicates | |
| COM-10 | Relatório "Visualizar" | Admin vê quem leu (nome/unidade/quando) | ⬜ | | admin-only | |
| COM-11 | Encerrar/Reabrir | Admin muda o status do comunicado | ⬜ | | | |
| COM-12 | E-mail real | (Pendente) envio por e-mail | ⬜ | | **não implementado (depende Gmail)** | |

### 12. Chamados (intranet)  (`/chamados`)   P1
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| CHM-1 | Abas Recebidos/Enviados | Separa por origem (franqueado = recebido) | ⬜ | | | |
| CHM-2 | KPIs | Ativos/Finalizados/**Atrasados**/Prazo SLA (48h) | ⬜ | | | |
| CHM-3 | Filtros | Período, situação, assunto, departamento | ⬜ | | | |
| CHM-4 | "Abrir chamado" | Modal; assunto+descrição obrigatórios | ⬜ | | "De" travado p/ franquia | |
| CHM-5 | Campos | Assunto, De→Para (departamentos), etiqueta, prioridade, descrição | ⬜ | | | |
| CHM-6 | Criar chamado | Grava `chamados` + 1ª mensagem na thread | ⬜ | ID | validado 201 | |
| CHM-7 | Detalhe + thread | Abre histórico de retornos | ⬜ | | | |
| CHM-8 | Responder | Adiciona mensagem (solicitante/responsável) | ⬜ | | | |
| CHM-9 | Assumir | Usuário vira responsável do chamado | ⬜ | | | |
| CHM-10 | Finalizar/Reabrir | Alterna situação ativo/finalizado | ⬜ | | | |
| CHM-11 | SLA 48h corridas | Mostra data-limite e marca **Atrasado** após 48h | ⬜ | | sexta→domingo validado | |
| CHM-12 | Escopo/RLS | Vê os da sua unidade + os que abriu/é responsável; admin tudo | ⬜ | | | |

### 13. RH  Recrutamento  (`/rh/recrutamento`)   P1
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| RH-1 | Aba Currículos (banco de talentos) | Lista todos os currículos (`candidatos`) | ⬜ | | | |
| RH-2 | KPIs | Currículos/Em triagem/Em processo/Contratados/**Conversão** | ⬜ | | | |
| RH-3 | Filtros | Busca, cargo, estado, fonte, estágio | ⬜ | | | |
| RH-4 | Dashboards | Barras por cargo, por estado, por fonte | ⬜ | | | |
| RH-5 | Aba Kanban | 7 estágios (triagem→…→contratado/reprovado) | ⬜ | | | |
| RH-6 | Mover por drag&drop | Arrastar candidato muda o estágio e persiste | ⬜ | | contratado/reprovado travados | |
| RH-7 | "Iniciar processo" | Move triagem→entrevista_rh (1 a 1, **anti-ban**) | ⬜ | | regra P0 | |
| RH-8 | Reprovar c/ motivo | Move p/ reprovado e grava motivo (no currículo) | ⬜ | | | |
| RH-9 | Notas espelhadas | Editar notas reflete no currículo | ⬜ | | | |
| RH-10 | "Novo currículo" | Cadastra manual no banco de talentos | ⬜ | ID | validado 201 | |
| RH-11 | Currículos do site | Currículo roteado em Leads do Site aparece aqui | ⬜ | | ponte | |
| RH-12 | Escopo multitenant | RH rede vê todos; RH/gestor de franquia só a sua | ⬜ | | rede=11, Suzano=2 validado | |
| RH-13 | Msg WhatsApp disponibilidade | (Pendente) 1ª etapa envia msg | ⬜ | | **depende de canal conectado** | |

### 14. Notificações (sino)
| # | Funcionalidade | Comportamento esperado | Status | Evidência | Observações | Responsável |
|---|---|---|---|---|---|---|
| NOT-1 | Contador | Mostra nº de pendências do usuário | ⬜ | | | |
| NOT-2 | Chamado novo/atrasado | Notifica chamados relevantes ao usuário | ⬜ | | | |
| NOT-3 | Comunicado pendente | Notifica comunicado obrigatório não lido | ⬜ | | | |

---

## Telas ainda NÃO funcionais (clone visual / snapshot  fora desta homologação)
> Presentes no sistema como **clone 1:1 do protótipo**, porém **sem dados/ações reais** ainda.
> Não devem ser homologadas nesta fase; servem para validar **layout**.

- **Acompanhamento:** Dashboard inicial (KPIs reais), Agenda, Ordens de Serviço.
- **Cadastros & Catálogo (19):** clientes, colaboradores, produtos, serviços, pacotes, contas, comissões, metas, contratos, planos, perfis de acesso, origens, anamnese, categorias, formas de pagamento, etc.
- **Gestão · Relatórios (25):** todos os relatórios (exportação ainda visual).
- **Gestão · Dashboards (7):** financeiro, gerencial, funil, vendas (×4).
- **Comunicação/Conteúdo:** Automações, Marketing, Checklist (PDCA), Universidade, Disco Virtual, Notas.
- **RH (demais):** Dashboard RH, Colaboradores, Ponto/Ponto Digital, Folha, Férias, Desempenho, Regras.
- **Expansão (demais):** captação, funil, leads, whatsapp, tipos (o módulo **Disparos** já é funcional).
- **Franqueadora/Admin:** Implantação, Jurídico, Auditoria, Financeiro (DRE/royalties/régua de cobrança).
- **Rede & Conta:** Minha Unidade, Unidades (CRUD), Minha Conta, App do Cliente, Exportações, Ajuda.
- **SAC (demais):** relatórios, pagamentos, atendentes, ranking, importar, config, BOT/IA/distribuição.

> Mapa detalhado do que falta por módulo: [`../FRONTEND-STATUS.md`](../FRONTEND-STATUS.md) e [`../BACKLOG.md`](../BACKLOG.md).

