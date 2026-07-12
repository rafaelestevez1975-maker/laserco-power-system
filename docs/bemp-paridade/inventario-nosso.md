# Inventário — Laser&Co Power System (nosso sistema)
> Base para auditoria de paridade contra o BEMP. Gerado em 11/07/2026 a partir de
> `src/app`, `src/lib`, `scripts/migrations/`, `scripts/import-bemp-*.mjs`,
> `docs/FRONTEND-STATUS.md`, `docs/INFORME-GERAL-2026-07-05.md`, `docs/CHECKLIST-FINANCEIRO.md`.

## 1. Rotas / telas (126 `page.tsx`; 124 no grupo `(app)` + login + primeiro-acesso)

Método do clone: as 101 telas do protótipo HTML foram clonadas 1:1 e a funcionalidade real é
ligada módulo a módulo. `(app)/[...slug]/page.tsx` é o catch-all que serve o clone estático de
qualquer tela ainda não implementada em React. Status por tela: `docs/FRONTEND-STATUS.md`.

### Acompanhamento
| Rota | Propósito | Status |
|---|---|---|
| `/` | Dashboard geral (KPIs, agendamentos/faturamento reais) | funcional (alimentado 05/07) |
| `/agenda` | Agenda de agendamentos (155,8 mil reais + botão "Sincronizar BEMP") | funcional |
| `/os` | Ordens de serviço / comandas (derivadas das orders do BEMP) | funcional |
| `/pdv` | PDV / venda | tela própria |

### Cadastros & Catálogo (19 telas)
`/cadastros/{anamnese, categorias-pagar, categorias-receber, comissoes, contratos, formas-pagamento, grupo-servicos, metas, motivos, origens, parcerias, perfis, planos}` ·
`/clientes` (+ `/clientes/[id]` ficha) · `/colaboradores` (+ `[id]`) · `/contas` (financeiro da loja) ·
`/pacotes` · `/produtos` · `/servicos` · `/descontos` · `/planos` · `/catpag` · `/catrec` · `/notas` (NFSe)
— Clientes/serviços/pacotes/produtos com dados reais do BEMP; CRUDs em paridade com o legado.

### Relatórios (25 telas)
`/relatorios/{agendamentos, anamnese, assinaturas, atendimentos, avaliacoes, clientes, contratos, credito-dinheiro, credito-recorrente, crm, descontos, estatisticas, exportacoes, faturamento, fidelidade, financeiro, metas, notas-fiscais, ocorrencias, ordens-servico, pacotes, pagamentos, perfis-acesso, ranking-vendas, whatsapp}` + hub `/relatorios`.

### Dashboards (7 telas)
`/dashboards/{financeiro, funil, gerencial, vendas-comparativo, vendas-geral, vendas-historico, vendas-mes}`.

### Comunicação, CRM & Conteúdo
`/crm` (kanban leads clientes — funcional) · `/indiques` (indicações — funcional) · `/leads-site`
(ponte dos leads do site, 77 leads reais roteados p/ SAC/RH/CRM — funcional) · `/comunicados`
(funcional, com gate de leitura obrigatória) · `/chamados` (helpdesk interno c/ SLA 48h — funcional) ·
`/checklist` (plano de ação/PDCA sobre `planos_acao`) · `/automacoes` · `/disparos` ·
`/marketing` · `/universidade` · `/disco` · `/canais` (instâncias WhatsApp UAZAPI — funcional) ·
`/vip` (grupos VIP, via `vip_grupos`).

### SAC (11 telas — TODAS funcionais, P0)
`/sac` (dashboard) · `/sac/chamados` · `/sac/kanban` · `/sac/triagem` (chat WhatsApp + IA + fila) ·
`/sac/atendentes` · `/sac/config` · `/sac/pagamentos` (reembolsos↔Financeiro) · `/sac/relatorios` ·
`/sac/ranking` · `/sac/importar` (planilha→chamados) · `/sac/canais`.

