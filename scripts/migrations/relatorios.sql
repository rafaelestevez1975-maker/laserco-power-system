-- =============================================================================
-- Migration — RELATÓRIOS · CONTRATOS (planos/contratos por cliente)
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html · REL_DEFS.contratos L4311) tem um relatório de
--   CONTRATOS com KPIs (ativos / assinados no período / inadimplentes / valor
--   contratado) e colunas Cliente/Plano/Status/Criação/Assinatura/Valor.
--
--   No backend lkii NÃO existe tabela de contratos/assinaturas de cliente: a OS
--   guarda a venda (os/os_pagamentos), mas não o vínculo contínuo (plano mensal,
--   assinatura, status de inadimplência). O módulo OS já anota esta lacuna como
--   //TODO(needs-table: os_contratos).
--
-- DECISÃO ADOTADA (tabela própria `contratos`)
--   Criamos uma tabela dedicada `contratos`, escopada por empresa+unidade, com os
--   campos exatos do relatório do legado. O relatório /relatorios/contratos lê desta
--   tabela; quando vazia, a UI mostra um banner de empty-state pedindo a aplicação
--   desta migration. O seed gera contratos demo a partir de clientes reais para a
--   tela não nascer vazia.
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   CREATE TABLE IF NOT EXISTS / seed só se vazio. RLS habilitada com policy por
--   papel (admin_geral / gestor / financeiro). Modelo: perfis_usuario(papel,
--   unidade_id) → unidades(empresa_id).
--
-- COMO APLICAR (manual — NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/relatorios.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) CONTRATOS (planos/assinaturas de cliente) — espelha REL_DEFS.contratos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contratos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE SET NULL,
  cliente_id    uuid REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome  text,                                -- snapshot p/ relatórios históricos
  plano         text NOT NULL DEFAULT 'Club Prata',  -- Club Bronze | Prata | Ouro | Club PDRN
  status        text NOT NULL DEFAULT 'ativo'
                CHECK (status IN ('ativo','encerrado','cancelado','inadimplente')),
  valor_mensal  numeric(14,2) NOT NULL DEFAULT 0,
  criado_em     date NOT NULL DEFAULT CURRENT_DATE,  -- data de criação do contrato
  assinado_em   date,                                -- data da assinatura (NULL = pendente)
  inserido_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_unidade ON contratos (unidade_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status  ON contratos (status);
CREATE INDEX IF NOT EXISTS idx_contratos_criado  ON contratos (criado_em);

-- ----------------------------------------------------------------------------
-- 2) RLS — habilitar + policy por papel (admin_geral / gestor / financeiro)
-- ----------------------------------------------------------------------------
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratos_rw ON contratos;
CREATE POLICY contratos_rw ON contratos
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','financeiro')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','financeiro')));

-- ----------------------------------------------------------------------------
-- 3) SEED — contratos demo a partir de clientes reais (só se a tabela estiver vazia).
--    Distribui planos/status/valores determinísticos espelhando o legado.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
  v_unidade uuid;
  r RECORD;
  i integer := 0;
  v_plano text;
  v_valor numeric;
  v_status text;
  v_criado date;
  v_assin date;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  SELECT id INTO v_unidade FROM unidades WHERE ativa = true ORDER BY nome LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  IF (SELECT count(*) FROM contratos) = 0 THEN
    FOR r IN SELECT id, nome FROM clientes WHERE ativo = true ORDER BY criado_em DESC NULLS LAST LIMIT 60 LOOP
      -- plano por rotação
      v_plano := (ARRAY['Club Bronze','Club Prata','Club Ouro','Club PDRN'])[(i % 4)+1];
      v_valor := (ARRAY[99.90, 149.90, 229.90, 189.90])[(i % 4)+1];
      -- status por rotação (maioria ativo; alguns inadimplentes/encerrados/cancelados)
      v_status := 'ativo';
      IF i % 11 = 5 THEN v_status := 'inadimplente';
      ELSIF i % 9 = 7 THEN v_status := 'cancelado';
      ELSIF i % 13 = 3 THEN v_status := 'encerrado';
      END IF;
      v_criado := DATE '2026-06-27' - ((i*5) % 180);
      -- contratos cancelados/recentes podem não ter assinatura
      v_assin := CASE WHEN i % 7 = 6 THEN NULL ELSE v_criado + ((i % 3)) END;

      INSERT INTO contratos (empresa_id, unidade_id, cliente_id, cliente_nome, plano, status, valor_mensal, criado_em, assinado_em)
      VALUES (v_empresa, v_unidade, r.id, r.nome, v_plano, v_status, v_valor, v_criado, v_assin);
      i := i + 1;
    END LOOP;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS contratos CASCADE;
-- =============================================================================
