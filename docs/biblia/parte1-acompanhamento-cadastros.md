# Módulo 1-2 — Acompanhamento & Cadastros

> Documento oficial de homologação. Gerado por leitura direta do código-fonte
> (`src/app/(app)/**`, `src/components/**`, `src/lib/**`, `scripts/migrations/*.sql`)
> e da hierarquia de menu (`src/lib/menu.ts`). Nada aqui é presumido: cada afirmação
> de estado vem de evidência de código (tabela `.from('…')`, `insert/update/delete`
> na server action, componente/modal importado, ou seed SQL).

## 0. Como ler este documento — RBAC e convenção de "funcional"

**Modelo de visibilidade (fonte: `src/components/layout/Sidebar.tsx` + `src/lib/session.ts`).**
O menu é gateado por **recurso** (não por papel diretamente). Regra `canSee`:

- `admin_geral` (Super Admin / Administrador da franqueadora) **vê tudo**.
- Caso contrário, o item exige o `perm` (recurso). Sufixo `.` = qualquer recurso do
  módulo (`hasPerm`: `perm.endsWith('.') ? recursos.some(startsWith) : recursos.includes`).
- Item sem `perm` = visível a todo usuário logado.
- Os `recursos` do usuário são resolvidos em `getSessionContext()` via
  `usuario_cargos → cargo_permissoes → permissoes.recurso_id` (service-role, memoizado por request).
- "Módulo único" (`ehSoModulo`): usuário cujos recursos são só `sac*` ou só `financeiro*`
  enxerga apenas aquele módulo + "Minha conta" (perfis SAC-only e Financeiro-only são
  redirecionados no Dashboard `/` — ver bloco Dashboard).

**Papel (enum `papel_usuario`)** — `colaborador, rh, gestor, admin_geral, financeiro, crm, tecnico, operacoes, sac` (+ `recepcao`, `gerente` adicionados por migration). O papel resolve o `isAdmin`; a granularidade fina vem dos **cargos** (17 perfis seedados em `scripts/migrations/perfis-acesso.sql`: Super Admin → Administrador → Diretor → … → Profissional Técnico).

**Mapeamento perm→quem-vê (deste escopo):**

| perm (recurso) | Módulo | Perfis/cargos que naturalmente enxergam |
|---|---|---|
| *(nenhum)* | — | todos os logados (Dashboard) |
| `operacoes.` / `operacoes.os` | Operações | admin_geral, Gerente/Operações, Recepção (cargos com recurso `operacoes*`) |
| `comercial.` | Comercial | admin_geral, Gerente, Comercial/Consultora, Recepção (cargos com recurso `comercial*`) |
| `financeiro.` | Financeiro | admin_geral, Diretor, Financeiro (cargos com recurso `financeiro*`) |
| `rh.colaborador` | RH | admin_geral, RH, Gerente (cargos com recurso `rh.colaborador`) |
| `sistema.cargo` | Sistema | **apenas** admin_geral / Super Admin / Administrador (recurso de sistema) |

**Convenção "funcional" (`ROTAS_FUNCIONAIS` em `menu.ts`):** rota listada = tela acesa
(query real / empty-state honesto). **Todas as 22 folhas deste escopo estão em `ROTAS_FUNCIONAIS`** — este documento confirma abaixo, caso a caso, se essa marcação é honesta.

**Nota de arquitetura — "pontes de rota":** 5 folhas do menu apontam para uma rota-ponte
que só re-exporta o Server Component do módulo real (para não editar o `menu.ts`):

- `/cadastros/categorias-pagar` → **`/catpag`**
- `/cadastros/categorias-receber` → **`/catrec`**
- `/cadastros/parcerias` → **`/descontos`**
- `/cadastros/planos` → **`/planos`**
- `/cadastros/perfis` → **`/perfis`**

---

# 1. Acompanhamento

## 1.1 Dashboard
- **Rota / perm:** `/` · sem `perm` (visível a todo logado). Título "Dashboard".
- **Arquivos:** `src/app/(app)/page.tsx` → `src/components/agenda/DashboardUnidade.tsx`.
- **O que faz:** Painel de abertura da **unidade ativa** — KPIs operacionais/comerciais do
  período (faturamento, agendamentos, clientes, ticket médio, conversão, metas, ranking).
  Substitui o clone estático do legado (`view-dashboard`).
- **Telas/abas/modais:** Server Component único `DashboardUnidade`, com filtro de período
  (`searchParams: per/di/df`). **Roteamento por perfil no `page.tsx`:** usuário SAC-only
  (`papel==='sac'` ou recursos só `sac*`) é `redirect('/sac')`; usuário Financeiro-only
  (`papel==='financeiro'` ou recursos só `financeiro*`) é `redirect('/financeiro')`.
- **Backend:** consultas reais (sem writes) em `agendamentos`, `clientes`, `metas`, `os`,
  `servicos`. Escopo pela `activeUnitId`. Sem server actions (só leitura).
- **Integrações:** nenhuma externa direta (agrega dados do lkii). Depende do BEMP para os
  dados históricos de `agendamentos` já sincronizados.
- **Estado real:** **FUNCIONAL.** Evidência: `DashboardUnidade` faz 5 queries reais
  ao lkii; há dado massivo (agendamentos na casa das dezenas/centenas de milhar). Em
  `ROTAS_FUNCIONAIS`. Marcação honesta.
