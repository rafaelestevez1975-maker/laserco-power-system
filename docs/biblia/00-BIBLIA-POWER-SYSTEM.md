# 📖 Bíblia do Laser&Co Power System

> Documento oficial de homologação — mapa completo do sistema, módulo por módulo, ancorado no **código real** (não em achismo). Gerado em 06/07/2026 por leitura automatizada e paralela de todo o repositório (`src/` + `scripts/` + `docs/`) com validação cruzada no banco de produção (Supabase `lkiihnxznphxqekrgsgi`).
>
> **Como usar:** este arquivo é a camada executiva. Os detalhes tela-a-tela estão nos 5 apêndices (`parte1`…`parte5`). Para a auditoria confrontada por outra IA (GPT), envie este arquivo + os 5 apêndices; cada funcionalidade traz evidência de código (arquivo:linha), estado real e esforço estimado — dá pra checar item por item.

---

## 0. Metodologia (por que confiar nestes números)

- Fonte de verdade da hierarquia: `src/lib/menu.ts` (o menu É a estrutura oficial de módulos/submódulos/funcionalidades, portado 1:1 do legado).
- Estado "funcional" não é opinião: cada tela foi classificada por **evidência** — a server action grava de verdade (`insert/update/delete` reais)? a fonte tem dado no banco? é mock/preview? O código carrega um `Set` chamado `ROTAS_FUNCIONAIS` que declara o que está funcional; conferimos linha a linha se é honesto.
- Convenções: **FUNCIONAL** = grava/lê de verdade, no ar. **PARCIAL** = a tela e as ações existem, mas falta dado, integração de 3º ou uma sub-feature. **FALTA/STUB** = é código a construir (a tela é casca/simulação).
- Separação essencial de prazo: **dev nosso** (o que depende só de programar) × **bloqueio de terceiro** (banco, prefeitura, time do site, credencial do cliente). Misturar os dois é o erro clássico que faz um cronograma mentir.

---

## 1. O mapa: 5 módulos, 7 submódulos, ~69 funcionalidades, 124 telas

| # | Módulo (seção do menu) | Submódulos (grupos) | Funcionalidades | Telas (rotas) |
|---|---|---|---|---|
| 1 | **Acompanhamento** | — | Dashboard, Agenda, Ordens de Serviço, PDV | 4 |
| 2 | **Cadastros** | Cadastros básicos (13) | + Clientes, Colaboradores, Contas da Unidade, Pacotes, Produtos, Serviços | ~21 |
| 3 | **Gestão** | Relatórios (24), Dashboards (7), RH (9) | + Automações, Disparos, CRM, Leads do Site, Canais, Indiques, Marketing, Comunicados, Chamados, Checklist, Universidade, Disco, Notas | ~57 |
| 4 | **Administração** | Expansão (7), SAC (11), Financeiro Franqueadora (9) | + Implantação, Jurídico, Auditoria | ~30 |
| 5 | **Rede & Conta** | — | Minha Unidade, Todas Unidades, Minha Conta, App do Cliente, Exportações | 5 |

Total real medido no filesystem: **124 rotas `page.tsx`** + **57 arquivos de server actions** (backend). A percepção do Julio (5 módulos / 36 submódulos / 69 funcionalidades) estava correta — apenas contando "submódulo" como cada grupo + cada tela de 2º nível.

---

## 2. Sumário executivo do estado

O **núcleo operacional e financeiro do dia a dia já roda em produção** com dados reais. O que falta divide-se em (a) sub-features acessórias, (b) integrações que dependem de terceiro, e (c) um módulo inteiro ainda não construído: a **visão do Franqueado**.

**Verde (no ar, funcional e com dado real):**
- Financeiro da Franqueadora: razão único `fin_lancamento` como fonte da verdade; DRE (mensal + anual + escopo combinável), Fluxo, Contas a Receber/Pagar, Conciliação (por planilha), Automação de Royalties (cálculo real a partir do faturamento BEMP). *Núcleo do sistema, sólido.*
- SAC em produção real: WhatsApp (Uazapi) recebendo/enviando, IA de 1º atendimento abrindo chamado sozinha, triagem, kanban, atendentes, ranking.
- Agenda (≈136–156k agendamentos importados do BEMP), Ordens de Serviço, Clientes (≈347k com CPF), catálogo (serviços/pacotes/produtos) — todos CRUD real.
- Cadastros básicos (13 telas): plano de contas, comissões, contratos, motivos, planos, perfis de acesso (RBAC persiste de verdade), origens, anamnese — todos gravando.
- CRM, Leads do Site, Expansão (funil de franquia), Implantação, Jurídico (lógica), Auditoria (leitura) — funcionais.

**Amarelo (pronto, falta dado/uso/sub-feature):** RH (folha/ponto/férias — motor pronto, sem dado operacional + falta login/salário), Metas da unidade (simulador não persiste), Produtos (sem movimentação de estoque), Parcerias (só cobre "desconto"), vários relatórios (estrutura pronta, fonte vazia).

