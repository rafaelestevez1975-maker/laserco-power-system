# Frontend  Status do Clone e Mapa do que Falta

> Estado da migração do protótipo (`legacy/index.html`) para o app Next.js.
> **Método do clone:** o frontend renderizado de **todas as 101 telas/sub-telas** do
> protótipo foi capturado em modo demonstração e é servido em cada rota  clone
> **visual 1:1**. A **funcionalidade real** (dados do Supabase, ações, integrações)
> é construída por cima, módulo a módulo, conforme [BACKLOG.md](BACKLOG.md).

## Legenda
- ✅ **Frontend clonado**  a tela aparece idêntica ao protótipo (HTML real + CSS real).
- 🔌 **Funcional**  ligado a dados/ações reais (Supabase/UAZAPI). Hoje: só shell + auth.
- ⏳ **Pendente**  falta implementar a funcionalidade (ver EPIC do BACKLOG).

## Estado global (2026-06-22)
| Camada | Status |
|---|---|
| Estrutura Next.js (App Router, TS, Tailwind, @supabase/ssr) | ✅ |
| Tema vinho/dourado + fontes + ícones Tabler (1:1 do protótipo) | ✅ |
| Shell: sidebar + topbar + navegação + menu completo | ✅ funcional |
| Login + middleware de auth (Supabase, backend `lkii`) | ✅ funcional |
| Logout + perfil do usuário (perfis_usuario) | ✅ funcional |
| **Frontend das 101 telas** | ✅ clonado (estático) |
| **Funcionalidade das telas** | ⏳ por módulo (abaixo) |
| Multitenant  contexto de unidade + papel reais no shell (admin = `admin_geral`; seletor com as 82 unidades reais via RLS) | 🟡 parcial (EPIC 1) |
| **Menu lateral gateado por permissão real** (usuario_cargos → cargo_permissoes → permissoes; 42 recursos) | ✅ (EPIC 1) |
| RBAC fino por **botão/ação dentro das telas** + RLS por tela/dado | ⏳ EPIC 1 |
| **CRM `/crm`  funcional com dados reais** (lê `crm_etapas`+`crm_leads` por unidade; KPIs reais; **criar lead** + **mover por drag&drop** com server actions respeitando RLS/constraints) | ✅ funcional (EPIC 3) |
| **Gestão de Indiques `/indiques`**  lista por unidade (franqueadora vê todas) + KPIs reais (indicações/indicados/agendaram/converteram) + **nova indicação manual** (indicador + 3–5 indicados) + **"abrir o lead"** (evolui status do indicado pendente→…→comprou; validado 201/200) | ✅ funcional (EPIC 23)  falta dashboard consolidado + régua automática por IA (P2) |
| **Ponte dos leads do site `/leads-site`**  lê a fonte REAL `riut.lasercompany_leads` (✅ **77 leads reais**), **auto-match de unidade** (rótulo do site → `unidades.id`, testado 37/37) com sugestão pré-selecionada, e **roteia**: `sac`→`sac_tickets`, **`curriculo`→RH** (`candidatos` na vaga "Banco de Talentos (Site)"), demais→`crm_leads`; marca a origem como roteada | ✅ conectado + roteamento inteligente (EPIC 22/3.2) |
| **SAC `/sac` + `/sac/chamados` + `/sac/kanban`**  Dashboard (KPIs reais), lista filtrável, **abrir chamado**, **kanban drag&drop**, **detalhe do ticket** + **Reembolso/Acordo** (calcula multa% → cria espelho no Financeiro + move p/ "Em pagamento") | ✅ funcional (EPIC 15)  falta triagem WhatsApp |
| **Financeiro `/financeiro` (Contas a Pagar)**  lista despesas reais + KPIs; **"Dar baixa"** marca pago e, se for reembolso do SAC (`origem_ref_id`→ticket), **conclui o chamado automaticamente** (ciclo SAC↔Financeiro validado ponta a ponta) | ✅ ciclo fechado (EPIC 9/15)  falta o restante do Financeiro (fluxo de caixa, DRE, royalties, cobrança) |
| **Canais WhatsApp `/canais` (UAZAPI + EPIC 21)**  lista instâncias Laser (status real); **criar canal** com **escopo** (número **por franquia** ou **geral** da franqueadora), **rótulo** e **cadeia de delay por canal**; **vincular/editar** instância existente; **conectar via QR** (polling) e desconectar. Vínculo canal↔unidade na tabela `canais_whatsapp` (migration **042**, RLS: admin tudo, franquia gerencia o seu) | ✅ funcional (EPIC 21.1/21.2)  falta "quais automações por canal" (depende das automações) |
| **Disparos `/expansao/disparos`**  compositor que **seleciona sozinho o canal da unidade ativa** (ou geral), usa o **delay configurado do canal**, + mensagem + base de números → campanha de **envio em massa na UAZAPI** (`/sender/simple`, delay anti-ban) | ✅ pronto (EPIC 16/21)  envio real depende de conectar o número; falta personalização `{nome}` (/sender/advanced) |
| **Triagem WhatsApp `/sac/triagem`** — janela estilo WhatsApp Web + responder (grava autor real + `enviada_por`) + abrir chamado (vincula `ticket_id`). **Distribuição/fila (EPIC 15):** abas **Minhas / Fila / Todas**, **assumir** (atribui + pausa bot), **devolver à fila**, **transferir** p/ outro atendente, **marcar lido**. Usa `sac_whatsapp_chats.atendente_id` (validado 200/201) | ✅ funcional — falta distribuição automática (round-robin/online), mídia/voz, notas internas, painel do cliente (port do gestao-sac) |
| **Webhook `/api/webhooks/uazapi`**  recebe eventos da UAZAPI e **grava entradas em `sac_whatsapp_chats`/`sac_whatsapp_mensagens`** (dedup por wa_id, upsert do chat) → alimenta a Triagem (inserts validados 201) | ✅ roteamento de entrada (EPIC 15/16)  falta abrir chamado a partir da conversa |
| **Comunicados `/comunicados`**  tabelas reais `comunicados`+`comunicado_leituras` (migration **039**, RLS por papel); KPIs (destinatários/cientes/**taxa de leitura**), filtros (período/destinatário/assunto), **dashboard** por assunto/destinatário, abas (publicados/agendados/encerrados), **novo comunicado** (só admin), **gate "ciente"** do 1º acesso, **relatório de quem leu** (admin), e **gate global de leitura obrigatória no login** (modal bloqueante no layout, EPIC 19). Inserts validados 201 | ✅ funcional (EPIC 19)  falta envio de e-mail real |
| **Chamados `/chamados`**  tabelas reais `chamados`+`chamado_mensagens`+função `chamado_prazo_sla()` (migration **040**, RLS por papel); recebidos/enviados, KPIs (ativos/finalizados/atrasados), filtros, **abrir chamado**, **thread de retornos**, **finalizar/reabrir**, **SLA 48h corridas** (decisão do cliente; sexta→domingo validado), **assumir/atribuir responsável**, **sino de notificações** na topbar (chamado novo / em atraso / comunicado pendente, atualiza a cada 1min). Inserts validados 201 | ✅ funcional (EPIC 18) |

## O que ainda NÃO funciona (geral, por design do clone)
- **Interações internas da tela** (abas, filtros, ordenação, botões)  os handlers do
  protótipo foram removidos no clone; serão reescritos em React por módulo.
- **Dados são de exemplo** (mock do protótipo)  substituídos por dados reais do
  Supabase ao implementar cada módulo.
- **Sub-tabs dentro de uma view** (ex.: abas de um relatório) ainda não alternam.

---

## Mapa por módulo (rota → o que falta para ficar funcional)

### Acompanhamento (3 telas)  ✅ frontend
- `/` (Dashboard) · `/agenda` · `/os`
- ⏳ **Falta:** Dashboard com KPIs/funil reais por unidade (EPIC 5); Agenda com CRUD de
  agendamentos + grade por profissional (EPIC 7); OS com lista/abertura/fechamento reais (EPIC 6).

### Cadastros & Catálogo (19 telas)  ✅ frontend
- `/cadastros/{anamnese, categorias-pagar, categorias-receber, parcerias, formas-pagamento,
  grupo-servicos, comissoes, metas, contratos, motivos, planos, perfis, origens}`
- `/clientes` · `/colaboradores` · `/contas` · `/pacotes` · `/produtos` · `/servicos`
- ⏳ **Falta:** CRUD real de cada cadastro com persistência + validações + RBAC (EPIC 1, 4, 7, 8);
  Clientes com base na nuvem + importação Excel (EPIC 7); Matriz de comissões com simulador (EPIC 4.1);
  Perfis de acesso gravando `cargo_permissoes` de verdade (EPIC 1).

### Gestão · Relatórios (25 telas)  ✅ frontend
- `/relatorios/{assinaturas, ocorrencias, agendamentos, anamnese, atendimentos, avaliacoes,
  clientes, contratos, credito-dinheiro, crm, credito-recorrente, descontos, estatisticas,
  exportacoes, faturamento, ranking-vendas, fidelidade, financeiro, whatsapp, metas,
  notas-fiscais, ordens-servico, pacotes, pagamentos, perfis-acesso}`
- ⏳ **Falta:** filtros reais (período/unidade), dados das tabelas vindos do Supabase e
  exportação real (Excel/CSV)  hoje o botão Exportar é visual (EPIC 13.1).

### Gestão · Dashboards (7 telas)  ✅ frontend
- `/dashboards/{financeiro, gerencial, funil, vendas-geral, vendas-mes, vendas-comparativo, vendas-historico}`
- ⏳ **Falta:** gráficos com dados reais; os de **Vendas** virão do app de Vendas/Supabase (EPIC 5/13).

### Gestão · Comunicação, CRM & Conteúdo (11 telas)  ✅ frontend
- `/automacoes` · `/disparos` · `/crm` · `/indiques` · `/marketing` · `/comunicados` ·
  `/chamados` · `/checklist` · `/universidade` · `/disco` · `/notas`
- ✅ **Comunicados** (EPIC 19) e ✅ **Chamados** (EPIC 18) **funcionais**  ver tabela de estado global.
- ⏳ **Falta (P0/P1):** CRM Kanban com leads reais + ingestão dos leads do site (EPIC 3);
  Disparos WhatsApp via **UAZAPI** (EPIC 10.4/16.2); Checklist PDCA automatizado + chat no plano (EPIC 17);
  Disco Virtual com Google Workspace público/privado (EPIC 12.4); Notas Fiscais (EPIC 12.5, 2º momento).

### Recursos Humanos (9 telas)  ✅ frontend
- `/ponto` · `/rh` · `/rh/{colaboradores, ponto, recrutamento, folha, ferias, desempenho, regras}`
- ✅ **`/rh/recrutamento`  funcional** (rota real sobre `candidatos`/`vagas` do lkii): **Currículos (banco de talentos)**
  com filtros (busca/cargo/estado/fonte/estágio) + **dashboards** (por cargo/estado/fonte) + KPIs (triagem/processo/contratados/conversão);
  **Kanban** dos 7 estágios (drag&drop @dnd-kit, contratado/reprovado travados); **iniciar processo** explícito por candidato
  (anti-ban: não joga a lista toda), **reprovar com motivo**, **notas espelhadas no currículo**, **novo currículo** manual.
  Currículos do site já caem aqui (ponte leads-site). Inserts validados 201 · escopo multitenant (RH da rede vê todos via RLS 041; franquia vê a sua).
- ⏳ **Falta:** msg automática de disponibilidade via WhatsApp (depende de canal conectado); **import SULTS/planilha** (EPIC 20.5);
  agendamento de entrevista (EPIC 20 P1); Ponto GPS real + cerca 150m + home office (EPIC 20.1/20.2); Gestão de Ponto admin (EPIC 20.3);
  Colaboradores com filtros (EPIC 20.4); demais telas RH (folha/férias/desempenho/regras).

### Expansão (7 telas)  ✅ frontend  **P0**
- `/expansao` · `/expansao/{captacao, funil, leads, disparos, whatsapp, tipos}`
- ⏳ **Falta:** captação multicanal (site/Google/geo), funil real, **disparos WhatsApp que não
  param** + janela de conversas + esquentar lead (EPIC 16).

### SAC (10 telas)  ✅ **TODAS funcionais (24/06)**  **P0**
- ✅ `/sac` (dashboard KPIs+canal) · `/sac/chamados` (busca avançada+filtro atendente+paginação) ·
  `/sac/kanban` (drag&drop+reembolso) · `/sac/triagem` (chat completo+IA+fila) ·
  `/sac/atendentes` (equipe+carga+**distribuição automática igualitária**) · `/sac/config` (motivos/tags CRUD) ·
  `/sac/pagamentos` (reembolsos+baixa, espelho Financeiro) · `/sac/relatorios` (KPIs/breakdowns+período+CSV) ·
  `/sac/ranking` (por atendente) · `/sac/importar` (planilha xlsx/csv → chamados em lote).
- Atendente = colaborador = usuário: fonte única `src/lib/pessoas.ts` (ver memory project-laserco-people-model).
- ⏳ **Falta (P2):** medir tempo de resposta/resolução (colunas nulas hoje); BOT multicanal além do WhatsApp; auto-distribuição por presença/online.

### Franqueadora / Admin (4 telas)  ✅ frontend
- `/implantacao` · `/financeiro` · `/juridico` · `/auditoria`
- ⏳ **Falta:** Financeiro (import vendas/royalties, projeção, DRE, régua de cobrança WhatsApp,
  conciliação  EPIC 9); Jurídico (Storage de documentos + integração cobrança  EPIC 9.7);
  Implantação (múltiplos checklists + franqueado executor + lembrete WhatsApp  EPIC 12.3);
  Auditoria (`audit_log` real  EPIC 13.2).

### Rede & Conta (6 telas)  ✅ frontend
- `/minha-unidade` · `/unidades` · `/minha-conta` · `/app-cliente` · `/exportacoes` · `/ajuda`
- ⏳ **Falta:** Unidades com CRUD + status (EPIC 2); Minha Unidade/Conta com configs reais;
  App do Cliente (validar/definir escopo  EPIC 7.5); Exportações reais; Ajuda (conteúdo).

---

## Próximas ondas (resumo  detalhe em BACKLOG.md §"Sequência sugerida")
1. **Fundação:** EPIC 1 (RBAC/multitenant aplicado no shell e nas telas).
2. **P0 do cliente:** EPIC 3 (leads do site → CRM) · EPIC 16 (Expansão/disparos) · EPIC 15 (SAC).
3. **Operação/Financeiro:** EPIC 6/5/9/7.
4. **Gestão da rede:** EPIC 17 (Checklist) · 18 (Chamados) · 19 (Comunicados) · 20 (RH) · 13.
5. **Conteúdo:** EPIC 12 (Jurídico/Disco/Implantação/Universidade) · 14 (migração + go-live).