### Expansão (7 telas, P0)
`/expansao` · `/expansao/{captacao, funil, leads, disparos, whatsapp, tipos}` — CRM de captação de
FRANQUEADOS (pipeline próprio sobre `crm_leads.pipeline='franquia'`, migration 050).

### RH (9 telas)
`/rh` · `/rh/{colaboradores, ponto, recrutamento, folha, ferias, desempenho, regras}` · `/ponto`
— `/rh/recrutamento` funcional (candidatos/vagas, kanban 7 estágios, currículos do site).

### Franqueadora / Admin
`/financeiro` (+ `/financeiro/{pagar, receber, dre, cobranca, conciliacao, config, calc, royalties}`)
— razão-cêntrico, funcional · `/implantacao` · `/juridico` · `/auditoria` · `/perfis`
(+ `/perfis/[cargoId]`, `/perfis/matriz` — gestão de perfis de acesso).

### Rede & Conta
`/unidades` · `/minha-unidade` · `/minha-conta` · `/app-cliente` · `/exportacoes` · `/ajuda`.

### Fora do shell
`/login` · `/primeiro-acesso` (troca obrigatória de e-mail+senha no 1º login).

## 2. RBAC atual

**Modelo** (tabelas pré-existentes no Supabase `lkii`, migration 009 do ecossistema — geridas via
service-role): `recursos` (recurso com `modulo`) × `acoes` → `permissoes` → `cargo_permissoes` →
`cargos` → `usuario_cargos` (FK `perfil_id` → `perfis_usuario`). `perfis_usuario` ainda carrega o
papel "grosso" (`papel`: `admin_geral` | `sac` | `franqueado` | `colaborador`…) e a `unidade_id`
do usuário (escopo multitenant).

- **Módulos**: comercial, crm, financeiro, marketing, operacoes, rh, sac, sistema, treinamento.
- **Ações**: admin, aprovar, criar, deletar, editar, exportar, ler.
- **Recursos**: ~42 recursos gateiam o menu (ex.: `crm.lead`, `operacoes.os`, `rh.ponto`,
  `sac.canal`, `sistema.cargo`, `sistema.unidade`, `sistema.audit`, `treinamento.curso`…);
  Super Admin soma 1.176 permissões (CHECKLIST-FINANCEIRO §2C).

**Seeds de cargos/perfis**:
- `scripts/migrations/perfis-acesso.sql`: **17 perfis de sistema** (linhas em `cargos`,
  `is_sistema=true`, slugs `perfil_*`): Super Administrador, Administrador, Diretor, Operações,
  Financeiro, Marketing, RH, Expansão, SAC, Jurídico, TI, Auditor, Franqueado, Gerente de Unidade,
  Supervisor, Comercial/Recepção, Profissional Técnico — cada um com regras módulo×ações.
  Modelo "Perfil de acesso × Cargo (função)": o cargo do colaborador é texto livre apontando p/ um perfil.
- Cargos SAC operacionais: `atendente_sac`, `supervisor_sac`, `consulta_sac` (derivam `sacNivel`).
- `scripts/migrations/rbac.sql`: adiciona `cargos.bate_ponto` (heurística: gestão não bate ponto).
- `colaboradores.cargo` (enum função: gerente, subgerente, consultora_vendas, aplicadora) usada no import BEMP.

**Onde o gate é aplicado**:
- `src/lib/session.ts` — `getSessionContext()` (memoizado c/ `cache()`): resolve papel, cargos,
  `recursos[]` (via `resolveRecursos`: cargo_permissoes→permissoes, service-role), unidades visíveis
  (RLS), unidade ativa, `sacNivel`/`sacOnline`. SAC é centralizado (nunca filtra por franquia).
- `src/lib/menu.ts` — cada item de menu tem `perm` (recurso exato ou prefixo `modulo.`);
  sem permissão o item some. `admin_geral` vê tudo.
