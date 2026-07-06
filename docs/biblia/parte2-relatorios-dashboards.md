# BÍBLIA DE HOMOLOGAÇÃO — Gestão › Relatórios & Dashboards
**Sistema:** Laser&Co Power System (Next.js 15 App Router + Supabase `lkii`)
**Escopo deste documento:** os 2 grupos grandes da seção **Gestão** do `src/lib/menu.ts`: grupo **"Relatórios"** (`key: 'rel'`, 24 folhas de menu) e grupo **"Dashboards"** (`key: 'dash'`, 7 folhas). Rotas em `src/app/(app)/relatorios/*` e `src/app/(app)/dashboards/*`.
**Contagem de telas verificada no filesystem:** 25 `page.tsx` em `/relatorios` (24 no menu + `notas-fiscais` órfã do menu) e 7 `page.tsx` em `/dashboards` (as 4 `vendas-*` são wrappers de 1 componente compartilhado). **Total: 32 rotas de página.**

## Fundação compartilhada (ler antes de cada bloco)

Todas as páginas são **Server Components** (`export const dynamic = 'force-dynamic'`), read-only, resolvem escopo multitenant por `getSessionContext().activeUnitId` (unidade fixada na topbar vence; senão `?unidade=`), e caem em empty-states honestos em erro.

- **`src/lib/relatorios.ts`** — backbone de leitura de OS/pagamentos. `pullOS()` e `pullPagamentos()` **paginam com `.range(from, from+999)`** em lotes `PAGE=1000` até teto `PULL_CAP=20000` (padrão correto que evita o corte silencioso de 1000 linhas do PostgREST — documentado em comentário). `nomesPerfis()`/`nomesClientes()` resolvem nomes via `.in(ids.slice(0,1000))`. Tabelas reais: `os`, `os_pagamentos`, `clientes`, `perfis_usuario`.
- **`src/components/dashboards/agg.ts`** — "regra de ouro": nunca puxar linhas cruas em massa (`agendamentos`≈136k, `clientes`≈347k). `contar()` usa `count:'exact', head:true` (zero linhas transferidas); `pullLancamentos()` pagina `lancamentos_financeiros` (≈12.9k) só com colunas baratas até `SUM_CAP=20000`; lança `DashAggError` para não exibir zeros silenciosos.
- **`src/lib/dashboards.ts`** — regras de negócio do legado: royalties (10% do faturamento realizado do mês anterior, venc. dia 10), própria×franqueada por prefixo de CNPJ `44.442.908`, `pctInt()`. **Os ratios/tickets HARDCODED do legado ("Dashboard de Revenda" ilustrativo) foram REMOVIDOS** — o funil usa dado real.
- **`resolveRelRange()`/`resolveDashRange()`** — mapeiam `?periodo=` (mes/mes_passado/90d/ano/custom/tudo) para janela `{ini, fim}` meia-aberta + período anterior p/ comparativo.
- **RBAC** (`perm` no menu, sufixo `.` = prefixo): relatórios `comercial.` são vistos por qualquer perfil com permissão `comercial.*`; `financeiro.` por perfis `financeiro.*`; dashboards `vendas-*` são `admin:true` **e** ainda gated por `ehAdmin(ctx.papel)` dentro do `VendasReal` (dupla trava franqueadora).
- **Alerta de coerência do menu:** `ROTAS_FUNCIONAIS` marca **todas** as 24 rotas de relatório + 7 dashboards como "funcional" — mas o critério (nota de 2026-06-29) é *"query real OU empty-state honesto"*, **não** *"tem dado"*. `avaliacoes` e `ocorrencias` acendem no menu porém não têm tabela-fonte (ver blocos). Menu-funcional ≠ com-dados.

---

# PARTE 1 — RELATÓRIOS (grupo `rel`)

### 1. Assinaturas — `/relatorios/assinaturas` · perm `comercial.`
1. **O que faz:** Relatório do CATÁLOGO de planos de assinatura e do MRR *potencial* — não de assinaturas reais por cliente (não existe tabela de vínculo).
2. **Telas:** Filtro Ativos(default)/Todos (`?ativo=todos`). KPIs: *Planos ativos, MRR potencial, Ticket médio, Adesão média*. Charts: "Top planos por mensalidade" (top 10), "Planos por faixa de mensalidade" (≤100/100-200/200-400/>400). Tabela: Plano/Status/Mensalidade/Adesão/Duração/Serviços·mês/Criado em + tfoot MRR.
3. **Backend:** `planos_assinatura` `.select('id,nome,descricao,valor_mensal,valor_adesao,duracao_meses,beneficios,ativo,criado_em').order('valor_mensal').limit(1000)` **[⚠ `.limit(1000)` — teto rígido, catálogo]**; `.eq('ativo',true)` no modo ativos. `plano_assinatura_servicos` `.select('plano_id,quantidade_mensal').in('plano_id',ids)`. Erro → banner `semFonte`.
4. **Integrações:** nenhuma.
5. **Estado real: PARCIAL.** Lê tabelas reais de catálogo (fonte `/planos`). Documentado em código: **não existe** tabela de assinatura por cliente (`cliente_assinaturas`/`assinaturas`/`clientes_planos`), logo assinaturas ativas/churn/MRR realizado NÃO são calculáveis; MRR é "potencial". Sem mock/iframe.
6. **P/ 100%:** criar tabela cliente↔plano (status, datas início/cancelamento, valor); ligar fluxos assinar/cancelar; KPIs de ativas/novas/canceladas/churn/MRR realizado.
7. **Esforço: 4 dias.**

### 2. Ocorrências e Intercorrências — `/relatorios/ocorrencias` · perm `comercial.`
1. **O que faz:** Deveria reportar ocorrências/intercorrências clínico-operacionais por atendimento; hoje é **placeholder de empty-state** porque não há tabela-fonte.
2. **Telas:** KPIs com `value:''` (Total de registros, Ocorrências, Intercorrências); legenda conceitual Ocorrência×Intercorrência; tabela (Data/Cliente/Profissional/Serviço/Descrição/Tipo) com única linha "Nenhum registro". Sem filtro/charts.
3. **Backend:** **NENHUM** — a página não chama `createClient()` nem `from()`. Comentário documenta: `ocorrencias`/`ocorrencias_frequencia` não existem; `acoes`=RBAC, `atestados`=RH. Não consulta nada para evitar erro 42P01.
4. **Integrações:** nenhuma.
5. **Estado real: FALTA (placeholder honesto).** No legado era 100% mock (array `OCOR`). Sem mock/query quebrada/iframe. TODO em código especifica o que construir.
6. **P/ 100%:** criar tabela de ocorrências (cliente/profissional/serviço/descrição/tipo/data/unidade) + UI de captura + relatório (KPIs/charts/tabela por período+unidade).
7. **Esforço: 4 dias.**

