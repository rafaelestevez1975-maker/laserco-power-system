-- ============================================================================
-- FINANCEIRO  Núcleo contábil (razão único) + RPCs derivadas  Laser&Co
-- Versiona o que foi aplicado no lkii via Management API (antes só existia no
-- banco  apontado pelo code-review). Idempotente: pode rodar de novo.
-- Arquitetura: produtores lançam em fin_lancamento (porta única postLancamento);
-- DRE/Fluxo/A Receber/A Pagar DERIVAM do razão  o número bate em toda tela.
-- ============================================================================

-- ── Centro de custo (unidade | escritorio | rede) ──
create table if not exists centro_custo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'unidade',
  unidade_id uuid references unidades(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ── Plano de contas (receita | custo | despesa), hierárquico por grupo ──
create table if not exists plano_conta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  codigo text,
  nome text not null,
  natureza text not null,
  grupo text,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

-- ── Razão (ledger)  fonte única da verdade financeira ──
create table if not exists fin_lancamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  centro_custo_id uuid references centro_custo(id) on delete set null,
  plano_conta_id uuid references plano_conta(id) on delete set null,
  conta_financeira_id uuid,
  natureza text not null,                    -- receita | despesa | transferencia
  competencia date not null,                 -- 1º dia do mês do FATO
  data_prevista date,
  data_caixa date,
  valor numeric not null check (valor >= 0),
  documento text,
  origem text not null,                      -- bemp|royalty|sac|folha|compra|taxa_cartao|manual|despesa_config
  origem_ref text,
  idem_key text,                             -- chave de idempotência (única)
  historico text,
  status text not null default 'previsto',   -- previsto|realizado|conciliado|cancelado|suspenso
  usuario_id uuid,
  criado_em timestamptz not null default now()
);
create unique index if not exists ux_fin_lancamento_idem on fin_lancamento(idem_key) where idem_key is not null;
create index if not exists ix_fin_lancamento_comp on fin_lancamento(competencia);
create index if not exists ix_fin_lancamento_centro on fin_lancamento(centro_custo_id);
create index if not exists ix_fin_lancamento_origem on fin_lancamento(origem);

-- RLS: leitura por autenticado (gate real por papel no código); escrita via service role.
alter table centro_custo enable row level security;
alter table plano_conta enable row level security;
alter table fin_lancamento enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname='cc_read') then
    create policy cc_read on centro_custo for select to authenticated using (true); end if;
  if not exists (select 1 from pg_policy where polname='pc_read') then
    create policy pc_read on plano_conta for select to authenticated using (true); end if;
  if not exists (select 1 from pg_policy where polname='fl_read') then
    create policy fl_read on fin_lancamento for select to authenticated using (true); end if;
end $$;

-- ── Sub-livro ↔ razão: recebível aponta seu lançamento (baixa concilia o caixa) ──
alter table fin_recebiveis add column if not exists lancamento_id uuid references fin_lancamento(id) on delete set null;

-- ── Regras de DESPESA configuráveis (o contador ajusta em Config; 0 = não lança) ──
alter table fin_config
  add column if not exists imposto_pct numeric not null default 0,
  add column if not exists imposto_regime text not null default 'Simples Nacional',
  add column if not exists comissao_pct numeric not null default 0,
  add column if not exists comissao_base text not null default 'faturamento',
  add column if not exists taxa_cartao_pct numeric not null default 0;

-- ── Royalty por unidade + regra automática de desconto (validação do CEO 02/07) ──
-- Exceção por franquia (null = regra geral). Regra automática: faturamento < teto e
-- pagando em dia (sem recebível atrasado) → desconto no royalty (ex.: 10% vira 5%).
alter table unidades
  add column if not exists royalty_pct_override numeric,
  add column if not exists venc_dia_override int,
  -- própria × franquia (CEO: só FRANQUIA paga royalty; segmenta o DRE como no legacy)
  add column if not exists tipo_loja text not null default 'franquia' check (tipo_loja in ('propria','franquia'));
alter table fin_config
  add column if not exists royalty_desc_ativo boolean not null default true,
  add column if not exists royalty_desc_teto numeric not null default 80000,
  add column if not exists royalty_desc_pct numeric not null default 50;

-- ── Seeds ──
-- centro de custo: um por unidade ativa + a rede (franqueadora)
insert into centro_custo (empresa_id, nome, tipo, unidade_id)
select u.empresa_id, u.nome, 'unidade', u.id
from unidades u
where u.ativa = true and coalesce(u.nome,'') not like '[INATIVA]%'
  and not exists (select 1 from centro_custo c where c.unidade_id = u.id);

