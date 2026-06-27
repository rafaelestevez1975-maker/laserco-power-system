-- =============================================================================
-- Migration — Jurídico (paridade com o legado: Notificações extrajudiciais,
--             documentos contratuais e modelos de notificação)
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html, bloco "Jurídico" ~4896-5009) tem três peças
--   que NÃO existem no backend lkii:
--     1) FILA DE NOTIFICAÇÕES geradas a partir de recebíveis em atraso
--        (JUR_NOTIFS 4911) — assunto + corpo padrão montados com os dados da
--        unidade, status pendente/enviada, vínculo com o recebível (fin_recebiveis).
--     2) MODELOS de notificação editáveis (JUR_TEMPLATES 4900) — 7 pré-prontos
--        com merge fields {unidade},{franqueado},{cnpj},{prazo},{data}.
--     3) DOCUMENTOS contratuais por unidade (JUR_DOCS 4897) — Contrato de
--        Franquia, Pré-contrato e COF (arquivo + data).
--
--   Integração: a fila de notificações se liga ao Financeiro Franqueadora pela
--   coluna fin_recebiveis.jur_id (já existente em scripts/migrations/financeiro.sql).
--
-- COMO APLICAR (manual — esta migration NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/juridico.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) NOTIFICAÇÕES JURÍDICAS — fila gerada a partir de recebíveis em atraso.
--    Espelha JUR_NOTIFS (legado 4911) + finGerarNotifJuridica (4920-4931).
--    Snapshot dos dados da unidade/débito no momento da geração (relatório histórico).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juridico_notificacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE SET NULL,
  fin_id        uuid REFERENCES fin_recebiveis(id) ON DELETE SET NULL, -- recebível de origem
  unidade_nome  text NOT NULL DEFAULT '',
  franqueado    text,
  cnpj          text,
  categoria     text,
  ref           text,                              -- competência/parcela (r.ref)
  valor         numeric(14,2) NOT NULL DEFAULT 0,
  vencimento    date,
  dias_atraso   integer NOT NULL DEFAULT 0,
  assunto       text NOT NULL DEFAULT '',
  corpo         text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'pendente'   -- pendente | enviada
                CHECK (status IN ('pendente', 'enviada')),
  enviada_em    timestamptz,                       -- criadoEm do legado (data de envio)
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jur_notif_empresa ON juridico_notificacoes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_jur_notif_status  ON juridico_notificacoes (status);
CREATE INDEX IF NOT EXISTS idx_jur_notif_fin     ON juridico_notificacoes (fin_id);
-- Evita duplicar notificação para o mesmo recebível (flag jurId do legado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_jur_notif_fin ON juridico_notificacoes (fin_id) WHERE fin_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2) MODELOS DE NOTIFICAÇÃO — templates editáveis por empresa.
--    Espelha JUR_TEMPLATES (legado 4900-4908). Merge fields no corpo:
--    {unidade},{franqueado},{cnpj},{prazo},{data}.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juridico_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        text NOT NULL DEFAULT 'Novo modelo de notificação',
  assunto     text NOT NULL DEFAULT '',
  corpo       text NOT NULL DEFAULT '',
  ordem       integer NOT NULL DEFAULT 0,
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jur_templates_empresa ON juridico_templates (empresa_id);

-- ----------------------------------------------------------------------------
-- 3) DOCUMENTOS CONTRATUAIS por unidade.
--    Espelha JUR_DOCS (legado 4897): tipo contrato | pre | cof.
--    Um registro por (unidade, tipo). Armazena nome do arquivo + data.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juridico_documentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id  uuid NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tipo        text NOT NULL                        -- contrato | pre | cof
              CHECK (tipo IN ('contrato', 'pre', 'cof')),
  arquivo     text NOT NULL,                        -- nome do PDF anexado
  storage_path text,                                -- caminho no Supabase Storage (opcional)
  data_doc    date NOT NULL DEFAULT current_date,   -- data do anexo
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_jur_docs_empresa ON juridico_documentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_jur_docs_unidade ON juridico_documentos (unidade_id);

-- ----------------------------------------------------------------------------
-- 4) RLS — habilita e cria policies por empresa (alinhado às demais tabelas).
-- ----------------------------------------------------------------------------
ALTER TABLE juridico_notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridico_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE juridico_documentos   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jur_notif_emp ON juridico_notificacoes;
CREATE POLICY jur_notif_emp ON juridico_notificacoes
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

