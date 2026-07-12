# BEMP — Digest das telas Financeiras/Comerciais (HTMLs autenticados, 11/07/2026)

Fonte: `/tmp/.../scratchpad/bemp-pages/*.html` (unidade ativa: Belo Horizonte - Lourdes BH).
Padrões gerais de TODAS as listas: filtros Ransack em box "Filtros" colapsável (`q[...]`), botão **Pesquisar**, dropdown **Exportar** (Excel .xlsx / Texto .csv via `/<recurso>/export?format=`), botão **Novo** (`bg-skin`), linha da tabela clicável (`click->page#visit` → `/recurso/:id/edit`), paginação "Exibindo X a Y de Z registros" (30/página).

---

## 1. Contas a pagar / Contas a receber (`/account_payables`)

**Abas**: "Contas a pagar" (`/account_payables`) e "Contas a receber" (`/account_receivables`) — mesmo layout, duas rotas.

**Colunas**: ☑ (checkbox de seleção em massa) | Descrição | Fornecedor | Categoria | Valor | Data prevista | Data realizada | Ações (Editar → `/account_payables/:id/edit`).

**Filtros**:
- `q[date_date_gteq]` / `q[date_date_lteq]` — Período (daterange; default = hoje)
- `q[status_in][]` — Status: **Previsto / Realizado / Cancelado**
- `q[account_payable_category_id_in][]` — Categoria (multi). Plano de categorias (25): Bonificações, Comissões, Descontos, Impostos, Aquisição de produtos, Frete, Aluguel, Benefícios, Despesas Administrativas, Devoluções e Reembolsos, FGTS, Honorário Contabilidade, INSS, Internet, IRRF, Luz/Água/Telefone, Marketing, Material Expediente e Manutenções, Parcela Equipamento (Investimento), Rescisão, Salários, Sistema/Software, Royalties, Parcela Empréstimos, **Taxa meio de pagamento**
- `q[supplier_id_eq]` — Fornecedor (select remoto)
- `q[description_cont]` — Descrição

**Ações**:
- **Novo** → `/account_payables/new`
- **Exportar** xlsx/csv → `/account_payables/export?format=...`
- Ações em massa no rodapé da tabela (habilitam ao marcar checkboxes):
  - **Marcar como realizado** → POST `/account_payables/bulk` (abre `#modal-window` — baixa com data/forma)
  - **Marcar como previsto** (estorno de baixa) → POST `/account_payables/bulk_unaccomplish`
  - **Cancelar** → DELETE `/account_payables/bulk_cancel`

**Comportamentos notáveis**:
- **Totalizador no tfoot**: "Valor previsto: 13,19 | Valor realizado: 0,00 | Total: 13,19" — soma do resultado filtrado, quebrada por status.
- Lançamentos de **comissão são gerados automaticamente por OS**: descrição "OS #12446381", fornecedor = a profissional, categoria "Comissões", valores pequenos (0,32–1,20 = % sobre o serviço), data prevista = data da OS. Uma OS gera várias linhas (uma por serviço/item).
- Status é derivado: Data realizada vazia = Previsto.

---

## 2. Formas de pagamento (`/payment_methods`) — por que 125 registros?

**Colunas**: Nome | Tipo | Taxa (%) | **Taxa a descontar na comissão (%)** | Ativo.

**Filtros**: `q[active_true]` (Ativo Sim/Não), `q[name_cont]` (Nome).

**Ações**: Novo → `/payment_methods/new`; Exportar xlsx/csv; linha → edit.

**Por que 125**: NÃO há tabela de taxas por parcela dentro da forma — cada combinação **nº de parcelas × canal × bandeira × adquirente** é um registro separado, com sua taxa própria. Padrão do nome: `"NN x {Cartão de Crédito | Link de Pagamento} - {Bandeira} - {Adquirente}"`. Exemplos reais da página 1 (toda "Crédito"):

