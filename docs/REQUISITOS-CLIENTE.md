# Requisitos do Cliente — Anotações do Power System

> Fonte primária de requisitos, transmitida pelo cliente (Matheus Ferreira) em **20–21/06/2026** via WhatsApp. Preserva a intenção do cliente módulo a módulo. Vira tarefas no [BACKLOG.md](BACKLOG.md); modelagem em [ARQUITETURA-NEXT.md](ARQUITETURA-NEXT.md).
>
> **Convenções:**
> - 🟢 **JÁ FIZ (validar)** = o cliente diz que implementou no protótipo; precisa **certificar se funciona** — atenção: no protótipo atual a maioria é mock/UI (ver `MAPEAMENTO.md` §1), então "validar" geralmente = **tornar real** + testar.
> - 🔴 **NÃO FIZ (gap)** = falta construir.
> - ⭐ **PRIORIDADE** declarada pelo cliente.
> - 🔌 **INTEGRAÇÃO** externa necessária.

---

## 🚨 Urgência declarada
- **O painel administrativo do site institucional já está recebendo MUITA gente** querendo **indicar** e **fazer sessões**. É preciso **agilizar e automatizar o envio desses leads direto para cada unidade**. (Mensagem de 21/06.)
- "Precisamos botar para rodar o quanto antes, nem que venhamos a ir testando alguns itens inicialmente e arrumando outros." → **estratégia incremental** (entregar e testar por partes).
- "Precisamos conversar sobre a **estrutura do Power System para as outras unidades**." → discutir **arquitetura multitenant / rollout para as franquias** (tema aberto, agendar conversa).
- Contexto: há acompanhamento próximo do Rafa (sócio) — pressão por velocidade.

---

## 1. SAC — Central de Atendimento ⭐ (rodar o quanto antes)

**Cadastro & permissões**
- Atendentes são cadastradas em **Colaboradores** (item inicial do sistema).
- Criar **perfil "Atendente"** com as permissões adequadas (RBAC).

**Entrada de leads/chamados no SAC (multicanal):**
- a) **Site** — botão **"SAC"** do site institucional (🔌 deve estar integrado).
- b) **WhatsApp**.
- c) **Outros canais, manual** — Reclame Aqui, Procon, e-mail, abertura de chamado da unidade, etc.

**Tipos de solicitante: clientes e não-clientes**
- Clientes: cancelamento de pacotes, cancelamento de contratos, reagendamento.
- Não-clientes: informações de unidades, de franquias, de serviços.

**Abertura automática de chamado**
- Antes: abria chamado no **BLIP** + preenchia planilha Excel **tudo na mão**.
- 🟢 **JÁ FIZ (validar):** um **BOT** que coleta informações iniciais para **abrir o chamado automaticamente**.
- 🟢 **JÁ FIZ (validar) — IMPORTANTE:** com o SAC **dentro** do sistema, ao informar **CPF ou telefone (obrigatórios)**, o chamado já **importa os dados do cliente**: o que contratou, quanto pagou, quantas sessões fez; e, em caso de cancelamento, **calcula o valor de devolução**. → **certificar se o cálculo de devolução ficou correto.**

**Integração SAC ↔ Financeiro (espelhamento)** 🔌
- Antes: solicitação de pagamento ia para a planilha do SAC e era informada ao financeiro; ninguém enxergava o outro.
- 🟢 **JÁ FIZ (validar):** lançamento de pagamento do SAC é **espelhado em Contas a Pagar do Financeiro Franqueadora**, marcado como **solicitação do SAC**; o financeiro **valida ou não** (data e valor). Havendo observação/alteração de data ou valor, **espelha de volta ao SAC** para conhecimento. → **validar se está funcionando.**

**Automação de WhatsApp ao cliente** 🔌
- 🔴 Integrar o SAC ao **envio automático de WhatsApp** ao cliente em solicitações longas (cancelamento, falta de resultado, etc.), informando andamento — evita o cliente perguntar "como está minha solicitação" e reduz fluxo de trabalho.

**IA de atendimento (ideal)** 🔌
- 🔴 **IDEAL:** uma **IA "ensinada"** a dar respostas simples, que **aprende o negócio** e evita ao máximo o contato humano (usado em último caso). Idealmente apenas **uma supervisora** certifica que está sendo falado de forma correta e que os chamados são concluídos automaticamente.

