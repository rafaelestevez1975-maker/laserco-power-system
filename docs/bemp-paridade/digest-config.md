# BEMP — Digest: Telas de Configuração/Administração

Fonte: HTMLs autenticados em `scratchpad/bemp-pages/` (capturados 11/07/2026). App Rails server-rendered; listas usam Ransack (`q[...]`), tabelas com linha clicável (`data-page-url-param` → `/recurso/:id/edit`), botão "Novo", "Pesquisar" e dropdown "Exportar" (Excel .xlsx / CSV) que joga o resultado na tela **Exportações**.

Padrão comum das listas de cadastro básico (origens, motivos, grupos, audiências): colunas **Nome | Ativo**, filtros `q[name_cont]` (Nome) + `q[active_true]` (checkbox Ativo, marcado por padrão — registros inativos ficam ocultos), botão Novo, clique na linha abre edição. Sem exclusão na lista (desativa em vez de excluir).

---

## 1. salons.html — Todas unidades (`/salons`)

Lista em **accordion de cards** (não é `<table>`): cabeçalho Nome | Telefone | Documento | Configurações (ícones) | ações "Detalhes" (expande) e "Editar" (`Topbar.setSalon(id, '/salons/salon')` — troca a unidade ativa do topbar e abre Minha Unidade).

- **Filtros**: `q[name_cont]` (Nome), `q[document_type_eq]` (Tipo de documento), `q[document_id_cont]` (Número do documento), `q[has_stock_control_eq]` (Controla estoque), `q[has_cash_control_eq]` (Controla caixa), `q[salon_invoice_config_nfs_active_eq]` (Utiliza NFS), `q[validate_document]`, + campo customizado `custom_field[2474]` "Tipo de loja" (Loja Própria / Franquia).
- **Ícones de config por unidade** (tooltip): Ativo, Controla estoque, Controla caixa, Usar lista própria de produtos, Financeiro/Contábil, Insumos, Disponível para agendamento online, NFS ativo.
- **Card expandido (Detalhes)**: Endereço completo; Configurações (Ativo, Controla estoque/caixa, Lista própria de produtos, Financeiro/Contábil, Gera comissões nas contas a pagar, Insumos, Intervalo da agenda em minutos, Limite de quebra de caixa, Cálculo de comissão, Fuso horário, Agendamento online, NFS); Horário de funcionamento seg–dom.
- **Paginação**: "Exibindo 1 a 30 de 42" — o HTML capturado contém só a página 1 (30 unidades); as 12 restantes estão na página 2 (não capturada). Botão Exportar (xlsx/csv) traria as 42.
- Sem botão "Novo" (criação de unidade não é self-service nesta tela).

### Unidades (30 de 42 visíveis na captura — todas Ativo=Sim, agendamento online=Sim, NFS=Sim)

