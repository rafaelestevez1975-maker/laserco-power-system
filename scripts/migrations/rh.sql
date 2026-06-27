-- =============================================================================
-- Migration — RH (Portal de RH nativo) + PONTO DIGITAL GPS
--   Paridade com o legado: legacy/index.html (Ponto Digital, buildPontoDigital ~8458;
--   PONTO_CFG ~8415) e legacy/portal-rh.html (Dashboard, Colaboradores, Ponto, Folha,
--   Férias e Ausências, Desempenho, Regras da Rede).
-- =============================================================================
-- CONTEXTO
--   O legado servia o RH como uma SPA React separada via <iframe src="portal-rh.html">
--   e o Ponto Digital guardava tudo em localStorage (PONTO_CFG / PONTO_REG). Aqui
--   recriamos cada tela como rota Next nativa, persistindo o estado em tabelas reais:
--
--     ponto_config        : a config do ponto (PONTO_CFG) por UNIDADE — raio da cerca
--                           virtual, lat/lng da base, chave Google Maps, modo padrão.
--     registros_ponto     : o espelho de ponto (PONTO_REG) — uma linha por marcação,
--                           com GPS, distância da base e validação da cerca (Haversine).
--     folha_pagamento     : a Folha (Salário Bruto/Líquido, INSS, IRRF, FGTS, 13º).
--     solicitacoes_ferias : Férias e Ausências (vacationRequests) — período aquisitivo,
--                           dias, aprovação.
--     atestados           : atestados médicos (collection atestados do portal).
--     rh_departamentos    : departamentos (tela Configurações do portal RH).
--     avaliacoes_desempenho / pdi / metas_colaborador : tela Desempenho (já consumidas
--                           por /rh/desempenho).
--     vagas / candidatos  : Recrutamento (já consumidas por /rh/recrutamento).
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   Tudo é CREATE TABLE/INDEX/POLICY IF NOT EXISTS / DROP POLICY IF EXISTS / ALTER ...
--   ADD COLUMN IF NOT EXISTS / contagem antes de semear. Se uma destas tabelas já
--   existir no schema base do lkii, o IF NOT EXISTS apenas a preserva. Rodar duas
--   vezes não quebra.
--
-- COMO APLICAR (manual — NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/rh.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) PONTO_CONFIG — config do Ponto Digital por unidade (legado PONTO_CFG).
--    Defaults do legado: raio 150 m, Florianópolis-Centro (-27.5954, -48.5480).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ponto_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id    uuid REFERENCES unidades(id) ON DELETE CASCADE,
  raio          integer NOT NULL DEFAULT 150,            -- raio da cerca virtual (m)
  uni_lat       numeric(10,6) NOT NULL DEFAULT -27.5954, -- latitude da base (unidade)
  uni_lng       numeric(10,6) NOT NULL DEFAULT -48.5480, -- longitude da base (unidade)
  maps_key      text NOT NULL DEFAULT '',                -- chave Google Maps API (vazio = OpenStreetMap)
  modo_padrao   text NOT NULL DEFAULT 'unidade'
                CHECK (modo_padrao IN ('unidade','casa')),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unidade_id)
);
CREATE INDEX IF NOT EXISTS idx_ponto_config_unidade ON ponto_config (unidade_id);

-- ----------------------------------------------------------------------------
-- 2) REGISTROS_PONTO — espelho de ponto (legado PONTO_REG). Consumida por /ponto.
--    tipo segue PONTO_TIPOS; validado_geo = dentro da cerca (dist<=raio, Haversine).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registros_ponto (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE CASCADE,
  unidade_id     uuid REFERENCES unidades(id) ON DELETE SET NULL,
  tipo           text NOT NULL
                 CHECK (tipo IN ('entrada','saida_almoco','volta_almoco','saida')),
  data_hora      timestamptz NOT NULL DEFAULT now(),
  lat            numeric(10,6),
  lng            numeric(10,6),
  distancia_m    integer,                                 -- distância da base (m) no momento da marcação
  validado_geo   boolean,                                 -- true=No local / false=Fora do local / null=sem GPS
  modo           text DEFAULT 'unidade'
                 CHECK (modo IN ('unidade','casa')),       -- presencial x home office
  fonte          text NOT NULL DEFAULT 'gps'
                 CHECK (fonte IN ('gps','manual','web')),
  ajustado_por   uuid REFERENCES perfis_usuario(id) ON DELETE SET NULL,
  motivo_ajuste  text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
-- Colunas novas (caso a tabela já exista no base sem elas).
ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS distancia_m integer;
ALTER TABLE registros_ponto ADD COLUMN IF NOT EXISTS modo        text DEFAULT 'unidade';
CREATE INDEX IF NOT EXISTS idx_reg_ponto_colab   ON registros_ponto (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_unidade ON registros_ponto (unidade_id);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_data    ON registros_ponto (data_hora DESC);

-- ----------------------------------------------------------------------------
-- 3) RH_DEPARTAMENTOS — tela Configurações do portal (cadastro de departamentos).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rh_departamentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);
CREATE INDEX IF NOT EXISTS idx_rh_dep_empresa ON rh_departamentos (empresa_id);

