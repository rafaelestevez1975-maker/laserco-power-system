# Módulo 3b — Gestão: Operação, Marketing & RH

> Documento oficial de homologação. Escopo: seção **Gestão** do menu (`src/lib/menu.ts`), **exceto** Relatórios e Dashboards.
> 14 funcionalidades / 24 rotas: Mensagens e Automações, Disparos WhatsApp API, CRM, Leads do Site, Canais, Gestão de Indiques,
> Recursos Humanos (9 folhas), Marketing, Comunicados, Chamados, Checklist de Indicadores, Universidade Corporativa, Disco Virtual, Notas Fiscais.
> Base: `/home/jvneto/ProjetosLMK/Laser/laserco-power-system` · Next.js 15 (App Router) + Supabase (backend `lkii`).
> Cada bloco é fiel ao código-fonte lido integralmente (page.tsx + actions.ts + libs + migrations). Nada foi inventado.

---

## Fundação comum — como o RBAC realmente decide (vale para TODAS as telas abaixo)

Há **dois eixos independentes** de controle. Confundi-los é o erro clássico nesta base:

**(A) Visibilidade no menu → por RECURSO (cargo→permissões), NÃO por `papel`.**
`src/components/layout/Sidebar.tsx:23-25` `hasPerm(perm, recursos)`: se o `perm` termina em `.` (ex.: `'marketing.'`, `'operacoes.'`, `'rh.'`) basta ter QUALQUER recurso do módulo (`recursos.some(r => r.startsWith(perm))`); sem sufixo (ex.: `'crm.lead'`, `'rh.ponto'`, `'treinamento.curso'`) exige o recurso exato. `recursos` vêm de `getSessionContext` → `resolveRecursos` (`src/lib/session.ts:63-82`), que lê `usuario_cargos → cargo_permissoes → permissoes.recurso_id` via service-role. `admin_geral` faz bypass total (`isAdmin`, `recursos=[]`).
Seed dos perfis em `scripts/migrations/perfis-acesso.sql:20-77` (nível **CARGO**):
- `crm.*` → super_admin, administrador, **expansão** (crm `*`), marketing (crm `ler`), diretor/auditor (`*` ler/exportar).
- `marketing.*` → super_admin, administrador, **marketing**, diretor, auditor, expansão (marketing `ler`).
- `operacoes.*` → super_admin, administrador, **operacoes**, franqueado, gerente_unidade, diretor, auditor, supervisor/técnico (ler).
- `rh.*` → super_admin, administrador, **rh**, diretor, auditor, franqueado (ler), gerente_unidade (ler).
- `treinamento.*` → super_admin, administrador, **rh**, diretor, auditor, franqueado (ler).
- `financeiro.*` → super_admin, administrador, **financeiro**, diretor, juridico (ler/exportar), auditor, franqueado/gerente (ler).

**(B) Autorização de AÇÃO (server actions) → por `papel` (`perfis_usuario.papel`).** `src/lib/rbac.ts`: `ehAdmin/temPapel/exigirPapel`. `admin_geral` sempre passa; senão o `papel` (`colaborador, rh, gestor, admin_geral, financeiro, crm, tecnico, operacoes, sac`) precisa estar na lista da action.

**Descasamento estrutural (atravessa todas as telas):** quem **VÊ** (eixo recurso/cargo) pode **não poder ESCREVER** (eixo papel). Ex.: um cargo com `marketing.*` mas `papel='colaborador'` vê a tela mas toda escrita retorna "sem permissão".

**Integração WhatsApp (Uazapi) é REAL** (`src/lib/uazapi.ts`, `UAZAPI_BASE_URL`/`UAZAPI_ADMIN_TOKEN` presentes em `.env.local`), mas **poucas telas a disparam de fato** — o mapa de quem envia de verdade está por bloco. **Não há pg_cron/pg_net/Edge Function** para nenhuma automação programada desta seção (as únicas rotas `/api` são `webhooks/uazapi` e `cron/ingest-sac`).

Todas as 24 rotas constam em `ROTAS_FUNCIONAIS` (`src/lib/menu.ts:215-256`) → "acesas" no menu. Isso NÃO significa 100% completas — o estado real (funcional/parcial/stub) está detalhado por bloco.

---

# 1) Mensagens e Automações — `/automacoes`

**1. Rota/perm.** `/automacoes` · `perm: 'marketing.campanha'` (recurso exato). **Vê:** admin_geral + cargos com `marketing.campanha` (super_admin, administrador, marketing). Diretor/auditor têm `marketing:ler/exportar` → veem se o recurso `marketing.campanha` estiver na grade deles. **Escreve:** `PAPEIS_ESCRITA=['gestor','operacoes']` + admin (`actions.ts:9`). Arquivos: `src/app/(app)/automacoes/page.tsx`, `.../actions.ts`, `src/lib/automacoes.ts`, `src/components/automacoes/AutomacoesView.tsx`.

**2. O que faz.** Catálogo das 22 automações padrão da rede (revenda 8m, boas-vindas, confirmação/lembretes de agenda, no-show, pós-sessão, NPS, aniversário, reativação, nutrição de leads, metas etc.) com liga/desliga por unidade, automações personalizadas e a configuração do fluxo de não-comparecimento.

**3. Telas/abas/modais.** 1 tela. Grid de cards do catálogo (`AUTOS_PADRAO`, 22 itens em `src/lib/automacoes.ts:44-80`) filtráveis por categoria (`AUTO_CATEGORIAS`), cada card com switch ativa/inativa e detalhe de passos (`AutoDet`). Card do WhatsApp da unidade (status do canal). Modais: **Nova automação** (personalizada), **Editar automação**, **Config Não-comparecimento** (`NoShowForm`: 1ª msg após, máx/dia, intervalo, mensagem, reagenda/exclui/oculta). KPIs: ativas X/Y (real) + enviadasMes/taxaResposta/recuperados.

**4. Backend.** Tabelas: `automacoes_estado` (override on/off por `unidade_id,chave`), `automacoes_custom` (personalizadas: escopo `rede`/`unidade`, nome/gatilho/acao/categoria), `automacao_noshow` (config por `unidade_id`), `canais_whatsapp` (para o status do canal). Server actions (`actions.ts`): `alternarAutomacao` (upsert estado), `criarAutomacao` (admin→escopo `rede`; gestor/operacoes→`unidade`), `editarAutomacao`, `excluirAutomacao` (padrão da rede só admin), `salvarNoShow`. O catálogo `AUTOS_PADRAO` é **estático em código** (não é tabela).

**5. Integrações. STUB de execução — confirmado.** Nenhum scheduler/cron/worker executa as automações: `grep` por `automacoes_estado`/`automacao_noshow`/`AUTOS_PADRAO` só bate dentro da própria feature — nada nas rotas `/api`, nada em `webhooks/uazapi`. As automações **não disparam WhatsApp nem push**; a tela apenas **persiste a configuração**. O próprio código confessa a ausência de telemetria: KPIs `enviadasMes/taxaResposta/recuperados` são `null` propositalmente — *"sem telemetria de envio/no-show no backend ainda → null = estado honesto (antes eram 4820/38/64 inventados)"* (`page.tsx:82-90`). O catálogo declara que o estado do legado *"vive em memória"* (`src/lib/automacoes.ts:4-9`).

**6. Estado real: PARCIAL (config real, execução FALTA).** Evidência de persistência real: `sb.from('automacoes_estado').upsert({... ativa ...}, { onConflict: 'unidade_id,chave' })` (`actions.ts:32-35`); custom/no-show idem. Evidência de que NÃO executa: inexistência de qualquer consumidor/agendador dos gatilhos. É a definição de "toggle de vitrine": grava a intenção, não realiza a ação.

