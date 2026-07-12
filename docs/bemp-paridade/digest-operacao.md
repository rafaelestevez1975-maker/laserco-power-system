# Digest — Telas operacionais do BEMP (HTMLs autenticados, 11/07/2026)

Fonte: `scratchpad/bemp-pages/*.html`. Todas as listagens seguem o mesmo padrão Rails+Ransack:
box "Filtros" colapsável, submit **Pesquisar** (GET com `q[...]`), dropdown **Exportar** → `/{recurso}/export?format=xlsx|csv`, paginação simples **Anterior/Próximo** (`?page=N`, sem números de página), ordenação por `q[s]=coluna asc|desc` clicando no `<th>`, e linha inteira clicável via Stimulus (`data-action="click->page#visit"` → `/{recurso}/{id}/edit`). Várias telas têm um botão engrenagem `/field_setting/{entity}` (modal `#modal-window`) para configurar campos/colunas visíveis por tela.

---

## 1. Agenda (`/schedules`)

Tela 100% renderizada por JavaScript — o HTML só traz `div#schedule-wrapper > div#schedule` vazio + `div#schedule_popover`; o calendário (FullCalendar) é montado pelo objeto `new Schedules({...})` que busca eventos em `/schedules` (JSON).

**Sem tabela, sem filtros Ransack.**

**Ações/controles do cabeçalho:**
- Engrenagem → `/field_setting/schedule` (modal de configuração de campos)
- Botão refresh `#reload-schedules` (recarrega eventos)
- Navegação de data: `#previous_day` / `#next_day` (chevrons) e `#btn_date` (abre flatpickr `#flatpickr-input`, valor `11/07/2026`; spans `#date-full`/`#date-short` mostram a data corrente)

**Config passada ao JS (comportamento notável):**
- `salon`: horário de funcionamento por dia da semana em segundos (`monday_start: 28800` = 08:00, `monday_end: 75600` = 21:00; sábado até 17:00; domingo fechado) e **`slot_minutes: 10`** — grade da agenda em slots de 10 minutos
- Flags de permissão por usuário: `manage_schedules`, `manage_salon_blocks` (bloqueios da unidade), `manage_user_blocks` (bloqueios por profissional), `view_others` (ver agenda de outros)
- `window.I18n.paymentTypes` global: Integral, Com Desconto, Pontos fidelidade, Pacote de crédito, Assinatura

---

## 2. Ordens de serviço (`/orders`)

**Colunas:** Cliente | Comanda | Origem | Status | Data criação ▼ (sort default desc) | Data fechamento | Data cancelamento | Desconto ($) | Total | Ações

**Filtros (`q[...]`):**
| Campo | Label |
|---|---|
| `created_at_date_as_datetime_gteq/lteq` | Período de criação (default = hoje, vem pré-aplicado) |
| `closed_at_date_as_datetime_gteq/lteq` | Período de fechamento |
| `canceled_at_date_as_datetime_gteq/lteq` | Período de cancelamento |
| `status_eq` | Status: **Aberta / Fechada / Cancelada** |
| `token_code_or_id_eq` | ID ou comanda |
| `origin_eq` | Origem: **Agenda / Avulsa / Interna / Pacote / Assinatura / Multa por cancelamento de assinatura / Créditos** |
| `customer_id_null` | Cliente não informado (Sim/Não) |
| `order_services_payment_type_or_order_products_payment_type_eq` | Pagamento: Integral / Com Desconto / Pontos fidelidade / Pacote de crédito / Assinatura |
| `discount_decimalgteq` | Desconto maior que (máscara decimal) |
| `order_services_discount_id_eq` | Desconto ($): lista dos descontos cadastrados (05%…87,62%, "100% (Benefício ao cliente)", "100% (Treinamento)", "Aberto/Vertem", "CRA"…) |
| `total_decimalgteq` | Total maior que |
| `order_services_user_id_or_order_products_user_id_eq` | Colaborador (executante) |
| `order_services_service_id_eq` | Serviço |
| `order_products_product_id_eq` | Produto |
| `payment_status_eq` | Status dos pagamentos: **Sem pendências / Pagamento pendente / Pagamento com erro** |
| `close_user_id_eq` | Usuário que finalizou |
| `cancel_user_id_eq` | Usuário que cancelou |
| `selling_user_id_eq` | Vendedor(a) |

