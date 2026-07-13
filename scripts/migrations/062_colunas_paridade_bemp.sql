-- 062 — Colunas de paridade com o BEMP (Serviços, Descontos, Planos)
-- Aplicada em 13/07/2026 (via Management API). Idempotente. Dados populados por scrape do BEMP web.

alter table public.servicos
  add column if not exists encaixe boolean default false,             -- "serviço de encaixe"
  add column if not exists agendamento_online boolean default false,  -- "disponível p/ agendamento online"
  add column if not exists ordem_app int;                             -- "ordem no app"

alter table public.descontos
  add column if not exists pct_servico numeric,   -- % desconto em serviço
  add column if not exists pct_produto numeric,   -- % desconto em produto
  add column if not exists pct_pacote numeric,    -- % desconto em pacote
  add column if not exists data_expiracao date;   -- validade do desconto (null = sem expiração)

alter table public.planos_assinatura
  add column if not exists modo_utilizacao text,  -- "modo de utilização" (regra de uso)
  add column if not exists tipo_comissao text;    -- "tipo de comissão" do plano
