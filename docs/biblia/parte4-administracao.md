# Módulo 4 — Administração (Financeiro Franqueadora, SAC, Expansão, Jurídico, Auditoria)

> Documento oficial de homologação. Fonte: leitura direta do código em `src/app/(app)/`, `src/components/`, `src/lib/` e `scripts/migrations/` (não do material de apoio). Hierarquia canônica em `src/lib/menu.ts`, seção `Administração`. Datas de referência das validações citadas nos comentários do código (02–05/07/2026).

## Convenções e RBAC (válido para todo o módulo)

- **Estado FUNCIONAL** segue a convenção do projeto: rota presente em `ROTAS_FUNCIONAIS` (menu.ts) = tela "acesa" (funcional). Todas as 30 folhas deste módulo estão listadas em `ROTAS_FUNCIONAIS` — a verificação abaixo confirma, folha a folha, se há query/mutação Supabase real ou apenas UI/estado-vazio.
- **Dois níveis de RBAC**: (1) **visibilidade de menu** por `recurso` (`Sidebar.tsx`: `perm` com sufixo `.` casa por prefixo `recursos.some(startsWith)`, senão match exato); (2) **gate de ação** nas server actions, quase sempre por **papel** via `temPapel(papel, ...aceitos)` (`src/lib/rbac.ts`), onde `admin_geral` (`PAPEL_ADMIN`) **sempre passa**.
- `recursos` derivam de `usuario_cargos → cargo_permissoes → permissoes` (`session.ts`). `admin_geral` tem `recursos=[]` mas passa por bypass `isAdmin`.
- **Papéis (enum) relevantes**: `admin_geral`, `gestor`, `financeiro`, `sac`. **Cargos SAC**: `atendente_sac`, `supervisor_sac`, `consulta_sac` (resolvem só para recursos `sac.*`).
- **Contagem de telas do módulo**: Financeiro 9 (1 componente `FinanceiroTabs`, 9 abas/rotas) · SAC 11 · Expansão 7 · Implantação 1 · Jurídico 1 · Auditoria 1 = **30 folhas**.

---

# Submódulo A — Financeiro Franqueadora (coração do sistema)

**Arquitetura (verificada em `src/lib/financeiro-ledger.ts` + `scripts/migrations/financeiro-razao.sql`).** O financeiro é um **serviço central com razão único**. Existe uma **única porta de escrita** — `postLancamento()` / `repostLancamento()` — que grava na tabela-razão `fin_lancamento`. Todas as telas (DRE, Fluxo de Caixa, Contas a Receber/Pagar) **derivam** do razão via RPCs; não guardam valor próprio. Assim "o número bate igual em toda tela".

- **Roteamento**: as 9 rotas (`/financeiro`, `/financeiro/dre`, `/calc`, `/receber`, `/pagar`, `/conciliacao`, `/royalties`, `/cobranca`, `/config`) são **wrappers triviais** que renderizam o mesmo `FinanceiroPage` (`src/app/(app)/financeiro/page.tsx`) com `tab` diferente. A URL é preservada (o item do menu "acende"). O componente cliente é `src/components/financeiro/FinanceiroTabs.tsx` (~135 KB, 9 abas).
- **RBAC**: menu perm `financeiro.`; **gate de página** `temPapel(ctx.papel, 'financeiro', 'gestor')` + bypass `admin_geral`. Papéis com acesso: **`admin_geral`, `financeiro`, `gestor`**. Todas as server actions repetem o gate `temPapel(op.papel, 'financeiro','gestor')` (`PAPEIS_FIN`).
- **Escopo por unidade**: `activeUnitId` filtra; correção do bug 03/07 — `activeUnitName` nunca é null ("Todas as unidades"), então o nome só é usado como filtro (`fin_contas_pagar.escopo`, `fin_conciliacao.unidade_nome`) quando há `activeUnitId` real.

## Tabelas Supabase (migration `financeiro-razao.sql`)

| Tabela | Papel |
|---|---|
| `fin_lancamento` | **Razão único** (fonte da verdade). Colunas: `natureza` (receita/despesa/transferencia), `competencia` (1º dia do mês do fato), `data_prevista`, `data_caixa`, `valor`, `origem` (bemp/royalty/sac/folha/compra/taxa_cartao/manual/despesa_config), `origem_ref`, `idem_key` (única), `status` (previsto/realizado/conciliado/cancelado/suspenso), `centro_custo_id`, `plano_conta_id`. Índice único em `idem_key` (idempotência). RLS: leitura autenticado; **escrita só via service role** (`adminClient`). |
| `centro_custo` | Um por unidade + um `tipo='rede'` (Rede/Franqueadora). |
| `plano_conta` | Plano de contas (DRE). Seed curado: receitas 3.1.01–3.1.06, custos/despesas 4.1.01–4.1.05, 4.2.01–4.2.05, 4.2.99. `codigo` = conta do sistema (protegida); categorias criadas pelo usuário têm `codigo=null`. |
| `fin_recebiveis` | Sub-livro "A Receber" (Royalties, Fundo, etc.). Campo `lancamento_id` liga ao razão (a baixa concilia o caixa). |
| `fin_contas_pagar` | Sub-livro "A Pagar" (despesas manuais). |
| `fin_conciliacao` | Extrato importado × esperado × recebido. |
| `fin_config` | Parâmetros (royalty %, fundo %, venc_dia, imposto/comissão/taxa, desconto automático, banco, adquirentes, categorias, régua). Upsert por `empresa_id`. |
| `unidades` (colunas add) | `royalty_pct_override`, `venc_dia_override`, `tipo_loja` ('propria'\|'franquia'), `bemp_salon_id`. |

## RPCs (todas em `financeiro-razao.sql`)

- **`fin_faturamento_por_salon(ini,fim)`** — faturamento real do BEMP por salon = `sum(total − desconto)` de `bemp_billings` (base líquida, definição do CEO 02/07).
- **`fin_faturamento_por_salon_entidade(ini,fim)`** — idem, quebrado por `entity` (packages/services/products/subscriptions) → conta de receita.
- **`fin_ultima_competencia()`** — default do DRE/Fluxo. Retorna o último mês **com RECEITA** apurada `<= mês atual` (fix 05/07: reembolso do SAC em mês sem faturamento abria DRE vazio); fallbacks encadeados.
- **`fin_escopo_ok(escopo, cc_tipo, tipo_loja)`** — filtro de escopo **composto por vírgula**. `'franqueadora,proprias'` = franqueadora + lojas próprias, **sem franquias** (a receita da franquia não é dinheiro da franqueadora; só o royalty é). Invariante: `franqueadora+proprias+franquias == consolidado` sem dupla contagem. Lançamento sem centro cai no balde `franquias`.
- **`fin_dre(ini,fim,escopo,unidade)`** — DRE por competência (regime de exercício: suspenso permanece, cancelado sai).
- **`fin_dre_anual(ano,escopo,unidade)`** — 12 meses em colunas.
- **`fin_fluxo(ini,fim,escopo,unidade)`** — série mensal por data efetiva (`coalesce(data_caixa, data_prevista, competencia)`); suspenso e cancelado NÃO andam o caixa.
- **`fin_fluxo_resumo(escopo,unidade)`** — KPIs: a_receber (receita previsto), recebido (realizado/conciliado), vencido (previsto com data<hoje), a_pagar, pago.
- **`fin_fluxo_composicao(escopo,unidade)`** — "a receber" por conta do plano.

