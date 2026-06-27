-- =============================================================================
-- Migration 050 — Pipeline de EXPANSÃO (CRM de captação de FRANQUIA)
-- =============================================================================
-- CONTEXTO
--   O legado tinha um módulo "Expansão" (buildExpansao) que é um CRM separado do
--   CRM de clientes: capta e qualifica candidatos a FRANQUEADO (linhas Ultracell,
--   Quanta e Franquia) num funil próprio até a COF e o fechamento.
--
--   No backend lkii NÃO existe tabela dedicada e `crm_leads` não distingue um lead
--   de cliente de um lead de franquia (a coluna `origem` tem CHECK fixo).
--
-- DECISÃO ADOTADA (discriminador em crm_leads)
--   Em vez de criar uma tabela nova (e duplicar RLS/policies/índices), adicionamos
--   um discriminador `pipeline` em crm_leads ('cliente' | 'franquia'). O mesmo
--   discriminador é adicionado em crm_etapas, para que a Expansão tenha SEU PRÓPRIO
--   conjunto de etapas (funil) sem poluir o funil de clientes — as 6 etapas globais
--   do sistema (empresa_id null) permanecem 'cliente' e ganham 6 etapas paralelas
--   'franquia'. Assim o app filtra etapas e leads por pipeline.
--
-- O QUE ESTA MIGRATION APLICA
--   1. crm_leads.pipeline (default 'cliente') + tipo_lead + temperatura.
--   2. crm_etapas.pipeline (default 'cliente').
--   3. Estende o CHECK de crm_leads.origem com 'geolocalizado' e 'site'
--      (origens de captação da Expansão), de forma idempotente.
--   4. Cria as 6 etapas da Expansão (pipeline='franquia', is_sistema=true).
--   5. Seed de ~8 leads demo de franquia para a tela não nascer vazia.
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   Tudo usa IF NOT EXISTS / ON CONFLICT / DROP CONSTRAINT IF EXISTS, então rodar
--   duas vezes não quebra. NÃO altera RLS existente: as policies de crm_leads /
--   crm_etapas continuam valendo (o app usa o client server com RLS).
--
-- COMO APLICAR (manual — esta migration NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/050_expansao_pipeline.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Discriminador + campos do funil de franquia em crm_leads
-- ----------------------------------------------------------------------------
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS pipeline text NOT NULL DEFAULT 'cliente';
-- valores aceitos: 'cliente' | 'franquia'

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS tipo_lead text;        -- Ultracell | Quanta | Franquia
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS temperatura text;       -- frio | morno | quente

-- CHECK do discriminador (idempotente)
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_pipeline_check;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_pipeline_check
  CHECK (pipeline IN ('cliente', 'franquia'));

-- CHECK de temperatura (aceita NULL — leads de cliente não usam)
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_temperatura_check;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_temperatura_check
  CHECK (temperatura IS NULL OR temperatura IN ('frio', 'morno', 'quente'));

-- Índice parcial para a leitura quente do app (só pega leads de franquia por unidade)
CREATE INDEX IF NOT EXISTS idx_crm_leads_franquia
  ON crm_leads (unidade_id, etapa_id)
  WHERE pipeline = 'franquia';

-- ----------------------------------------------------------------------------
-- 2) Estende o CHECK de origem (atuais + 'geolocalizado' + 'site')
--    Valores atuais (migration 015): manual, formulario, instagram, whatsapp,
--    indicacao, google, outros. Adiciona as origens de captação da Expansão.
-- ----------------------------------------------------------------------------
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_origem_check;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_origem_check
  CHECK (origem IN (
    'manual', 'formulario', 'instagram', 'whatsapp', 'indicacao',
    'google', 'outros', 'geolocalizado', 'site'
  ));

-- ----------------------------------------------------------------------------
-- 3) Discriminador em crm_etapas (funil próprio da Expansão)
-- ----------------------------------------------------------------------------
ALTER TABLE crm_etapas
  ADD COLUMN IF NOT EXISTS pipeline text NOT NULL DEFAULT 'cliente';

ALTER TABLE crm_etapas DROP CONSTRAINT IF EXISTS crm_etapas_pipeline_check;
ALTER TABLE crm_etapas
  ADD CONSTRAINT crm_etapas_pipeline_check
  CHECK (pipeline IN ('cliente', 'franquia'));