**7. Requisitos p/ 100%.** Motor de automação: agendador (pg_cron/Edge Function/worker externo) que avalie cada gatilho (8 meses desde a sessão, 24h/2h antes, no-show +2h, aniversário, inatividade 60d, meta a cada 3 dias etc.) contra dados reais (agendamentos, clientes, metas), monte a mensagem com placeholders e chame `uazapi.sendText/criarCampanhaSimples`; telemetria de envio (enviadas/respostas/recuperados) por automação; execução real do fluxo no-show (2 tentativas, exclusão, cômputo). É o item mais pesado da seção.

**8. Esforço p/ 100%: ~10 dev-days.**

---

# 2) Disparos WhatsApp API — `/disparos`

**1. Rota/perm.** `/disparos` · `perm: 'marketing.campanha'`. **Vê:** = Automações (marketing.campanha + admin). **Escreve:** `PAPEIS_ESCRITA=['gestor','operacoes']` + admin (`actions.ts:10`). Arquivos: `src/app/(app)/disparos/page.tsx`, `.../actions.ts`, componente `src/components/disparos/DisparosTabs.tsx` + `DisparoComposer.tsx`; **reusa o disparo real de** `src/app/(app)/expansao/disparos/actions.ts`.

**2. O que faz.** Envio em massa por WhatsApp: monta campanhas por canal conectado, segmenta/importa bases de contatos, agenda envios (delay anti-ban gerido pela Uazapi) e organiza Grupos VIP; histórico de campanhas por unidade.

**3. Telas/abas/modais.** Abas (`DisparosTabs`): **Campanhas** (histórico + KPIs), **Bases** (segmentador + importar externa), **VIP** (agendamento de grupos), **API** (cards de status dos canais Uazapi). **Composer** (`DisparoComposer`) com seleção de canal, texto/template, público (listas reais), delay min/max, agendamento. Modais de segmento (`SEG_CAMPOS`) e importação.

**4. Backend.** Tabelas: `disparo_campanhas` (nome, base_nome, canal_nome, status[draft/sched/run/done], `enviadas/entregues/lidas/respostas`, agendada_para, uazapi_id, unidade_id), `disparo_bases` (nome, tipo[sistema/externa], contatos, criterios jsonb, numeros[]), `vip_grupos` (datas convite/aquecimento/oferta, membros, status, link_publico), `disparo_templates`, `clientes`/`servicos`/`unidades` (segmentador). Actions (`disparos/actions.ts`): `criarBaseSegmento` (COUNT real), `importarBaseExterna`, `excluirBase`, `registrarCampanha`, `excluirCampanha`, `respondentesParaCRM`, `agendarGrupoVip`, `excluirGrupoVip`. Envio real (`expansao/disparos/actions.ts`): `dispararCampanha`, `dadosDisparos`, `listarTemplates/salvarTemplate/excluirTemplate`.

**5. Integrações. Envio = REAL via Uazapi `/sender/simple`.** `DisparoComposer` chama `dispararCampanha` (`expansao/disparos/actions.ts:51`) → valida canal `connected` → `criarCampanhaSimples(canal.token, { numbers, text, delayMin/Max, scheduledFor })` (`src/lib/uazapi.ts:232-245`, endpoint `/sender/simple`, agendamento por epoch-ms) → `registrarCampanha` grava o histórico com `enviadas = nº submetidos`. Segmentador = **COUNT real** de `clientes` (verificado/cidade/estado; critérios de histórico de compra são honestamente ignorados em vez de fabricar estimativa — `disparos/actions.ts:22-35`).

**6. Estado real: PARCIAL (envio funcional; métricas e ações derivadas mortas).**
- FUNCIONAL: disparo/agendamento real, bases (segmento COUNT real + importação de números), VIP e templates persistem.
- **ACHADO CRÍTICO — métricas nunca gravadas:** as colunas `disparo_campanhas.entregues / lidas / respostas` e `vip_grupos.membros` **jamais são escritas por código algum**. `grep from('disparo_campanhas')` retorna só `insert` (`actions.ts:113`), `delete` (`:127`), `select` (`:141` e `page.tsx:51`) — **nenhum `update`**. O webhook `api/webhooks/uazapi/route.ts` alimenta apenas `sac_whatsapp_chats` (SAC/IA), não os `messages_update` das campanhas. Consequência: entregues/lidas/respostas/membros ficam **permanentemente 0** (estado honesto, mas cego).
- **Ação derivada morta:** `respondentesParaCRM` (`actions.ts:137-165`) lê `disparo_campanhas.respostas` (sempre 0) → sempre retorna *"Esta campanha ainda não tem respondentes"*. Fica inoperante até existir a integração de callbacks (ou preenchimento manual do campo no banco).
- VIP: `agendarGrupoVip` grava `link_publico = laserco.app/vip/<slug>` (URL cosmética, sem página pública real que colete membros).

**7. Requisitos p/ 100%.** Ligar `messages`/`messages_update` do webhook Uazapi às campanhas (casar `uazapi_id`/`messageid` → atualizar enviadas/entregues/lidas e criar respostas → destravar `respondentesParaCRM`); página/coleta real de membros VIP; opcional: envio de mídia em massa e relatório por campanha.

**8. Esforço p/ 100%: ~4 dev-days.**

---

# 3) CRM — `/crm`

**1. Rota/perm.** `/crm` · `perm: 'crm.lead'` (recurso exato). **Vê:** admin_geral + cargos com `crm.lead` (super_admin, administrador, **expansão**, e quem tenha `crm:ler` como marketing/diretor/auditor). **Escreve leads:** qualquer sessão autenticada (RLS decide); **personalizar funil (etapas):** só `admin_geral`. Arquivos: `src/app/(app)/crm/page.tsx`, `.../actions.ts`, `src/components/crm/CrmBoard.tsx`.

**2. O que faz.** Funil de vendas de CLIENTES em Kanban (drag-and-drop entre etapas), com origem/temperatura/score do lead; separado do funil de Expansão (franquias) por `pipeline='cliente'`.

**3. Telas/abas/modais.** 1 tela — board Kanban (`CrmBoard`) com colunas = `crm_etapas` (pipeline cliente) e cards = `crm_leads`; contagem real por etapa (query separada, sem cair no teto de 500 do board — `page.tsx:31-45`). Modal **Novo lead** (nome, telefone, origem, serviço, valor estimado, unidade, etapa, responsável, temperatura). Ações de funil (admin): criar/renomear/excluir etapa.

**4. Backend.** Tabelas: `crm_etapas` (nome, ordem, cor, is_sistema, ativo, `pipeline`), `crm_leads` (nome, telefone, origem, servico_interesse, valor_estimado, etapa_id, status, `ia_score`, temperatura, responsavel_id, empresa_id, unidade_id, `pipeline`), `perfis_usuario` (responsáveis), `unidades`. Constraints reais (migrations 015/050): `origem` CHECK (`manual/formulario/instagram/whatsapp/indicacao/google/outros/geolocalizado/site`) e `temperatura` CHECK (`gelado/frio/morno/quente/ardente`) — o código mapeia rótulos do legado para esses valores (`mapOrigem`, `actions.ts:31-43`). Actions: `criarLead`, `moverLead`, `criarEtapa`/`renomearEtapa`/`excluirEtapa` (todas admin; `excluirEtapa` protege etapas do sistema e etapas com leads).

**5. Integrações.** Sem WhatsApp/e-mail direto na tela. É o **destino** de vários fluxos: `disparos.respondentesParaCRM`, `leads-site.rotearSiteLead`, `indiques.enviarNovosAoCrm`/`criarIndicacao` — todos inserem em `crm_leads` na 1ª etapa do `pipeline='cliente'`. `ia_score` é campo persistido (entrada manual/externa, não há IA de scoring rodando aqui).

**6. Estado real: FUNCIONAL.** Evidência: leads e etapas persistem de verdade (`crm_leads.insert` com resolução de `empresa_id` pela unidade, `actions.ts:64-76`; `moverLead` faz `update etapa_id`); contagem por etapa é COUNT real; `excluirEtapa` tem guarda de integridade (`actions.ts:135-139`). Board respeita `pipeline='cliente'` para não misturar com Expansão.

