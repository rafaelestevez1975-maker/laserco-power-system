# 01 — Mapa completo do BEMP (laserco.bemp.app)

Extraído autenticado em 11/07/2026. Organização #103 "Laser&Co" (Laser Company Brasil LTDA,
CNPJ 44.442.908/0001-20, contrato de licença 12/06/2026). Unidade de referência do login: #1667
(São Paulo - Loja Conceito Vila Olímpia). Detalhes de cada tela nos `digest-*.md`.

## Volumes (produção BEMP, 11/07)

| Entidade | Total | Ativos | Observação |
|---|---|---|---|
| Clientes | 351.255 | — | listagem sem filtro de ativo |
| Usuários/colaboradores | 2.190 | **601** | listagem padrão mostra só ativos |
| Unidades (salons) | 81 | **42** | 6 próprias (raiz CNPJ 44.442.908) + franquias |
| Serviços | 150 | **113** | grupos: Depilação, Estético, Ultrassom |
| Pacotes | 564 | **203** | cobertura "Qualquer unidade" = crédito cross-franquia |
| Produtos | 7 | 7 | quase tudo insumo (PDRN/Peptídeo), flag `feedstock` |
| Formas de pagamento | 125 | — | 1 registro por parcela×bandeira×canal×adquirente |
| Descontos | 36 | — | % separado p/ Serviço/Produto/Pacote |
| Perfis de acesso | 22 | 22 | ver `02-RBAC-BEMP.md` |
| Planos de assinatura | 6 | — | Bronze/Prata/Ouro ± adesão (Laser&Club) |
| Origens de cliente | 8 | — | Facebook, Geolocalização, Google, Indicação, Instagram, Loja física, Outros, Parcerias |
| Motivos de cancelamento | 4 | — | via App, via WhatsApp, Cliente cancelou, Cliente reagendou |
| Modelos de contrato | 7 | — | 6 dos planos + 1 geral (créditos/pacotes/serviços) |
| Formulários de anamnese | 8 | — | form-builder genérico (Anamnese Digital + termos) |
| Metas | 3 | — | indicador × ciclo (mensal/semanal) |

## Menu completo (rota :: rótulo)

### Operação
- `/schedules` :: **Agenda** — calendário JS, slots de **10 min**, horário por dia da semana
- `/orders` :: **Ordens de serviço** — comandas; nascem da agenda/venda (SEM botão "novo")
- `/customers` :: **Clientes** — busca por doc/telefone, multiunidade, botão WhatsApp por linha
- `/custom_entities/customer_event` :: **Anamnese / Ficha Técnica** — form-builder (8 formulários)
- `/crm/boards` :: **CRM** — kanbans: ⚡ Geolocalizado, 💻 Indicações, 🚀 Orçamentos
- `/invoices` :: **Notas Fiscais** — NFS-e/NFC-e, 6 status, emissão p/ cliente OU unidade
- `/whatsapp_messages` :: **Mensagens WhatsApp Web**

### Cadastros
- `/services` / `/service_groups` :: Serviços e grupos (duração alimenta a agenda; preço fixo/variável/gratuito; encaixe; agendamento online; ordem no app)
- `/packages` :: Pacotes (crédito de sessões; validade em dias; comissão na Venda × Execução; cobertura unidade × rede)
- `/products` / `/product_groups` :: Produtos (grupos vazios)
- `/subscription_plans` / `/subscription_plan_groups` :: Assinaturas (Laser&Club)
- `/payment_methods` :: Formas de pagamento (grade de taxas por parcela/bandeira/canal/adquirente)
- `/discounts` :: Descontos (% por tipo de item + expiração; cortesias "Benefício ao cliente"/"Treinamento")
- `/cancellation_reasons` :: Motivos de cancelamento
- `/customer_channels` :: Origens de Cliente
- `/customer_contract_templates` :: Modelos de contrato (gatilho de emissão + assinatura por e-mail)
- `/suppliers` :: Fornecedores — **surpresa: o BEMP auto-cria 1 fornecedor por profissional** p/ lançar comissão como conta a pagar (vencimento pela data da OS)
- `/goals` :: Metas · `/bonifications` :: Comissões por meta · `/service_user_configs` :: **Matriz de comissões** (serviço × colaborador da unidade, % override)
- `/account_payable_categories` / `/account_receivable_categories` :: Categorias financeiras (25 categorias)
- `/roles` :: Perfis de acesso · `/users` :: Colaboradores

