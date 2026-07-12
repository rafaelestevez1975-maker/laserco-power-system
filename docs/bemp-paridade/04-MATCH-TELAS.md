# 04 — Match 1:1 de TELAS: BEMP ↔ Power System ↔ HTML legado

O HTML do Rafael (`legacy/index.html`) foi construído copiando o BEMP e acrescentando módulos
(do SULTS e de ideias próprias). Nossas rotas seguem o HTML, então o match abaixo tem 3 colunas:
o que é do BEMP, onde está no nosso sistema e o estado real (funcional × clone estático).
Estado detalhado por tela: `inventario-nosso.md` + `docs/FRONTEND-STATUS.md`.

## Parte A — Telas que EXISTEM no BEMP (obrigação de espelho)

| BEMP | Nossa rota | Estado hoje | Gap principal p/ "até a vírgula" |
|---|---|---|---|
| Agenda (slots 10min, bloqueios unidade/profissional) | `/agenda` | funcional c/ dados até 04/07 | status não re-sincroniza; intervalo configurável por unidade; bloqueios |
| Ordens de serviço | `/os` | funcional (deriva de billings/orders) | OS nasce da agenda/venda; 4 papéis por OS; **restaurar botão "nova venda"** (reunião) |
| PDV / caixa | `/pdv` | parcial | BEMP tem módulo Caixa (`cash_stations`) por unidade |
| Clientes | `/clientes` | funcional (352,7k) | filtros BEMP (doc/verificado/app/bloqueado/pendência), botão WhatsApp por linha, merge de duplicados |
| Anamnese/Ficha técnica | `/cadastros/anamnese` | parcial | no BEMP é form-builder genérico (8 forms + termos) |
| CRM (quadros) | `/crm` | funcional | 3 funis do Rafael (Geolocalizado/Indicações/Orçamentos) |
| Notas fiscais | `/notas` | parcial | 6 status assíncronos, emissão cliente×unidade, XML em lote |
| Serviços / grupos | `/servicos`, `/cadastros/grupo-servicos` | funcional ✅ dados 113 ativos | flags: encaixe, online, ordem no app, preço por unidade |
| Pacotes | `/pacotes` | funcional ✅ dados 203 ativos | composição pacote→serviços (qty+desconto por item), contrato vinculado |
| Produtos | `/produtos` | funcional | flag insumo (`feedstock`), grupos |
| Planos de assinatura | `/planos`, `/cadastros/planos` | parcial | Bronze/Prata/Ouro ± adesão; aprovação de pagamento manual; Asaas |
| Formas de pagamento | `/cadastros/formas-pagamento` | funcional (24) | **modelo**: grade 125 = parcela×bandeira×canal×adquirente + escolha por unidade |
| Descontos | `/descontos` | funcional | % por tipo (serviço/produto/pacote) + expiração |
| Motivos de cancelamento | `/cadastros/motivos` | funcional ✅ | BEMP tem exatamente 4 |
| Origens de cliente | `/cadastros/origens` | funcional ✅ | BEMP tem exatamente 8 |
| Modelos de contrato | `/cadastros/contratos` | parcial | gatilho de emissão + assinatura por e-mail |
| Metas | `/cadastros/metas` | parcial | indicador × ciclo (mensal/semanal) |
| Comissões (matriz + por meta) | `/cadastros/comissoes` | parcial | 3 camadas: % padrão → matriz serviço×colaborador → bônus por meta; fornecedor-espelho por profissional |
| Fornecedores | (dentro de contas) | parcial | BEMP auto-cria fornecedor por colaborador p/ comissões |
| Contas a pagar/receber + categorias | `/contas`, `/catpag`, `/catrec` | funcional | espelhar: 2 abas, previsto/realizado/cancelado, baixa em massa, comissão automática por OS (pedido explícito da reunião) |
| Perfis de acesso | `/cadastros/perfis`, `/perfis` | parcial | **refazer espelhando matriz do BEMP; seed só Proprietário** (`02-RBAC-BEMP.md`) |
| Colaboradores | `/colaboradores` | funcional (349) | importar 601 ativos; campos BEMP: % comissão, exibe na agenda, online, ordem no app |
| Dashboards Gerencial/Performance/Fin | `/dashboards/*` | majoritariamente clone | 13 gráficos do Gerencial; multi-unidade consolidável |
| Relatórios (~45) | `/relatorios/*` (25 rotas) | majoritariamente clone | priorizar: faturamento por unidade (pedido da gerente de operações), agendamentos, situação/saldo de pacotes, DRE/extrato |
| Mensagens/campanhas + audiências + automações | `/marketing`, `/disparos`, `/automacoes` | funcional (Uazapi) | BEMP usa e-mail/push próprios; nosso WhatsApp é melhoria — manter |
| Minha unidade | `/minha-unidade` | mock (ok por ora — reunião) | 8 abas do BEMP; intervalo de agenda por unidade |
| Todas unidades | `/unidades` | funcional ✅ 42 ativas | criar a FUNÇÃO desativar unidade na UI (pedido da reunião); trocar unidade ativa |
| Minha conta | `/minha-conta` | parcial | validade de pontos, regras de OS, agendamento online, dados contratuais |
| Exportações | `/exportacoes`, `/relatorios/exportacoes` | clone | export assíncrono universal (todo grid do BEMP exporta) |
| Fidelidade (pontos) | `/relatorios/fidelidade` | clone | validade 18 meses, pontos por serviço/pacote (`generate_points`) |
| Caixas (`cash_stations`) | — (sem rota própria) | ausente | relatório de caixas por unidade |
| WhatsApp Web (`/whatsapp_messages`) | `/canais` + SAC | funcional (diferente) | nosso é centralizado no SAC; BEMP é por unidade |

