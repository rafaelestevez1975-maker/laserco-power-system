# 05 — Dados do BEMP que HOJE não conseguimos puxar (pauta p/ reunião com o cliente)

Pedido da reunião de 11/07 (tarefa do Julio): lista simples do que está inacessível,
para pedir acesso ao cliente/Diego (dono do BEMP).

## 1. Acesso direto ao banco (Postgres) — ⛔ MORREU

- A senha do usuário `org_00103` foi **rotacionada** depois do nosso último sync (04/07).
  Erro atual: `password authentication failed`.
- Era a nossa fonte de: clientes (352k), agendamentos, vendas/billings, OS, colaboradores.
- **Sem isso, os dados do espelho ficam congelados em 04/07** — é exatamente o que gera
  "dashboard com 0 comparecimentos" e faturamento divergente.
- **Pedir: nova credencial (ou usuário read-only dedicado) + compromisso de não rotacionar
  sem avisar.** Ideal: réplica read-only ou dump diário.

## 2. Arquivos/documentos — ⛔ NUNCA saíram pela API/banco

- Fotos de procedimento, termos de consentimento assinados e contratos ficam no **storage**
  do BEMP, fora do banco (bloqueio já registrado na ATA de 22/06).
- O robô de download via app web está pronto (`scripts/baixar-docs-bemp.mjs`) e **agora temos
  o login web** (mateus@) — mas baixar 351k clientes um a um é inviável sem prioridade.
- **Pedir: export em massa (zip) ao BEMP/Diego**, ou autorização formal p/ rodar o robô
  priorizando clientes ativos/pacote em andamento.

## 3. O que CONSEGUIMOS via web autenticado (workaround atual, sem pedir nada)

- Tudo que tem tela: perfis+permissões (extraído ✓), colaboradores (extraído ✓), unidades e
  configurações por unidade (extraído ✓), catálogo (serviços/pacotes/produtos — corrigido ✓),
  formas de pagamento/descontos/motivos/origens/contratos (extraído ✓).
- Relatórios com export xlsx/csv **assíncrono** (vira job em `/exports`) — dá para automatizar,
  mas é frágil e lento para volume (agendamentos/billings diários).
- Limitação: escala e robustez. Serve para cadastros; NÃO serve como fonte contínua de
  movimento (agenda/vendas/caixa).

## 4. Dados que o BEMP simplesmente não tem (não pedir, decidir)

- CPF e data de admissão dos colaboradores (nosso cadastro exige; o BEMP não tem os campos)
  → decidir: importar incompleto agora e completar depois, ou cadastrar aos poucos.
- Histórico de merges de clientes anterior aos relatórios disponíveis.

## Resumo para falar com o cliente

> "Para o espelho ficar vivo (agenda, comparecimento, faturamento batendo dia a dia), precisamos
> de acesso contínuo ao banco do BEMP — a credencial que tínhamos foi trocada em julho. E para
> migrar fotos/termos/contratos precisamos de um export em massa do BEMP, porque isso não sai
> nem pela API nem pelo banco. Todo o resto (cadastros, perfis, catálogo) já conseguimos pelo
> acesso web que o Mateus passou — inclusive já igualamos unidades, pacotes e serviços."