-- ----------------------------------------------------------------------------
-- 4) Etapas da EXPANSÃO (pipeline='franquia', globais, is_sistema=true)
--    IDs fixos (prefixo 50000001-) para idempotência via ON CONFLICT.
--    Cores próprias da Expansão (tom roxo/franqueadora). Etapas:
--    Novo Lead / Contato / Reunião Agendada / Proposta/COF / Fechado / Perdido
-- ----------------------------------------------------------------------------
INSERT INTO crm_etapas (id, empresa_id, nome, ordem, cor, is_sistema, ativo, pipeline) VALUES
  ('50000001-0000-0000-0000-000000000001', NULL, 'Novo Lead',         1, '#64748b', true, true, 'franquia'),
  ('50000001-0000-0000-0000-000000000002', NULL, 'Contato',           2, '#6366f1', true, true, 'franquia'),
  ('50000001-0000-0000-0000-000000000003', NULL, 'Reunião Agendada',  3, '#8b5cf6', true, true, 'franquia'),
  ('50000001-0000-0000-0000-000000000004', NULL, 'Proposta/COF',      4, '#a855f7', true, true, 'franquia'),
  ('50000001-0000-0000-0000-000000000005', NULL, 'Fechado',           5, '#10b981', true, true, 'franquia'),
  ('50000001-0000-0000-0000-000000000006', NULL, 'Perdido',           6, '#ef4444', true, true, 'franquia')
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem, cor = EXCLUDED.cor,
      is_sistema = EXCLUDED.is_sistema, ativo = EXCLUDED.ativo, pipeline = EXCLUDED.pipeline;

-- ----------------------------------------------------------------------------
-- 5) Seed de ~8 leads demo de FRANQUIA (pipeline='franquia')
--    Usa a 1ª empresa/unidade existentes para não nascer vazio. Idempotente por id.
--    responsavel_id NULL (sem dono ainda). Tipos: Ultracell / Quanta / Franquia.
-- ----------------------------------------------------------------------------
WITH base AS (
  SELECT
    (SELECT id FROM empresas ORDER BY criado_em NULLS LAST LIMIT 1)  AS empresa_id,
    (SELECT id FROM unidades WHERE ativa = true ORDER BY nome LIMIT 1) AS unidade_id
)
INSERT INTO crm_leads
  (id, empresa_id, unidade_id, etapa_id, responsavel_id, nome, email, telefone,
   origem, servico_interesse, valor_estimado, status, pipeline, tipo_lead, temperatura)
SELECT v.id, base.empresa_id, base.unidade_id, v.etapa_id, NULL,
       v.nome, v.email, v.telefone, v.origem, v.servico_interesse,
       v.valor_estimado, 'ativo', 'franquia', v.tipo_lead, v.temperatura
FROM base, (VALUES
  ('50000002-0000-0000-0000-000000000001'::uuid, '50000001-0000-0000-0000-000000000001'::uuid, 'Mariana Castro',   'mariana.castro@email.com',  '11991234501', 'site',          'Franquia',  120000, 'Franquia',  'quente'),
  ('50000002-0000-0000-0000-000000000002'::uuid, '50000001-0000-0000-0000-000000000001'::uuid, 'Eduardo Lemos',    'eduardo.lemos@email.com',   '21992234502', 'geolocalizado','Ultracell',  85000, 'Ultracell', 'morno'),
  ('50000002-0000-0000-0000-000000000003'::uuid, '50000001-0000-0000-0000-000000000002'::uuid, 'Patrícia Nunes',   'patricia.nunes@email.com',  '31993234503', 'instagram',    'Quanta',     95000, 'Quanta',    'morno'),
  ('50000002-0000-0000-0000-000000000004'::uuid, '50000001-0000-0000-0000-000000000003'::uuid, 'Rafael Andrade',   'rafael.andrade@email.com',  '41994234504', 'indicacao',    'Franquia',  150000, 'Franquia',  'quente'),
  ('50000002-0000-0000-0000-000000000005'::uuid, '50000001-0000-0000-0000-000000000002'::uuid, 'Camila Ferreira',  'camila.ferreira@email.com', '51995234505', 'google',       'Ultracell',  78000, 'Ultracell', 'frio'),
  ('50000002-0000-0000-0000-000000000006'::uuid, '50000001-0000-0000-0000-000000000004'::uuid, 'Bruno Tavares',    'bruno.tavares@email.com',   '71996234506', 'site',         'Franquia',  130000, 'Franquia',  'quente'),
  ('50000002-0000-0000-0000-000000000007'::uuid, '50000001-0000-0000-0000-000000000005'::uuid, 'Juliana Prado',    'juliana.prado@email.com',   '81997234507', 'whatsapp',     'Quanta',    102000, 'Quanta',    'quente'),
  ('50000002-0000-0000-0000-000000000008'::uuid, '50000001-0000-0000-0000-000000000006'::uuid, 'Henrique Sales',   'henrique.sales@email.com',  '85998234508', 'geolocalizado','Ultracell',  70000, 'Ultracell', 'frio')
) AS v(id, etapa_id, nome, email, telefone, origem, servico_interesse, valor_estimado, tipo_lead, temperatura)
WHERE base.empresa_id IS NOT NULL AND base.unidade_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DELETE FROM crm_leads  WHERE id::text LIKE '50000002-%';
--   DELETE FROM crm_etapas WHERE id::text LIKE '50000001-%';
--   ALTER TABLE crm_leads  DROP COLUMN IF EXISTS pipeline;
--   ALTER TABLE crm_leads  DROP COLUMN IF EXISTS tipo_lead;
--   ALTER TABLE crm_leads  DROP COLUMN IF EXISTS temperatura;
--   ALTER TABLE crm_etapas DROP COLUMN IF EXISTS pipeline;
--   (e restaurar o CHECK original de origem sem 'geolocalizado'/'site')
-- =============================================================================
