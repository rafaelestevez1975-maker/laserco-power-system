-- =============================================================================
-- Migration — Notas Fiscais (NFS-e) + Integração com prefeituras
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html, buildNotas ~8502-8531) tem a tela de Notas
--   Fiscais com três peças que NÃO existem no backend lkii:
--     1) NOTAS EMITIDAS (numero, competencia, tipo, cliente, fato gerador,
--        valor, status) — tabela `nfse`.
--     2) CONFIGURAÇÃO FISCAL POR UNIDADE (provedor municipal, alíquota ISS,
--        inscrição municipal, certificado/token, ambiente, status de conexão)
--        — tabela `nfse_config_unidade`.
--     3) POLÍTICA DE EMISSÃO DA REDE (nenhuma|venda|execucao) + flag
--        "calcular por sessão" — tabela `nfse_politica` (1 registro por empresa).
--
--   Tudo idempotente. Espelha as colunas que a UI de /notas lê.
--
-- COMO APLICAR (manual — esta migration NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/nfse.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) POLÍTICA DE EMISSÃO DA REDE — 1 registro por empresa.
--    Legado: NFSE_POLICY ('nenhuma'|'venda'|'execucao', default 'execucao')
--            + NFSE_POR_SESSAO (boolean, default true).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nfse_politica (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  politica     text NOT NULL DEFAULT 'execucao',  -- 'nenhuma' | 'venda' | 'execucao'
  por_sessao   boolean NOT NULL DEFAULT true,      -- calcula NF/comissão por sessão
  criado_por   uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

ALTER TABLE nfse_politica DROP CONSTRAINT IF EXISTS nfse_politica_politica_check;
ALTER TABLE nfse_politica
  ADD CONSTRAINT nfse_politica_politica_check
  CHECK (politica IN ('nenhuma', 'venda', 'execucao'));

-- ----------------------------------------------------------------------------
-- 2) CONFIGURAÇÃO FISCAL POR UNIDADE — 1 registro por unidade.
--    Legado: nfseProvedor(cidade), nfseAliquota(cidade), nfseConectada(nome),
--            nfseConfigUnidade(nome) → inscrição municipal, certificado/token,
--            ambiente (Produção/Homologação).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nfse_config_unidade (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id         uuid NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  provedor           text,                         -- ex.: 'NFS-e Paulistana'
  aliquota_iss       numeric(5,2),                 -- ex.: 5.00 (% ISS)
  inscricao_municipal text,
  certificado_token  text,
  ambiente           text NOT NULL DEFAULT 'producao',  -- 'producao' | 'homologacao'
  status_conexao     text NOT NULL DEFAULT 'pendente',  -- 'conectada' | 'pendente'
  criado_por         uuid,
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id)
);

ALTER TABLE nfse_config_unidade DROP CONSTRAINT IF EXISTS nfse_config_unidade_ambiente_check;
ALTER TABLE nfse_config_unidade
  ADD CONSTRAINT nfse_config_unidade_ambiente_check
  CHECK (ambiente IN ('producao', 'homologacao'));

ALTER TABLE nfse_config_unidade DROP CONSTRAINT IF EXISTS nfse_config_unidade_status_check;
ALTER TABLE nfse_config_unidade
  ADD CONSTRAINT nfse_config_unidade_status_check
  CHECK (status_conexao IN ('conectada', 'pendente'));

-- ----------------------------------------------------------------------------
-- 3) NOTAS EMITIDAS — registro/listagem de NFS-e (emissão fiscal real = TODO).
--    Legado emit: Número, Competência, Tipo, Cliente, Fato gerador, Valor, Status.
--    fato_gerador: 'Sessão executada' (por sessão) ou 'Venda'.
--    status: autorizada | cancelada | processando | erro.
--    tipo:   nfse | nfe.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nfse (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE SET NULL,
  cliente_id    uuid REFERENCES clientes(id) ON DELETE SET NULL,
  os_id         uuid,                              -- vínculo opcional com a OS de origem
  numero        text,                              -- número da nota (string; pode ter zeros à esquerda)
  competencia   text,                              -- 'YYYY-MM' (mês de competência)
  tipo          text NOT NULL DEFAULT 'nfse',      -- 'nfse' | 'nfe'
  fato_gerador  text NOT NULL DEFAULT 'venda',     -- 'venda' | 'sessao'
  cliente_nome  text,                              -- snapshot do nome (caso cliente_id nulo)
  valor         numeric(12,2) NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'processando', -- 'autorizada'|'cancelada'|'processando'|'erro'
  xml           text,                              -- XML da nota (quando emitida de verdade)
  observacao    text,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nfse DROP CONSTRAINT IF EXISTS nfse_tipo_check;
ALTER TABLE nfse ADD CONSTRAINT nfse_tipo_check CHECK (tipo IN ('nfse', 'nfe'));

ALTER TABLE nfse DROP CONSTRAINT IF EXISTS nfse_fato_check;
ALTER TABLE nfse ADD CONSTRAINT nfse_fato_check CHECK (fato_gerador IN ('venda', 'sessao'));

ALTER TABLE nfse DROP CONSTRAINT IF EXISTS nfse_status_check;
ALTER TABLE nfse ADD CONSTRAINT nfse_status_check
  CHECK (status IN ('autorizada', 'cancelada', 'processando', 'erro'));

CREATE INDEX IF NOT EXISTS idx_nfse_emp_uni       ON nfse (empresa_id, unidade_id);
CREATE INDEX IF NOT EXISTS idx_nfse_competencia   ON nfse (empresa_id, competencia);
CREATE INDEX IF NOT EXISTS idx_nfse_status        ON nfse (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_nfse_cfg_uni       ON nfse_config_unidade (empresa_id, unidade_id);

-- ----------------------------------------------------------------------------
-- 4) RLS — habilita e cria policies por empresa (alinhado às demais tabelas).
--    Leitura/escrita restritas à empresa do usuário autenticado (via perfis_usuario).
-- ----------------------------------------------------------------------------
ALTER TABLE nfse_politica       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfse_config_unidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfse                ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nfse_politica_emp ON nfse_politica;
CREATE POLICY nfse_politica_emp ON nfse_politica
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

DROP POLICY IF EXISTS nfse_config_unidade_emp ON nfse_config_unidade;
CREATE POLICY nfse_config_unidade_emp ON nfse_config_unidade
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

DROP POLICY IF EXISTS nfse_emp ON nfse;
CREATE POLICY nfse_emp ON nfse
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
--   DROP TABLE IF EXISTS nfse;
--   DROP TABLE IF EXISTS nfse_config_unidade;
--   DROP TABLE IF EXISTS nfse_politica;
-- =============================================================================
