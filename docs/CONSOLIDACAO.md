# Consolidação do Sistema — Padrões Compartilhados, Duplicação e Regras (DRY)

> **Para que serve:** este é o mapa de **reuso** do Power System. Antes de construir qualquer tela,
> consulte aqui o que **já existe** para reaproveitar e o que está **duplicado** para não copiar de novo.
> Complementa: [FRONTEND-STATUS.md](FRONTEND-STATUS.md) (status por tela) · [BACKLOG.md](BACKLOG.md) (épicos) ·
> [MAPEAMENTO.md](MAPEAMENTO.md) (inventário do legado) · [ARQUITETURA-NEXT.md](ARQUITETURA-NEXT.md) (como).
>
> Atualizado: 2026-06-24.

## Regras de consolidação (valem para todo desenvolvimento)
1. **Tela completa, sempre.** Dados reais + ações que persistem + validação por campo + estado de erro/vazio + RBAC + escopo de unidade. Sem botão decorativo.
2. **DRY.** Se uma lógica aparece em ≥2 telas, ela vira helper/componente compartilhado e é usada em **todas**.
3. **Mudou um padrão? Muda em todo lugar.** Antes de alterar, `grep` por todas as ocorrências e aplique junto. Proibido deixar versões divergentes.
4. **Dependência → cadeia inteira.** Se a feature depende de X (ex.: disparo depende de canal conectado), construa X também. Nada pela metade.
5. **Mantenha este mapa.** Ao criar um helper compartilhado, registre aqui. Ao concluir uma tela, atualize FRONTEND-STATUS.

---

## 1. As 3 camadas de tela (≈105 itens de menu / 101 com clone)
| Camada | O que é | Qtd aprox. |
|---|---|---|
| 🔌 **Funcional** | Rota nativa com dados/ações reais (badge `NOVO` no menu) | **~13** |
| 🖼️ **Clone visual** | HTML do protótipo servido via catch-all `[...slug]` + `src/snapshots/views.json` — navegável, sem dados | **~88** |
| 🚧 **Placeholder** | Sem snapshot → `<Placeholder/>` "em construção" | resto |

Funcionais hoje: `/crm`, `/leads-site`, `/canais`, `/indiques`, `/comunicados`, `/chamados`, `/expansao/disparos`, `/sac`, `/sac/chamados`, `/sac/kanban`, `/sac/triagem`, `/financeiro`, `/rh/recrutamento` (+ webhook `/api/webhooks/uazapi`). Detalhe e "o que falta" por seção em [FRONTEND-STATUS.md](FRONTEND-STATUS.md).

---

## 2. Padrões compartilhados que JÁ existem (reaproveitar — não recriar)
| Helper / módulo | Onde | O que faz |
|---|---|---|
| `getSessionContext()` | `src/lib/session.ts` | usuário + papel + `isAdmin` + `recursos` (RBAC) + `unidades` + `activeUnitId/Name`. **Use sempre** para escopo/permite. |
| `createClient()` (server, RLS) | `src/lib/supabase/server.ts` | client server com sessão do usuário (respeita RLS). |
| `createClient()` (browser) | `src/lib/supabase/client.ts` | client do navegador. |
| `adminClient()` (service-role) | `src/lib/supabase/admin.ts` | **bypassa RLS** — só server, só quando necessário (ex.: resolver RBAC). |
| `siteClient` | `src/lib/supabase/site.ts` | backend do site (`riut`) — fonte dos leads. |
| `MENU` / `titleFor()` | `src/lib/menu.ts` | fonte da verdade da navegação + título da topbar. |
| UAZAPI | `src/lib/uazapi.ts` | `normTel`, `sendText`, `sendMedia`, `connect/status/disconnect`, `configurarWebhook`, `criarCampanhaSimples`. |
| IA do SAC | `src/lib/ia.ts` | `iaConfigurada()`, `gerarRespostaSAC()`, `formatarParaWhatsApp()` (OpenRouter). |
| `matchUnidade()` | `src/lib/unidade-match.ts` | rótulo do site → `unidades.id`. |
| Snapshots | `src/lib/snapshots.ts` | clone visual das telas legadas. |

---