## Produtores (server actions que escrevem no razão — `financeiro/actions.ts`)

- **`apurarFaturamentoBemp(ano,mes)`** — apura a RECEITA real do BEMP por unidade e tipo de venda (`CONTA_POR_ENTIDADE`); semântica de **substituição** (`repostLancamento('bemp',...)` — apaga a competência e regrava, reapurável). Avisa unidades sem centro de custo.
- **`gerarRoyaltiesDoFaturamento(ano,mes)`** — o núcleo. Faturamento por salon (RPC) × % → cria 2 recebíveis (Royalties, Fundo) por franquia com faturamento, e 4 eventos no razão por unidade (receita da rede + despesa da unidade, para royalty e fundo). Regras: **só FRANQUIA paga** (`tipo_loja != 'propria'`); **% padrão 10** (`fin_config.royalty_pct`), override por unidade (`royalty_pct_override`); **fundo hoje = 0** (não cobrado, validação CEO 02/07); vencimento dia X (`venc_dia`/override) do mês seguinte; **desconto automático**: faturamento `< teto (80k)` E sem recebível atrasado → royalty cai por `desc_pct` (ex.: 10%→5%). Idempotente por `(unidade_id, categoria, competência)`; re-vincula recebíveis ao razão após repost.
- **`apurarDespesasDaCompetencia(ano,mes)`** — apura imposto/comissão/taxa de cartão sobre a receita real já no razão. **Comissão vem da Matriz de Comissões** (`matriz_comissoes`, média das taxas efetivas por cargo; fallback `fin_config.comissao_pct`). Base de comissão configurável (`COMISSAO_BASE_OPCOES`). Substituição (`repostLancamento('despesa_config',...)`).
- **`novaDespesa`, `importarRecebiveis`, `importarDespesas`** — lançam manual (conta pelo nome da categoria; fallback 4.2.99).

O `RoyaltiesTab` dispara os 3 produtores em sequência (1 clique "Apurar mês"): faturamento → royalties → despesas.

---

## A.1 — Fluxo de Caixa · `/financeiro` (tab `fluxo`)

1. **Rota/perm**: `/financeiro`, menu `financeiro.` · gate `admin_geral`/`financeiro`/`gestor`.
2. **O que faz**: visão de caixa derivada do razão — série de 6 meses (entradas×saídas), KPIs por status e composição do "a receber", com seletor de escopo (franqueadora/próprias/franquias/unidade).
3. **Telas**: `FluxoTab` — cards KPI (a receber, recebido, vencido, a pagar, pago), gráfico de barras 6 meses, composição por conta, projeção de caixa (`ProjecaoCaixa` usa recebíveis+contas a pagar+saldo realizado). Seletor de escopo refaz via `fluxoDoRazao` (server action).
4. **Backend**: RPCs `fin_fluxo` + `fin_fluxo_resumo` + `fin_fluxo_composicao`; `normalizaFluxo`/`janelaFluxo` (lib pura). Default de escopo: `franqueadora,proprias`.
5. **Integrações**: alimentado indiretamente pelo BEMP (via apuração) e royalties.
6. **Estado real**: **FUNCIONAL.** Evidência: `page.tsx` chama as 3 RPCs no load; suspenso fora do caixa (RPC `status not in ('cancelado','suspenso')`).
7. **Req p/ 100%**: nada crítico (depende de as apurações terem sido rodadas na competência).
8. **Esforço**: 0.

## A.2 — DRE · `/financeiro/dre`

1. **Rota/perm**: idem. 2. **O que faz**: DRE derivado do razão por competência, com escopo (consolidado/franqueadora/unidades/próprias/franquias, combináveis por vírgula) e **por loja**, mais **visão anual** (12 meses).
3. **Telas**: `DreTab` — seletor mês + seletor de escopo (`EscopoPicker` com checkboxes) + seletor de unidade + toggle anual; tabela por grupo/conta/natureza.
4. **Backend**: `fin_dre` (mês) e `fin_dre_anual` (ano) via `dreDaCompetencia`/`dreAnual`. Escopo validado por `escopoValido` (whitelist DRE_ESCOPOS). Default do mês = `fin_ultima_competencia`; default de escopo `franqueadora,proprias`.
5. **Integrações**: —. 6. **Estado real**: **FUNCIONAL.** Evidência: `fin_dre` join `plano_conta`+`centro_custo`+`unidades`, filtro `fin_escopo_ok`, exclui `cancelado`; dados reais mar/abr apurados.
7. **Req p/ 100%**: nada crítico. 8. **Esforço**: 0.

## A.3 — Cálculos · `/financeiro/calc`

1. **Rota/perm**: idem. 2. **O que faz**: atualização de débitos em atraso — correção monetária por índice oficial + multa + juros de mora.
3. **Telas**: `CalcTab` — parâmetros (índice, multa %, juros % a.m., data, modo nominal/acréscimos); tabela dos recebíveis atrasados com Original/Correção/Multa/Juros/Atualizado + totais.
4. **Backend**: importa automaticamente recebíveis `status='atrasado'`. Correção = `valor × (acum12m/100) × dias/365`. **É uma calculadora (read-only)** — não persiste o resultado no razão.
5. **Integrações**: **Banco Central (API SGS)** REAL — `src/lib/indices-bcb.ts`, séries 189 IGP-M, 433 IPCA, 188 INPC, 432 SELIC, 4389 CDI, acumulado 12m, cache 6h.
6. **Estado real**: **FUNCIONAL** (com degradação honesta: se o BCB estiver indisponível, desativa a correção e mantém multa+juros).
7. **Req p/ 100%**: opcional — botão para lançar os acréscimos calculados de volta no recebível/razão (hoje só exibe). 8. **Esforço**: 0,5 dia (persistir acréscimos, se desejado).

## A.4 — Contas a Receber (Franqueadora) · `/financeiro/receber`

