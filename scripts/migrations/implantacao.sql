-- =============================================================================
-- Migration  IMPLANTAÇÃO DE UNIDADE (/implantacao)
-- =============================================================================
-- CONTEXTO
--   O legado tinha buildImpl / implRender (legacy ~4852): fluxo completo de
--   implantação de uma nova unidade em 5 etapas (F01–F05) com 65 tarefas,
--   editável por admin. Cabeçalho com Unidade/Projeto, Início, Inauguração
--   projetada e Prazo total (dias). KPIs, barras de progresso e gráficos.
--
--   No backend lkii NÃO existe tabela de implantação. Esta migration cria o
--   modelo (projeto → etapas → tarefas) e faz o seed do template padrão
--   (IMPL_FASES) para um projeto demo, para a tela não nascer vazia.
--
-- MODELO
--   implantacao_projetos    1 projeto por unidade em implantação (cabeçalho).
--   implantacao_etapas      as fases F01..F05 do projeto (cod, nome, ordem).
--   implantacao_tarefas     tarefas da etapa (cod, descricao, responsavel,
--                            duracao_dias, situacao).
--
--   responsavel ∈ IMPL_WF (9 áreas) · situacao ∈ IMPL_ST (4 estados).
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   Tudo IF NOT EXISTS / ON CONFLICT. RLS habilitada: leitura p/ qualquer
--   autenticado; escrita p/ admin_geral / gestor (espelha o "só admin edita"
--   do legado  demais perfis só atualizam a situação, regra reforçada na action).
--
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/implantacao.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) PROJETO DE IMPLANTAÇÃO (cabeçalho  IMPL_PROJ do legado)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS implantacao_projetos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE SET NULL,
  nome          text NOT NULL,                 -- "Unidade / Projeto" (ex.: 'Curitiba - Batel')
  inicio        date,                          -- início da implantação
  inauguracao   date,                          -- inauguração projetada
  status        text NOT NULL DEFAULT 'ativo', -- ativo | concluido | cancelado
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impl_projetos_empresa ON implantacao_projetos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_impl_projetos_unidade ON implantacao_projetos (unidade_id);

-- ----------------------------------------------------------------------------
-- 2) ETAPAS / FASES (F01..F05)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS implantacao_etapas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id  uuid NOT NULL REFERENCES implantacao_projetos(id) ON DELETE CASCADE,
  cod         text NOT NULL,                   -- F01..F05
  nome        text NOT NULL,
  ordem       integer NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impl_etapas_projeto ON implantacao_etapas (projeto_id, ordem);

-- ----------------------------------------------------------------------------
-- 3) TAREFAS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS implantacao_tarefas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id      uuid NOT NULL REFERENCES implantacao_etapas(id) ON DELETE CASCADE,
  cod           text NOT NULL,                 -- T01..T64
  descricao     text NOT NULL,
  responsavel   text NOT NULL DEFAULT 'Implantação',  -- IMPL_WF (9 áreas)
  duracao_dias  integer NOT NULL DEFAULT 1,
  situacao      text NOT NULL DEFAULT 'Aberto',       -- IMPL_ST (4 estados)
  ordem         integer NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impl_tarefas_responsavel_check CHECK (responsavel IN
    ('Implantação','Expansão','Franqueado','Treinamento','Diretoria','Marketing','RH','Comercial','Compras')),
  CONSTRAINT impl_tarefas_situacao_check CHECK (situacao IN
    ('Aberto','Em Andamento','Aguardando Predecessora','Concluído'))
);

CREATE INDEX IF NOT EXISTS idx_impl_tarefas_etapa ON implantacao_tarefas (etapa_id, ordem);

-- ----------------------------------------------------------------------------
-- 4) RLS  leitura p/ autenticado; escrita p/ admin_geral / gestor.
-- ----------------------------------------------------------------------------
ALTER TABLE implantacao_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE implantacao_etapas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE implantacao_tarefas  ENABLE ROW LEVEL SECURITY;

-- projetos
DROP POLICY IF EXISTS impl_projetos_sel ON implantacao_projetos;
CREATE POLICY impl_projetos_sel ON implantacao_projetos
  FOR SELECT USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));