| # | Unidade | Cidade/UF | CNPJ | Ativo |
|---|---------|-----------|------|-------|
| 1 | Belo Horizonte - Lourdes BH | Belo Horizonte, MG | 53.401.772/0001-00 | Sim |
| 2 | Boa Vista - Garden Shopping | Boa Vista, RR | 49.502.467/0001-29 | Sim |
| 3 | Cabo Frio - Park Lagos Cabo | Cabo Frio, RJ | 61.404.587/0001-99 | Sim |
| 4 | Canoas - Park Shopping Canoas | Canoas, RS | 60.806.352/0001-60 | Sim |
| 5 | Caruaru - Caruaru | Caruaru, PE | 57.980.459/0001-16 | Sim |
| 6 | Cuiabá - Goiabeiras Shopping | Cuiabá, MT | 48.006.333/0001-54 | Sim |
| 7 | Cuiabá - Jd. das Américas | Cuiabá, MT | 57.709.430/0001-02 | Sim |
| 8 | Cuiabá - Pantanal Shopping | Cuiabá, MT | 51.801.103/0001-91 | Sim |
| 9 | Florianópolis - Centro | Florianópolis, SC | 62.193.835/0001-62 | Sim |
| 10 | Goiânia - Alto da Glória | Goiânia, GO | 51.641.051/0001-33 | Sim |
| 11 | Goiânia - Setor Marista | Goiânia, GO | 54.436.408/0001-30 | Sim |
| 12 | Gramado - Gramado | Gramado, RS | 56.008.425/0001-00 | Sim |
| 13 | Juazeiro - Juá Garden | Juazeiro, BA | 61.936.112/0001-43 | Sim |
| 14 | Maceió - Jatiuca | Maceió, AL | 50.527.176/0001-74 | Sim |
| 15 | Manaus - Ponta Negra Shopping | Manaus, AM | 50.702.990/0001-88 | Sim |
| 16 | Maringá - Catuaí Shopping | Maringá, PR | 48.926.742/0001-79 | Sim |
| 17 | Mogi das Cruzes - Mogi Shopping | Mogi das Cruzes, SP | 64.775.462/0001-63 | Sim |
| 18 | Osasco - União de Osasco Shopping | Osasco, SP | 44.442.908/0008-05 | Sim |
| 19 | Parauapebas - Parauapebas | Parauapebas, PA | 50.227.991/0001-18 | Sim |
| 20 | Petrolina - Petrolina | Petrolina, PE | 60.423.435/0001-70 | Sim |
| 21 | Porto Alegre - Iguatemi Shopping | Porto Alegre, RS | 48.407.249/0001-42 | Sim |
| 22 | Porto Alegre - Pátio 24 | Porto Alegre, RS | 48.094.096/0001-20 | Sim |
| 23 | Porto Alegre - Praia de Belas Shopping | Porto Alegre, RS | 63.656.092/0001-82 | Sim |
| 24 | São José dos Campos - Jardim das Colinas | São José dos Campos, SP | 61.067.387/0001-98 | Sim |
| 25 | São José dos Pinhais | São José dos Pinhais, PR | 55.502.533/0001-63 | Sim |
| 26 | São Paulo - Butantã Shopping | São Paulo, SP | 44.442.908/0003-92 | Sim |
| 27 | São Paulo - Campo Limpo Shopping | São Paulo, SP | 44.442.908/0019-50 | Sim |
| 28 | São Paulo - Frei Caneca Shopping | São Paulo, SP | 44.442.908/0013-64 | Sim |
| 29 | São Paulo - Loja Conceito Vila Olímpia | São Paulo, SP | 44.442.908/0001-20 | Sim |
| 30 | São Paulo - Metrô Tatuapé Shopping | São Paulo, SP | 44.442.908/0012-83 | Sim |

Obs.: CNPJ raiz 44.442.908 = lojas próprias (matriz Vila Olímpia + filiais Osasco, Butantã, Campo Limpo, Frei Caneca, Tatuapé); demais CNPJs = franquias. Ordenação alfabética — unidades 31–42 (letras S–V e outras) estão na página 2 não capturada.

---

## 2. salons_salon.html — Minha Unidade (`/salons/salon`, unidade #1667 Belo Horizonte - Lourdes BH)

Formulário único (`salon[...]`) com **8 abas** (campo `tab_anchor` preserva a aba ativa no submit) e botão "Salvar Unidade":

1. **Dados básicos**: Nome, DDI/Telefone, WhatsApp, Razão Social, Tipo de documento (CPF/CNPJ*/CDC/NIF/NIPC/Outro), Número do documento, Endereço (CEP com autofill, Rua, Número, Complemento, Bairro, Cidade, Estado, País), Campos Customizados ("Tipo de loja": Loja Própria/Franquia), e **Configurações**: Controla estoque (ON), Controla caixa (off), Usar lista própria de produtos (ON), Gera comissões nas contas a pagar (ON), Gerar comissão p/ pagamentos com pontos de fidelidade (off), Limite fiscal (dias), Limite de quebra de caixa $ (0,00), Intervalo de tempo na agenda em minutos (10), Fuso horário (America/Sao_Paulo), Cálculo de comissão (Total bruto [valor total − desconto]* / Valor total), Integração com Shopping (billing_mode: Integrar Vendas / Integrar Execuções*), Moeda (R$*/€/$). Seção **Agendamento online**: Disponível p/ agendamento online (ON), Agrupamento no App ("Minas Gerais"), Imagem.
2. **Horários**: hora início/fim por dia da semana (seg–dom, campos timemask).
3. **Bloqueios**: conteúdo lazy-load via turbo-frame ("Carregando..." — bloqueios de agenda da unidade, não presentes no HTML capturado).
4. **Redes Sociais**: Facebook, Instagram, TikTok, LinkedIn, Twitter, Threads, YouTube, Pinterest, Website.
5. **Fotos**: Foto da capa do Site (750x400px), 3 fotos de destaque (topo/esquerda/direita), + tabela "Fotos Adicionais" (Foto | Descrição | Ordem | Ações, botão "Adicionar Foto").
6. **Comodidades**: 12 checkboxes — Ambiente climatizado, Wifi, Pet friendly, Acessibilidade, Estacionamento próprio, Estacionamento conveniado, Atende crianças, Espaço kids, Atendimento inclusivo, TV, Música ambiente, Transmissões esportivas.
7. **Cadastros básicos**: multi-selects vinculando à unidade — Formas de pagamento, Descontos, Pacotes, Planos de Assinatura (é aqui que se controla o que cada unidade vende/aceita).
8. **Notas Fiscais (NFSe)**: Emitir automaticamente (Não emitir / Ao finalizar OS de execução* / Ao finalizar OS de venda), Emissão com confirmação pelo usuário (off), Lei do Salão Parceiro (Não aplicável / Com / Sem dedução na base), IBS/CBS (Classificação Tributária + Código Indicador da Operação — campos da reforma tributária), Alíquotas PIS (1,65%) / COFINS (7,60%), Tributos aproximados Federal/Estadual/Municipal (%), Observação padrão, e **Controle de emissão**: emitir com endereço da unidade quando endereço do cliente inválido, emitir sem cliente quando documento inválido, CPF padrão quando CPF inválido. Extras: certificado digital (expira 27/08/2026, botão "Atualizar certificado") e "Série, RPS e Lote" (`/salon_invoice_configs/454/edit_invoice_numbering`).