**Vermelho (é código a construir):**
1. **Módulo Franqueado** — a visão do dono de franquia não existe (ver §4). *O maior item novo.*
2. **Motor de automações** — as 22 automações de `/automacoes` são catálogo liga/desliga **sem executor**; nenhum worker as dispara.
3. **Boleto bancário real** — hoje é linha digitável simulada (sem CNAB/Open Finance).
4. **NFS-e** — stub, sem provedor da prefeitura.
5. **E-mail** — não há envio real (só `mailto:` e placeholders).
6. **Google Drive** — stub (pastas hardcoded, sem API); o Disco Virtual próprio (Supabase Storage) é real.
7. **Régua de cobrança automática** — a config salva, mas o disparo por dias de atraso não roda sozinho.
8. **App do Cliente** — vitrine/mockup.
9. **Robô de documentos do BEMP** — bloqueado no login do app BEMP (infra pronta).

---

## 3. Camada de integrações transversais (auditada no código)

Existem **exatamente 2 route handlers** no sistema (`src/app/api`): `webhooks/uazapi` e `cron/ingest-sac`. Todo o resto é Server Action. Estado real de cada integração:

| # | Integração | Estado | Evidência-chave |
|---|---|---|---|
| 1 | **Site → SAC/Leads** | **REAL** (falta o site emitir `tipo='sac'`) | `src/lib/sac-ingest.ts` insere em `sac_tickets`; lê a tabela `lasercompany_leads` do Supabase do site (`riutcbwillvqjrpaefkb`) por **pull direto** (não webhook). Idempotente. Depende do env `SITE_SUPABASE_SERVICE_KEY` em prod. |
| 2 | **WhatsApp (Uazapi)** | **REAL** | `src/lib/uazapi.ts` — envio (`/send/text`, `/sender/simple`) e webhook de recebimento gravando `sac_whatsapp_chats/mensagens`. **Evolution NÃO existe** (zero no código). Erro 463 (restrição de número novo) tratado honestamente. |
| 3 | **API / Webhooks** | **REAL** | Só 2 rotas: `webhooks/uazapi` (entrada + IA + abre chamado) e `cron/ingest-sac` (protegido por `CRON_SECRET`). |
| 4 | **Cron / disparos programados** | **PARCIAL** | **Não há pg_cron/pg_net no banco** (zero no SQL). Único agendador real = **Vercel Cron** (`vercel.json`, 06:00 diário → ingest-sac). Campanhas agendadas: a fila é da **Uazapi** (externa), não nossa. |
| 5 | **E-mail** | **STUB** | Sem resend/nodemailer/smtp. `notificarCobranca` é "placeholder honesto"; UI diz "enviado por e-mail" mas nada sai do servidor. |
| 6 | **Banco / Conciliação / Boleto** | **PARCIAL** | Conciliação por **planilha** = real (cruzamento linha a linha, tolerância R$0,05). Boleto e baixa = **MOCK** (linha digitável fake, sem CNAB). O próprio sistema avisa na tela: "este módulo **simula** o ciclo". |
| 7 | **BEMP** | **PARCIAL** | Imports de clientes/OS/agenda/faturamento/colaboradores = **REAIS** (Postgres direto → Supabase). Robô de **documentos** = STUB (2 funções lançam erro; bloqueado no login do app BEMP). |
| 8 | **Storage** | **PARCIAL** | Disco Virtual (Supabase Storage, bucket `disco-virtual`) = **REAL** (upload/download/signed URL). Google Drive = **STUB** (pastas hardcoded, sem OAuth/API). |

**Royalties (o coração):** o **cálculo é real** (faturamento BEMP por unidade → `fin_lancamento` + `fin_recebiveis`, com royalty 10%, desconto <R$80k, loja própria não paga). O **gatilho é manual** (botão "Apurar", operador escolhe a competência). A **emissão do boleto e a notificação ao franqueado são stub**.

---

## 4. RBAC e a questão Franqueado × Franqueador (validado ao vivo)

**Modelo:** empresas → unidades; `perfis_usuario` (papel enum: `admin_geral, gestor, financeiro, crm, sac, operacoes, rh, tecnico, colaborador`) ⟷ `usuario_cargos` → `cargos` → `cargo_permissoes` → `permissoes` (recurso × ação × escopo). O menu filtra por `perm` de cada folha. `admin_geral` = bypass total (vê tudo). Escopo multitenant por `activeUnitId` (a unidade do perfil; `null` = vê todas).

**Achado crítico (testei criando um usuário franqueado real, cargo `admin_franqueado` amarrado a 1 franquia, e renderizei ao vivo):**

> O "franqueado" hoje **enxerga praticamente tudo que o franqueador enxerga** — 105 itens de menu, incluindo *Automação de Royalties*, *Contas a Receber da Franqueadora*, *Todas as unidades*, *Financeiro Franqueadora* inteiro, SAC, Expansão. O cargo existe, mas suas permissões liberam quase tudo, e **todas as telas foram desenhadas para o franqueador**.

