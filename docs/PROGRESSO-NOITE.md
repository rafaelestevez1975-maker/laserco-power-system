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

### 02:15 — Onda 1 iniciada 🔧
Workflow `construir-modulos-reais` rodando: Clientes, Agenda, Contas, Expansão. (atualizo aqui quando verificar.)
