# Checklist do Financeiro — informe × validação do cliente × sistema

> Base: `Financeiro-LaserCo-para-validacao.pdf` (informe enviado ao cliente) e as respostas do
> Rafael (CEO) relayadas pelo Julio em 01/07/2026. Atualizar este arquivo a cada regra
> confirmada/entregue. Legenda: ✅ confirmado+implementado · 🟡 confirmado, falta implementar ·
> ⏳ aguardando confirmação do cliente · 🔧 em construção.

## 1. Regras de negócio (seção 4 e 8 do informe)

| # | Regra | Cliente respondeu? | Sistema | Status |
|---|-------|--------------------|---------|--------|
| 1 | Royalty **10%** do faturamento | Material do cliente diz 10%; sem contestação | Configurável em Config (royalty_pct), apuração real BEMP | ✅ (falta só OK formal) |
| 2 | Fundo de marketing **2%** | Material diz 2%; sem contestação | Configurável (fundo_pct) | ✅ (falta só OK formal) |
| 3 | Vencimento **dia 10** do mês seguinte | Material diz dia 10; sem contestação | Configurável (venc_dia) | ✅ (falta só OK formal) |
| 4 | Base de cálculo: **bruto** × líquido | **NÃO respondido explicitamente** | Hoje calcula sobre o BRUTO | ⏳ confirmar |
| 5 | Só **franquias** pagam royalty (lojas próprias não) | Não contestado | Apura só unidades com bemp_salon_id | ⏳ confirmar se lojas próprias têm bemp_salon_id e devem ficar de fora |
| 6 | **Categorias** de receita/despesa (plano de contas) | ✅ "seguir o sistema de fluxo de caixa que dei acesso, MAS **precisamos poder criar** as categorias" | Plano de contas existe (17 contas seed); criação pelo usuário **não existe** | 🟡 construir CRUD de categorias/plano de contas |
| 7 | **Reembolso do SAC**: aprovado pelo gestor → conta a pagar → espelha no fluxo da franqueadora → pagamento **encerra o chamado** | ✅ "Está correto como desenhado" + puxar contrato/pagou/usou do sistema p/ calcular | Reembolso SAC existe (lancamentos_financeiros); falta: fluxo de APROVAÇÃO + produtor → razão + pagar fecha o chamado | 🟡 construir a cadeia completa |
| 8 | **Inadimplência**: notificação + jurídico | ✅ "temos as regras, mas **tem que poder criar e ajustar**, não estático" | Régua de cobrança é editável em Config (dias/ação/canal) | ✅ (validar se a edição atende) |
| 9 | **Taxa de cartão** vira despesa automática | Não contestado | Configurável (taxa_cartao_pct, MDR médio) — apura no botão "Apurar mês" | ✅ (definir o % em Config) |
| 10 | Competência (DRE) × Caixa (fluxo) | Não contestado | Implementado: DRE por competência; fluxo por data de caixa/prevista | ✅ |
| 11 | **Imposto** e **comissão** (% e base) | **NÃO respondido** (perguntamos: regime/alíquota; comissão % e base) | Configuráveis em Config → Regras de despesa (0 = não lança) | ⏳ definir % em Config |

## 2. Validações NOVAS que o cliente trouxe (01/07)

| # | Pedido | Status |
|---|--------|--------|
| A | **Dois financeiros**: da LOJA (franqueado; a pagar/receber simples, lançamentos automáticos de venda/comissão/taxa/royalty + despesas manuais por categoria) e da FRANQUEADORA (interno, gestores; unifica lojas próprias + escritório + receitas rede; DRE por loja/todas/franqueadora/grupo; cobrança automática) | ✅ Arquitetura já é essa (razão + centro de custo por unidade/rede + DRE com escopo Consolidado/Franqueadora/Unidades). Falta: financeiro DA LOJA para o franqueado (/contas é o embrião) e DRE **por loja individual** |
| B | Lançamento **"suspenso"** nas contas a pagar/receber da franqueadora: fica visível, **não pode ser pago** nem **influenciar o fluxo de caixa** (ex.: parcela de máquina em devolução; franqueado em execução judicial) | ✅ **Implementado hoje**: suspender no A Receber/A Pagar espelha no razão; fluxo de caixa ignora suspensos; DRE mantém (competência); reativar restaura |
| C | **Perfis de Acesso × Cargos separados** (17 perfis sugeridos: Super Admin, Admin, Diretor, Operações, Financeiro, Marketing, RH, Expansão, SAC, Jurídico, TI, Auditor, Franqueado, Gerente de Unidade, Supervisor, Comercial/Recepção, Profissional Técnico; cargos livres apontando pra um perfil) | 🟡 O RBAC atual (cargos × permissões, migration 009) já separa conceito; falta: seed dos 17 perfis + tela de vínculo cargo→perfil + cadastro de cargo digitável/lista |
| D | Sults: aproveitar o que já foi salvo | ✅ Temos reclamações do Sults importadas (sac_tickets) + Checklist Mensal SULTS |
| E | BEMP/Sults como fonte contínua | ✅ BEMP já é a fonte do faturamento (140k linhas); sync até 11/mai — **renovar o sync** para fechar maio/junho |

## 3. Próximas fatias (ordem sugerida)

1. **CRUD de categorias/plano de contas** (item 6) — destrava "despesas gerais por categoria" nos dois financeiros.
2. **Cadeia do reembolso SAC** (item 7): aprovação do gestor → produtor razão (conta 4.2.05) → espelho no A Pagar → pagar encerra o chamado.
3. **Financeiro da LOJA (franqueado)**: evoluir /contas para o modelo BEMP-like com lançamentos automáticos.
4. **Perfis × Cargos** (item C): seed dos 17 perfis + telas.
5. **DRE por loja individual** (item A): seletor de unidade no DRE (hoje: consolidado/franqueadora/unidades agregadas).
6. Confirmar com o cliente: **bruto × líquido** (item 4), **% imposto/comissão** (item 11), lojas próprias fora do royalty (item 5).

## 4. Garantia central (seção 6 do informe)

"O valor bate igual em todas as telas" = **razão único** (`fin_lancamento`): produtores lançam
(BEMP, royalties, despesas config, manuais, SAC), telas derivam (DRE, Fluxo, A Receber/Pagar).
Validado e2e em março/abril 2026 (R$17,7M / R$16,0M).