1. **Rota/perm**: idem. 2. **O que faz**: sub-livro de recebíveis da franqueadora (royalties, taxas, locações) com ações por linha e "Nova conta a receber".
3. **Telas**: `ReceberTab` — tabela com filtros (`FiltroFinModal`: período/pessoa/descrição/valor), modal `NovaReceitaModal`, importação de planilha (`.xlsx`/`.csv` via SheetJS + modelo), ações por linha.
4. **Backend/ações**: `fin_recebiveis` (escopado por unidade). Ações: `gerarBoleto`, `darBaixaRecebivel` (exige boleto; concilia o razão via `conciliarLancamento`), `escalarJuridico` (grava `jur_id`), `notificarCobranca`, `suspenderLancamento('receber')` (espelha no razão como `suspenso`, fora do fluxo). **Atraso derivado em read-time** (fix QA 05/07): `aberto` + vencido = `atrasado` (auto-corrige sem cron). `importarRecebiveis` lança no razão (receita prevista, centro rede).
5. **Integrações**: boleto/banco (ver estado). 6. **Estado real**: **FUNCIONAL** para o ciclo interno (lançar/baixar/suspender/escalar); **boleto é simulado** (ver A.7).
7. **Req p/ 100%**: baixa por retorno bancário real. 8. **Esforço**: coberto por A.7.

## A.5 — Contas a Pagar (Franqueadora) · `/financeiro/pagar`

1. **Rota/perm**: idem. 2. **O que faz**: sub-livro de despesas da franqueadora com prioridade, pagamento e "Nova despesa".
3. **Telas**: `PagarTab` — tabela + filtros, `NovaDespesaModal` (categoria vinda do plano de contas), importação de planilha, ações por linha.
4. **Backend/ações**: `fin_contas_pagar` (escopado por `escopo`=nome da unidade). Ações: `pagarDespesa` (concilia despesa manual no razão), `definirPrioridade` (alta/média/baixa), `novaDespesa` (lança no razão pela categoria — conta de mesmo nome no plano, fallback 4.2.99), `suspenderLancamento('pagar')`. `importarDespesas` idem.
5. **Integrações**: reembolsos do SAC também aparecem aqui (via `lancamentos_financeiros` — financeiro por UNIDADE — e razão da franqueadora conta 4.2.05). 6. **Estado real**: **FUNCIONAL.** 7. **Req p/ 100%**: nada crítico. 8. **Esforço**: 0.

## A.6 — Conciliação Bancária · `/financeiro/conciliacao`

1. **Rota/perm**: idem. 2. **O que faz**: importa extrato (qualquer banco) e cruza esperado × recebido, marcando divergências.
3. **Telas**: `ConciliacaoTab` — tabela, botão "Rodar conciliação", `ImportExtratoModal` (usuário vincula colunas da planilha aos campos).
4. **Backend/ações**: `importarExtrato` (grava `fin_conciliacao` status `pendente`, via `adminClient`), `rodarConciliacao` (cruzamento linha a linha: `esperado` informado ou `venda×(1−taxa%)`; tolerância R$0,05; marca `ok`/`divergencia`).
5. **Integrações**: **importação MANUAL de planilha** — não há feed OFX/Open Finance automático.
6. **Estado real**: **PARCIAL.** Evidência: matemática de conciliação é real, mas a origem do extrato é upload manual; sem integração bancária automática.
7. **Req p/ 100%**: conector bancário (OFX/CNAB/Open Finance) para puxar o extrato automaticamente. 8. **Esforço**: 3–5 dias (depende do banco/credenciais — decisão + integração).

## A.7 — Automação de Royalties · `/financeiro/royalties`

1. **Rota/perm**: idem. 2. **O que faz**: pipeline de cobrança de royalties (sempre % do faturamento bruto, venc. dia X do mês seguinte): apura do BEMP, gera boleto, lança crédito, envia ao franqueado, baixa no retorno, escala atraso ao Jurídico.
3. **Telas**: `RoyaltiesTab` — cards (banco, competência, total royalties), pipeline visual de 6 passos, **botão "Apurar mês (faturamento + royalties)"** (dispara `apurarFaturamentoBemp` → `gerarRoyaltiesDoFaturamento` → `apurarDespesasDaCompetencia`), "Gerar cobrança" (`gerarCobrancaRoyalties`), "Processar retorno bancário" (`processarRetornoBancario`), "Rodar régua de atraso" (`rodarReguaAtraso`), console de log.
4. **Backend**: BEMP `fin_faturamento_por_salon`; royalties/fundo/despesas no razão (ver Produtores).
5. **Integrações**: **BEMP (real)** para faturamento; **boleto e retorno bancário são SIMULADOS**.
6. **Estado real**: **PARCIAL — apuração FUNCIONAL, cobrança bancária STUB.** Evidências: (a) `finBoletoNum()` em `src/lib/financeiro.ts` gera um **número de boleto formatado sinteticamente** (determinístico por seq), sem registro no banco; (b) banner amarelo no próprio `RoyaltiesTab`: "Este módulo **simula** o ciclo para validação do fluxo" (integração real por API/Open Finance/CNAB no servidor); (c) `processarRetornoBancario` marca `pago` boletos em aberto sem atraso, sem retorno bancário real; (d) `gerarCobrancaRoyalties` gera boletos sintéticos e loga "Enviado por e-mail e WhatsApp" **sem envio real**.
7. **Req p/ 100%**: integração bancária de registro/baixa de boleto (API/CNAB) + envio real e-mail/WhatsApp da cobrança. 8. **Esforço**: 4–6 dias (boleto/banco) + 1 dia (envio) — inclui decisão de banco/credenciais.

## A.8 — Cobrança & Jurídico · `/financeiro/cobranca`

1. **Rota/perm**: idem. 2. **O que faz**: régua de cobrança por atraso; a partir de D+10 encaminha ao Jurídico.
3. **Telas**: `CobrancaTab` — card de inadimplência (unidades/valor), tabela de atrasados (contato via `finFranqEmail` por slug, próxima ação da régua, status), ações "Notificar"/"Jurídico", tabela da régua (configurável).
4. **Backend/ações**: recebíveis `status='atrasado'`; `proximoPassoRegua` (lib) sobre `config.regua`; `notificarCobranca` (**placeholder** — comentário no código: "Integração real de e-mail/WhatsApp acontece no servidor (placeholder honesto)"); `escalarJuridico`/`rodarReguaAtraso` (só gravam `jur_id`).
5. **Integrações**: **régua/notificação são STUB** (nenhum envio real; escalonar = flag `jur_id`). Cruza com o módulo Jurídico (que tem `juridico_notificacoes` reais — ver Submódulo D; hoje não há gatilho automático ligando a régua àquela tabela).
6. **Estado real**: **PARCIAL.** Evidência: a régua é configurável e a UI mostra o próximo passo real; mas notificação não envia e o "acionar Jurídico" só marca `jur_id` (não cria `juridico_notificacoes`).
7. **Req p/ 100%**: envio real (e-mail/WhatsApp) + gatilho automático régua→`juridico_notificacoes` + job/cron que rode a régua diariamente. 8. **Esforço**: 2–3 dias.