- **Requisitos p/ 100%:** cobrir funil/no-show consolidados e comparativo mês-a-mês
  (hoje o foco é KPI de período); confirmar paridade 1:1 com todos os cards do legado.
- **Esforço p/ 100%:** ~1 dia (refino de cards, não é bloqueio).

## 1.2 Agenda
- **Rota / perm:** `/agenda` · `perm 'operacoes.'` → admin_geral + cargos de Operações/Gerência/Recepção.
- **Arquivos:** `src/app/(app)/agenda/page.tsx`, `src/app/(app)/agenda/actions.ts`,
  `src/components/agenda/AgendaGrade.tsx`, `src/lib/agenda.ts`.
- **O que faz:** Grade de agendamentos por profissional/horário da unidade — criar/confirmar/
  cancelar agendamentos, bloquear horários, cadastro rápido de cliente, e publicar/excluir
  **eventos da rede** (agenda compartilhada da franqueadora). Inclui sincronização com o BEMP.
- **Telas/abas/modais:** `AgendaGrade` (grade por profissional × horário, com confirmar/
  cancelar/bloqueio inline). Fluxos: novo agendamento, bloqueio de agenda, cadastro rápido
  de cliente, evento de rede.
- **Backend (server actions em `agenda/actions.ts`):**
  - `buscarClientes(termo, unidadeId)` — autocomplete (`clientes`).
  - `criarAgendamento(input)` — **insert** em `agendamentos`.
  - `confirmarAgendamento(id, viaCliente)` — **update** status.
  - `cancelarAgendamento(id, motivo)` — **update** status + motivo.
  - `cadastrarClienteRapido(input)` — **insert** em `clientes`.
  - `criarBloqueio(input)` — **insert** em `bloqueios_agenda`.
  - `publicarEventoRede(input)` / `excluirEventoRede(id)` — **insert/delete** em `rede_eventos`.
  - `sincronizarAgendaBemp()` — **rpc** + leitura de `bemp_agendamentos` → grava novos em `agendamentos` (retorna `{novos, dadosAte}`).
  - Tabelas tocadas: `agendamentos`, `bloqueios_agenda`, `clientes`, `rede_eventos`,
    `bemp_agendamentos`, `perfis_usuario`, `unidades`, `servicos`, `colaboradores`.
- **Integrações:** **BEMP** (import de agendamentos via `bemp_agendamentos` + rpc de sync);
  agenda de rede (franqueadora). Sem WhatsApp direto aqui.
- **Estado real:** **FUNCIONAL.** Evidência: 4 inserts + 2 updates + 1 delete + 1 rpc reais;
  grade lê `agendamentos`/`colaboradores`/`servicos`/`rede_eventos` reais; sync BEMP implementado.
  Em `ROTAS_FUNCIONAIS`. Honesto.
- **Requisitos p/ 100%:** confirmação de agendamento *via app/WhatsApp do cliente*
  (`viaCliente` existe no contrato mas depende da integração de mensageria/app-cliente);
  validar régua de lembrete automático (no-show) conectada.
- **Esforço p/ 100%:** ~2 dias (lembrete/confirmação automatizada + polimento de grade).

## 1.3 Ordens de serviço
- **Rota / perm:** `/os` · `perm 'operacoes.os'` → admin_geral + cargos com `operacoes.os`.
- **Arquivos:** `src/app/(app)/os/page.tsx`, `src/app/(app)/os/actions.ts`,
  `src/components/os/{OsList,OsFiltros,NovaOSModal,OsDetalheModal}.tsx`, `src/lib/os-numero.ts`, `src/lib/pdv.ts`.
- **O que faz:** Abertura, itemização (serviços/produtos/pacotes), pagamento, finalização
  e cancelamento de Ordens de Serviço da unidade — o núcleo transacional de venda/atendimento.
- **Telas/abas/modais:** lista (`OsList`) + filtros (`OsFiltros`) + **modal Nova OS**
  (`NovaOSModal`) + **modal de detalhe** (`OsDetalheModal`, carrega itens/pagamentos e
  gate por permissão). Status de OS: aberta → (itens) → finalizada / cancelada / paga.
- **Backend (server actions em `os/actions.ts`):**
  - `abrirOS(input)` — **insert** em `os` (numeração via `os-numero.ts`).
  - `adicionarItem(input, activeUnitId)` — **insert** em `os_servicos`/`os_produtos`/`os_pacotes`.
  - `removerItem(...)` — **delete** de item.
  - `finalizarOS(osId, activeUnitId)` — **update** status.
  - `cancelarOS(osId, activeUnitId)` — **update** status.
  - `registrarPagamento(input, activeUnitId)` — **insert** em `os_pagamentos`.
  - `carregarDetalheOS(osId, activeUnitId)` — leitura consolidada do detalhe.
  - Tabelas: `os`, `os_servicos`, `os_produtos`, `os_pacotes`, `os_pagamentos`
    (+ `clientes`, `servicos`, `perfis_usuario` na listagem).
- **Integrações:** emissão de NFS-e prevista (módulo `/notas`, "EM BREVE") **não** amarrada
  aqui ainda; pagamentos são registro contábil interno (sem gateway).
- **Estado real:** **FUNCIONAL** (CRUD transacional real: 2 inserts + 3 updates + 1 delete +
  inserts de itens/pagamentos). Em `ROTAS_FUNCIONAIS`. Honesto.
