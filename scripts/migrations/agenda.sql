-- ============================================================================
-- Módulo: Agenda  Eventos da rede (banda de eventos no topo da agenda)
-- Paridade com o legado: REDE_EVENTOS / EVT_TYPES / renderRede / saveEvt
--   (legacy/index.html L9591-9627). No legado os eventos são MOCK em memória;
--   aqui viram tabela real, multi-tenant por empresa, lidos por DATA na agenda.
-- Eventos NÃO bloqueiam horário (só aparecem na banda informativa do dia).
-- Aplicar este arquivo no projeto lkii (Supabase) antes de usar a banda.
-- ============================================================================

create table if not exists public.rede_eventos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  -- null = evento da rede inteira (todas as unidades da empresa);
  -- preenchido = evento específico de uma unidade.
  unidade_id    uuid references public.unidades(id) on delete cascade,
  titulo        text not null,
  -- Espelha EVT_TYPES do legado: 'Treinamento online' | 'Treinamento presencial'
  --   | 'Reunião da rede' | 'Evento' | 'Inauguração'
  tipo          text not null default 'Evento',
  data          date not null,
  hora_inicio   text,                       -- "HH:MM" (texto, igual ao legado)
  hora_fim      text,
  -- link da reunião OU endereço presencial (legado usa o mesmo campo "link")
  link          text,
  -- direcionamento/audiência (legado: ['Rede própria','Franquias',...])
  audiencia     text[] not null default '{}',
  criado_por    uuid references public.perfis_usuario(id),
  criado_em     timestamptz not null default now()
);

create index if not exists rede_eventos_empresa_data_idx
  on public.rede_eventos (empresa_id, data);
create index if not exists rede_eventos_unidade_idx
  on public.rede_eventos (unidade_id);

alter table public.rede_eventos enable row level security;

-- Leitura: qualquer usuário autenticado da empresa enxerga os eventos da rede.
-- (A empresa do usuário é resolvida via perfis_usuario → unidades → empresa_id.)
drop policy if exists rede_eventos_sel on public.rede_eventos;
create policy rede_eventos_sel on public.rede_eventos
  for select to authenticated
  using (
    empresa_id in (
      select u.empresa_id
      from public.unidades u
      join public.perfis_usuario p on p.unidade_id = u.id
      where p.id = auth.uid()
    )
    or exists (
      select 1 from public.perfis_usuario p
      where p.id = auth.uid() and p.papel = 'admin_geral'
    )
  );

-- Escrita: somente admin_geral/gestor/operacoes da empresa (publicar eventos).
drop policy if exists rede_eventos_ins on public.rede_eventos;
create policy rede_eventos_ins on public.rede_eventos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.perfis_usuario p
      where p.id = auth.uid()
        and p.papel in ('admin_geral', 'gestor', 'operacoes')
    )
  );

drop policy if exists rede_eventos_del on public.rede_eventos;
create policy rede_eventos_del on public.rede_eventos
  for delete to authenticated
  using (
    exists (
      select 1 from public.perfis_usuario p
      where p.id = auth.uid()
        and p.papel in ('admin_geral', 'gestor', 'operacoes')
    )
  );

-- Seed opcional (espelha REDE_EVENTOS do legado). Comente se não quiser dados de exemplo.
-- insert into public.rede_eventos (empresa_id, titulo, tipo, data, hora_inicio, hora_fim, link, audiencia)
-- select e.id, 'Convenção Laser&Co 2026', 'Evento', current_date, '08:00', '18:00',
--        'Centro de Convenções', array['Todos']
-- from public.empresas e limit 1;