| Nome | Tipo | Taxa % |
|---|---|---|
| 01 x Cartão de Crédito - Mastercard - Rede | Crédito | 2,70 |
| 01 x Cartão de Crédito - American Express - Rede | Crédito | 3,65 |
| 01 x Cartão de Crédito STONE | Crédito | 3,15 |
| 02 x Cartão de Crédito - Visa - Rede | Crédito | 4,33 |
| 03 x Cartão de Crédito - Mastercard - Rede | Crédito | 4,97 |
| 04 x Cartão de Crédito - Elo - Rede | Crédito | 6,85 |

- Taxa cresce com o nº de parcelas; bandeiras premium (Amex/Elo) mais caras que Visa/Master; adquirentes distintas (Rede e Stone) convivem.
- "Link de Pagamento" (venda remota) duplica toda a grade com as mesmas taxas.
- Estimativa da grade: parcelas 01–12 × 4 bandeiras × 2 canais (~96–100) + grade Stone + Dinheiro/Pix/Débito etc. = 125.
- "Taxa a descontar na comissão (%)" = 0,00 em todos os exemplos — existe a opção de repassar a taxa do cartão para a comissão do profissional, mas a rede não usa.
- A taxa alimenta a categoria de despesa "Taxa meio de pagamento" no contas a pagar.

---

## 3. Descontos (`/discounts`) — 36 registros

**Colunas**: Nome | Serviço | Produto | Pacote | Data Expiração | Ativo.

**Filtros**: `q[active_true]`, `q[name_cont]`.

**Ações**: Novo → `/discounts/new`; Exportar xlsx/csv.

**Comportamentos**: cada desconto define **um percentual por tipo de item** (Serviço %, Produto %, Pacote %) — ex.: desconto "10%" = 10% em serviço, 0% em produto, 10% em pacote. Produto é 0,00% em todos (rede não desconta produto). Há descontos "políticos" nomeados: **"100% (Benefício ao cliente)"** e **"100% (Treinamento)"** — cortesia total rastreável por nome. Data de expiração opcional (vazia = sem prazo). Escala cadastrada: 5% a 50% de 5 em 5.

---

## 4. Notas Fiscais (`/invoices`)

**Colunas**: Data da competência (sort default ▼) | Tipo | Número da NF | Origem | Cliente | Valor | Status.

**Filtros**:
- `q[competency_date_as_datetime_gteq/lteq]` — Data da competência (default hoje)
- `q[kind_in][]` — Tipo: **NFS-e / NFC-e**
- `q[origin_in][]` — Origem: **OS / Avulsa / Assinatura / Emissão antecipada**
- `q[user_status_search][]` — Status: **Aguardando emissão / Erro na emissão / Emitida / Aguardando cancelamento / Erro ao cancelar / Cancelada**
- `q[environment_in][]` — Ambiente: **Homologação / Produção**
- `q[issued_on_behalf_of_in][]` — Emissão para: **Cliente / Unidade** (NF intercompany franqueadora↔franquia)
- `q[customer_id_eq]` (remoto), `q[number_eq]`

**Ações**: **Novo NFS-e (Serviço)** → `/invoices/new?kind=nfs` (só NFS-e manual; NFC-e não tem botão); **Exportar XMLs** → `/invoices/export_xml` (lote p/ contador); Exportar xlsx/csv.

**Comportamentos**: badges de status (`label-success` Emitida, `label-danger` Erro na emissão, `label-info` NFS-e). Emissão é **assíncrona e falível** — fluxo com estados de fila e erro (inclusive no cancelamento). NF vinculada à OS ("OS 12450085") e emitida automaticamente por OS fechada; nº da NF só preenche quando a prefeitura confirma. Amostra do dia: 4 NFs, 3 emitidas + 1 erro.

---

## 5. Metas (`/goals`)

**Colunas**: Nome | Indicador | Ciclo | Descrição | Ativo.

**Filtros**: `q[active_true]`, `q[name_cont]`, `q[metric_eq]` — Indicador: **Agendamentos / Atendimentos / Faturamento - Bruto / Faturamento - Valor / Vendas**; `q[recurrence_type_eq]` — Ciclo: **Mensal / Semanal**.