## A.9 — Configurações · `/financeiro/config`

1. **Rota/perm**: idem. 2. **O que faz**: todos os parâmetros do financeiro da franqueadora + plano de contas + royalty por unidade.
3. **Telas**: `ConfigTab` — seções: **Royalties & cobrança** (royalty %, fundo %, dia venc., **desconto automático** teto+%), **Banco de cobrança**, **Regras de despesa** (imposto %+regime, comissão %+base, taxa cartão %), **Adquirentes** (taxas deb/cred/parc/pix/prazo, add/remove), **Categorias de recebíveis** (Royalties protegida), **Régua de cobrança** (passos editáveis add/remove), **Plano de contas** (criar/ativar/excluir categorias), **Royalty por unidade** (override % + venc + tipo_loja própria/franquia).
4. **Backend/ações**: `salvarConfig` (upsert `fin_config`, validações: venc 1–28, % ≥0 ≤100); `criarContaPlano`/`setContaPlanoAtivo`/`removerContaPlano` (categoria do sistema com código não exclui; categoria com lançamentos no razão não exclui — só desativa); `salvarRoyaltyUnidade` (override por unidade, vale na próxima apuração).
5. **Integrações**: —. 6. **Estado real**: **FUNCIONAL.** Evidência: upsert real + CRUD do plano de contas + override por unidade. 7. **Req p/ 100%**: máscara/cofre real das credenciais do banco (hoje mascaradas na UI; integração real seria server-side). 8. **Esforço**: 0 (fora a integração bancária de A.7).

---

# Submódulo B — SAC (11 folhas + camada de integração) — EM PRODUÇÃO REAL

**Escopo centralizado (verificado):** `session.ts` — se `papel === 'sac'`, `activeUnitId` é forçado a `null` e `activeUnitName='Franqueadora'`. Leituras usam RLS do usuário; webhook/ingest/buscar-cliente usam `adminClient`.

**RBAC SAC (verificado):** menu grupo `perm:'sac.'` (prefixo); leaf **Canais** sobrescreve `perm:'sac.canal'` (match exato → concedido a todos os cargos SAC). Papel `'sac'` sozinho NÃO dá acesso — precisa do vínculo de **cargo** (`atendente_sac`/`supervisor_sac`/`consulta_sac`). `consulta_sac` vê mas fica fora de distribuição/ranking. **Gate de ações é por papel** (`temPapel(papel,'sac','gestor')`, admin sempre) — divergência com a nota "gate por recurso": no código as *actions* gateiam por papel; só a *visibilidade de menu* é por recurso. **Só `/sac/relatorios` tem gate de página** (`temPapel('sac','gestor','financeiro')`); as outras 10 páginas renderizam para qualquer logado que chegue à rota (proteção real = menu escondido + RLS + gate nas mutations).

## B.1 Dashboard — `/sac`
- **Perm**: `sac.` (atendente/supervisor/consulta/gestor/admin). Sem gate de página.
- **Faz**: painel (6 KPIs + gráficos por canal/motivo/fase + reembolsos + chamados recentes) com filtro de período e multi-atendente.
- **Telas**: `SacDashFiltros`, `RelKpis`, 4× `BarChart`, tabela "Chamados recentes".
- **Backend**: `sac_tickets` (varredura paginada 1000/pág, tabulada em JS — evita ~33 counts), `sac_motivos`, `listAtendentesSac`. Tempo médio de resolução = média real `(concluido_em − criado_em)` (retorna vazio se nenhum). SLA% = `(total − sla_violado)/total`.
- **Estado**: **FUNCIONAL.** Ressalva: `sla_violado` é **lido mas nunca escrito** por nenhuma action → "Em atraso"/"Taxa SLA" dependem de um job de SLA inexistente (provável sempre 0/100%).
- **Req/Esforço**: job que marque `sla_violado` conforme `slaHoras` da config — **0,5 dia**.

## B.2 Chamados — `/sac/chamados`
- **Perm**: `sac.`; mutations `temPapel('sac','gestor')`.
- **Faz**: lista/busca/pagina (30/pág) e CRUD de chamados; ponto de entrada "leads do site → chamado".
- **Telas**: `SacFiltros`, modal `NovoChamado`, `ChamadosTabela`, paginação.
- **Backend**: `sac_tickets` (busca `or` em nome/protocolo/cpf/telefone/motivo/canal/unidade). Actions `criarChamado`/`atualizarChamado` (coerência fase↔status; 'Concluído'→resolvido+`concluido_em`). **Dívida de schema**: tipo (Franquia/Própria) e data-reclamação não têm coluna → gravados no prefixo de `observacoes` (`montarObs`/`lerObsMeta`).
- **Integração**: `ingestSacBestEffort()` no load (throttle 1×/min) — dispara ingest site→chamado sem depender do cron.
- **Estado**: **FUNCIONAL.** **Req/Esforço**: colunas próprias tipo/data + persistir `sla_violado` — **1 dia**.

## B.3 Kanban — `/sac/kanban`
- **Perm**: `sac.`; mutations `temPapel('sac','gestor')`.
- **Faz**: board por fase (7 colunas), mover, e gerar pedido de cancelamento/reembolso.
- **Telas**: `SacKanban` (7 colunas, 120 cards/coluna, totais reais).
- **Backend**: `sac_tickets` por fase (limit 120) + varredura paginada de `fase` p/ totais. Actions `moverTicketFase` (confere unidade via `scopeUnidade` antes de escrever — não confia só na RLS); `gerarPedidoCancelamento` (motivo=Reembolso, fase 'Em pagamento', grava `valor_devolucao`/`multa_aplicada`; **não** lança no Financeiro — isso é `solicitarReembolso`).
- **Estado**: **FUNCIONAL.** **Esforço**: 0.

