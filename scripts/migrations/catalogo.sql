-- =============================================================================
-- Migration  CATÁLOGO (paridade com o legado: legacy/index.html)
-- =============================================================================
-- CONTEXTO
--   O legado tem, no módulo de catálogo, campos que o schema lkii ainda não cobria:
--     · Serviços   "Desc. Máx (%)" (SERVICOS[2]) e "Pagar comissão" timing
--                   Venda/Execução/Não pagar (SERVICOS[7], default 'Execução').
--     · Produtos   "Desc. Máx (%)" (PRODUTOS[2]). "Insumo" já existe como
--                   produtos.feedstock no schema  só falta expor na UI.
--     · Pacotes    "Cobertura de créditos" (Qualquer unidade / Unidade que realiza
--                   a venda), "Desconto máximo (%)" e "Pagar comissão" timing.
--   Além disso o legado tem duas telas funcionais que não existiam como tabela:
--     · Formas de pagamento (buildPgto / PGTO)  lista de formas com tipo, taxa,
--       taxa a descontar na comissão, ativo + bloco de integração PagoLivre
--       (Crédito Recorrente: token, parcelamento, valor mínimo, base de royalties).
--     · Grupo de serviços (buildGrpserv / GRPSERV)  grupos com flag Ativo.
--
-- DECISÃO ADOTADA
--   1. Colunas novas (ADD COLUMN IF NOT EXISTS) em servicos / produtos / pacotes,
--      com defaults seguros para não quebrar o catálogo existente.
--   2. Tabelas novas formas_pagamento e grupo_servicos com RLS por papel
--      (admin_geral / gestor / financeiro escrevem; demais leem)  mesmo modelo
--      das demais migrations (perfis_usuario.papel). Catálogo é por EMPRESA.
--   3. Seeds idempotentes (só se a tabela estiver vazia) espelhando PGTO/GRPSERV.
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS /
--   contagem antes de semear. Rodar duas vezes não quebra.
--
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/catalogo.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) SERVIÇOS  Desc. Máx (%) + Pagar comissão (timing)
--    desc_max:       SERVICOS[2] do legado (percentual, default 0).
--    pagar_comissao: SERVICOS[7]  'Venda' | 'Execução' | 'Não pagar'.
--                    Legado normaliza vazio para 'Execução'.
-- ----------------------------------------------------------------------------
ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS desc_max numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS pagar_comissao text NOT NULL DEFAULT 'Execução';

ALTER TABLE servicos DROP CONSTRAINT IF EXISTS servicos_pagar_comissao_check;
ALTER TABLE servicos
  ADD CONSTRAINT servicos_pagar_comissao_check
  CHECK (pagar_comissao IN ('Venda', 'Execução', 'Não pagar'));

-- ----------------------------------------------------------------------------
-- 2) PRODUTOS  Desc. Máx (%) + Insumo (feedstock)
--    produtos.feedstock normalmente já existe no schema lkii; o ADD COLUMN
--    IF NOT EXISTS garante a coluna "Insumo" mesmo onde ela faltar.
-- ----------------------------------------------------------------------------
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS desc_max numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS feedstock boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 3) PACOTES  Cobertura de créditos + Desconto máximo (%) + Pagar comissão
--    cobertura_creditos: 'Qualquer unidade' | 'Unidade que realiza a venda'.
--    desc_max:           PACOTES[4] (percentual).
--    pagar_comissao:     PACOTES[5]  Venda/Execução/Não pagar (default 'Execução').
-- ----------------------------------------------------------------------------
ALTER TABLE pacotes
  ADD COLUMN IF NOT EXISTS cobertura_creditos text NOT NULL DEFAULT 'Qualquer unidade';

ALTER TABLE pacotes DROP CONSTRAINT IF EXISTS pacotes_cobertura_creditos_check;
ALTER TABLE pacotes
  ADD CONSTRAINT pacotes_cobertura_creditos_check
  CHECK (cobertura_creditos IN ('Qualquer unidade', 'Unidade que realiza a venda'));

ALTER TABLE pacotes
  ADD COLUMN IF NOT EXISTS desc_max numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE pacotes
  ADD COLUMN IF NOT EXISTS pagar_comissao text NOT NULL DEFAULT 'Execução';