**Distribuição & visão**
- 🔴 Ver **todas as conversas**.
- 🔴 Leads/chamados **distribuídos igualmente entre as atendentes** que estiverem trabalhando no período (quem está de folga / não logado **não recebe** leads).

**SLA**
- 🟢 **JÁ FIZ (validar):** alertas para dar andamento aos leads em **no máximo 48h**.

---

## 2. Financeiro Franqueadora ⭐

**Contexto:** hoje é um "Fluxo de Caixa" 100% manual (contas a pagar/receber na mão, recadastrar unidade que já existe no BEMP, lançar todas as vendas e royalties manualmente, sem automação).

**Automatizar:**
- 🔌 **Aproveitar o cadastro da unidade** do sistema para **criar o "cliente" no financeiro** com todos os contatos.
- 🔌 **Importar todas as vendas das (lojas) próprias** para dentro do sistema, **lançando os royalties sozinho** a partir das vendas; restando lançar só as **despesas** (inclusive **recorrentes / previsão**).
- 🟢 **JÁ FIZ (validar):** **"projeção de caixa da semana"** no dash inicial = previsto a receber + projeção de vendas pela **média da semana anterior**. → certificar.
- 🟢 **JÁ FIZ (validar):** sistema simples de **cálculo e atualização monetária**. → **certificar que atualiza os índices de correção** (API BCB SGS).

**UX (ajustes pedidos):**
- 🔴 Contas a pagar/receber: o sistema usa muitos **"balões"** (muitos itens na tela) → **trocar por listas suspensas** (dropdowns).
- 🔴 Em **Receitas**: adicionar **botão de adicionar receita manualmente**.
- 🔴 Em **Contas a Pagar**: **destacar mais o botão** de adicionar (está escondido entre vários botões da mesma cor).

**Automações:**
- 🔴 Automação diária de **conciliação bancária** + **emissão de relatório**.
- 🔴 🔌 **IMPORTANTE — Régua de cobrança** funcionando, com **WhatsApp cobrando os franqueados** (WhatsApp é o canal mais fácil).
- 🔴 Na régua, criar uma **linha de parcelamento de royalties em 3x com 10% de multa + juros calculados** pelo sistema: ele **calcula sozinho, propõe os valores** e, **com o aceite**, **lança o crédito**, **entra no banco, gera boleto e envia para pagamento**.
- 🔴 Guardar **registros de conversações do setor** (especialmente renegociações e cobranças).

---

## 3. Jurídico

- Manter corretos os **documentos das franquias**: **COF (Circular de Oferta de Franquia)**, **pré-contrato** e **Contrato de Franquia**.
- **Histórico de notificações** + **modelos de notificação** (guardados para envio por automação).
- 🔌 Envio por **automação** (do financeiro, quando há **atraso de pagamento**) ou **manual** por outros motivos.
- 🔴 **Backend para guardar todos os documentos** (Supabase Storage).
- 🔌 **Integração com o financeiro** para cobrança de royalties quando for o caso.

---

## 4. App do Cliente
- 🔴 **JÁ FIZ mas NÃO TESTEI:** o sistema criou sozinho; precisa **ver funcionando e testar** — o cliente **não sabe como usar**. → tarefa de **validação/demonstração** + decidir escopo.

---

## 5. Implantação de Unidade
- É um **checklist da ordem de itens** para inaugurar uma unidade; há **reunião semanal com o franqueado** para tratar a evolução e coordenar áreas (comercial, contratação, treinamento, etc.).
- 🔴 Suportar **mais de um checklist** (ex.: **loja tradicional** vs **store in store**) → poder **criar outro checklist**.
- 🔴 **Franqueado acessa e cumpre itens**, mas **NÃO pode alterar o checklist** — só **dar baixa nos itens** e **anexar documentos**. (RBAC: franqueado = executor, não editor.)
- 🔴 🔌 **SUGESTÃO:** item **não cumprido no prazo** → **dispara WhatsApp automático** ao franqueado cobrando o cumprimento/baixa.

---

