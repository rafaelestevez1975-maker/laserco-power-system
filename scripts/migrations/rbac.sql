-- ============================================================================
-- Módulo: RBAC  Perfis de acesso (cargos) + matriz de permissões
-- Paridade com o legado: PERFIS[] / perfisRows / perfTogglePonto / perfDel /
--   renderPerfilEditor (legacy/index.html L7178-7293).
--
-- As tabelas de RBAC (cargos, cargo_permissoes, permissoes, recursos, acoes,
-- usuario_cargos) JÁ EXISTEM no lkii e são geridas via service-role (igual ao
-- resolveRecursos de lib/session). Esta migration apenas ESTENDE o schema com:
--   • cargos.bate_ponto  → flag "Bate ponto" por perfil (coluna nova do legado).
--
-- Heurística inicial de bate_ponto (legado L7191): Administrador/Gestor/
--   Franqueado/Proprietário NÃO batem ponto; os demais batem.
--
-- Aplicar este arquivo no projeto lkii (Supabase) antes de usar o toggle
-- "Bate ponto" na lista de perfis (/perfis).
-- ============================================================================

-- Coluna nova: define se o perfil bate ponto (ponto eletrônico).
alter table public.cargos
  add column if not exists bate_ponto boolean not null default true;

comment on column public.cargos.bate_ponto is
  'Define se os usuários deste perfil registram ponto eletrônico. Legado: PERFIS[].batePonto.';

-- Seed da heurística do legado: cargos de gestão/franqueado/proprietário não batem ponto.
-- (Roda só uma vez de forma idempotente: só altera quem ainda está no default.)
update public.cargos
set bate_ponto = false
where bate_ponto is true
  and (
       slug ~* '(super_admin|admin|gestor|gerente|franqueado|proprietario|expansao|marketing)'
    or nome ~* '(Administrador|Gestor|Franqueado|Propriet|Gerente|Expans|Marketing)'
  );