**Ações**: Novo → `/goals/new`.

**Comportamentos**: meta = definição reutilizável (indicador × ciclo), sem valores na listagem (valores/faixas ficam no edit). Cadastradas na unidade: 3 metas mensais "Meta - GR3" (Faturamento Bruto, Agendamentos, Atendimentos). Distinção Faturamento **Bruto** vs **Valor** (antes/depois de descontos).

---

## 6. Comissões por meta (`/bonifications`)

**Colunas**: Nome | Tipo | Ativo. (Lista vazia na unidade atual — recurso não usado ainda.)

**Filtros**: `q[active_true]`, `q[name_cont]`, `q[kind_eq]` — Tipo, `q[salon_id_in][]` — **Unidades** (multi, ~25 unidades da rede), `q[user_id_in][]` — **Colaboradores** (multi, lista global).

**Ações**: dropdown **Novo** com 3 tipos:
- **Meta de Faturamento** → `/bonifications/new?kind=billing_revenue`
- **Meta de Produto** → `/bonifications/new?kind=product`
- **Meta de Serviço** → `/bonifications/new?kind=service`

**Comportamentos**: bonificação = comissão extra condicionada a atingimento de meta, parametrizável por unidade e por colaborador; 3 espécies (faturamento geral, venda de produto, venda de serviço). É a ponte metas→remuneração (gera lançamento na categoria "Bonificações" do contas a pagar).

---

## 7. Matriz de comissões (`/service_user_configs`)

**Estrutura**: tabela **serviço (linha) × colaborador (coluna)** da unidade ativa.
- Colunas: 13 profissionais da unidade Lourdes BH (inclui o recurso-agenda "Ultrassom - Lourdes BH" tratado como colaborador).
- Linhas: 87 serviços ativos (Aesthetic - *, Depil - *, Avaliação).
- Célula = `<input decimalmask>` só quando o colaborador **executa** aquele serviço (191 células com input de 1.131 possíveis; célula vazia = colaborador não habilitado no serviço).
- Cada célula carrega hidden `service_user_config[service_id][]` + `[user_id][]` + `[commission_text][]`; form único POST `/service_user_configs` (salva a matriz inteira).
- **Valores observados: só 1,00 (136 células) e 0,00 (55 células)** — percentual de comissão custom por serviço×pessoa (compatível com os lançamentos de R$ 0,32–1,20 por serviço no contas a pagar). É um **override** da comissão padrão ("comissões customizadas", diz o help).
- No snapshot todos os inputs estão `disabled` e não há botão de submit renderizado — a tela sai read-only para quem não tem a permissão de edição (form `data-form-disabled-value`).

---

## 8. Fornecedores (`/suppliers`)

**Colunas**: Nome | Documento | Telefone | **Estratégia (a pagar)** | Ativo.

**Filtros**: `q[active_true]`, `q[name_cont]`, `q[document_type_eq]` — Tipo de documento: **CPF / CNPJ / CDC / NIF / NIPC / Outro** (+ hidden `validate_document=true`), `q[document_id_cont]`, telefone decomposto: `q[phone_country_code_cont]` (DDI) + `q[phone_area_code_cont]` (DDD) + `q[phone_number_cont]`.

**Ações**: Novo → `/suppliers/new`; Exportar xlsx/csv; botão de engrenagem → `/field_setting/supplier` em modal (**campos customizáveis do cadastro**).

**Comportamentos (surpresa)**: os 9 fornecedores da unidade são **as próprias profissionais** — nome + badge `label-warning` com o colaborador vinculado, e "Documento" = **id interno do usuário** (27140 = Sarah, 28773 = Emilly — os mesmos user_ids da matriz de comissões). Ou seja, o BEMP auto-cria um fornecedor espelho de cada colaboradora para lançar as comissões no contas a pagar. **Estratégia (a pagar) = "Data da OS"** define a data prevista do lançamento (comissão vence na data da OS).

---

## 9. Planos de Assinatura (`/subscription_plans`)