## 6. EXPANSÃO ⭐⭐ (FUNDAMENTAL — pode dar PRIORIDADE inicial)

> "É FUNDAMENTAL que, para crescer a rede, possamos ter uma EXPANSÃO FORTE."

- 🔴 **UI cleanup:** foram criados submenus laterais, mas **ficaram menus dentro da tela junto** → **eliminar** os menus internos redundantes.
- 🔌 **Captação de leads multicanal:** Google (deve **preencher o formulário do site**), **site direto**, **geolocalizado** (preenche pequeno cadastro e cai na lista), **cadastro manual**.
- 🔴 **NÃO FIZ:** **automatizar a conversa inicial** desses leads — **esquentar**, dar informações iniciais, e **deixar para as pessoas apenas os leads mais quentes**. Ter uma **"janela" para ver as conversas** com os leads.
- 🔴 🔌 **IMPORTANTE — disparos de WhatsApp NÃO podem parar nunca**, para captação de leads de **franquia** e **revenda de unidades**, com **todos os dados dos disparos** e o **funil de vendas** dos leads captados. → **Prefere investir em disparos de WhatsApp a geolocalizado.**
- ⚠️ Hoje o **mesmo CRM** é usado também para **venda de alguns equipamentos**; **depois ficará só franquia** (separar/segmentar no futuro).

---

## 7. Disco Virtual 🔌 (Google Workspace)
- 🔌 Integrar com o **Google Workspace**, podendo criar **dois discos**:
  - **a) Público:** administradores **sobem documentos**; demais usuários **apenas veem e baixam**.
  - **b) Privado:** unifica num único lugar **tudo da rede**, onde **só administradores** veem; o resto **não**.
- Exemplo: pasta de **Marketing** — campanha **vigente** no disco **público**; campanhas do **ano anterior** no disco **privado**.

---

## 8. Checklist de Indicadores (automação PDCA semanal) ⭐

**Objetivo:** checklists de indicadores **automatizados toda semana**, a partir de um checklist pré-pronto.

**Lógica:** comparar as **metas do sistema** + as **médias do funil de vendas das lojas** (agendamentos, comparecimentos, conversão, ticket médio) **com a unidade avaliada**; a partir de **fragilidades**, criar **planos de ação** (automatizáveis).

**Automação (substitui o trabalho manual de pesquisar no BEMP e preencher no SULTS):**
- 🔴 Toda **segunda de manhã**: o sistema **pesquisa as informações** automaticamente e vê as fragilidades **a cada semana**.
- 🔴 Cria os **planos de ação** (no próprio sistema) e a equipe acompanha a resolução.
- 🔴 **TEM QUE ABRIR UM CHAT no plano de ação** para registrar **cobrança de ações, apoio e dúvidas**.
- 🔴 **Cronograma fixo:**
  - Plano de ação **abre segunda de manhã**.
  - Deve ser **finalizado até sexta 18h**.
  - **Quinta 14h:** alerta se o plano seguir **em aberto**.
  - **Sexta 18h:** **encerra com DESCUMPRIMENTO** pela unidade → **registrar todos os descumprimentos** em sistema.

**Indicadores e planos de ação sugeridos (personalizáveis):**

1. **Agendamento** (abaixo da média da rede ou da unidade): disparo de WhatsApp à base com oferta (sistema sugere sozinho); chamar clientes com **pontos do clube** para sessão cortesia (fluxo de disparos pontos×serviços); checar/aumentar **geolocalizado** (via CRM); ações de **indicações**, parcerias e link em redes sociais; buscar seguidores com sessão cortesia; promoções de **ultrassom**; usar **% de faltantes** para aumentar sobreposição de agenda; **parcerias locais** com código de desconto.
2. **Comparecimento** (falta acima da média): ofertas/benefícios no momento da sessão; **certificar que a automação de confirmação de agenda funciona**.
3. **Conversão baixa** (distinguir funil **novos** vs **revenda**): ofertas de balcão (automação com oferta 1h antes); aumentar captação de leads novos.
4. **Ticket médio baixo:** focar em pacotes/serviços de maior ticket; cruzar o que mais vende na rede (melhor ticket) com a unidade e sugerir; aumentar venda de **ultrassom**.