**Ações:** Exportar xlsx/csv (`/orders/export`); engrenagem `/field_setting/order`. **Não há botão "Novo"** — OS nasce da agenda/venda, não desta listagem.

**Comportamentos:** a linha NÃO é clicável (sem `page#visit`); acesso via link **"Visualizar" → `/orders/{id}/edit`** na coluna Ações. 4 papéis de usuário distintos rastreados por OS (executante, vendedor, quem fechou, quem cancelou). Auditoria de datas completa (criação/fechamento/cancelamento).

---

## 3. Clientes (`/customers`)

**Colunas:** Nome ▲ | Número do telefone | E-mail | Documento | Gênero | Ativo | Verificado | App

**Filtros (`q[...]`):** `active_true` (Ativo, default Sim), `name_cont` (Nome), `email_cont`, telefone em 3 partes (`phone_country_code_cont` DDI select com todos os países / `phone_area_code_cont` DDD / `phone_number_cont`), `document_type_eq` (**CPF / Passaporte / CNPJ** + hidden `validate_document=true`), `document_id_cont`, `gender_eq` (**Masculino / Feminino / Trans / Outro**), `verified_true` (Verificado), `mobile_true` (App — cliente usa o app mobile), `blocked_true` (Bloqueado), `payment_status_eq` (Sem pendências / Com pendências), `city_cont` (Cidade), `salons_id_in[]` (Unidades — multiselect com todas as franquias da rede).

**Surpresa:** filtro extra `custom_field[8914]` "Leads" (**Captação Interna / Captação Externa**) — campo customizado do tenant injetado nos filtros, fora do namespace Ransack.

**Ações:** **Novo** → `/customers/new`; Exportar xlsx/csv; engrenagem `/field_setting/customer`.

**Comportamentos:** linha clicável → `/customers/{id}/edit`; cada linha tem **botão WhatsApp** → `/whatsapp_messages/new_message/customer/{id}` (dispara conversa direto da listagem). Colunas ordenáveis: Nome, Gênero, Ativo, Verificado. 30 linhas/página. Cliente pode existir sem nome (linha "?") — cadastro mínimo só com telefone.

---

## 4. Serviços (`/services`)

**Colunas:** Nome ▲ | Tipo de preço | Preço $ | Desconto Máximo (%) | Tempo de duração | Comissionável | Grupo | Serviço de encaixe | Ativo | Disponível para agendamento online | Ordem no App

**Filtros:** `active_true` (Ativo), `name_cont` (Nome), `service_group_id_eq` (Grupo: **Depilação / Estético / Ultrassom**), `price_type_eq` (Tipo de preço: **Fixo / Variável / Gratuito**), `commissionable_true` (Comissionável), `has_remote_schedule_true` (Disponível para agendamento online).

**Ações:** **Novo** → `/services/new`; Exportar xlsx/csv.

**Comportamentos:** linha clicável → `/services/{id}/edit`; 30/página. Conceitos importantes do modelo: duração (ex. 00:20) alimenta a grade da agenda, "Serviço de encaixe" (fit-in), flag de agendamento online e "Ordem no App" (ordenação na vitrine do app do cliente). Ex.: "Aesthetic - Acne Ativa" preço fixo R$ 799,96, desconto máx 0%.

---

## 5. Pacotes (`/packages`)

**Colunas:** Nome | Cobertura de créditos | Cálculo de comissão na execução | Validade (em dias) | Valor total | Desconto Máximo(%) | Ativo | Pagar comissão na

**Filtros:** `active_true` (Ativo), `name_cont` (Nome), `commission_payment_type_in[]` (Pagar comissão na: **Execução / Venda / Execução e Venda** — multiselect).

**Ações:** **Novo** → `/packages/new`; Exportar xlsx/csv.