**7. Requisitos p/ 100%.** Detalhe/edição do lead (histórico, atividades, conversão em cliente/venda); filtros/busca no board; disparo de WhatsApp a partir do card; scoring IA real (hoje `ia_score` é campo passivo).

**8. Esforço p/ 100%: ~1,5 dev-days.**

---

# 4) Leads do Site — `/leads-site`

**1. Rota/perm.** `/leads-site` · `perm: 'crm.lead'`. **Vê:** = CRM (crm.lead + admin). Roteamento exige sessão autenticada. Arquivos: `src/app/(app)/leads-site/page.tsx`, `.../actions.ts`, `src/lib/supabase/site.ts` (`siteClient`), `src/lib/sac-ingest.ts`.

**2. O que faz.** Caixa de entrada dos formulários do site institucional (Laser Company): lista os leads captados e roteia cada um para o destino correto — CRM (comercial), SAC (atendimento, franqueadora) ou RH (currículo → banco de talentos).

**3. Telas/abas/modais.** 1 tela — lista de leads do site com tipo/nome/contato/mensagem; ação **Rotear** (escolhe unidade de destino → CRM/SAC/RH). Origem exibida a partir de `lasercompany_leads` (site) ou `site_leads` (fallback).

**4. Backend.** **Ponte de dois bancos:** fonte primária `siteClient()` → `lasercompany_leads` (Supabase do SITE, `riut...`), com **fallback** para `site_leads` (lkii) quando o cliente do site não está configurado. Destinos: `crm_leads` (pipeline cliente, 1ª etapa), `sac_tickets` (empresa franqueadora, `unidade_id=null`), `candidatos` (+ garante `vagas` "Banco de Talentos (Site)"). Action: `rotearSiteLead(siteLeadId, unidadeId)` — parseia o payload, decide destino por `tipo` (`curriculo`→RH, `sac`→SAC, demais→CRM), insere no destino e marca o lead como roteado (`_roteado`/`status='roteado'`).

**5. Integrações. Ponte com o SITE = REAL.** `siteClient()` conecta ao Supabase externo do site e lê/atualiza `lasercompany_leads` (`actions.ts:21-58`); se ausente, degrada para `site_leads` no lkii. **Importante:** o fluxo SAC normal é ingerido **automaticamente** por `src/lib/sac-ingest.ts` (rota `api/cron/ingest-sac`); esta tela é o caminho **manual** de triagem. Não há WhatsApp/e-mail no roteamento.

**6. Estado real: FUNCIONAL.** Evidência: roteamento persiste no destino certo com escopo correto — currículo cria `candidatos` sob a vaga guarda-chuva (`actions.ts:63-83`); SAC vai para a franqueadora (`FRANQUEADORA_EMPRESA_ID`, `unidade_id=null`, `actions.ts:89-101`); CRM insere na etapa inicial do `pipeline='cliente'` (`actions.ts:116-127`); marca `_roteado` para evitar duplicidade (`jaRoteado`). Depende de a env do `siteClient` estar configurada em prod (senão opera só o fallback `site_leads`).

**7. Requisitos p/ 100%.** Confirmar credenciais do `siteClient` em produção; filtros/busca e status na lista; roteamento em lote; deduplicação por telefone/e-mail; auditoria do roteamento.

**8. Esforço p/ 100%: ~1,5 dev-days.**

---

# 5) Canais — `/canais`

**1. Rota/perm.** `/canais` · `perm: 'marketing.'` (prefixo). **Vê:** admin_geral + cargos com qualquer recurso `marketing.*` (super_admin, administrador, marketing, diretor, auditor, expansão-leitura). **Opera canal:** `PAPEIS_CANAL=['gestor','operacoes','sac']` + admin (`canais/actions.ts:13`), com guarda de escopo (gestor só canal geral ou da própria unidade ativa; admin qualquer; SAC só canais `geral`). Arquivos: `src/app/(app)/canais/page.tsx`, `.../actions.ts`, `src/lib/uazapi.ts`, `src/components/canais/CanaisManager.tsx`.

**2. O que faz.** Central de números WhatsApp da rede: cria/vincula instâncias Uazapi por unidade ou "geral" (franqueadora), conecta via QR, monitora status e saúde de envio, e configura o webhook que faz as mensagens caírem na Triagem/IA.

**3. Telas/abas/modais.** 1 tela (`CanaisManager`) — lista de canais (`/laser/i`) com status (connected/…), owner (número), escopo/unidade/atendente, rótulo, delay min/max e **selo de restrição** (número novo sob timelock 463). Ações: **Criar canal**, **Vincular/editar** (escopo unidade/geral, delay, atendente), **Conectar** (modal QR com polling), **Sincronizar** (reaplica webhook), **Desconectar**, **Excluir**.

**4. Backend.** Tabela `canais_whatsapp` (instancia_nome, escopo[unidade/geral], unidade_id, atendente_id, rotulo, delay_min, delay_max, criado_por). As instâncias em si vivem na Uazapi (não no Supabase). Escrita em `canais_whatsapp` usa **service-role** (`adminClient`) porque a RLS não libera SAC, mas a autorização já foi feita por papel+escopo. Actions: `criarCanal`, `salvarVinculo`, `conectarCanal`, `statusCanal`, `sincronizarCanal`, `desconectarCanal`, `excluirCanal`.

**5. Integrações. 100% REAL Uazapi.** `createInstance` (`/instance/create`, admintoken), `connectInstance` (`/instance/connect`, gera QR data-URL), `getStatus` (`/instance/status`), `disconnectInstance`, `deleteInstance`, `configurarWebhook` (`/webhook`, eventos `messages/messages_update/connection`, `excludeMessages:['wasSentByApi']` p/ evitar loop com a IA), `limitesEnvio` (`/instance/wa_messages_limits` → detecta restrição 463 de número novo). `urlWebhook()` força domínio público (nunca localhost) com `?secret=`. Verificado: `uazapiConfigurado()` true (envs presentes).

**6. Estado real: FUNCIONAL (a mais madura do cluster WhatsApp).** Evidência: todo o ciclo de vida do número é operado ao vivo contra a Uazapi (criar→QR→conectar→status→sincronizar→desconectar→excluir); saúde de envio real (`limitesEnvio` pinta o selo de restrição). Guarda de escopo por unidade/papel implementada e testável.

**7. Requisitos p/ 100%.** Nada estrutural — depende de operação (aparelhos/números conectados) e da liberação do timelock 463 dos números novos. Melhorias: histórico de conexões, alerta proativo de queda.

**8. Esforço p/ 100%: ~0,5 dev-day.**

---

# 6) Gestão de Indiques — `/indiques`

**1. Rota/perm.** `/indiques` · `perm: 'crm.lead'`. **Vê:** = CRM (crm.lead + admin). **Escreve indicação/status/sorteio:** qualquer sessão; **prêmio/meta do mês:** só `admin_geral` (`actions.ts:170`). Arquivos: `src/app/(app)/indiques/page.tsx`, `.../actions.ts`, `src/lib/indiques.ts`.

**2. O que faz.** Programa de indicações "Indique e Ganhe": registra indicador + 3 a 5 indicados, empurra cada indicado como lead no CRM, acompanha o Kanban de status, define prêmio/meta mensal e sorteia o ganhador do mês.

**3. Telas/abas/modais.** 1 tela — KPIs do mês (indiques no mês, % da meta, projeção), Kanban de indicados (`IND_STATUS`: Novo/Em contato/…), card **Prêmio & Meta do mês**, card **Sorteio** (registrar ganhador / notificar). Modais: **Nova indicação** (indicador + lista 3–5), **Definir prêmio**, **Registrar sorteio**. Janela sempre do MÊS ATUAL por `criado_em` (`indicacoes` não tem `mes_ref` — `page.tsx:15-18`).

