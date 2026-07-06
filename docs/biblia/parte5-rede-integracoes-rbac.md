# Módulo 5 — Rede & Conta + Integrações Transversais + RBAC

> Documento oficial de homologação. Estado auditado direto no código (não no discurso) em 2026‑07‑06.
> Backend real = Supabase `lkiihnxznphxqekrgsgi` (lkii). Fonte de leads do site = Supabase separado `riutcbwillvqjrpaefkb` (riut).
> Convenção de estado: **REAL** (funciona com dado/rede de verdade) · **PARCIAL** (funciona em parte, tem buraco declarado) · **STUB** (casca/alias/placeholder, sem lógica real).

---

## PARTE A — Seção de menu "Rede & Conta"

Origem no menu: `src/lib/menu.ts` (seção `Rede & Conta`, linhas 196‑205). Cinco itens, um deles com `perm`, os demais visíveis a qualquer logado. Todas as 5 rotas estão em `ROTAS_FUNCIONAIS` (menu.ts L243‑244) → "acendem" no sidebar.

### A.1 Minha Unidade — `/minha-unidade`
- **RBAC:** sem `perm` no menu → visível a **todo** usuário logado. Escrita gated na página: `podeEditar = ehAdmin(papel) || ['gestor','proprietario','operacoes'].includes(papel)`.
- **Arquivos:** `src/app/(app)/minha-unidade/page.tsx` · `src/components/unidades/MinhaUnidadePanel.tsx`.
- **O que faz:** mostra os dados da **unidade ativa** (`ctx.activeUnitId`, que é `perfis_usuario.unidade_id`). Query real: `unidades.select(id, nome, cnpj, endereco, cidade, estado, cep, ativa, bemp_salon_id).eq('id', activeUnitId)`. Se o usuário não tem `unidade_id` (ex.: admin_geral/SAC → `activeUnitId=null`), cai em `semUnidade` (estado vazio "selecione/associe uma unidade").
- **Telas/abas (5):** `Dados básicos` (editável, formulário real), `Horários`, `Bloqueios`, `Fotos`, `NFS-e`.
- **Estado real:** **PARCIAL.** Aba *Dados básicos* = REAL (lê e edita `unidades`). As outras 4 abas são **estado‑vazio honesto** via componente `NeedsTable` — apontam para tabelas que **não existem** no lkii: `unidade_horarios`, `unidade_bloqueios`, `unidade_fotos`, `unidade_nfse_config` (evidência: `MinhaUnidadePanel.tsx` L65‑68, cada aba renderiza `NeedsTable` com ícone `ti-database-off`).
- **Para 100%:** criar as 4 tabelas + CRUD (horários por dia da semana, bloqueios recorrentes/pontuais, galeria em Storage, config NFS‑e). **Esforço: 4–5 dias.**

### A.2 Todas unidades — `/unidades`
- **RBAC:** `perm: 'sistema.unidade'`. Gestão (ativar/inativar) gated: `podeGerir = ehAdmin(papel) || papel==='proprietario'`.
- **Arquivos:** `src/app/(app)/unidades/page.tsx` · `src/components/unidades/UnidadesManager.tsx`.
- **O que faz:** lista **real** das unidades da rede (≈82) com KPIs `count(exact, head)` de total/ativas/inativas, busca por `nome|cidade|cnpj` (`.or(ilike)`), filtro por UF (distinct em memória), status, paginação server‑side (`.range`, `PAGE_SIZE=20`). Colunas incluem `bemp_salon_id` (chave da origem BEMP).
- **Estado real:** **FUNCIONAL/REAL** (queries reais + paginação + KPIs). RLS filtra o universo visível; admin_geral vê todas.
- **Para 100%:** confirmar CRUD completo de criação/edição de unidade dentro do `UnidadesManager` (a página cobre listagem/gestão; criação de nova unidade pode delegar à Implantação). **Esforço: 1 dia** (fechamento de CRUD).

### A.3 Minha conta — `/minha-conta`
- **RBAC:** sem `perm` → todo logado. (No menu achatado do SAC/Financeiro é explicitamente preservada — Sidebar `canSee` mantém `/minha-conta`.)
- **Arquivos:** `src/app/(app)/minha-conta/page.tsx` · `actions.ts` (`salvarMinhaConta`) · `src/components/unidades/MinhaContaPanel.tsx`.
- **O que faz:** lê `perfis_usuario.select(id, nome_completo, email, telefone, papel, status).eq('id', user.id)`. Edita **nome e telefone** via action `salvarMinhaConta`. E‑mail e papel são **read‑only** (geridos em RH/auth).
- **Estado real:** **FUNCIONAL/REAL** para nome+telefone.
- **Falta p/ 100%:** troca de senha (não há chamada `auth.updateUser`), 2FA, foto/avatar, preferências de notificação. **Esforço: 1–2 dias.**