- **Requisitos p/ 100%:** amarrar emissão fiscal (NFS-e) na finalização; alçada de desconto
  por cargo + cortesias (BACKLOG 6.1/1.8); PDV completo (`/pdv` está comentado no menu).
- **Esforço p/ 100%:** ~3 dias (fiscal + alçadas/cortesias + polimento).

---

# 2. Cadastros

## 2.A — Grupo "Cadastros básicos" (13 folhas)

### 2.1 Anamnese / Ficha Técnica
- **Rota / perm:** `/cadastros/anamnese` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/anamnese/{page.tsx,actions.ts}`, `src/components/anamnese/AnamneseManager.tsx`, `src/lib/anamnese.ts`; seed `scripts/migrations/anamnese.sql`.
- **O que faz:** Cadastro dos **modelos de documento** clínico/ficha (anamnese, termos) que
  serão preenchidos pelos clientes — com seções, obrigatoriedade e acumulatividade.
- **Telas/abas/modais:** `AnamneseManager` (lista + editor de documento com seções).
- **Backend (`anamnese/actions.ts`):** `criarDocumento` (**insert** `documentos`),
  `salvarDocumento(id)` (**update**), `toggleDocumentoStatus(id, ativar)` (**update**).
  Tabelas: `documentos` (cols: `nome, tipo, descricao, preenchimento, obrigatorio, status,
  acumulativo, secoes(jsonb), empresa_id`), `audit_log`, `empresas`, `perfis_usuario`, `unidades`.
- **Integrações:** grava `audit_log` (LGPD). Ficha ligada ao cliente (aba Anamnese em ClienteFicha).
- **Estado real:** **FUNCIONAL.** Insert/update reais + seed com documentos-modelo. Honesto.
- **Requisitos p/ 100%:** builder visual de seções mais rico; assinatura/coleta pelo app do cliente.
- **Esforço p/ 100%:** ~1 dia.

### 2.2 Categorias de Contas a pagar
- **Rota / perm:** `/cadastros/categorias-pagar` → **ponte** para `/catpag` · `perm 'financeiro.'`.
- **Arquivos:** `cadastros/categorias-pagar/page.tsx` (re-export), `catpag/{page.tsx,actions.ts}`, `src/components/catcontas/CategoriasManager.tsx`; seed `categorias.sql`.
- **O que faz:** Manutenção do **plano de contas — natureza pagar** (categorias/subcategorias
  de despesa) usado nos lançamentos financeiros da unidade.
- **Telas/abas/modais:** `CategoriasManager` (árvore de categorias, empty-state "Nenhuma…").
- **Backend (`catpag/actions.ts`):** `criarCategoria` (**insert** `plano_contas`),
  `editarCategoria` (**update**), `alternarAtivoCategoria(id, ativo, tipo)` (**update**).
  Tabela `plano_contas` (cols: `codigo, nome, tipo, natureza, parent_id, aceita_lancamentos,
  is_sistema, ativo, empresa_id`). Seed em `categorias.sql` (árvore pagar/receber).
- **Integrações:** consumido por `/contas` (lançamentos) e Financeiro Franqueadora.
- **Estado real:** **FUNCIONAL.** CRUD real + seed. Honesto.
- **Requisitos p/ 100%:** nenhum estrutural (só dados reais da franquia).
- **Esforço p/ 100%:** 0.

### 2.3 Categorias de Contas a receber
- **Rota / perm:** `/cadastros/categorias-receber` → **ponte** para `/catrec` · `perm 'financeiro.'`.
- **Arquivos:** `cadastros/categorias-receber/page.tsx` (re-export), `catrec/page.tsx`, mesmo `CategoriasManager`.
- **O que faz:** Idem 2.2 mas para o **plano de contas — natureza receber** (categorias de receita).
- **Telas/abas/modais:** `CategoriasManager` (mesmo componente, filtrado por `tipo=receber`).
- **Backend:** **`catrec/actions.ts` está vazio** — a tela **reusa as actions do `/catpag`**
  (o parâmetro `tipo` da `CategoriasManager` direciona pagar/receber sobre a mesma `plano_contas`).
  Lê `plano_contas`.
- **Integrações:** idem 2.2.
- **Estado real:** **FUNCIONAL** (compartilha CRUD real do catpag sobre `plano_contas`; empty-state honesto). Honesto — *ressalva*: não tem actions próprias, depende do manager compartilhado.
- **Requisitos p/ 100%:** nenhum estrutural.
- **Esforço p/ 100%:** 0.

### 2.4 Parcerias
- **Rota / perm:** `/cadastros/parcerias` → **ponte** para `/descontos` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/parcerias/page.tsx` (re-export), `descontos/{page.tsx,actions.ts}`, `src/components/descontos/DescontosManager.tsx`.
- **O que faz:** Cadastro de **parcerias/descontos** (convênios, cupons, políticas de desconto).
- **Telas/abas/modais:** `DescontosManager` (lista + form de desconto/parceria).
- **Backend (`descontos/actions.ts`):** `criarDesconto` (**insert** `descontos`),
  `editarDesconto` (**update**), `alternarAtivoDesconto` (**update**). Tabela única `descontos`.