**4. Backend.** Tabelas: `indicacoes` (indicador_nome/telefone/email/cpf, origem[balcao/site/link], premio_descricao, qtd_indicados, status), `indicacao_indicados` (nome, telefone, email, status[pendente…comprou/desistiu] + timestamps por status), `indique_config` (premio, valor_ref, observacao, meta_mensal, `mes_ref`, upsert por empresa/unidade/mês), `indique_sorteios` (ganhador_nome/whats/email, premio, `notificado`), `crm_leads`/`crm_etapas`, `unidades`, `perfis_usuario`. Actions: `criarIndicacao` (valida 3–5, cria indicação+indicados **e leads no CRM**), `setStatusIndicado`, `enviarNovosAoCrm`, `salvarPremio` (admin), `registrarSorteio`, `notificarGanhador`.

**5. Integrações. Geração de leads no CRM = REAL; notificação = STUB.** `criarIndicacao` e `enviarNovosAoCrm` inserem de verdade em `crm_leads` (origem `indicacao`, temperatura `morno`, pipeline cliente — helper `criarLeadsCrmDeIndicados`, `actions.ts:141-160`). **`notificarGanhador` é flag apenas**: apesar do comentário *"notificado (e-mail + WhatsApp)"*, o corpo só faz `update({ notificado: true })` (`actions.ts:239-247`) — **não envia WhatsApp nem e-mail**. `link_publico` de origem "link"/"site" não tem página pública de captação.

**6. Estado real: FUNCIONAL (com notificação stub).** Evidência de real: indicação + indicados persistem e viram leads no CRM (`revalidatePath('/crm')`); status com carimbo temporal; prêmio/meta upsert por mês; sorteio grava ganhador. Evidência de stub: `notificarGanhador` só marca booleano. Degrada com instrução clara se `indiques.sql` não aplicada (`actions.ts:62-63,195,231`).

**7. Requisitos p/ 100%.** Envio real ao ganhador (Uazapi/e-mail); página pública de indicação por link (origem `link`/`site`); sorteio automático a partir do pool do mês; recompensa/crédito ao indicador quando o indicado "comprou".

**8. Esforço p/ 100%: ~2 dev-days.**

---

# 7) Recursos Humanos — grupo (`/ponto` + 8 folhas `/rh/*`)

> Grupo de menu `perm: 'rh.'` (`src/lib/menu.ts:123-135`). **Vê o grupo:** admin_geral + cargos com `rh.*` (super_admin, administrador, rh, diretor, franqueado-ler, gerente_unidade-ler, auditor). **Detalhe RBAC:** só **Ponto Digital** tem `perm` próprio (`rh.ponto`); as outras 8 folhas **não têm `perm`** → `canSee` cai em `return true` (`Sidebar.tsx:49`): uma vez que o grupo abre, as 8 aparecem para quem vê o grupo (sem recorte fino por sub-tela). **Migration:** `scripts/migrations/rh.sql` (degrade gracioso com banner se ausente). **Modelo pessoas:** `perfis_usuario` (login+papel, `id`=`auth.user.id`) ⟷ `colaboradores` (`perfil_id`).

## 7.1 Ponto Digital — `/ponto`
**1.** `perm='rh.ponto'` · badge GPS. Vê quem tem `rh.ponto`. Escreve: `registrarPonto` (sessão), `salvarPontoConfig` (só admin), `criarAjustePonto`/`editarPonto` (`PAPEIS_GESTAO=['admin_geral','gestor','gerente','recepcao','rh']`). **2.** Registro de ponto por geolocalização com cerca virtual (Haversine) contra unidade OU casa (home office); gestão vê o espelho e ajusta marcações. **3.** 1 tela: card "Meu ponto" (toggle Presencial↔Home office, 4 botões `PONTO_TIPOS`), 4 KPIs, painel Mapa (Google Maps se `maps_key`, senão OSM), painel Config (admin), filtros GET, tabela paginada; **2 modais** (marcação manual, ajuste). **4.** Tabelas `registros_ponto` (tipo, data_hora, lat, lng, distancia_m, modo, validado_geo, fonte, ajustado_por, motivo_ajuste), `ponto_config` (raio, uni_lat, uni_lng, maps_key, modo_padrao), `colaboradores`. Helpers `haversine`/`dentroDaCerca` (`src/lib/rh.ts:35-52`, raio default 150 m). **5. GPS = REAL** (`navigator.geolocation.getCurrentPosition`; Haversine server-side; GPS da casa em `localStorage`); Google Maps embed real-opcional; sem GPS grava `fonte='manual'`. Sem cron/BEMP. **6. FUNCIONAL** — `registros_ponto.insert({... validado_geo, distancia_m ...})`; não-gestão só vê o próprio ponto. **7.** Aplicar `rh.sql` em prod; export do espelho; RBAC granular das 4 ações. **8. 2 dias.**

## 7.2 RH · Dashboard — `/rh`
**1.** Sem `perm` próprio (herda `rh.`); read-only. **2.** Painel inicial: KPIs (ativos, pendências, vagas abertas, departamentos), colaboradores por departamento, atalhos. **3.** 1 tela, sem abas/modais. **4.** COUNT reais em `colaboradores`, `solicitacoes_ferias` (pendentes), `atestados` (pendentes), `vagas` (abertas); escopo por `unidade_id`/`colabIds`; helper `safe()`→0 se migration ausente. **5.** Nenhuma. **6. FUNCIONAL** — números por agregação real; empty-state honesto. **7.** Tendência/headcount histórico; aniversariantes/admissões do mês. **8. 0,5 dia.**

## 7.3 RH · Colaboradores — `/rh/colaboradores`
**1.** Herda `rh.`; usa `criarColaborador`/`checarCpfDuplicado` de `/colaboradores/actions.ts` (`PAPEIS_ESCRITA=['admin_geral','gerente','recepcao','gestor','rh']`). **2.** Lista/busca/filtra colaboradores e abre admissão completa (~30 campos) na MESMA tabela `colaboradores` (sem duplicação). **3.** 1 tela: filtros + tabela paginada (25/pág) + **modal NovoColaborador** (pessoais/vínculo/financeiro/endereço/home office); detalhe `ColaboradorFicha`. **4.** `colaboradores` SELECT `count:'exact'` com filtros e busca `.or()`; escrita compartilhada com CPF-dedup. **5.** Nenhuma externa (liga ao modelo pessoas via `perfil_id`). **6. FUNCIONAL** — query paginada + escrita real. **7.** Edição/inativação inline; upload de documentos; export. **8. 1 dia.**

## 7.4 RH · Ponto (Jornada) — `/rh/ponto`
**1.** Herda `rh.`; read-only (marcação vive em `/ponto`). **2.** Espelho de jornada da semana + banco de horas a partir de `registros_ponto` reais. **3.** 1 tela: 3 KPIs (carga prevista, trabalhadas, banco), tabela colaborador×7 dias + Total + Saldo. **4.** `colaboradores` + `registros_ponto` da semana; cálculo `horasNoDia()`. Sem escrita. **5.** Nenhuma. **6. PARCIAL** — lê marcações reais e calcula, MAS `const HORAS_DIA = 8` é **fixo** (`page.tsx:11`), ignorando `colaboradores.jornada_diaria_horas` real; sem feriados/faltas. **7.** Usar jornada real do cadastro; feriados; fechamento mensal; export. **8. 1,5 dia.**