**Colunas**: Nome | Valor da taxa de Adesão | Valor de mensalidade | Modo de Utilização | Tipo de comissão | Identificador.

**Filtros**: `q[active_true]`, `q[name_cont]`.

**Ações**: Novo → `/subscription_plans/new`.

**Comportamentos**: 6 planos = 3 tiers × 2 variantes de adesão:
- Bronze (Depil Total + Laser Estético): adesão 199,90 + mensal 99,90 / versão "sem adesão" 0,00 + 99,90
- Prata (Reju Facial + Laser Estético + Ultrassom): 199,90 + 149,90 / sem adesão
- Ouro (PDRN + Laser Estético + Ultrassom): 199,90 + 199,90 / sem adesão
- **Modo de Utilização = "Unidade que realiza a venda"** (existe o conceito de onde o assinante pode consumir — venda vs rede).
- **Tipo de comissão = "Comissão na mensalidade (Divisão por quantidade de serviços) [0,00%]"** — a comissão da recorrência é rateada entre os serviços consumidos no mês; percentual atual 0%.
- Identificador numérico exposto (id p/ integração/gateway de recorrência).

---

## 10. Dashboard Gerencial (`/dashboards/salon`)

**Filtros** (form POST `report_salon_dashboard_report`): **Período** (daterange; default = últimos 30 dias, 12/06→11/07) e **Unidade** (`merge_salon_ids[]`, multi-select com as ~25 unidades — permite **consolidar várias unidades** num só dashboard).

**13 painéis, todos lazy-load** (Stimulus `lazy-frame` → POST individual por gráfico; charts em **C3.js**):

| Painel | Endpoint | O que mede |
|---|---|---|
| Faturamento no período | `/dashboards/salon/daily_billing` | série diária de faturamento |
| Faturamento por produto | `.../billing_products` | ranking de produtos vendidos |
| Faturamento por grupo de produto | `.../billing_products_per_group` | agregado por grupo de produto |
| Faturamento de serviços | `.../billing_services` | serviços avulsos |
| Faturamento por grupo de serviços | `.../billing_services_per_group` | agregado por grupo (Depil/Aesthetic...) |
| Faturamento de serviços (pacotes) | `.../billing_packages_services` | serviços vendidos via pacote |
| Faturamento de serviços (total com pacotes) | `.../billing_all_services` | avulso + pacote consolidado |
| Faturamento por forma de pagamento | `.../billing_payment_methods` | mix cartão/pix/dinheiro/parcelas |
| Cancelamentos por motivo | `.../cancellations_by_reason` | quebra por motivo de cancelamento |
| Taxa de retorno de clientes | `.../customers_loyalty` | recorrência/retenção de clientes |
| Agendamentos por origem | `.../schedules_by_origin` | canal de origem dos agendamentos |
| Aderência ao fidelidade | `.../customers_rewards` | adesão ao programa de fidelidade |
| Agendamentos por dia | `.../schedules_by_week_day` | distribuição por dia da semana |

Não há KPI-cards numéricos estáticos no HTML — tudo chega via os 13 frames assíncronos.

---

## Insights transversais (p/ a migração Laser&Co)

1. **Cadeia financeira fechada**: OS fechada → gera comissão (contas a pagar, categoria "Comissões", fornecedor = espelho da colaboradora, vencimento = data da OS) → gera NF automática (origem OS) → taxa da forma de pagamento vira despesa "Taxa meio de pagamento". Baixa é manual/em massa.
2. **Formas de pagamento = grade de taxas materializada** (parcela × bandeira × adquirente × canal), não uma tabela de taxas relacional — 125 registros para expressar o custo real de cada recebimento.
3. **Comissão em 3 camadas**: padrão → override por serviço×colaborador (matriz) → bônus por meta (bonifications).
4. **Multi-unidade em todo lugar**: bonificações filtram por unidades+colaboradores globais; dashboard consolida N unidades via `merge_salon_ids`.
5. Tudo exportável (xlsx/csv) e tudo Ransack — o "relatório" primário é a própria listagem filtrada.