**Saída final:**
- 🔴 Ao final, o sistema sugere uma **SIMULAÇÃO** do que a unidade venderia caso acatadas as medidas e os indicadores melhorassem para a **média da rede**, **mantendo** os dados da unidade que já estejam **acima da média**.

---

## 9. Chamados (Intranet de solicitações)

**Objetivo:** registrar **todas as solicitações** de uma área à outra da franqueadora e entre a franqueadora e os franqueados.

- Exemplos: franqueado solicita **material** (registra **quando** pediu, **o que** pediu e o **retorno**); uma área de operações **solicita pagamento** ao financeiro; e assim por diante.
- 🔴 **Relatórios de chamados.**
- 🔴 **Prazo de 48h para cumprimento** → senão entra em **atraso**, assinalado em **relatórios e aos gestores**.
- 🔴 Funciona como uma **Intranet**: **notificação** ao chegar um chamado e quando ele **entra em atraso**.

---

## 10. Comunicados

**Contexto:** a rede recebe o tempo todo informações diversas (treinamento, eventos, materiais de marketing, etc.) — isso era feito no **SULTS**. Integrar ao sistema.

- 🔴 **Só administradores** enviam comunicados.
- 🔴 **Selecionar o público-alvo:** nossos colaboradores · só colaboradores do **escritório** · só **franqueados** · **funcionários de franqueados** · **todos**.
- 🔴 **Dashboards** de quem **viu** e quem deu **OK** aos comunicados, **o que** foi enviado e **quando**.

---

## 11. Recursos Humanos ⭐ (novidade frente a SULTS/BEMP)

**Contexto:** um dos sistemas mais importantes (novo em relação a SULTS/BEMP). Antes usavam vários sistemas avulsos (um para prospectar vagas, outro para bater ponto, etc.), com relatórios inexistentes. **Unificar tudo** para gerir melhor.

**Ponto Digital (colaborador):**
- 🟢 Onde o **colaborador bate o próprio ponto**, **visível no celular**.
- 🔌 Integrar ao **Google Maps** com **raio de 150 m** da unidade para liberar a marcação.
- 🔴 Registrar **mais de um endereço** para **home office** (não é férias — precisa estar em casa, trabalhando).
- O colaborador vê o **próprio saldo de horas** no Ponto.

**Gestão de Ponto (admin) — item novo, logo abaixo de "Ponto":**
- 🔴 Hoje há um item "Ponto" **repetido**; o correto é uma **GESTÃO DE PONTO** separada, **só para administradores**, mostrando a **lista de todos que batem ponto**, **quem faltou**, **quem justificou** e o **saldo de horas** dos colaboradores.

**Lista de Colaboradores:**
- 🔴 **Filtros** essenciais: quantos por **área**, **CLT/PJ**, etc. (todos os filtros necessários).

**Recrutamento ⭐ (fundamental) — "Currículos" deve ser o 1º item:**
- 🔴 🔌 **Todos os currículos caem aqui**, por qualquer caminho: os **cadastrados no site** e os **importados do SULTS** (acervo atual).
- 🔴 **Dashboards** de tudo (local, cargo, estado, etc.).
- 🔴 Ao **selecionar um currículo**, ele **cai no Kanban** e inicia o **processo seletivo**; o andamento é **replicado de volta na lista de currículos** (ex.: não disponível, não quer shopping, etc.).
- 🔴 🔌 Ao iniciar o processo, **enviar mensagem automática ao candidato** (pré-selecionado; está disponível?; pode trabalhar fim de semana? etc.).

---

## 12. Gestão de Indiques ⭐ — *anotação #12 (22/06)*

**Contexto:** a rede cresceu por **indicação**; cliente novo vale muito. Incentivo: trocar 3–5 indiques/mês por concorrer a um **sorteio mensal** (pacote laser / sessão ultrassom), um por unidade.

- 🟢 Indicações do **site** caem aqui automático + entrada manual (precisa integrar o site). **Cada unidade vê as suas; a franqueadora vê todas.**
- 🔴 **Dashboard de indicações** (visão geral de todas as unidades) — não feito.
- 🔴 **Kanban: "abrir o lead"** para escrever/registrar o andamento (hoje não abre).
- 🔴 🔌 **Régua de venda automática (IA):** ao entrar a indicação (sabe-se quem indicou e quem foi indicado), enviar **1º, 2º e 3º contatos** por WhatsApp sem humano, com **evolução automática no Kanban**, até **agendar** (entra humano) ou **arquivar/perdido**.