## B.4 Conversa (Triagem) — `/sac/triagem` ⚠ EM PRODUÇÃO (IA + humano)
- **Perm**: `sac.`; toda action passa por `guardTriagem` = `temPapel('sac','gestor')`.
- **Faz**: inbox WhatsApp do SAC — recebe (webhook), responde, transfere, assume, abre chamado, notas, respostas rápidas, inicia conversa. **Coração do módulo em produção.**
- **Telas/modais**: `TriagemWhatsapp` — lista (Todas/Minhas/Fila com counts), fio de mensagens, notas internas, painel do cliente (auto-import por CPF/telefone), "Nova conversa", respostas rápidas (barra `/`), status.
- **Backend**: `sac_whatsapp_chats`, `sac_whatsapp_mensagens`, `sac_whatsapp_notas`, `sac_respostas_rapidas`, `sac_tickets`, `sac_motivos`. Escopo por unidade **defensivo** (fallback se coluna não existir). Msgs buscadas DESC+reverse (corte ~1000 do PostgREST). Actions: `responderConversa`/`enviarMidia` (envia + grava + assume + `bot_ativo=false`), `assumirConversa`, `devolverConversa`, `transferirConversa`, `marcarLido`, `reativarIA`, `adicionarNota`, `alterarStatusConversa`, `descartarConversa`, `abrirChamadoDaConversa` (valida CPF 11díg/email, vincula `ticket_id`), `iniciarConversa`, `buscarClientePorContato` (**adminClient**, casa por CPF/telefone; agrega agendamentos + `bemp_billings` total gasto), CRUD respostas rápidas.
- **Integrações**: `@/lib/uazapi` (`sendText`/`sendMedia`/`normTel`), `@/lib/sac-midia` (bucket `sac-midia`). Roteamento de canal de envio prioriza canal de origem → canal da unidade → qualquer "laser" conectado (evita responder unidade B pelo número A). Avisa restrição 463 (iniciar conversa com número novo).
- **Estado**: **FUNCIONAL / EM PRODUÇÃO.** **Req/Esforço**: confirmar coluna `unidade_id` no schema de `sac_whatsapp_chats` (hoje defensivo) + realtime/poll (hoje `revalidatePath`) — **1–1,5 dia**.

## B.5 Canais — `/sac/canais`
- **Perm**: override `sac.canal` (todos os cargos SAC). Admin vê todas as instâncias UAZAPI; não-admin só as vinculadas.
- **Faz**: gerencia canais WhatsApp **centrais** (escopo 'geral'/franqueadora).
- **Telas**: `CanaisManager` (modo central), cards com status de conexão + restrição de envio (463).
- **Backend**: `canais_whatsapp` (`escopo='geral'`; colunas instancia_nome/escopo/unidade_id/rotulo/delay_min/delay_max/atendente_id), `listAtendentesSac`. Só instâncias com nome `/laser/i`.
- **Integrações**: UAZAPI `listInstances`, `limitesEnvio` (restrição 463 `WHATSAPP_REACHOUT_TIMELOCK`), `uazapiConfigurado()` (exige envs). Vínculo `atendente_id` sustenta o "número próprio da atendente" do webhook.
- **Estado**: **FUNCIONAL (depende de envs UAZAPI de produção).** **Esforço**: 0,5 dia (validar envs/mutations do `CanaisManager`).

## B.6 Relatórios — `/sac/relatorios`
- **Perm**: `sac.` + **gate de página real** `temPapel('sac','gestor','financeiro')` (única leaf com bloqueio no load).
- **Faz**: relatórios agregados (KPIs, breakdown canal/fase/prioridade/motivo/unidade/atendente, ranking por SLA, reembolsos) com export CSV.
- **Backend**: `sac_tickets` (varredura paginada tabulada, evita 60+ counts), `sac_motivos`, `listAtendentesSac`. SLA cumprido = `(total−violados)/total`.
- **Estado**: **FUNCIONAL** (depende de `sla_violado` real). **Esforço**: 0 (herda job SLA).

## B.7 Pagamentos — `/sac/pagamentos`
- **Perm**: `sac.`; `podeBaixar`=admin||`financeiro`; `podeValidar`=admin||`gestor`||`financeiro`.
- **Faz**: espelho SAC↔Financeiro — reembolsos (Contas a Pagar) e acordos parcelados, com validação do gestor e baixa que fecha o chamado.
- **Telas**: `AcordosSac` (+modal `NovoAcordo`), `PagamentosSac`.
- **Backend**: `lancamentos_financeiros` (`ilike 'Reembolso SAC%'`), `sac_acordos`+embed `sac_parcelas`, `sac_tickets`. Actions (`sac/actions.ts`): `solicitarReembolso` (despesa em `lancamentos_financeiros`; guard anti-duplicidade por `origem_ref_id`; move ticket 'Em pagamento'; **também posta no RAZÃO** `fin_lancamento` conta `4.2.05`, `idemKey sac:<ticket>:reembolso`, status 'previsto'); `criarAcordo`/`criarAcordoAvulso` (parcelas 1–24, regra dia-15 `primeiroPagamentoValido`, status 'aguardando_ok'); `validarAcordo` (gera N parcelas como lançamentos pendentes). `financeiro/actions-sac.ts`: `darBaixaLancamento` (paga; espelha de volta — parcela paga → acordo 'pago' → ticket 'Concluído' + `conciliarReembolsoRazao` marca `fin_lancamento` 'conciliado'), `receberLancamento`.
- **Integração**: ponte SAC→Financeiro por unidade (`lancamentos_financeiros`) + razão franqueadora (`fin_lancamento`).
- **Estado**: **FUNCIONAL** (fluxo criar→validar→baixar→conciliar→fechar, com idempotência). **Req/Esforço**: categoria dedicada "Reembolso SAC" no plano de contas (hoje fallback null gracioso) — **0,5 dia**.

## B.8 Atendentes — `/sac/atendentes`
- **Perm**: `sac.`; `podeCriar`=**admin only**; `podeDistribuir`=admin||`sac`||`gestor`.
- **Faz**: cria login de atendente, liga/desliga presença, troca cargo, ativa/desativa, distribui e reequilibra a fila.
- **Telas**: `AtendentesManager` (grid com carga/KPIs/prêmio/presença/cargo, filas não atribuídas, distribuir/reequilibrar).
- **Backend**: `listAtendentesSac`, `perfis_usuario` (`sac_online`), `usuario_cargos`+`cargos`, `sac_premiacao_config.pesos`, contagens reais em `sac_tickets`/`sac_whatsapp_chats`. Actions (todas com **audit_log**): `criarAcessoAtendente` (**adminClient** `auth.admin.createUser` papel 'sac' + upsert perfil + vincula cargo via `usuario_cargos`→`cargos`; sem cargo → recursos=[] sem acesso), `definirPresencaSac`/`definirPresencaAtendente`, `definirCargoAtendente` (menu só reflete após novo login — cache RBAC), `setAtendenteAtivo` (não pode auto-desativar), `distribuirFila` (só ONLINE, menos carregado, escopo unidade), `reequilibrarBacklog`.
- **Integração**: Supabase Auth Admin (cria login); base da auto-distribuição do webhook (`sac_online`).
- **Estado**: **FUNCIONAL** ("Novo atendente cria papel/cargo já cabeado" confirmado). **Req/Esforço**: invalidar cache de sessão ao trocar cargo (hoje exige re-login) — **0,5 dia**.

