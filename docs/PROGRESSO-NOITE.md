# 🌙 Progresso noturno autônomo — Laser&Co Power System

> Modo autônomo iniciado **2026-06-27 ~02:15**, a pedido do cliente ("faça tudo até eu acordar").
> Objetivo: transformar o máximo de telas **clone → funcional**, sobre dados reais do `lkii`, com a barra de qualidade (dados reais + ações + validação + RBAC + multitenant + estados vazio/erro), verificando e commitando cada onda.
> Fonte da verdade do que falta: [TODO-LEGADO-COMPLETO.md](TODO-LEGADO-COMPLETO.md) (1.086 features, 8% funcional no início da noite).

## Regras que sigo sozinho (sem acordar você)
- 🤫 **NÃO PERGUNTO NADA** — o cliente está dormindo. Toda dúvida vira um **default razoável documentado** aqui, e sigo em frente. Nada de bloquear esperando resposta.
- 🔍 **NÃO DEIXO PASSAR NADA** — cada feature do legado deixada pra depois fica marcada `// TODO(legado: buildX)` no código E listada neste log.
- ✅ **Posso**: escrever código, criar rotas/componentes/actions, rodar build/typecheck, validar queries contra o `lkii` (read), commitar em **branch local** (`feat/modulos-reais-noite`), atualizar este log.
- ⛔ **NÃO faço sozinho** (deixo documentado e sigo em frente): aplicar migration em produção, `git push`, deletar dados reais, decisões de regra de negócio do cliente (ex.: regras do **Saque**, quem paga WhatsApp), integrações que exigem credencial nova.
- 🔁 Cada onda: construir → **verificar** (tsc + next build + validar as queries com dado real) → **corrigir** → **commitar** → atualizar este log → próxima onda.
- Se uma feature depender de tabela inexistente (ex.: NFS-e) ou decisão sua, **pulo e registro** em "Bloqueios", e construo o que dá.

## Plano de ondas (adapto conforme aprendo)
- [ ] **Onda 1 (em construção):** Clientes (347k), Agenda (136k), Contas unidade (12.9k), Expansão (+migration 050).
- [ ] **Onda 2:** Catálogo (Serviços 148, Produtos, Pacotes, Planos, Grupos, Formas de pgto), Colaboradores (3), Metas.
- [ ] **Onda 3:** Perfis/RBAC editor (faz `cargo_permissoes` persistir — alto valor), Comissões (matriz+simulador), Origens/Motivos/Descontos/Categorias, Auditoria (`audit_log` real).
- [ ] **Onda 4:** Relatórios (faturamento/agendamentos/clientes sobre dados reais), Dashboards, Checklist PDCA (`planos_acao` já existe).
- [ ] **Onda 5:** Marketing, Disco, Universidade, Jurídico, Implantação, App Cliente, Anamnese, OS.
- Itens que precisam de você/infra ficam em **Bloqueios** (abaixo).

## Bloqueios / decisões pendentes (pra quando você acordar)
- **Migration 050 (Expansão):** gerada como `scripts/migrations/050_expansao_pipeline.sql` — **precisa ser aplicada no `lkii`** (eu não aplico em produção). Até lá, a Expansão mostra banner "aplique a migration".
- **Saque/Comissões pagas:** módulo Saque depende das suas regras (quem saca, gatilho, aprovação, meio de pagamento). Construo a base (matriz/apuração); o Saque em si fica pendente.
- **NFS-e / Notas Fiscais:** não há tabela `nfse*` no `lkii` → fica como clone até definirmos backend fiscal.

---

## Log de execução

### 02:15 — Onda 0 concluída (auditoria) ✅
Auditoria exaustiva das 1.086 features → `TODO-LEGADO-COMPLETO.md`. Placar inicial: 87 funcional / 61 parcial / 516 clone / 422 ausente.

### 02:15 → 02:35 — Onda 1 CONCLUÍDA e VERIFICADA ✅ (commit `aa55c18`)
4 telas clone→funcional sobre dado real. **`tsc --noEmit` 0 erros + `next build` EXIT 0.** Dado validado no lkii: 345.458 clientes ativos · 135.997 agendamentos · 12.944 receitas.
- **Clientes** (`/clientes` + `/clientes/[id]`): lista paginada server-side (347k) + busca nome/cpf/telefone + filtros + KPIs reais + ficha (Dados/Agendamentos/Carteira) + novo cliente (validação+dedup) + inativar soft. RBAC + multitenant.
- **Agenda** (`/agenda`): grade por profissional, criar/confirmar/cancelar com checagem de sobreposição. Corrigiu enum real `status_agendamento` (aberto/confirmado/em_atendimento/concluido/cancelado/no_show).
- **Contas** (`/contas`): Pagar/Receber da unidade sobre lancamentos_financeiros, KPIs, baixa, categorias plano_contas.
- **Expansão** (`/expansao`): CRM de franquia (crm_leads pipeline) + CrmBoard + **migration `scripts/migrations/050_expansao_pipeline.sql`** gerada (⚠️ NÃO aplicada — banner avisa).
- TODOs adiados (marcados `//TODO(legado)`): import CSV clientes, abas OS/Contratos/Acompanhamento da ficha, eventos da rede/recorrência na agenda, export/import das contas, conversas/disparos próprios e CRUD de tipos na Expansão.
- ⚠️ Estado da base: agendamentos sem cliente_id/profissional_id vinculados; lancamentos todos receita+pago (aba Pagar nasce vazia). Não é bug — é dado; empty-states cobrem.

### 02:35 → 03:30 — Onda 2 CONCLUÍDA e VERIFICADA ✅ (commit `aca1940`)
6 módulos. **`tsc` 0 erros + `next build` EXIT 0.** Total: **47 rotas funcionais**.
- **Serviços** (148 reais) + **Produtos** · **Pacotes** + **Planos** · **Colaboradores** · **Perfis/RBAC** (editor que persiste `cargo_permissoes`: 34 cargos, 1176 permissões — só admin_geral) · **Categorias** (plano_contas 26 reais) + **Descontos** + **Auditoria** (audit_log) · **Relatórios** reais (faturamento/financeiro 12.9k, agendamentos 136k, clientes 347k).
- 🔧 **Correção de reachability** (não deixar passar): o menu mantém caminhos do protótipo (`/cadastros/perfis`, `/cadastros/categorias-pagar`...) mas módulos foram construídos flat (`/perfis`, `/catpag`...). Criei **pontes** re-export em `/cadastros/{planos,perfis,categorias-pagar,categorias-receber,parcerias}` para o menu chegar à tela real. (Aprendizado aplicado às próximas ondas: construir no caminho do menu.)
- ⚠️ Dado: lancamentos só receita+pago (DRE = receita-only por ora); produtos/pacotes/planos/metas tabelas vazias (CRUD funciona, nascem sem dado).

### 03:30 — Onda 3 iniciada 🔧
Workflow `construir-modulos-onda3` (foco em tabelas com dado real): Unidades(82)+Minha Unidade+Minha Conta · OS (Ordens de Serviço) · Checklist-PDCA (planos_acao real) · Metas+Comissões(simulador) · Dashboards (financeiro/gerencial/funil sobre agregados reais).
