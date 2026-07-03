# Checklist do Financeiro  informe × validação do cliente × sistema

> Base: `Financeiro-LaserCo-para-validacao.pdf` (informe enviado ao cliente) e as respostas do
> Rafael (CEO) relayadas pelo Julio em 01/07/2026. Atualizar este arquivo a cada regra
> confirmada/entregue. Legenda: ✅ confirmado+implementado · 🟡 confirmado, falta implementar ·
> ⏳ aguardando confirmação do cliente · 🔧 em construção.

## 1. Regras de negócio (seção 4 e 8 do informe)

| # | Regra | Cliente respondeu? | Sistema | Status |
|---|-------|--------------------|---------|--------|
| 1 | Royalty 10% **POR UNIDADE** + desconto automático | ✅ CEO 02/07: "10% em regra, mas preencher POR unidade; <80k pagando em dia = 50% de desconto; nada impede regra diversa amanhã" | ✅ Override %/vencimento por franquia (Config → Royalties por unidade) + regra automática configurável (teto/%, 'em dia' = sem recebível atrasado). Mar/abr re-apurados: 42 unidades com 5% | ✅ entregue |
| 2 | Fundo de marketing | ✅ CEO 02/07: "**hoje não cobramos**" | ✅ fundo_pct = 0 (não lança); segue configurável se voltarem a cobrar. Lançamentos antigos de fundo removidos | ✅ entregue |
| 3 | Vencimento **dia 10**, mas escolhível | ✅ CEO 02/07: "podemos escolher o dia; sistema não pode ficar engessado (dezenas de franqueados)" | ✅ Dia padrão em Config + override por unidade | ✅ entregue |
| 4 | Base de cálculo | ✅ CEO 02/07: "**sempre faturamento bruto: receita menos descontos**" | ✅ RPCs mudaram de sum(total) → sum(total − desconto). ⚠️ Números REAIS: mar R$4,58M / abr R$4,37M (antes 17,7/16,0  era preço cheio!). Royalties abr: R$362k | ✅ entregue |
| 5 | Só **franquias** pagam royalty (lojas próprias não) | Não contestado | Apura só unidades com bemp_salon_id | ⏳ confirmar se lojas próprias têm bemp_salon_id e devem ficar de fora |
| 6 | **Categorias** de receita/despesa (plano de contas) | ✅ "precisamos poder criar as categorias" | ✅ Config → "Plano de contas (DRE)": criar (nome+natureza), ativar/desativar; Nova despesa cai na conta de mesmo nome (fallback Outras despesas) | ✅ entregue |
| 7 | **Reembolso do SAC**: aprovado pelo gestor → conta a pagar → espelha no fluxo da franqueadora → pagamento **encerra o chamado** | ✅ "Está correto como desenhado" | ✅ solicitarReembolso → despesa PREVISTA no razão (4.2.05, centro rede); Financeiro paga (darBaixa) → concilia caixa no razão + fecha o chamado. Falta só: puxar contrato/uso do BEMP p/ CALCULAR o valor (depende da base de clientes) | ✅ cadeia entregue (cálculo auto: aguarda base) |
| 8 | **Inadimplência**: notificação + jurídico | ✅ "temos as regras, mas **tem que poder criar e ajustar**, não estático" | Régua de cobrança é editável em Config (dias/ação/canal) | ✅ (validar se a edição atende) |
| 9 | **Taxa de cartão** vira despesa automática | Não contestado | Configurável (taxa_cartao_pct, MDR médio)  apura no botão "Apurar mês" | ✅ (definir o % em Config) |
| 10 | Competência (DRE) × Caixa (fluxo) | Não contestado | Implementado: DRE por competência; fluxo por data de caixa/prevista | ✅ |
| 11 | **Imposto** e **comissão** (% e base) | **NÃO respondido** (perguntamos: regime/alíquota; comissão % e base) | Configuráveis em Config → Regras de despesa (0 = não lança) | ⏳ definir % em Config |

## 2. Validações NOVAS que o cliente trouxe (01/07)

| # | Pedido | Status |
|---|--------|--------|
| A | **Dois financeiros**: da LOJA (franqueado; a pagar/receber simples, lançamentos automáticos de venda/comissão/taxa/royalty + despesas manuais por categoria) e da FRANQUEADORA (interno, gestores; unifica lojas próprias + escritório + receitas rede; DRE por loja/todas/franqueadora/grupo; cobrança automática) | ✅ Arquitetura já é essa + **DRE por loja individual entregue** (aba DRE → visão "Só unidades" → seletor de loja; validado: loja R$1,87M − 12% = R$1,65M). Falta: financeiro DA LOJA para o franqueado (/contas é o embrião) |
| B | Lançamento **"suspenso"** nas contas a pagar/receber da franqueadora: fica visível, **não pode ser pago** nem **influenciar o fluxo de caixa** (ex.: parcela de máquina em devolução; franqueado em execução judicial) | ✅ **Implementado hoje**: suspender no A Receber/A Pagar espelha no razão; fluxo de caixa ignora suspensos; DRE mantém (competência); reativar restaura |
| C | **Perfis de Acesso × Cargos separados** (17 perfis sugeridos; cargos livres apontando pra um perfil) | ✅ **17 perfis seedados** (scripts/migrations/perfis-acesso.sql): Super Admin (todas 1176 permissões) → Administrador (tudo menos sistema) → Diretor (lê/exporta/aprova tudo) → … → Profissional Técnico (12). Vincular pessoa→perfil já funciona em /perfis (usuario_cargos). O CARGO (função) segue livre no cadastro do colaborador  exatamente o modelo pedido |
| D | Sults: aproveitar o que já foi salvo | ✅ Temos reclamações do Sults importadas (sac_tickets) + Checklist Mensal SULTS |
| E | BEMP/Sults como fonte contínua | ✅ BEMP já é a fonte do faturamento (140k linhas); sync até 11/mai  **renovar o sync** para fechar maio/junho |

## 3. Próximas fatias (ordem sugerida)

1. **Financeiro da LOJA (franqueado)**: evoluir /contas para o modelo BEMP-like com lançamentos automáticos por unidade.
2. **Cálculo automático do reembolso** (contrato/pagou/usou do BEMP)  depende da base de clientes (planilha 350k).
3. Confirmar com o cliente: **bruto × líquido** (item 4), **% imposto/comissão** (item 11), lojas próprias fora do royalty (item 5).
4. Renovar o **sync do BEMP** (dados param em 11/mai) para apurar maio/junho.
5. Tela de gestão dos perfis (hoje o vínculo pessoa→perfil é feito em /perfis; avaliar UX dedicada).

~~CRUD de categorias~~ ✅ · ~~Cadeia do reembolso SAC~~ ✅ · ~~Perfis seed~~ ✅ · ~~DRE por loja~~ ✅ (entregues em 02/07)

## 4. Garantia central (seção 6 do informe)

"O valor bate igual em todas as telas" = **razão único** (`fin_lancamento`): produtores lançam
(BEMP, royalties, despesas config, manuais, SAC), telas derivam (DRE, Fluxo, A Receber/Pagar).
Validado e2e em março/abril 2026 (R$17,7M / R$16,0M).