### A.4 App do Cliente — `/app-cliente`
- **RBAC:** sem `perm` → todo logado.
- **Arquivos:** `src/app/(app)/app-cliente/page.tsx` · `src/lib/app-cliente.ts` · `src/components/app-cliente/AppClienteMockup.tsx`.
- **O que faz:** **prévia navegável** (mockup de celular) do app do consumidor, **alimentada com dados reais do tenant**: `servicos` (catálogo, top 12), `unidades` ativas, `colaboradores` ativos, e **um cliente real** (o de maior `saldo_pontos`, com `saldo_creditos`, próximo agendamento e histórico). Regras de fidelidade em `REGRAS_PONTOS` / `nivelDePontos` (Bronze/Prata/Ouro).
- **Estado real:** **PARCIAL.** Os *dados* exibidos são reais (queries a `servicos/unidades/colaboradores/clientes`), mas é **demonstrativo**: as ações dentro do telefone **não persistem** (docstring do page.tsx: "As ações dentro do telefone seguem sendo demonstrativas (sem persistência)"). Constantes mockadas remanescentes em `app-cliente.ts`: `APP_DATAS` (["Qua 11"…]), `APP_HORARIOS`, `APP_REDEEM`.
- **Para 100%:** definir se vira app real (agendar/resgatar de verdade) — é produto próprio (PWA/app nativo), não só uma tela. Como **prévia comercial** já cumpre. Como **app funcional: 15–25 dias** (fora de escopo do painel).

### A.5 Exportações — `/exportacoes`
- **RBAC:** sem `perm` → todo logado (escopado por unidade ativa).
- **Arquivos:** `src/app/(app)/exportacoes/page.tsx` · `actions.ts` · `src/lib/exportacoes.ts` (`EXPORT_LIMIT=5000`) · `src/components/exportacoes/ExportacoesHub.tsx`.
- **O que faz:** hub com **contagens reais** (`count exact, head`) por dataset, escopadas pela unidade ativa na coluna própria de cada tabela: `clientes(unidade_origem_id)`, `lancamentos_financeiros(unidade_id)`, `agendamentos(unidade_id)`, `colaboradores(unidade_id)`, `sac_tickets(unidade_id)`. **6 datasets exportáveis** (`DatasetKey`): clientes, contas, leads, agendamentos, colaboradores, chamados. Cada `exportX()` gera linhas reais (limite 5000, flag `truncado`).
- **Leads do site:** exportação lê `lasercompany_leads` via `siteClient()` se `siteConfigurado()`, senão fallback `lkii.site_leads`.
- **Estado real:** **FUNCIONAL/REAL** (contagens + geração de linhas reais). Verificar apenas o *download* final (CSV/XLSX) no `ExportacoesHub` — as actions montam os `rows`; o encoding/entrega do arquivo é o último elo.
- **Para 100%:** confirmar geração/entrega do arquivo (CSV escaping) e formatos. **Esforço: 1 dia.**

### Tabela‑resumo — Parte A
| Item | Rota | Perm | Estado | Dias p/ 100% |
|---|---|---|---|---|
| Minha Unidade | `/minha-unidade` | (logado) | PARCIAL (1 de 5 abas real) | 4–5 |
| Todas unidades | `/unidades` | `sistema.unidade` | REAL | 1 |
| Minha conta | `/minha-conta` | (logado) | REAL (falta senha/2FA) | 1–2 |
| App do Cliente | `/app-cliente` | (logado) | PARCIAL (prévia c/ dados reais, sem persistência) | 15–25 (app real) |
| Exportações | `/exportacoes` | (logado) | REAL (validar entrega do arquivo) | 1 |

---

## PARTE B — Camada de Integrações Transversais

> **Fato estruturante:** o único agendador que roda de verdade é o **Vercel Cron** (`vercel.json`). **Não há `pg_cron` nem `pg_net`/`net.http_post` em nenhuma migration** (grep em `scripts/` e `supabase/` = zero). E **não há biblioteca de e‑mail** no `src/` (nenhum resend/nodemailer/smtp/sendgrid). **Evolution não aparece no código** — só UAZAPI. Isso baliza tudo abaixo.

### B.1 Site → Sistema (leads + SAC automático) — **REAL/PARCIAL**
Dois caminhos, ambos cruzando o Supabase do site (`riut`, tabela `lasercompany_leads`) para o backend (`lkii`):

