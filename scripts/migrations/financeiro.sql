-- =============================================================================
-- Migration — FINANCEIRO DA FRANQUEADORA (Franqueadora A + B)
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html · buildFinFranq L5099+) tem um módulo financeiro
--   da FRANQUEADORA, separado do contas a pagar/receber por unidade (que no Next
--   já vive em /contas sobre lancamentos_financeiros + plano_contas).
--
--   A franqueadora reúne os RECEBÍVEIS da rede (royalties = 10% do bruto, taxas de
--   franquia, fundo de marketing, aluguel de máquinas, etc.) e as DESPESAS da matriz
--   (folha, impostos, fornecedores), com conceitos que NÃO existem em
--   lancamentos_financeiros: faturamento bruto, nº de boleto, prioridade (alta/
--   média/baixa), escopo (Escritório/Rede/Loja), status atrasado/suspenso, jurId.
--
-- DECISÃO ADOTADA (tabelas próprias do financeiro da franqueadora)
--   Em vez de poluir lancamentos_financeiros (que é por unidade), criamos tabelas
--   dedicadas com prefixo fin_:
--     fin_recebiveis   — royalties/taxas/aluguéis cobrados das unidades pela matriz
--     fin_contas_pagar — despesas da franqueadora (folha, impostos, fornecedores)
--     fin_conciliacao  — cruzamento venda x extrato x taxa adquirente
--     fin_config       — parâmetros (royaltyPct/fundoPct/vencDia, banco, adquirentes, régua)
--
--   Categorias de recebíveis são FIXAS (FIN_CATS_REC do legado), guardadas como
--   texto na coluna categoria (não usam plano_contas — são conceitos da matriz).
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING. RLS habilitada com policy
--   por empresa (admin_geral e perfil financeiro). O seed usa a 1ª empresa e as
--   unidades ativas existentes, espelhando o finSeed do legado.
--
-- COMO APLICAR (manual — NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/financeiro.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) RECEBÍVEIS DA FRANQUEADORA (royalties, taxas, fundo, aluguéis…)
--    Espelha FIN_REC do legado (finSeed L5053-5058).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_recebiveis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE SET NULL,
  unidade_nome  text,                              -- snapshot do nome (relatórios históricos)
  categoria     text NOT NULL DEFAULT 'Royalties', -- FIN_CATS_REC (texto fixo)
  competencia   text,                              -- ref (ex.: 'Maio/2026' ou 'Parcela 3/6')
  bruto         numeric(14,2) NOT NULL DEFAULT 0,  -- faturamento bruto base do royalty
  valor         numeric(14,2) NOT NULL DEFAULT 0,
  vencimento    date,
  status        text NOT NULL DEFAULT 'aberto'     -- aberto | atrasado | pago | suspenso
                CHECK (status IN ('aberto','atrasado','pago','suspenso')),
  dias_atraso   integer NOT NULL DEFAULT 0,
  boleto        text,                              -- nº/linha digitável quando gerado
  enviado       boolean NOT NULL DEFAULT false,    -- enviado por e-mail/WhatsApp
  data_pagamento date,
  jur_id        text,                              -- vínculo c/ Jurídico (escalado)
  status_anterior text,                            -- _prevStatus (p/ reativar suspenso)
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_recebiveis_empresa ON fin_recebiveis (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_recebiveis_status  ON fin_recebiveis (status);
CREATE INDEX IF NOT EXISTS idx_fin_recebiveis_categoria ON fin_recebiveis (categoria);

-- ----------------------------------------------------------------------------
-- 2) CONTAS A PAGAR DA FRANQUEADORA (despesas da matriz)
--    Espelha FIN_PAG do legado (finSeed L5072-5081).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_contas_pagar (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid REFERENCES empresas(id) ON DELETE CASCADE,
  categoria   text NOT NULL,
  descricao   text,
  escopo      text NOT NULL DEFAULT 'Escritório',  -- Escritório | Rede | <nome da unidade>
  valor       numeric(14,2) NOT NULL DEFAULT 0,
  vencimento  date,
  status      text NOT NULL DEFAULT 'aberto'        -- aberto | pago | suspenso
              CHECK (status IN ('aberto','pago','suspenso')),
  prioridade  text NOT NULL DEFAULT 'media'         -- alta | media | baixa
              CHECK (prioridade IN ('alta','media','baixa')),
  status_anterior text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_empresa ON fin_contas_pagar (empresa_id);
CREATE INDEX IF NOT EXISTS idx_fin_contas_pagar_status  ON fin_contas_pagar (status);

-- ----------------------------------------------------------------------------
-- 3) CONCILIAÇÃO BANCÁRIA (venda x extrato x taxa adquirente)
--    Espelha FIN_CONC do legado (finSeed L5083-5096).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_conciliacao (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid REFERENCES empresas(id) ON DELETE CASCADE,
  data        date,
  unidade_nome text,
  adquirente  text,
  venda       numeric(14,2) NOT NULL DEFAULT 0,
  taxa_pct    numeric(6,2)  NOT NULL DEFAULT 0,
  taxa        numeric(14,2) NOT NULL DEFAULT 0,
  esperado    numeric(14,2) NOT NULL DEFAULT 0,
  recebido    numeric(14,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','divergencia')),
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_conciliacao_empresa ON fin_conciliacao (empresa_id);

-- ----------------------------------------------------------------------------
-- 4) CONFIG DO FINANCEIRO (1 linha por empresa) — parâmetros do legado FIN_CFG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_config (
  empresa_id   uuid PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  royalty_pct  numeric(6,2) NOT NULL DEFAULT 10,
  fundo_pct    numeric(6,2) NOT NULL DEFAULT 2,
  venc_dia     integer NOT NULL DEFAULT 10 CHECK (venc_dia BETWEEN 1 AND 28),
  banco        jsonb NOT NULL DEFAULT '{"nome":"Banco do Brasil","agencia":"1234-5","conta":"45.678-9","convenio":"Convênio 1234567 · Carteira 17 · CNAB 240","login":"laserco.financeiro","autoBaixa":true}'::jsonb,
  adquirentes  jsonb NOT NULL DEFAULT '[{"nome":"Cielo","deb":1.09,"cred":2.49,"parc":3.19,"pix":0.49,"prazo":30},{"nome":"Stone","deb":0.99,"cred":2.39,"parc":2.99,"pix":0.29,"prazo":1},{"nome":"Rede","deb":1.19,"cred":2.69,"parc":3.29,"pix":0.59,"prazo":30}]'::jsonb,
  categorias   jsonb NOT NULL DEFAULT '["Royalties","Taxa de franquia","Fundo de marketing","Aluguel de máquinas","Reembolso disparos Ultrassom","Locação de equipamentos","Taxa de tecnologia","Outros"]'::jsonb,
  regua        jsonb NOT NULL DEFAULT '[{"dias":0,"acao":"Vencimento · boleto registrado no banco","canal":""},{"dias":1,"acao":"1ª notificação automática de atraso","canal":"Sistema + E-mail + WhatsApp"},{"dias":5,"acao":"2ª notificação + alerta ao Gerente de Campo","canal":"Sistema + E-mail + WhatsApp"},{"dias":10,"acao":"Acionar Jurídico · notificação extrajudicial","canal":"Jurídico (e-mail)"},{"dias":20,"acao":"Jurídico · protesto em cartório","canal":"Jurídico"},{"dias":30,"acao":"Jurídico · rescisão contratual","canal":"Jurídico"}]'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5) RLS — habilitar + policies por empresa (admin_geral e perfil financeiro)
--    Modelo: perfis_usuario(papel, unidade_id) → unidades(empresa_id).
-- ----------------------------------------------------------------------------
ALTER TABLE fin_recebiveis   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_conciliacao  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fin_config       ENABLE ROW LEVEL SECURITY;

-- Helper inline: o usuário é admin_geral OU tem papel financeiro/gestor.
-- (Repetido em cada policy porque não criamos função SQL nova.)

DROP POLICY IF EXISTS fin_recebiveis_rw ON fin_recebiveis;
CREATE POLICY fin_recebiveis_rw ON fin_recebiveis
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')));

DROP POLICY IF EXISTS fin_contas_pagar_rw ON fin_contas_pagar;
CREATE POLICY fin_contas_pagar_rw ON fin_contas_pagar
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')));

DROP POLICY IF EXISTS fin_conciliacao_rw ON fin_conciliacao;
CREATE POLICY fin_conciliacao_rw ON fin_conciliacao
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')));

DROP POLICY IF EXISTS fin_config_rw ON fin_config;
CREATE POLICY fin_config_rw ON fin_config
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','financeiro','gestor')));

-- ----------------------------------------------------------------------------
-- 6) SEED — espelha finSeed do legado, sobre as unidades ativas reais.
--    Royalty = 10% do bruto; Fundo = 2% do bruto. Vencimento 10/06/2026.
--    Só insere se a tabela estiver vazia (idempotente por contagem).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
  r RECORD;
  i integer := 0;
  v_bruto numeric;
  v_roy numeric;
  v_fundo numeric;
  v_status text;
  v_dias integer;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  -- config padrão
  INSERT INTO fin_config (empresa_id) VALUES (v_empresa) ON CONFLICT (empresa_id) DO NOTHING;

  -- recebíveis (só se vazio)
  IF (SELECT count(*) FROM fin_recebiveis WHERE empresa_id = v_empresa) = 0 THEN
    FOR r IN SELECT id, nome FROM unidades WHERE ativa = true ORDER BY nome LOOP
      v_bruto := 58000 + ((i*37) % 92)*1000 + ((i*53) % 5)*5300;
      v_roy   := round(v_bruto * 10 / 100, 2);
      v_fundo := round(v_bruto * 2  / 100, 2);
      v_status := 'aberto'; v_dias := 0;
      IF i % 9 = 4 THEN v_status := 'atrasado'; v_dias := (ARRAY[3,7,12,22])[(i % 4)+1];
      ELSIF i % 4 = 0 THEN v_status := 'pago'; END IF;

      INSERT INTO fin_recebiveis (empresa_id, unidade_id, unidade_nome, categoria, competencia, bruto, valor, vencimento, status, dias_atraso, enviado, data_pagamento)
      VALUES (v_empresa, r.id, r.nome, 'Royalties', 'Maio/2026', v_bruto, v_roy, DATE '2026-06-10', v_status, v_dias, v_status <> 'aberto', CASE WHEN v_status='pago' THEN DATE '2026-06-06' END);

      INSERT INTO fin_recebiveis (empresa_id, unidade_id, unidade_nome, categoria, competencia, bruto, valor, vencimento, status, enviado, data_pagamento)
      VALUES (v_empresa, r.id, r.nome, 'Fundo de marketing', 'Maio/2026', v_bruto, v_fundo, DATE '2026-06-10',
              CASE WHEN v_status='atrasado' THEN 'aberto' ELSE v_status END, v_status='pago', CASE WHEN v_status='pago' THEN DATE '2026-06-06' END);

      i := i + 1;
    END LOOP;
  END IF;

  -- contas a pagar (só se vazio) — despesas fixas da matriz
  IF (SELECT count(*) FROM fin_contas_pagar WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO fin_contas_pagar (empresa_id, categoria, descricao, escopo, valor, vencimento, status, prioridade) VALUES
      (v_empresa,'Salários','Folha · Escritório / Matriz','Escritório',86400, DATE '2026-06-05','pago','alta'),
      (v_empresa,'Pró-labore','Pró-labore sócios','Escritório',32000, DATE '2026-06-05','pago','alta'),
      (v_empresa,'Impostos','DAS / Simples Nacional · competência 05/2026','Escritório',41870.55, DATE '2026-06-20','aberto','alta'),
      (v_empresa,'Aluguel','Aluguel sede administrativa','Escritório',18500, DATE '2026-06-10','aberto','alta'),
      (v_empresa,'Tecnologia','Licenças de software da rede (sistema, BI, e-mail)','Escritório',9740, DATE '2026-06-15','aberto','baixa'),
      (v_empresa,'Marketing','Mídia paga rede + produção de conteúdo','Escritório',54300, DATE '2026-06-12','aberto','baixa'),
      (v_empresa,'Contabilidade','Honorários contábeis da rede','Escritório',12600, DATE '2026-06-10','aberto','media'),
      (v_empresa,'Fornecedores','Insumos e PDRN · compra centralizada','Rede',73250, DATE '2026-06-18','aberto','media');
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS fin_recebiveis, fin_contas_pagar, fin_conciliacao, fin_config CASCADE;
-- =============================================================================