## B.9 Ranking — `/sac/ranking`
- **Perm**: `sac.`. Sem gate de página.
- **Faz**: ranking de premiação monetária por atendente (período/unidade) + "Destaque do mês".
- **Backend**: `sac_premiacao_config.pesos`, `listAtendentesSac` (exclui consulta), varredura `sac_tickets` por `atribuido_para`, `premioValor`/`PREM_DEFAULT`.
- **Estado**: **PARCIAL.** Evidência: **vendas=0, pacotes=0, CSAT=0 hardcoded** (sem fonte real ligada ao atendente); prêmio calcula só o mensurável (atend./finaliz./reversão/SLA); rótulo é honesto.
- **Req/Esforço**: ligar vendas/pacotes/CSAT ao `atribuido_para` — **2 dias**.

## B.10 Importar Leads — `/sac/importar`
- **Perm**: `sac.`; `importarTickets` `temPapel('sac','gestor')`.
- **Faz**: importa reclamações de planilha (Reclame Aqui/Procon/Sults/CSV) como chamados em lote (até 5000).
- **Backend**: `sac_tickets` insert em lotes de 500, `unidades`/`empresas`, `montarObs`; canal normalizado contra CHECK (fora→'Manual'); valida unidade permitida.
- **Estado**: **FUNCIONAL.** **Esforço**: 0.

## B.11 Configurações — `/sac/config`
- **Perm**: `sac.`; `podeEditar`=admin||`sac`||`gestor`; actions `temPapel('sac','gestor')`.
- **Faz**: catálogos (motivos, tags), SLA em horas, pesos de premiação.
- **Backend**: `sac_motivos`, `sac_tags`, `sac_premiacao_config.pesos` (9 pesos + `slaHoras`, default 48h). Actions: CRUD motivo/tag, `salvarPremiacaoConfig`, `salvarSlaHoras` (1–1000h).
- **Estado**: **FUNCIONAL.** Ressalva: `slaHoras` gravado/lido mas nenhum código escreve `sac_tickets.sla_violado` → SLA configurado ainda não é aplicado (falta o job). **Esforço**: incluído em B.1.

## B.INFRA — Camada de integração SAC

- **UAZAPI** (`src/lib/uazapi.ts`, uazapiGO v2): envs `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`, `UAZAPI_TOKEN`. `listInstances`/`sendText`/`sendMedia`/`downloadMessage`/`limitesEnvio` (restrição 463). **LIVE.** Nº `5519997565531` restrito p/ iniciar conversas até 04/07 (463) — tratado no código.
- **Webhook de entrada** (`src/app/api/webhooks/uazapi/route.ts`): **EM PRODUÇÃO.** Auth por `UAZAPI_WEBHOOK_SECRET`/`UAZAPI_TOKEN` (exigido em prod). Grava chats+mensagens (dedup por `wa_id`), resolve canal→unidade/atendente, re-hospeda mídia, atualiza status de conexão. Insert defensivo.
- **IA de atendimento** (`src/lib/ia.ts`): **LIVE se `OPENROUTER_API_KEY`/`AGENTE_IA_API_KEY`**. Provider **OpenRouter** (compat. OpenAI), default `openai/gpt-4o-mini`. `gerarRespostaSAC` → JSON `{resposta,transferir,motivo,nomeCliente,cpf}` (roteiro oficial v1.0/1.1). No webhook: IA faz o 1º atendimento se `bot_ativo && sem atendente && iaConfigurada`; `transferir=true` → desliga bot, escolhe atendente online e **abre o chamado automaticamente** (pedido Julio 02/07). Sem IA → fila humana.
- **Auto-distribuição** (`src/lib/sac-distribuicao.ts`): `candidatosOnline` (papel 'sac' + `sac_online` + ativo + cargo operacional); embed desambiguado `usuario_cargos!usuario_cargos_perfil_id_fkey` (senão PGRST201). `escolherAtendenteOnline` = menos carregado. **LIVE.**
- **Auto-offline de atendentes**: **NÃO EXISTE** cron de auto-offline — `sac_online` é só toggle manual. **GAP** se a bíblia promete auto-offline.
- **Cron Vercel** (`vercel.json`): **1 cron** — `/api/cron/ingest-sac` diário `0 6 * * *` (`CRON_SECRET`), chama `ingestSacLeadsDoSite`.
- **Site form → chamado** (`src/lib/sac-ingest.ts`): lê `lasercompany_leads` (via `siteClient()`), filtra `tipo ∈ {sac,reclamacao,suporte,pos_venda...}`, cria `sac_tickets` na franqueadora (`empresa_id='0...0001'`, `unidade_id=null`, canal `formulario`), atribui a online, marca `_roteado` (idempotente). Aciona-se por 3 vias: cron, `ingestSacBestEffort` no load de `/sac/chamados`, e a IA no webhook. **Ressalva**: o site **ainda não publica** formulário `tipo='sac'` → o ingest existe e funciona mas hoje **não materializa nada** (FUNCIONAL mas **ocioso**, aguardando o cliente publicar o form).

---

# Submódulo C — Expansão (7 folhas) + Implantação (1)

**Expansão** é o CRM de **franquias** (pipeline separado do CRM comercial). Menu grupo `perm:'crm.lead'`. Base: `crm_leads` / `crm_etapas` com `pipeline='franquia'` (migration 050). Todas as páginas são **defensivas à migration ausente** (banner + estado vazio). RBAC de escrita: `criarLeadFranquia`/`moverEtapa`/`simularLeadFranquia` exigem operador; `admin_geral` sempre, demais precisam de unidade ativa (RLS confirma).

## C.1 Dashboard — `/expansao`
- **Faz**: painel do funil de franquias (KPIs + funil por etapa + leads recentes), escopado por unidade.
- **Telas**: `ExpansaoTabs` (componente cliente).
- **Backend**: `crm_etapas` (`pipeline='franquia'`, ativo), `crm_leads` (lista capada 500 + **varredura paginada** de `etapa_id` para totais reais por etapa — evita fan-out de counts). Actions `criarLeadFranquia`, `moverEtapa`, `simularLeadFranquia`.
- **Estado**: **FUNCIONAL** (queries reais + feature-detect migration 050). **Esforço**: 0.

## C.2 Captação de Leads (Geo + Site) — `/expansao/captacao`
- **Faz**: relatório **read-only** dos leads que entram automaticamente por `origem in ('geolocalizado','site')` no pipeline de franquia (KPIs 7 dias, por canal, entrada recente).
- **Backend**: `crm_leads` (`pipeline='franquia'`, origens de captação), escopo por unidade. Robustez: query falha → estado vazio.
- **Integração**: a "entrada por site" depende do webhook/simulação (`simularLeadFranquia` cria origem 'site'/'geolocalizado' para validar). **Sem webhook de site publicado ainda** → alimentado hoje por simulação/manual.
- **Estado**: **FUNCIONAL (read-only), mas dependente de fonte** — o canal automático real (formulário do site de franqueado) ainda não emite. **Req/Esforço**: publicar o webhook/formulário de captação do site — **1–2 dias** (parte é decisão/cliente).