## 13. CRM — *anotação #13 (22/06)*
- 🟢 **Transformar o "pipeline" num CRM de verdade.** → **JÁ ENTREGUE** na migração (CRM real: criar/mover/leads por unidade).

## 14. Disparos de WhatsApp ⭐⭐ (IMPORTANTÍSSIMO) — *anotação #14 (22/06)*
- 🔴 🔌 **Um WhatsApp por unidade** (ou mais de um por unidade, caso um bloqueie).
- 🔴 **UI:** trocar o **menu interno** por **sub-menu do menu lateral**.
- 🔴 **Mediar tudo**: envio, abertura, venda; **ver as conversas**; entrar os leads num **Kanban**.
- 🔴 🔌 **GRUPO VIP:** grupos **por loja** (por isso WhatsApp separado), de clientes selecionados, para **um dia de vendas** com preços diferentes. **A IA aquece o grupo** por cronograma (grupo abre **5 dias antes**), com campanhas/materiais em datas pré-definidas.
- 🔴 🔌 **IDEAL:** ao cliente dizer "EU QUERO", o sistema gera **link de pagamento** (no privado) para fechar a venda.
- 🔴 **Métricas do Grupo VIP:** nº de pessoas, nº de vendas, ticket médio e venda total.

## 🚨 Urgência (22/06)
- *"PRECISAMOS BOTAR PARA RODAR ALGO JÁ NA SEMANA."* · *"Gestão e SAC saem hoje, com as integrações do site?"*
- → Confirma o foco: **SAC + CRM/Gestão + integração de leads do site** primeiro (já funcionais na migração). Conectar o **canal WhatsApp** (QR) destrava disparos/respostas reais.

## Resumo de prioridades (repriorização do cliente)
| Módulo | Prioridade resultante | Por quê |
|---|---|---|
| **Expansão** (disparos WhatsApp + captação multicanal + esquentar lead) | **P0** | "FUNDAMENTAL", prioridade inicial declarada. |
| **Site → Leads (indicação/sessão/SAC)** | **P0 urgente** | Site já recebendo muita gente agora. |
| **SAC** (multicanal, import de dados por CPF/tel, espelho financeiro, distribuição, WhatsApp) | **P0/P1** | "rodar o quanto antes". |
| **Financeiro Franqueadora** (import vendas/royalties, régua WhatsApp, parcelamento, conciliação diária) | **P1** | Automação pesada; várias partes "já fiz, validar". |
| **Checklist PDCA automatizado** (agendado seg→sex, chat no plano, descumprimento, simulação) | **P1** | Núcleo de gestão da rede. |
| **RH** (ponto + gestão de ponto admin + recrutamento integrado) | **P1** | Novidade frente a SULTS/BEMP; unifica sistemas avulsos. |
| **Comunicados** (audiência segmentada + dashboard de leitura) | **P1** | Substitui o uso do SULTS para comunicação à rede. |
| **Chamados** (intranet área↔área, 48h, relatórios) | **P1/P2** | Operação interna entre áreas e franqueados. |
| **Jurídico / Disco Virtual / Implantação / App cliente** | **P2** | Importantes, sem urgência declarada. |

## Itens "já fiz — VALIDAR" (lista de verificação)
- [ ] BOT de coleta inicial do SAC abrindo chamado automaticamente.
- [ ] Import de dados do cliente no SAC por CPF/telefone (contratou/pagou/sessões).
- [ ] Cálculo do valor de devolução no cancelamento (SAC).
- [ ] Espelho SAC ↔ Contas a Pagar (e retorno de observação/alteração ao SAC).
- [ ] Alertas de 48h no SAC.
- [ ] Projeção de caixa da semana (dash financeiro).
- [ ] Cálculo/atualização monetária + atualização dos índices de correção.
- [ ] (verificar onde esses "já feitos" existem hoje — protótipo é majoritariamente mock; provavelmente reconstruir de verdade.)