---

## 3. organizations.html — Minha conta (`/organizations`, org #103 "Laser&Co")

Formulário `organization[...]` com **4 abas** e botão "Salvar Organização":

1. **Dados básicos**: Nome (Laser&Co), Tema de cores (skin: 12 opções, atual Azul Claro), Subdomínio .bemp.app (laserco), Validade dos pontos de fidelidade em meses (18), Informar usuário que vendeu a OS (Não informar / não obrigatório / **obrigatório***). **Configurações de OS** — Regras p/ fechamento: cliente não pode ficar em branco (ON), cliente precisa ser verificado (ON), sem pendência financeira (ON), sem pendência de contrato (ON); Regra p/ abertura: sem pendência de contrato (ON). **Funcionalidades** (plan_form): Crédito e débito (fiado) para clientes (off). **Configurações Gerais**: Logo (JPEG/PNG máx 1MB) e Logotipo NFS-e.
2. **Agendamento online** (remote_schedule_config): Minutos antes do horário (0), Minutos antes p/ cancelar (5), Google Tag Manager, Dias p/ agendamento futuro (32), Limitar agendas simultâneas por (Serviço*/Quantidade) + limite (0), Bloquear cliente inadimplente (ON), Agrupamento por região (ON), Ocultar profissional (ON), Agendamento sem preferência de profissional (off), Exibir valor total (ON), Limite de serviços por agendamento (3). **Modelo de Site**: Somente agendamento (Antigo) vs Site completo (Novo), cores primária/secundária, modo escuro (off), solicitar login ao final (ON), tema da landing (Claro/Escuro), logo da landing. **Aplicativo**: QR Code p/ download + "Link inteligente" com botão Copiar. **Agendamento via Google** (Reserve with Google): Ativo (ON), aviso de propagação em até 24h.
3. **Faturas**: lazy-load (turbo-frame "Carregando..." — faturas da assinatura BEMP).
4. **Dados contratuais**: Razão Social (Laser Company Brasil LTDA), Tipo de documento (CPF/CNPJ*), CNPJ 44.442.908/0001-20, E-mail (financeiro@lasercompany.com), DDI/Telefone, Endereço completo (São Paulo), + tabela de contratos BEMP: Nome do contrato | Data criação | Data do aceite | Status — 1 registro: "CONTRATO DE LICENÇA DE USO DE SOFTWARE" (12/06/2026).

---

## 4. customer_channels.html — Origens de Cliente (`/customer_channels`)

Colunas Nome | Ativo; filtros Nome (`q[name_cont]`) + Ativo (`q[active_true]`); Novo, Pesquisar, Exportar; linha → edit. **8 origens (todas ativas)**:
1. Facebook
2. Geolocalização
3. Google
4. Indicação
5. Instagram
6. Loja física
7. Outros
8. Parcerias

---

## 5. cancellation_reasons.html — Motivos de cancelamento (`/cancellation_reasons`)

Mesmo padrão (Nome | Ativo; filtros nome+ativo; Novo/Exportar). **4 motivos (todos ativos)**:
1. Cancelado via App
2. Cancelado via WhatsApp
3. Cliente cancelou
4. Cliente reagendou