## 7.5 RH · Recrutamento — `/rh/recrutamento`
**1.** Herda `rh.`; escrita só por sessão (sem gate de papel). **2.** Banco de talentos + processo seletivo Kanban (dnd) por estágios, com WhatsApp de disponibilidade. **3.** **2 abas** (Currículos, Kanban 7 colunas) + **2 modais** (Novo currículo, Notas+score). **4.** `candidatos` (embed `vagas!inner(...)`, escopo por `vagas.unidade_id`), `vagas`. Actions: `moverCandidato`, `iniciarProcesso`, `atualizarNotas`, `criarCurriculo`, `avisarDisponibilidade`, `definirScore`. **5. WhatsApp Uazapi = REAL** em `avisarDisponibilidade` (`sendText(canal.token,…)`, `actions.ts:113`); `iniciarProcesso` só grava nota (envio automático NÃO dispara); `score_triagem_ia` é **manual** (não há IA). **6. FUNCIONAL** — CRUD + Kanban dnd otimista com rollback; cria vaga guarda-chuva se faltar. **7.** Disparo automático ao mover estágio; triagem IA real; anexo de currículo; RBAC por papel. **8. 1,5 dia.**

## 7.6 RH · Folha de Pagamento — `/rh/folha`
**1.** Herda `rh.`; `PAPEIS_FOLHA=['admin_geral','gestor','financeiro','rh']`. **2.** Gera/fecha/paga folha por competência calculando INSS/IRRF/FGTS/13º/líquido do salário bruto; holerite. **3.** 1 tela: seletor de competência, "Gerar folha"/"Gerar com 13º", 6 KPIs, tabela status (aberta→fechada→paga); **1 modal Holerite**. **4.** `folha_pagamento` (competencia, salario_bruto, inss, irrf, fgts, outros_*, decimo_terceiro, salario_liquido, status), `colaboradores`. `gerarFolha` upsert idempotente `onConflict:'colaborador_id,competencia'` (não sobrescreve fechada/paga); `alterarStatusFolha`. **5. Cálculo fiscal = REAL** (tabelas progressivas INSS/IRRF 2025 + FGTS 8% em `src/lib/rh.ts:80-147`); sem eSocial/banco. **6. FUNCIONAL** (amplitude parcial) — persiste e respeita travas; MAS `outros_proventos/descontos` fixados em 0 (sem UI de lançamentos avulsos); holerite sem export/PDF; 13º integral. **7.** UI de proventos/descontos avulsos; PDF do holerite; 13º proporcional; eSocial; remessa bancária. **8. 2 dias.**

## 7.7 RH · Férias e Ausências — `/rh/ferias`
**1.** Herda `rh.`; `PAPEIS_APROVA=['gestor','gerente','rh']`+admin; colaborador comum só lança para si. **2.** Solicitações de férias (período aquisitivo, abono ≤10 dias, aprovação) e atestados (CID, afastamento). **3.** **2 abas** (Férias, Atestados) + 4 KPIs + **3 modais** (FeriasForm, AtestadoForm, RecusaForm). **4.** `solicitacoes_ferias` (periodo_aquisitivo, datas, dias, vender_dias, status, aprovado_por), `atestados` (data_inicio, dias, cid, status); escopo por `colabIds`. Actions: `solicitarFerias` (valida ≤30d, abono ≤10 — CLT), `decidirFerias`, `registrarAtestado`, `decidirAtestado`. **5.** Nenhuma. **6. FUNCIONAL** — persiste, valida CLT no servidor, só decide pendentes, auto-scope. **7.** Cálculo automático de período aquisitivo/saldo; alerta de vencimento; anexo do atestado; notificação na decisão. **8. 1 dia.**

## 7.8 RH · Desempenho — `/rh/desempenho`
**1.** Herda `rh.`; `PAPEIS_ESCRITA=['gestor','gerente','rh']`+admin. **2.** Avaliações (5 notas 0–5), PDIs (com progresso) e resumo de metas por colaborador. **3.** **3 abas** (Avaliações, PDI, Metas) + KPIs + **2 modais** (Avaliação, PDI). Metas é leitura (CRUD em `/cadastros/metas`). **4.** `avaliacoes_desempenho` (notas produtividade/qualidade/comportamento/equipe/geral), `pdi` (titulo, prazo, status, progresso), `metas_colaborador` (leitura); escopo `colabIds`. Actions: `criarAvaliacao`/`salvar`/`excluir`, `criarPdi`/`salvar`/`atualizarProgressoPdi`/`excluir`. **5.** Nenhuma. **6. FUNCIONAL** — CRUD completo real; nota geral auto-média; PDI→'concluido' a 100%. **7.** Ciclos formais trimestrais; autoavaliação; gráfico de evolução; CRUD de metas na aba. **8. 1 dia.**

## 7.9 RH · Regras da Rede — `/rh/regras`
**1.** Herda `rh.`; sem actions. **2.** Exibe as 10 regras/políticas da rede (conduta) em accordion com busca/filtro. **3.** 1 tela, sem modais: busca + categoria + accordion (r1..r10, pílula Obrigatório/Importante/Recomendado). **4. NENHUM backend** — conteúdo estático em `src/lib/rh.ts:161-263` (`REGRAS_REDE`). **5.** Nenhuma. **6. FUNCIONAL (conteúdo estático por design)** — busca/filtro/accordion operantes; não persiste porque não precisa. **7.** Se regras editáveis pela franqueadora → tabela+editor (~1,5 dia); aceite "li e concordo" por colaborador se exigido. **8. 0,25 dia.**

---

# 8) Marketing — `/marketing`

**1. Rota/perm.** `/marketing` · `perm: 'marketing.'`. **Vê:** admin_geral + super_admin, administrador, marketing, diretor, auditor, expansão-leitura. **Escreve campanhas:** `PAPEIS_ESCRITA` (gestor/operacoes/marketing)+admin; **publicar notícia:** só admin. Arquivos: `src/app/(app)/marketing/page.tsx`, `.../actions.ts`, `src/lib/marketing.ts`.

**2. O que faz.** Une numa tela (a) Central de Materiais da Rede (atualizações/materiais/notícias da franqueadora) e (b) Campanhas de WhatsApp por unidade (CRUD segmentado).

**3. Telas/abas/modais.** `MarketingManager` — **4 abas**: Atualizações (marca lidas no mount), Materiais (árvore breadcrumb, Baixar/Canva), Notícias (**modal Publicar** — admin), Campanhas (`CampanhasWhatsapp`: KPIs, filtros, tabela, **modal criar/editar**, cancelar). Banner `migrationPendente` se `mkt_*` ausentes.

**4. Backend.** `mkt_atualizacoes`, `mkt_noticias`, `mkt_materiais` (kind/parent_id/link_url/ordem), `campanhas_whatsapp` (mensagem_base, segmentacao_tipo, status, `total_enviados/entregues/lidos/responderam/falhou`, ia_personalizar/ia_instrucao), `whatsapp_templates`, `unidades`/`empresas`/`perfis_usuario`. Actions: `criarCampanha`, `atualizarCampanha`, `cancelarCampanha`, `publicarNoticia` (admin), `marcarAtualizacoesLidas`.

**5. Integrações. Campanhas WhatsApp = STUB; materiais/notícias = REAL parcial.** `CampanhasWhatsapp` importa só `criarCampanha/atualizar/cancelar` — **nenhum `sendText`/`criarCampanhaSimples`**. `criarCampanha` faz **só INSERT** em `campanhas_whatsapp` (`actions.ts:92`); **não há worker de disparo** → `total_enviados/entregues/lidos` **nunca populam** (KPIs de entrega sempre 0). `campanha_destinatarios` é citada em comentário mas nunca lida/escrita. Materiais/Notícias = leitura real; `publicarNoticia` grava.

**6. Estado real: PARCIAL.** Materiais/Notícias/Atualizações FUNCIONAL (persiste, marca lido). Campanhas = CRUD-fantasma: cria/edita no banco mas **não dispara nada** e métricas não se movem.

**7. Requisitos p/ 100%.** Worker de disparo (materializar `campanha_destinatarios` da segmentação — aniversariantes = query na base — chamar `uazapi.criarCampanhaSimples`, avançar status, ligar webhook `messages_update` às métricas); CRUD/upload de materiais; cron para agendadas.

**8. Esforço p/ 100%: ~5 dev-days.**

---

# 9) Comunicados — `/comunicados`