**Comportamentos:** linha clicável → `/packages/{id}/edit`; 30/página. Modelo de pacote = crédito de sessões com: **"Cobertura de créditos" = "Qualquer unidade"** (crédito vendido numa franquia pode ser consumido em outra — cross-unidade), validade em dias (ex. 730 = 2 anos), e política de comissão dupla (momento do pagamento: venda vs execução; cálculo na execução "Respeitar a configuração da unidade"). Ex.: pacote "Acne Ativa" R$ 1.999,90, desconto máx 50%.

---

## 6. Produtos (`/products`)

**Colunas:** Nome ▲ | Grupo | Preço $ | Desconto Máximo (%) | Ativo | Insumo

**Filtros:** `active_true` (Ativo), `name_cont` (Nome), `standard_true` (Padrão), `feedstock_true` (**Insumo**).

**Ações:** **Novo** → `/products/new`; Exportar xlsx/csv.

**Comportamentos:** linha clicável → `/products/{id}/edit`. Badge **"Padrão"** (`label-info`) marca produto padrão da rede (cadastro da franqueadora vs local). Distinção venda × insumo (`feedstock`): só 7 produtos, maioria insumo (ampolas PDRN/Peptídeo usadas nos serviços Aesthetic). Catálogo de produtos é pouco usado nesta operação.

---

## 7. Anamnese / Ficha Técnica (`/custom_entities/customer_event`)

É o **form-builder** do BEMP: a listagem não mostra respostas de clientes, mas as *definições* de formulários custom (entidade `customer_event`). As respostas ficam na ficha do cliente.

**Colunas:** Nome | Ativo (só isso).

**Filtros:** `active_true` (Ativo), `name_cont` (Nome).

**Ações:** **Novo** → `/custom_entities/customer_event/new`; Exportar xlsx/csv.

**Formulários cadastrados (8, todos ativos):**
1. Anamnese Digital (id 36)
2. Autorização de Uso de Imagem (51)
3. Autorização para Menor (49)
4. Formulário de Solicitação de Cancelamento (52)
5. Termo de Ratificação e Assinatura de Contrato (1004)
6. Termo de Realização de Sessão (38)
7. Termo de Transferência de Pacotes (709)
8. Termo de Troca de procedimento para Credito (744)

**Comportamento:** linha clicável → `/custom_entities/customer_event/{id}/edit` (editor do formulário). Ou seja: anamnese, termos de consentimento e formulários de cancelamento/transferência são todos o mesmo mecanismo genérico de campos customizados.

---

## 8. CRM — Quadros (`/crm/boards`)

Página "Quadros": grid de cards (não é tabela), estilo Trello. Cada card = um quadro/funil; clicar no card abre o quadro (`/crm/boards/{id}`), ícone de engrenagem no card → `/crm/boards/{id}/edit`. Card "Novo quadro" → `/crm/boards/new`. Sem filtros nem exportação nesta tela (o kanban em si é outra página).

**Quadros existentes (autor de todos: Rafael Estevez):**
| Quadro | id | Propósito (descrição do card) |
|---|---|---|
| ⚡ Gestão de Geolocalizado | 218 | Leads que chamam por WhatsApp e Instagram; cadastrar e acompanhar; envia mensagens padronizadas (a descrição inclui script de 1ª mensagem) |
| 💻 Gestão Indicações | 229 | Gestão de clientes indicados (ações de captação, indique-e-ganhe/sorteio) |
| 🚀 Orçamentos | 197 | Todos os leads e orçamentos a prospectar, até esgotar o funil de vendas |

---

## Padrões transversais (resumo)

- **Ransack** em tudo: filtros GET `q[campo_predicado]`; predicados vistos: `_cont`, `_eq`, `_gteq/_lteq`, `_true`, `_null`, `_in[]`, e compostos tipo `a_or_b_eq`; ordenação `q[s]`.
- **Linha clicável** = Stimulus `page#visit` → sempre a rota `/edit` (não há "show" separado); exceção: Ordens usa link explícito "Visualizar".
- **Exportar** xlsx/csv presente em todas as listagens (rota `/{recurso}/export?format=`).
- **`/field_setting/{entity}`** (engrenagem, modal): personalização de campos/colunas por tela (schedule, order, customer).
- **Paginação** de 30 itens, só Anterior/Próximo.
- Turbo + turbo-frames (`#modal-window`, contador de mensagens internas), Zendesk messenger embutido, Google Analytics.
