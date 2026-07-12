# 02 — RBAC do BEMP: perfis de acesso e permissões

Fonte: `/roles/:id/edit` de cada perfil, extraído em 11/07/2026.
Matriz completa (159 permissões × 22 perfis, com módulo e descrição): `dados/matriz-permissoes.csv`.

## Modelo do BEMP

- Permissão = string `recurso.acao` (ex.: `schedule.manager`, `subscription.approve_manual_payment`,
  `support.open_ticket`), organizada em **43 módulos** na tela (Agenda, Anamnese, Assinatura,
  Bloqueio, Caixa, Clientes, CRM, Dashboards, Descontos, Faturas, Fidelidade, Financeiro/Contábil,
  Formas de pagamento, Funcionalidades, Metas, Minha Conta, Minha Unidade, Modelos de contrato,
  Modelos de comissão, Motivos de cancelamento, Notas Fiscais, Notificações, OS, Pacotes,
  Perfis de acesso, Planos de Assinatura, Produtos, Relatórios, Serviços, Usuários,
  Vale/Adiantamento, grupos, históricos etc.).
- Ações típicas por módulo: **Incluir/Alterar/Inativar** (uma permissão só) + **Visualizar** +
  ações especiais (ex.: Assinatura → "Aprovar pagamento manual", "Forçar cobrança via Asaas";
  Agenda → gerenciar bloqueios da unidade × do profissional, "ver agenda dos outros").
- O perfil é único por usuário (1 role por user) e vale na(s) unidade(s) às quais o usuário
  está vinculado.
- A tela de edição mostra a matriz agrupada por módulo com checkboxes; perfis de sistema
  (Proprietário/Terminal) vêm readonly.

## Os 22 perfis (nº de permissões marcadas / 159 + usuários ativos)

| Perfil | Permissões | Usuários ativos (de 601) |
|---|---|---|
| Proprietário | 159 | 15 |
| Marketing | 113 | 3 |
| Franqueado | 112 | 55 |
| Franqueado/Fisio | 107 | 2 |
| Colaborador SAC | 104 | 0 |
| Gerente de Campo (descontos) | 104 | 1 |
| Colaborador Interno/Fisio | 102 | 1 |
| SAC | 101 | 5 |
| Expansão | 97 | 1 |
| Gerente de Campo | 96 | 3 |
| Gerente de Campo - Franquias | 93 | 5 |
| Colaborador Treinamento | 92 | 0 |
| Colaboradores Internos | 91 | 2 |
| Gerente/Fisio | 87 | 18 |
| Gerente | 84 | 47 |
| Subgerente | 72 | 29 |
| Consultora de Vendas | 47 | 161 |
| Consultora Online Rio de Janeiro | 47 | 3 |
| Consultor de Vendas Online | 47 | 0 |
| cancelar | 42 | 0 |
| Profissional | 24 | 250 |
| Terminal | 2 | 0 |

Leitura do negócio: a operação de loja roda com **Consultora de Vendas (161)** +
**Profissional (250)** + **Gerente/Subgerente (94)**; a franqueadora com Proprietário,
Marketing, Gerentes de Campo, SAC e Expansão. Os perfis "/Fisio" são variantes com
acesso a anamnese/ficha técnica.

## Plano de espelhamento (decisão da reunião 11/07)

1. Refazer a tela **Cadastros → Perfis de acesso** espelhando o BEMP: matriz módulo × permissão
   com checkboxes, nome + flag ativo, linha clicável, filtro de ativos.
2. **Seed: APENAS "Proprietário"** com tudo marcado (o Rafael cria os demais). Nossos 17 perfis
   seedados atuais (+ cargos SAC) devem ser preservados internamente para não derrubar o SAC,
   mas a tela nova não deve pré-criar cargos de negócio.
3. O catálogo de permissões nosso (9 módulos × 7 ações, ~42 recursos, migration 009) precisa
   crescer para cobrir os 43 módulos/ações especiais do BEMP — usar `dados/matriz-permissoes.csv`
   como fonte do catálogo-alvo (coluna `modulo` + `permissao` + `descricao`).
4. Simplificação acordada: parar de gerenciar unidade+franqueadora simultaneamente; primeiro
   tudo no nível franqueadora.
