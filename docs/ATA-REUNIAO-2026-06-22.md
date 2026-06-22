# Ata — Reunião de Alinhamento (Site + Power System)

> **Data:** 2026-06-22 (~135 min) · **Fonte:** `docs/transcricao_reunia.txt`
> **Cliente:** Rafa (Rafael Estevez, CEO) · Will (William) · atendentes do SAC (Cris, Ellen, Paula)
> **Agência/Dev:** Matheus · Júlio
> **Contexto:** mapear requisitos antes de construir o backend. Dois produtos: o **site
> institucional** (lasercompany.com — já no ar, DNS apontado) e o **Power System**
> (migração BEMP+SULTS → sistema único; é o que estamos construindo em Next.js).

Convenções: **D** = decisão · **A** = ação · **⚠️** = risco/bloqueio · **❓** = em aberto.

---

## 1. SITE institucional

- **D1.1** Indicação premiada: corrigida (botão de enviar agora aparece). OK.
- **D1.2** Banner / pop-up / procedimento / avaliação **não** redirecionam direto pro WhatsApp.
  Abrem um **cadastro** (nome, CPF/contato, **seleção de unidade por LISTA**) e enviam a oferta.
  - **Seleção por LISTA de unidades, NÃO por CEP/geolocalização** — o cliente quer escolher a
    unidade específica (pode haver 4 num raio de 1 km e ele querer a do shopping, não a mais perto).
  - No painel admin, deve ser possível **escolher quais unidades participam de cada campanha**
    (incluir/excluir — ex.: franqueado que não quer dar sessão cortesia fica de fora).