insert into centro_custo (empresa_id, nome, tipo, unidade_id)
select id, 'Rede / Franqueadora', 'rede', null from empresas
where not exists (select 1 from centro_custo c where c.tipo='rede')
order by criada_em limit 1;

-- plano de contas (DRE)  curado do material do cliente
insert into plano_conta (empresa_id, codigo, nome, natureza, grupo, ordem)
select e.id, v.codigo, v.nome, v.natureza, v.grupo, v.ordem
from empresas e
cross join (values
  ('3.1.01','Receita de Serviços','receita','Receitas',1),
  ('3.1.02','Receita de Produtos','receita','Receitas',2),
  ('3.1.03','Receita de Pacotes','receita','Receitas',3),
  ('3.1.04','Receita de Assinaturas','receita','Receitas',4),
  ('3.1.05','Royalties (recebidos da rede)','receita','Receitas da Franqueadora',5),
  ('3.1.06','Fundo de marketing (recebido)','receita','Receitas da Franqueadora',6),
  ('4.1.01','Comissões','custo','Custos',10),
  ('4.1.02','Royalties (pagos pela unidade)','despesa','Custos',11),
  ('4.1.03','Fundo de marketing (pago)','despesa','Custos',12),
  ('4.1.04','Impostos sobre vendas','custo','Custos',13),
  ('4.1.05','Taxa de meio de pagamento','despesa','Despesas financeiras',14),
  ('4.2.01','Aluguel','despesa','Despesas administrativas',20),
  ('4.2.02','Salários e encargos','despesa','Despesas administrativas',21),
  ('4.2.03','Marketing','despesa','Despesas administrativas',22),
  ('4.2.04','Energia, Água e Telefone','despesa','Despesas administrativas',23),
  ('4.2.05','Reembolsos a clientes (SAC)','despesa','Despesas administrativas',24),
  ('4.2.99','Outras despesas','despesa','Despesas administrativas',99)
) as v(codigo,nome,natureza,grupo,ordem)
where e.id = '00000000-0000-0000-0000-000000000001'
  and not exists (select 1 from plano_conta p where p.codigo = v.codigo and p.empresa_id = e.id);

-- ── Respostas rápidas do SAC (barra "/" na Conversa) ──
create table if not exists sac_respostas_rapidas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid,
  atalho text not null,
  texto text not null,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
alter table sac_respostas_rapidas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polname='srr_read') then
    create policy srr_read on sac_respostas_rapidas for select to authenticated using (true); end if;
end $$;

-- ============================================================================
-- RPCs  agregações no servidor (PostgREST bloqueia aggregate no REST)
-- ============================================================================

