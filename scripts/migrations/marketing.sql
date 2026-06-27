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
  v_tr uuid;
BEGIN
  SELECT id INTO emp FROM empresas ORDER BY criada_em ASC NULLS LAST LIMIT 1;
  IF emp IS NULL THEN RAISE NOTICE 'Sem empresa — seed pulado.'; RETURN; END IF;

  -- ---- Marketing: atualizações (MKT_UPDATES) ----
  IF NOT EXISTS (SELECT 1 FROM mkt_atualizacoes WHERE empresa_id = emp) THEN
    INSERT INTO mkt_atualizacoes (empresa_id, data_ref, tipo, descricao, onde, novo) VALUES
      (emp,'2026-06-14','Campanha','Campanha "Verão Renova" — 5 novas artes (feed, stories, reels)','Campanhas › Ano 2026 › Campanha do mês › Verão Renova',true),
      (emp,'2026-06-13','Datas','Artes de Dia dos Namorados e Festa Junina','Campanhas › Calendário promocional trimestral · 2026 › Artes de datas comemorativas › Junho',true),
      (emp,'2026-06-12','Conteúdo','Pack de reposts de Junho atualizado','Banco de Imagens & Vídeos › Conteúdos prontos para repostar',true),
      (emp,'2026-06-10','Tráfego','Novos criativos de tráfego pago — Verão Renova','Banco de Imagens & Vídeos › Tráfego Pago › Criativos › Campanhas › Verão Renova',false),
      (emp,'2026-06-06','Redes Sociais','Pacote de Instagram de Junho (posts + legendas)','Redes Sociais › Materiais › Junho › Instagram › Peças',false),
      (emp,'2026-06-02','Marca','Manual de uso da marca revisado (v3)','Extras › Manual de uso da marca',false);
  END IF;

  -- ---- Marketing: notícias (MKT_NEWS) ----
  IF NOT EXISTS (SELECT 1 FROM mkt_noticias WHERE empresa_id = emp) THEN
    INSERT INTO mkt_noticias (empresa_id, data_ref, titulo, resumo, autor) VALUES
      (emp,'2026-06-13','Laser&Co chega a 42 unidades em operação','A rede acelera a expansão e supera a marca de 42 unidades ativas em 12 estados. Confira o mapa atualizado e as próximas inaugurações.','Marketing da Rede'),
      (emp,'2026-06-09','Campanha "Verão Renova" no ar a partir de 16/06','Materiais completos disponíveis na pasta de Campanhas. Alinhe o cronograma de postagens com o calendário promocional.','Marketing da Rede'),
      (emp,'2026-06-03','Novo protocolo de PDRN: como divulgar','Time clínico e de marketing prepararam vídeos e artes para divulgação do novo protocolo. Veja no Banco de Imagens & Vídeos.','Comunicação');
  END IF;

  -- ---- Marketing: árvore de materiais (MKT_TREE) — raízes + 1 nível de subpastas/arquivos ----
  IF NOT EXISTS (SELECT 1 FROM mkt_materiais WHERE empresa_id = emp) THEN
    -- Campanhas
    WITH r AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) VALUES (emp,NULL,'pasta','Campanhas',1) RETURNING id),
    ano AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) SELECT emp,id,'pasta','Ano 2026',1 FROM r RETURNING id),
    cm AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) SELECT emp,id,'pasta','Campanha do mês',1 FROM ano RETURNING id),
    vr AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) SELECT emp,id,'pasta','Verão Renova',1 FROM cm RETURNING id)
    INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem)
      SELECT emp, vr.id, 'arquivo', x.n, x.o FROM vr,
        (VALUES ('Feed 1080×1080 (PNG)',1),('Stories 1080×1920 (PNG)',2),('Reels 9:16 (MP4)',3),('Banner site (JPG)',4),('Texto/legenda (TXT)',5)) AS x(n,o);

    -- Banco de Imagens & Vídeos (raiz + Conteúdos prontos)
    WITH b AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) VALUES (emp,NULL,'pasta','Banco de Imagens & Vídeos',2) RETURNING id),
    cp AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) SELECT emp,id,'pasta','Conteúdos prontos para repostar',1 FROM b RETURNING id)
    INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem)
      SELECT emp, cp.id, 'arquivo', x.n, x.o FROM cp,
        (VALUES ('Pack Junho (ZIP)',1),('Pack Inverno (ZIP)',2),('Frases para Stories (PNG)',3)) AS x(n,o);

    -- Materiais Físicos (raiz com arquivos diretos numa subpasta)
    WITH m AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) VALUES (emp,NULL,'pasta','Materiais Físicos',3) RETURNING id),
    ad AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) SELECT emp,id,'pasta','Adesivos de vitrine',1 FROM m RETURNING id)
    INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem)
      SELECT emp, ad.id, 'arquivo', x.n, x.o FROM ad,
        (VALUES ('Adesivo promo (PDF/CDR)',1),('Adesivo institucional (PDF)',2)) AS x(n,o);

    -- Redes Sociais (placeholder raiz)
    INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) VALUES (emp,NULL,'pasta','Redes Sociais',4);

    -- Extras + Templates editáveis (Canva, com link)
    WITH ex AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) VALUES (emp,NULL,'pasta','Extras',5) RETURNING id),
    tp AS (INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, ordem) SELECT emp,id,'pasta','Templates editáveis (Canva)',1 FROM ex RETURNING id)
    INSERT INTO mkt_materiais (empresa_id, parent_id, kind, nome, link_url, ordem)
      SELECT emp, tp.id, 'arquivo', x.n, 'https://www.canva.com/', x.o FROM tp,
        (VALUES ('Feed editável (link Canva)',1),('Stories editável (link Canva)',2),('Carrossel editável (link Canva)',3)) AS x(n,o);
  END IF;

  -- ---- Disco Virtual: config + pastas + arquivos (DISCO_FOLDERS/DISCO_FILES) ----
  INSERT INTO disco_config (empresa_id) VALUES (emp) ON CONFLICT (empresa_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM disco_pastas WHERE empresa_id = emp) THEN
    WITH ins AS (
      INSERT INTO disco_pastas (empresa_id, parent_id, nome, por, drive) VALUES
        (emp,NULL,'Planilhas da Rede','Administração',true),
        (emp,NULL,'Materiais Técnicos (PDF)','Administração',false),
        (emp,NULL,'Treinamentos','Administração',false),
        (emp,NULL,'Marketing','Administração',true),
        (emp,NULL,'Contratos & Modelos','Administração',false),
        (emp,NULL,'Manuais Operacionais','Administração',false)
      RETURNING id, nome
    )
    -- subpastas de "Materiais Técnicos (PDF)"
    INSERT INTO disco_pastas (empresa_id, parent_id, nome, por, drive)
      SELECT emp, ins.id, x.n, 'Administração', false FROM ins, (VALUES ('Equipamentos'),('Protocolos Clínicos')) AS x(n)
      WHERE ins.nome = 'Materiais Técnicos (PDF)';

    -- arquivos de exemplo (arquivo_path NULL => "disponível na nuvem da rede")
    INSERT INTO disco_arquivos (empresa_id, pasta_id, nome, tipo, bytes, por, drive)
      SELECT emp, p.id, 'Controle de Estoque - Rede.xlsx','xlsx',184320,'Administração',true FROM disco_pastas p WHERE p.empresa_id=emp AND p.nome='Planilhas da Rede';
    INSERT INTO disco_arquivos (empresa_id, pasta_id, nome, tipo, bytes, por, drive)
      SELECT emp, p.id, 'Metas por Unidade 2026.xlsx','xlsx',96211,'Administração',true FROM disco_pastas p WHERE p.empresa_id=emp AND p.nome='Planilhas da Rede';
    INSERT INTO disco_arquivos (empresa_id, pasta_id, nome, tipo, bytes, por, drive)
      SELECT emp, p.id, 'Manual UltraCel - Operação.pdf','pdf',2411520,'Administração',false FROM disco_pastas p WHERE p.empresa_id=emp AND p.nome='Equipamentos';
    INSERT INTO disco_arquivos (empresa_id, pasta_id, nome, tipo, bytes, por, drive)
      SELECT emp, p.id, 'Protocolo Depilação a Laser.pdf','pdf',1342177,'Camila Souza',false FROM disco_pastas p WHERE p.empresa_id=emp AND p.nome='Protocolos Clínicos';
    INSERT INTO disco_arquivos (empresa_id, pasta_id, nome, tipo, bytes, por, drive)
      SELECT emp, p.id, 'Treinamento Atendimento - Slides.pdf','pdf',5242880,'Administração',false FROM disco_pastas p WHERE p.empresa_id=emp AND p.nome='Treinamentos';
    INSERT INTO disco_arquivos (empresa_id, pasta_id, nome, tipo, bytes, por, drive)
      SELECT emp, p.id, 'Modelo de Contrato Laser&Club.docx','doc',73400,'Jurídico',false FROM disco_pastas p WHERE p.empresa_id=emp AND p.nome='Contratos & Modelos';
    INSERT INTO disco_arquivos (empresa_id, pasta_id, nome, tipo, bytes, por, drive)
      SELECT emp, p.id, 'Manual de Padronização - Loja.pdf','pdf',3355443,'Administração',false FROM disco_pastas p WHERE p.empresa_id=emp AND p.nome='Manuais Operacionais';
  END IF;

  -- ---- Universidade: 5 trilhas com etapas + prova final (UNI_TRILHAS) ----
  IF NOT EXISTS (SELECT 1 FROM uni_trilhas WHERE empresa_id = emp) THEN
    -- Franqueado
    INSERT INTO uni_trilhas (empresa_id, slug, nome, role, cor, prazo, ordem) VALUES (emp,'franqueado','Trilha do Franqueado','Franqueado','#8A2A41','30 dias',1) RETURNING id INTO v_tr;
    INSERT INTO uni_etapas (trilha_id, ordem, nome, yt, min, prova, is_final) VALUES
      (v_tr,0,'Cultura e propósito Laser&Co','dQw4w9WgXcQ',12,'[{"q":"O que diferencia a Laser&Co no mercado?","opts":["Apenas o preço","Tecnologia, padronização e experiência do cliente","Localização"],"c":1}]',false),
      (v_tr,1,'Gestão financeira da unidade','dQw4w9WgXcQ',24,'[{"q":"O que é o ponto de equilíbrio?","opts":["Lucro máximo","Receita que cobre todos os custos","Faturamento bruto"],"c":1}]',false),
      (v_tr,2,'Indicadores e funil de vendas','dQw4w9WgXcQ',20,'[{"q":"Qual indicador mede a eficiência da equipe na avaliação?","opts":["Ticket médio","Taxa de conversão","No-show"],"c":1}]',false),
      (v_tr,3,'Padrões operacionais e checklist','dQw4w9WgXcQ',18,'[{"q":"Com que frequência roda o checklist de indicadores?","opts":["Diária","Semanal","Anual"],"c":1}]',false),
      (v_tr,99,'Prova final — Trilha do Franqueado',NULL,0,'[{"q":"O curso online é pré-requisito para o treinamento presencial?","opts":["Não","Sim, obrigatório","Apenas recomendado"],"c":1},{"q":"Quem dá suporte às piores notas do checklist?","opts":["Marketing","Comercial","Financeiro"],"c":1}]',true);

    -- Gerente / Sub Gerente
    INSERT INTO uni_trilhas (empresa_id, slug, nome, role, cor, prazo, ordem) VALUES (emp,'gerente','Trilha do Gerente e Sub Gerente','Gerente / Sub Gerente','#6E2032','25 dias',2) RETURNING id INTO v_tr;
    INSERT INTO uni_etapas (trilha_id, ordem, nome, yt, min, prova, is_final) VALUES
      (v_tr,0,'Liderança de equipe de loja','dQw4w9WgXcQ',16,'[{"q":"Liderar pelo exemplo significa…","opts":["Cobrar sem fazer","Praticar o padrão que se espera da equipe","Delegar tudo"],"c":1}]',false),
      (v_tr,1,'Gestão da agenda e ocupação','dQw4w9WgXcQ',14,'[{"q":"Como reduzir janelas ociosas?","opts":["Encaixes e lista de espera","Fechar mais cedo","Ignorar no-show"],"c":0}]',false),
      (v_tr,2,'Rotina de vendas e metas','dQw4w9WgXcQ',22,'[{"q":"Meta abaixo de 80% gera premiação?","opts":["Sim","Não","Depende"],"c":1}]',false),
      (v_tr,99,'Prova final — Trilha do Gerente e Sub Gerente',NULL,0,'[{"q":"Qual a função do gerente no funil?","opts":["Apenas atender","Garantir conversão e comparecimento","Cuidar do estoque"],"c":1}]',true);

    -- Consultora de Vendas
    INSERT INTO uni_trilhas (empresa_id, slug, nome, role, cor, prazo, ordem) VALUES (emp,'consultora','Trilha da Consultora de Vendas','Consultora de Vendas','#C79433','20 dias',3) RETURNING id INTO v_tr;
    INSERT INTO uni_etapas (trilha_id, ordem, nome, yt, min, prova, is_final) VALUES
      (v_tr,0,'Atendimento e acolhimento','dQw4w9WgXcQ',10,'[{"q":"O primeiro contato deve ser…","opts":["Frio e objetivo","Acolhedor e consultivo","Apressado"],"c":1}]',false),
      (v_tr,1,'Avaliação e oferta','dQw4w9WgXcQ',18,'[{"q":"A oferta deve ser feita…","opts":["Sem avaliar","Com base na avaliação e necessidade","Sempre a mais cara"],"c":1}]',false),
      (v_tr,2,'Fechamento e revenda','dQw4w9WgXcQ',16,'[{"q":"Revenda é…","opts":["Vender para quem nunca comprou","Nova compra de quem já é cliente","Devolução"],"c":1}]',false),
      (v_tr,3,'Pós-venda e fidelização','dQw4w9WgXcQ',12,'[{"q":"Cashback do clube serve para…","opts":["Nada","Crédito em outras compras","Pagar salário"],"c":1}]',false),
      (v_tr,99,'Prova final — Trilha da Consultora de Vendas',NULL,0,'[{"q":"Qual etapa do funil a consultora mais influencia?","opts":["Agendamento","Conversão","Cancelamento"],"c":1}]',true);

    -- Profissional da Saúde
    INSERT INTO uni_trilhas (empresa_id, slug, nome, role, cor, prazo, ordem) VALUES (emp,'saude','Trilha do Profissional da Saúde','Profissional da Saúde','#1F9D6B','30 dias',4) RETURNING id INTO v_tr;
    INSERT INTO uni_etapas (trilha_id, ordem, nome, yt, min, prova, is_final) VALUES
      (v_tr,0,'Biossegurança e protocolos','dQw4w9WgXcQ',20,'[{"q":"EPIs devem ser usados…","opts":["Só às vezes","Em todos os atendimentos","Nunca"],"c":1}]',false),
      (v_tr,1,'Protocolo PDRN e Exossomos','dQw4w9WgXcQ',26,'[{"q":"PDRN atua principalmente na…","opts":["Depilação","Bioestimulação e rejuvenescimento","Limpeza"],"c":1}]',false),
      (v_tr,2,'Ultrassom microfocado','dQw4w9WgXcQ',24,'[{"q":"UltraCel é indicado para…","opts":["Manchas","Firmeza e flacidez","Acne"],"c":1}]',false),
      (v_tr,3,'Anamnese e LGPD','dQw4w9WgXcQ',14,'[{"q":"A anamnese digital é…","opts":["Opcional","Obrigatória antes do procedimento","Só para idosos"],"c":1}]',false),
      (v_tr,99,'Prova final — Trilha do Profissional da Saúde',NULL,0,'[{"q":"Sem o curso online concluído, o profissional pode evoluir no presencial?","opts":["Sim","Não","Talvez"],"c":1}]',true);

    -- Office (Onboarding)
    INSERT INTO uni_trilhas (empresa_id, slug, nome, role, cor, prazo, ordem) VALUES (emp,'onboard','Onboarding — Equipe Office','Office (Onboarding)','#3D7FD1','15 dias',5) RETURNING id INTO v_tr;
    INSERT INTO uni_etapas (trilha_id, ordem, nome, yt, min, prova, is_final) VALUES
      (v_tr,0,'Bem-vindo à Laser&Co','dQw4w9WgXcQ',8,'[{"q":"A Universidade Corporativa serve para…","opts":["Lazer","Treinar e padronizar a rede","Vender produtos"],"c":1}]',false),
      (v_tr,1,'Estrutura da franqueadora','dQw4w9WgXcQ',12,'[{"q":"Os departamentos se comunicam por…","opts":["Telepatia","Chamados e comunicados","Carta"],"c":1}]',false),
      (v_tr,2,'Ferramentas e sistemas','dQw4w9WgXcQ',15,'[{"q":"Onde acompanhamos indicadores das unidades?","opts":["No checklist e dashboards","No e-mail pessoal","Em lugar nenhum"],"c":0}]',false),
      (v_tr,99,'Prova final — Onboarding Office',NULL,0,'[{"q":"Qual canal usar para falar com outro departamento?","opts":["WhatsApp pessoal","Chamados","Recado verbal"],"c":1}]',true);
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS uni_progresso, uni_etapas, uni_trilhas,
--     disco_arquivos, disco_pastas, disco_config,
--     mkt_noticias, mkt_atualizacoes, mkt_materiais CASCADE;
-- =============================================================================
