# Backlog / TUDU — Migração Laser&Co Power System → Next.js

> Plano de execução. Cada épico vira tickets. **Prioridade:** P0 (fundação + foco do cliente) · P1 (núcleo operacional) · P2 (complementar). **Tamanho:** S/M/L. Marque `- [x]` ao concluir.
> Referências: [MAPEAMENTO.md](MAPEAMENTO.md) (o quê) · [ARQUITETURA-NEXT.md](ARQUITETURA-NEXT.md) (como) · **[REQUISITOS-CLIENTE.md](REQUISITOS-CLIENTE.md) (requisitos detalhados do cliente — fonte primária)**.
>
> **Foco declarado do cliente (20–21/06/2026):** **Expansão** (FUNDAMENTAL, prioridade inicial) · **Integração com o site institucional → leads** (🚨 URGENTE: site já recebendo muita gente agora) · **SAC** (rodar o quanto antes) · **Saque** · Gestão · Financeiro Franqueadora. Ver detalhamento e repriorização no fim deste arquivo (**EPICs 3–4–15–16–17** e seção "Detalhamento por requisitos do cliente").
>
> ⚠️ **Estratégia:** entregar e testar incrementalmente ("botar para rodar o quanto antes, testando alguns itens e arrumando outros"). Vários itens o cliente diz que **"já fiz" — mas o protótipo é majoritariamente mock**, então "validar" geralmente = reconstruir de verdade + testar.
>
> **Regra transversal (todo ticket):** validação por campo (erro abaixo do input) · validação da chamada Supabase · CRUD completo (create/read/update/delete ou soft‑delete) · permissão por ação (RBAC) · escopo por unidade (multitenant) · revalidação/teste antes do commit.

---

> 🔑 **VIRADA DE ESTRATÉGIA (21/06/2026):** o backend a reaproveitar é o Supabase **`lkiihnxznphxqekrgsgi`** (RH+SAC), que **já tem** multitenant+RBAC (migration 009/010), CRM (`crm_leads`), SAC (`sac_*`), Financeiro, WhatsApp/UAZAPI, Indiques e Plano‑de‑Ação‑IA. E o app **`SAC`** (Next.js 15) serve de **template de arquitetura**. Logo, EPIC 0/1 deixam de ser "construir backend" e viram **"adotar backend existente + scaffold do front sobre o template do SAC"**. Detalhe em [ECOSSISTEMA-E-INTEGRACAO.md](ECOSSISTEMA-E-INTEGRACAO.md).

## EPIC 0 — Fundação do projeto (P0) — *bloqueia tudo*

- [ ] **0.1 (S)** Criar projeto Next.js 15 **a partir do template do app `SAC`** (mesma stack: App Router + TS + Tailwind + `@supabase/ssr` + Server Actions + UAZAPI). Mover o protótipo HTML para `legacy/`.
- [ ] **0.2 (M)** Portar o **tema 1:1** do protótipo: `--brand-500 #6B4E9E`, `--gold-*`, paleta de status e classes (`.kpi`, `.cli-table`, `.os-st`, `.pill-*`, `.nav-item`...) → `styles/theme.css` + tokens Tailwind (conciliar com a paleta `laser-600/700` do SAC). Tabler Icons.
- [ ] **0.3 (M)** Conectar ao Supabase **`lkiihnxznphxqekrgsgi`** (reusar `src/lib/supabase/*` do SAC), `supabase gen types`, `.env.local` (chaves/UAZAPI/`sbp_` fora do repo, token rotacionado). Confirmar com o cliente que é o backend oficial.
- [ ] **0.4 (M)** **Componente de formulário padrão**: `<Field label error>` com erro abaixo do input + react-hook-form + resolver Zod. Helpers `cpf/cnpj/telefoneBR/cep/moedaBR/dataBR`.
- [ ] **0.5 (M)** Wrapper `sb()` de **validação de chamada Supabase** (trata RLS/policy/erro de forma uniforme) + `audit()` + `toast()`.
- [ ] **0.6 (L)** **Layout do app**: Sidebar (menu/submenus do protótipo), Topbar (perfil + **seletor de franquia**), guarda de auth, roteamento por módulo. Replica visual do `index.html`.
- [ ] **0.7 (S)** Preservar **PWA** (`manifest.webmanifest`, `sw.js`, ícones).
- [ ] **0.8 (S)** Pipeline de qualidade: Vitest + Playwright + script `/code-review` no diff (ver ARQUITETURA §8).

**Aceite:** app sobe, login funciona, sidebar idêntica ao protótipo, um formulário de exemplo valida campo‑a‑campo e persiste no Supabase com erro de permissão tratado.

