-- 063 — Colunas para os filtros de paridade com o BEMP (OS, Clientes, Agendamentos)
-- Aplicada em 13/07/2026 (via Management API). Idempotente.
-- Abordagem "preparar o sistema para receber o dado": as colunas ficam prontas com os
-- filtros; quando o sync do BEMP trouxer os valores, populam sem mudar código.

-- ── OS: forma de pagamento DENORMALIZADA (evita join em runtime nas 210k vendas) ──
alter table public.os add column if not exists forma_pagamento text;
create index if not exists idx_billings_order on public.bemp_billings (bemp_order_id);
-- backfill: forma predominante por ordem (executado uma vez; reexecução é idempotente)
update public.os o set forma_pagamento = sub.pt
from (
  select bemp_order_id, mode() within group (order by payment_type) as pt
  from public.bemp_billings where bemp_order_id is not null group by bemp_order_id
) sub
where o.bemp_id = sub.bemp_order_id and o.forma_pagamento is distinct from sub.pt;
create index if not exists idx_os_forma_pgto on public.os (forma_pagamento);

-- ── Clientes: preparar p/ receber (bloqueado, com app) ──
alter table public.clientes
  add column if not exists bloqueado boolean default false,
  add column if not exists tem_app boolean default false;
create index if not exists idx_clientes_bloqueado on public.clientes (bloqueado) where bloqueado = true;

-- ── Agendamentos: "agendou pelo SAC" ──
alter table public.agendamentos add column if not exists via_sac boolean default false;
