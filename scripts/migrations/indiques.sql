-- =============================================================================
-- Migration — Gestão de Indiques (paridade com o legado: Prêmio & Link + Sorteio)
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html, blocos indPremioHTML / indSorteioHTML ~8195-8296)
--   tem três peças que NÃO existem no backend lkii:
--     1) PRÊMIO DO MÊS configurável por unidade (admin define prêmio + valor + obs).
--     2) Registro do ÚLTIMO SORTEIO (ganhador do mês) por unidade.
--     3) Campos CPF e ORIGEM da indicação no formulário "Novo indique".
--
--   Esta migration cria as duas tabelas de config/registro e adiciona as duas
--   colunas que faltavam em `indicacoes`. Tudo idempotente.
--
-- COMO APLICAR (manual — esta migration NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/indiques.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Campos do indicador no formulário "Novo indique" (legado indSalvarManual 8187)
--    cpf (opcional) + origem da indicação (Balcão (loja) | Site | Link compartilhado)
-- ----------------------------------------------------------------------------
ALTER TABLE indicacoes
  ADD COLUMN IF NOT EXISTS indicador_cpf text;
ALTER TABLE indicacoes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'balcao';

ALTER TABLE indicacoes DROP CONSTRAINT IF EXISTS indicacoes_origem_check;
ALTER TABLE indicacoes
  ADD CONSTRAINT indicacoes_origem_check
  CHECK (origem IN ('balcao', 'site', 'link'));

-- ----------------------------------------------------------------------------
-- 2) PRÊMIO DO MÊS — config por (empresa, unidade, mês).
--    Legado IND_PREMIO (8063): { premio, valor, obs }. Um registro por unidade/mês.
--    mes_ref no formato 'YYYY-MM' (legado IND_MES_KEY = '2026-06').
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indique_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id  uuid REFERENCES unidades(id) ON DELETE CASCADE,
  mes_ref     text NOT NULL,                  -- 'YYYY-MM'
  premio      text NOT NULL DEFAULT '',
  valor_ref   text,                           -- texto livre, ex.: 'R$ 1.199'
  observacao  text,
  meta_mensal integer NOT NULL DEFAULT 60,    -- meta de indiques do mês (legado IND_META_MES=60)
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, unidade_id, mes_ref)
);

-- ----------------------------------------------------------------------------
-- 3) ÚLTIMO SORTEIO — registro do ganhador do mês (legado IND_ULTIMO_SORTEIO 8279).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indique_sorteios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE CASCADE,
  mes_ref       text NOT NULL,                -- 'YYYY-MM'
  ganhador_nome text NOT NULL,
  ganhador_whats text,
  ganhador_email text,
  premio        text,
  notificado    boolean NOT NULL DEFAULT false,
  sorteado_por  uuid,
  sorteado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_indique_config_emp_uni  ON indique_config (empresa_id, unidade_id, mes_ref);
CREATE INDEX IF NOT EXISTS idx_indique_sorteios_emp_uni ON indique_sorteios (empresa_id, unidade_id, mes_ref);

-- ----------------------------------------------------------------------------
-- 4) RLS — habilita e cria policies básicas por empresa (alinhado às demais tabelas).
--    Leitura/escrita restritas à empresa do usuário autenticado (via perfis_usuario).
-- ----------------------------------------------------------------------------
ALTER TABLE indique_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE indique_sorteios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS indique_config_emp ON indique_config;
CREATE POLICY indique_config_emp ON indique_config
  USING (empresa_id IN (
    SELECT u.empresa_id FROM perfis_usuario p
    JOIN unidades u ON u.id = p.unidade_id
    WHERE p.id = auth.uid()
  ))
  WITH CHECK (empresa_id IN (
    SELECT u.empresa_id FROM perfis_usuario p
    JOIN unidades u ON u.id = p.unidade_id
    WHERE p.id = auth.uid()
  ));

DROP POLICY IF EXISTS indique_sorteios_emp ON indique_sorteios;
CREATE POLICY indique_sorteios_emp ON indique_sorteios
  USING (empresa_id IN (
    SELECT u.empresa_id FROM perfis_usuario p
    JOIN unidades u ON u.id = p.unidade_id
    WHERE p.id = auth.uid()
  ))
  WITH CHECK (empresa_id IN (
    SELECT u.empresa_id FROM perfis_usuario p
    JOIN unidades u ON u.id = p.unidade_id
    WHERE p.id = auth.uid()
  ));

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS indique_sorteios;
--   DROP TABLE IF EXISTS indique_config;
--   ALTER TABLE indicacoes DROP COLUMN IF EXISTS indicador_cpf;
--   ALTER TABLE indicacoes DROP COLUMN IF EXISTS origem;
-- =============================================================================