---

## EPIC 1 — Auth, Multitenant & RBAC (P0) — *fundação de segurança*

- [ ] **1.1 (S)** **Reusar** o multitenant existente: `empresas`→`unidades` (`empresa_id`), `perfis_usuario`, `cargos`/`cargo_permissoes`, `recursos`/`acoes`/`permissoes` com `escopo` (global/empresa/unidade/proprio) — migration 009. **Não recriar.** Conferir as ~60 unidades (`UNI_RAW`) vs `unidades` existentes e cadastrar as que faltarem.
- [ ] **1.2 (M)** **Conciliar permissões:** mapear a matriz `PERMS` (~52 módulos) e os 9 perfis (`ROLE_ALLOW`) do protótipo para os `recursos×acoes×escopo` e `cargos` já seedados (migration 010); criar os `recursos` que faltarem por módulo.
- [ ] **1.3 (M)** Validar/estender **RLS por escopo** (já existe por papel em várias `sac_*`/`crm_*`); testes de isolamento entre franquias e por escopo.
- [ ] **1.4 (M)** Auth Supabase (login/cadastro/recuperação) + conta de teste + papel via `profiles/memberships`. Replicar tela de login atual.
- [ ] **1.5 (M)** **Contexto de tenant**: unidade ativa server‑side + seletor de franquia para usuário com N franquias (ex.: RH de várias unidades).
- [ ] **1.6 (M)** **Guards de RBAC**: `requirePermission()` (server) + `usePermission()`/`<Can do="...">` (client). Aplicar em todos os botões.
- [ ] **1.7 (M)** Tela **Perfis de acesso** + editor da **grade de permissões** funcionando de verdade (hoje só dá toast): create/read/update/delete/toggle, salvar persiste `role_permissions`.
- [ ] **1.8 (S)** Alçadas: `discount_limits` (por cargo), `unit_discount_max`, `courtesy_limits` + checagem server‑side.

**Aceite:** dois usuários em franquias diferentes não veem dados um do outro; botão sem permissão some/desabilita e a ação é bloqueada no server; perfil editado altera acessos de verdade.

---

## EPIC 2 — Unidades, Colaboradores & Organização (P0/P1)

- [ ] **2.1 (M) P0** **Unidades/Franquias** (`view-unidades`): CRUD, status Ativa/Teste/Inativa com efeitos (Teste fora de relatórios; Inativa corta acesso). Criação só Proprietário. + Escritórios.
- [ ] **2.2 (M) P1** **Minha Unidade**: abas Dados básicos, Horários, Bloqueios, Fotos, Cadastros vinculados, **NFS‑e** (config completa). Update por unidade.
- [ ] **2.3 (M) P1** **Colaboradores**: CRUD + acesso ao sistema (vira `users`/`memberships`) + bloco profissional (agenda, % comissão, serviços que executa). Inativação automática >15 dias; reativar.
- [ ] **2.4 (S) P2** **Minha conta (Organização)**: tema, subdomínio, validade de pontos, regras de OS, logos, agendamento online.

---

## EPIC 3 — GESTÃO: CRM & Integração com o Site (P0) — *foco do cliente*