DROP POLICY IF EXISTS impl_projetos_rw ON implantacao_projetos;
CREATE POLICY impl_projetos_rw ON implantacao_projetos
  FOR ALL
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid() AND p.papel IN ('admin_geral','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid() AND p.papel IN ('admin_geral','gestor')));

-- etapas
DROP POLICY IF EXISTS impl_etapas_sel ON implantacao_etapas;
CREATE POLICY impl_etapas_sel ON implantacao_etapas
  FOR SELECT USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));
DROP POLICY IF EXISTS impl_etapas_rw ON implantacao_etapas;
CREATE POLICY impl_etapas_rw ON implantacao_etapas
  FOR ALL
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid() AND p.papel IN ('admin_geral','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid() AND p.papel IN ('admin_geral','gestor')));

-- tarefas: SELECT p/ autenticado; UPDATE de situação p/ autenticado (demais
-- perfis só mudam a situação); INSERT/DELETE só admin/gestor.
DROP POLICY IF EXISTS impl_tarefas_sel ON implantacao_tarefas;
CREATE POLICY impl_tarefas_sel ON implantacao_tarefas
  FOR SELECT USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));
DROP POLICY IF EXISTS impl_tarefas_upd ON implantacao_tarefas;
CREATE POLICY impl_tarefas_upd ON implantacao_tarefas
  FOR UPDATE USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));
DROP POLICY IF EXISTS impl_tarefas_ins ON implantacao_tarefas;
CREATE POLICY impl_tarefas_ins ON implantacao_tarefas
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid() AND p.papel IN ('admin_geral','gestor')));
DROP POLICY IF EXISTS impl_tarefas_del ON implantacao_tarefas;
CREATE POLICY impl_tarefas_del ON implantacao_tarefas
  FOR DELETE USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid() AND p.papel IN ('admin_geral','gestor')));

-- ----------------------------------------------------------------------------
-- 5) SEED  template padrão (IMPL_FASES: 5 etapas, 65 tarefas) num projeto demo.
--    Idempotente: só cria o projeto demo se ainda não houver nenhum projeto.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
  v_unidade uuid;
  v_proj    uuid;
  v_f01 uuid; v_f02 uuid; v_f03 uuid; v_f04 uuid; v_f05 uuid;