-- ----------------------------------------------------------------------------
-- 4) FOLHA_PAGAMENTO — Folha (legado tela Folha de Pagamento).
--    Proventos/descontos por competência (mês/ano) e colaborador.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folha_pagamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia     text NOT NULL,                           -- 'AAAA-MM'
  salario_bruto   numeric(12,2) NOT NULL DEFAULT 0,
  inss            numeric(12,2) NOT NULL DEFAULT 0,
  irrf            numeric(12,2) NOT NULL DEFAULT 0,
  fgts            numeric(12,2) NOT NULL DEFAULT 0,        -- depósito (8%) — não desconta do líquido
  outros_proventos numeric(12,2) NOT NULL DEFAULT 0,
  outros_descontos numeric(12,2) NOT NULL DEFAULT 0,
  decimo_terceiro numeric(12,2) NOT NULL DEFAULT 0,
  salario_liquido numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'aberta'
                  CHECK (status IN ('aberta','fechada','paga')),
  observacoes     text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, competencia)
);
CREATE INDEX IF NOT EXISTS idx_folha_colab ON folha_pagamento (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_folha_comp  ON folha_pagamento (competencia);

-- ----------------------------------------------------------------------------
-- 5) SOLICITACOES_FERIAS — Férias e Ausências (legado vacationRequests).
--    Período aquisitivo + dias solicitados + aprovação (pendência do dashboard).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitacoes_ferias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id      uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  periodo_aquisitivo  text,                                -- ex.: '2025/2026'
  data_inicio         date,
  data_fim            date,
  dias_solicitados    integer NOT NULL DEFAULT 0,
  vender_dias         integer NOT NULL DEFAULT 0,          -- abono pecuniário (1/3)
  status              text NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente','aprovada','reprovada','cancelada')),
  motivo              text,
  aprovado_por        uuid REFERENCES perfis_usuario(id) ON DELETE SET NULL,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ferias_colab  ON solicitacoes_ferias (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ferias_status ON solicitacoes_ferias (status);

-- ----------------------------------------------------------------------------
-- 6) ATESTADOS — atestados médicos (legado collection atestados).
--    Regra de entrega ao RH em até 2 dias úteis (campo data_entrega para conferir).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS atestados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_inicio     date,
  dias            integer NOT NULL DEFAULT 1,
  cid             text,
  data_entrega    date,                                    -- quando foi entregue ao RH
  status          text NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','aprovado','reprovado')),
  observacoes     text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_atestados_colab  ON atestados (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_atestados_status ON atestados (status);

-- ----------------------------------------------------------------------------
-- 7) DESEMPENHO — avaliacoes_desempenho / pdi / metas_colaborador.
--    (Consumidas por /rh/desempenho — criadas aqui se o base ainda não as tiver.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avaliacoes_desempenho (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id        uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  avaliador_id          uuid REFERENCES perfis_usuario(id) ON DELETE SET NULL,
  periodo               text,                              -- ex.: '2026-T2'
  nota_produtividade    numeric(5,2),
  nota_qualidade        numeric(5,2),
  nota_comportamento    numeric(5,2),
  nota_trabalho_equipe  numeric(5,2),
  nota_geral            numeric(5,2),
  observacoes           text,
  criado_em             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aval_colab ON avaliacoes_desempenho (colaborador_id);

CREATE TABLE IF NOT EXISTS pdi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  responsavel_id  uuid REFERENCES perfis_usuario(id) ON DELETE SET NULL,
  titulo          text NOT NULL,
  descricao       text,
  prazo           date,
  status          text NOT NULL DEFAULT 'em_andamento'
                  CHECK (status IN ('em_andamento','concluido','cancelado','atrasado')),
  progresso       integer NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pdi_colab ON pdi (colaborador_id);

CREATE TABLE IF NOT EXISTS metas_colaborador (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  indicador       text NOT NULL,
  valor_alvo      numeric(12,2),
  valor_realizado numeric(12,2),
  status          text NOT NULL DEFAULT 'em_andamento',
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metacolab_colab ON metas_colaborador (colaborador_id);

-- ----------------------------------------------------------------------------
-- 8) RECRUTAMENTO — vagas / candidatos (consumidas por /rh/recrutamento).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vagas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id  uuid REFERENCES unidades(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  cargo       text,
  status      text NOT NULL DEFAULT 'aberta'
              CHECK (status IN ('aberta','pausada','encerrada')),
  total_vagas integer NOT NULL DEFAULT 1,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vagas_unidade ON vagas (unidade_id);

CREATE TABLE IF NOT EXISTS candidatos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaga_id           uuid REFERENCES vagas(id) ON DELETE CASCADE,
  nome              text NOT NULL,
  email             text,
  telefone          text,
  cpf               text,
  fonte             text DEFAULT 'outro',
  estagio_kanban    text NOT NULL DEFAULT 'triagem',
  score_triagem_ia  integer,
  notas_internas    text,
  motivo_reprovacao text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cand_vaga    ON candidatos (vaga_id);
CREATE INDEX IF NOT EXISTS idx_cand_estagio ON candidatos (estagio_kanban);

-- ----------------------------------------------------------------------------
-- 9) RLS — leitura para qualquer autenticado; escrita para gestão de RH.
--    Papéis de gestão (espelham PAPEIS_GESTAO/ESCRITA usados nos actions):
--    admin_geral, gestor, gerente, recepcao, rh.
-- ----------------------------------------------------------------------------
ALTER TABLE ponto_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_ponto       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_departamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE folha_pagamento       ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_ferias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE atestados             ENABLE ROW LEVEL SECURITY;
ALTER TABLE avaliacoes_desempenho ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdi                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas_colaborador     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vagas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidatos            ENABLE ROW LEVEL SECURITY;

-- helper inline: usuário autenticado existe
--   USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()))
-- helper inline: usuário é gestão de RH
--   p.papel IN ('admin_geral','gestor','gerente','recepcao','rh')