- [ ] **3.1 (L) P0** **CRM Kanban** (`view-crm`): `crm_stages` + `leads`; drag&drop entre etapas, KPIs (leads/valor/conversão/**SLA 48h**), busca, quadros (Geolocalizado/Indicações/Orçamentos), novo lead, personalizar funil (add/rename/delete etapa). CRUD completo.
- [ ] **3.2 (M) P0 🚨** **Webhook/endpoint de leads do site** (`/api/webhooks/leads-site`): recebe submissões do **lasercompany.com** (indicação, **agendar sessão**, SAC) que hoje vão por WhatsApp; valida, grava em `leads` com origem/etiqueta, **roteia para a UNIDADE certa**, notifica responsável. **URGENTE — o site já está recebendo muita gente agora.**
- [ ] **3.3 (M) P0 🚨** Olhar o **painel administrativo do site** + mapear formulários (indicação, agendamento de sessão, captação, botão SAC) e definir o contrato de integração (payload, auth, dedupe, roteamento por unidade/geolocalização).
- [ ] **3.4 (M) P1** **Gestão de Indiques**: indicação manual + leads no CRM de indicações; prêmio do mês; link por unidade; sorteio mensal; +50 pts por amigo. *(Recebe também as indicações vindas do site — ver 3.2.)*
- [ ] **3.5** → **promovido para EPIC 16 (Expansão, P0)** por decisão do cliente ("FUNDAMENTAL, prioridade inicial").

**Aceite:** um lead enviado pelo site aparece no CRM da unidade certa em segundos, sem WhatsApp manual; SLA de 48h sinalizado; conversão registrada.

---

## EPIC 4 — SAQUE, Comissões & Premiações (P0) — *foco do cliente*

> O módulo **Saque** não existe no protótipo: será modelado sobre Comissões/Premiações/Financeiro. **Definir regras com o cliente** (quem saca — franqueado/profissional —, gatilho, aprovação, integração de pagamento).

- [ ] **4.1 (M) P0** **Matriz de comissões** (`view-comissoes`): categorias da equipe + premiação (venda individual/meta loja/sessão) por faixa 80/100/120% + simulador. CRUD.
- [ ] **4.2 (M) P0** **Apuração de comissões/premiações** por período (mensal/quinzenal/decendial) → `commission_runs`/`commission_entries`, ligada a vendas (`sales_entries`/OS) e metas.
- [ ] **4.3 (L) P0** **Saque** (`withdrawals`): saldo disponível por colaborador/unidade, solicitação de saque, **aprovação do gestor (RBAC)**, status (solicitado/aprovado/pago/recusado), histórico, comprovante. Integração de pagamento (a definir: PIX/transferência/Asaas).
- [ ] **4.4 (S) P0** Relatórios de **Pagamentos/Premiações** e extrato de saques (audita quem aprovou/pagou).

**Aceite:** comissão apurada a partir das vendas reais; colaborador solicita saque; gestor com permissão aprova; status e comprovante registrados; tudo auditado.

---

## EPIC 5 — Dashboards & Vendas (P0/P1)

- [ ] **5.1 (M) P0** **Dashboards de Vendas**: migrar fonte de dados de `sales_entries` (blob → tabela já existe) para alimentar os gráficos; manter embarcado (iframe) ou reescrever nativo (Recharts). Decidir escopo.
- [ ] **5.2 (M) P1** **Dashboard da unidade** (`view-dashboard`): KPIs, funil vs média da rede, Corridinha de Vendas, ranking de agendamentos.
- [ ] **5.3 (M) P1** Dashboards Financeiro/Contábil, Gerencial, Funil de Vendas.

---

## EPIC 6 — PDV & Operação de Venda (P0/P1)

- [ ] **6.1 (L) P0** **PDV / Nova Venda** (`view-pdv`): carrinho (serviço/pacote/produto), **desconto com alçada por cargo + aprovação do gestor**, **cortesias** (1/cliente + teto mensal/unidade), forma/parcelas, **emite NFS‑e**, gera OS fechada, registra venda (`sales_entries`). Validação completa.
- [ ] **6.2 (M) P1** Vendas de **Pacote** (`vpModal`) e **Assinatura** (`vaModal`) → OS.
- [ ] **6.3 (M) P1** **Ordens de Serviço** (`view-os`): lista com filtros extensos, status Aberta/Fechada/Cancelada, finalizar bloqueado até contrato assinado, ver/cancelar (com permissão).

---

## EPIC 7 — Clientes & Atendimento (P1)

- [ ] **7.1 (L) P1** **Clientes** (`view-clientes`): CRUD + filtros + paginação; **importação CSV/XLSX** validada (lotes, dedup por documento>telefone>nome) → `customers`; base na nuvem.
- [ ] **7.2 (L) P1** **Ficha do Cliente**: abas Dados, Acompanhamento (**fotos de sessão** → Storage, LGPD), Agendamentos, OS, Contratos, **Carteira** (fidelidade/cashback/pacotes). Unificar (merge), Bloqueios, Inativar.
- [ ] **7.3 (L) P1** **Agenda** (`view-agenda`): grade por profissional, GAP, status, recorrência, sobreposição com ciência, eventos da rede, confirmar. CRUD de agendamento.
- [ ] **7.4 (M) P2** **Anamnese/Fichas digitais**: editor com seções/campos dinâmicos, unidades com acesso, acumulativo. (LGPD: dados clínicos.)
- [ ] **7.5 (M) P2** **App do Cliente** (PWA do cliente final): agendar, sessões, fidelidade, Indique & Ganhe.

---

## EPIC 8 — Catálogo & Cadastros básicos (P1/P2)

- [ ] **8.1 (M) P1** **Serviços / Pacotes / Produtos / Planos**: CRUD + toggle‑ativo (coluna `active`, fim do `Set` de inativados); composição pacote (serviços×sessões).
- [ ] **8.2 (S) P1** **Formas de pagamento**: CRUD (taxa %, taxa a descontar na comissão).
- [ ] **8.3 (S) P2** Grupos (serviço/produto/assinatura), **Descontos/Parcerias**, **Fornecedores**, **Origens de cliente**, **Motivos de cancelamento** (+ automação não comparecimento), **Categorias** (pagar/receber, árvore), **Modelos de contrato**.
- [ ] **8.4 (S) P1** **Metas** (`view-metas`): apuração mensal/quinzenal/decendial, regras (mín R$100k, agendamentos, 25% clientes novos), persistência real.

---

## EPIC 9 — Financeiro Franqueadora (P0/P1)

- [ ] **9.1 (M) P0** **Contas a Receber** (royalties, fundo, aluguel, taxa de franquia): CRUD, **gerar boleto**, baixa (un/lote), suspender, import Excel.
- [ ] **9.2 (M) P1** **Contas a Pagar**: escopo Escritório/Rede/Lojas, prioridade, pagar, suspender, import Excel.
- [ ] **9.3 (M) P1** **Fluxo de Caixa** + **DRE gerencial** (Consolidado/Próprias/Franquias/Franqueadora, AV%).
- [ ] **9.4 (M) P1** **Cálculos**: correção monetária via **API BCB SGS** (IGP‑M/IPCA/INPC/SELIC/CDI) + multa 10% + juros 1% a.m.; demonstrativo.
- [ ] **9.5 (M) P1** **Automação de Royalties**: 10% do bruto → boleto → crédito → e‑mail/WhatsApp → baixa → atraso aciona Jurídico.
- [ ] **9.6 (S) P2** **Conciliação bancária** (vendas × extrato × taxa adquirente).
- [ ] **9.7 (M) P2** **Jurídico**: documentos por unidade + notificações extrajudiciais a partir de recebíveis em atraso (templates com merge fields).
- [ ] **9.8 (S) P1** **Contas a pagar/receber da unidade** (`view-contas`) + categorias em árvore.

---

## EPIC 10 — Comunicação & Automação (P1)

- [ ] **10.1 (M) P1** **Comunicados**: CRUD (admin), audiência, prioridade, **leitura obrigatória + ciente**, métrica de leitura, e‑mail. → *detalhado no **EPIC 19**.*
- [ ] **10.2 (M) P1** **Chamados** (interno + base do SAC): CRUD, status, thread, finalizar/reabrir, SLA 2 dias (48h). → *detalhado no **EPIC 18**.*
- [ ] **10.3 (M) P1** **Automações/Mensagens**: padrão da rede (admin) vs personalizada por unidade; canais WhatsApp + push.
- [ ] **10.4 (M) P1** **Disparos WhatsApp API**: campanhas, conversas, bases & contatos, config da API por unidade, Grupo VIP.
- [ ] **10.5** → **SAC detalhado promovido para EPIC 15 (P0/P1)** com os requisitos do cliente.
- [ ] **10.6 (S) P2** **Marketing da Rede**: materiais, banco de mídia, notícias.

---

## EPIC 11 — RH (P1)

- [ ] **11.1 (M) P1** Migrar fonte de dados do **Portal RH** de `localStorage` (`rh_employees`, `rh_session`) para tabelas Supabase com `unit_id` (**RH por franquia** — usuário RH responde por N franquias).
- [ ] **11.2 (M) P1** Páginas: Dashboard, Colaboradores, **Ponto**, **Gestão de Ponto (admin)**, Recrutamento, Folha de Pagamento, Férias e Ausências, Desempenho, Regras da Rede, Configurações. → *detalhado no **EPIC 20**.*
- [ ] **11.3 (S) P2** **Ponto Digital (GPS)**: geolocalização + Google Maps + cerca virtual (150 m) + **home office multi‑endereço**. *(Unificar o GPS real do protótipo com o Ponto simulado do app RH — ver EPIC 20.1.)*
- [ ] **11.4 (S)** Decidir: manter RH embarcado (iframe) vs reescrita nativa.

---

## EPIC 12 — Conteúdo & Operação de Rede (P2)

- [ ] **12.1 (M) P2** **Universidade Corporativa**: trilhas por cargo, vídeos, provas (aprovação ≥7), alunos & notas, certificados.
- [ ] **12.2 (M) P1** **Checklist de Indicadores (PDCA)**: modelos editáveis, aplicação por unidade, ranking, evolução semanal, planos de ação automáticos.
- [ ] **12.3 (M) P2** **Implantação de Unidade**: 5 fases / ~64 tarefas, responsáveis, KPIs (admin edita tudo; demais só situação).
- [ ] **12.4 (S) P2** **Disco Virtual**: pastas + Google Drive (upload só admin).
- [ ] **12.5 (M) P1** **Notas Fiscais**: emissor NFS‑e multi‑prefeitura, política de emissão, IBS/CBS, CPF padrão, crédito recorrente PagoLivre.

---

## EPIC 13 — Relatórios & Auditoria (P1)

- [ ] **13.1 (L) P1** **Relatórios** (28): container declarativo (`REL_DEFS`) com filtros (período/unidade/tipo), KPIs, colunas, gráficos. Cada relatório lê dados reais das tabelas.
- [ ] **13.2 (M) P1** **Auditoria**: `audit_log` append‑only persistente, filtros, política soft‑delete (nada se apaga). Toda mutação registra.

---

## EPIC 14 — Qualidade, Migração de Dados & Go‑live (P0/P1)

- [ ] **14.1 (M) P0** Estratégia de **migração de dados**: ler o `app_state` (blob) + seeds atuais e normalizar para as novas tabelas; importar clientes existentes.
- [ ] **14.2 (M) P1** Suíte **E2E por tela** (CRUD + validação + permissão + multitenant) — ver ARQUITETURA §8.
- [ ] **14.3 (S) P1** Testes de **RLS** (isolamento por franquia) e de **alçadas**.
- [ ] **14.4 (S) P1** Revisão de segurança (LGPD: fotos clínicas, CPF, contratos) + `/security-review`.
- [ ] **14.5 (S)** Deploy (Vercel) + variáveis de ambiente + checklist de homologação (`docs/homologacao/`).

---

---

# Detalhamento por requisitos do cliente (20–21/06/2026)

> Fonte: [REQUISITOS-CLIENTE.md](REQUISITOS-CLIENTE.md). 🟢 = cliente diz que "já fez" (validar/reconstruir) · 🔴 = construir · 🔌 = integração externa.

## EPIC 15 — SAC dentro do sistema (P0/P1) — *rodar o quanto antes*

- [ ] **15.1 (S) P0** Perfil **"Atendente"** (RBAC) + atendentes cadastradas em **Colaboradores**.
- [ ] **15.2 (M) P0 🔌** **Entrada multicanal** de chamados: (a) **botão "SAC" do site** integrado, (b) **WhatsApp**, (c) **manual** (Reclame Aqui, Procon, e‑mail, chamado da unidade). Suportar **clientes e não‑clientes** (cancelamento de pacote/contrato, reagendamento × informações de unidade/franquia/serviço).
- [ ] **15.3 (M) P0** 🟢 **Abertura automática de chamado via BOT** (coleta inicial) — *validar o BOT existente* e ligá‑lo ao sistema.
- [ ] **15.4 (M) P0** 🟢 **Auto‑import de dados por CPF/telefone** (obrigatórios): o que contratou, quanto pagou, quantas sessões fez. — *validar/reconstruir.*
- [ ] **15.5 (M) P0** 🟢 **Cálculo do valor de devolução** no cancelamento — **certificar se está correto** (multa/sessões consumidas).
- [ ] **15.6 (M) P0 🔌** 🟢 **Espelho SAC ↔ Contas a Pagar** (Financeiro Franqueadora): pagamento do SAC aparece como "solicitação do SAC"; financeiro valida/edita data‑valor; alteração/observação **espelha de volta** ao SAC. — *validar o fluxo bidirecional.*
- [ ] **15.7 (M) P1 🔌** **WhatsApp automático ao cliente** com andamento de solicitações longas (cancelamento, falta de resultado) — reduz "como está minha solicitação".
- [ ] **15.8 (M) P1** **Distribuição igualitária** de conversas entre atendentes **logadas no período** (folga/deslogada não recebe) + **visão de todas as conversas**.
- [ ] **15.9 (S) P1** 🟢 **Alertas de 48h** para dar andamento — *validar.*
- [ ] **15.10 (L) P2 🔌** **IA de atendimento** treinada no negócio (respostas simples, conclusão automática); humano só em último caso; **supervisora** revisa.

## EPIC 16 — Expansão (P0) — *FUNDAMENTAL, prioridade inicial*

- [ ] **16.1 (S) P0** **UI cleanup:** remover os **menus internos da tela** que ficaram duplicando os submenus laterais.
- [ ] **16.2 (L) P0 🔌** **Disparos de WhatsApp que nunca param** para captação de leads de **franquia** e **revenda de unidades** — com **todos os dados dos disparos** e **funil de vendas** dos leads. *(Cliente prioriza disparos sobre geolocalizado.)*
- [ ] **16.3 (M) P0 🔌** **Captação multicanal:** Google (preenche formulário do site) · site direto · **geolocalizado** (pequeno cadastro cai na lista) · manual. Tudo cai no funil de Expansão.
- [ ] **16.4 (M) P0 🔌** 🔴 **Conversa inicial automatizada** dos leads (esquentar, dar infos iniciais) e **só os leads quentes vão para pessoas** + **janela para ver as conversas**.
- [ ] **16.5 (S) P1** Segmentar: hoje o mesmo CRM serve **venda de equipamentos** — planejar separar (depois fica **só franquia**).

## EPIC 17 — Checklist PDCA automatizado (P1) — *gestão da rede*

- [ ] **17.1 (M) P1** **Coleta automática semanal** (programada **segunda de manhã**): puxa metas + médias do funil (agendamentos, comparecimentos, conversão **novos vs revenda**, ticket médio) e **compara unidade × média da rede/unidade**. (Substitui pesquisar no BEMP + preencher no SULTS.)
- [ ] **17.2 (M) P1** **Geração automática de planos de ação** por fragilidade de indicador, com **biblioteca de ações sugeridas personalizáveis** (Agendamento / Comparecimento / Conversão / Ticket — ver REQUISITOS §8).
- [ ] **17.3 (M) P1** **Chat dentro do plano de ação** (cobrança de ações, apoio, dúvidas) com histórico.
- [ ] **17.4 (M) P1** **Cronograma automatizado:** abre seg manhã → **quinta 14h alerta** se em aberto → **sexta 18h encerra**; não cumprido = **DESCUMPRIMENTO registrado** (histórico de descumprimentos por unidade).
- [ ] **17.5 (M) P2** **Simulação final**: quanto a unidade venderia se acatasse as medidas (indicadores → média da rede, mantendo os que já estão acima).

## EPIC 18 — Chamados / Intranet de solicitações (P1) — *anotação #9 (21/06 21:59)*

- [ ] **18.1 (M) P1** **Chamados área↔área e franqueadora↔franqueado**: abrir solicitação (quem, **quando**, **o que**), thread de **retorno**, status; ex.: franqueado pede **material**, operações pede **pagamento** ao financeiro. *(Detalha o EPIC 10.2.)*
- [ ] **18.2 (S) P1** **Prazo de 48h**: chamado fora do prazo entra em **atraso**, sinalizado nos **relatórios** e **notificado aos gestores**.
- [ ] **18.3 (S) P1** **Relatórios de chamados** (volume, atraso, por área/responsável/unidade).
- [ ] **18.4 (S) P1** Modelo **Intranet**: **notificação** ao chegar um chamado e ao **entrar em atraso**.

## EPIC 19 — Comunicados (P1) — *anotação #10 (21/06 22:12)*

- [ ] **19.1 (M) P1** **Envio só por administradores** + CRUD (título, mensagem, prioridade, categoria, **leitura obrigatória + ciente**). *(Detalha o EPIC 10.1.)*
- [ ] **19.2 (S) P1** **Público-alvo selecionável**: nossos colaboradores · só **escritório** · só **franqueados** · **funcionários de franqueados** · **todos**.
- [ ] **19.3 (S) P1** **Dashboard de leitura**: quem **viu** / deu **OK**, **o que** foi enviado e **quando**.

## EPIC 20 — RH detalhado (P1) — *anotação #11 (21/06 23:09)*

- [ ] **20.1 (S) P1 🔌** **Ponto Digital (colaborador)**: bate o próprio ponto pelo **celular**; **Google Maps + cerca de 150 m**; vê o próprio **saldo de horas**. *(⚠️ Unificar com o Ponto GPS **real** do protótipo — EPIC 11.3; o Ponto do app RH hoje usa **localização simulada**.)*
- [ ] **20.2 (S) P1** **Home office**: registrar **mais de um endereço** válido para a marcação (não é férias).
- [ ] **20.3 (M) P1** **Gestão de Ponto (admin)** — tela **separada**, logo abaixo de "Ponto": lista de quem bate ponto, **faltas**, **justificativas** e **saldo de horas**; acesso **só administradores**. *(Hoje "Ponto" está duplicado.)*
- [ ] **20.4 (S) P1** **Lista de Colaboradores** com **filtros** (área, CLT/PJ, etc.).
- [ ] **20.5 (M) P1 🔌** **Recrutamento — "Currículos" como 1º item**: todos os currículos caem aqui (do **site** + **import do SULTS**); **dashboards** (local/cargo/estado).
- [ ] **20.6 (M) P1** **Currículo → Kanban**: selecionar currículo inicia o **processo seletivo**; o andamento **replica de volta no currículo** (não disponível, não quer shopping, etc.). ⚠️ **Não jogar a lista inteira no Kanban** (dispararia WhatsApp em massa → ban) — RH **filtra e move só os selecionados**; 1ª etapa = msg de disponibilidade.
- [ ] **20.7 (S) P1 🔌** **Mensagem automática ao candidato** ao iniciar o processo (pré-selecionado; está disponível?; pode trabalhar fim de semana?).

## EPIC 21 — Canais de WhatsApp (módulo "Canais") (P0/P1) — *reunião 22/06*

- [ ] **21.1 (L) P0 🔌** **Módulo "Canais"**: cada unidade conecta o **próprio WhatsApp via QR Code** (UAZAPI = 1 instância/número por unidade) e define **quais automações** saem por ele; reconecta via QR se cair. *(E-mail por unidade foi descartado — inviável.)*
- [ ] **21.2 (M) P0 🔌** **Cadeia de delay por unidade** (anti-ban), configurável. Começar no **free (QR)**; medir o volume real (~3.000 msgs/dia só de confirmação + reagendamento) e migrar pra **API oficial paga** só se necessário (definir quem paga).
- [ ] **21.3 (M) P1** **Automações padrão**: boas-vindas; **confirmação em 3 etapas** (lembretes 2d/1d/2h → muda a cor azul→roxo na agenda); **reagendamento de faltas** (~40%); pós-venda. *(Estende EPIC 10.3.)*
- [ ] **21.4 (M) P1** **Automações por unidade** (recompra por serviço, etc.) — o franqueado cria as suas, além das padrão.
- [ ] **21.5 (M) P1 🔌** **Disparo de campanha** (base segmentada, ex.: lançamento de produto) — módulo/assunto **separado** das automações padrão. *(Liga a EPIC 10.4.)*

## EPIC 22 — Site institucional → Power System (P0) — *reunião 22/06*

- [ ] **22.1 (M) P0 🔌** **Leads do site caem no Power System** (CRM "Canal de Atendimento Comercial"), roteados pra unidade certa e distribuídos por regras. *(Detalha EPIC 3.2/3.3.)*
- [ ] **22.2 (M) P0** **Seleção de unidade por LISTA** (não CEP/geo) nos formulários (banner/pop-up/procedimento/avaliação); **admin escolhe quais unidades participam de cada campanha** (incluir/excluir).
- [ ] **22.3 (L) P1** **Painel admin do site reformulado** + **site 100% editável** (páginas/banners/textos) com login; métricas de acesso/volume.
- [ ] **22.4 (S) P0** **Provisório:** manter botão de WhatsApp enquanto não há backend; **congelar o site** ao iniciar o build.
- [ ] **22.5 (M) P1** **CRM de Atendimento Comercial ("PowerZap")**: pipeline + contatos + mini-Kanban + **IA de atendimento inicial** (qualifica leads, vendedor assume) + **canais integrados** (WhatsApp; depois IG/FB/e-mail/site/Google). *(Agência tem template — reaproveitar. Liga a EPIC 3.1.)*

## Regra de processo — congelar o front antes do build (reunião 22/06)

- [ ] **PB.1 (S) P0** Rafa faz **antes do build** tudo que mexe em **formulário/estrutura** — em especial o **seletor multi-serviço no agendamento** (hoje 1 → vários), que muda o modelo de dados.
- [ ] **PB.2 (S) P1** **Agenda — granularidade de 10 min** (hoje 1h): ajuste simples (agência faz).
- [ ] **PB.3 (S) P0** Depois do build: **nada de novos módulos/integrações/mudanças de formulário**; edições no **2º ambiente** → deploy. Segredos em **Vercel Kubernetes Secrets**.

## Acréscimos a épicos existentes (requisitos do cliente)

**Financeiro Franqueadora (EPIC 9):**
- [ ] **9.9 (M) P1 🔌** Ao cadastrar unidade, **criar automaticamente o "cliente" no financeiro** com contatos; **importar vendas das lojas próprias** e **lançar royalties sozinho**; restar só lançar **despesas (inclusive recorrentes/previsão)**.
- [ ] **9.10 (S) P1** 🟢 **Projeção de caixa da semana** (previsto + média da semana anterior) — *validar.*
- [ ] **9.11 (S) P1** **UX:** trocar os **"balões"** por **listas suspensas**; **botão de adicionar receita manual**; **destacar** o botão de Contas a Pagar.
- [ ] **9.12 (M) P1 🔌** **Conciliação bancária diária automática** + relatório.
- [ ] **9.13 (M) P1 🔌** **Régua de cobrança via WhatsApp** aos franqueados + **parcelamento de royalties 3×** (10% multa + juros calculados; com aceite → lança crédito → boleto no banco → envio).
- [ ] **9.14 (S) P2** **Registro de conversações** do setor (renegociações/cobranças).

**Jurídico (EPIC 9.7):** 🔴 **Backend de documentos** (COF/pré‑contrato/Contrato de Franquia) em Storage + **histórico e modelos de notificação** + 🔌 **integração com o financeiro** (atraso de royalties dispara notificação) e envio manual.

**Disco Virtual (EPIC 12.4):** 🔌 Integrar **Google Workspace** com **dois discos** — **Público** (admin sobe; demais veem/baixam) e **Privado** (só admin; arquivo histórico da rede, ex.: campanhas de marketing antigas).

**Implantação (EPIC 12.3):** 🔴 **Múltiplos checklists** (loja tradicional × store‑in‑store); **franqueado cumpre/anexa mas NÃO edita** o checklist (RBAC); 🔌 item **fora do prazo → WhatsApp automático** cobrando.

**App do Cliente (EPIC 7.5):** 🟢 criado mas **não testado** — tarefa de **ver funcionando + demonstrar** ao cliente e decidir escopo.

**Migração BEMP (EPIC 14.1) — reunião 22/06:** 🔌 via **API direta** do BEMP (dono = Diego), chave por **CPF** — dados do cliente ~100% OK. ⚠️ **BLOQUEIO:** a API **não expõe arquivos** (fotos de procedimento, termos de consentimento, contratos) — resolver com o BEMP (export/zip). 🔒 Regra **anti-roubo de cliente** no import: o cliente é da **loja que o cadastrou**; se outra loja inserir o **mesmo CPF**, vira **compartilhado** entre as duas.

---

## Pendências de informação do cliente (para detalhar P0)

- [ ] **Supabase do outro projeto** — recebido token de gerência (sbp_…) via chat: **revogar/rotacionar** e configurar como env var; validar/normalizar schema. *(Ver memória — token não versionado.)*
- [ ] **Acesso ao painel administrativo do site** lasercompany.com + mapa dos formulários (indicação/agendar/SAC) e roteamento por unidade.
- [ ] **Regras do módulo Saque** (quem saca, gatilho, aprovação, meio de pagamento).
- [ ] **Detalhes do BOT do SAC** já criado (onde está, payload que coleta) para integrar.
- [ ] **Conversa sobre a estrutura multitenant / rollout para as outras unidades.**
- [ ] 🚧 **Exportar documentos/arquivos do BEMP** (fotos de procedimento, termos, contratos) — a API não expõe; falar com o BEMP/Diego. **Bloqueio da migração.**
- [ ] 🚧 **WhatsApp: free (QR) × API oficial paga** — decidir após teste de volume; **quem paga** (~R$0,25/msg enviada · ~R$1,00/msg recebida).
- [ ] 🚧 **Suporte aos WhatsApp das unidades** — quem mantém quando o número cair; modelo de cobrança ao franqueado.
- [ ] **Relação de e-mails/WhatsApp de todas as unidades** (Rafa envia ao Matheus).

---

## Sequência sugerida (ondas) — repriorizada
0. **Pré-build (Rafa congela o front):** PB.1–PB.3 — multi-serviço no agendamento + ajustes estruturais antes de a agência iniciar o backend.
1. **Onda 1 (fundação):** EPIC 0 → 1 → 2.
2. **Onda 2 (foco do cliente, em paralelo):** **EPIC 16 (Expansão + disparos)** · **EPIC 3.2/3.3 + EPIC 22 (leads do site 🚨)** · **EPIC 15 (SAC)** · **EPIC 21 (Canais WhatsApp)** · EPIC 4 (Saque/Comissões).
3. **Onda 3 (operação/financeiro):** EPIC 6 (PDV) · EPIC 5 (Vendas) · EPIC 9 (Financeiro + automações) · EPIC 7 (Clientes/Agenda).
4. **Onda 4 (gestão da rede):** EPIC 17 (Checklist) · EPIC 10/**19** (Comunicados) · **EPIC 18 (Chamados)** · EPIC 8 · EPIC 11/**20** (RH) · EPIC 13.
5. **Onda 5:** EPIC 12 (Jurídico/Disco/Implantação/Universidade) · **EPIC 14 + migração BEMP (API + arquivos)** · go‑live.