BEGIN
  IF (SELECT count(*) FROM implantacao_projetos) > 0 THEN RETURN; END IF;

  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  SELECT id INTO v_unidade FROM unidades WHERE ativa = true ORDER BY nome LIMIT 1;

  INSERT INTO implantacao_projetos (empresa_id, unidade_id, nome, inicio, inauguracao, status)
  VALUES (v_empresa, v_unidade, 'Curitiba - Batel', DATE '2026-06-10', DATE '2026-08-10', 'ativo')
  RETURNING id INTO v_proj;

  INSERT INTO implantacao_etapas (projeto_id, cod, nome, ordem) VALUES
    (v_proj, 'F01', 'ETAPA 1: DOCUMENTOS INICIAIS E PROJETOS', 1) RETURNING id INTO v_f01;
  INSERT INTO implantacao_etapas (projeto_id, cod, nome, ordem) VALUES
    (v_proj, 'F02', 'ETAPA 2: INÍCIO IMPLANTAÇÃO E OBRA', 2) RETURNING id INTO v_f02;
  INSERT INTO implantacao_etapas (projeto_id, cod, nome, ordem) VALUES
    (v_proj, 'F03', 'ETAPA 3: OBRA, AQUISIÇÃO DE EQUIPAMENTOS E CONTRATAÇÕES', 3) RETURNING id INTO v_f03;
  INSERT INTO implantacao_etapas (projeto_id, cod, nome, ordem) VALUES
    (v_proj, 'F04', 'ETAPA 4: CAPACITAÇÃO E TREINAMENTO OPERACIONAL', 4) RETURNING id INTO v_f04;
  INSERT INTO implantacao_etapas (projeto_id, cod, nome, ordem) VALUES
    (v_proj, 'F05', 'ETAPA 5: VAMOS INAUGURAR', 5) RETURNING id INTO v_f05;

  -- F01 (9 tarefas)
  INSERT INTO implantacao_tarefas (etapa_id, cod, descricao, responsavel, duracao_dias, situacao, ordem) VALUES
    (v_f01,'T01','COF - Assinada','Implantação',1,'Concluído',1),
    (v_f01,'T02','Pré-Contrato de Franquia - Assinado','Implantação',1,'Concluído',2),
    (v_f01,'T03','Comprovante e forma de pagamento da taxa de Franquia','Implantação',1,'Concluído',3),
    (v_f01,'T04','Forma de pagamento das Máquinas','Expansão',3,'Em Andamento',4),
    (v_f01,'T05','Pedido do equipamento','Franqueado',1,'Em Andamento',5),
    (v_f01,'T06','Criação do SULTS do Franqueado','Treinamento',3,'Aberto',6),
    (v_f01,'T07','Reunião Kick Off','Implantação',3,'Aberto',7),
    (v_f01,'T08','Start no Treinamento inicial on line','Franqueado',5,'Aberto',8),
    (v_f01,'T09','Reunião de Alinhamento','Implantação',1,'Aberto',9);

  -- F02 (13 tarefas)
  INSERT INTO implantacao_tarefas (etapa_id, cod, descricao, responsavel, duracao_dias, situacao, ordem) VALUES
    (v_f02,'T10','Definição do ponto e anexar contrato de locação','Expansão',3,'Aberto',1),
    (v_f02,'T11','Contratação do projeto executivo com arquiteta da rede','Franqueado',3,'Aberto',2),
    (v_f02,'T12','Aprovação do Projeto da unidade','Diretoria',3,'Aberto',3),
    (v_f02,'T13','Medidas e fotos da fachada p/ marketing (tapume e adesivos)','Franqueado',1,'Aberto',4),
    (v_f02,'T14','Entrega arte tapume','Marketing',1,'Aberto',5),
    (v_f02,'T15','Executar eventuais projetos complementares','Franqueado',5,'Aberto',6),
    (v_f02,'T64','Criação de e-mail da unidade','Marketing',3,'Aberto',7),
    (v_f02,'T16','Criação Instagram e redes sociais da unidade','Marketing',3,'Aberto',8),
    (v_f02,'T17','Contratação de Contador','Franqueado',1,'Aberto',9),
    (v_f02,'T18','Documentos regulatórios (0/8)','Franqueado',10,'Aberto',10),
    (v_f02,'T19','Abertura de Conta corrente PJ','Franqueado',3,'Aberto',11),
    (v_f02,'T20','Reunião Marketing inicial','Marketing',3,'Aberto',12),
    (v_f02,'T21','Reunião de Alinhamento','Implantação',1,'Aberto',13);

  -- F03 (15 tarefas)
  INSERT INTO implantacao_tarefas (etapa_id, cod, descricao, responsavel, duracao_dias, situacao, ordem) VALUES
    (v_f03,'T22','Cotação da Obra','Franqueado',5,'Aberto',1),
    (v_f03,'T23','Início das obras','Franqueado',30,'Aberto',2),
    (v_f03,'T24','Linha de telefone (WhatsApp Business) e internet 300 mega','Franqueado',3,'Aberto',3),
    (v_f03,'T25','Compra itens Checklist (mobiliário, equipamentos, insumos…)','Franqueado',5,'Aberto',4),
    (v_f03,'T26','Pedido de máquina de cartão da TAL Pagamentos','Implantação',3,'Aberto',5),
    (v_f03,'T27','Fazer cadastro no Pago Livre','Implantação',3,'Aberto',6),
    (v_f03,'T28','Fazer cadastro Quota Bank e Flip','Franqueado',1,'Aberto',7),
    (v_f03,'T29','Reunião RH + plataforma Catho e planilha de cadastros','RH',3,'Aberto',8),
    (v_f03,'T30','Recrutamento e Seleção  Profissionais de Saúde (RT e Aplicadora)','Franqueado',10,'Aberto',9),
    (v_f03,'T31','Recrutamento e Seleção  Gestão (Gerente e Consultoras)','Franqueado',10,'Aberto',10),
    (v_f03,'T32','Contratação da Equipe','Franqueado',5,'Aberto',11),
    (v_f03,'T33','Inscrição Crefito','Franqueado',3,'Aberto',12),
    (v_f03,'T34','Compra de uniformes (jalecos e camisetas)','Franqueado',3,'Aberto',13),
    (v_f03,'T35','Cadastrar Google Business','Marketing',3,'Aberto',14),
    (v_f03,'T36','Reunião de Alinhamento','Implantação',1,'Aberto',15);

  -- F04 (14 tarefas)
  INSERT INTO implantacao_tarefas (etapa_id, cod, descricao, responsavel, duracao_dias, situacao, ordem) VALUES
    (v_f04,'T37','Cadastro final da unidade no SULTS (telefone, endereço, projetos…)','Treinamento',2,'Aberto',1),
    (v_f04,'T38','Envio dos dados dos colaboradores ao Treinamento','Treinamento',3,'Aberto',2),
    (v_f04,'T39','Reunião de treinamento com franqueados e novos colaboradores','Treinamento',3,'Aberto',3),
    (v_f04,'T40','Treinamento de gestão, online, no SULTS','Treinamento',7,'Aberto',4),
    (v_f04,'T41','Treinamento PRESENCIAL em São Paulo','Treinamento',1,'Aberto',5),
    (v_f04,'T42','Ambientação em loja','Treinamento',5,'Aberto',6),
    (v_f04,'T43','Reunião Marketing Pré-Inauguração','Marketing',1,'Aberto',7),
    (v_f04,'T44','Impressão de materiais gráficos','Franqueado',7,'Aberto',8),
    (v_f04,'T45','Consultoras de Campo: treinamentos online e ambientação','Treinamento',5,'Aberto',9),
    (v_f04,'T46','Certificar chegada da Máquina de cartão','Implantação',2,'Aberto',10),
    (v_f04,'T47','Certificar Boleto habilitado','Implantação',2,'Aberto',11),
    (v_f04,'T48','Certificar Pago Livre habilitado e integrado BEMP','Implantação',2,'Aberto',12),
    (v_f04,'T49','Certificar documentos (contrato social, CNPJ, alvará, Crefito, bombeiros, cert. digital)','Implantação',3,'Aberto',13),
    (v_f04,'T50','Reunião de Alinhamento','Implantação',1,'Aberto',14);

  -- F05 (13 tarefas)
  INSERT INTO implantacao_tarefas (etapa_id, cod, descricao, responsavel, duracao_dias, situacao, ordem) VALUES
    (v_f05,'T51','Certificar entrega da máquina tempestivamente','Implantação',3,'Aberto',1),
    (v_f05,'T52','Certificar pagamento da taxa de Franquia','Implantação',1,'Aberto',2),
    (v_f05,'T53','Cadastro no BEMP','Implantação',3,'Aberto',3),
    (v_f05,'T54','Reunião Diretoria Comercial','Comercial',3,'Aberto',4),
    (v_f05,'T55','Assinatura do contrato de franquia online','Franqueado',1,'Aberto',5),
    (v_f05,'T56','Comprar passagem do Gerente de Campo','Compras',3,'Aberto',6),
    (v_f05,'T57','Reunião Marketing Pré-Inauguração','Marketing',1,'Aberto',7),
    (v_f05,'T58','Passar redes sociais ao Franqueado','Marketing',1,'Aberto',8),
    (v_f05,'T59','Iniciar Geolocalizado','Marketing',1,'Aberto',9),
    (v_f05,'T60','Prospecção de clientes','Treinamento',3,'Aberto',10),
    (v_f05,'T61','Chegada e montagem do equipamento','Franqueado',3,'Aberto',11),
    (v_f05,'T62','Vistoria Pré-Inauguração por vídeo','Implantação',3,'Aberto',12),
    (v_f05,'T63','Inauguração','Implantação',1,'Aberto',13);
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS implantacao_tarefas;
--   DROP TABLE IF EXISTS implantacao_etapas;
--   DROP TABLE IF EXISTS implantacao_projetos;
-- =============================================================================