- **D1.3** **Destino dos leads do site = cair no Power System** (CRM / "Canal de Atendimento
  Comercial"), roteado para a unidade certa e distribuído por regras. Não depender de
  e-mail/WhatsApp manual. **Provisório** (enquanto não há backend): manter botão de WhatsApp.
- **D1.4** **Currículos** (Trabalhe Conosco) → RH › Recrutamento › **"Buscar Talentos"**. Importar
  o acervo atual do SULTS. (Ver §6.)
- **D1.5** **Painel admin do site reformulado** + **site 100% editável** (páginas, banners, textos)
  com login/senha, estilo Wix; mensurar acessos/volume. Por ora, alterações passam pelo Rafa.
- **D1.6** Site **no ar** (DNS apontado; site antigo desativado). **Congelar alterações** quando o
  build do backend começar (mudança quebra a construção).
- **A1.1** Rafa envia a **relação de e-mails/WhatsApp de todas as unidades** para o Matheus.
- ⚠️ Evitar disparo pelo **WhatsApp principal** das lojas (risco de banimento do número).

## 2. Atendimento (SAC) — distribuição

- **D2.1** Todos os canais (botão SAC do site, WhatsApp, Reclame Aqui, Procon, Google, Instagram,
  Facebook, e-mail) **funilam num único CRM de atendimento** e são distribuídos.
- **D2.2** **Distribuição igualitária entre atendentes LOGADAS no período** — quem está de folga /
  não logado **não recebe**. 1 logada → tudo pra ela; 2 → divide; 3 → divide por 3.
- **D2.3** **Transferência de chamado entre as próprias consultoras: LIBERADA** (decisão do Rafa;
  a recomendação técnica era restringir a supervisor/coordenador — registrar que foi liberado).
- Volume citado: Procon ~120 casos/6 meses (~20/mês) — baixo.

## 3. Power System — arquitetura / unificação

- **D3.1** Unificar **BEMP** (gestão da loja) + **SULTS** (franqueadora, ~25 sub-apps) + **RH** +
  **SAC** + **Financeiro (loja e franqueadora)** num sistema único, com os **dados do cliente
  compartilhados** (ficha → dados, sessões, agendamentos, OS, contratos, carteira).
- **D3.2** **Multitenant** (confirma o já registrado): franqueado vê a(s) sua(s) loja(s);
  super admin (Rafa) vê tudo. Sistema acessado diariamente.
- **D3.3** **Financeiro da Franqueadora** aproveita o cadastro da unidade (vira "cliente" do
  financeiro) e as vendas (lança royalties sozinho no dia previsto; se sem baixa, emite
  notificação/e-mail). Evita recadastrar/relançar manualmente como hoje.

## 4. Migração de dados do BEMP ⭐ (crítico)

- **D4.1** Migração por **API direta do BEMP** (não por planilha) — integração já feita antes.
  Chave por **CPF**. Dono do BEMP = **Diego** (amigo do Rafa, desde a Botoclinic).
- **D4.2** **Dados do cliente: ~100% disponíveis** via API (id, unidade, nome, ativo, e-mail,
  aniversário, verificado, gênero, origem, telefone DDI+nº, tipo de documento, documento,
  endereço, data de criação).
- ⚠️ **D4.3 — BLOQUEIO: a API do BEMP NÃO expõe arquivos/documentos** — **fotos de procedimento,
  termos de consentimento e contratos** não saem pela API (o BEMP é só banco de dados, sem camada
  de arquivos). É a maior dor da migração.
- **D4.4** **Regra de import multitenant (anti-roubo de cliente):** o cliente pertence à **loja que
  o cadastrou**; se **outra loja inserir o mesmo CPF**, ele passa a ser **compartilhado** entre as
  duas. (Sem isso, 300k+ clientes "sem dono" → conflito entre lojas.)
- **A4.1** Júlio: **contatar o BEMP/Diego** para entender como exportar os arquivos (ex.: zip) e
  **registrar tudo num documento de requisitos**. (Rafa pode ligar pro Diego se preciso.)

## 5. WhatsApp · Automações · módulo "Canais" ⭐ (tema central)

- **D5.1** **E-mail por unidade é inviável** tecnicamente (cada Gmail exige gerar chave Google
  manualmente). **Decisão: usar WhatsApp para tudo.**
- **D5.2** **Criar um MÓDULO "CANAIS":** cada unidade **conecta o próprio WhatsApp (via QR Code)**
  e define **quais automações** saem por aquele número; se cair, **reconecta via QR Code**.
  → **1 número por unidade** (distribui volume, custo e risco de banimento).
  *(Implementação: a UAZAPI já decidida atende exatamente isso — 1 instância/número por unidade.)*
- **D5.3** **Cadeia de DELAY por unidade**, configurável (anti-ban; ex.: 1 msg/hora). Começar no
  **free (QR Code)** com segurança/delay; se não escalar, reavaliar **API oficial paga** e quem paga.
  Custo da API oficial citado: ~R$0,25/msg enviada e ~R$1,00/msg recebida.
- **D5.4** **Automações padrão** (boas-vindas; **confirmação em 3 etapas** com lembretes 2 dias / 1
  dia / 2h antes; **reagendamento de faltas** ~40%; pós-venda) **+ automações por unidade**
  (recompra por serviço, campanhas próprias). Confirmação na agenda muda a cor (azul=agendado →
  roxo=confirmado) automaticamente. Volume estimado: **~3.000 msgs/dia só de confirmação +
  reagendamento** (por isso não pode ser número único).
- **D5.5** **Disparo de campanha** (ex.: lançamento do peptídeo de cobre numa base de ~7k) é
  **módulo/assunto separado** das automações padrão.
- ⚠️ Risco assumido pelo time: QR Code pode cair sem motivo; mitigar com delay + reconexão fácil;
  suporte pode ser oferecido (Rafa cogitou cobrar dos franqueados).

## 6. CRM comercial / Atendimento + RH/Recrutamento

- **D6.1** **CRM / "Canal de Atendimento Comercial"** (apelido provisório do dev: *"PowerZap"*):
  pipeline + contatos + **mini-Kanban** + **IA de atendimento inicial** (qualifica leads; vendedor
  assume depois) + **canais integrados** (WhatsApp; expansível a IG/Facebook/e-mail/site/Google).
  A agência **tem um template pronto** (de outro cliente) → reaproveitar ("copia e cola").
- **D6.2** Cadastro de usuário define a **função** (consultor, caixa, gerente…); **regras** ligam o
  tipo de lead à função (ex.: consultor recebe lead de pop-up / avaliação / orçamento). Roteamento
  automático.
- **D6.3 — Recrutamento:** **"Currículos" é o 1º item.** Todo currículo (site / import SULTS /
  manual) cai ali, com **filtros (cidade/função: vendedor/recepcionista/aplicador)** e **dashboards
  (local/cargo/estado)**. Selecionar um currículo → vai pro **Kanban** e inicia o processo seletivo;
  o andamento **replica de volta no currículo** (ex.: "não disponível", "não quer shopping").
  - **1ª etapa = mensagem de disponibilidade por WhatsApp** (pré-requisitos: disponível? trabalha
    fim de semana? aceita shopping?). Depois: **agendar entrevista (agenda) OU WhatsApp** — as duas
    opções; **o recrutador contata** (candidato **não** se auto-agenda).
  - ⚠️ **Não jogar a lista inteira no Kanban** (dispararia WhatsApp em massa → ban). A pessoa de RH
    **filtra e move só os selecionados** → aí dispara a mensagem inicial.

## 7. Processo de trabalho e segurança (regras combinadas)

- **D7.1** **Rafa congela o front:** faz **todas** as mudanças de interface — sobretudo as que mexem
  em **formulários/estrutura** — **ANTES** de a agência iniciar o backend. Depois do build: **nada de
  novos módulos, integrações ou mudanças de formulário**. Pequenos ajustes visuais podem esperar.
- **D7.2** **Seletor multi-serviço no agendamento** (hoje 1 → vários) é **mudança estrutural →
  fazer ANTES do build** (muda o modelo de dados/back).
- **D7.3** **Agenda granularidade de 10 min** (hoje 1h) — ajuste simples, a **agência faz**.
- **D7.4** Haverá **2º ambiente** para edições; depois que o Rafa edita, a agência **sobe**. Qualquer
  alteração no Cloud do Rafa exigirá um comando combinado para subir (senão não sobe).
- **D7.5** **Segurança:** segredos ficam nas **Vercel Kubernetes Secrets** (não em arquivo `.env`
  versionado). Cibersegurança/back-end tratados na fase de construção. Repositório estava vazio.
- **A7.1** Rafa: passada final no front **hoje**, entregar versão **~99% pronta amanhã**, e congelar.

## 8. Pontos em aberto / a confirmar

- ❓ **Como exportar fotos/termos/contratos do BEMP** (depende do BEMP/Diego). Bloqueio da migração.
- ❓ **Free (QR Code) × API oficial paga** — decidir após teste de volume real; **quem paga** o custo.
- ❓ **Suporte aos WhatsApp das unidades** (quem mantém quando cair; modelo de cobrança).
- ❓ Definir o **roteamento por unidade** dos leads do site (casar `unidade` texto/e-mail → `unidade_id`).

## 9. Como isso conversa com o que já temos
- **Confirma:** multitenant (franqueado vê a sua / admin vê tudo) · leads do site = P0 · WhatsApp via
  UAZAPI · SAC com distribuição. Ver [project-laserco-discovery-decisions] e [BACKLOG.md].
- **Novo/refina:** módulo **Canais** (WhatsApp por unidade + delay anti-ban) · **migração BEMP via API
  + bloqueio dos documentos** · **seleção de unidade por lista (não CEP)** no site · **site editável**
  via painel · **regra de congelar o front antes do build** · regra **anti-roubo de cliente** no import.
- **Ações que viram tarefa no BACKLOG:** módulo Canais (EPIC 10/16) · importador BEMP por API +
  arquivos (EPIC 14.1) · CRM/atendimento com IA + canais (EPIC 3/15) · recrutamento currículos
  (EPIC 20.5–20.7) · seleção de unidade por lista no fluxo de leads do site (EPIC 3.2/3.3).