### 3. Agendamentos — `/relatorios/agendamentos` · perm `comercial.`
1. **O que faz:** Relatório só-contagem de agendamentos por status e (em janelas curtas) por dia, escopado à unidade ativa.
2. **Telas:** `RelFiltros` (default `mes`). KPIs: *Total, Concluídos (+% conclusão), Cancelados (+% cancelamento, tom down se >25%), Confirmados*. Charts: "Por status"; "Por dia" (só se janela fechada ≤31 dias). Tabela "Resumo por status" (concluido/confirmado/aberto/em_atendimento/cancelado/no_show).
3. **Backend:** `agendamentos` — todas as queries `.select('id',{count:'exact',head:true})` (zero linhas). Filtros `.eq('status')`, `.eq('unidade_id')`, `.gte/.lt('inicio')`. Total+6 status em `Promise.all`; por-dia = até 31 head-counts. Sem `.range`/`.limit`/embed. Seguro contra a tabela de 136k.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (dimensões parciais).** Tabela e status reais. TODO honesto: sem quebra por profissional (`profissional_id` sempre null no import BEMP; sem tabela `profissionais`).
6. **P/ 100%:** popular `profissional_id` + tabela `profissionais`; quebra por serviço.
7. **Esforço: 1.5 dias.**

### 4. Anamnese / Ficha Técnica — `/relatorios/anamnese` · perm `comercial.`
1. **O que faz:** Reporta o CATÁLOGO de fichas digitais (`documentos`), não preenchimentos por cliente (não há tabela de respostas).
2. **Telas:** Filtro "Tipo" (`?tipo=`) + `ExportCsvButton`. KPIs: *Documentos, Ativos (+%), Obrigatórios, Perguntas (total)*. Metric-boxes (perguntas que inviabilizam, obrigatórios, média perguntas/doc). Charts "Por tipo"/"Por status". Tabela "Fichas digitais".
3. **Backend:** `documentos` `.select('id,nome,tipo,descricao,preenchimento,obrigatorio,status,acumulativo,unidades_ids,secoes,atualizado_em').order('atualizado_em').limit(1000)` **[⚠ `.limit(1000)`]**. Escopo por `unidades_ids` (array, em memória). Perguntas computadas de `secoes` (JSONB). Erro → banner "migration não aplicada".
4. **Integrações:** nenhuma.
5. **Estado real: PARCIAL (só catálogo).** KPIs mock do legado ("488 preenchidos" etc.) removidos. Sem tabela de preenchimento/assinatura → per-cliente não calculável. Depende de migration `anamnese.sql`.
6. **P/ 100%:** esquema de respostas/assinaturas (`documento_respostas`/`assinaturas_documento` com cliente_id/documento_id/status/assinado_em) + persistência do submit + KPIs per-cliente.
7. **Esforço: 4 dias.**

### 5. Atendimentos — `/relatorios/atendimentos` · perm `comercial.`
1. **O que faz:** Analisa agendamentos `status='concluido'` como "atendimentos" — volume por mês/unidade + duração real (fim−inicio).
2. **Telas:** `RelFiltros` (default `90d`). KPIs: *Concluídos (+ se capped), Unidades atendendo, Duração média (min), Tempo total (h)*. Charts "por mês"/"por unidade top10". Tabela por unidade. Banners capped/erro.
3. **Backend:** `agendamentos` **paginado `.range()`** (PAGE 1000) até `SUM_CAP=20000` (flag `capped`). Select `id,inicio,fim,unidade_id,unidade:unidades(nome)` — **embed `unidades`**. `.eq('status','concluido')`, `.eq('unidade_id')`, `.gte/.lt('inicio')`. Agregação em JS.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (dimensões parciais).** Keyed por `status` porque `concluido_em` veio vazio do import. `servico_id`/`profissional_id`/`cliente_id` null → sem breakdown por serviço/profissional. Cap 20k pode subcontar janelas amplas (sinalizado com `+`).
6. **P/ 100%:** ingestão de servico_id/profissional_id daqui p/ frente; agregação server-side (RPC) p/ remover cap.
7. **Esforço: 2 dias.**

### 6. Avaliações — `/relatorios/avaliacoes` · perm `comercial.`
1. **O que faz:** Scaffold NPS/CSAT que consulta defensivamente tabela `avaliacoes` inexistente; hoje renderiza empty-state honesto.
2. **Telas:** `RelFiltros` (default `mes`). KPIs: *Avaliações, Nota média, Promotores %, Detratores %*. Metric-boxes NPS/Neutros/Escala. Charts distribuição/classificação. Tabela Data/Cliente/Serviço/Profissional/Nota/Comentário.
3. **Backend:** `avaliacoes` (try/catch) `.select('id,nota,comentario,cliente_nome,servico_nome,profissional_nome,criado_em,unidade_id').order('criado_em').limit(500)` **[`.limit(500)` seguro]**. Tabela não existe → `semFonte=true`. Auto-detecta escala 1-5/0-10.
4. **Integrações:** nenhuma.
5. **Estado real: FALTA (empty-state honesto).** KPIs mock do legado removidos. Sem tabela `avaliacoes`; `avaliacoes_desempenho` (RH) deliberadamente não usada. Acende sozinho quando a tabela existir.
6. **P/ 100%:** criar tabela `avaliacoes` + coleta pós-atendimento (survey/WhatsApp).
7. **Esforço: 4 dias** (código do relatório pronto).

### 7. Clientes — `/relatorios/clientes` · perm `comercial.`
1. **O que faz:** Relatório da base: totais, ativos/inativos/verificados, novos por mês.
2. **Telas:** `RelFiltros` (default `mes`). KPIs: *Base total, Ativos (+%), Novos (período), Verificados*. Charts "Novos (6 meses)"/"Composição". Tabela "Resumo da base".
3. **Backend:** `clientes` `.select('id',{count:'estimated',head:true})` **[`count:'estimated'` — estatística do Postgres, escolhido porque `exact` sobre ~347k×10 levava 13s]**. Filtros `.eq('ativo',true)`, `.eq('verificado',true)`, `.gte/.lt('criado_em')`. 4 counts globais + 6 mensais em paralelo.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (2 ressalvas honestas).** KPIs APROXIMADOS (estimated). `unidade_origem_id` sempre null → **sem segmentação por unidade** (nota + TODO).
6. **P/ 100%:** popular `unidade_origem_id`; breakdowns cidade/estado/canal_origem + cohort; opcional exact counts.
7. **Esforço: 2 dias.**

