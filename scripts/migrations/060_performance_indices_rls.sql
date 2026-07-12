-- 060 — Performance: índices nas tabelas grandes + correção da RLS de clientes
-- Aplicada em 12/07/2026 (via Management API) e registrada aqui para versionamento.
-- Motivo: telas Clientes/OS mostravam "0 registros" — as consultas estouravam o
-- statement timeout (erro 57014) por: (a) falta de índice em colunas de ordenação/busca;
-- (b) a RLS de SELECT de clientes chamava tem_acesso_cliente_final() POR LINHA nas ~350k
-- (Seq Scan), ignorando os índices. Tudo idempotente e sem DROP de dado.

-- ── Extensão para busca por substring (ILIKE '%x%') via índice ──
create extension if not exists pg_trgm;

-- ── clientes (~352k linhas) ──
create index if not exists idx_clientes_nome        on public.clientes (nome);
create index if not exists idx_clientes_ativo_nome  on public.clientes (ativo, nome);
create index if not exists idx_clientes_criado_em   on public.clientes (criado_em desc);
create index if not exists idx_clientes_cpf         on public.clientes (cpf);
create index if not exists idx_clientes_uni_origem  on public.clientes (unidade_origem_id);
create index if not exists idx_clientes_nome_trgm   on public.clientes using gin (nome gin_trgm_ops);
create index if not exists idx_clientes_tel_trgm    on public.clientes using gin (telefone gin_trgm_ops);
create index if not exists idx_clientes_cpf_trgm    on public.clientes using gin (cpf gin_trgm_ops);

-- ── os (~70k) e agendamentos (~175k) e billings (~210k) ──
create index if not exists idx_os_criado_em    on public.os (criado_em desc);
create index if not exists idx_os_uni_criado   on public.os (unidade_id, criado_em desc);
create index if not exists idx_os_cliente      on public.os (cliente_id);
create index if not exists idx_ag_inicio       on public.agendamentos (inicio);
create index if not exists idx_ag_uni_inicio   on public.agendamentos (unidade_id, inicio);
create index if not exists idx_ag_status       on public.agendamentos (status);
create index if not exists idx_colab_nome      on public.colaboradores (nome);
create index if not exists idx_billings_data   on public.bemp_billings (data);

-- ── RLS de clientes: avaliar a função de acesso UMA VEZ por consulta ──
-- tem_acesso_cliente_final()/papel_atual() não dependem da linha (só do usuário atual).
-- Sem o (select ...), o Postgres as executava por-linha nas 350k → Seq Scan de 40s.
-- Envolver num subselect escalar faz virar InitPlan (avaliado 1x) e libera os índices.
-- Padrão recomendado pela própria Supabase (RLS performance).
alter policy clientes_sel on public.clientes
  using ((select public.tem_acesso_cliente_final()));
alter policy clientes_upd on public.clientes
  using ((select public.tem_acesso_cliente_final()) and (select public.papel_atual()) <> 'gestor'::papel_usuario);
alter policy clientes_del on public.clientes
  using ((select public.papel_atual()) = 'admin_geral'::papel_usuario);
alter policy clientes_ins on public.clientes
  with check ((select public.tem_acesso_cliente_final()) and (select public.papel_atual()) <> 'gestor'::papel_usuario);

-- Atualiza estatísticas para o planner escolher os índices novos.
analyze public.clientes;
analyze public.os;
analyze public.agendamentos;
