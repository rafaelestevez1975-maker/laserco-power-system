-- =============================================================================
-- Migration — Marketing + Disco Virtual + Universidade Corporativa
-- Paridade com o legado (legacy/index.html):
--   · MARKETING        : buildMarketing (~8372), MKT_TREE/MKT_UPDATES/MKT_NEWS (8302-8349)
--   · DISCO VIRTUAL    : buildDisco (~9417), DISCO_FOLDERS/DISCO_FILES (9383-9401)
--   · UNIVERSIDADE     : buildUni/uniRender (~5950), UNI_TRILHAS/UNI_ALUNOS (5908-5946)
-- =============================================================================
-- CONTEXTO
--   Nenhuma destas estruturas existe no backend lkii. Esta migration cria as
--   tabelas, habilita RLS por empresa e faz seed com o conteúdo do legado para
--   que a UI já abra populada. Tudo idempotente.
--
--   Arquivos (Disco) usam o bucket de Storage 'disco-virtual' (PRIVADO). O caminho
--   do objeto fica em disco_arquivos.arquivo_path; o download é via signed URL.
--
-- COMO APLICAR (manual — NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/marketing.sql
--   E crie o bucket de Storage 'disco-virtual' (privado) no painel do Supabase.
-- =============================================================================

BEGIN;

-- ===========================================================================
-- MARKETING
-- ===========================================================================

-- Árvore de pastas/arquivos de materiais (MKT_TREE no legado, 8302).
-- Modelada como árvore por parent_id; folhas com kind='arquivo' guardam o nome
-- do arquivo (e link Canva opcional). Pastas têm kind='pasta'.
CREATE TABLE IF NOT EXISTS mkt_materiais (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES mkt_materiais(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'pasta',     -- 'pasta' | 'arquivo'
  nome        text NOT NULL,
  link_url    text,                              -- link Canva/externo p/ arquivos editáveis
  ordem       integer NOT NULL DEFAULT 0,
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mkt_materiais_kind_check CHECK (kind IN ('pasta', 'arquivo'))
);
CREATE INDEX IF NOT EXISTS idx_mkt_materiais_emp    ON mkt_materiais (empresa_id);
CREATE INDEX IF NOT EXISTS idx_mkt_materiais_parent ON mkt_materiais (parent_id);

-- Feed de atualizações da rede (MKT_UPDATES, 8337). "novo=true" => não-lido.
CREATE TABLE IF NOT EXISTS mkt_atualizacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  data_ref    date NOT NULL DEFAULT current_date,
  tipo        text NOT NULL DEFAULT 'Campanha',
  descricao   text NOT NULL,                     -- "O que é" (campo o no legado)
  onde        text,                              -- caminho "A › B › C" (campo onde)
  novo        boolean NOT NULL DEFAULT true,     -- não-lido
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_atualizacoes_emp ON mkt_atualizacoes (empresa_id);

-- Notícias da rede (MKT_NEWS, 8345).
CREATE TABLE IF NOT EXISTS mkt_noticias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  data_ref    date NOT NULL DEFAULT current_date,
  titulo      text NOT NULL,
  resumo      text,
  autor       text NOT NULL DEFAULT 'Marketing da Rede',
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mkt_noticias_emp ON mkt_noticias (empresa_id);

-- ===========================================================================
-- DISCO VIRTUAL
-- ===========================================================================

-- Config do Disco por empresa: vínculo opcional com Google Drive (DISCO_CFG, 9381).
CREATE TABLE IF NOT EXISTS disco_config (
  empresa_id   uuid PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  drive_linked boolean NOT NULL DEFAULT false,
  drive_url    text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Pastas hierárquicas (DISCO_FOLDERS, 9383).
CREATE TABLE IF NOT EXISTS disco_pastas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES disco_pastas(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  por         text NOT NULL DEFAULT 'Administração',
  drive       boolean NOT NULL DEFAULT false,    -- sincronizada com Google Drive
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disco_pastas_emp    ON disco_pastas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_disco_pastas_parent ON disco_pastas (parent_id);

-- Arquivos (DISCO_FILES, 9393). arquivo_path -> objeto no bucket 'disco-virtual'.
CREATE TABLE IF NOT EXISTS disco_arquivos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pasta_id     uuid REFERENCES disco_pastas(id) ON DELETE CASCADE,  -- null = raiz
  nome         text NOT NULL,
  tipo         text,                             -- ext: pdf|xlsx|doc|img|video|zip...
  bytes        bigint NOT NULL DEFAULT 0,
  arquivo_path text,                             -- caminho no Storage (null = exemplo/Drive)
  por          text NOT NULL DEFAULT 'Administração',
  drive        boolean NOT NULL DEFAULT false,
  criado_por   uuid,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disco_arquivos_emp   ON disco_arquivos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_disco_arquivos_pasta ON disco_arquivos (pasta_id);

-- ===========================================================================
-- UNIVERSIDADE CORPORATIVA
-- ===========================================================================

-- Trilhas por cargo (UNI_TRILHAS, 5908).
CREATE TABLE IF NOT EXISTS uni_trilhas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  slug        text NOT NULL,                     -- id curto do legado (franqueado, gerente...)
  nome        text NOT NULL,
  role        text NOT NULL,                     -- cargo
  cor         text NOT NULL DEFAULT '#8A2A41',
  prazo       text NOT NULL DEFAULT '30 dias',
  ordem       integer NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_uni_trilhas_emp ON uni_trilhas (empresa_id);

-- Etapas (vídeos) de cada trilha (etapas[], 5909). 'final' fica como prova_final na trilha? Não:
-- a prova final é a etapa com is_final=true (sem vídeo). prova é JSON: [{q, opts[], c}].
CREATE TABLE IF NOT EXISTS uni_etapas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trilha_id   uuid NOT NULL REFERENCES uni_trilhas(id) ON DELETE CASCADE,
  ordem       integer NOT NULL DEFAULT 0,
  nome        text NOT NULL,
  yt          text,                              -- link/ID YouTube (não listado)
  min         integer NOT NULL DEFAULT 10,
  prova       jsonb NOT NULL DEFAULT '[]'::jsonb,-- [{q:text, opts:[text], c:int}]
  is_final    boolean NOT NULL DEFAULT false,    -- prova final da trilha (sem vídeo)
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uni_etapas_trilha ON uni_etapas (trilha_id);

-- Progresso/nota por usuário e etapa (UNI_DONE/UNI_NOTAS, 5947).
-- etapa_key = '<ordem>' ou 'final' (espelha a chave id:idx do legado).
CREATE TABLE IF NOT EXISTS uni_progresso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  trilha_id   uuid NOT NULL REFERENCES uni_trilhas(id) ON DELETE CASCADE,
  perfil_id   uuid NOT NULL,                     -- colaborador (auth.uid)
  etapa_key   text NOT NULL,                     -- '0','1',... ou 'final'
  concluido   boolean NOT NULL DEFAULT false,
  nota        numeric(4,1),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trilha_id, perfil_id, etapa_key)
);
CREATE INDEX IF NOT EXISTS idx_uni_progresso_emp ON uni_progresso (empresa_id);
CREATE INDEX IF NOT EXISTS idx_uni_progresso_perfil ON uni_progresso (perfil_id);

-- ===========================================================================
-- RLS — habilita e cria policies por empresa (alinhado às demais tabelas).
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mkt_materiais','mkt_atualizacoes','mkt_noticias',
    'disco_config','disco_pastas','disco_arquivos',
    'uni_trilhas','uni_progresso'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_emp ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_emp ON %I
        USING (empresa_id IN (
          SELECT u.empresa_id FROM perfis_usuario p
          JOIN unidades u ON u.id = p.unidade_id
          WHERE p.id = auth.uid()
        ))
        WITH CHECK (empresa_id IN (
          SELECT u.empresa_id FROM perfis_usuario p
          JOIN unidades u ON u.id = p.unidade_id
          WHERE p.id = auth.uid()
        ))
    $f$, t, t);
  END LOOP;
END $$;

-- uni_etapas não tem empresa_id direto — herda da trilha.
ALTER TABLE uni_etapas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uni_etapas_emp ON uni_etapas;
CREATE POLICY uni_etapas_emp ON uni_etapas
  USING (trilha_id IN (
    SELECT tr.id FROM uni_trilhas tr
    WHERE tr.empresa_id IN (
      SELECT u.empresa_id FROM perfis_usuario p
      JOIN unidades u ON u.id = p.unidade_id
      WHERE p.id = auth.uid()
    )
  ))
  WITH CHECK (trilha_id IN (
    SELECT tr.id FROM uni_trilhas tr
    WHERE tr.empresa_id IN (
      SELECT u.empresa_id FROM perfis_usuario p
      JOIN unidades u ON u.id = p.unidade_id
      WHERE p.id = auth.uid()
    )
  ));

COMMIT;

-- =============================================================================
-- SEED — popula a 1ª empresa com o conteúdo do legado (idempotente: só insere
-- se a empresa ainda não tiver registros). Roda fora da transação principal.
-- =============================================================================
DO $$
DECLARE
  emp uuid;
BEGIN
  SELECT id INTO emp FROM empresas ORDER BY criada_em ASC NULLS LAST LIMIT 1;
  IF emp IS NULL THEN RETURN; END IF;
  -- SEM conteúdo fake de Marketing/Notícias/Materiais/Disco/Universidade (removido a pedido
  -- do cliente: nada de dado inventado, incl. vídeos rickroll). As áreas nascem VAZIAS e a
  -- franqueadora sobe o conteúdo REAL (campanhas, materiais, arquivos, trilhas/vídeos pelo
  -- CRUD do módulo). A UI mostra empty-state honesto enquanto não houver conteúdo real.
  INSERT INTO disco_config (empresa_id) VALUES (emp) ON CONFLICT (empresa_id) DO NOTHING;
END $$;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS uni_progresso, uni_etapas, uni_trilhas,
--     disco_arquivos, disco_pastas, disco_config,
--     mkt_noticias, mkt_atualizacoes, mkt_materiais CASCADE;
-- =============================================================================