### 8. Contratos — `/relatorios/contratos` · perm `comercial.`
1. **O que faz:** Ativos/assinados/inadimplentes + MRR contratado, da tabela `contratos`.
2. **Telas:** `RelFiltros` (default `90d`) + ExportCsv. KPIs: *Ativos, Assinados, Inadimplentes (tom down se >0), Valor contratado (MRR)*. Charts "ativos por plano"/"por status". Tabela Cliente/Plano/Status/Criação/Assinatura/Valor·mês. Banner migration se ausente/zero.
3. **Backend:** `contratos` — (a) lista `.select('id,cliente_nome,plano,status,valor_mensal,criado_em,assinado_em').order('criado_em').limit(1000)` **[⚠ `.limit(1000)`, só display; header mostra "exibindo N"]**; (b) KPIs por **`.range()` paginado** (PAGE 1000, até offset 50000) select `status,plano,assinado_em,valor_mensal` — contagem EXATA. `cliente_nome`/`plano` são strings denormalizadas (sem FK).
4. **Integrações:** nenhuma.
5. **Estado real: PARCIAL/condicional.** Código funcional lendo tabela real, MAS `contratos` é **seed** de `scripts/migrations/relatorios.sql` (contratos-exemplo derivados de clientes reais), não fluxo produtivo. Migration ausente → banner honesto.
6. **P/ 100%:** aplicar migration; substituir seed por ciclo real (criação/assinatura/inadimplência); normalizar cliente_id/plano_id.
7. **Esforço: 3 dias.**

### 9. Crédito em dinheiro — `/relatorios/credito-dinheiro` · perm `comercial.`
1. **O que faz:** Apura recebimentos com `os_pagamentos.metodo='dinheiro'` por período, totalizando por cliente + movimentação. Proxy: não existe carteira/saldo.
2. **Telas:** KPIs *Recebido em dinheiro, Recebimentos (+ se capped), Clientes, Ticket médio, % do recebido*. `RelFiltros` (default `90d`) + ExportCsv. Charts "por mês"/"top clientes". Tabelas "Situação por cliente" + "Movimentação" (≤300). Banner cap.
3. **Backend:** `pullOS` (só IDs da unidade) → `pullPagamentos(ini,fim,osIds)` filtrando `metodo='dinheiro'` em memória (KPIs só `status='aprovado'`). `os`→`clientes`. **[⚠ `osIds.slice(0,1000)` e `osComPag.slice(0,1000)` — unidade com >1000 OS subconta silenciosamente]**. `.range()` até 20000.
4. **Integrações:** nenhuma.
5. **Estado real: PARCIAL (funcional sobre proxy).** Lê tabela real `os_pagamentos`; sem mock/iframe. Conceito de saldo/crédito não existe (nota honesta).
6. **P/ 100%:** tabela de carteira/saldo; recalcular "Situação" como saldo; corrigir cap 1000 os_ids; `unidade_id` em `os_pagamentos`.
7. **Esforço: 4 dias.**

### 10. CRM — `/relatorios/crm` · perm `comercial.`
1. **O que faz:** Funil de leads de CLIENTE (`crm_leads` `pipeline='cliente'`, separado da Expansão) por origem/etapa/conversão.
2. **Telas:** KPIs *Leads no período (+ se capped), Em negociação (Δ R$ pipeline), Convertidos (Δ R$ ganho), Taxa de conversão*. `RelFiltros` (default `mes`) + ExportCsv. Charts "por etapa"/"por origem top10". Tabelas Funil/Origem/Leads(≤300). Estado `semFonte`.
3. **Backend:** `crm_etapas` (`.eq('ativo',true)`,`.eq('pipeline','cliente')`); `crm_leads` `.select('id,nome,origem,servico_interesse,valor_estimado,etapa_id,status,temperatura,criado_em').eq('pipeline','cliente')` + `.eq('unidade_id')` + `.gte/.lt('criado_em')`, **`.range()` paginado** até `PULL_CAP=8000`.
4. **Integrações:** nenhuma (WhatsApp/Instagram só como rótulo de origem).
5. **Estado real: FUNCIONAL (dependente de dados).** Tabela real correta, escopo/paginação corretos, estados honestos. TODO: cohort de conversão e tempo médio no funil pendem de histórico de movimentação de etapa.
6. **P/ 100%:** persistir histórico de movimentações de etapa; garantir população de leads `pipeline='cliente'` por unidade.
7. **Esforço: 2 dias.**

### 11. Crédito Recorrente — `/relatorios/credito-recorrente` · perm `comercial.`
1. **O que faz:** Apura cobranças `os_pagamentos.metodo='credito_recorrente'` (forma PagoLivre) — MRR, falhas, cancelamentos.
2. **Telas:** KPIs *Assinaturas recorrentes, MRR recorrente, Falhas (recusado/estornado), Cancelamentos, Ticket médio*. `RelFiltros` (default `90d`) + ExportCsv. Charts "por mês"/"top clientes". Tabelas por cliente + movimentação (≤300). Banner cap.
3. **Backend:** idêntico ao credito-dinheiro (mesmo **⚠ `slice(0,1000)`**), filtrando `metodo='credito_recorrente'`.
4. **Integrações:** conceitualmente PagoLivre, mas a página **não chama** API — só lê `os_pagamentos`.
5. **Estado real: PARCIAL.** Funcional se houver cobranças; sem tabela de assinatura cliente↔plano → status Ativo/Pausado/Cancelado, modo e próxima cobrança ausentes.
6. **P/ 100%:** tabela `cliente_assinaturas`; integração real PagoLivre; corrigir cap 1000.
7. **Esforço: 5 dias.**