**1. Rota/perm.** `/comunicados` · `perm: 'operacoes.'`. **Vê:** admin_geral + super_admin, administrador, operacoes, franqueado, gerente_unidade, supervisor, técnico, diretor, auditor. **Publicar:** só `admin_geral`. Arquivos: `src/app/(app)/comunicados/page.tsx`, `.../actions.ts`.

**2. O que faz.** Mural de avisos internos da franqueadora para a rede, com leitura obrigatória ("ciente") e relatório de quem leu.

**3. Telas/abas/modais.** `ComunicadosManager` — KPIs, barra Cientes×Pendentes, **4 abas** (Todos/Publicados/Agendados/Encerrados), tabela; **modal Novo** (admin); **PreviewModal/relatório de leitura** (roster); **CienteModal**/`ComunicadosGate` (gate global que força ciente em comunicado obrigatório). Ações admin: Encerrar/Reabrir/Link.

**4. Backend.** `comunicados` (titulo, mensagem, prioridade, categoria, `audiencia[]`, leitura_obrigatoria, enviar_email, status, total_destinatarios, publicado_em, agendado_para, autor_*), `comunicado_leituras` (comunicado_id, perfil_id, ciente, lido_em, unidade_id), `perfis_usuario` (pool = ativos via adminClient), `unidades`. Actions: `criarComunicado` (só admin), `marcarCiente` (upsert ON CONFLICT DO NOTHING), `relatorioLeitura`, `rosterLeitura`, `definirStatusComunicado`.

**5. Integrações. STUB.** O campo `enviar_email` é rotulado no UI como *"Enviar também por WhatsApp"* e vira ícone verde, mas é **apenas boolean persistido** — sem Uazapi, sem e-mail. `agendado_para` grava mas **não há cron** que publique no horário (fica `agendado` até alguém mudar).

**6. Estado real: FUNCIONAL (com ressalvas).** CRUD + ciente + roster/relatório persistem; contagens coerentes (dest = ativos, lidos filtrados por ativos). Ressalvas: envio WhatsApp/e-mail é flag decorativa; agendamento não auto-publica.

**7. Requisitos p/ 100%.** Disparo real (Uazapi/e-mail) quando `enviar_email`; cron para publicar agendados; filtro real por `audiencia` (hoje pool = todos ativos).

**8. Esforço p/ 100%: ~2 dev-days.**

---

# 10) Chamados — `/chamados`

**1. Rota/perm.** `/chamados` · `perm: 'operacoes.'` (= Comunicados). Abrir/responder: qualquer sessão; Assumir: só admin. **Distinto do SAC** (`/sac/chamados`, `perm sac.`, WhatsApp, centralizado): aqui é **suporte interno** franquia⇄franqueadora, sem cliente final nem WhatsApp. Arquivos: `src/app/(app)/chamados/page.tsx`, `.../actions.ts`.

**2. O que faz.** Tickets de suporte entre unidades e a franqueadora, com thread de mensagens, atribuição de responsável e finalização.

**3. Telas/abas/modais.** `ChamadosManager` — KPIs, **2 abas** (Recebidos/Enviados), tabela; **modal Abrir** (para não-admin o campo "De" vem travado como `Franqueado · <unidade>`); painel **detalhe/thread** com chat, botões Assumir (admin) e Finalizar/Reabrir. Classificação franqueadora-cêntrica: `de_parte ~ /franquead/i` → box Recebidos.

**4. Backend.** `chamados` (numero, assunto, etiqueta, de_parte/para_parte, de_unidade_id, prioridade, responsavel_*, aberto_por_*, finalizado, finalizado_em), `chamado_mensagens` (papel_remetente solicitante/responsavel, mensagem), `perfis_usuario`, `unidades`. Escopo por `de_unidade_id = activeUnitId`. Actions: `abrirChamado`, `carregarThread`, `responderChamado`, `assumirChamado`, `finalizarChamado`.

**5. Integrações. Nenhuma (in-app puro).** Sem Uazapi/e-mail/cron.

**6. Estado real: FUNCIONAL (a mais madura das telas de operação).** Fluxo completo persiste: abrir→thread→assumir→responder→finalizar/reabrir, todos com `revalidatePath('/chamados')`. Sem mocks.

**7. Requisitos p/ 100%.** Notificação (sino/e-mail/WhatsApp) ao responsável/solicitante; anexos; SLA/prazo; gate de escrita por papel (hoje aberto a todos os logados).

**8. Esforço p/ 100%: ~1,5 dev-days.**

---

# 11) Checklist de Indicadores — `/checklist`

**1. Rota/perm.** `/checklist` · `perm: 'operacoes.'` (= Comunicados/Chamados). **Escreve:** só `gestor`+admin (`PAPEIS_ESCRITA=['gestor']`, `actions.ts:22`). Arquivos: `src/app/(app)/checklist/page.tsx`, `.../actions.ts`, `src/lib/checklist.ts`.

**2. O que faz.** Avalia os indicadores do funil da unidade (nota 0–10 vs meta), monta um checklist mensal modelo SULTS (6 seções, 340 pts) e gerencia Planos de Ação PDCA com tarefas.

**3. Telas/abas/modais.** `ChecklistView` — 4 KPI cards, **3 abas** (Avaliação, Mensal, Planos); Avaliação = tabela dos 7 indicadores nota/status + CTA "gere um plano"; Mensal = seções SULTS + pontuação; Planos = lista; **modal PlanoModal** (pré-preenchido com gargalos).

**4. Backend.** `kpis_unidade_snapshot` (agendamentos_total, taxa_comparecimento/conversao, ticket_medio, data_referencia, periodo — lido escopado + via service-role p/ média da rede), `planos_acao` (semana_inicio/fim, status, prioridade, resumo, cumprimento_pct), `plano_acao_tarefas` (titulo, categoria, ordem, prazo_dias, concluida). Lib pura: `avaliarFunil`/`notaIndicador`/`montarChecklistMensal`/`FUNIL_INDS`. Actions: `criarPlano` (insert plano→tarefas com rollback de órfão), `toggleTarefa` (recalcula `cumprimento_pct` server-side), `definirStatusPlano`.

**5. Integrações. Nenhuma; sem BEMP/cron.** Snapshots são **consumidos**, não coletados aqui. TODO confirma que coleta semanal automática por unidade (pg_cron) e geração automática de planos **não existem** (`actions.ts:181-184`).

**6. Estado real: PARCIAL.** FUNCIONAL: avaliação em tempo real, planos+tarefas persistem, cálculo de %. **Não-persistente/heurístico:** a aba **Mensal SULTS é calculada on-the-fly e NUNCA gravada** — `sults_checklist_avaliacoes` "existe mas está vazia/sem colunas confirmadas" (`actions.ts:185-187`); vários itens são derivações sintéticas de UM snapshot (ex.: `novos = max(5, round(conv*0.38))`, `contratos pendentes = ag % 2`, tendência de 3 meses inferida de 1 ponto — `src/lib/checklist.ts:246-267`). Sem snapshot da unidade → aba mensal em empty-state.

**7. Requisitos p/ 100%.** Persistir a avaliação mensal (`sults_checklist_avaliacoes`); cron de coleta de KPIs por unidade; geração automática de plano quando indicador < 7; séries temporais reais; chat/comentários no plano.

**8. Esforço p/ 100%: ~3 dev-days.**

---

# 12) Universidade Corporativa — `/universidade`

**1. Rota/perm.** `/universidade` · `perm: 'treinamento.curso'` (exato). **Vê:** admin_geral + super_admin, administrador, diretor, **rh**, auditor, franqueado. **Não vê:** operacoes, financeiro, marketing, sac, comercial, técnico, expansão, TI, jurídico. **Escrita de trilhas/etapas:** **só `admin_geral`** (`ehAdmin`); prova: qualquer autenticado. Arquivos: `src/app/(app)/universidade/page.tsx`, `.../actions.ts`, `src/components/universidade/UniversidadeManager.tsx`.