**(a) Ingestão automática de SAC (cron):** `src/app/api/cron/ingest-sac/route.ts` → `ingestSacLeadsDoSite()` em `src/lib/sac-ingest.ts`.
- Agendado no `vercel.json`: `{ "path": "/api/cron/ingest-sac", "schedule": "0 6 * * *" }` (diário 06:00, região `gru1`). Protegido por `CRON_SECRET` (Bearer). Também acionável por GET manual.
- Lê `lasercompany_leads` (via `siteClient()`), cria `sac_tickets` na **franqueadora** (`empresa_id = 00000000‑…‑0001`, `unidade_id = null`), classifica `motivo_label` (`resolverMotivoSac`) e **auto‑atribui** ao atendente com menos tickets abertos (`atribuirChamado`). Marca `dados._roteado` no lead de origem (idempotente).
- **Estado: REAL.**

**(b) Roteamento manual dos demais leads:** `src/app/(app)/leads-site/page.tsx` (lista, fonte real `lasercompany_leads`) + `actions.ts:rotearSiteLead(siteLeadId, unidadeId)`.
- Roteia por `tipo`: `curriculo` → RH (`vagas` "Banco de Talentos (Site)" + `candidatos`); `sac` → `sac_tickets` (franqueadora); demais tipos comerciais (`oferta/avaliacao/agendamento/franquia/indicacao`) → `crm_leads` (etapa inicial `pipeline='cliente'`, `responsavel_id`, `origem` mapeada). Marca `_roteado`/`_routed_to` na origem.
- **Estado: REAL** (insert real em 3 destinos), com **triagem manual** (o operador escolhe a unidade de destino). Fallback: se a service‑key do site não estiver configurada, usa `lkii.site_leads`.

**Ponte / infra:** `src/lib/supabase/site.ts` (`siteClient()` usa `SITE_SUPABASE_URL` + `SITE_SUPABASE_SERVICE_KEY`; a anon key do site só INSERE, a RLS bloqueia SELECT → a leitura exige service‑key). `siteConfigurado()` gate.
- **PARCIAL:** o roteamento comercial é **manual** (não há auto‑roteamento por `unidade`/`unidade_email` → `unidades.id` como previa a "Opção A" do doc de ecossistema). O casamento texto‑da‑unidade → `unidade_id` não é automático fora do SAC.
- **Para 100%:** auto‑roteamento comercial por unidade + dedupe robusto + Realtime (ou cron) para os tipos não‑SAC. **Esforço: 3–4 dias.**

### B.2 WhatsApp — **REAL (UAZAPI) / Evolution = fora do código**
- **Provedor no código: UAZAPI** (uazapiGO v2), `src/lib/uazapi.ts`. Env: `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`, `UAZAPI_TOKEN`. Funções reais: `listInstances`, `createInstance`, `connectInstance` (QR/paircode), `getStatus`, `disconnect/deleteInstance`, `sendText`, `sendMedia`, `downloadMessage`, `normTel`, `limitesEnvio`, `traduzErroEnvio`. `uazapiConfigurado()` gate.
- **Recebimento:** `src/app/api/webhooks/uazapi/route.ts` — grava em `sac_whatsapp_chats` + `sac_whatsapp_mensagens`, resolve o canal de origem contra `canais_whatsapp` (propaga `unidade_id`), re‑hospeda mídia (`sac-midia.ts`), escolhe atendente online (`sac-distribuicao.ts`) e pode gerar resposta automática (`ia.ts:gerarRespostaSAC` se `iaConfigurada()`). Auth por `?secret=`/header/`body.token`. Cobre os dois envelopes UAZAPI.
- **Envio:** `sendText`/`sendMedia` por instância (token do canal) — disparado no clique (SAC, disparos). Rota a resposta **pelo mesmo número** que recebeu.
- **Evolution:** **não existe no `src/`** (grep = 0). É referência **operacional externa** (memória `reference-evolution-demandas`: `zap.cyberalpha.net`), não integração do sistema.
- **Restrição do número (erro 463 / `RESTRICT_ALL_COMPANIONS`):** tratada como *limite de envio* (`limitesEnvio`/`traduzErroEnvio`) — o número `5519997565531` esteve restrito para **iniciar** conversas via API (memória `project-laserco-whatsapp-463`). É restrição do WhatsApp, não bug do código.
- **Estado: REAL** (conectar, receber, enviar, mídia, IA opcional). **Para 100%:** confirmar produção com número liberado + reconexão automática de instância caída. **Esforço: 2 dias.**