- `src/lib/rbac.ts` — `ehAdmin` / `temPapel` / `exigirPapel` no topo de Server Actions sensíveis.
- `(app)/layout.tsx` — redirect p/ `/login` sem sessão; landing/menu SAC-only p/ papel `sac`.
- **RLS do Supabase** como 2ª linha de defesa (escopo por empresa/unidade).
- Pendente (FRONTEND-STATUS): RBAC fino por botão/ação dentro de todas as telas.

## 3. Entidades de dados (tabelas por domínio)

Fonte: migrations em `scripts/migrations/` + tabelas pré-existentes no `lkii` referenciadas em `src/`.

### Núcleo multitenant / RBAC / sistema
| Tabela | Propósito |
|---|---|
| `empresas` | Franqueadora + franquias (raiz do multitenant; franqueadora = `000...001`) |
| `unidades` | Lojas/unidades (82) com `bemp_salon_id` p/ mapear o BEMP |
| `perfis_usuario` | Perfil do usuário auth (nome, papel, unidade_id, sac_online) |
| `cargos`, `recursos`, `acoes`, `permissoes`, `cargo_permissoes`, `usuario_cargos` | RBAC (§2) |
| `audit_log` | Trilha de auditoria |
| `kpis_unidade_snapshot` | Snapshot de KPIs por unidade (checklist/planos de ação) |

### Clientes
| `clientes` | Base de clientes (352,6 mil do BEMP, upsert por `bemp_id`, CPF/RG/endereço) |
| `clientes_documentos` | Fotos/anamneses baixadas do app web do BEMP (bucket `clientes-docs`) |
| `origens_cliente`, `motivos_cancelamento` | Cadastros auxiliares |
| `anamnese` (fichas/modelos — migration anamnese.sql) | Fichas de anamnese |

### Colaboradores / RH
| `colaboradores` | Cadastro de colaboradores (liga a `perfis_usuario.perfil_id`) |
| `colaborador_servicos` | Serviços que o profissional executa |
| `candidatos`, `vagas` | Recrutamento (banco de talentos; currículos do site caem aqui) |
| `registros_ponto`, `ponto_config` | Ponto eletrônico |
| `folha_pagamento`, `solicitacoes_ferias`, `atestados` | Folha/férias/atestados |
| `avaliacoes_desempenho`, `pdi` | Desempenho e PDI |
| `rh_departamentos` | Departamentos |

### Agenda / OS / vendas (staging BEMP)
| `agendamentos`, `bloqueios_agenda` | Agenda real (155,8 mil) + bloqueios |
| `os`, `os_servicos`, `os_produtos`, `os_pacotes`, `os_pagamentos` | Ordens de serviço/comandas |
| `bemp_agendamentos` | Staging dos schedules do BEMP (upsert por `bemp_id`) |
| `bemp_billings` | Staging das vendas/faturamento do BEMP (210,3 mil; fonte do razão) |
| `bemp_orders` | Staging das orders do BEMP (fonte da tabela `os`) |

### Serviços / pacotes / produtos / comercial
| `servicos`, `grupo_servicos`, `produtos`, `pacotes`, `pacote_itens` | Catálogo (148/552/11 do BEMP) |
| `planos_assinatura`, `plano_assinatura_servicos` | Planos/assinaturas |
| `formas_pagamento`, `descontos`, `contratos`, `contratos_modelo` | Cadastros comerciais |
| `matriz_comissoes` | Matriz de comissões |
| `metas`, `metas_colaborador` | Metas |
| `avaliacoes` | Avaliações de atendimento |
| `nfse`, `nfse_politica`, `nfse_config_unidade` | Notas fiscais de serviço |