### 12. Descontos — `/relatorios/descontos` · perm `comercial.`
1. **O que faz:** Cada OS não-cancelada com `desconto_total>0` = aplicação de desconto; total, nº, % médio ponderado, vendedor de maior impacto.
2. **Telas:** KPIs *Descontos concedidos, Nº aplicações (+ se capped), % médio, Maior impacto*. `RelFiltros` (default `90d`) + ExportCsv. Chart "por colaborador top10". Tabela aplicações (≤300). Banner cap.
3. **Backend:** `pullOS(status:['aberta','fechada'])` → filtra `desconto_total>0` em memória; % via `total_bruto`. `nomesPerfis` (via `criado_por`), `nomesClientes`. `.range()` até 20000.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL.** Tabela real `os`, sem mock/TODO/iframe. Empty-state honesto.
6. **P/ 100%:** nenhum gap estrutural (opcional: cap 1000 em nomesPerfis, irrelevante).
7. **Esforço: 0.5 dia.**

### 13. Estatísticas — `/relatorios/estatisticas` · perm `comercial.`
1. **O que faz:** Visão consolidada (faturamento/agendamentos/ticket/clientes) com comparativo vs período anterior.
2. **Telas:** KPIs *Faturamento (Δ%), Atendimentos (Δ% conclusão), Ticket médio, Novos clientes*. `RelFiltros` (default `90d`). Charts "faturamento vs anterior"/"agendamentos". Tabela "Indicadores consolidados". Banner cap.
3. **Backend** (`Promise.all`)**:** `lancamentos_financeiros` (`tipo='receita'`, `.range()` até `SUM_CAP=20000`, 2×); `agendamentos` **`count:'exact',head:true`** (4×); `clientes` **head:true** (3×, `unidade_origem_id` NÃO usado — base global).
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (ressalva de escopo).** Fontes reais corretas, head:true eficiente, comparativo real. Base de clientes global até `unidade_origem_id` popular. TODO aba "Colaborador".
6. **P/ 100%:** popular `unidade_origem_id`; aba Colaborador (tabela `profissionais`).
7. **Esforço: 2 dias.**

### 14. Exportações — `/relatorios/exportacoes` · perm `comercial.`
1. **O que faz:** Substitui o log de exportações mock do legado por **hub read-only**: lista 6 datasets exportáveis com contagem real + link p/ `/exportacoes`.
2. **Telas:** Sem filtro/charts. KPIs (metric-box) *Registros exportáveis, Fontes com dados, Fontes vazias, Contagem indisponível*. Card CTA "Central de Exportações". Tabela "Fontes disponíveis" (Fonte/Descrição/Escopo/Registros/Status). 6 datasets: `clientes`,`lancamentos_financeiros`(×2),`agendamentos`,`colaboradores`,`sac_tickets`,`site_leads`.
3. **Backend:** por dataset `.select('id',{count:'exact',head:true})` + `.eq(unidadeCol,unidadeId)`. Sem pull de linhas. `siteConfigurado()` decide texto de integração dos leads.
4. **Integrações:** referencia leads do site (`site_leads`) mas só faz count local; geração de CSV real está em `/exportacoes`.
5. **Estado real: FUNCIONAL (como hub); histórico do legado FALTA.** Counts reais; honesto que log "quem/quando/qual arquivo" não existe (sem `export_log`).
6. **P/ 100%:** criar tabela de log de exportações + registrar cada download.
7. **Esforço: 2 dias.**

### 15. Faturamento — `/relatorios/faturamento` · perm `financeiro.`
1. **O que faz:** Soma receitas (`lancamentos_financeiros` `tipo='receita'`) por período, com comparativo, quebra por unidade e mês de competência.
2. **Telas:** KPIs *Faturamento, Lançamentos (+ se capped), Ticket médio, [KPI período anterior + Δ%]*. `RelFiltros` (default `90d`) — **sem ExportCsv**. Charts "por mês" (label cru `YYYY-MM`)/"top unidades". Tabela por unidade + tfoot 100%. Banner cap.
3. **Backend:** `lancamentos_financeiros` `.select('valor,unidade_id,data_competencia').eq('tipo','receita')` + `.eq('unidade_id')` + `.gte/.lt('data_competencia')`, **`.range()` até `SUM_CAP=20000`** (2× atual+prev). Nomes de unidade vêm do contexto (sem query extra).
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL.** Um dos mais maduros do conjunto. Empty-state honesto. Cosmético: label de mês cru.
6. **P/ 100%:** formatar label do mês; opcional ExportCsv.
7. **Esforço: 0.5 dia.**

### 16. Ranking de Vendas — `/relatorios/ranking-vendas` · perm `comercial.`
1. **O que faz:** Ranqueia vendedores (`os.criado_por`) por valor de OS **fechadas** no período (réplica de `RANKS.vendas`).
2. **Telas:** KPIs *Total vendido, Vendedores, Líder (nome+valor), Ticket médio*. Chart "Top 10 (R$)". Tabela Posição(top3 destaque)/Colaborador/Vendas/Valor/Ticket. `RankLimitSel` (Top 10/50/100/250/500). ExportCsv.
3. **Backend:** `pullOS(status:'fechada')` **`.range()` até 20000**; agrega por `criado_por`; `nomesPerfis` (`.in(ids.slice(0,1000))`). Null → "Sem vendedor vinculado".
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL.** Empty-state e banner cap honestos, sem mock.
6. **P/ 100%:** essencialmente completo; opcional coluna por unidade; elevar cap 20k.
7. **Esforço: 0.5 dia.**

### 17. Fidelidade — `/relatorios/fidelidade` · perm `comercial.`
1. **O que faz:** SNAPSHOT de saldos de fidelidade (pontos + créditos) de `clientes`. Sem filtro de período (estado atual).
2. **Telas:** Toggle Pontos/Créditos (`?ordem=`). KPIs *Base total, Com pontos (+%), Com créditos (+%), Pontos/Créditos (top 100)*. Chart "Top 10". Tabela Cliente/Telefone/Pontos/Créditos + tfoot "Total (janela)".
3. **Backend:** `clientes` — counts `count:'estimated',head:true` (`.gt('saldo_pontos',0)`/`.gt('saldo_creditos',0)`); janela `.select('id,nome,telefone,saldo_pontos,saldo_creditos').order(ordemCol desc).gt(ordemCol,0).limit(TOP_N=100)` **[`.limit(100)` seguro]**. Totais só sobre os 100.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (ressalva de escopo).** Colunas reais `saldo_pontos`/`saldo_creditos`. Fallback `indisponivel`. `unidade_origem_id` null → sem segmentação. TODO ledger de pontos p/ extrato temporal/expiração.
6. **P/ 100%:** popular `unidade_origem_id`; tabela de movimentação de pontos.
7. **Esforço: 2 dias.**