### B.3 API / Webhooks — **REAL (2 rotas)**
Só existem dois route handlers (`find src/app/api -name route.ts`):
1. `POST src/app/api/webhooks/uazapi/route.ts` — entrada de mensagens WhatsApp (ver B.2). Excluído do middleware de auth (matcher ignora `api/webhooks`) para aceitar POST sem cookie.
2. `GET src/app/api/cron/ingest-sac/route.ts` — cron de ingestão SAC (ver B.1), Bearer `CRON_SECRET`.
- **Estado: REAL.** Não há endpoint público `/api/webhooks/leads-site` (a "Opção B" do doc nunca foi construída — o site grava direto no `riut`, não POSTa aqui). **Para 100%:** opcional adicionar webhook direto do site + rate‑limit/log. **Esforço: 2 dias** (se decidirem sair do modelo pull).

### B.4 Disparos programados / Automações — **PARCIAL/STUB (sem motor)**
- **Único agendamento real:** o Vercel Cron do SAC (B.1). **Nada mais é agendado.**
- `/automacoes` (`src/lib/automacoes.ts`): é um **catálogo de regras** (oferta pós‑8‑meses, confirmação de agendamento, reativação 60d, expiração de pacote, METAS gerente/consultora a cada 3 dias) com `ativoDefault` — mas **não há engine** que dispare por gatilho (nenhum `cron.schedule`, `setTimeout`, fila/queue). São definições + toggles de UI.
- `/disparos` (Disparos WhatsApp API) e `/expansao/disparos`: envio **na hora, por clique**, via `uazapi.sendText` (usam `scopeUnidade`). Não há fila/scheduler de campanha agendada.
- **Estado: STUB (automação por gatilho) / REAL (disparo manual imediato).**
- **Para 100%:** motor de automação — Vercel Cron adicional (ou pg_cron+pg_net) que avalie os gatilhos (agendamento criado, 60d inativo, pacote a 30d, métricas a cada 3 dias) e chame `sendText`/push; fila com retry. **Esforço: 6–9 dias.**

### B.5 E‑mail — **STUB**
- **Não há** biblioteca de envio de e‑mail no `src/` (grep resend/nodemailer/smtp/sendgrid/mailgun/@react-email = 0). O único e‑mail que sai é o **transacional do Supabase Auth** (login/reset), fora do app.
- **Estado: STUB.** **Para 100%:** provedor (Resend) + templates (confirmação, cobrança, comunicados, NF). **Esforço: 3–4 dias.**

### B.6 Banco / Conciliação / Boleto (CNAB/API) — **STUB**
- As **8 sub‑rotas** de "Financeiro Franqueadora" (`dre, calc, receber, pagar, conciliacao, royalties, cobranca, config`) são **aliases**: cada `page.tsx` é literalmente `import FinanceiroPage from '../page'` (re‑renderiza o mesmo componente de abas). Ou seja, `/financeiro/conciliacao` **não é uma tela própria de conciliação**.
- **Fluxo de Caixa + DRE:** REAIS e razão‑cêntricos (razão `lancamentos_financeiros`/`centro_custo`/`plano_conta`, dados reais mar/abr — ver `financeiro-ledger.ts` e memória `financeiro-razao`).
- **Conciliação Bancária (CNAB/OFX/API bancária):** **não há** parser CNAB, leitura OFX, nem chamada a API de banco. **STUB.**
- **Boleto:** **não há** geração/registro de boleto (nenhuma API bancária). **STUB.**
- **Automação de Royalties:** **não há** cálculo/geração automática de cobrança de royalty (sem cron; a rota é alias). Existe a *regra de negócio* (INATIVA paga royalty — commit 4787b84) e a base de razão, mas o disparo é manual/inexistente. **STUB→PARCIAL.**
- **Cobrança & Jurídico:** alias, sem régua de cobrança automatizada. **STUB.**
- **Para 100%:** import CNAB 240/400 + matcher de conciliação; integração de boleto (API Cobrança — Itaú/Sicoob/Asaas); job de royalties (cron mensal → gera `contas_receber` por unidade); régua de cobrança. **Esforço: 12–18 dias** (bloco financeiro pesado).