**2. O que faz.** EAD interno: trilhas de vídeo por cargo (links não-listados do YouTube) com prova por etapa e prova final que "libera o certificado"; provas corrigidas no servidor, notas/progresso persistidos por usuário.

**3. Telas/abas/modais.** **4 abas** (`UniversidadeManager:29-34`): Trilhas (cards→detalhe com etapas/vídeo/prova + final travada), Alunos & Notas (KPIs+tabela+"Gerar certificado"), Dashboards (KPIs+3 gráficos), Gerenciar (só admin: editor inline de etapas). **Modal QuizModal** (prova). Certificado = HTML gerado no browser.

**4. Backend.** `uni_trilhas` (slug, nome, role, cor, prazo, ordem), `uni_etapas` (trilha_id, ordem, nome, `yt`, min, `prova` jsonb, `is_final`), `uni_progresso` (trilha_id, perfil_id, etapa_key, concluido, nota; unique). Actions: `submeterProva` (corrige, aprova ≥7,0, valida pré-requisito da final), `criarTrilha`/`salvar`/`excluir`, `adicionarEtapa`/`salvarEtapa`/`excluirEtapa` (**todas só admin**).

**5. Integrações. Vídeos = YouTube externo (não armazenado)** — `ytUrl(e.yt)` monta link não-listado; sem storage/streaming. Dados = Supabase REAL. **Certificado = STUB client-side** (`gerarCertificado`, `UniversidadeManager:514-554`): monta HTML, `Blob`+`createObjectURL`, download `.html`/`print()` — sem lib de PDF, sem persistência, código de validação é hash local não gravado. E-mail: nenhum.

**6. Estado real: FUNCIONAL (com ressalvas).** Correção e gravação de nota reais (`upsert({... concluido:aprovado, nota ...})`, `actions.ts:80-89`). Ressalvas: `prazo` é texto e status "No prazo" é fixo (`page.tsx:87`) → KPI "Atrasados" nunca dispara; certificado não é PDF real nem registrado; trilha↔cargo é rótulo (`role` texto), sem atribuição automática.

**7. Requisitos p/ 100%.** Certificado em PDF real + registro auditável (código verificável); lógica real de prazo; vincular `role` ao cargo; opcional: hospedar vídeo próprio em Storage.

**8. Esforço p/ 100%: ~3 dev-days.**

---

# 13) Disco Virtual — `/disco`

**1. Rota/perm.** `/disco` · `perm: 'operacoes.'`. **Vê:** admin_geral + super_admin, administrador, diretor, operacoes, auditor, franqueado, gerente_unidade, supervisor, técnico. **Escrita (criar/enviar/excluir/vincular):** **só `admin_geral`**; `urlArquivo` (baixar): todos. Arquivos: `src/app/(app)/disco/page.tsx`, `.../actions.ts`, `src/components/disco/DiscoManager.tsx`.

**2. O que faz.** "Drive da rede": pastas hierárquicas + arquivos com upload/download/exclusão; vínculo opcional (decorativo) com Google Drive.

**3. Telas/abas/modais.** Tela única: banner Google Drive (conectado/"Vincular"), toolbar breadcrumb+busca+Nova pasta/Enviar (admin), grade de pastas, tabela de arquivos (Baixar/Excluir), empty-state. Sem modais formais (usa `prompt`/`confirm`/`input file`).

**4. Backend.** `disco_config` (empresa_id, drive_linked, drive_url), `disco_pastas` (parent_id CASCADE, nome, por, `drive`), `disco_arquivos` (pasta_id CASCADE, nome, tipo, bytes, `arquivo_path`, por, `drive`). **Bucket Storage `disco-virtual` (PRIVADO).** Actions: `novaPasta`/`excluirPasta`/`uploadArquivo`/`excluirArquivo`/`vincularDrive`/`desvincularDrive`/`importarDrive` (**todas só admin**); `urlArquivo` (todos → signed URL).

**5. Integrações. Supabase Storage = REAL.** Upload: `data URI → Buffer → sbAdmin.storage.from('disco-virtual').upload(...)`, cap 25 MB (`actions.ts:116-133`); download `createSignedUrl(path, 300)` (5 min); exclusão remove objeto+registro. **Google Drive = STUB (cosmético):** `vincularDrive` só valida `/drive\.google\.com/` na string e grava a flag (**sem OAuth, sem Drive API**); `importarDrive` insere 3 nomes **hardcoded** (`['Fotos Institucionais','Vídeos da Rede','Planilhas Financeiras']`), não lê o Drive; o booleano `drive` só pinta ícone "replicado" — nenhuma replicação ocorre. E-mail: nenhum.

**6. Estado real: PARCIAL.** Núcleo (pastas+arquivos em Storage real) FUNCIONAL; camada Google Drive é **fachada**. Evidência real: `sbAdmin.storage.from(BUCKET).upload(...)`. Evidência stub: `if(!/drive\.google\.com/.test(url)) return...` seguido de `upsert({... drive_linked:true ...})` (único efeito).

**7. Requisitos p/ 100%.** Google Drive real (OAuth + Drive API: listar/importar/replicar) **ou** remover a promessa de replicação e rotular como link externo; opcional: mover/renomear, preview, ACL por pasta. **Atenção:** o bucket `disco-virtual` precisa ser criado manualmente no painel Supabase (não é criado por migration).

**8. Esforço p/ 100%: ~4 dev-days** (~1 dia se descontinuar a replicação e manter só link).

---

# 14) Notas Fiscais — `/notas` (badge "EM BREVE")

**1. Rota/perm.** `/notas` · `perm: 'financeiro.'` (prefixo), badge `EM BREVE`. **Vê:** admin_geral + super_admin, administrador, diretor, **financeiro**, jurídico, auditor, franqueado, gerente_unidade. **Escrita:** `ehAdmin(papel) || papel ∈ {'gestor','financeiro'}`. Arquivos: `src/app/(app)/notas/page.tsx`, `.../actions.ts`, `src/lib/nfse.ts`, `src/components/notas/NotasView.tsx`. **Reconciliação do badge:** `/notas ∈ ROTAS_FUNCIONAIS` mas com badge EM BREVE → o `LeafLink` renderiza selo âmbar "EM BREVE" (não "prévia"): a tela é funcional (política/config/registro reais), mas a **emissão fiscal** é stub — é o que "EM BREVE" comunica.

**2. O que faz.** Governança de NFS-e da rede: define política de emissão (não emitir / na venda / na execução) + "calcular por sessão"; conecta cada unidade à prefeitura; registra/lista notas com KPIs e filtros; emissão manual e ações de status.

**3. Telas/abas/modais.** Tela única (`NotasView`): card Política (3 segment-buttons + toggle por sessão), tabela Integração com prefeituras (provedor/alíquota/status/ambiente), 4 KPIs (emitidas/valor/canceladas/processando), Filtros (competência/unidade/tipo/status; **Exportar desabilitado**), tabela Notas. **2 modais**: EmitirModal (NFS-e manual), ConfigUnidadeModal (prefeitura por unidade).

**4. Backend.** `nfse_politica` (politica, por_sessao), `nfse_config_unidade` (provedor, aliquota_iss, inscricao_municipal, certificado_token, ambiente, status_conexao), `nfse` (numero, competencia, tipo, cliente_nome, valor, status, **`xml`**). Actions: `definirPolitica`, `definirPorSessao`, `salvarConfigUnidade`, `emitirManual`, `alterarStatusNota` (todas gated por `podeAdministrar`); auditoria best-effort em `audit_log`.

