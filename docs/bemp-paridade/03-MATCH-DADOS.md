# 03 — Match de DADOS: BEMP × nosso Supabase

Comparação feita em 11/07/2026 contra o BEMP de produção (via web autenticado).
**Correções aplicadas no mesmo dia estão marcadas ✅.**

## Causa raiz nº 1 (descoberta do dia)

**As listagens do BEMP filtram `ativo=true` por padrão; nosso import trouxe TUDO e marcou
quase tudo como ativo.** Por isso o cliente via "dados errados": unidades fechadas (Rio,
Porto Alegre…), pacotes e serviços descontinuados apareciam nas nossas telas e distorciam
filtros/relatórios/faturamento.

## Estado por entidade

| Entidade | BEMP (total/ativos) | Nosso ANTES | Nosso DEPOIS | Ação |
|---|---|---|---|---|
| Unidades | 81 / **42** | 82, sendo 78 "ativas" | 82, **42 ativas** ✅ | 36 desativadas (match por nome normalizado; 0 sobras) |
| CNPJ das unidades | 42 preenchidos | **1** preenchido | **42** ✅ | importados do BEMP (base p/ matches futuros) |
| Pacotes | 564 / **203** | 552, 226 "ativos" | 561, **203 ativos** ✅ | 32 desativados + **9 novos importados** (Temporada Brasileira, Promoção Regenerativa, Aesthetic-Peptídeo…) c/ preço, validade, cobertura, desc. máx. |
| Serviços | 150 / **113** | 148, 116 "ativos" | 150, **113 ativos** ✅ | 5 desativados + **2 novos importados** (Aesthetic Peptídeo/Ampola) c/ duração, preço, grupo |
| Clientes | 351.255 | 352.715 | = | ~1.460 a mais aqui: o BEMP faz **merge de duplicados** (relatório "Clientes Duplicados") e nosso espelho não reflete merges pós-04/07. Requer re-sync (bloqueado, ver 05) |
| Colaboradores | 2.190 / **601 ativos** | 349 ativos | = | TSV completo extraído (`dados/bemp-colaboradores.tsv`). Import pendente: a listagem não expõe unidade(s) do usuário — dá pra obter iterando `q[salons_id_in][]` por unidade (42 requisições) ou via edit individual. Decidir com o cliente se importa incompleto (sem CPF/admissão — BEMP não tem) |
| Formas de pagamento | 125 | 24 | = | **Diferença de modelo**: no BEMP cada parcela×bandeira×canal×adquirente é um registro com taxa própria (2,70%–6,85%) e a unidade escolhe quais usa ("Cadastros básicos" da unidade). Nosso modelo tem 24 formas simples. Espelhar exige grade de taxas + vínculo por unidade |
| Perfis de acesso | 22 | 53 cargos (17 seed + SAC + extras) | = | Ver `02-RBAC-BEMP.md`: tela nova + seed só Proprietário |
| Agendamentos | (sem contador web) | 174.666 (fev/2026→2035) | = | **Congelados em 04/07** (último `criado_em`). Status existentes: aberto 46k, concluído 69k, cancelado 53,6k, confirmado 4,5k, em_atendimento 1,4k |
| Vendas (billings) | — | 210.287 (mar→jul) | = | Fonte do faturamento; também congeladas em ~04/07 |

## O problema "671 agendamentos / 0 comparecimentos" (reunião)

- O funil (`dashboards/funil`) conta comparecimento = `concluido + em_atendimento` — lógica OK.
- Julho tem 16.327 agendamentos importados, mas só 1.583 `concluido` — o import de 04/07 trouxe
  julho como futuro (`aberto`/`confirmado`) e **nenhum sync posterior atualizou os status**
  conforme os atendimentos aconteceram. Em recortes recentes (semana atual/unidade), comparecimento
  zera de fato.
- **Fix estrutural: sync contínuo (diário) do BEMP** — hoje bloqueado pela senha do Postgres
  (ver `05-DADOS-INACESSIVEIS.md`). Alternativa temporária: scraping dos relatórios web
  (`/report/schedules` pagina e tem export assíncrono).
- Nota da reunião: agenda deve trabalhar em intervalos de ~15 min (BEMP usa slots de **10 min**
  e o intervalo é configurável por unidade em Minha Unidade → Dados básicos).

## Faturamento ≠ vendas (a validar com a gestão)

No próprio BEMP, "Faturamento" (relatório `/report/billing`, base `billings` por pagamento)
difere de "Vendas/OS" (base `orders`). Nosso razão foi construído sobre `bemp_billings`.
A reunião decidiu: **a gestão define qual lógica é a correta** e o sistema segue essa definição.
Levar os dois números (billing × orders de um mesmo mês/unidade) para a conversa.

## Pendências de dados (ordem sugerida)

1. **Reobter acesso ao Postgres do BEMP** (ou export bulk) — destrava clientes/agendamentos/billings/OS.
2. Renovar sync até hoje + agendar sync diário (status de agendamento muda todo dia).
3. Importar os 601 colaboradores ativos (com mapa usuário→unidade via filtro por unidade).
4. Modelar a grade de formas de pagamento (125 combinações + vínculo por unidade).
5. Re-sincronizar clientes respeitando merges (o BEMP tem `customer_merges`).