## 3. Duplicação atual (CONSOLIDAR) — evidência por arquivo:linha
| # | Padrão duplicado | Onde se repete | Centralizar em |
|---|---|---|---|
| D1 | **Tradução de erro RLS** (`/row-level\|policy\|permission/ → "Sem permissão…"`) — copiado verbatim e com textos divergentes | `comunicados/actions.ts:19`, `canais/actions.ts:11`, `rh/recrutamento/actions.ts:13` (idênticos); inline divergente em `financeiro/actions.ts:29`, `leads-site/actions.ts:72,80` | **`src/lib/sb.ts`** → `msgErro(error, oQue)` |
| D2 | **Boilerplate `sb.auth.getUser()`** + checar null, refeito à mão | ~20 ocorrências: `chamados/actions.ts:22,69,112`, `crm/actions.ts:21,60`, `comunicados/actions.ts:25,72,90,114`, `indiques`, `leads-site`, `rh/recrutamento`, `financeiro/actions.ts:11`… (só `canais` e `disparos` usam `getSessionContext`) | **`src/lib/sb.ts`** → `requireOperador()` (retorna `{user, perfil, papel, ctx}` ou erro) |
| D3 | **Formatação BR (moeda `R$` / data `pt-BR`)** inline | 13 arquivos: `crm/page`, `financeiro/page`, `sac/page`, `ChamadosManager`, `NotificacoesSino`, `CienteModal`, `CrmBoard`, `ComunicadosManager`, `FinContasPagar`, `RecrutamentoManager`, `SiteLeadsInbox`, `SacKanban`, `TriagemWhatsapp` | **`src/lib/fmt.ts`** → `moedaBR()`, `dataBR()`, `dataHoraBR()`, `relativo()` |
| D4 | **Normalizar telefone + `wa.me`** (`replace(/\D/g,'')` + prefixo 55) | `CrmBoard.tsx:19`, `RecrutamentoManager.tsx:29`, `DisparoComposer.tsx:22`, `disparos/actions.ts:15`, `sac/triagem/actions.ts:140-141`, `webhook/route.ts:62` (apesar de `normTel` existir em `uazapi.ts:88`) | reusar `normTel` + novo `waHref()` em **`src/lib/fmt.ts`** |
| D5 | **Filtro por unidade** (`.eq('unidade_id', ctx.activeUnitId)`) aplicado em alguns lugares e esquecido em outros | SAC/Financeiro/Chamados/Recrutamento aplicam; revisar todos os `.select()` de telas com escopo | helper `scopeUnidade(query, ctx)` em **`src/lib/sb.ts`** |
| D6 | **Kanban @dnd-kit** (DndContext + useDraggable/useDroppable + PointerSensor distance 6) | `CrmBoard.tsx`, `SacKanban.tsx`, `RecrutamentoManager.tsx` | **`src/components/ui/KanbanBoard.tsx`** genérico |
| D7 | **Scaffold "Manager"** (abas + filtros + lista/tabela + toast) | `ChamadosManager`, `ComunicadosManager`, `IndiquesManager`, `RecrutamentoManager`, `CanaisManager`, `SiteLeadsInbox` | extrair primitivos `ui/Tabs`, `ui/Filtros`, `ui/DataTable` |
| D8 | **Type `ActionResult`** (`{ ok; error? }`) redefinido em cada actions.ts (alguns sem type) | crm:6, canais:8, comunicados:17, chamados:14, rh:6, indiques, sac/financeiro (sem type) | **`src/lib/types.ts`** → `export type ActionResult<T={}> = {ok:boolean;error?:string} & T` |
| D9 | **Modal de formulário** (`onClose/onSaved/busy/err`) reimplementado | `CrmBoard:129`, `CanaisManager:112`, `IndiquesManager:56`, `ComunicadosManager:224`, `NovoChamado:243`, `RecrutamentoManager:252` | **`src/components/ui/Modal.tsx`** + hook `useModalForm` |
| D10 | **Grid de KPIs** (`<KpiBox label value icon>`) | `crm/page:44`, `indiques/page:30`, `financeiro/page:32`, `sac/page:36`, `RecrutamentoManager:32`, `ComunicadosManager:52` | **`src/components/ui/KpiGrid.tsx`** |

---

## 4. Infra padrão que faltou construir (dívida do EPIC 0.4/0.5)
- ❌ **Componente de formulário padrão** (`<Field label error>` + validação por campo). **Não existe** `react-hook-form`/`zod`/`<Field>` no projeto — toda validação é ad-hoc. → criar **`src/lib/forms`** (`<Field>`, resolvers Zod, helpers `cpf/cnpj/cep/moedaBR`). É requisito do cliente ("validação por campo, erro abaixo do input").
- ❌ **Wrapper de chamada Supabase** (`sb()`/`requireOperador()`/`msgErro()`) — ver D1/D2.
- ❌ **`src/lib/fmt.ts`** (moeda/data/telefone BR) — ver D3/D4.
- ❌ **`src/lib/rbac.ts`** — checagem de papel (`isAdmin`, `podeSac`, `podeGestor`) hoje é string solta espalhada.
- ❌ **`src/lib/types.ts`** (`ActionResult`) e **`src/lib/messages.ts`** (constantes de erro/validação) — ver D8 e §3b.