### Financeiro (razão-cêntrico)
| `fin_lancamento` | **Razão único** — todos os produtores lançam aqui (BEMP, royalties, SAC, manuais) |
| `plano_conta` / `plano_contas`, `centro_custo` | Plano de contas (DRE) e centros de custo |
| `fin_recebiveis` | Contas a receber (~13 mil; royalties, recorrentes, suspenso) |
| `fin_contas_pagar` | Contas a pagar (inclui espelho de reembolso do SAC) |
| `fin_config` | Config (royalty %, dia venc., taxas, banco de cobrança, régua) |
| `fin_conciliacao` | Conciliação bancária (import de extrato) |
| `lancamentos_financeiros` | Financeiro da loja (`/contas`, 12.944 lançamentos históricos) |
| `categorias` pagar/receber (categorias.sql) | Categorias da loja |

### SAC
| `sac_tickets` | Chamados do SAC (inclui importados do SULTS) |
| `sac_whatsapp_chats`, `sac_whatsapp_mensagens`, `sac_whatsapp_notas` | Triagem WhatsApp (webhook UAZAPI) |
| `sac_motivos`, `sac_tags`, `sac_respostas_rapidas` | Config do SAC |
| `sac_acordos`, `sac_parcelas` | Acordos/reembolsos parcelados |
| `sac_premiacao_config` | Premiação/ranking de atendentes |

### Leads / CRM / expansão / marketing
| `crm_etapas`, `crm_leads` | Funil kanban; discriminador `pipeline` cliente×franquia (migr. 050) |
| `lasercompany_leads` (projeto riut) + `site_leads` | Fonte dos leads do site + ponte |
| `indicacoes`, `indicacao_indicados`, `indique_config`, `indique_sorteios` | Gestão de indiques |
| `canais_whatsapp` | Vínculo canal UAZAPI ↔ unidade (escopo franquia/geral) |
| `campanhas_whatsapp`, `disparo_campanhas`, `disparo_bases`, `disparo_templates`, `whatsapp_templates` | Disparos em massa |
| `automacoes_custom`, `automacoes_estado`, `automacao_noshow`, `noshow_automacao` | Automações |
| `mkt_materiais`, `mkt_noticias`, `mkt_atualizacoes` | Marketing/conteúdo |
| `vip_grupos` | Grupos VIP |

### Gestão da rede (SULTS-like)
| `comunicados`, `comunicado_leituras` | Comunicados com leitura obrigatória |
| `chamados`, `chamado_mensagens` | Helpdesk interno franquia↔franqueadora (SLA 48h) |
| `planos_acao`, `plano_acao_tarefas` | Checklist/plano de ação (PDCA) |
| `implantacao_projetos`, `implantacao_etapas`, `implantacao_tarefas` | Implantação de unidades |
| `uni_trilhas`, `uni_etapas`, `uni_progresso` | Universidade (treinamento) |
| `juridico_documentos`, `juridico_templates`, `juridico_notificacoes` | Jurídico |
| `documentos`, `documentos_assinatura`, `signatarios_documento` | Documentos p/ assinatura |
| `disco_pastas`, `disco_arquivos`, `disco_config` | Disco virtual (Storage `disco-virtual`) |
| `rede_eventos` | Eventos da rede |

## 4. Dados importados do BEMP (acesso DIRETO ao Postgres do BEMP)

Pipeline: Postgres BEMP → staging `bemp_*` (upsert por `bemp_id`) → transform SQL → tabelas do sistema.
Credenciais BEMP em `/home/jvneto/ProjetosLMK/Laser/RH/.env.local` (`BEMP_PG_*`).