### 18. Financeiro / Contábil (DRE simples) — `/relatorios/financeiro` · perm `financeiro.`
1. **O que faz:** DRE simples sobre `lancamentos_financeiros`: receita×despesa por categoria, resultado e margem.
2. **Telas:** `RelFiltros` (default `90d`). KPIs *Receita, Despesa, Resultado (Δ margem%), Lançamentos (+ se capped)*. Charts "Receita×Despesa×Resultado"/"Receita por categoria top8". Tabela "Demonstrativo" (linhas +Receitas, −Despesas, =Resultado). **Nota honesta quando `totalDespesa===0`**: "base atual só tem receitas".
3. **Backend:** `lancamentos_financeiros` `.select('valor,categoria_id,data_competencia,status').eq('tipo', 'receita'|'despesa')` (2 pulls) + `.eq('unidade_id')` + `.gte/.lt('data_competencia')`, **`.range()` até `SUM_CAP=20000`**. `plano_contas` `.in('id',catIds)` p/ nomes.
4. **Integrações:** nenhuma.
5. **Estado real: PARCIAL — "só receitas, sem despesas" CONFIRMADO.** O caminho de despesa está codado (a DRE já consome), mas não há linhas `tipo='despesa'` no backend → `totalDespesa===0` + nota honesta. Receita FUNCIONAL. TODO: integrar contas a pagar reais.
6. **P/ 100%:** ingerir lançamentos `tipo='despesa'` (contas a pagar); opcional comparativo período.
7. **Esforço: 3 dias** (dominado por ingestão de dados, não UI).

### 19. Mensagens WhatsApp API — `/relatorios/whatsapp` · perm `comercial.`
1. **O que faz:** Métricas de disparo de CAMPANHAS (enviadas/entregues/lidas/respondidas/falhas) de `campanhas_whatsapp`. Lê contadores agregados, não logs por mensagem.
2. **Telas:** KPIs (metric-box 2×4) Campanhas/Enviadas/Taxa entrega%/Taxa leitura%; Destinatários/Entregues/Respostas%/Falhas. Charts "Funil de mensagens"/"por status". Tabela "Campanhas" (Campanha/Status/Segmentação/Enviadas/Entregues/Lidas/Respostas/Falhas/Data) + tfoot.
3. **Backend:** `campanhas_whatsapp` `.select('id,nome,template_nome,segmentacao_tipo,status,concluido_em,criado_em,total_destinatarios,total_enviados,total_entregues,total_lidos,total_responderam,total_falhou,unidade_id').order('criado_em desc').limit(LIMITE=300)` **[`.limit(300)` seguro, mas sem paginação → subconta se >300 campanhas]** + `.eq('unidade_id')` + `.gte/.lt('criado_em')`. Erro → `semFonte`.
4. **Integrações:** WhatsApp — só LÊ a tabela agregada `campanhas_whatsapp` (populada por marketing/disparo). **Não** chama Uazapi/Evolution ao vivo; não há tabela de log por mensagem.
5. **Estado real: FUNCIONAL se houver campanhas.** Tabela real correta, sem iframe/mock. Empty-state honesto. **Coerência do menu:** o index `/relatorios` ainda lista esta rota como "Em desenvolvimento".
6. **P/ 100%:** confirmar população em prod; paginar >300; drill-down por destinatário se surgir log.
7. **Esforço: 1 dia.**

### 20. Metas — `/relatorios/metas` · perm `comercial.`
1. **O que faz:** Meta×realizado por colaborador de `metas_colaborador`, escopado à unidade via `colaboradores`; premiação liberada a ≥80% de atingimento agregado de venda (regra legado).
2. **Telas:** Toggle %Atingido/Valor (`?visualizar=`). ExportCsv. KPIs *Meta (venda), Realizado, %Atingido (Δ 80%), Premiação (Liberada/Bloqueada)*. Chart "Atingimento por colaborador top10". Tabela colorida (verde≥100/âmbar≥80/vermelho<80). Empty-state "Cadastre metas em Cadastros·Metas".
3. **Backend:** `colaboradores` `.select('id,nome').eq('status','ativo')` **`.range()` paginado até 50000** (escopo por unidade, pois `metas_colaborador` não tem `unidade_id`). `metas_colaborador` `.select('id,colaborador_id,indicador,unidade_medida,valor_alvo,valor_realizado,status')` — com unidade: `.in('colaborador_id',grupo)` em lotes de 200; **`.range()`**.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (dependente de dados).** Tabelas reais, multitenant paginado correto (corrige bug de corte >500 colaboradores). Empty-state honesto. Depende de metas cadastradas.
6. **P/ 100%:** garantir metas populadas; opcional filtro de período; auto-preencher `valor_realizado` de vendas reais.
7. **Esforço: 1.5 dias.**

### 21. Ordens de serviço — `/relatorios/ordens-servico` · perm `comercial.`
1. **O que faz:** Relatório sobre `os`: contagem por status/origem, valor total, lista detalhada, escopo unidade+criação.
2. **Telas:** `RelFiltros` (default `90d`) + ExportCsv. KPIs *OS no período, Finalizadas (Δ% amostra), Em aberto, Valor total* (todos com `+` se capped). Charts "por status"/"por origem". Tabela (≤300) Cliente/Origem/Status/Abertura/Valor. Banner cap.
3. **Backend:** `pullOS` → `os` (colunas do helper) + `.eq('unidade_id')` + `.gte/.lt('criado_em')` + status opcional, **`.range()` até `PULL_CAP=20000`**. `nomesClientes` (`.in(ids.slice(0,1000))`). Sem embed.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL.** O mais production-ready dos relatórios. Sem mock/iframe/TODO.
6. **P/ 100%:** essencialmente completo; opcional paginação server-side >300; comparativo.
7. **Esforço: 0.5 dia.**

### 22. Pacotes — `/relatorios/pacotes` · perm `comercial.`
1. **O que faz:** Vendas de pacotes = OS com `origem='pacote'`, agregadas por mês.
2. **Telas:** `RelFiltros` (default `90d`). KPIs *Receita de pacotes, Pacotes vendidos (+ se capped), Ticket médio (pagos), Cortesias (100% desc.)*. Charts "Receita por mês"/"Vendidos por mês". Tabela "Detalhamento por mês" + tfoot.
3. **Backend:** `pullPacotes()` local → `os` `.select('status,preco_total,desconto_total,total,criado_em').eq('origem','pacote')` + `.eq('unidade_id')` + `.gte/.lt('criado_em')`, **`.range()` até `PULL_CAP=20000`**. Cancelada excluída; `total>0`=pago senão cortesia. Agregação mensal em JS.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (limitação honesta).** `os_pacotes` veio VAZIO do import e OS sem `pacote_id` → **sem ranking por nome de pacote histórico** (só aparece com novas vendas do PDV). Divulgado no rodapé. Sem mock/iframe.
6. **P/ 100%:** popular `os_pacotes`/backfill `pacote_id` (migração/PDV) p/ breakdown por pacote.
7. **Esforço: 1 dia** (página; detalhe por pacote depende de dado externo).