## 3b. Inconsistências (mesma coisa, jeitos diferentes — padronizar)
| # | Inconsistência | Evidência | Regra a fixar |
|---|---|---|---|
| I1 | **Validação de papel** diverge: comunicados valida `admin_geral` no action; chamados/financeiro não validam (confiam só na RLS); triagem valida `['admin_geral','sac','gestor']` p/ PII | `comunicados/actions.ts:34`, `chamados/actions.ts:28-64` (sem), `sac/triagem/actions.ts:139` | toda ação sensível chama `requireRole()` de `rbac.ts`; RLS é a 2ª linha, não a única |
| I2 | **`adminClient` (bypassa RLS)** usado em alguns reads agregados e não em outros | `comunicados/page.tsx:16,22`, `sac/triagem/actions.ts:143` usam; RH/financeiro não | regra: `adminClient` só p/ **read agregado/PII** server-side; **nunca p/ write**. Documentar no topo do arquivo |
| I3 | **Mensagens de erro/validação** sem padrão de tom | "Somente administradores…", "Informe o assunto…", "Escreva a mensagem." | constantes em `messages.ts` |
| I4 | **`revalidatePath`** com cobertura irregular | `financeiro/actions.ts:38` revalida 4 rotas (inclui `/sac`); `crm/actions.ts:53` só `/crm` | regra: revalidar a rota própria + rotas com efeito colateral visível (e comentar o porquê) |
| I5 | **Embeds Supabase** tratados de formas diferentes (helper `one<T>()` no RH, nada em outros) | `rh/recrutamento/page.tsx:18-28` vs CRM/SAC sem embed | helper `one<T>()`/`many<T>()` compartilhado em `sb.ts` |

---

## 5. Backlog de consolidação (ordem sugerida — fazer ANTES de novas telas)
1. **`src/lib/fmt.ts`** (D3/D4) — baixo risco, alto alcance. Trocar os 13 arquivos.
2. **`src/lib/sb.ts`** com `requireOperador()` + `msgErro()` + `scopeUnidade()` (D1/D2/D5). Migrar os actions.ts.
3. **`src/lib/forms`** (`<Field>` + Zod) — destrava "validação por campo" em todas as telas novas.
4. **`src/components/ui/KanbanBoard.tsx`** (D6) — unifica os 3 kanbans.
5. **Primitivos `ui/`** (Tabs/Filtros/DataTable) (D7) — conforme reescrevemos os Managers.

> Cada item acima é "mudar em todas as ocorrências de uma vez" (Regra 3). Depois disso, toda tela nova nasce DRY.

---

## 6. Gaps de completude por tela funcional (auditoria 2026-06-24)
> Auditoria de código + verificação manual. ⚠️ Vários "gaps" apontados pela varredura
> automática eram **falsos positivos** (a varredura lê trechos): registrados como ✅ já-ok.

### ✅ Já corretos (eram falsos positivos da auditoria)
- **Canais** — o `setInterval` do QR **já é limpo** no unmount/connect/close (`CanaisManager:28`).
- **SAC Kanban** — **já tem contador por fase** (`SacKanban:64`) e move otimista + refresh.
- **Leads-site** — roteamento **já tem dedup** (`jaRoteado`) e é resumível; o roteamento em massa **reporta** ok/pulados.
- **SAC Triagem** — painel do cliente (auto-import) e sino de notificações **existem** (a varredura não os viu).

### ✅ Corrigidos nesta rodada
- **Canais** — validação de campo do delay (mín ≥1s, máx ≥ mín) antes de salvar.
- **Indiques** — regra 3–5 indicados aplicada no server **e** no client (feedback por campo).
- **CRM** — "Personalizar funil" agora funcional (criar/renomear/remover etapa; admin-only; protege etapas de sistema e com leads). Antes era botão morto.
- **Leads-site** — mensagem de resultado do roteamento em massa mais honesta.

### ⏳ Pendentes — são **expansões de feature** (não bugs), precisam de decisão/escopo
| Tela | Falta | Tamanho | Observação |
|---|---|---|---|
| Disparos | agendamento, templates salvos, personalização `{nome}` (`/sender/advanced`) | M | depende de canal conectado p/ teste real |
| Comunicados | **publicar agendados** automaticamente | M | precisa **scheduler** (pg_cron no lkii **ou** Vercel Cron) — decisão de infra |
| Comunicados | preview antes de publicar; arquivar (soft-delete) | S | — |
| Financeiro | **Contas a Receber** (hoje só Contas a Pagar) | L | novo módulo de dados + KPIs |
| RH Recrutamento | WhatsApp de disponibilidade; score de triagem estruturado | M | envio depende de canal conectado |
| SAC Chamados | filtro por atendente; busca avançada; paginação (limit 60) | S | — |
| Chamados | classificação de caixa por flag (hoje regex em `de_parte`, funciona p/ valores controlados) | S | robustez, baixa prioridade |
| RBAC | `crm_etapas` tem RLS `authenticated/ALL` (qualquer logado escreve) — gate é só no app | S | endurecer via migration se necessário |

> **Próximo passo recomendado:** priorizar entre Disparos (M), Comunicados-scheduler (M, infra) e Financeiro-Receber (L) — o cliente decide a ordem.
