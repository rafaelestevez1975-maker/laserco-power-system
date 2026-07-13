-- 061 — Metas (catálogo estilo BEMP) + Configuração da organização (Minha Conta)
-- Aplicada em 13/07/2026 (via Management API). Idempotente.

-- ── Metas: listagem de metas cadastradas (indicador × ciclo × valor), como o BEMP ──
create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default '00000000-0000-0000-0000-000000000001',
  unidade_id uuid references public.unidades(id) on delete set null,
  nome text not null,
  indicador text not null default 'faturamento',   -- agendamentos|atendimentos|faturamento_bruto|faturamento_valor|vendas
  ciclo text not null default 'mensal',             -- mensal|semanal
  valor numeric not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.metas enable row level security;
drop policy if exists metas_all on public.metas;
create policy metas_all on public.metas for all using (true) with check (true);

-- ── Config da organização: espelha "Minha conta" do BEMP ──
create table if not exists public.organizacao_config (
  empresa_id uuid primary key default '00000000-0000-0000-0000-000000000001',
  nome text default 'Laser&Co',
  tema text default 'roxo',                          -- azul_claro|roxo|dourado|escuro
  subdominio text default 'laserco',
  validade_pontos_meses int default 18,
  informar_vendedor_os text default 'obrigatorio',   -- obrigatorio|opcional|nao
  bloquear_inadimplente boolean default true,
  agendamento_online boolean default true,
  razao_social text default 'Laser Company Brasil LTDA',
  cnpj text default '44.442.908/0001-20',
  atualizado_em timestamptz
);
alter table public.organizacao_config enable row level security;
drop policy if exists orgcfg_sel on public.organizacao_config;
create policy orgcfg_sel on public.organizacao_config for select using (true);
drop policy if exists orgcfg_upd on public.organizacao_config;
create policy orgcfg_upd on public.organizacao_config for all
  using ((select public.papel_atual()) = 'admin_geral'::papel_usuario)
  with check ((select public.papel_atual()) = 'admin_geral'::papel_usuario);
insert into public.organizacao_config (empresa_id)
  values ('00000000-0000-0000-0000-000000000001') on conflict do nothing;