### 23. Pagamentos — `/relatorios/pagamentos` · perm `financeiro.`
1. **O que faz:** Apuração de pagamentos de OS por `data_pagamento`: Previsto/Recebido/Pendente/Erro, taxa de sucesso, quebra por método.
2. **Telas:** KPIs *Previsto, Recebido (Δ %sucesso), Pendente, Com erro (tom down se >0), Taxa de sucesso*. Charts "Recebido por método top10"/"Previsto×Recebido×Pendente×Erro". Tabela (≤300) Data/Cliente/Método/Valor/Status. `RelFiltros` (default `90d`) + ExportCsv.
3. **Backend:** `pullOS` (IDs unidade) → `pullPagamentos(ini,fim,osIds)` `os_pagamentos.select('os_id,data_pagamento,metodo,tipo,valor,status')` **`.range()` até 20000**; `.in('os_id',osIds.slice(0,1000))` **[⚠ subconta unidade >1000 OS]**. Nomes via `os`→`nomesClientes`. `METODO_LABEL`.
4. **Integrações:** nenhuma (sem gateway; lê `os_pagamentos`).
5. **Estado real: FUNCIONAL.** Dado real. TODO(legado relPremiacoesHTML): roster de premiação/Matriz de Metas NÃO implementado aqui (deferido a Cadastros·Comissões/Relatórios·Metas). Sem mock/iframe.
6. **P/ 100%:** tratar cap `slice(0,1000)` p/ unidades grandes (chunk `.in` ou `unidade_id` em `os_pagamentos`); implementar premiação.
7. **Esforço: 1.5 dias.**

### 24. Perfis de acesso — `/relatorios/perfis-acesso` · perm `comercial.`
1. **O que faz:** Relatório RBAC read-only — quem tem qual cargo, contagem de permissões por perfil, escopo por unidade.
2. **Telas:** KPIs *Perfis cadastrados, Usuários com perfil, Perfis de sistema, Perfis inativos (Δ desativados)*. Charts "Usuários por perfil top10"/"Permissões por perfil top10". Tabelas "Perfis cadastrados" e "Usuários e seus perfis". Link "Gerenciar perfis"→`/cadastros/perfis`.
3. **Backend:** usa **`adminClient()` service-role**. `Promise.all`: `cargos.select('id,nome,slug,descricao,is_sistema,ativo')`; `usuario_cargos.select('perfil_id,cargo_id,unidade_id,ativo')` **[⚠ sem `.limit`/`.range` → corte silencioso de 1000]**; `cargo_permissoes.select('cargo_id')` **[⚠ mesmo risco]**; `perfis_usuario.select('id,nome_completo,email').limit(2000)` **[⚠ `.limit(2000)` > max_rows default 1000 → trunca a 1000]**. Joins em memória. Escopo por `usuario_cargos.unidade_id`.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (bug latente de escala).** Dados RBAC reais; `semFonte` honesto. Subconta se `usuario_cargos`/`cargo_permissoes`/`perfis_usuario` passarem de 1000 linhas.
6. **P/ 100%:** paginar (`.range()`) as três tabelas; corrigir `.limit(2000)`.
7. **Esforço: 1 dia.**

### [Órfã] Notas Fiscais (relatório) — `/relatorios/notas-fiscais` · **fora do menu** (removida 03/07, comentário linha 99)
1. **O que faz:** Relatório NFS-e sobre `nfse`, escopo unidade + data de emissão, agregando por status e tipo. *(page.tsx existe e está em `ROTAS_FUNCIONAIS`, mas o link foi retirado do menu — só a emissão em `/notas` fica.)*
2. **Telas:** `RelFiltros` (default `90d`, eixo `criado_em`). KPIs *Notas emitidas (Δ%), Valor autorizado, Canceladas (Δ processando), Com erro*. Charts "Por status"/"Valor por tipo". Tabelas "Resumo por status" + "Notas no período" (≤200).
3. **Backend:** `nfse` `.select('id,numero,competencia,tipo,fato_gerador,cliente_nome,valor,status,criado_em,unidade_id,cliente:clientes(nome)')` — **embed `clientes`**. `.eq('unidade_id')` + `.gte/.lt('criado_em')`, **`.range()` até `ROW_CAP=5000`**. Erro `relation|does not exist` → `semTabela` "em preparação".
4. **Integrações:** nenhuma direta (emissão fiscal fica em `/notas`).
5. **Estado real: PARCIAL/condicional.** Código completo lendo tabela real; exibe dado se migration `nfse` aplicada + linhas existirem, senão empty honesto. `competencia` irregular → período usa `criado_em`.
6. **P/ 100%:** aplicar migration `nfse` + integração de emissão real; (decidir se volta ao menu).
7. **Esforço: 2 dias.**

---

# PARTE 2 — DASHBOARDS (grupo `dash`)

### D1. Financeiro / Contábil — `/dashboards/financeiro` · perm `financeiro.`
1. **O que faz:** Previsto (todos) × realizado (`status='pago'`) de contas a pagar/receber, royalties auto para franqueadas, receita por categoria.
2. **Telas:** `DashFiltros` (8 presets + custom, select Unidade, ExportCsv; default `90d`). 6 KPIs: *Contas a pagar previstas/realizadas, Royalties a pagar (auto), Contas a receber previstas/realizadas, Total a receber*. Banner royalties (franqueada 10%/venc.10 vs "Loja própria"). 3 Charts (Movimentação; Categorias pagar; Categorias receber top8). Tabela "Receita por categoria" + tfoot. Banner cap.
3. **Backend:** `pullLancamentos('receita'|'despesa')` **`.range()` até `SUM_CAP=20000`**; `unidades.select('cnpj').eq('id').maybeSingle()`; `faturamentoMesAnterior` (`status='pago'`); `plano_contas.in('id',catIds)`.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL.** Tudo de tabelas reais; royalties de receita realizada do mês anterior (`calcRoyalties`, CNPJ `44.442.908`). Sem iframe/mock. Ressalva: KPI "Total a receber" duplica "previstas" (intencional). Depende de `status='pago'` correto no ERP.
6. **P/ 100%:** validar semântica `data_competencia`×`data_vencimento` e `status='pago'`; distinguir "Total a receber" de "previstas".
7. **Esforço: 1 dia.**