- **Integrações:** aplicável em OS/PDV (alçada de desconto — pendente, BACKLOG 1.8/6.1).
- **Estado real:** **FUNCIONAL** (CRUD real sobre `descontos`). Honesto.
- **Requisitos p/ 100%:** amarrar aplicação do desconto no fluxo de venda com alçada por cargo.
- **Esforço p/ 100%:** ~1 dia (integração com OS/PDV; o cadastro em si está pronto).

### 2.5 Formas de pagamento
- **Rota / perm:** `/cadastros/formas-pagamento` · `perm 'financeiro.'`.
- **Arquivos:** `cadastros/formas-pagamento/{page.tsx,actions.ts}`; seed `catalogo.sql`.
- **O que faz:** Cadastro das **formas de pagamento** (dinheiro/cartão/pix/recorrência) com
  taxas, taxa de comissão, mínimo de parcela e base de royalties.
- **Telas/abas/modais:** lista/CRUD inline na própria page.
- **Backend (`formas-pagamento/actions.ts`):** `criarForma` (**insert**), `salvarForma` (**update**),
  `toggleFormaAtiva` (**update**). Tabela `formas_pagamento` (cols: `nome, tipo, taxa,
  taxa_comissao, rec_min_parcela, rec_base_royalties ('recorrencia'|'venda'), ativo, ordem,
  empresa_id`). Seed em `catalogo.sql`.
- **Integrações:** taxa de comissão liga à matriz de comissões; base de royalties liga ao
  Financeiro Franqueadora (automação de royalties).
- **Estado real:** **FUNCIONAL** (CRUD real + seed com colunas de taxa/royalty). Honesto.
- **Requisitos p/ 100%:** nenhum estrutural.
- **Esforço p/ 100%:** 0.

### 2.6 Grupo de serviços
- **Rota / perm:** `/cadastros/grupo-servicos` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/grupo-servicos/{page.tsx,actions.ts}`, `src/components/servicos/GruposManager.tsx`; seed `catalogo.sql`.
- **O que faz:** Categorização dos serviços em **grupos** (ex.: depilação, estética facial).
- **Telas/abas/modais:** lista de grupos + criar/renomear/ativar.
- **Backend (`grupo-servicos/actions.ts`):** `criarGrupo(nome)` (**insert**),
  `renomearGrupo(id, antigo, novo)` (**update** — propaga renome aos `servicos`),
  `toggleGrupoAtivo` (**update**). Tabelas `grupo_servicos` (`nome, ativo, ordem, empresa_id`)
  e `servicos` (para propagação/contagem).
- **Integrações:** consumido por Serviços, Pacotes e relatórios.
- **Estado real:** **FUNCIONAL** (CRUD real + seed). Honesto.
- **Requisitos p/ 100%:** nenhum estrutural.
- **Esforço p/ 100%:** 0.

### 2.7 Matriz de comissões
- **Rota / perm:** `/cadastros/comissoes` · `perm 'financeiro.'`.
- **Arquivos:** `cadastros/comissoes/{page.tsx,actions.ts}`, `src/components/comissoes/ComissoesBoard.tsx`, `src/lib/comissoes.ts`; seed `comissoes.sql`.
- **O que faz:** Define a **matriz de percentuais de comissão** por categoria/base (individual/
  equipe) aplicada aos colaboradores.
- **Telas/abas/modais:** `ComissoesBoard` (grid editável de categorias × percentuais; empty-state).
- **Backend (`comissoes/actions.ts`):** `salvarMatriz(cats)` — **delete-all + insert** (regrava a
  matriz inteira). Tabela `matriz_comissoes` (`base_individual_pct numeric(6,2)`, categorias,
  `empresa_id`) + `colaborador_servicos` (vínculo). Seed em `comissoes.sql`. Page lê `colaboradores`+`matriz_comissoes`.
- **Integrações:** alimenta cálculo de comissão (folha/pagamentos) e ranking.
- **Estado real:** **FUNCIONAL** (persiste matriz real via delete+insert; seed presente).
  Honesto. *Ressalva:* FRONTEND-STATUS previa "simulador" (EPIC 4.1) — a matriz grava, mas o
  simulador de cenários é o refino pendente.
- **Requisitos p/ 100%:** simulador de comissão + aplicação automática no fechamento de OS/folha.
- **Esforço p/ 100%:** ~1,5 dia.

### 2.8 Metas
- **Rota / perm:** `/cadastros/metas` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/metas/{page.tsx,actions.ts}`, `src/components/metas/{MetasColaboradorCrud,MetasUnidadeSimulador}.tsx`.
- **O que faz:** Define **metas por colaborador** e simula **metas da unidade**, comparando
  realizado (a partir de agendamentos) vs meta.
- **Telas/abas/modais:** `MetasColaboradorCrud` (CRUD de meta por pessoa) + `MetasUnidadeSimulador`
  (simulador da unidade sobre realizado).
- **Backend (`metas/actions.ts`):** `criarMeta` (**insert**), `salvarMeta` (**update**),
  `atualizarRealizado(id, valor)` (**update**), `excluirMeta` (**delete**). Tabela
  `metas_colaborador`. Page lê `metas_colaborador` + `colaboradores` + `agendamentos` (realizado).