ALTER TABLE pacotes DROP CONSTRAINT IF EXISTS pacotes_pagar_comissao_check;
ALTER TABLE pacotes
  ADD CONSTRAINT pacotes_pagar_comissao_check
  CHECK (pagar_comissao IN ('Venda', 'Execução', 'Não pagar'));

-- ----------------------------------------------------------------------------
-- 4) FORMAS DE PAGAMENTO (buildPgto / PGTO + bloco PagoLivre)
--    Catálogo por empresa. A integração PagoLivre (Crédito Recorrente) vive nas
--    colunas rec_*  só preenchidas quando tipo = 'Crédito Recorrente'.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS formas_pagamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  tipo            text NOT NULL DEFAULT 'Crédito'
                  CHECK (tipo IN ('Crédito','Débito','PIX','Dinheiro','Link de Pagamento','Boleto','Transferência','Crédito Recorrente')),
  taxa            numeric(6,2) NOT NULL DEFAULT 0,   -- taxa do adquirente (%)
  taxa_comissao   numeric(6,2) NOT NULL DEFAULT 0,   -- taxa a descontar na comissão (%)
  ativo           boolean NOT NULL DEFAULT true,
  ordem           integer NOT NULL DEFAULT 0,
  -- Integração PagoLivre (Crédito Recorrente)  só usado quando tipo='Crédito Recorrente'
  rec_modo        text DEFAULT 'Integrado' CHECK (rec_modo IS NULL OR rec_modo IN ('Integrado','Manual')),
  rec_parceiro    text DEFAULT 'PagoLivre',
  rec_token       text,
  rec_max_parc    integer DEFAULT 12 CHECK (rec_max_parc IS NULL OR (rec_max_parc BETWEEN 1 AND 12)),
  rec_min_parcela numeric(12,2) DEFAULT 50,
  rec_base_royalties text DEFAULT 'recorrencia' CHECK (rec_base_royalties IS NULL OR rec_base_royalties IN ('recorrencia','venda')),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_formas_pagamento_empresa ON formas_pagamento (empresa_id);
CREATE INDEX IF NOT EXISTS idx_formas_pagamento_ativo   ON formas_pagamento (ativo);

-- ----------------------------------------------------------------------------
-- 5) GRUPO DE SERVIÇOS (buildGrpserv / GRPSERV)  grupos com flag Ativo
--    É a "tabela de grupos" que o legado tinha como lista fixa. O catálogo de
--    serviços referencia o grupo por NOME (servicos.grupo é texto), então aqui
--    guardamos os grupos como cadastro próprio (nome + ativo) para a tela
--    /cadastros/grupo-servicos. Renomear continua propagando em servicos.grupo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grupo_servicos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  ordem         integer NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grupo_servicos_empresa ON grupo_servicos (empresa_id);

-- ----------------------------------------------------------------------------
-- 6) RLS  habilitar + policies por papel.
--    Leitura: qualquer perfil autenticado (catálogo é compartilhado).
--    Escrita: admin_geral / gestor / financeiro (gestores da rede).
-- ----------------------------------------------------------------------------
ALTER TABLE formas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupo_servicos   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS formas_pagamento_sel ON formas_pagamento;
CREATE POLICY formas_pagamento_sel ON formas_pagamento
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS formas_pagamento_rw ON formas_pagamento;
CREATE POLICY formas_pagamento_rw ON formas_pagamento
  FOR ALL
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','financeiro')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','financeiro')));

DROP POLICY IF EXISTS grupo_servicos_sel ON grupo_servicos;
CREATE POLICY grupo_servicos_sel ON grupo_servicos
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS grupo_servicos_rw ON grupo_servicos;
CREATE POLICY grupo_servicos_rw ON grupo_servicos
  FOR ALL
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor')));

