-- 17/07: PERFORMANCE da busca de clientes + filtro por arquivos do BEMP.
--
-- 1) BUSCA LENTA (8,4s → 0,7s)
-- A busca da lista faz OR entre nome/email/cpf/telefone com ilike '%termo%'. nome, cpf e
-- telefone já tinham índice gin_trgm, mas o EMAIL não — e como basta UM ramo do OR sem
-- índice para o planner desistir do bitmap, ele caía num Index Scan em idx_clientes_nome
-- filtrando linha a linha:
--     Parallel Index Scan using idx_clientes_nome
--       Filter: (nome ~~* '%X%' OR email ~~* '%X%')
--       Rows Removed by Filter: 176348      <-- varria a tabela inteira
-- Com o trigram no email o plano vira BitmapOr dos trigrams (custo 10329 → 102).
create extension if not exists pg_trgm;
create index concurrently if not exists idx_clientes_email_trgm on clientes using gin (email gin_trgm_ops);

-- 2) FILTRO "clientes com fotos/contratos" sem join pesado
-- Contadores denormalizados na própria clientes + índices parciais → o filtro vira .gt()/.eq()
-- barato. Mantidos em dia por trigger em clientes_documentos.
alter table clientes
  add column if not exists total_documentos integer not null default 0,
  add column if not exists total_contratos integer not null default 0;

update clientes c
   set total_documentos = d.n, total_contratos = d.c
  from (select cliente_id, count(*) n, count(*) filter (where tipo = 'contrato') c
          from clientes_documentos group by cliente_id) d
 where d.cliente_id = c.id;

create index if not exists idx_clientes_tem_docs on clientes(total_documentos) where total_documentos > 0;
create index if not exists idx_clientes_tem_contratos on clientes(total_contratos) where total_contratos > 0;

create or replace function public.sync_cliente_docs_contador() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update clientes
       set total_documentos = total_documentos + 1,
           total_contratos  = total_contratos + (case when new.tipo = 'contrato' then 1 else 0 end)
     where id = new.cliente_id;
  elsif (tg_op = 'DELETE') then
    update clientes
       set total_documentos = greatest(0, total_documentos - 1),
           total_contratos  = greatest(0, total_contratos - (case when old.tipo = 'contrato' then 1 else 0 end))
     where id = old.cliente_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_cliente_docs_contador on clientes_documentos;
create trigger trg_cliente_docs_contador
  after insert or delete on clientes_documentos
  for each row execute function public.sync_cliente_docs_contador();
