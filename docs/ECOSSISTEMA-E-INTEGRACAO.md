# Ecossistema Laser&Co  Projetos, Supabases e Integração

> Mapa dos projetos irmãos em `/home/jvneto/ProjetosLMK/Laser/`, dos **dois** Supabases em jogo, do **modelo multitenant/RBAC que já existe** e do **fluxo de leads do site**. Base para decidir a estrutura do Power System e a reutilização de backend. Complementa [MAPEAMENTO.md](MAPEAMENTO.md), [ARQUITETURA-NEXT.md](ARQUITETURA-NEXT.md), [BACKLOG.md](BACKLOG.md) e [REQUISITOS-CLIENTE.md](REQUISITOS-CLIENTE.md).
>
> **Conclusão central:** o "backend de outro projeto que vamos reaproveitar" é o Supabase **`lkiihnxznphxqekrgsgi`** (compartilhado por **RH** e **SAC**). Ele **já tem** multitenant + RBAC granular + CRM + SAC + Financeiro + WhatsApp + Indiques + Plano de Ação IA. Então **migrar o Power System ≈ construir o front Next.js (layout roxo aprovado) sobre esse backend existente**, reaproveitando o app **SAC** como template de arquitetura, e **fazer a ponte dos leads do site**.

---

## 1. Projetos irmãos em `/home/jvneto/ProjetosLMK/Laser/`

| Projeto | O que é | Stack | Supabase |
|---|---|---|---|
| `laserco-power-system` | **Protótipo do Power System** (este repo)  layout aprovado | HTML single‑file | `riutcbwillvqjrpaefkb` |
| `lasercompany-site` | **Site institucional** (lasercompany.com) + painel admin | HTML + JS vanilla | `riutcbwillvqjrpaefkb` |
| `SAC` (`gestao-sac`) | **App de SAC**  interface rejeitada, **funcionamento aproveitável** | **Next.js 15 + TS + Supabase + Tailwind + UAZAPI** | `lkiihnxznphxqekrgsgi` |
| `RH` | **App de RH** (origem do `portal-rh.html`)  **dono do schema base** | Next.js + Supabase | `lkiihnxznphxqekrgsgi` |
| `crm-maquinas-de-rede` | **CRM de venda de equipamentos** (o "mesmo CRM" citado em Expansão) | a confirmar | a confirmar |
| `rescisoes-laser` | **Rescisões** (cancelamentos/jurídico) | a confirmar | a confirmar |

> O cliente disse que o **SAC** teve a interface rejeitada mas o **funcionamento serve** → reaproveitar backend e padrões. O `RH` **compartilha o mesmo Supabase** e detém as migrations 001–038 que formam o schema base.

---

## 2. Os dois Supabases

### A) `riutcbwillvqjrpaefkb`  protótipo + site institucional
- Usado pelo **protótipo** (`app_state` blob, `profiles`, `sales_entries`, `customers`, `units_db`, `goals`, `invites`).
- Usado pelo **site** (`lasercompany_leads`, `lasercompany_events`, `lasercompany_roles`, `lasercompany_config`).
- Anon key pública `sb_publishable_8FW_…` (a mesma no protótipo e no site).

### B) `lkiihnxznphxqekrgsgi`  RH + SAC (o backend a reaproveitar) ⭐
- **Schema maduro e abrangente** (migrations 001–051). Destaques:
  - **009 multi‑tenancy + RBAC granular + audit log**, **010 seed RBAC**.
  - **011 financeiro**, **012/013 SAC + Gmail**, **014 bemp_sync**, **015 crm_leads**, **016 equipamentos/processos**, **017 LGPD avançado**, **019 whatsapp_uazapi**, **020 indiques_kpis**, **021 plano_acao_ia**, **022/023 clone BEMP catálogo/operações**, **024/025 SULTS sync/expansão**, **026 campanhas_whatsapp**, **028 cargos_por_setor**, **030–051 refinos de SAC/RLS/clientes**.
- **Service role key + UAZAPI** ficam em `.env.local` (fora do git).

> ⚠️ O token `sbp_…` compartilhado no chat é de **gerência da conta**  revogar/rotacionar e usar via env var (ver memória `reference-laserco-supabase-token`).

---

## 3. Modelo Multitenant + RBAC que JÁ EXISTE (`lkiihnxznphxqekrgsgi`, migration 009/010)

> É **exatamente** o que o cliente pediu ("controle de permissão e cargo muito bem feito, todo botão com permissão especial", "usuário que é RH da franquia tal e da franquia tal"). Adotar como está.

- **`empresas`** (matriz/corp) → **`unidades`** (franquias) com `empresa_id`. Uma empresa default já semeada (Laser Company Brasil).
- **Escopo de permissão** (`escopo_permissao` ENUM): `global` (super_admin) · `empresa` (admin franqueado/setor) · `unidade` (a unidade do usuário) · `proprio` (só os próprios dados). → resolve "RH de várias franquias", "franqueadora vê tudo, franqueado vê a sua".
- **Permissão atômica** = `recurso` (`modulo.entidade`, ex.: `financeiro.caixa`, `sac.ticket`) × `acao` (`ler/criar/editar/deletar/aprovar/exportar/admin`) × `escopo`. 80+ permissões seedadas. → é o **gate por botão**.
- **`cargos`** (sistema + custom por empresa; `is_sistema` não deletável) + **`cargo_permissoes`** (n:m). Cargos: `super_admin`, `admin_franqueado`, `gerente`, `rh`, `financeiro`, `sac`, `atendente`, etc.
- **`perfis_usuario`** mantém `papel` legado + camada RBAC paralela + **audit log** (LGPD).