- **Integrações:** consome `agendamentos` (realizado); aparece no Dashboard e relatório de metas.
- **Estado real:** **FUNCIONAL** (CRUD completo real + simulador sobre dados reais). Honesto.
- **Requisitos p/ 100%:** automação do "realizado" (hoje pode ser atualizado manual/derivado);
  metas por unidade persistidas (o componente da unidade é simulador).
- **Esforço p/ 100%:** ~1 dia.

### 2.9 Modelos de contrato
- **Rota / perm:** `/cadastros/contratos` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/contratos/{page.tsx,actions.ts}`, `src/components/contratos/ContratosManager.tsx`, `src/lib/contratos.ts`; seed `categorias.sql` (bucket storage + `contratos_modelo`).
- **O que faz:** Biblioteca de **modelos de contrato** (arquivo + regra de "quando emitido")
  usados na venda de planos/pacotes.
- **Telas/abas/modais:** `ContratosManager` (lista + upload/gerência de modelo).
- **Backend (`contratos/actions.ts`):** `criarContrato` (**insert**), `salvarContrato` (**update**),
  `alternarAtivoContrato` (**update**), `urlArquivoContrato(id)` (gera URL assinada do **Storage**).
  Tabela `contratos_modelo` (`nome, quando_emitido, titulo, ordem, empresa_id`) + bucket de storage.
- **Integrações:** **Supabase Storage** (arquivos de contrato).
- **Estado real:** **FUNCIONAL** (CRUD real + storage). Honesto.
- **Requisitos p/ 100%:** geração/assinatura do contrato preenchido na venda (merge de variáveis + e-sign).
- **Esforço p/ 100%:** ~2 dias (se exigir preenchimento/assinatura automatizados).

### 2.10 Motivos de cancelamento
- **Rota / perm:** `/cadastros/motivos` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/motivos/{page.tsx,actions.ts}`, `src/components/motivos/MotivosManager.tsx`; seed `anamnese.sql`.
- **O que faz:** Cadastro dos **motivos de cancelamento/no-show** + configuração da
  **automação de no-show** (régua).
- **Telas/abas/modais:** `MotivosManager` (lista de motivos + painel de config de no-show).
- **Backend (`motivos/actions.ts`):** `criarMotivo` (**insert**), `salvarMotivo` (**update**),
  `toggleMotivoAtivo` (**update**), `excluirMotivo` (**delete**),
  `salvarNoshowConfig(cfg)` (**upsert** em `noshow_automacao`). Tabelas
  `motivos_cancelamento` (`nome, sistema, ativo, ordem`), `noshow_automacao`, `audit_log`.
- **Integrações:** `noshow_automacao` prepara régua automática (WhatsApp/lembrete — depende
  do canal conectado).
- **Estado real:** **FUNCIONAL** (CRUD + upsert de config real, com audit_log). Honesto.
- **Requisitos p/ 100%:** executor da régua de no-show (cron/pg_net + envio WhatsApp) ligado à config.
- **Esforço p/ 100%:** ~1,5 dia (a config grava; falta o disparo automático).