**Conclusão:** a experiência do franqueado **não existe de fato** — é um módulo a construir, não um ajuste. O que falta:
- **RBAC escopado de verdade**: o cargo `admin_franqueado` precisa perder acesso a tudo que é da rede (royalties, financeiro da franqueadora, todas-as-unidades, expansão, SAC central) e ficar só com a operação da SUA loja.
- **Telas escopadas**: agenda, clientes, colaboradores, contas, relatórios — todas filtradas à unidade dele (a fundação `activeUnitId` já existe; falta forçá-la e esconder o resto).
- **DRE do franqueado**: hoje só existe o DRE do franqueador (onde a receita da franquia não aparece, só o royalty — decisão do Rafael). O franqueado quer o **faturamento cheio da loja dele**. São **dois DREs diferentes** tratados como um só — daí a sensação de "ora tira, ora põe franquia".
- **(decisão do Rafael)**: o franqueado terá **visual próprio** (outro layout) ou é o mesmo sistema com telas escopadas? Isso muda o tamanho do módulo.

---

## 5. Prazo consolidado (dev nosso × bloqueio de terceiro)

> Estimativas em **dias de dev** somadas dos apêndices. "Dev nosso" = só programar. "3º/cliente" = destrava rápido quando o insumo chega, mas o relógio é de fora.

### 5.1 Dev nosso (o que dá pra cravar cronograma)

| Bloco | Dias de dev | Observação |
|---|---|---|
| **Módulo Franqueado** (RBAC escopado + telas da loja + DRE da unidade) | **10–15** | mesmo sistema, telas escopadas. +5–8 se for visual próprio |
| **Motor de automações** (executor real das 22 regras) | 4–6 | hoje é catálogo inerte |
| **Régua de cobrança automática** | 3–4 | disparo por dias de atraso |
| **RH** (folha/ponto/férias — fiação + login + salário) | 5–8 | motor pronto, falta dado/Auth |
| **Sub-features de cadastro** (metas-unidade, estoque, parcerias, produtos/serviços paridade) | 6–9 | acessórias |
| **Expansão** (webhook do site, status de disparo, criar-projeto implantação) | ~10 | grande parte já funcional |
| **Jurídico** (e-mail/storage/assinatura reais) | 5–8 | lógica pronta |
| **App do Cliente** (app operacional real) | 15–25 | o maior item isolado |
| **Ajustes/relatórios/migrations pendentes** | 5–8 | aplicar migrations no prod, reconciliar RBAC |

**Subtotal dev nosso: ~65–90 dias de dev.** Sem o App do Cliente (que é praticamente um produto à parte): **~50–65 dias**.

### 5.2 Bloqueios de terceiro (prazo não é nosso)

| Item | Depende de | Dev quando destravar |
|---|---|---|
| Boleto real (CNAB/Open Finance) | convênio + credenciais do **banco** | 5–8 dias |
| NFS-e | provedor fiscal da **prefeitura** | 5–8 dias |
| E-mail | contratar Resend/SMTP (decisão do cliente) | 2–3 dias |
| Google Drive real | OAuth Google (decisão) | 3–4 dias |
| Robô de docs BEMP | **Lucas** definir senha do app BEMP | 2 dias |
| Leads/SAC do site 100% | **time do site** publicar `tipo='sac'` + env em prod | ~1 dia |

### 5.3 Leitura de calendário

O operacional + financeiro do dia a dia **já está no ar**. Para "100% de verdade" com as integrações reais, a faixa honesta é **~6 a 10 semanas de dev** (sem o App do Cliente; com ele, some ~3–5 semanas). Boleto e NFS-e não entram nesse relógio — são de banco/prefeitura, e programamos rápido assim que o convênio existir.

---

## 6. Índice dos apêndices detalhados (tela a tela)

- **`parte1-acompanhamento-cadastros.md`** — Dashboard, Agenda, OS + os 13 Cadastros básicos + Clientes/Colaboradores/Contas/Pacotes/Produtos/Serviços.
- **`parte2-relatorios-dashboards.md`** — os 24 Relatórios + os 7 Dashboards.
- **`parte3-gestao-operacao-rh.md`** — Automações, Disparos, CRM, Leads, Canais, Indiques, RH (9), Marketing, Comunicados, Chamados, Checklist, Universidade, Disco, Notas.
- **`parte4-administracao.md`** — Expansão (7), Implantação, SAC (11), Financeiro Franqueadora (9), Jurídico, Auditoria.
- **`parte5-rede-integracoes-rbac.md`** — Rede & Conta (5) + a camada de integrações completa + o modelo RBAC e o gap Franqueado × Franqueador.

Cada apêndice traz, por funcionalidade: rota, RBAC (quem vê), o que faz, telas/modais, tabelas e server actions, integrações, estado real com evidência (arquivo:linha) e esforço para 100%.