-- Faturamento real (BEMP) por salon no período.
-- BASE = receita MENOS descontos (definição do CEO 02/07: "sempre faturamento bruto: receita
-- menos descontos"). No BEMP, `total` é o preço CHEIO e `desconto` o abatimento da venda.
create or replace function public.fin_faturamento_por_salon(p_ini date, p_fim date)
returns table(salon integer, faturamento numeric) language sql stable as $$
  select bemp_salon_id::int, coalesce(sum(total - coalesce(desconto,0)),0)::numeric
  from bemp_billings
  where data >= p_ini and data < p_fim and bemp_salon_id is not null and total > 0
  group by bemp_salon_id
$$;

-- Faturamento por salon e tipo de venda (entity → conta de receita)  mesma base líquida.
create or replace function public.fin_faturamento_por_salon_entidade(p_ini date, p_fim date)
returns table(salon integer, entidade text, total numeric) language sql stable as $$
  select bemp_salon_id::int, entity, sum(total - coalesce(desconto,0))::numeric
  from bemp_billings
  where data >= p_ini and data < p_fim and bemp_salon_id is not null and total > 0
  group by bemp_salon_id, entity
$$;

-- Última competência apurada no razão (default do seletor do DRE).
-- Ignora competências FUTURAS: um lançamento manual com vencimento distante (ex.: despesa
-- teste venc. 01/01/2027) criava competencia futura e "sequestrava" o DRE default para um
-- mês vazio (bug 03/07: "DRE está vazio" logo após apurar junho). Fallback = max geral.
-- Default = último mês COM RECEITA apurada (não só qualquer lançamento): um reembolso do SAC
-- (despesa) no mês corrente sem faturamento ainda não pode abrir o DRE num mês vazio
-- (bug 05/07: DRE abrindo julho com Receita bruta R$ 0). Fallback: max <= mês atual, depois max geral.
create or replace function public.fin_ultima_competencia()
returns date language sql stable as $$
  select coalesce(
    (select max(competencia) from fin_lancamento where natureza='receita' and competencia <= date_trunc('month', now())::date),
    (select max(competencia) from fin_lancamento where competencia <= date_trunc('month', now())::date),
    (select max(competencia) from fin_lancamento)
  )
$$;

-- Escopo COMPOSTO (Matheus/QA 03/07): p_escopo aceita lista separada por vírgula
-- (ex.: 'franqueadora,proprias' = financeiro da franqueadora SEM franquias, porque a
-- receita da franquia não é dinheiro da franqueadora  só o royalty é).
-- Retrocompatível: valores únicos ('consolidado', 'unidades', …) continuam valendo.
-- Lançamento com centro NULL cai no balde 'franquias' (tipo_loja default)  senão ele some de
-- TODA combinação de checkbox (review 04/07: R$105 da unidade INATIVA sem centro ficou invisível).
-- Invariante: franqueadora+proprias+franquias == consolidado, sem dupla contagem.
create or replace function public.fin_escopo_ok(p_escopo text, p_cc_tipo text, p_tipo_loja text)
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(string_to_array(coalesce(nullif(p_escopo,''),'consolidado'), ',')) e(esc)
    where trim(esc)='consolidado'
       or (trim(esc)='franqueadora' and p_cc_tipo='rede')
       or (trim(esc)='unidades' and coalesce(p_cc_tipo,'unidade') <> 'rede')
       or (trim(esc)='proprias' and p_tipo_loja='propria')
       or (trim(esc)='franquias' and coalesce(p_cc_tipo,'unidade') <> 'rede' and coalesce(p_tipo_loja,'franquia')='franquia')
  )
$$;

-- DRE por competência, escopo (simples ou composto) e opcionalmente UMA loja.
-- Suspenso PERMANECE (competência/regime de exercício); cancelado sai.
create or replace function public.fin_dre(p_ini date, p_fim date, p_escopo text default 'consolidado', p_unidade uuid default null)
returns table(grupo text, natureza text, conta text, ordem integer, total numeric) language sql stable as $$
  select coalesce(pc.grupo,'Outros'), pc.natureza, pc.nome, min(pc.ordem)::int, sum(l.valor)::numeric
  from fin_lancamento l
  join plano_conta pc on pc.id = l.plano_conta_id
  left join centro_custo cc on cc.id = l.centro_custo_id
  left join unidades u on u.id = cc.unidade_id
  where l.competencia >= p_ini and l.competencia < p_fim
    and l.status <> 'cancelado'
    and (p_unidade is null or cc.unidade_id = p_unidade)
    and fin_escopo_ok(p_escopo, cc.tipo, u.tipo_loja)
  group by pc.grupo, pc.natureza, pc.nome
$$;

-- DRE ANUAL (12 meses em colunas  pedido do QA): mesmas regras, agregado por mês.
create or replace function public.fin_dre_anual(p_ano integer, p_escopo text default 'consolidado', p_unidade uuid default null)
returns table(grupo text, natureza text, conta text, ordem integer, mes integer, total numeric) language sql stable as $$
  select coalesce(pc.grupo,'Outros'), pc.natureza, pc.nome, min(pc.ordem)::int,
         extract(month from l.competencia)::int, sum(l.valor)::numeric
  from fin_lancamento l
  join plano_conta pc on pc.id = l.plano_conta_id
  left join centro_custo cc on cc.id = l.centro_custo_id
  left join unidades u on u.id = cc.unidade_id
  where l.competencia >= make_date(p_ano,1,1) and l.competencia < make_date(p_ano+1,1,1)
    and l.status <> 'cancelado'
    and (p_unidade is null or cc.unidade_id = p_unidade)
    and fin_escopo_ok(p_escopo, cc.tipo, u.tipo_loja)
  group by pc.grupo, pc.natureza, pc.nome, extract(month from l.competencia)
$$;