---

## 6. customer_contract_templates.html — Modelos de contrato (`/customer_contract_templates`)

Colunas: **Nome do modelo | Quando o contrato é emitido | Enviar por e-mail contrato para assinatura | Ativo**. Filtros nome+ativo; Novo (sem Exportar). O gatilho "Quando emitido" liga o modelo ao tipo de venda (Assinaturas / Créditos em Dinheiro / Pacotes / Serviços) e há envio automático por e-mail p/ assinatura. **7 modelos (todos ativos, todos com envio por e-mail)**:
1. Contrato Laser&Club - Plano Bronze - Depilação - Sem adesão — Assinaturas
2. Contrato Laser&Club - Plano Prata - Rejuvenescimento Facial - Sem adesão — Assinaturas
3. Contrato Laser&Club - Plano Prata - Rejuvenescimento Facial — Assinaturas
4. Contrato Laser&Club - Plano Bronze - Depilação — Assinaturas
5. Contrato Laser&Club - Plano Ouro - PDRN — Assinaturas
6. Contrato Laser&Club - Plano Ouro - PDRN - Sem adesão — Assinaturas
7. Contrato de Prestação de Serviços Laser & Co — Créditos em Dinheiro, Pacotes, Serviços

---

## 7. service_groups.html — Grupo de serviços (`/service_groups`)

Padrão Nome | Ativo. **3 grupos (todos ativos)**: Depilação, Estético, Ultrassom.

---

## 8. product_groups.html — Grupo de produtos (`/product_groups`)

Mesmo padrão Nome | Ativo, filtros nome+ativo, Novo/Exportar. **0 registros** (lista vazia — produtos não agrupados).

---

## 9. messages.html — Mensagens (`/messages`)

Disparo de mensagens em massa (push/app) para audiências. Colunas: **Título | Tipo de mensagem | Audiências | Automação | Status | Data para envio | Enviado em | Alcance** (alcance = entregues/total, ex. "947/1.107"). Filtros: Título (`q[subject_cont]`), Tipo (`q[message_type_eq]`: Operacional, Marketing, Promoção, Lembrete, Outro), Status (`q[status_eq]`: Rascunho, Agendado, Estimando, Enviando, Enviado, Cancelado — ciclo de vida do disparo), Audiência (`q[audiences_id_eq]`), Enviado depois de/antes de (`q[sent_at_datetime_gteq/lteq]`). Novo, Pesquisar, Exportar. **29 registros** (nenhum vinculado a Automação):

