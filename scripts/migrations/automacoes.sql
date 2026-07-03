-- ============================================================================
-- Módulo: Automações + Disparos WhatsApp
-- Paridade com o legado (legacy/index.html):
--   - AUTOS 3880-3910 (22 automações PADRÃO da rede) + renderAutos 3939-3971
--   - MENS_CUSTOM 3914 (mensagens PERSONALIZADAS por unidade)
--   - DISP_CAMPS 6536 / dispCampanhas 6615 / dispCampReport 6624 (campanhas)
--   - DISP_BASES 6529 / dispBases 6635 / segModal 6678 (bases & segmentos)
--   - VIP_GROUPS 6542 / dispVIP 6713 (Grupo VIP)
--
-- No legado tudo é MOCK em memória (persistState/localStorage). Aqui viram tabelas
-- reais, multi-tenant por empresa, escopo opcional por unidade.
--
-- O catálogo das 22 automações PADRÃO (texto/gatilho/ação/categoria) vive no código
-- (src/lib/automacoes.ts AUTOS_PADRAO)  espelho fiel do AUTOS do legado. Aqui só
-- persistimos o ESTADO por unidade (ativa/inativa) e as personalizadas.
--
-- Aplicar este arquivo no projeto lkii (Supabase) antes de usar as telas.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Estado das automações PADRÃO por unidade (usar / não usar)
--    Legado: switch por card (renderAutos 3967) grava por unidade.
--    Linha presente = override do default; ausência = usa o default do catálogo.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.automacoes_estado (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  -- chave da automação no catálogo (ex.: 'revenda_8m', 'boas_vindas')
  chave       text not null,
  ativa       boolean not null default true,
  atualizado_por uuid references public.perfis_usuario(id),
  atualizado_em  timestamptz not null default now(),
  unique (unidade_id, chave)
);
create index if not exists automacoes_estado_uni_idx on public.automacoes_estado (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Automações PERSONALIZADAS criadas por unidades / padrão da rede (admin)
--    Legado: MENS_CUSTOM (unidade) + AUTOS.push (admin → padrão da rede).
--    escopo='rede' (admin, vale p/ todas as unidades) | 'unidade' (só a dona).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.automacoes_custom (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  -- null quando escopo='rede'; preenchido quando escopo='unidade'.
  unidade_id  uuid references public.unidades(id) on delete cascade,
  escopo      text not null default 'unidade' check (escopo in ('rede', 'unidade')),
  nome        text not null,
  -- gatilho ("Quando…") e ação ("→ …"), iguais aos campos gat/ac do legado.
  gatilho     text not null default 'condição definida pela unidade',
  acao        text not null default 'envia uma mensagem ao cliente',
  categoria   text not null default 'Personalizada',
  ativa       boolean not null default true,
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists automacoes_custom_emp_idx on public.automacoes_custom (empresa_id);
create index if not exists automacoes_custom_uni_idx on public.automacoes_custom (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Config da automação de NÃO COMPARECIMENTO (no-show) por unidade
--    Legado: view-motivos 1762-1788 (4 campos + textarea + 3 regras).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.automacao_noshow (
  unidade_id        uuid primary key references public.unidades(id) on delete cascade,
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  ativa             boolean not null default true,
  -- "1ª mensagem após a sessão" (legado: "2 horas")
  primeira_apos     text not null default '2 horas',
  -- "Máximo de mensagens no dia" (legado: 2, min 1 max 2)
  max_dia           int not null default 2 check (max_dia between 1 and 2),
  -- "Intervalo entre mensagens" (legado: "2 horas")
  intervalo         text not null default '2 horas',
  mensagem          text not null default 'Olá {cliente}! 💙 Notamos que você não compareceu à sua sessão de {serviço} hoje às {hora}. Aconteceu algo? Temos horários disponíveis e adoraríamos remarcar para você. É só responder aqui que reagendamos na hora! 😊',
  -- 3 toggles de regra (legado 1772-1774)
  reagenda_se_responde boolean not null default true,
  exclui_se_sem_resposta boolean not null default true,
  oculta_dia_seguinte  boolean not null default true,
  atualizado_em     timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Bases & Segmentos para campanhas (Disparos › Bases)
--    Legado: DISP_BASES 6529 + segModal 6678 (tipo Sistema/Externa).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.disparo_bases (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid references public.unidades(id) on delete cascade,
  nome        text not null,
  -- 'sistema' = segmento dinâmico por critérios; 'externa' = CSV/Excel importado
  tipo        text not null default 'sistema' check (tipo in ('sistema', 'externa')),
  -- estimativa de contatos (segCount do legado) OU total importado
  contatos    int not null default 0,
  -- critérios do segmentador (SEG_CAMPOS) quando tipo='sistema' (json)
  criterios   jsonb not null default '[]'::jsonb,
  -- números colados/importados quando tipo='externa' (text[] normalizado)
  numeros     text[] not null default '{}',
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists disparo_bases_emp_idx on public.disparo_bases (empresa_id);
create index if not exists disparo_bases_uni_idx on public.disparo_bases (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 5) Campanhas de disparo (histórico + métricas)
--    Legado: DISP_CAMPS 6536 / dispCampanhas 6615 / dispCampReport 6624.
--    status: draft|sched|run|done (espelha WA_ST do legado).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.disparo_campanhas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid references public.unidades(id) on delete cascade,
  nome        text not null,
  base_nome   text,                       -- rótulo da base/segmento usado
  base_id     uuid references public.disparo_bases(id) on delete set null,
  canal_nome  text,                       -- instancia_nome da UAZAPI
  status      text not null default 'draft' check (status in ('draft', 'sched', 'run', 'done')),
  enviadas    int not null default 0,
  entregues   int not null default 0,
  lidas       int not null default 0,
  respostas   int not null default 0,
  -- id da campanha na UAZAPI (folder_id) p/ acompanhar
  uazapi_id   text,
  agendada_para timestamptz,
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists disparo_campanhas_emp_idx on public.disparo_campanhas (empresa_id, criado_em desc);
create index if not exists disparo_campanhas_uni_idx on public.disparo_campanhas (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 6) Grupos VIP (Disparos › Grupo VIP)
--    Legado: VIP_GROUPS 6542 / dispVIP 6713 (ciclo Convite/Aquecimento/Ofertas).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.vip_grupos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid references public.unidades(id) on delete cascade,
  nome        text not null,
  data_convite     date,
  data_aquecimento date,
  data_oferta_ini  date,
  data_oferta_fim  date,
  membros     int not null default 0,
  -- status: sched(agendado)|warm(aquecendo)|live(ao vivo)|done(encerrado)
  status      text not null default 'sched' check (status in ('sched', 'warm', 'live', 'done')),
  link_publico text,
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists vip_grupos_emp_idx on public.vip_grupos (empresa_id);

-- ============================================================================
-- RLS  leitura pela empresa do usuário; escrita por papéis de gestão.
--   A empresa do usuário é resolvida via perfis_usuario → unidades → empresa_id.
-- ============================================================================

-- helper inline repetido nas policies (mesma forma do agenda.sql / categorias.sql):
--   empresa_id in (select u.empresa_id from unidades u join perfis_usuario p on p.unidade_id=u.id where p.id=auth.uid())
--   or perfil admin_geral

do $$
declare t text;
begin
  foreach t in array array[
    'automacoes_estado', 'automacoes_custom', 'automacao_noshow',
    'disparo_bases', 'disparo_campanhas', 'vip_grupos'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format($pol$
      drop policy if exists %1$s_sel on public.%1$s;
      create policy %1$s_sel on public.%1$s
        for select to authenticated
        using (
          empresa_id in (
            select u.empresa_id from public.unidades u
            join public.perfis_usuario p on p.unidade_id = u.id
            where p.id = auth.uid()
          )
          or exists (select 1 from public.perfis_usuario p where p.id = auth.uid() and p.papel = 'admin_geral')
        );
    $pol$, t);

    execute format($pol$
      drop policy if exists %1$s_ins on public.%1$s;
      create policy %1$s_ins on public.%1$s
        for insert to authenticated
        with check (
          exists (select 1 from public.perfis_usuario p
            where p.id = auth.uid() and p.papel in ('admin_geral','gestor','operacoes'))
        );
    $pol$, t);

    execute format($pol$
      drop policy if exists %1$s_upd on public.%1$s;
      create policy %1$s_upd on public.%1$s
        for update to authenticated
        using (
          exists (select 1 from public.perfis_usuario p
            where p.id = auth.uid() and p.papel in ('admin_geral','gestor','operacoes'))
        );
    $pol$, t);

    execute format($pol$
      drop policy if exists %1$s_del on public.%1$s;
      create policy %1$s_del on public.%1$s
        for delete to authenticated
        using (
          exists (select 1 from public.perfis_usuario p
            where p.id = auth.uid() and p.papel in ('admin_geral','gestor','operacoes'))
        );
    $pol$, t);
  end loop;
end $$;

-- ── Seed opcional: bases "Sistema" dinâmicas (espelham DISP_BASES do legado) ──
-- Descomente para semear bases de exemplo na 1ª empresa.
-- insert into public.disparo_bases (empresa_id, nome, tipo, contatos)
-- select e.id, x.nome, 'sistema', x.n
-- from public.empresas e
-- cross join (values
--   ('Clientes ativos', 1204), ('Aniversariantes do mês', 42),
--   ('Inativos há 60 dias', 146), ('Fez Ultrassom há 8 meses', 88)
-- ) as x(nome, n)
-- limit 4;