## C.3 Funil — `/expansao/funil`
- **Faz**: funil de vendas de franquia (KPIs, barras por origem/temperatura, conversão por etapa) com filtro de período e export CSV.
- **Telas**: `RelFiltros`, `RelKpis`, `BarChart`, `ExportCsvButton`.
- **Backend**: `crm_leads` (`pipeline='franquia'`) com paginação (PULL_CAP 8000), `crm_etapas`. Rótulos de origem/temperatura do CHECK da migration 050.
- **Estado**: **FUNCIONAL** (dado real, paginado). **Esforço**: 0.

## C.4 Leads (Kanban/Lista) — `/expansao/leads`
- **Faz**: lista filtrável de leads de franquia (busca, origem, temperatura, etapa, período) com export CSV.
- **Telas**: `LeadsFiltros`, `RelFiltros`, `RelKpis`, `ExportCsvButton`.
- **Backend**: `crm_leads` paginado + `crm_etapas`; ações de mover etapa via `moverEtapa`.
- **Estado**: **FUNCIONAL.** **Esforço**: 0.

## C.5 Disparos WhatsApp — `/expansao/disparos`
- **Faz**: composer de disparo em massa (templates + listas) pelos canais WhatsApp conectados, com histórico.
- **Telas**: `DisparoComposer`, `DisparosResumo`.
- **Backend**: `canais_whatsapp` + `listInstances`/`uazapiConfigurado` (UAZAPI); `listarTemplates`, `dadosDisparos` (listas + histórico) de `expansao/disparos/actions.ts`.
- **Integração**: **UAZAPI (real)** — só canais `/laser/i` e `connected`. Sujeito à restrição 463 para números novos.
- **Estado**: **FUNCIONAL (depende de envs UAZAPI e canal conectado).** É a única sub-folha de Expansão originalmente em `ROTAS_FUNCIONAIS` desde o início. **Req/Esforço**: validar throttle/anti-ban e templates de produção — **0,5 dia**.

## C.6 WhatsApp CRM — `/expansao/whatsapp`
- **Faz**: relatório **read-only** das conversas de WhatsApp que alimentam o CRM (KPIs abertas/não-lidas/em atendimento/no bot + conversas recentes).
- **Backend**: **reusa `sac_whatsapp_chats`/`sac_whatsapp_mensagens`** (as únicas tabelas de conversa que existem no código — o comentário do arquivo confirma que `whatsapp_conversas`/`whatsapp_mensagens` NÃO existem). Sem filtro por unidade (coluna não confirmada). Robustez: query falha → "Relatório em preparação".
- **Estado**: **FUNCIONAL (read-only), com ressalva de escopo**: as conversas exibidas são as do **SAC** (não há inbox de WhatsApp separado para Expansão). **Req/Esforço**: se Expansão precisar de inbox próprio, é feature nova — **decisão + 2–3 dias**; como relatório está OK (0).

## C.7 Tipo de Lead — `/expansao/tipos`
- **Faz**: relatório por linha de oferta (Ultracell/Quanta/Franquia/Ultracell Pro/Quanta Light) — leads, valor estimado, distribuição por etapa/temperatura.
- **Telas**: `RelFiltros`, `RelKpis`, `BarChart`, `ExportCsvButton`.
- **Backend**: `crm_leads` (`pipeline='franquia'`, agregação por `tipo_lead`) + `crm_etapas`. Cores espelham `EXP_TIPOS` do legado.
- **Estado**: **FUNCIONAL.** **Esforço**: 0.

## C.8 Implantação de Unidade — `/implantacao`
- **Perm**: menu **sem perm** (visível a todos os logados); **edição** `ehAdmin || gestor` (`PAPEIS_EDITA`).
- **Faz**: cronograma de implantação da unidade (projeto → etapas → tarefas), estilo project plan, com CRUD.
- **Telas**: `ImplantacaoView` (projeto da unidade ativa ou o mais recente; etapas com tarefas).
- **Backend**: `implantacao_projetos`, `implantacao_etapas`, `implantacao_tarefas`. Actions (com `audit_log`): `salvarProjeto`, `definirSituacao`, `editarTarefa`, `adicionarTarefa`/`excluirTarefa`, `editarEtapa`, `adicionarEtapa`/`excluirEtapa`. Defensivo à tabela ausente (banner "migration").
- **Estado**: **FUNCIONAL** (CRUD real). Ressalva: sem projeto/tabela → estado vazio honesto. **Req/Esforço**: seed de template padrão de implantação (se desejado) — **0,5 dia**; núcleo 0.

---

# Submódulo D — Jurídico — `/juridico`

- **Perm**: menu `admin:true` → **gate de página `isAdmin`** — **exclusivo `admin_geral`** ("O Jurídico é de acesso exclusivo da franqueadora").
- **Faz**: notificações extrajudiciais de cobrança, modelos de notificação, documentos contratuais por unidade e documentos para assinatura eletrônica.
- **Telas (abas)**: `JuridicoTabs` — (1) **Cobranças/Notificações** (`CobrancasTab`), (2) **Modelos** (`ModelosTab`), (3) **Unidades & documentos** (`UnidadesTab`), (4) **Documentos para assinatura** (`JuridicoManager`).
- **Backend**:
  - `juridico_notificacoes` (id, unidade_id, fin_id, franqueado, cnpj, categoria, valor, vencimento, dias_atraso, assunto, corpo, status pendente/enviada, enviada_em). KPIs reais via `count:exact` (pendentes, enviadas, valor pendente, unidades em atraso).
  - `juridico_templates` (modelos: nome/assunto/corpo/ordem).
  - `juridico_documentos` (documentos contratuais por unidade: contrato/pré/COF) — cruzado com `unidades` (cnpj/ativa).
  - `documentos_assinatura` + embed `signatarios_documento(status)` — fluxo de assinatura eletrônica com status (rascunho/em_andamento/concluído/expirado), prazo, ordem sequencial, paginação 30/pág, filtros e KPIs por status. Detecção de migration ausente (`tabelaAusente`).
- **Integrações**: **cruza com A.8 (Cobrança & Jurídico)** — o "acionar Jurídico" do Financeiro hoje só grava `jur_id` no recebível; **não** cria `juridico_notificacoes` automaticamente (gatilho ausente). Assinatura eletrônica: há tabelas/fluxo, mas **não há evidência de integração com provedor externo (DocuSign/Clicksign)** no `page.tsx` — é gestão interna do status (verificar `actions.ts` do módulo para envio real).
- **Estado real**: **FUNCIONAL** para leitura/gestão (notificações, modelos, documentos, assinatura com dados reais e KPIs reais). **PARCIAL** nas integrações: (a) ponte automática régua→notificação ausente; (b) provedor de assinatura eletrônica externo não confirmado no código lido.
- **Req p/ 100%**: gatilho régua(Financeiro)→`juridico_notificacoes`; envio real da notificação (e-mail/WhatsApp/carta); integração de assinatura eletrônica com provedor (se exigido). **Esforço**: 3–5 dias (2 ponte+envio; 2–3 assinatura externa, se necessária).