DO $$
DECLARE
  t  text;
  tbls text[] := ARRAY[
    'ponto_config','registros_ponto','rh_departamentos','folha_pagamento',
    'solicitacoes_ferias','atestados','avaliacoes_desempenho','pdi',
    'metas_colaborador','vagas','candidatos'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_sel ON %I FOR SELECT
      USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()))
    $f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_rw ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_rw ON %I FOR ALL
      USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
              AND p.papel IN ('admin_geral','gestor','gerente','recepcao','rh')))
      WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
              AND p.papel IN ('admin_geral','gestor','gerente','recepcao','rh')))
    $f$, t, t);
  END LOOP;
END $$;

-- O registro do PRÓPRIO ponto (botões Entrada/Almoço/Saída) é feito por qualquer
-- colaborador autenticado, mesmo sem papel de gestão. Policy de INSERT extra que
-- libera inserir uma marcação cujo colaborador_id pertença ao usuário logado.
DROP POLICY IF EXISTS registros_ponto_self_ins ON registros_ponto;
CREATE POLICY registros_ponto_self_ins ON registros_ponto FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM colaboradores c
            WHERE c.id = registros_ponto.colaborador_id AND c.perfil_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 10) SEED — config de ponto por unidade ativa + departamentos padrão.
--     Idempotente (só insere o que falta).
-- ----------------------------------------------------------------------------
INSERT INTO ponto_config (unidade_id)
SELECT u.id FROM unidades u
WHERE u.ativa = true
  AND NOT EXISTS (SELECT 1 FROM ponto_config pc WHERE pc.unidade_id = u.id);

DO $$
DECLARE
  v_empresa uuid;
  v_dep     text;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;
  IF (SELECT count(*) FROM rh_departamentos WHERE empresa_id = v_empresa) = 0 THEN
    FOREACH v_dep IN ARRAY ARRAY['Operações','Comercial','Profissionais da Saúde','Administrativo','Marketing','Recepção'] LOOP
      INSERT INTO rh_departamentos (empresa_id, nome) VALUES (v_empresa, v_dep)
      ON CONFLICT (empresa_id, nome) DO NOTHING;
    END LOOP;
  END IF;
END $$;

COMMIT;