### B.7 BEMP (import + robô de documentos) — **REAL (dados) / BLOQUEADO (docs)**
Scripts em `scripts/` (Node, rodam com service‑key + `.env.local`):
- `import-bemp-clientes.mjs` → **upsert em `clientes`** por `bemp_id` (saldos, etc.). **REAL / rodou** (memória: "dados reais do BEMP em tudo").
- `import-bemp-os.mjs` → staging + `insert into os` (empresa/unidade/cliente/status/preço/…, `bemp_id`, `on conflict do nothing`). **REAL.**
- `import-bemp-colaboradores.mjs` → **upsert** de colaboradores. **REAL.**
- `sync-bemp-operacional.mjs` / `backfill-whatsapp-historico.mjs` → sync operacional + histórico de WhatsApp.
- **Importado:** clientes, OS, colaboradores (+ catálogo/agenda operacional via sync). Agenda: `agendamentos` existe e é grande (memória cita ~136k) — vinda do sync/BEMP.
- **Robô de documentos** — `baixar-docs-bemp.mjs`: **infra pronta** (bucket privado `clientes-docs` path `bemp/<customer_id>/<tipo>/…` + tabela `clientes_documentos` + fila de **8.363 clientes com pacote**), mas **execução BLOQUEADA**: (1) precisa de `BEMP_WEB_EMAIL`/`BEMP_WEB_SENHA` **definitivos** (aguarda o Lucas concluir o Perfil no BEMP — mudar a senha antes invalida a credencial); (2) `fetchDocsDoCliente(_sessao,_customerId)` é **stub** — falta mapear no DevTools as rotas de auth/documentos do BEMP e preencher a função. **Estado: PARCIAL/BLOQUEADO (aguardando cliente).**
- **Para 100%:** credencial definitiva + mapear endpoints BEMP + rodar a fila. **Esforço: 2–3 dias** após destravar credencial.

### B.8 Storage (Disco Virtual / Google Drive) — **REAL (Storage) / STUB (Drive API)**
- `/disco` (`src/app/(app)/disco/page.tsx`): usa **Supabase Storage** — tabelas `disco_pastas` (árvore) e `disco_arquivos` (`arquivo_path`, `tipo`, `bytes`, `por`, `drive`). Upload/organização reais.
- **Google Drive:** `disco_config(drive_linked, drive_url)` — é apenas um **link salvo** para um Drive externo, **não** integração de API (sem OAuth/sync de arquivos do Drive). O flag `drive` por arquivo/pasta apenas marca origem.
- **Estado: REAL** para arquivos no Supabase Storage; **STUB** para Drive (só URL).
- **Para 100%:** OAuth Google Drive + sync bidirecional (se exigido). **Esforço: 4–6 dias** (só se quiserem Drive real; hoje o link já atende).

### Tabela‑resumo — Parte B
| Integração | Arquivos‑chave | Estado | Dias p/ 100% |
|---|---|---|---|
| Site → SAC (cron) | `api/cron/ingest-sac`, `lib/sac-ingest.ts`, `vercel.json` | REAL | — |
| Site → CRM/RH (manual) | `leads-site/actions.ts`, `lib/supabase/site.ts` | PARCIAL (sem auto‑roteamento) | 3–4 |
| WhatsApp (UAZAPI) | `lib/uazapi.ts`, `api/webhooks/uazapi` | REAL | 2 |
| Evolution | — | NÃO integrado (externo) | n/a |
| API/Webhooks | 2 route handlers | REAL | 2 (opcional) |
| Automações por gatilho | `lib/automacoes.ts`, `/disparos` | STUB (sem motor) | 6–9 |
| E‑mail | — | STUB | 3–4 |
| Conciliação bancária (CNAB/OFX) | `/financeiro/conciliacao` (alias) | STUB | 6–8 |
| Boleto (API banco) | — | STUB | 4–6 |
| Automação de Royalties | `/financeiro/royalties` (alias) | STUB→PARCIAL | 4–6 |
| Cobrança & Jurídico | `/financeiro/cobranca` (alias) | STUB | 3–4 |
| DRE / Fluxo de Caixa | `lib/financeiro-ledger.ts` | REAL | — |
| BEMP — clientes/OS/colab | `scripts/import-bemp-*.mjs` | REAL (importado) | — |
| BEMP — robô de docs | `scripts/baixar-docs-bemp.mjs` | PARCIAL/BLOQUEADO (aguarda credencial) | 2–3 |
| Storage — Disco | `/disco`, Supabase Storage | REAL | — |
| Storage — Google Drive | `disco_config.drive_url` | STUB (só link) | 4–6 |

---

## PARTE C — RBAC e Perfis (franqueado × franqueador)

### C.1 O modelo (como o código realmente gate)
Existem **DUAS camadas de RBAC em paralelo**, e é preciso conhecer as duas para homologar:

**Camada 1 — `papel` (enum legado, em `perfis_usuario.papel`).** Usada por `src/lib/rbac.ts` (`PAPEL_ADMIN='admin_geral'`, `ehAdmin`, `temPapel`, `exigirPapel`) e por `src/lib/session.ts` (`isAdmin = papel==='admin_geral'`). É a checagem **grossa** usada em **Server Actions e em alguns page‑guards** (ex.: `financeiro/page.tsx` gate `temPapel(papel,'financeiro','gestor')`; `os/page.tsx` write por `PAPEIS_ESCRITA`). Papéis observados: `admin_geral`, `sac`, `gestor`, `proprietario`, `operacoes`, `financeiro`, `colaborador` (default).

**Camada 2 — `recursos` (RBAC granular por cargo).** `session.ts:resolveRecursos` resolve `usuario_cargos → cargo_permissoes → permissoes.recurso_id` (via **service‑role**, ignorando RLS). Cada permissão = `recurso` (`modulo.entidade`, ex.: `financeiro.caixa`, `sac.ticket`) × `acao` (`ler/criar/editar/deletar/aprovar/exportar/admin`) × escopo. **`admin_geral` bypassa** (recebe `recursos=[]` e vê tudo). É essa camada que **filtra o menu** (`Sidebar.canSee`/`hasPerm`): `perm` terminando em `.` = prefixo de módulo; sem `.` = recurso exato.

**Estrutura de dados (backend lkii, migrations 009/010 + `scripts/migrations/perfis-acesso.sql`):** `empresas → unidades` (franquia com `empresa_id`); `cargos` (sistema `is_sistema` + custom por empresa) `n:m` `cargo_permissoes` → `permissoes` → `recursos`×`acoes`; `usuario_cargos` liga `perfis_usuario`↔`cargos`. Extras: `cargos.bate_ponto` (migration `rbac.sql`), `cargos.slug` (deriva nível SAC). **Atenção PGRST201:** o embed `perfis_usuario→usuario_cargos` é ambíguo (2 FKs) — usar `usuario_cargos!usuario_cargos_perfil_id_fkey`.

**Onde o RBAC é (e não é) aplicado — verdade de homologação:**
- **Menu:** filtrado de verdade por `recursos` (Sidebar). ✔
- **Middleware** (`src/middleware.ts`): **só checa autenticação** (usuário logado), **não** autorização por rota. Um usuário que digite a URL direta de uma tela fora do seu menu **não é barrado pelo middleware**.
- **Page/Action‑level:** enforcement **inconsistente** — algumas páginas gate por `papel` (financeiro, os), a maioria **não** hard‑gate e confia na **RLS do Supabase** como backstop. `grep redirect('/')|notFound()` nas pages = 0 guards de permissão.
- **RLS** é a 2ª (e às vezes única) linha de defesa real para acesso a dado.

### C.2 Perfis existentes e o que cada um enxerga no menu
Seed em `scripts/migrations/perfis-acesso.sql` cria **17 cargos‑de‑sistema** (empresa_id null) com permissões por módulo. Mapeando `recursos`→seções visíveis via `Sidebar.canSee`:

| Perfil (cargo) | Recursos (módulo × ações) | O que enxerga no menu |
|---|---|---|
| **Super Administrador** (`perfil_super_admin`) | `* / *` | Tudo, inclusive `sistema.*` (Perfis, Auditoria, Unidades). |
| **Administrador** (`perfil_administrador`) | todos os módulos exceto `sistema` | Tudo de negócio; some Auditoria/Perfis/Unidades. |
| **Diretor** | `* / ler,exportar,aprovar` | Vê tudo em leitura. |
| **Financeiro** (`perfil_financeiro`) | `financeiro / *` (módulo único) | **Menu achatado só‑dinheiro** (`ehSoModulo='financeiro'`): Financeiro Franqueadora + Contas + categorias/formas/comissões + relatórios/dashboards financeiros + Minha conta. |
| **Marketing** | `marketing/*` + `crm/ler` | Marketing, Automações, Campanhas, Canais; CRM leitura. |
| **RH** | `rh/*` + `treinamento/*` | Recursos Humanos (grupo), Ponto, Universidade. |
| **Expansão** | `crm/*` + `comercial/ler` + `marketing/ler` | Expansão (grupo), CRM, Leads do Site. |
| **SAC** (papel `sac`) | `sac/*` | **Menu SAC‑only** (grupo SAC), centralizado na franqueadora. Recorte por nível de cargo (ver abaixo). |
| **Jurídico** | `financeiro/ler,exportar` + `sac/ler` | Financeiro (leitura) + SAC (leitura). |
| **TI** | `sistema/*` | Config/Perfis/Auditoria/Unidades. |
| **Auditor** | `* / ler,exportar` | Tudo em leitura/exportação. |
| **Franqueado** (`perfil_franqueado`) | `comercial/*` + `operacoes/*` + `financeiro/ler` + `rh/ler` + `treinamento/ler` | Cadastros, Clientes, Agenda, OS, Relatórios comerciais; **e vê o menu Financeiro (financeiro.) por causa do `financeiro/ler`**. |
| **Gerente de Unidade** | `comercial/*` + `operacoes/*` + `rh/ler` + `financeiro/ler` | Igual franqueado, sem treinamento. |
| **Supervisor** | `comercial/criar,editar,ler,exportar` + `operacoes/ler` + `sac/ler` | Comercial (escrita) + operações/SAC leitura. |
| **Comercial/Recepção** | `comercial/criar,editar,ler,exportar` | Cadastros/Clientes/Agenda/OS. |
| **Profissional Técnico** | `comercial/ler` + `operacoes/ler` | Só leitura de agenda/comercial/operações. |