**5. Integrações. Emissão fiscal = STUB confirmado — sem API fiscal alguma.** Nenhuma chamada a Focus NFe / PlugNotas / eNotas / WebISS / ADN / prefeitura (os nomes de provedor só aparecem como strings de exibição). O código confessa: *"EMISSÃO FISCAL REAL fica como TODO"* (`actions.ts:14`) e *"aqui registramos a nota como 'processando'"* (`:180-182`). `emitirManual` só faz `insert({... status:'processando' ...})` — **não seta `numero` nem `xml`, e nada avança o status** (sem fila/cron/webhook); `alterarStatusNota` muda status **manualmente**. Defaults de provedor/alíquota/conexão são **hashes determinísticos falsos** (`nfseConectada = hashStr%4!==0`, `nfseAliquota = [2,2.5,3,3.5,4,5][hash%6]`, `src/lib/nfse.ts:55-62`). Coluna `xml` nunca é escrita. Exportar XML/CSV: botões `disabled`. E-mail: nenhum.

**6. Estado real: PARCIAL (administração real; emissão FALTA).** Política, config por unidade, registro/listagem/filtros/KPIs com counts reais e escopo = FUNCIONAL. Emissão fiscal ausente — `.from('nfse').insert({... valor, status:'processando' ...})` sem `numero`/`xml`, status só progride por clique humano.

**7. Requisitos p/ 100%.** Integrar provedor fiscal real (Focus NFe / PlugNotas / ADN): envio do RPS, retorno de numero+xml+protocolo, polling/webhook de autorização, cancelamento junto à prefeitura, guarda do XML e exportação; substituir hashes decorativos por status de conexão real; emissão automática conforme política plugada em OS/pagamentos.

**8. Esforço p/ 100%: ~12 dev-days.**

---

# Tabela-resumo

| # | Item | Rota | perm (menu) | Integração-chave | Estado | Dias p/ 100% |
|---|------|------|-------------|------------------|--------|--------------|
| 1 | Mensagens e Automações | `/automacoes` | `marketing.campanha` | Uazapi real, mas **nenhum motor executa** as automações | **PARCIAL** (config real, execução FALTA) | 10 |
| 2 | Disparos WhatsApp API | `/disparos` | `marketing.campanha` | **Envio real** via `/sender/simple`; **métricas entregues/lidas/respostas e vip_grupos.membros NUNCA gravadas** | **PARCIAL** | 4 |
| 3 | CRM | `/crm` | `crm.lead` | Destino de leads (disparos/site/indiques); sem envio próprio | **FUNCIONAL** | 1,5 |
| 4 | Leads do Site | `/leads-site` | `crm.lead` | **Ponte real** com Supabase do site (`lasercompany_leads`) + fallback | **FUNCIONAL** | 1,5 |
| 5 | Canais | `/canais` | `marketing.` | **100% Uazapi real** (QR/status/webhook/limites) | **FUNCIONAL** | 0,5 |
| 6 | Gestão de Indiques | `/indiques` | `crm.lead` | Gera leads reais no CRM; **`notificarGanhador` só flag (sem WhatsApp/e-mail)** | **FUNCIONAL** (notify stub) | 2 |
| 7.1 | RH · Ponto Digital | `/ponto` | `rh.ponto` | **GPS real** (geolocation + Haversine) | **FUNCIONAL** | 2 |
| 7.2 | RH · Dashboard | `/rh` | herda `rh.` | — | **FUNCIONAL** | 0,5 |
| 7.3 | RH · Colaboradores | `/rh/colaboradores` | herda `rh.` | — | **FUNCIONAL** | 1 |
| 7.4 | RH · Ponto (Jornada) | `/rh/ponto` | herda `rh.` | — | **PARCIAL** (jornada 8h fixa) | 1,5 |
| 7.5 | RH · Recrutamento | `/rh/recrutamento` | herda `rh.` | **WhatsApp real** (avisar disponibilidade); auto-msg/IA stub | **FUNCIONAL** | 1,5 |
| 7.6 | RH · Folha de Pagamento | `/rh/folha` | herda `rh.` | Cálculo fiscal INSS/IRRF/FGTS real; sem eSocial/PDF | **FUNCIONAL** (amplitude parcial) | 2 |
| 7.7 | RH · Férias e Ausências | `/rh/ferias` | herda `rh.` | — | **FUNCIONAL** | 1 |
| 7.8 | RH · Desempenho | `/rh/desempenho` | herda `rh.` | — | **FUNCIONAL** | 1 |
| 7.9 | RH · Regras da Rede | `/rh/regras` | herda `rh.` | conteúdo estático | **FUNCIONAL** (estático) | 0,25 |
| 8 | Marketing | `/marketing` | `marketing.` | Materiais reais; **campanhas WhatsApp CRUD sem disparo/métricas** | **PARCIAL** | 5 |
| 9 | Comunicados | `/comunicados` | `operacoes.` | "WhatsApp/e-mail" e agendamento = **flag decorativa** | **FUNCIONAL** (ressalva) | 2 |
| 10 | Chamados | `/chamados` | `operacoes.` | in-app puro (≠ SAC; sem WhatsApp) | **FUNCIONAL** | 1,5 |
| 11 | Checklist de Indicadores | `/checklist` | `operacoes.` | SULTS mensal **não-persistido/heurístico**; sem cron de coleta | **PARCIAL** | 3 |
| 12 | Universidade Corporativa | `/universidade` | `treinamento.curso` | YouTube externo + Supabase; **certificado HTML client-side** | **FUNCIONAL** (certificado/prazo fracos) | 3 |
| 13 | Disco Virtual | `/disco` | `operacoes.` | **Storage `disco-virtual` real**; **Google Drive = STUB** | **PARCIAL** (Drive fachada) | 4 |
| 14 | Notas Fiscais | `/notas` | `financeiro.` (EM BREVE) | **Emissão fiscal = STUB** (sem API); tabelas/CRUD reais | **PARCIAL / emissão FALTA** | 12 |
| | **TOTAL** | | | | | **~68,75 dev-days** |

**Contagem de telas/abas/modais (escopo deste módulo):**
- **Funcionalidades:** 14 (contando RH como grupo) / **24 rotas** (RH = 9 folhas).
- **Telas (page.tsx):** 24.
- **Abas internas:** Disparos 4 · Recrutamento 2 · Férias 2 · Desempenho 3 · Marketing 4 · Comunicados 4 · Chamados 2 · Checklist 3 · Universidade 4 = **28 abas** (+ toggle Presencial/Home-office no Ponto).
- **Modais/painéis:** Automações 3 · Disparos ~3 · CRM 1 · Canais ~5 ações · Indiques 3 · Ponto 2 · Colaboradores 1 · Recrutamento 2 · Folha 1 · Férias 3 · Desempenho 2 · Marketing 2 · Comunicados 3 · Chamados 1+detalhe · Checklist 1 · Universidade 1(Quiz) · Notas 2 = **~38 modais/painéis**.

**Achados-chave de homologação:**
1. **Automações não executam:** `/automacoes` persiste toggles/custom/no-show mas **nenhum scheduler dispara** — KPIs de envio honestamente `null`.
2. **Disparos com métricas cegas:** o envio é real, porém `disparo_campanhas.entregues/lidas/respostas` e `vip_grupos.membros` **nunca são gravados por código** (só insert/select/delete) → sempre 0; isso deixa `respondentesParaCRM` inoperante (lê `respostas=0`).
3. **Marketing e Comunicados prometem envio via flags/copy sem backend** de disparo — o único envio de campanha real é `/disparos` (via `expansao/disparos`).
4. **Integrações realmente reais nesta seção:** Canais (Uazapi completo), Disparos-envio, Recrutamento-WhatsApp, Ponto-GPS, Disco-Storage, Leads-do-Site-ponte, Folha-cálculo-fiscal.
5. **Stubs confirmados:** Automações (execução), NFS-e (emissão fiscal), Google Drive (Disco), notificarGanhador (Indiques), checklist SULTS mensal (não-persistido/heurístico).
6. **Dualidade RBAC:** visibilidade por `recursos/cargos` ≠ escrita por `papel` — usuário pode ver a tela e ser barrado nas ações; as 8 folhas RH sem `perm` próprio não têm recorte fino por sub-tela.