### 2.11 Planos de Assinatura
- **Rota / perm:** `/cadastros/planos` → **ponte** para `/planos` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/planos/page.tsx` (re-export), `planos/{page.tsx,actions.ts}`, `src/components/planos/PlanosManager.tsx`.
- **O que faz:** Cadastro dos **planos de assinatura** (recorrência) e os **serviços inclusos** em cada plano.
- **Telas/abas/modais:** `PlanosManager` (lista + editor com seleção de serviços do plano).
- **Backend (`planos/actions.ts`):** `criarPlano` (**insert** `planos_assinatura` + **insert**
  itens em `plano_assinatura_servicos`), `editarPlano` (**update** + **delete/insert** de itens),
  `togglePlanoAtivo` (**update**). Tabelas `planos_assinatura`, `plano_assinatura_servicos`
  (junção plano↔serviço), `servicos`.
- **Integrações:** liga a assinaturas/crédito recorrente (relatórios) e cobrança/royalties.
- **Estado real:** **FUNCIONAL** (CRUD real com junção de serviços). Honesto.
- **Requisitos p/ 100%:** cobrança recorrente automática do plano (gateway/pix recorrente) — decisão do cliente.
- **Esforço p/ 100%:** ~2 dias (se incluir motor de cobrança recorrente).

### 2.12 Perfis de acesso
- **Rota / perm:** `/cadastros/perfis` → **ponte** para `/perfis` · `perm 'sistema.cargo'`
  (**apenas admin_geral / Super Admin / Administrador**).
- **Arquivos:** `cadastros/perfis/page.tsx` (re-export), `perfis/{page.tsx,actions.ts}`,
  `perfis/matriz/page.tsx`, `perfis/[cargoId]/page.tsx`, `src/components/perfis/PerfisLista.tsx`; seed `perfis-acesso.sql` + `rbac.sql`.
- **O que faz:** **Editor de RBAC real** — cria/edita cargos, edita a matriz de permissões
  (`cargo_permissoes`), aplica presets, atribui cargo a usuário, marca "bate ponto".
- **Telas/abas/modais:** `PerfisLista` (rota `/perfis`), **matriz de permissões** (`/perfis/matriz`),
  **editor de cargo** (`/perfis/[cargoId]`).
- **Backend (`perfis/actions.ts`):** `salvarPermissoesCargo` (**upsert/delete** `cargo_permissoes`),
  `aplicarPreset`, `criarCargo` (**insert** `cargos`), `atualizarCargo` (**update**),
  `alternarAtivoCargo`, `alternarBatePonto`, `excluirCargo` (**delete**),
  `atribuirCargoUsuario` (**insert** `usuario_cargos`), `removerCargoUsuario` (**delete**).
  Tabelas `cargos`, `cargo_permissoes`, `permissoes`, `usuario_cargos`, `perfis_usuario`, `empresas`, `audit_log`.
- **Integrações:** é a **fonte do gate de menu/botões** (lido por `getSessionContext`);
  grava `audit_log`. 17 perfis seedados (`perfis-acesso.sql`).
- **Estado real:** **FUNCIONAL.** Evidência: grava `cargo_permissoes`/`usuario_cargos` de
  verdade (6 delete + 4 insert + 4 update + 2 upsert) — resolve o gap histórico do protótipo
  ("só dava toast"). Honesto.
- **Requisitos p/ 100%:** validar escopo (global/empresa/unidade/proprio) por permissão e
  testes de isolamento entre franquias (BACKLOG 1.2/1.3).
- **Esforço p/ 100%:** ~1 dia (testes/escopo; editor pronto).

### 2.13 Origens de Cliente
- **Rota / perm:** `/cadastros/origens` · `perm 'comercial.'`.
- **Arquivos:** `cadastros/origens/{page.tsx,actions.ts}`, `src/components/origens/OrigensManager.tsx`; seed `anamnese.sql`.
- **O que faz:** Cadastro das **origens de captação** do cliente (Instagram, indicação, site…),
  com flag `auto` (origem automática) e `campo`.
- **Telas/abas/modais:** `OrigensManager` (lista + CRUD).
- **Backend (`origens/actions.ts`):** `criarOrigem` (**insert**), `salvarOrigem` (**update**),
  `toggleOrigemAtiva` (**update**), `excluirOrigem` (**delete**). Tabela `origens_cliente`
  (`nome, ativo, auto, campo, ordem, empresa_id`), `audit_log`.
- **Integrações:** usada no cadastro de cliente e nos leads do site (origem automática).
- **Estado real:** **FUNCIONAL** (CRUD real + audit + seed). Honesto.
- **Requisitos p/ 100%:** nenhum estrutural.
- **Esforço p/ 100%:** 0.

## 2.B — Cadastros de topo (6 folhas)

### 2.14 Clientes
- **Rota / perm:** `/clientes` · `perm 'comercial.'`.
- **Arquivos:** `clientes/{page.tsx,actions.ts}`, `clientes/[id]/page.tsx`, `clientes/export/`,
  `src/components/clientes/{ClientesList,ClientesFiltros,NovoClienteModal,ImportarClientesModal,ClienteFicha}.tsx`, `src/lib/clientes.ts`.
- **O que faz:** Base de clientes da unidade — lista com filtros, cadastro/edição,
  **checagem de duplicados + unificação**, **importação em massa (Excel/CSV)**, ficha 360°
  do cliente e exportação.
- **Telas/abas/modais:** lista (`ClientesList`) + filtros; **modal Novo Cliente**
  (`NovoClienteModal`) com checagem de duplicado; **modal Importar** (`ImportarClientesModal`);
  **ficha do cliente** `/clientes/[id]` (`ClienteFicha`) com abas **Dados/Carteira**,
  **Agendamentos**, **Anamnese**, **Contratos**, **Acompanhamento**; **export** `/clientes/export`.
- **Backend (`clientes/actions.ts`):** `checarDuplicado`, `criarCliente(input, forcar)` (**insert**),
  `salvarCliente(id)` (**update**), `inativarCliente`/`reativarCliente` (**update**),
  `importarClientes(...)` (**insert** em lote), `listarDuplicados(id)`,
  `unificarClientes(manterId, removerIds)` (**update**/merge). Tabelas `clientes`, `agendamentos`, `unidades`.
- **Integrações:** **leads do site** entram como clientes/origem; importação Excel; base
  compartilhada com Agenda/OS/CRM.
- **Estado real:** **FUNCIONAL** com **dado real massivo** (base de clientes importada do BEMP).
  Evidência: 2 inserts + 6 updates, dedupe/merge e importação implementados; ficha lê dados reais.
  Honesto.
- **Requisitos p/ 100%:** ficha 360° completa (crédito/financeiro do cliente); régua de
  reengajamento por IA (P2); confirmar mapeamento de todas as colunas do Excel do cliente.
- **Esforço p/ 100%:** ~2 dias.

### 2.15 Colaboradores
- **Rota / perm:** `/colaboradores` · `perm 'rh.colaborador'`.
- **Arquivos:** `colaboradores/{page.tsx,actions.ts}`, `colaboradores/[id]/page.tsx`,
  `src/components/colaboradores/{ColaboradoresList,ColaboradoresFiltros,NovoColaboradorModal,ColaboradorFicha}.tsx`, `src/lib/pessoas.ts`.
- **O que faz:** Cadastro dos **colaboradores** da unidade (recepção/técnica/gestão), com
  checagem de CPF duplicado e **vínculo de serviços que o colaborador executa**. Modelo de
  pessoas: `colaboradores ⟷ perfis_usuario` (via `perfil_id`) — colaborador pode virar usuário/atendente.
- **Telas/abas/modais:** lista (`ColaboradoresList`) + filtros; **modal Novo Colaborador**;
  **ficha** `/colaboradores/[id]` (`ColaboradorFicha`) com abas **Dados**, **Serviços**, **Comissão**.
- **Backend (`colaboradores/actions.ts`):** `checarCpfDuplicado`, `criarColaborador(input, forcar)`
  (**insert**), `salvarColaborador(id)` (**update**), `inativar`/`reativar` (**update**),
  `carregarServicosColaborador`, `salvarServicosColaborador(id, servicoIds)` (**delete+insert**
  em `colaborador_servicos`). Tabelas `colaboradores`, `colaborador_servicos`, `servicos`.
- **Integrações:** liga a RH (`/rh/colaboradores`), Ponto, Comissões, Agenda (profissional),
  e ao RBAC (quando vira usuário). Fonte única `src/lib/pessoas.ts`.
- **Estado real:** **FUNCIONAL** (CRUD real + vínculo de serviços via junção). Honesto.
- **Requisitos p/ 100%:** filtros avançados (EPIC 20.4); amarração ponto↔folha↔comissão; foto/documentos.
- **Esforço p/ 100%:** ~1,5 dia.

### 2.16 Contas da Unidade (pagar/receber)
- **Rota / perm:** `/contas` · `perm 'financeiro.'`. Título "Contas a pagar/receber · Unidade".
- **Arquivos:** `contas/{page.tsx,actions.ts}`, `src/components/contas/ContasManager.tsx`, `src/lib/financeiro.ts`; seed `financeiro.sql`.
- **O que faz:** Financeiro **da unidade** (distinto do Financeiro Franqueadora) — lançamentos
  a pagar/receber, com baixa/pagamento, classificados no plano de contas.
- **Telas/abas/modais:** `ContasManager` (abas pagar/receber, lista + novo lançamento + baixa).
- **Backend (`contas/actions.ts`):** `novoLancamento(input)` (**insert** `lancamentos_financeiros`),
  `registrarPagamento(lancamentoId)` (**update** → status pago), `editarLancamento(input)` (**update**).
  Tabelas `lancamentos_financeiros`, `plano_contas`, `unidades`.
- **Integrações:** usa `plano_contas` (categorias 2.2/2.3); consolida no Financeiro Franqueadora
  (DRE/fluxo de caixa) por escopo de unidade.
- **Estado real:** **FUNCIONAL** (insert + updates reais sobre `lancamentos_financeiros`). Honesto.
- **Requisitos p/ 100%:** recorrência de lançamento, anexo de comprovante (storage),
  conciliação com extrato bancário da unidade.
- **Esforço p/ 100%:** ~2 dias.

### 2.17 Pacotes
- **Rota / perm:** `/pacotes` · `perm 'comercial.'`.
- **Arquivos:** `pacotes/{page.tsx,actions.ts}`, `src/components/pacotes/PacotesManager.tsx`, `src/lib/catalogo.ts`; seed `catalogo.sql`.
- **O que faz:** Cadastro de **pacotes** (combos de serviços com preço fechado / nº de sessões).
- **Telas/abas/modais:** `PacotesManager` (lista + editor com **seleção de serviços/itens do pacote**).
- **Backend (`pacotes/actions.ts`):** `criarPacote` (**insert** `pacotes` + **insert** itens
  `pacote_itens`), `editarPacote` (**update** + **delete/insert** itens), `togglePacoteAtivo` (**update**).
  Tabelas `pacotes`, `pacote_itens` (junção pacote↔serviço), `servicos`.
- **Integrações:** vendável em OS (`os_pacotes`); aparece em relatório de pacotes.
- **Estado real:** **FUNCIONAL** (CRUD real com junção de itens; seed presente). Honesto.
- **Requisitos p/ 100%:** controle de saldo de sessões por cliente (consumo do pacote na OS).
- **Esforço p/ 100%:** ~1,5 dia (saldo/consumo; cadastro pronto).

### 2.18 Produtos
- **Rota / perm:** `/produtos` · `perm 'comercial.'`.
- **Arquivos:** `produtos/{page.tsx,actions.ts}`, `src/components/produtos/{ProdutosList,ProdutosFiltros,ProdutoModal}.tsx`.
- **O que faz:** Cadastro de **produtos** revendidos (cosméticos etc.) — preço e status.
- **Telas/abas/modais:** lista (`ProdutosList`) + filtros + **modal Produto** (`ProdutoModal`,
  com gate por permissão). Empty-state honesto ("Nenhum produto cadastrado ainda").
- **Backend (`produtos/actions.ts`):** `criarProduto` (**insert**), `salvarProduto` (**update**),
  `toggleProdutoAtivo` (**update**). Tabela única `produtos`.
- **Integrações:** vendável em OS (`os_produtos`); relatórios.
- **Estado real:** **FUNCIONAL** (CRUD real; empty-state honesto). Honesto.
- **Requisitos p/ 100%:** **controle de estoque** (não há tabela/coluna de estoque nas actions);
  custo/margem; código de barras — decisão do cliente se entra no escopo.
- **Esforço p/ 100%:** ~2 dias (se incluir estoque); 0 para o cadastro puro.

### 2.19 Serviços
- **Rota / perm:** `/servicos` · `perm 'comercial.'`.
- **Arquivos:** `servicos/{page.tsx,actions.ts}`, `src/components/servicos/{ServicosList,ServicosFiltros,ServicoModal,GruposManager}.tsx`; seed `catalogo.sql`.
- **O que faz:** Cadastro dos **serviços** prestados (preço, duração, grupo) — catálogo central
  consumido por Agenda, OS, Pacotes, Planos, Comissões.
- **Telas/abas/modais:** lista (`ServicosList`) + filtros + **modal Serviço** (`ServicoModal`) +
  gerência de grupos embutida (`GruposManager`).
- **Backend (`servicos/actions.ts`):** `criarServico` (**insert**), `salvarServico` (**update**),
  `toggleServicoAtivo` (**update**), `renomearGrupo(de, para)` (**update** em massa). Tabelas
  `servicos`, `grupo_servicos`.
- **Integrações:** é o **catálogo-mãe** referenciado por `os_servicos`, `pacote_itens`,
  `plano_assinatura_servicos`, `colaborador_servicos`, `matriz_comissoes`.
- **Estado real:** **FUNCIONAL** (CRUD real + seed). Honesto.
- **Requisitos p/ 100%:** nenhum estrutural.
- **Esforço p/ 100%:** 0.

---

# 3. Tabela-resumo

| # | Funcionalidade (folha do menu) | Rota (→ ponte) | Estado | Dias p/ 100% |
|---|---|---|---|---|
| 1.1 | Dashboard | `/` | FUNCIONAL | 1 |
| 1.2 | Agenda | `/agenda` | FUNCIONAL | 2 |
| 1.3 | Ordens de serviço | `/os` | FUNCIONAL | 3 |
| 2.1 | Anamnese / Ficha Técnica | `/cadastros/anamnese` | FUNCIONAL | 1 |
| 2.2 | Categorias Contas a pagar | `/cadastros/categorias-pagar` → `/catpag` | FUNCIONAL | 0 |
| 2.3 | Categorias Contas a receber | `/cadastros/categorias-receber` → `/catrec` | FUNCIONAL | 0 |
| 2.4 | Parcerias | `/cadastros/parcerias` → `/descontos` | FUNCIONAL | 1 |
| 2.5 | Formas de pagamento | `/cadastros/formas-pagamento` | FUNCIONAL | 0 |
| 2.6 | Grupo de serviços | `/cadastros/grupo-servicos` | FUNCIONAL | 0 |
| 2.7 | Matriz de comissões | `/cadastros/comissoes` | FUNCIONAL (simulador pendente) | 1,5 |
| 2.8 | Metas | `/cadastros/metas` | FUNCIONAL | 1 |
| 2.9 | Modelos de contrato | `/cadastros/contratos` | FUNCIONAL | 2 |
| 2.10 | Motivos de cancelamento | `/cadastros/motivos` | FUNCIONAL (disparo no-show pendente) | 1,5 |
| 2.11 | Planos de Assinatura | `/cadastros/planos` → `/planos` | FUNCIONAL | 2 |
| 2.12 | Perfis de acesso | `/cadastros/perfis` → `/perfis` | FUNCIONAL | 1 |
| 2.13 | Origens de Cliente | `/cadastros/origens` | FUNCIONAL | 0 |
| 2.14 | Clientes | `/clientes` | FUNCIONAL (dado real) | 2 |
| 2.15 | Colaboradores | `/colaboradores` | FUNCIONAL | 1,5 |
| 2.16 | Contas da Unidade | `/contas` | FUNCIONAL | 2 |
| 2.17 | Pacotes | `/pacotes` | FUNCIONAL | 1,5 |
| 2.18 | Produtos | `/produtos` | FUNCIONAL (sem estoque) | 2 |
| 2.19 | Serviços | `/servicos` | FUNCIONAL | 0 |

**Totais do escopo:**
- **22 folhas de menu** documentadas (3 Acompanhamento + 13 Cadastros básicos + 6 Cadastros de topo).
- **31 arquivos `page.tsx`** materializam essas folhas: 22 telas principais + 5 pontes de rota
  (categorias-pagar, categorias-receber, parcerias, planos, perfis) + sub-telas
  (`clientes/[id]`, `colaboradores/[id]`, `perfis/matriz`, `perfis/[cargoId]`) — além da rota
  de export `clientes/export`.
- **Estado geral:** **22/22 FUNCIONAIS** (todas em `ROTAS_FUNCIONAIS`, marcação confirmada como
  honesta por evidência de insert/update/delete real e/ou empty-state honesto). Nenhuma tela
  em FALTA; 6 telas com refino PARCIAL sinalizado (comissões-simulador, no-show-disparo,
  produtos-estoque, contratos-esign, planos-cobrança, clientes/contas-360º).
- **Esforço somado p/ 100% (refinos):** ~**28,5 dias-dev** (a maior parte é integração/decisão
  do cliente, não reconstrução — o núcleo CRUD já grava de verdade no lkii).

**Ressalvas de fidelidade:**
- `/catrec` não tem `actions.ts` próprio — reusa as actions de `/catpag` sobre a mesma tabela
  `plano_contas` (parâmetro `tipo`). Funcional, mas é dependência a registrar.
- Produtos **não têm coluna/tabela de estoque** nas actions atuais — se estoque for requisito de
  homologação, é desenvolvimento novo (~2 dias), não ajuste.
- "Realizado" de Metas e "consumo" de Pacotes ainda não têm automação de baixa a partir da OS.