| Entidade | Script | Volume | Corte / período |
|---|---|---|---|
| Clientes (`customers`→`clientes`) | `scripts/import-bemp-clientes.mjs` | **352.589** (CPF em 181.674, RG, endereço) | base completa; import 04/07/2026; idempotente |
| Vendas (`billings`→`bemp_billings`) | `sync-bemp-operacional.mjs` (gap 12–31/mai) + import anterior | **210.287** | mar→jul/2026 (sync antigo parava em 11/mai; renovado 04/07) |
| Agendamentos (`schedules`→`bemp_agendamentos`→`agendamentos`) | `scripts/sync-bemp-operacional.mjs` | **155.785** | fev/2026 → futuros (julho puxado no sync 04/07) |
| OS (`orders`→`bemp_orders`→`os`) | `scripts/import-bemp-os.mjs` | orders desde 01/04/2026 | abr→jul/2026 |
| Colaboradores (`users`+`executions`→`colaboradores`) | `scripts/import-bemp-colaboradores.mjs` | 631 ativos, como esqueleto (CPF `PEND-<id>`, admissão sentinela; unidade derivada dos atendimentos) | GO do Rafael 05/07 |
| Catálogo (serviços/pacotes/produtos) | sync anterior | 148 serviços · 552 pacotes (preço = média real) · 11 produtos | — |
| Financeiro apurado no razão | RPCs "Apurar mês" sobre `bemp_billings` | abr R$ 4,37M · mai R$ 3,76M · jun R$ 2,20M (+royalties/mês) | mar–jun/2026 validados |
| Financeiro das unidades (`/contas`) | sync anterior | 12.944 lançamentos | histórico |
| Fotos/anamneses | `scripts/baixar-docs-bemp.mjs` (robô pronto; fila de 8.363 c/ pacote em andamento) | 0 — **bloqueado**: falta login do app web do BEMP | — |

Mapeamento de unidade: `unidades.bemp_salon_id` ↔ `salon_id` do BEMP. Botão "Sincronizar BEMP"
na Agenda mostra "dados até \<data\>".

## 5. Módulos que NÃO vêm do BEMP (criação própria / SULTS-like) — todos EXISTEM no nosso sistema

O BEMP cobre só o operacional de clínica (clientes, agenda, OS/vendas, catálogo, comissões,
financeiro de loja). O restante é próprio ou inspirado no SULTS:

| Módulo | Rotas | Tabelas | Evidência |
|---|---|---|---|
| SAC | 11 rotas `/sac/*` | `sac_*` (9 tabelas) | funcional; tickets do SULTS importados; IA + WhatsApp |
| Expansão (franquias) | 7 rotas `/expansao/*` | `crm_leads/etapas` c/ `pipeline='franquia'` (migr. 050) | CRM de captação de franqueado, do legado próprio |
| Leads do site | `/leads-site` | `riut.lasercompany_leads` + `site_leads` | ponte roteia p/ SAC/RH/CRM |
| RH / Ponto | 9 rotas `/rh/*` + `/ponto` | `candidatos`, `vagas`, `registros_ponto`, `folha_pagamento`, `solicitacoes_ferias`, `atestados`, `avaliacoes_desempenho`, `pdi` | recrutamento funcional |
| Universidade | `/universidade` | `uni_trilhas`, `uni_etapas`, `uni_progresso` | treinamento (SULTS-like) |
| Jurídico | `/juridico` | `juridico_documentos/templates/notificacoes` | + integração régua de cobrança |
| Plano de ação / Checklist | `/checklist` | `planos_acao`, `plano_acao_tarefas`, `kpis_unidade_snapshot` | PDCA (Checklist Mensal SULTS importado) |
| Implantação | `/implantacao` | `implantacao_projetos/etapas/tarefas` | checklist de abertura de unidade |
| Comunicados | `/comunicados` | `comunicados`, `comunicado_leituras` | SULTS-like, funcional |
| Chamados internos | `/chamados` | `chamados`, `chamado_mensagens` | SULTS-like, SLA 48h, funcional |
| Disco virtual | `/disco` | `disco_*` + bucket | SULTS-like |
| Indiques | `/indiques` | `indicacoes`, `indicacao_*`, `indique_*` | programa próprio do cliente |
| Disparos/automações WhatsApp | `/disparos`, `/canais`, `/automacoes` | `canais_whatsapp`, `disparo_*`, `automacoes_*` | UAZAPI, criação própria |
| Financeiro da franqueadora (razão/DRE/royalties/cobrança/conciliação) | `/financeiro/*` | `fin_*`, `plano_conta`, `centro_custo` | criação própria (BEMP só fornece billings) |