### D2. Gerencial — `/dashboards/gerencial` · perm `comercial.`
1. **O que faz:** Faturamento, ticket, atendimentos, sessões e ranking top-10 serviços de OS fechadas (`os_servicos`) + financeiro real.
2. **Telas:** `DashFiltros` (default `90d`). 5 KPIs: *Faturamento, Ticket médio, Atendimentos, Sessões realizadas, Taxa de retorno (Δ agend.)*. `GerServBusca` (busca serviço fora do top-10). 4 Charts (Top10 faturamento; Top10 sessões; Faturamento por forma de pagamento; Receita por mês). Tabela "Top 10 detalhamento" + CSV.
3. **Backend:** `contar('agendamentos')` **`count:'exact',head:true`** ×3 (total/concluido/cancelado, `dateCol='inicio'`); `pullLancamentos('receita')` **`.range()`**; `pullOS(status:'fechada')` **`.range()` até 20000**; `pullServicosPorOS` → `os_servicos.select('servico_id,quantidade,preco_total,total,servicos(nome)')` **embed `servicos`**, `.in('os_id',chunk de 120)`, **amostra RANK_MAX_OS=3000**, degrada em erro.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL.** Ratios/tickets **REAIS, não hardcoded** (`ticket=receita/atend`, `taxaRetorno=pct(concluido,total)`, serviços de `os_servicos`). Ressalvas: "Taxa de retorno" é proxy de comparecimento (não retorno real); ranking é amostra 3000 OS (top-10 aproximado em janelas amplas).
6. **P/ 100%:** métrica real de recompra; remover cap 3000 (RPC/materialized view); validar `os_servicos.total`×`preco_total`.
7. **Esforço: 2 dias.**

### D3. Funil de Vendas — `/dashboards/funil` · perm `comercial.`
1. **O que faz:** Funil real do ERP: Agendamentos → Comparecimento → Vendas (OS fechadas) → Receita, com conversão por unidade e leads por origem.
2. **Telas:** Filtros Período (default `tudo`), Unidade, **Tipo de unidade** (Ambas/Próprias/Franquias). Funnel SVG 4 estágios. 6 KPIs (*Agendamentos, Comparecimento (n+%), Vendas (n+%), Ticket médio, Conversão total, Receita*). 2 Charts (Leads por origem; Agendamentos por status). Breakdown por unidade (chart+tabela). Nota "Novos×Revenda não registrado". Banner cap.
3. **Backend:** `unidades.select('id,cnpj')` (filtro própria×franqueada via `uniEhPropria`); `contar('agendamentos')` **head:true** por status; `pullOS(status:'fechada')` por unidade; `crm_leads.select('origem').eq('pipeline','cliente')` **[⚠ sem `.range`/`.limit`/count → leitura potencialmente ilimitada de `origem`, contra a própria "regra de ouro"]**.
4. **Integrações:** nenhuma (crm_leads interno).
5. **Estado real: FUNCIONAL.** Ratios hardcoded do legado **REMOVIDOS** (confirmado em `dashboards.ts`). Números reais. Nota honesta Novos×Revenda. Risco de eficiência: query `crm_leads.origem` sem limite.
6. **P/ 100%:** limitar/agregar `crm_leads.origem` (RPC group-by); expor Novos×Revenda quando o ERP registrar por venda.
7. **Esforço: 1.5 dias.**

### D4–D7. Vendas (`vendas-geral`/`vendas-mes`/`vendas-comparativo`/`vendas-historico`) · **`admin:true`** (+ `ehAdmin(papel)`)
Os 4 são wrappers de 3 linhas que renderizam `<VendasReal slug sp podeVer={ehAdmin(papel)}>`, diferindo só pelo `slug`→`VENDAS_CFG`:

| slug | título | defPeriodo | comparativo |
|---|---|---|---|
| vendas-geral | Vendas · Visão Geral | `ano` | não |
| vendas-mes | Vendas · Mês Atual | `mes` | não |
| vendas-comparativo | Vendas · Comparativo | `mes` | **sim** |
| vendas-historico | Vendas · Histórico | `ano` | não |

1. **O que faz:** Dashboards de vendas admin-only (franqueadora) sobre OS fechadas reais; `vendas-comparativo` puxa janela anterior e mostra deltas.
2. **Telas:** Gate RBAC "Acesso restrito" p/ não-admin (nenhuma query roda). Badge ADMIN. Filtros Período/Unidade/ExportCsv. 4 KPIs (*Receita (OS fechadas), Vendas, Ticket médio, Descontos concedidos*; Receita/Vendas com Δ% no comparativo). Card comparativo. Charts "Receita por mês (12m)" + "Receita por unidade" (só sem unidade fixa). Tabela "Vendas por unidade".
3. **Backend:** `pullOS(status:'fechada')` **`.range()` até 20000** (2× no comparativo; por unidade nas 20 primeiras). `vendas=rows.length`, `receita=Σtotal`, `desconto=Σdesconto_total`, série mensal por `criado_em.slice(0,7)`.
4. **Integrações:** nenhuma.
5. **Estado real: FUNCIONAL (migrado do iframe legado).** Comentários confirmam substituição do **iframe estático que apontava p/ outro projeto Supabase (login próprio, tabelas inexistentes no ERP)**. 100% real agora. Empty-states honestos. Ressalva: os 4 são quase-duplicatas (mesma view, presets diferentes); `vendas-historico` mostra os mesmos 12 meses de `vendas-geral`.
6. **P/ 100%:** diferenciar as telas (histórico multi-ano — hoje `ultimosMeses(fim,12)`; comparativo por unidade/serviço; ranking de vendedor via `criado_por`+`nomesPerfis`, disponível mas não usado).
7. **Esforço: 2.5 dias** (para os 4 combinados virarem views genuinamente distintas).

**Helpers de dashboard:** `error.tsx` (boundary — "Não foi possível carregar os indicadores" + retry; garante que query falha nunca vira zero silencioso). **`SegToggle.tsx` é código morto** — fornecido mas NÃO usado por nenhuma página (o funil usa `<select>` do `DashFiltros`).