**Mapeamento com o protótipo:** os 9 perfis do `ROLE_ALLOW` e a matriz `PERMS` (~52 módulos) do Power System mapeiam para `cargos` + `recursos×acoes×escopo`. O editor de Perfis do protótipo passa a editar `cargo_permissoes` de verdade (hoje só dá toast).

---

## 4. CRM existente (`crm_leads`, migration 015)

Tabelas: `crm_etapas` (funil, por empresa, cor/ordem), `crm_etiquetas`, **`crm_leads`**, `crm_lead_etiquetas`, `crm_atividades`.

`crm_leads` já tem: `empresa_id`, `unidade_id`, `etapa_id`, `responsavel_id`, `nome`, `email`, `telefone`, `origem`, `servico_interesse`, `valor_estimado`, `observacoes`, **`ia_qualificado`, `ia_score`, `ia_resumo`** (qualificação por IA já modelada!), `status`. → cobre o CRM Kanban e o "esquentar lead com IA" pedido em Expansão.

---

## 5. Fluxo de leads do site (a integração P0 🚨)

O site grava **direto** no Supabase `riutcbwillvqjrpaefkb`, tabela **`lasercompany_leads`**, via `cloudInsert(tipo, dados, unidade)`:

```
lasercompany_leads: { tipo, nome, telefone, email, unidade, unidade_email, dados(jsonb), created_at }
```

**6 tipos** (um por formulário do site):
| `tipo` | Formulário no site | Destino no Power System |
|---|---|---|
| `oferta` | Lead/oferta (`lead-form`) | CRM (`crm_leads`) da unidade |
| `avaliacao` | Avaliação (`aval-form`) | CRM / agenda da unidade |
| `agendamento` | **Agendar sessão** (`agendar-form`: nome, cpf, telefone, unidade) | Agenda/SAC da unidade |
| `franquia` | **Seja Franqueado** (`franq-form`) | **Expansão** (funil de franquia) |
| `curriculo` | Trabalhe Conosco | **RH** (recrutamento) |
| `indicacao` | **Indicação** (`ind-form`: nome, cpf, unidade) | **Gestão de Indiques** + CRM |

Outras tabelas do site: `lasercompany_events` (analytics), `lasercompany_roles` (admin/viewer do painel do site), `lasercompany_config` (config do site). O **painel administrativo do site** (onde "entrou muita gente") está no próprio site (`app.js`/`procdata.js`), protegido por sessão Supabase + papel.

### Plano de integração (2 opções)
- **Opção A  Ponte/sync (recomendada para começar JÁ):** uma rotina no Power System (Edge Function/cron ou Realtime) lê `lasercompany_leads` de `riutcbwillvqjrpaefkb`, **deduplica**, **roteia por `unidade`/`unidade_email` → `unidade_id`** e cria `crm_leads`/registros de Expansão/Indiques/RH em `lkiihnxznphxqekrgsgi`. Não exige mexer no site agora.
- **Opção B  Webhook direto:** alterar os `submitX()` do site para também `POST` num endpoint do Power System (`/api/webhooks/leads-site`). Mais limpo a médio prazo; exige deploy do site.

> Como o site **já está recebendo gente agora**, a Opção A entrega valor sem bloquear no deploy do site. Definir o **roteamento por unidade** (o site manda `unidade` como texto/e‑mail; precisamos casar com `unidades.id`).

---

## 6. Estratégia recomendada (para alinhar com o cliente)

1. **Backend único = `lkiihnxznphxqekrgsgi`** (RH+SAC). O Power System passa a ser o **front unificado** (layout roxo aprovado do protótipo) sobre esse backend, que já tem RBAC/multitenant/CRM/SAC/Financeiro/WhatsApp/Indiques/Plano‑de‑Ação‑IA.
2. **Template de arquitetura = app `SAC`** (Next.js 15 + `@supabase/ssr` + Server Actions + RLS + UAZAPI + Tailwind paleta `laser-600/700`). Reaproveitar `src/lib/supabase/*`, padrões de Server Actions, RBAC e o webhook UAZAPI.
3. **SAC entra "dentro"** do Power System reusando suas tabelas `sac_*` e componentes (kanban, tickets, premiação, importar, whatsapp)  só re‑vestido no layout do Power System.
4. **Bridge dos leads do site** (Opção A) como primeira entrega de valor (P0, urgente).
5. **Expansão** consome `crm_leads` (origem `franquia`/site) + disparos UAZAPI ininterruptos + qualificação IA (`ia_*`).
6. Consolidar dados do protótipo (`riutcbwillvqjrpaefkb`) que não existam no backend novo (ex.: `sales_entries`, catálogos) via migração.

---

## 7. Pendências / decisões a confirmar
- [ ] Confirmar que **`lkiihnxznphxqekrgsgi`** é o backend oficial do Power System (e o destino do reaproveitamento do SAC).
- [ ] **Acesso ao painel admin do site** + casamento `unidade` (texto/e‑mail) → `unidades.id` para roteamento.
- [ ] Revogar/rotacionar o token `sbp_` e configurar env vars.
- [ ] Esclarecer papéis de `crm-maquinas-de-rede` e `rescisoes-laser` (reusar? integrar? CRM de equipamentos será separado da Expansão de franquia no futuro).
- [ ] Decidir: SAC/RH **embarcados** (curto prazo) vs **re‑vestidos nativamente** no layout do Power System (médio prazo).