-- Fluxo de caixa mensal por data efetiva (caixa > prevista > competência), com escopo.
-- Suspenso NÃO anda o caixa (pedido do cliente: visível mas fora do fluxo).
create or replace function public.fin_fluxo(p_ini date, p_fim date, p_escopo text default 'consolidado', p_unidade uuid default null)
returns table(mes date, entradas numeric, saidas numeric) language sql stable as $$
  select date_trunc('month', coalesce(l.data_caixa, l.data_prevista, l.competencia))::date,
         coalesce(sum(l.valor) filter (where l.natureza='receita'),0)::numeric,
         coalesce(sum(l.valor) filter (where l.natureza='despesa'),0)::numeric
  from fin_lancamento l
  left join centro_custo cc on cc.id = l.centro_custo_id
  left join unidades u on u.id = cc.unidade_id
  where coalesce(l.data_caixa, l.data_prevista, l.competencia) >= p_ini
    and coalesce(l.data_caixa, l.data_prevista, l.competencia) < p_fim
    and l.status not in ('cancelado','suspenso')
    and (p_unidade is null or cc.unidade_id = p_unidade)
    and fin_escopo_ok(p_escopo, cc.tipo, u.tipo_loja)
  group by 1
$$;

-- KPIs do fluxo por status (a receber/recebido/vencido/a pagar/pago), com escopo.
create or replace function public.fin_fluxo_resumo(p_escopo text default 'consolidado', p_unidade uuid default null)
returns table(a_receber numeric, recebido numeric, vencido numeric, a_pagar numeric, pago numeric) language sql stable as $$
  select
    coalesce(sum(valor) filter (where natureza='receita' and l.status='previsto'),0)::numeric,
    coalesce(sum(valor) filter (where natureza='receita' and l.status in ('realizado','conciliado')),0)::numeric,
    coalesce(sum(valor) filter (where natureza='receita' and l.status='previsto' and data_prevista < current_date),0)::numeric,
    coalesce(sum(valor) filter (where natureza='despesa' and l.status='previsto'),0)::numeric,
    coalesce(sum(valor) filter (where natureza='despesa' and l.status in ('realizado','conciliado')),0)::numeric
  from fin_lancamento l
  left join centro_custo cc on cc.id = l.centro_custo_id
  left join unidades u on u.id = cc.unidade_id
  where l.status <> 'cancelado'
    and (p_unidade is null or cc.unidade_id = p_unidade)
    and fin_escopo_ok(p_escopo, cc.tipo, u.tipo_loja)
$$;

-- Composição do "a receber" por conta do plano, com escopo.
create or replace function public.fin_fluxo_composicao(p_escopo text default 'consolidado', p_unidade uuid default null)
returns table(conta text, total numeric) language sql stable as $$
  select pc.nome, sum(l.valor)::numeric
  from fin_lancamento l
  join plano_conta pc on pc.id = l.plano_conta_id
  left join centro_custo cc on cc.id = l.centro_custo_id
  left join unidades u on u.id = cc.unidade_id
  where l.natureza='receita' and l.status='previsto'
    and (p_unidade is null or cc.unidade_id = p_unidade)
    and fin_escopo_ok(p_escopo, cc.tipo, u.tipo_loja)
  group by pc.nome
$$;

notify pgrst, 'reload schema';

-- Sincronização da AGENDA com o BEMP (botão "Sincronizar BEMP"  Julio 04/07).
-- Materializa o staging bemp_agendamentos → agendamentos; o staging é atualizado
-- pelo sync do servidor (scripts/sync-bemp-operacional.mjs).
create or replace function public.sincronizar_agendamentos_do_bemp()
returns integer language sql security definer set search_path = public as $$
  with ins as (
    insert into agendamentos (empresa_id, unidade_id, inicio, fim, status, origem, observacao, bemp_id, criado_em)
    select '00000000-0000-0000-0000-000000000001', u.id, b.inicio, b.fim,
      case b.status when 'Fechada' then 'concluido' when 'Cancelada' then 'cancelado' when 'Aberta' then 'aberto'
                    when 'Confirmada' then 'confirmado' when 'Em atendimento' then 'em_atendimento' else 'aberto' end::status_agendamento,
      'sistema', b.observacao, b.bemp_id, coalesce(b.criado_no_bemp_em, b.inicio)
    from bemp_agendamentos b join unidades u on u.bemp_salon_id = b.bemp_salon_id
    where not exists (select 1 from agendamentos a where a.bemp_id = b.bemp_id)
    returning 1)
  select count(*)::int from ins
$$;
revoke all on function public.sincronizar_agendamentos_do_bemp() from anon;