-- ----------------------------------------------------------------------------
-- 7) SEED  espelha PGTO (30+ formas) e GRPSERV (3 grupos) do legado.
--    Idempotente: só insere se a tabela estiver vazia para a empresa.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  -- Grupos de serviços (GRPSERV)  só se vazio
  IF (SELECT count(*) FROM grupo_servicos WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO grupo_servicos (empresa_id, nome, ativo, ordem) VALUES
      (v_empresa, 'Depilação', true, 1),
      (v_empresa, 'Estético',  true, 2),
      (v_empresa, 'Ultrassom', true, 3);
  END IF;

  -- Formas de pagamento (PGTO)  só se vazio
  IF (SELECT count(*) FROM formas_pagamento WHERE empresa_id = v_empresa) = 0 THEN
    -- Forma especial: Crédito Recorrente PagoLivre (sempre primeira)
    INSERT INTO formas_pagamento (empresa_id, nome, tipo, taxa, taxa_comissao, ativo, ordem,
                                  rec_modo, rec_parceiro, rec_token, rec_max_parc, rec_min_parcela, rec_base_royalties)
    VALUES (v_empresa, 'Crédito Recorrente - PagoLivre', 'Crédito Recorrente', 0, 0, true, 0,
            'Integrado', 'PagoLivre', NULL, 12, 50, 'recorrencia');

    INSERT INTO formas_pagamento (empresa_id, nome, tipo, taxa, taxa_comissao, ativo, ordem) VALUES
      (v_empresa,'01 x Cartão de Crédito - American Express - Rede','Crédito',3.65,0,true,1),
      (v_empresa,'01 x Cartão de Crédito - Elo - Rede','Crédito',3.65,0,true,2),
      (v_empresa,'01 x Cartão de Crédito - Mastercard - Rede','Crédito',2.70,0,true,3),
      (v_empresa,'01 x Cartão de Crédito STONE','Crédito',3.15,0,true,4),
      (v_empresa,'01 x Cartão de Crédito - Visa - Rede','Crédito',2.70,0,true,5),
      (v_empresa,'01 x Link de Pagamento - American Express - Rede','Link de Pagamento',3.65,0,true,6),
      (v_empresa,'01 x Link de Pagamento - Elo - Rede','Link de Pagamento',3.65,0,true,7),
      (v_empresa,'01 x Link de Pagamento - Mastercard - Rede','Link de Pagamento',2.70,0,true,8),
      (v_empresa,'01 x Link de Pagamento - Visa - Rede','Link de Pagamento',2.70,0,true,9),
      (v_empresa,'02 x Cartão de Crédito - American Express - Rede','Crédito',5.67,0,true,10),
      (v_empresa,'02 x Cartão de Crédito - Elo - Rede','Crédito',5.67,0,true,11),
      (v_empresa,'02 x Cartão de Crédito - Mastercard - Rede','Crédito',4.35,0,true,12),
      (v_empresa,'02 x Cartão de Crédito STONE','Crédito',4.18,0,true,13),
      (v_empresa,'02 x Cartão de Crédito - Visa - Rede','Crédito',4.33,0,true,14),
      (v_empresa,'03 x Cartão de Crédito - American Express - Rede','Crédito',6.26,0,true,15),
      (v_empresa,'03 x Cartão de Crédito - Mastercard - Rede','Crédito',4.97,0,true,16),
      (v_empresa,'03 x Cartão de Crédito STONE','Crédito',4.86,0,true,17),
      (v_empresa,'03 x Cartão de Crédito - Visa - Rede','Crédito',4.92,0,true,18),
      (v_empresa,'PIX','PIX',0,0,true,19),
      (v_empresa,'Dinheiro','Dinheiro',0,0,true,20),
      (v_empresa,'Boleto','Boleto',0,0,true,21),
      (v_empresa,'Transferência (TED/DOC)','Transferência',0,0,true,22),
      (v_empresa,'01 x Cartão de Débito - Rede','Débito',1.39,0,true,23);
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS formas_pagamento, grupo_servicos CASCADE;
--   ALTER TABLE servicos DROP COLUMN IF EXISTS desc_max;
--   ALTER TABLE servicos DROP COLUMN IF EXISTS pagar_comissao;
--   ALTER TABLE produtos DROP COLUMN IF EXISTS desc_max;
--   ALTER TABLE pacotes  DROP COLUMN IF EXISTS cobertura_creditos;
--   ALTER TABLE pacotes  DROP COLUMN IF EXISTS desc_max;
--   ALTER TABLE pacotes  DROP COLUMN IF EXISTS pagar_comissao;
-- =============================================================================