DROP POLICY IF EXISTS jur_templates_emp ON juridico_templates;
CREATE POLICY jur_templates_emp ON juridico_templates
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

DROP POLICY IF EXISTS jur_docs_emp ON juridico_documentos;
CREATE POLICY jur_docs_emp ON juridico_documentos
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

-- ----------------------------------------------------------------------------
-- 5) SEED — 7 modelos de notificação pré-prontos (JUR_TEMPLATES 4900-4908).
--    Aplicado para a 1ª empresa (matriz) apenas se ainda não houver templates.
--    Textos COPIADOS FIELMENTE do legado.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY criada_em ASC LIMIT 1;
  IF v_empresa IS NOT NULL AND NOT EXISTS (SELECT 1 FROM juridico_templates WHERE empresa_id = v_empresa) THEN
    INSERT INTO juridico_templates (empresa_id, nome, assunto, corpo, ordem) VALUES
    (v_empresa, 'Royalties em atraso — 1ª notificação',
     'Notificação — Royalties em atraso · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Constatamos que os royalties referentes à unidade {unidade} (CNPJ {cnpj}) encontram-se em atraso. Solicitamos a regularização no prazo de {prazo} a contar do recebimento desta.' || E'\n\n' ||
     'Permanecemos à disposição para tratar de eventual repactuação.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico — Laser&Co' || E'\n' || '{data}', 1),
    (v_empresa, 'Royalties em atraso — 2ª notificação',
     '2ª Notificação — Royalties em atraso · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Reiteramos a notificação anterior quanto ao atraso dos royalties da unidade {unidade}. A persistência da inadimplência poderá ensejar as medidas previstas no contrato de franquia, inclusive a sua rescisão.' || E'\n\n' ||
     'Concedemos prazo final de {prazo} para a quitação.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico — Laser&Co' || E'\n' || '{data}', 2),
    (v_empresa, 'Uso indevido da marca — 1ª notificação',
     'Notificação — Uso indevido da marca · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Identificamos uso da marca Laser&Co em desacordo com o Manual de Identidade e o contrato de franquia na unidade {unidade}. Solicitamos a imediata adequação e a remoção de qualquer material irregular no prazo de {prazo}.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico — Laser&Co' || E'\n' || '{data}', 3),
    (v_empresa, 'Uso indevido da marca — 2ª notificação',
     '2ª Notificação — Uso indevido da marca · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Apesar da notificação anterior, persiste o uso indevido da marca na unidade {unidade}. Notificamos, em caráter final, para cessar o uso irregular em {prazo}, sob pena das sanções contratuais e legais cabíveis.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico — Laser&Co' || E'\n' || '{data}', 4),
    (v_empresa, 'Notificação de rescisão contratual',
     'Notificação de rescisão contratual · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Nos termos do contrato de franquia e da Lei 13.966/2019, notificamos a rescisão do contrato relativo à unidade {unidade} (CNPJ {cnpj}), em razão de descumprimento de obrigações essenciais, a produzir efeitos conforme as cláusulas pactuadas.' || E'\n\n' ||
     'Ficam mantidas as obrigações de não concorrência e de cessação do uso da marca.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico — Laser&Co' || E'\n' || '{data}', 5),
    (v_empresa, 'Descumprimento de padrões da rede',
     'Notificação — Descumprimento de padrões · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Em auditoria/checklist da unidade {unidade} foram constatados desvios aos padrões operacionais da rede. Solicitamos plano de ação e regularização no prazo de {prazo}, sob acompanhamento da equipe de Operações.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico — Laser&Co' || E'\n' || '{data}', 6),
    (v_empresa, 'Inadimplência — taxa de franquia / fundo de marketing',
     'Notificação — Inadimplência de taxas · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Constatamos inadimplência relativa à taxa de franquia/fundo de marketing da unidade {unidade}. Solicitamos a regularização em {prazo}, evitando a incidência de encargos e medidas contratuais.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico — Laser&Co' || E'\n' || '{data}', 7);
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS juridico_notificacoes;
--   DROP TABLE IF EXISTS juridico_templates;
--   DROP TABLE IF EXISTS juridico_documentos;
-- =============================================================================