**Recorte fino do SAC (por cargo, `session.nivelSac` via `cargos.slug`):** `supervisor_sac` vê tudo; `atendente_sac` só `{/sac, /sac/chamados, /sac/kanban, /sac/triagem, /sac/canais}`; `consulta_sac` acrescenta `relatorios` e `ranking` (Sidebar `SAC_ATENDENTE`/`SAC_CONSULTA`).

**Menu de módulo único** (`ehSoModulo`): quando **todos** os recursos do usuário começam com `sac` ou `financeiro`, o Sidebar **achata** o menu para só aquele módulo + Minha conta (pedido do cliente: "menu personalizado como o SAC"). Só `sac` e `financeiro` têm esse tratamento.

### C.3 Franqueador × Franqueado — como o sistema separa hoje e o que FALTA

**Como o escopo funciona hoje (concreto):**
- O escopo por unidade é **derivado de `perfis_usuario.unidade_id`** → `session.activeUnitId`. **O seletor de unidade do header foi REMOVIDO (03/07)** e o cookie `lc_unit` deixou de ser honrado (`session.ts` L130‑135). Ou seja: **um usuário está preso à sua única `unidade_id`**.
- A separação de dado por unidade é **manual e não‑universal**: `src/lib/sb.ts:scopeUnidade(q, activeUnitId)` faz `.eq('unidade_id', activeUnitId)` **só quando é chamado** (≈89 pontos no código). Onde não é chamado, **não filtra** (depende da RLS).
- **Franqueador (admin_geral):** `activeUnitId=null` → `scopeUnidade` vira **no‑op** → vê **todas** as unidades. `activeUnitName='Todas as unidades'`. Bypassa recursos.
- **Franqueado (cargo `perfil_franqueado`, `unidade_id` preenchido):** `activeUnitId=<sua unidade>` → onde houver `scopeUnidade`/`.eq('unidade_id')`, vê só a sua loja. Vê o menu de comercial/operações + Minha Unidade (essa sim escopada).

**O que um franqueado veria de diferente hoje:** menu de Cadastros/Clientes/Agenda/OS/Relatórios comerciais + "Minha Unidade" com os dados da própria loja; contas/relatórios escopados **quando** a query aplica `unidade_id`.

**O que AINDA FALTA para uma visão de franqueado sólida (gaps concretos):**
1. **Vazamento de escopo no Financeiro.** O menu "Financeiro Franqueadora" é gated por `perm:'financeiro.'`, e `perfil_franqueado` tem `financeiro/ler` → **o franqueado VÊ o menu Financeiro da franqueadora**. Pior: as telas de Financeiro (Fluxo/DRE) são **nível‑rede/empresa** (razão por `centro_custo`/`empresa_id`), **não escopadas à unidade do franqueado**. **Não existe um "DRE/Fluxo da MINHA unidade".** → Precisa: (a) separar recurso `financeiro.unidade` (loja) de `financeiro.franqueadora` (rede); (b) uma tela financeira escopada por `activeUnitId`.
2. **Sem multi‑unidade por franqueado.** `activeUnitId` é **uma** unidade e o seletor foi removido. Um franqueado dono de 2+ lojas (ou "RH de várias franquias", caso de uso citado no ecossistema) **só enxerga uma**. → Precisa: reintroduzir seletor de unidade **restrito às unidades do usuário** + tabela de vínculo usuário↔múltiplas unidades (o `escopo_permissao='empresa'` do modelo 009 **não é aplicado** no app).
3. **Enum de escopo não implementado.** O modelo tem `escopo_permissao` (`global/empresa/unidade/proprio`), mas o app **só usa** `papel + recursos + uma unidade_id`. Não há enforcement de `empresa` (dono franqueado que vê todas as unidades da sua empresa) nem de `proprio` (só os próprios dados). → Precisa: honrar o escopo por recurso na resolução (hoje `resolveRecursos` traz só `recurso_id`, descarta o escopo).
4. **Enforcement por rota ausente.** Como o middleware só autentica, um franqueado pode **abrir URLs fora do menu** (ex.: `/auditoria`, `/financeiro/dre`) e só a RLS o barra (se houver policy). → Precisa: guard central por `recursos`/escopo no `layout`/middleware (deny‑by‑default por rota).
5. **Sem white‑label / visão própria do franqueado.** Não há tema/cor por franquia, subdomínio, nem dashboard "meu negócio" próprio — o franqueado usa o **mesmo layout roxo** com menu filtrado. `disco_config` guarda um `drive_url`, mas não há branding por unidade. → Precisa (se exigido comercialmente): tema por `unidade`/`empresa`, home do franqueado com KPIs só da sua loja.
6. **`admin_franqueado` ≈ admin_geral no menu.** O `papel` só distingue `admin_geral`; qualquer outro cai em `recursos`. Um "franqueado admin" com recursos amplos veria quase tudo **em nível de rede** porque as telas de gestão/financeiro não são escopadas. A distinção "franqueadora vê tudo × franqueado vê a sua" **existe de fato só para as telas que chamam `scopeUnidade`** — não é garantia sistêmica.