### Financeiro
- `/account_payables` :: Contas a pagar/receber — 2 abas, status Previsto/Realizado/Cancelado, baixa em massa, comissões entram automaticamente por OS

### Marketing
- `/messages` :: Mensagens (campanhas em massa; status Rascunho→Agendado→Estimando→Enviando→Enviado)
- `/audiences` :: Audiências · `/message_automations` :: Automações (não usado)
- `/customer_notification_config/edit` :: Configurações de notificação

### Dashboards
- `/dashboards/salon` :: **Gerencial** — 13 gráficos assíncronos (faturamento diário/por grupo/serviço/pacote/forma pagto, cancelamentos por motivo, taxa de retorno, agendamentos por origem/dia, fidelidade); filtro multi-unidade consolidável (`merge_salon_ids`)
- `/dashboards/performance` :: Performance
- `/dashboards/accountmanagement` :: Financeiro / Contábil

### Relatórios (~45; todos com export xlsx/csv assíncrono via `/exports`)
Assinaturas (3) · Clientes: acompanhamentos, aniversariantes, ranking, retornos, novos, abandonos,
duplicados, atendidos, origem (9) · Agendamentos, recorrentes, avaliações (3) · Atendimentos ·
Caixas · Contratos · Créditos: situação/movimentação (2) · Leads + funil de vendas CRM (2) ·
Crédito recorrente · Descontos · Estoque: situação/movimentações (2) · Estatísticas: unidade/colaborador (2) ·
Faturamento: geral, por forma de pagamento, por unidade, ranking de vendas (4) · Fidelidade (2) ·
DRE Gerencial + Extrato + Contas a pagar/receber + Vales/adiantamentos (5) · WhatsApp API ·
Metas · Notas fiscais · OS · Pacotes: execução/saldo/situação/movimentação (4) · Pagamentos (folha) ·
Perfis de acesso · Funil de vendas · Exportações

### Configuração
- `/salons` :: Todas unidades (accordion; "Editar" TROCA a unidade ativa da sessão — `Topbar.setSalon`)
- `/salons/salon` :: **Minha Unidade** — 8 abas: Dados básicos (flags estoque/caixa/comissão, **intervalo da agenda**, moeda, agendamento online), Horários seg–dom, Bloqueios, Redes sociais, Fotos, Comodidades, Cadastros básicos (multi-select POR UNIDADE de formas de pagto/descontos/pacotes/planos), NFSe (Lei do Salão Parceiro, alíquotas, certificado digital)
- `/organizations` :: **Minha conta** — Dados básicos (tema, subdomínio, validade de pontos = 18 meses, regras de abertura/fechamento de OS, logos), Agendamento online (bloqueio de inadimplente, app QR Code, Reserve with Google), Faturas, Dados contratuais
- `/exports` :: Exportações · `/field_setting/user` :: personalização de colunas por tela

## Padrões transversais (importam para o espelho)

1. **Filtros Ransack em tudo** (`q[campo_pred]`) — toda listagem tem busca rica + ordenação por coluna.
2. **Listagens padrão filtram ativos** (`q[active_true]=true`) — inativo some mas não é apagado.
3. **Linha clicável** → página de edição (Stimulus `page#visit`).
4. **Export xlsx/csv universal** — assíncrono, vira job e aparece em `/exports`.
5. **Paginação de 30** com "Exibindo X a Y de Z".
6. **Colunas personalizáveis por tela** (`/field_setting/{entity}`).
7. **Multi-unidade**: usuário troca a unidade ativa; dashboards consolidam várias unidades.
8. Comissionamento em 3 camadas: padrão do colaborador → matriz serviço×pessoa → bônus por meta.
