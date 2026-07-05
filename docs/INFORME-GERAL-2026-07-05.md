# Informe Geral — Laser&Co Power System · 05/07/2026

> Estado do sistema por módulo (a divisão que o Rafael criou: Acompanhamento, Cadastros,
> Gestão, Administração, Rede & Conta), o que foi feito na madrugada de 04→05/07 e o que
> depende de decisão. Sistema no ar: laserco-power-system.vercel.app

## O que mudou hoje (04→05/07, madrugada)

**O sistema deixou de estar "zerado" — está alimentado com os dados reais do BEMP:**

| Dado | Volume | Período |
|---|---|---|
| Clientes | **352.589** (com CPF em 181.674 — o sync antigo não trazia) | base completa |
| Agendamentos (Agenda) | **155.785** | fev/2026 → futuros |
| Vendas BEMP (fonte do financeiro) | **210.287** | mar → jul/2026 |
| Financeiro apurado no razão | abril **R$ 4,37M** · maio **R$ 3,76M** · junho **R$ 2,20M** | + royalties gerados por mês |
| Serviços | 148 · Pacotes 552 (preço = média real cobrada) · Produtos 11 | catálogo |
| Financeiro das unidades (/contas) | 12.944 lançamentos | histórico |

## Por módulo

### 1. Acompanhamento
- **Dashboard**: alimentada (agendamentos/f faturamento reais). Metas dependem do cadastro de metas.
- **Agenda**: 155,8 mil agendamentos reais; botão **"Sincronizar BEMP"** no lugar do atualizar
  solto — puxa para a agenda o que chegou do BEMP e mostra "dados até \<data\>".
  Profissionais de teste (Lucas/usuário teste) removidos.
- **OS**: as vendas/comandas do BEMP (orders) estão na base; a tela de OS deriva dos dados
  reais. Planilha do Julio não é mais necessária para isso.

### 2. Cadastros
- Clientes 352,6 mil · Serviços · Pacotes · Produtos — tudo do BEMP.
- **Colaboradores**: teste removidos; sobrou a Adriana (real). **Decisão pendente**: importar
  os 631 ativos do BEMP exige CPF e data de admissão (o BEMP não tem esses campos) — importa
  mesmo assim incompleto, ou deixa o RH cadastrar aos poucos?
- **Perfis de acesso**: os 17 perfis seedados. O "Supervisor" que parecia duplicado NÃO é:
  "Supervisor SAC" é **cargo** (em uso pela Liliane) e "Supervisor" é **perfil de acesso**
  (modelo Perfis × Cargos que definimos — o cargo aponta pro perfil).

### 3. Gestão (SAC, CRM, Leads)
- **SAC**: só Alessandra Gonçalves e Liliane como atendentes (9 contas de teste apagadas;
  nome da Alessandra corrigido). IA atendendo e abrindo chamados.
- **Reembolsos ligados de ponta a ponta**: os 4 chamados com valor (R$ 2.035,48 — o painel
  mostrava "R$ 2.035" que foi lido como 202.035) agora aparecem em SAC → Pagamentos como
  pendentes E no financeiro da franqueadora como despesa prevista. Fase → "Em pagamento".
- **Leads do site no WhatsApp**: IA reinstruída (v1.1) — promoção/agendamento/cortesia/avaliação
  NUNCA mais "volte ao site"; ela coleta nome+telefone+cidade, abre chamado com o motivo novo
  ("Promoção do site", "Agendamento (site)", "Cortesia/Brinde", "Avaliação gratuita") e
  transfere só para a atendente indicar a franquia.
- **Fila offline** (pergunta do Julio): hoje, atendente offline não recebe distribuição e o
  chamado fica na fila; a IA continua o primeiro atendimento. Horário-padrão de auto-offline:
  **pendente de definição** (confirmar com as meninas o horário comercial do SAC).

### 4. Administração (Financeiro franqueadora)
- **Checkbox "Franquias" OCULTADO** no DRE e no Fluxo (flag no código — se o Rafael mudar de
  ideia, liga de volta em 1 linha). Visão = Franqueadora + Lojas próprias.
- DRE estruturado (Receita bruta → Custos → Lucro bruto → Despesas → Resultado, AV%, visão anual).
- Lançamento de teste "Aluguel R$ 100 / 2027" removido (era teste de sábado).
- "Recebido zerado": correto — royalties de abr/mai/jun estão gerados e **em aberto**; ninguém
  deu baixa ainda. Quando o financeiro registrar os pagamentos (ou o retorno do banco), o
  Recebido preenche. NÃO é dado faltando.
- **Conciliação bancária**: pronta (import de extrato Excel de qualquer banco + cruzamento
  automático). Falta SÓ saber **qual é o banco** do Rafael p/ ajustar o padrão do arquivo.

### 5. Rede & Conta
- Jurídico/Auditoria/Minha conta: seguem o HTML de referência; régua de cobrança configurável
  (etapas livres) com disparos marcados "em construção".
- App do cliente: fora do escopo atual (etapas a desenhar).

## Decisões pendentes (com dono)

1. **% imposto/comissão/taxa** → contador preenche em Config (o DRE avisa onde).
2. **Lojas próprias** → marcar em Config → Royalties por unidade.
3. **Banco** (boleto real + conciliação) → Rafael informa o banco/convênio.
4. **Colaboradores 631 do BEMP** → importar incompleto ou cadastrar aos poucos?
5. **Fotos/anamneses** → robô pronto; falta o LOGIN do app web do BEMP.
6. **Horário do SAC** (auto-offline + mensagem fora do horário) → confirmar com as atendentes.
7. **Sults** → sugestões da Liliane aguardam OK do Rafael (Julio confirma).