---

# Submódulo E — Auditoria — `/auditoria`

- **Perm**: menu `perm:'sistema.audit'`; **gate de página `ctx.isAdmin`** → **exclusivo `admin_geral`**.
- **Faz**: visualizador **read-only** da trilha de auditoria (`audit_log`) — log imutável, com política de soft-delete ("nada é apagado; registros viram Ativo/Inativo").
- **Telas**: 4 KPIs (Eventos registrados, Hoje, Usuários, Política=Soft-delete), `AuditoriaFiltros` (busca, ação, usuário, resultado sucesso/erro, período), `AuditoriaTabela` paginada (25/pág).
- **Backend**: lê `audit_log` via **`adminClient` (service role, somente leitura** — o log fica fora da RLS de negócio; **nenhuma escrita** ocorre na página). Colunas: usuario_id, acao, recurso_id, recurso_label, resultado, origem, ip, mensagem_erro, dados_depois, criado_em. Resolve nomes via `perfis_usuario.nome_completo`. Opções de filtro (ações distintas + usuários) e KPIs por `count:exact`.
- **Integrações**: consome os `audit_log.insert(...)` espalhados pelas actions do sistema (ex.: Atendentes, Implantação). É o leitor central.
- **Estado real**: **FUNCIONAL** (leitura real, filtros, paginação, KPIs). Cobertura de auditoria depende de cada action gravar em `audit_log` (algumas gravam — Atendentes/Implantação; nem todas as actions de Financeiro/SAC gravam, então a trilha é **parcial em cobertura**, não em funcionalidade da tela).
- **Req p/ 100%**: padronizar `audit_log.insert` em todas as mutations sensíveis (Financeiro, SAC). **Esforço**: 1–2 dias (instrumentação transversal).

---

# Tabela-resumo (item | estado | dias p/ 100%)

| # | Item | Estado | Dias |
|---|---|---|---|
| A.1 | Financeiro · Fluxo de Caixa | FUNCIONAL | 0 |
| A.2 | Financeiro · DRE (mês/anual/escopo/loja) | FUNCIONAL | 0 |
| A.3 | Financeiro · Cálculos (BCB real) | FUNCIONAL | 0,5 |
| A.4 | Financeiro · Contas a Receber | FUNCIONAL | 0 |
| A.5 | Financeiro · Contas a Pagar | FUNCIONAL | 0 |
| A.6 | Financeiro · Conciliação Bancária | PARCIAL (import manual; sem feed banco) | 3–5 |
| A.7 | Financeiro · Automação de Royalties | PARCIAL (apuração BEMP OK; boleto/banco STUB) | 4–6 |
| A.8 | Financeiro · Cobrança & Jurídico | PARCIAL (notificação/régua STUB) | 2–3 |
| A.9 | Financeiro · Configurações | FUNCIONAL | 0 |
| B.1 | SAC · Dashboard | FUNCIONAL (falta job SLA) | 0,5 |
| B.2 | SAC · Chamados | FUNCIONAL (schema tipo/data) | 1 |
| B.3 | SAC · Kanban | FUNCIONAL | 0 |
| B.4 | SAC · Conversa/Triagem (produção) | FUNCIONAL | 1–1,5 |
| B.5 | SAC · Canais | FUNCIONAL (envs UAZAPI) | 0,5 |
| B.6 | SAC · Relatórios | FUNCIONAL | 0 |
| B.7 | SAC · Pagamentos | FUNCIONAL | 0,5 |
| B.8 | SAC · Atendentes | FUNCIONAL | 0,5 |
| B.9 | SAC · Ranking | PARCIAL (vendas/CSAT=0 hardcoded) | 2 |
| B.10 | SAC · Importar Leads | FUNCIONAL | 0 |
| B.11 | SAC · Configurações | FUNCIONAL (falta job SLA) | 0 |
| B.INFRA | UAZAPI + webhook + IA + auto-distribuição | LIVE | — |
| B.INFRA | Auto-offline de atendentes | **NÃO IMPLEMENTADO** | 0,5 |
| B.INFRA | Cron ingest site→chamado | LIVE mas ocioso (site não emite `tipo='sac'`) | dep. cliente |
| C.1 | Expansão · Dashboard | FUNCIONAL | 0 |
| C.2 | Expansão · Captação (Geo+Site) | FUNCIONAL (read-only; fonte site pendente) | 1–2 |
| C.3 | Expansão · Funil | FUNCIONAL | 0 |
| C.4 | Expansão · Leads | FUNCIONAL | 0 |
| C.5 | Expansão · Disparos WhatsApp | FUNCIONAL (UAZAPI) | 0,5 |
| C.6 | Expansão · WhatsApp CRM | FUNCIONAL (read-only; reusa chats do SAC) | 0 |
| C.7 | Expansão · Tipo de Lead | FUNCIONAL | 0 |
| C.8 | Implantação de Unidade | FUNCIONAL | 0,5 |
| D | Jurídico | FUNCIONAL (integrações PARCIAIS) | 3–5 |
| E | Auditoria | FUNCIONAL (cobertura parcial) | 1–2 |

**Total de telas do módulo: 30 folhas** (Financeiro 9 · SAC 11 · Expansão 7 · Implantação 1 · Jurídico 1 · Auditoria 1).

**Esforço agregado p/ 100% (aprox.):** Financeiro ~10–15 dias (dominado por integração bancária real: boleto/CNAB/Open Finance A.6+A.7, e ponte de cobrança A.8) · SAC ~5–6 dias (job SLA, schema, ranking, realtime) · Expansão/Implantação ~2–3 dias (fonte de captação do site + template) · Jurídico ~3–5 dias · Auditoria ~1–2 dias. **Dependências não-dev (cliente/decisão):** credenciais/escolha de banco (boletos e conciliação), publicação do formulário `tipo='sac'` no site, e envs de produção UAZAPI/OpenRouter.

> **Pontos de atenção para homologação (confirmados no código):** (1) boleto de royalties usa `finBoletoNum()` — número **sintético**, com banner explícito "simula o ciclo"; (2) régua/notificação de cobrança são **placeholders** (não enviam); (3) conciliação bancária depende de **upload manual** de extrato; (4) SAC `sla_violado` nunca é escrito (SLA não aplicado sem job); (5) **não há cron de auto-offline** de atendentes SAC; (6) o ingest site→chamado está pronto mas **ocioso** (site não publica `tipo='sac'`); (7) Expansão "WhatsApp CRM" reusa as conversas do SAC (não há inbox próprio).