| Título | Tipo | Audiência | Status | Data envio | Alcance |
|---|---|---|---|---|---|
| Teste | Marketing | Teste BV | Enviado | 25/06/2025 | 1/1 |
| Teste | Marketing | BV | Rascunho | 24/06/2025 | 0/0 |
| Teste | Outro | Teste | Rascunho | 24/06/2025 | 0/0 |
| PROMOÇÃO FECHA MÊS | Promoção | Primeiro Teste BEMP 1000 leads Conceito/Moema | Enviado | 29/04/2025 | 1/1 |
| Ultraformer Full Face a R$ 1.999,00 só p/ cliente especial - PROMO ATÉ 20/10 | Promoção | Oferta Full Face p/ quem fez Reju Facial - Todas Próprias | Rascunho | 18/10/2023 | 0/0 |
| Rejuvenescimento das mãos a Laser. | Marketing | Todos os clientes verificados e com pacotes - Próprias | Enviado | 15/05/2023 | 947/1.107 |
| Ei, ficou sabendo? POR TEMPO LIMITADO. | Marketing | idem | Enviado | 13/05/2023 | 948/1.108 |
| No mês das Mães com até 80% OFF. | Marketing | idem | Enviado | 11/05/2023 | 954/1.110 |
| No mês das Mães tem com até 80% OFF. | Marketing | idem | Cancelado | 11/05/2023 | 0/0 |
| Ei, psiu! Tem promoção do mês das mães no ar. | Marketing | idem | Enviado | 09/05/2023 | 948/1.104 |
| Personalize o seu combo! Por tempo limitado! | Marketing | idem | Enviado | 17/04/2023 | 865/1.002 |
| 2 pacotes da sua escolha por 12x de R$99,90 S/ Juros! | Marketing | idem | Enviado | 08/04/2023 | 845/964 |
| COMPROU, GANHOU! | Marketing | idem | Enviado | 16/03/2023 | 532/626 |
| COMPROU, GANHOU! | Marketing | idem | Enviado | 15/03/2023 | 534/627 |
| Black Friday com até 80% OFF + R$1.000,00 de CashBack! | Marketing | idem | Enviado | 23/11/2022 | 376/445 |
| Black Friday com descontos de até 80% OFF! | Marketing | idem | Enviado | 04/11/2022 | 354/417 |
| BLACK FRIDAY ANTECIPADA! Aproveite agora mesmo! | Promoção | idem | Enviado | 24/10/2022 | 341/395 |
| Outubro Rosa em parceria com Orienta Vida! | Promoção | idem | Enviado | 04/10/2022 | 302/357 |
| Sua última chance de garantir! | Marketing | idem | Rascunho | 07/10/2022 | 0/0 |
| Acumule pontos e troque por procedimentos! | Marketing | idem | Enviado | 02/11/2022 | 278/335 |
| Já ouviu falar de cirurgia sem cortes?! | Marketing | idem | Enviado | 03/10/2022 | 290/345 |
| Restam poucas horas para aproveitar! 70% OFF! | Promoção | idem | Enviado | 30/09/2022 | 290/345 |
| Último dia para garantir 70% OFF! | Promoção | idem | Enviado | 30/09/2022 | 293/345 |
| 70% OFF em TODOS os procedimentos estéticos! | Promoção | idem | Enviado | 27/09/2022 | 296/341 |
| Lembrete: Último dia para agendar meu presente! | Promoção | idem | Enviado | 18/09/2022 | 271/308 |
| Só esse Domingo! Presente especial para você! | Promoção | idem | Enviado | 17/09/2022 | 272/308 |
| Dia do cliente: sorteio no instagram, corre para participar! | Promoção | idem | Enviado | 15/09/2022 | 269/304 |
| ULTRAFORMER DAY | Promoção | Clientes das próprias que gastaram mais de 1k | Enviado | 11/05/2022 | 25/29 |
| NÃO PERCA AS PROMOS DE INAUGURAÇÃO | Promoção | Todos os clientes verificados e com pacotes - Próprias | Enviado | 29/12/2021 | 2/2 |

Uso real: campanhas 2021–2023 (alcance até ~950 clientes), retomado em 2025 só para testes. "idem" = "Todos os clientes verificados e com pacotes - Próprias".

---

## 10. audiences.html — Audiências (`/audiences`)

Padrão Nome | Ativo, filtros nome+ativo (ativo marcado por padrão), Novo/Exportar. **0 registros exibidos** ("Nenhum registro encontrado") — porém as mensagens referenciam várias audiências (Teste BV, BV, Teste, "Todos os clientes verificados e com pacotes - Próprias", "Clientes das próprias que gastaram mais de 1k", etc.), ou seja, as audiências existem mas estão **inativas** (o filtro padrão active=true as esconde). Audiência = segmento de clientes usado como alvo das Mensagens/Automações.

---

## 11. message_automations.html — Automações (`/message_automations`)

Colunas: **Descrição | Título | Recorrência | Último envio | Próximo envio** — mensagens recorrentes/automatizadas agendadas. Filtros: Descrição (`q[description_cont]`) + Ativo (`q[active_true]`). Novo, Pesquisar, Exportar. **0 registros** — recurso não utilizado pela Laser&Co (coerente com a coluna "Automação" sempre vazia em Mensagens).

---

## 12. exports.html — Exportações (`/exports`)

Fila/histórico de exportações geradas pelos botões "Exportar" das outras telas (geração assíncrona em background). Colunas: **Data | Relatório | Arquivo** (link de download com tamanho). Sem filtros, sem botão Novo. **1 registro**: 10/07/2026 19:10 — "Faturamento Excel (.xlsx)" — Download (5,66 KB) via `/exports/156552/file`.

---

## Observações transversais

- Toda tela tem topbar com "Editar perfil" (`/mandatory_task/profile/edit`) e "Sair".
- Ordenação por clique no `<th>` (links `q[s]=coluna+asc`).
- Soft-delete universal: cadastros básicos têm flag Ativo em vez de exclusão; filtro padrão esconde inativos.
- Multitenant: org (Minha conta) → unidades (salons); "Editar" em Todas unidades troca a unidade ativa da sessão (Topbar.setSalon) e reusa a mesma tela Minha Unidade.
- Campos customizados por entidade (custom_field 2474 "Tipo de loja" em salons) — mecanismo genérico de metadados.