---

# TABELA-RESUMO

## Relatórios (25 telas — 24 no menu + notas-fiscais órfã)

| # | Relatório | Perm | Estado | Dias |
|---|---|---|---|---|
| 1 | Assinaturas | comercial. | PARCIAL (só catálogo) | 4 |
| 2 | Ocorrências/Intercorrências | comercial. | FALTA (placeholder, sem query) | 4 |
| 3 | Agendamentos | comercial. | FUNCIONAL (dims parciais) | 1.5 |
| 4 | Anamnese/Ficha Técnica | comercial. | PARCIAL (só catálogo) | 4 |
| 5 | Atendimentos | comercial. | FUNCIONAL (dims parciais) | 2 |
| 6 | Avaliações | comercial. | FALTA (empty honesto, sem tabela) | 4 |
| 7 | Clientes | comercial. | FUNCIONAL (estimated, sem unidade) | 2 |
| 8 | Contratos | comercial. | PARCIAL (seed data) | 3 |
| 9 | Crédito em dinheiro | comercial. | PARCIAL (proxy, ⚠cap1000) | 4 |
| 10 | CRM | comercial. | FUNCIONAL (dep. dados) | 2 |
| 11 | Crédito Recorrente | comercial. | PARCIAL (⚠cap1000) | 5 |
| 12 | Descontos | comercial. | FUNCIONAL | 0.5 |
| 13 | Estatísticas | comercial. | FUNCIONAL (base global) | 2 |
| 14 | Exportações | comercial. | FUNCIONAL (hub; log falta) | 2 |
| 15 | Faturamento | financeiro. | FUNCIONAL | 0.5 |
| 16 | Ranking de Vendas | comercial. | FUNCIONAL | 0.5 |
| 17 | Fidelidade | comercial. | FUNCIONAL (sem unidade) | 2 |
| 18 | Financeiro/Contábil (DRE) | financeiro. | PARCIAL (só receitas) | 3 |
| 19 | Mensagens WhatsApp API | comercial. | FUNCIONAL (se há campanhas) | 1 |
| 20 | Metas | comercial. | FUNCIONAL (dep. dados) | 1.5 |
| 21 | Ordens de serviço | comercial. | FUNCIONAL | 0.5 |
| 22 | Pacotes | comercial. | FUNCIONAL (sem breakdown pacote) | 1 |
| 23 | Pagamentos | financeiro. | FUNCIONAL (⚠cap1000; sem premiação) | 1.5 |
| 24 | Perfis de acesso | comercial. | FUNCIONAL (⚠bug escala >1000) | 1 |
| — | Notas Fiscais (órfã do menu) | (s/perm) | PARCIAL/condicional (migration) | 2 |
| | **Subtotal Relatórios** | | | **≈54.5** |

## Dashboards (7 telas)

| # | Dashboard | Perm | Estado | Dias |
|---|---|---|---|---|
| D1 | Financeiro/Contábil | financeiro. | FUNCIONAL | 1 |
| D2 | Gerencial | comercial. | FUNCIONAL (retorno=proxy; ranking amostra 3k) | 2 |
| D3 | Funil de Vendas | comercial. | FUNCIONAL (⚠crm_leads sem limite) | 1.5 |
| D4 | Vendas · Visão Geral | admin | FUNCIONAL (migrado do iframe) | — |
| D5 | Vendas · Mês Atual | admin | FUNCIONAL | — |
| D6 | Vendas · Comparativo | admin | FUNCIONAL | — |
| D7 | Vendas · Histórico | admin | FUNCIONAL (=geral, 12m) | — |
| | D4–D7 (VendasReal compartilhado) | | | **2.5** |
| | **Subtotal Dashboards** | | | **7** |

**TOTAL GERAL p/ 100%: ≈ 61.5 dias-dev** (dominado por fontes de dados upstream — despesas, `nfse`, tabelas de avaliações/ocorrências/assinatura-cliente/carteira — não por UI de relatório).

---

## Achados críticos para a homologação (confrontar)

1. **Menu otimista:** `ROTAS_FUNCIONAIS` marca as 31 rotas como "funcional", mas `avaliacoes` e `ocorrencias` **não têm tabela-fonte** (FALTA real, empty-state honesto). Critério do flag = "empty-state honesto OU query real", não "com dados".
2. **Bugs de corte silencioso (`slice(0,1000)`):** `credito-dinheiro`, `credito-recorrente`, `pagamentos` — unidades com >1000 OS **subcontam pagamentos silenciosamente**. `perfis-acesso` tem 3 leituras sem paginação (`usuario_cargos`, `cargo_permissoes`, `perfis_usuario.limit(2000)`) que truncam em 1000. `funil` lê `crm_leads.origem` sem limite (eficiência).
3. **`relatorios/financeiro` (DRE):** confirmado "**só receitas, sem despesas**" — código pronto p/ despesa, mas backend sem linhas `tipo='despesa'`.
4. **Vendas migrados:** os 4 dashboards `vendas-*` **saíram do iframe estático** (que apontava p/ outro Supabase) e hoje leem OS reais — porém são **quase-duplicatas** (mesma view, presets diferentes).
5. **`os_pacotes` e várias FKs vieram VAZIAS do import BEMP** (`profissional_id`, `servico_id`, `cliente_id` em agendamentos; `pacote_id` em OS; `unidade_origem_id` em clientes) — bloqueia breakdowns por profissional/serviço/pacote/unidade em vários relatórios; não é bug de código, é lacuna de dado.
6. **Nenhuma página toca integração ao vivo** (Uazapi/Evolution/PagoLivre/storage): `relatorios/whatsapp` só lê a tabela agregada `campanhas_whatsapp`; `credito-recorrente` só menciona PagoLivre conceitualmente.
7. **Código morto:** `src/components/dashboards/SegToggle.tsx` não é usado por nenhuma página.
8. **Index `/relatorios` desatualizado:** lista `pacotes` e `whatsapp` em "Em desenvolvimento" embora ambos estejam construídos e leiam tabelas reais (3 arrays hardcoded como fonte de verdade paralela ao menu).

Arquivos-fonte de fundação relevantes: `src/lib/relatorios.ts`, `src/lib/dashboards.ts`, `src/components/dashboards/agg.ts`, `src/components/dashboards/VendasReal.tsx`, `src/components/relatorios/relPeriodo.ts`, `src/lib/menu.ts`.