**Resumo da separação atual:** franqueador = `admin_geral` (unidade_id null, no‑op de escopo, vê tudo). Franqueado = cargo com recursos + 1 `unidade_id`, escopado **onde a query lembra de escopar**, sem escopo `empresa`, sem multi‑unidade, sem financeiro próprio, sem branding próprio, sem deny‑by‑default por rota.

### Tabela‑resumo — Parte C
| Item | Estado | Dias p/ 100% |
|---|---|---|
| Camada `papel` (rbac.ts) — guards grossos | REAL (mas inconsistente entre páginas) | — |
| Camada `recursos` (cargos) — filtro de menu | REAL | — |
| Seed 17 perfis (`perfis-acesso.sql`) | REAL (idempotente) | — |
| Recorte fino SAC por cargo | REAL | — |
| Enforcement por ROTA (middleware/layout) | STUB (só autentica) | 3–4 |
| Escopo `empresa`/`proprio` (enum 009) no app | STUB (não aplicado) | 5–7 |
| Multi‑unidade por usuário (seletor restrito) | FALTA (seletor removido) | 3–4 |
| Financeiro escopado à unidade do franqueado (DRE da loja) | FALTA (só nível rede) | 6–8 |
| Corrigir vazamento: franqueado vendo Financeiro Franqueadora | FALTA (separar recurso) | 2 |
| White‑label / visão própria do franqueado | FALTA | 6–10 |

---

## Apêndice — Evidências‑chave (arquivos)
- Menu/estado funcional: `src/lib/menu.ts` (seção Rede & Conta L196‑205; `ROTAS_FUNCIONAIS` L215‑256).
- Sessão/escopo: `src/lib/session.ts` (`activeUnitId` L130‑144; `resolveRecursos` L63‑82; `nivelSac` L52‑59).
- RBAC menu: `src/components/layout/Sidebar.tsx` (`canSee`/`hasPerm`/`ehSoModulo` L23‑58; sets SAC L12‑13).
- RBAC guards: `src/lib/rbac.ts`; middleware `src/middleware.ts` (só auth).
- Seed perfis: `scripts/migrations/perfis-acesso.sql`; `scripts/migrations/rbac.sql`.
- Escopo query: `src/lib/sb.ts` (`scopeUnidade` L28‑30).
- Site→sistema: `src/lib/sac-ingest.ts`, `src/app/(app)/leads-site/actions.ts`, `src/lib/supabase/site.ts`, `vercel.json`, `src/app/api/cron/ingest-sac/route.ts`.
- WhatsApp: `src/lib/uazapi.ts`, `src/app/api/webhooks/uazapi/route.ts`, `src/lib/sac-distribuicao.ts`, `src/lib/sac-midia.ts`.
- Financeiro (aliases): `src/app/(app)/financeiro/{dre,calc,receber,pagar,conciliacao,royalties,cobranca,config}/page.tsx` = `import FinanceiroPage from '../page'`; razão `src/lib/financeiro-ledger.ts`.
- BEMP: `scripts/import-bemp-{clientes,os,colaboradores}.mjs`, `scripts/baixar-docs-bemp.mjs`, `scripts/sync-bemp-operacional.mjs`.
- Storage: `src/app/(app)/disco/page.tsx` (`disco_pastas`/`disco_arquivos`/`disco_config`).
</content>
</invoke>