## Parte B — SOBRAS (existem aqui, NÃO existem no BEMP)

Classificação: **[SULTS]** = veio da operação franqueadora que rodava no SULTS;
**[Cliente]** = criação do Rafael/operação própria; **[Nosso]** = criamos nós (fora do HTML).

| Módulo/rota | Origem | Situação (reunião 11/07) |
|---|---|---|
| SAC (`/sac`, 11 telas) | [Cliente] (substituiu atendimento avulso) | **NÃO MEXER** — em produção, uso pesado; melhorias listadas à parte (triagem IA por assunto, tags automáticas) |
| Saque/reembolso | [Cliente] | **NÃO MEXER**; integrar lançamentos ao financeiro (SAC lança, financeiro não vê) |
| Universidade (`/universidade`) | [SULTS] (treinamentos) | manter estrutura do Rafael; tornar funcional (aulas/trilhas/notas/prova/certificado) + usuário admin só-Universidade |
| Expansão (`/expansao`) | [SULTS] (pipeline de novas franquias) | P0 do cliente; não existe no BEMP |
| Leads do site (`/leads-site`) | [Cliente] (site → sistema) | urgente do cliente; BEMP só tem CRM interno |
| Checklist/indicadores (`/checklist`) | [SULTS] (checklist semanal + planos de ação) | substituir pesquisa manual BEMP→SULTS |
| Jurídico (`/juridico`) | [SULTS] | adiado (onda 5) |
| Implantação (`/implantacao`) | [SULTS] | adiado |
| Disco/arquivos (`/disco`) | [SULTS] (repositório) | SULTS era "só repositório" — baixa prioridade |
| Comunicados (`/comunicados`) | [SULTS] | funcional |
| Chamados internos (`/chamados`) | [SULTS] (helpdesk franqueado→franqueadora) | funcional |
| RH/ponto/recrutamento (`/rh`, `/ponto`) | [Cliente] (unificou sistemas avulsos) | recrutamento funcional; resto adiado |
| Indiques (`/indiques`) | [Cliente] | funcional |
| Financeiro da franqueadora (`/financeiro` razão/DRE/royalties/cobrança) | [Nosso]+[Cliente] | **NÃO MEXER** — entregue e validado (mar/abr reais) |
| Canais/disparos WhatsApp (`/canais`, `/disparos`) | [Nosso] (Uazapi) | melhoria; manter |
| App-cliente (`/app-cliente`) | [Cliente] | BEMP tem app próprio com QR code; nosso é clone visual |
| Auditoria (`/auditoria`) | [Nosso] | manter (trilha de alterações ~ "Histórico de alterações" do BEMP) |

## Ordem de ataque sugerida (coerente com a reunião)

1. **Perfis de acesso** espelho BEMP (primeira coisa a arrumar — 02:56:55).
2. **Dados vivos**: reobter acesso ao banco/negociar export; sync diário (destrava dashboards,
   comparecimentos, faturamento por unidade).
3. **Contas a pagar/receber** estilo BEMP (planilha + filtros por unidade) mantendo o dashboard
   como camada extra.
4. **Botão nova venda** na OS + fluxo agenda→OS.
5. **Relatório de faturamento por unidade** (gerente de operações).
6. **Colaboradores 601** + matriz de comissões.
7. Universidade funcional + usuário admin restrito (paralelo, não depende do BEMP).
