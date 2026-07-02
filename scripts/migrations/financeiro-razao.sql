-- ============================================================================
-- FINANCEIRO — Núcleo contábil (razão único) + RPCs derivadas — Laser&Co
-- Versiona o que foi aplicado no lkii via Management API (antes só existia no
-- banco — apontado pelo code-review). Idempotente: pode rodar de novo.
-- Arquitetura: produtores lançam em fin_lancamento (porta única postLancamento);
-- DRE/Fluxo/A Receber/A Pagar DERIVAM do razão — o número bate em toda tela.
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

-- ── Razão (ledger) — fonte única da verdade financeira ──
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

-- plano de contas (DRE) — curado do material do cliente
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
-- RPCs — agregações no servidor (PostgREST bloqueia aggregate no REST)
-- ============================================================================

-- Faturamento real (BEMP) por salon no período
create or replace function public.fin_faturamento_por_salon(p_ini date, p_fim date)
returns table(salon integer, faturamento numeric) language sql stable as $$
  select bemp_salon_id::int as salon, coalesce(sum(total),0)::numeric as faturamento
  from bemp_billings
  where data >= p_ini and data < p_fim and bemp_salon_id is not null
  group by bemp_salon_id
$$;

-- Faturamento por salon e tipo de venda (entity → conta de receita)
create or replace function public.fin_faturamento_por_salon_entidade(p_ini date, p_fim date)
returns table(salon integer, entidade text, total numeric) language sql stable as $$
  select bemp_salon_id::int, entity, sum(total)::numeric
  from bemp_billings
  where data >= p_ini and data < p_fim and bemp_salon_id is not null and total > 0
  group by bemp_salon_id, entity
$$;

-- Última competência apurada no razão (default do seletor do DRE)
create or replace function public.fin_ultima_competencia()
returns date language sql stable as $$ select max(competencia) from fin_lancamento $$;

-- DRE por competência e escopo (consolidado | franqueadora | unidades).
-- Suspenso PERMANECE (competência/regime de exercício); cancelado sai.
create or replace function public.fin_dre(p_ini date, p_fim date, p_escopo text default 'consolidado')
returns table(grupo text, natureza text, conta text, ordem integer, total numeric) language sql stable as $$
  select coalesce(pc.grupo,'Outros'), pc.natureza, pc.nome, min(pc.ordem)::int, sum(l.valor)::numeric
  from fin_lancamento l
  join plano_conta pc on pc.id = l.plano_conta_id
  left join centro_custo cc on cc.id = l.centro_custo_id
  where l.competencia >= p_ini and l.competencia < p_fim
    and l.status <> 'cancelado'
    and (p_escopo='consolidado'
      or (p_escopo='franqueadora' and cc.tipo='rede')
      or (p_escopo='unidades' and coalesce(cc.tipo,'unidade') <> 'rede'))
  group by pc.grupo, pc.natureza, pc.nome
$$;

-- Fluxo de caixa mensal por data efetiva (caixa > prevista > competência), com escopo.
-- Suspenso NÃO anda o caixa (pedido do cliente: visível mas fora do fluxo).
create or replace function public.fin_fluxo(p_ini date, p_fim date, p_escopo text default 'consolidado')
returns table(mes date, entradas numeric, saidas numeric) language sql stable as $$
  select date_trunc('month', coalesce(l.data_caixa, l.data_prevista, l.competencia))::date,
         coalesce(sum(l.valor) filter (where l.natureza='receita'),0)::numeric,
         coalesce(sum(l.valor) filter (where l.natureza='despesa'),0)::numeric
  from fin_lancamento l
  left join centro_custo cc on cc.id = l.centro_custo_id
  where coalesce(l.data_caixa, l.data_prevista, l.competencia) >= p_ini
    and coalesce(l.data_caixa, l.data_prevista, l.competencia) < p_fim
    and l.status not in ('cancelado','suspenso')
    and (p_escopo='consolidado'
      or (p_escopo='franqueadora' and cc.tipo='rede')
      or (p_escopo='unidades' and coalesce(cc.tipo,'unidade') <> 'rede'))
  group by 1
$$;

-- KPIs do fluxo por status (a receber/recebido/vencido/a pagar/pago), com escopo.
create or replace function public.fin_fluxo_resumo(p_escopo text default 'consolidado')
returns table(a_receber numeric, recebido numeric, vencido numeric, a_pagar numeric, pago numeric) language sql stable as $$
  select
    coalesce(sum(valor) filter (where natureza='receita' and status='previsto'),0)::numeric,
    coalesce(sum(valor) filter (where natureza='receita' and status in ('realizado','conciliado')),0)::numeric,
    coalesce(sum(valor) filter (where natureza='receita' and status='previsto' and data_prevista < current_date),0)::numeric,
    coalesce(sum(valor) filter (where natureza='despesa' and status='previsto'),0)::numeric,
    coalesce(sum(valor) filter (where natureza='despesa' and status in ('realizado','conciliado')),0)::numeric
  from fin_lancamento l
  left join centro_custo cc on cc.id = l.centro_custo_id
  where l.status <> 'cancelado'
    and (p_escopo='consolidado'
      or (p_escopo='franqueadora' and cc.tipo='rede')
      or (p_escopo='unidades' and coalesce(cc.tipo,'unidade') <> 'rede'))
$$;

-- Composição do "a receber" por conta do plano, com escopo.
create or replace function public.fin_fluxo_composicao(p_escopo text default 'consolidado')
returns table(conta text, total numeric) language sql stable as $$
  select pc.nome, sum(l.valor)::numeric
  from fin_lancamento l
  join plano_conta pc on pc.id = l.plano_conta_id
  left join centro_custo cc on cc.id = l.centro_custo_id
  where l.natureza='receita' and l.status='previsto'
    and (p_escopo='consolidado'
      or (p_escopo='franqueadora' and cc.tipo='rede')
      or (p_escopo='unidades' and coalesce(cc.tipo,'unidade') <> 'rede'))
  group by pc.nome
$$;

notify pgrst, 'reload schema';
