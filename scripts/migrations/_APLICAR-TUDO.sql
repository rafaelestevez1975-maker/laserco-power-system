-- ============================================================================
-- APLICAR-TUDO  Onda 4 (paridade legado). Cole no SQL Editor do Supabase e rode.
-- Idempotente (CREATE TABLE IF NOT EXISTS). SEM seeds de dado de negócio FAKE
-- (removidos: recebíveis/contas-a-pagar/contratos/conteúdo de marketing fictícios).
-- As tabelas nascem VAZIAS e recebem dado REAL. 050_expansao já foi aplicada.
-- ============================================================================

-- ██  rbac.sql  ████████████████████████████████████████████████████████
-- ============================================================================
-- Módulo: RBAC  Perfis de acesso (cargos) + matriz de permissões
-- Paridade com o legado: PERFIS[] / perfisRows / perfTogglePonto / perfDel /
--   renderPerfilEditor (legacy/index.html L7178-7293).
--
-- As tabelas de RBAC (cargos, cargo_permissoes, permissoes, recursos, acoes,
-- usuario_cargos) JÁ EXISTEM no lkii e são geridas via service-role (igual ao
-- resolveRecursos de lib/session). Esta migration apenas ESTENDE o schema com:
--   • cargos.bate_ponto  → flag "Bate ponto" por perfil (coluna nova do legado).
--
-- Heurística inicial de bate_ponto (legado L7191): Administrador/Gestor/
--   Franqueado/Proprietário NÃO batem ponto; os demais batem.
--
-- Aplicar este arquivo no projeto lkii (Supabase) antes de usar o toggle
-- "Bate ponto" na lista de perfis (/perfis).
-- ============================================================================

-- Coluna nova: define se o perfil bate ponto (ponto eletrônico).
alter table public.cargos
  add column if not exists bate_ponto boolean not null default true;

comment on column public.cargos.bate_ponto is
  'Define se os usuários deste perfil registram ponto eletrônico. Legado: PERFIS[].batePonto.';

-- Seed da heurística do legado: cargos de gestão/franqueado/proprietário não batem ponto.
-- (Roda só uma vez de forma idempotente: só altera quem ainda está no default.)
update public.cargos
set bate_ponto = false
where bate_ponto is true
  and (
       slug ~* '(super_admin|admin|gestor|gerente|franqueado|proprietario|expansao|marketing)'
    or nome ~* '(Administrador|Gestor|Franqueado|Propriet|Gerente|Expans|Marketing)'
  );


-- ██  catalogo.sql  ████████████████████████████████████████████████████████
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


-- ██  categorias.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  CATEGORIAS / CONTAS / METAS / CONTRATOS (paridade com o legado)
-- =============================================================================
-- CONTEXTO
--   Módulo "Categorias + Contas (unidade) + Metas + Modelos de contrato" precisava de:
--
--     1. MODELOS DE CONTRATO (buildContratos / CONTRATOS / CONTRATO_TXT do legado):
--        o legado tem 7 modelos de contrato (Laser&Club Bronze/Prata/Ouro com e sem
--        adesão + Prestação de Serviços Laser&Co) com Nome, "Quando é emitido",
--        "Enviar por e-mail p/ assinatura", arquivo anexo, ativo, título e termos.
--        No Next isso era um CLONE estático (snapshot inerte). Criamos a tabela
--        contratos_modelo (DB-backed) + bucket de Storage p/ o arquivo.
--
--     2. CONTAS  coluna "Fornecedor" (view-contas tem filtro/coluna Fornecedor).
--        lancamentos_financeiros não tinha a coluna → ADD COLUMN IF NOT EXISTS.
--
--     3. CATEGORIAS  seed completo do plano_contas espelhando CATP_SEED (~10 grupos
--        de despesa) e CATR_SEED (Vendas das Unidades) do legado, para a paridade do
--        conteúdo inicial das categorias a pagar / a receber.
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS /
--   contagem antes de semear. Rodar duas vezes não quebra.
--
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/categorias.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) MODELOS DE CONTRATO (contratos_modelo)  buildContratos / CONTRATO_TXT
--    Catálogo por EMPRESA, habilitável para todas as unidades. RBAC: admin_geral /
--    gestor escrevem; demais leem (catálogo compartilhado).
--    quando_emitido: as 5 opções do select do editor do legado.
--    arquivo_nome / arquivo_path: nome amigável + caminho no Storage (bucket contratos).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contratos_modelo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  quando_emitido   text NOT NULL DEFAULT 'Planos de Assinatura'
                   CHECK (quando_emitido IN (
                     'Planos de Assinatura','Assinaturas',
                     'Créditos em Dinheiro, Pacotes, Serviços','Pacotes','Serviços')),
  enviar_email     boolean NOT NULL DEFAULT true,   -- "Enviar por e-mail para assinatura"
  todas_unidades   boolean NOT NULL DEFAULT true,   -- "Habilitado para todas as unidades"
  titulo           text,
  termos           text,
  arquivo_nome     text,                            -- CONTRATO_ARQ[cid] (nome amigável)
  arquivo_path     text,                            -- caminho no bucket Storage 'contratos'
  ativo            boolean NOT NULL DEFAULT true,
  ordem            integer NOT NULL DEFAULT 0,
  criado_por       uuid,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_modelo_empresa ON contratos_modelo (empresa_id);
CREATE INDEX IF NOT EXISTS idx_contratos_modelo_ativo   ON contratos_modelo (ativo);

ALTER TABLE contratos_modelo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratos_modelo_sel ON contratos_modelo;
CREATE POLICY contratos_modelo_sel ON contratos_modelo
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS contratos_modelo_rw ON contratos_modelo;
CREATE POLICY contratos_modelo_rw ON contratos_modelo
  FOR ALL
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor')));

-- ----------------------------------------------------------------------------
-- 2) CONTAS  coluna "Fornecedor" em lancamentos_financeiros (view-contas)
-- ----------------------------------------------------------------------------
ALTER TABLE lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS fornecedor text;

-- ----------------------------------------------------------------------------
-- 3) STORAGE  bucket 'contratos' para os arquivos dos modelos (PDF/DOC/DOCX).
--    Idempotente (ON CONFLICT). Acesso de escrita pelo papel admin_geral/gestor;
--    leitura autenticada. (Se o schema storage não existir no ambiente, ignore.)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public)
      VALUES ('contratos', 'contratos', false)
      ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4) SEED de modelos de contrato  espelha CONTRATOS / CONTRATO_TXT do legado
--    (7 modelos). Idempotente: só insere se a tabela estiver vazia para a empresa.
--    Os termos completos são editados na UI; aqui guardamos o cabeçalho/título.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  IF (SELECT count(*) FROM contratos_modelo WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO contratos_modelo (empresa_id, nome, quando_emitido, titulo, ordem) VALUES
      (v_empresa,'Contrato Laser&Club - Plano Bronze - Depilação - Sem adesão','Planos de Assinatura','CONTRATO DE ADESÃO LASER&CLUB - PLANO BRONZE (DEPILAÇÃO) - SEM ADESÃO',1),
      (v_empresa,'Contrato Laser&Club - Plano Prata - Rejuvenescimento Facial - Sem adesão','Planos de Assinatura','CONTRATO DE ADESÃO LASER&CLUB - PLANO PRATA (REJUVENESCIMENTO FACIAL) - SEM ADESÃO',2),
      (v_empresa,'Contrato Laser&Club - Plano Prata - Rejuvenescimento Facial','Planos de Assinatura','CONTRATO DE ADESÃO LASER&CLUB - PLANO PRATA (REJUVENESCIMENTO FACIAL)',3),
      (v_empresa,'Contrato Laser&Club - Plano Bronze - Depilação','Planos de Assinatura','CONTRATO DE ADESÃO LASER&CLUB - PLANO BRONZE (DEPILAÇÃO)',4),
      (v_empresa,'Contrato Laser&Club - Plano Ouro - PDRN','Planos de Assinatura','CONTRATO DE ADESÃO LASER&CLUB - PLANO OURO (PDRN)',5),
      (v_empresa,'Contrato Laser&Club - Plano Ouro - PDRN - Sem adesão','Planos de Assinatura','CONTRATO DE ADESÃO LASER&CLUB - PLANO OURO (PDRN) - SEM ADESÃO',6),
      (v_empresa,'Contrato de Prestação de Serviços Laser & Co','Créditos em Dinheiro, Pacotes, Serviços','CONTRATO DE PRESTAÇÃO DE SERVIÇOS - LASER&CO',7);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5) SEED de categorias (plano_contas)  CATP_SEED (despesa) + CATR_SEED (receita)
--    Espelha os grupos/itens do legado. Idempotente: só semeia grupos ainda
--    ausentes (por nome+tipo) e itens ainda ausentes dentro do grupo.
--    natureza: despesa => devedora, receita => credora.
--    codigo: gerado por nível (grupo = "<n>"; item = "<n>.<m>").
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
  v_grp     record;
  v_item    text;
  v_gid     uuid;
  v_gcod    int;
  v_icod    int;
  -- CATP_SEED (despesa)  grupos na ordem do legado
  v_pag jsonb := '[
    {"g":"Impostos","itens":["ISS","PIS e COFINS","IRPJ","CSLL","INSS","FGTS","IOF","IPTU","Taxas Administrativas","Parcelamento de tributos","Outros Impostos e Taxas","Devoluções e Abatimentos"]},
    {"g":"Custos Fixos","itens":["Aluguel","Condomínio","Cessão de Direitos","Energia Elétrica","Água e Esgoto","Telefone e Internet","Seguros","Locação de Equipamentos","Segurança e Portaria","Mensalidades e Sistemas","Odorização"]},
    {"g":"Custos Variáveis","itens":["Comissões e Premiações","Devolução a Clientes","Cartuchos Ultrassom","Consumo (Escritório, Higiene e Limpeza)","Fretes","Postagens","Caixinha","Manutenção de Máquinas e Equipamentos","Manutenção Predial"]},
    {"g":"Despesas com Pessoal","itens":["Salários","Salários Diretoria","Salários PJ","Benefícios","Férias ( Folha de Pagamento )","Rescisões","Uniformes","Despesas com Treinamento","Reembolso de Despesas","Outras despesas com Pessoal"]},
    {"g":"Despesas Administrativas","itens":["Assessorias e Consultorias","Passagens e Hospedagens","Locomoções","Coffee Break","Confraternizações","Outras Refeições e Alimentação","Outras Despesas"]},
    {"g":"Marketing","itens":["Marketing Lojas Próprias","Marketing de Franquias","Marketing da rede","Marketing Anitta","Fundo de Promoção","Serviços Gráficos e Edição de Vídeo","Eventos Lojas","Brindes"]},
    {"g":"Despesas Financeiras","itens":["Despesas Financeiras","Empréstimos","Parcelamento Cartão de Crédito","Seguro Garantia (Carta Fiança)"]},
    {"g":"Despesas Comerciais / Expansão","itens":["Despesas Comerciais (Expansão)","Aquisição de Unidade","Verba de Captação Leads - Lojas Próprias","Verba de Captação Leads - Franquias","Verba de Captação Leads - Expansão","Feira ABF","Adiantamento a Fornecedores","Fretes e Carretos Franqueados"]},
    {"g":"Investimentos","itens":["Móveis, Máquinas, Equipamentos e Pequenos Bens","Investimentos - Equipamento à Laser","Investimentos - Equipamento Ultrassom","Investimentos - Resfriador","Investimentos - Outros Equipamentos","Investimentos - Montagem - Móveis, utensílios e equipamentos","Investimentos - Montagem - Obra e serviços","Investimentos - Montagem - Outros","Investimentos Pantanal","Financiamento Projeto Alberto Oyama"]},
    {"g":"Distribuição de Lucros e Investimentos","itens":["Devolução de Aporte de Capital","Devolução de Empréstimos de Sócios"]}
  ]'::jsonb;
  -- CATR_SEED (receita)
  v_rec jsonb := '[
    {"g":"Vendas das Unidades","itens":["Venda de serviços","Venda de produtos","Venda de pacotes","Venda de assinaturas"]}
  ]'::jsonb;
  v_seed record;
  v_tipo text;
  v_nat  text;
  v_data jsonb;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  FOR v_seed IN
    SELECT 'despesa'::text AS tipo, 'devedora'::text AS nat, v_pag AS data
    UNION ALL
    SELECT 'receita'::text, 'credora'::text, v_rec
  LOOP
    v_tipo := v_seed.tipo; v_nat := v_seed.nat; v_data := v_seed.data;
    -- próximo código de grupo dentro do tipo
    SELECT COALESCE(MAX((split_part(codigo,'.',1))::int),0)
      INTO v_gcod
      FROM plano_contas
     WHERE tipo = v_tipo AND codigo ~ '^[0-9]+$'
       AND (empresa_id = v_empresa OR empresa_id IS NULL);

    FOR v_grp IN SELECT * FROM jsonb_array_elements(v_data)
    LOOP
      -- grupo já existe? (por nome+tipo)
      SELECT id INTO v_gid
        FROM plano_contas
       WHERE tipo = v_tipo AND nome = (v_grp.value->>'g')
         AND (empresa_id = v_empresa OR empresa_id IS NULL)
       LIMIT 1;

      IF v_gid IS NULL THEN
        v_gcod := v_gcod + 1;
        INSERT INTO plano_contas (empresa_id, parent_id, codigo, nome, tipo, natureza, aceita_lancamentos, is_sistema, ativo)
        VALUES (v_empresa, NULL, v_gcod::text, v_grp.value->>'g', v_tipo, v_nat, false, false, true)
        RETURNING id INTO v_gid;
        v_icod := 0;
      ELSE
        SELECT COALESCE(MAX((split_part(codigo,'.',2))::int),0)
          INTO v_icod
          FROM plano_contas
         WHERE parent_id = v_gid AND codigo ~ ('^[0-9]+\.[0-9]+$');
      END IF;

      FOR v_item IN SELECT jsonb_array_elements_text(v_grp.value->'itens')
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM plano_contas
           WHERE parent_id = v_gid AND nome = v_item
        ) THEN
          v_icod := v_icod + 1;
          INSERT INTO plano_contas (empresa_id, parent_id, codigo, nome, tipo, natureza, aceita_lancamentos, is_sistema, ativo)
          VALUES (v_empresa, v_gid,
                  (split_part((SELECT codigo FROM plano_contas WHERE id = v_gid),'.',1) || '.' || v_icod::text),
                  v_item, v_tipo, v_nat, true, false, true);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS contratos_modelo CASCADE;
--   ALTER TABLE lancamentos_financeiros DROP COLUMN IF EXISTS fornecedor;
--   -- (os seeds de plano_contas podem ser removidos por nome/empresa se preciso)
-- =============================================================================


-- ██  financeiro.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  FINANCEIRO DA FRANQUEADORA (Franqueadora A + B)
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
--     fin_recebiveis    royalties/taxas/aluguéis cobrados das unidades pela matriz
--     fin_contas_pagar  despesas da franqueadora (folha, impostos, fornecedores)
--     fin_conciliacao   cruzamento venda x extrato x taxa adquirente
--     fin_config        parâmetros (royaltyPct/fundoPct/vencDia, banco, adquirentes, régua)
--
--   Categorias de recebíveis são FIXAS (FIN_CATS_REC do legado), guardadas como
--   texto na coluna categoria (não usam plano_contas  são conceitos da matriz).
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING. RLS habilitada com policy
--   por empresa (admin_geral e perfil financeiro). O seed usa a 1ª empresa e as
--   unidades ativas existentes, espelhando o finSeed do legado.
--
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
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
-- 4) CONFIG DO FINANCEIRO (1 linha por empresa)  parâmetros do legado FIN_CFG
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
-- 5) RLS  habilitar + policies por empresa (admin_geral e perfil financeiro)
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
-- 6) SEED  espelha finSeed do legado, sobre as unidades ativas reais.
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

  -- SEM seed de recebíveis/contas a pagar fake (removido a pedido do cliente: nada de dado
  -- de negócio inventado). As tabelas nascem VAZIAS e são alimentadas por dados REAIS:
  -- recebíveis = royalties/fundo apurados das vendas reais das unidades; contas a pagar =
  -- despesas reais da matriz lançadas pelo financeiro. A tela mostra empty-state honesto.
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS fin_recebiveis, fin_contas_pagar, fin_conciliacao, fin_config CASCADE;
-- =============================================================================


-- ██  comissoes.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  COMISSÕES + COLABORADORES (paridade com o legado: legacy/index.html)
-- =============================================================================
-- CONTEXTO
--   Dois módulos do legado dependiam de estado que o schema lkii ainda não cobria:
--
--   1. Matriz de Comissões (buildComissoes / COM_CATS, index.html ~7324..7470)
--      No legado a matriz vivia 100% em memória/localStorage. Aqui ela vira a
--      tabela matriz_comissoes (uma linha por CATEGORIA, por empresa) para que as
--      edições de percentuais/faixas/base PERSISTAM e possam alimentar a apuração
--      de premiação (premRoster) no futuro. Cada categoria guarda:
--        · base (individual/loja/sessao) → on + pct
--        · Parte 1  tiers por dezena (t80/t100/t120/t130)
--        · Parte 2  fechamento do mês (f100/f120/f130)
--        · cargo (mapeia a categoria a um cargo do enum p/ o simulador casar
--          colaborador → categoria).
--
--   2. Ficha do Colaborador  abas "Acesso ao sistema" e "Agenda & Serviços"
--      (view-colaborador-form, index.html ~2121..2149 + colabServRender ~7120).
--      Faltavam colunas em `colaboradores` (exibe_agenda, disponivel_online,
--      comissao_pct, ordem_app, forcar_troca_senha, ultimo_acesso) e a tabela de
--      junção colaborador_servicos ("Serviços que o colaborador executa").
--
-- DECISÃO ADOTADA
--   1. matriz_comissoes: tabela nova por EMPRESA (catálogo de regras da rede),
--      RLS por papel (admin_geral/gestor escrevem; demais leem). Seed idempotente
--      espelhando COM_CATS do legado.
--   2. ADD COLUMN IF NOT EXISTS em `colaboradores` (defaults seguros).
--   3. colaborador_servicos: junção (colaborador_id × servico_id), RLS herdando o
--      acesso de `colaboradores` (quem vê o colaborador, gerencia seus serviços).
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   CREATE TABLE/COLUMN/POLICY IF NOT EXISTS / DROP POLICY IF EXISTS / contagem
--   antes de semear. Rodar duas vezes não quebra.
--
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/comissoes.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) MATRIZ DE COMISSÕES (COM_CATS)  uma linha por categoria, por empresa.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matriz_comissoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome            text NOT NULL,                      -- nome da categoria (ex.: 'Consultoras de Vendas')
  cargo           text,                               -- cargo do enum correspondente (p/ pré-seleção no simulador)
  ordem           integer NOT NULL DEFAULT 0,
  -- Premiação base (marque um ou mais)  on + pct
  base_individual_on  boolean NOT NULL DEFAULT false,
  base_individual_pct numeric(6,2) NOT NULL DEFAULT 0,
  base_loja_on        boolean NOT NULL DEFAULT false,
  base_loja_pct       numeric(6,2) NOT NULL DEFAULT 0,
  base_sessao_on      boolean NOT NULL DEFAULT false,
  base_sessao_pct     numeric(6,2) NOT NULL DEFAULT 0,
  -- Parte 1  adicional por dezena (sobre a premiação base)
  tier_t80        numeric(6,2) NOT NULL DEFAULT 0,
  tier_t100       numeric(6,2) NOT NULL DEFAULT 0,
  tier_t120       numeric(6,2) NOT NULL DEFAULT 0,
  tier_t130       numeric(6,2) NOT NULL DEFAULT 0,
  -- Parte 2  adicional no fechamento do mês (sobre o valor final da unidade)
  fech_f100       numeric(6,2) NOT NULL DEFAULT 0,
  fech_f120       numeric(6,2) NOT NULL DEFAULT 0,
  fech_f130       numeric(6,2) NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matriz_comissoes_empresa ON matriz_comissoes (empresa_id);

-- ----------------------------------------------------------------------------
-- 2) COLABORADORES  colunas das abas "Acesso ao sistema" e "Agenda & Serviços".
--    exibe_agenda        : aparece como coluna na agenda (default true)
--    disponivel_online   : disponível p/ agendamento online (default true)
--    comissao_pct        : "% Comissão padrão" (default 0)
--    ordem_app           : "Ordem no App" (default 1)
--    forcar_troca_senha  : "Forçar troca de senha no próximo acesso" (default false)
--    ultimo_acesso       : data/hora do último acesso (p/ regra de inatividade +15d)
-- ----------------------------------------------------------------------------
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS exibe_agenda       boolean NOT NULL DEFAULT true;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS disponivel_online  boolean NOT NULL DEFAULT true;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS comissao_pct       numeric(6,2) NOT NULL DEFAULT 0;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS ordem_app          integer NOT NULL DEFAULT 1;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS forcar_troca_senha boolean NOT NULL DEFAULT false;
ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS ultimo_acesso      timestamptz;

-- ----------------------------------------------------------------------------
-- 3) COLABORADOR_SERVICOS (colabServRender)  "Serviços que o colaborador executa".
--    Junção N:N entre colaboradores e servicos. UNIQUE para evitar duplicidade.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS colaborador_servicos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  servico_id      uuid NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, servico_id)
);

CREATE INDEX IF NOT EXISTS idx_colab_servicos_colab   ON colaborador_servicos (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_colab_servicos_servico ON colaborador_servicos (servico_id);

-- ----------------------------------------------------------------------------
-- 4) RLS
--    matriz_comissoes : leitura p/ qualquer autenticado; escrita admin/gestor.
--    colaborador_servicos : leitura p/ qualquer autenticado; escrita admin/gestor/recepcao
--                           (mesmos papéis que editam colaboradores).
-- ----------------------------------------------------------------------------
ALTER TABLE matriz_comissoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaborador_servicos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matriz_comissoes_sel ON matriz_comissoes;
CREATE POLICY matriz_comissoes_sel ON matriz_comissoes
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS matriz_comissoes_rw ON matriz_comissoes;
CREATE POLICY matriz_comissoes_rw ON matriz_comissoes
  FOR ALL
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor')));

DROP POLICY IF EXISTS colaborador_servicos_sel ON colaborador_servicos;
CREATE POLICY colaborador_servicos_sel ON colaborador_servicos
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS colaborador_servicos_rw ON colaborador_servicos;
CREATE POLICY colaborador_servicos_rw ON colaborador_servicos
  FOR ALL
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','recepcao')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','recepcao')));

-- ----------------------------------------------------------------------------
-- 5) SEED  espelha COM_CATS do legado (5 categorias). Idempotente por empresa.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  IF (SELECT count(*) FROM matriz_comissoes WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO matriz_comissoes
      (empresa_id, nome, cargo, ordem,
       base_individual_on, base_individual_pct, base_loja_on, base_loja_pct, base_sessao_on, base_sessao_pct,
       tier_t80, tier_t100, tier_t120, tier_t130, fech_f100, fech_f120, fech_f130)
    VALUES
      (v_empresa,'Gerente','gerente',1,                       true,2,   true,1.5, false,0,  10,25,50,65, 1,2,3),
      (v_empresa,'Sub Gerente','subgerente',2,                true,1.5, true,1,   false,0,  8,20,40,55,  0.8,1.5,2.5),
      (v_empresa,'Profissional da Saúde','aplicadora',3,      false,0,  false,0, true,5,   5,15,30,40,  0.5,1,1.5),
      (v_empresa,'Consultoras de Vendas','consultora_vendas',4, true,3, true,1,  false,0,  10,25,50,65, 1,2,3),
      (v_empresa,'Atendente (SAC)',NULL,5,                    true,2,   false,0, false,0,  10,25,50,65, 0.5,1,1.5);
  END IF;
END $$;

COMMIT;


-- ██  agenda.sql  ████████████████████████████████████████████████████████
-- ============================================================================
-- Módulo: Agenda  Eventos da rede (banda de eventos no topo da agenda)
-- Paridade com o legado: REDE_EVENTOS / EVT_TYPES / renderRede / saveEvt
--   (legacy/index.html L9591-9627). No legado os eventos são MOCK em memória;
--   aqui viram tabela real, multi-tenant por empresa, lidos por DATA na agenda.
-- Eventos NÃO bloqueiam horário (só aparecem na banda informativa do dia).
-- Aplicar este arquivo no projeto lkii (Supabase) antes de usar a banda.
-- ============================================================================

create table if not exists public.rede_eventos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  -- null = evento da rede inteira (todas as unidades da empresa);
  -- preenchido = evento específico de uma unidade.
  unidade_id    uuid references public.unidades(id) on delete cascade,
  titulo        text not null,
  -- Espelha EVT_TYPES do legado: 'Treinamento online' | 'Treinamento presencial'
  --   | 'Reunião da rede' | 'Evento' | 'Inauguração'
  tipo          text not null default 'Evento',
  data          date not null,
  hora_inicio   text,                       -- "HH:MM" (texto, igual ao legado)
  hora_fim      text,
  -- link da reunião OU endereço presencial (legado usa o mesmo campo "link")
  link          text,
  -- direcionamento/audiência (legado: ['Rede própria','Franquias',...])
  audiencia     text[] not null default '{}',
  criado_por    uuid references public.perfis_usuario(id),
  criado_em     timestamptz not null default now()
);

create index if not exists rede_eventos_empresa_data_idx
  on public.rede_eventos (empresa_id, data);
create index if not exists rede_eventos_unidade_idx
  on public.rede_eventos (unidade_id);

alter table public.rede_eventos enable row level security;

-- Leitura: qualquer usuário autenticado da empresa enxerga os eventos da rede.
-- (A empresa do usuário é resolvida via perfis_usuario → unidades → empresa_id.)
drop policy if exists rede_eventos_sel on public.rede_eventos;
create policy rede_eventos_sel on public.rede_eventos
  for select to authenticated
  using (
    empresa_id in (
      select u.empresa_id
      from public.unidades u
      join public.perfis_usuario p on p.unidade_id = u.id
      where p.id = auth.uid()
    )
    or exists (
      select 1 from public.perfis_usuario p
      where p.id = auth.uid() and p.papel = 'admin_geral'
    )
  );

-- Escrita: somente admin_geral/gestor/operacoes da empresa (publicar eventos).
drop policy if exists rede_eventos_ins on public.rede_eventos;
create policy rede_eventos_ins on public.rede_eventos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.perfis_usuario p
      where p.id = auth.uid()
        and p.papel in ('admin_geral', 'gestor', 'operacoes')
    )
  );

drop policy if exists rede_eventos_del on public.rede_eventos;
create policy rede_eventos_del on public.rede_eventos
  for delete to authenticated
  using (
    exists (
      select 1 from public.perfis_usuario p
      where p.id = auth.uid()
        and p.papel in ('admin_geral', 'gestor', 'operacoes')
    )
  );

-- Seed opcional (espelha REDE_EVENTOS do legado). Comente se não quiser dados de exemplo.
-- insert into public.rede_eventos (empresa_id, titulo, tipo, data, hora_inicio, hora_fim, link, audiencia)
-- select e.id, 'Convenção Laser&Co 2026', 'Evento', current_date, '08:00', '18:00',
--        'Centro de Convenções', array['Todos']
-- from public.empresas e limit 1;


-- ██  indiques.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  Gestão de Indiques (paridade com o legado: Prêmio & Link + Sorteio)
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html, blocos indPremioHTML / indSorteioHTML ~8195-8296)
--   tem três peças que NÃO existem no backend lkii:
--     1) PRÊMIO DO MÊS configurável por unidade (admin define prêmio + valor + obs).
--     2) Registro do ÚLTIMO SORTEIO (ganhador do mês) por unidade.
--     3) Campos CPF e ORIGEM da indicação no formulário "Novo indique".
--
--   Esta migration cria as duas tabelas de config/registro e adiciona as duas
--   colunas que faltavam em `indicacoes`. Tudo idempotente.
--
-- COMO APLICAR (manual  esta migration NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/indiques.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Campos do indicador no formulário "Novo indique" (legado indSalvarManual 8187)
--    cpf (opcional) + origem da indicação (Balcão (loja) | Site | Link compartilhado)
-- ----------------------------------------------------------------------------
ALTER TABLE indicacoes
  ADD COLUMN IF NOT EXISTS indicador_cpf text;
ALTER TABLE indicacoes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'balcao';

ALTER TABLE indicacoes DROP CONSTRAINT IF EXISTS indicacoes_origem_check;
ALTER TABLE indicacoes
  ADD CONSTRAINT indicacoes_origem_check
  CHECK (origem IN ('balcao', 'site', 'link'));

-- ----------------------------------------------------------------------------
-- 2) PRÊMIO DO MÊS  config por (empresa, unidade, mês).
--    Legado IND_PREMIO (8063): { premio, valor, obs }. Um registro por unidade/mês.
--    mes_ref no formato 'YYYY-MM' (legado IND_MES_KEY = '2026-06').
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indique_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id  uuid REFERENCES unidades(id) ON DELETE CASCADE,
  mes_ref     text NOT NULL,                  -- 'YYYY-MM'
  premio      text NOT NULL DEFAULT '',
  valor_ref   text,                           -- texto livre, ex.: 'R$ 1.199'
  observacao  text,
  meta_mensal integer NOT NULL DEFAULT 60,    -- meta de indiques do mês (legado IND_META_MES=60)
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, unidade_id, mes_ref)
);

-- ----------------------------------------------------------------------------
-- 3) ÚLTIMO SORTEIO  registro do ganhador do mês (legado IND_ULTIMO_SORTEIO 8279).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indique_sorteios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE CASCADE,
  mes_ref       text NOT NULL,                -- 'YYYY-MM'
  ganhador_nome text NOT NULL,
  ganhador_whats text,
  ganhador_email text,
  premio        text,
  notificado    boolean NOT NULL DEFAULT false,
  sorteado_por  uuid,
  sorteado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_indique_config_emp_uni  ON indique_config (empresa_id, unidade_id, mes_ref);
CREATE INDEX IF NOT EXISTS idx_indique_sorteios_emp_uni ON indique_sorteios (empresa_id, unidade_id, mes_ref);

-- ----------------------------------------------------------------------------
-- 4) RLS  habilita e cria policies básicas por empresa (alinhado às demais tabelas).
--    Leitura/escrita restritas à empresa do usuário autenticado (via perfis_usuario).
-- ----------------------------------------------------------------------------
ALTER TABLE indique_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE indique_sorteios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS indique_config_emp ON indique_config;
CREATE POLICY indique_config_emp ON indique_config
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

DROP POLICY IF EXISTS indique_sorteios_emp ON indique_sorteios;
CREATE POLICY indique_sorteios_emp ON indique_sorteios
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
--   DROP TABLE IF EXISTS indique_sorteios;
--   DROP TABLE IF EXISTS indique_config;
--   ALTER TABLE indicacoes DROP COLUMN IF EXISTS indicador_cpf;
--   ALTER TABLE indicacoes DROP COLUMN IF EXISTS origem;
-- =============================================================================


-- ██  relatorios.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  RELATÓRIOS · CONTRATOS (planos/contratos por cliente)
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
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/relatorios.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) CONTRATOS (planos/assinaturas de cliente)  espelha REL_DEFS.contratos
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
-- 2) RLS  habilitar + policy por papel (admin_geral / gestor / financeiro)
-- ----------------------------------------------------------------------------
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratos_rw ON contratos;
CREATE POLICY contratos_rw ON contratos
  USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','financeiro')))
  WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                 AND p.papel IN ('admin_geral','gestor','financeiro')));

-- ----------------------------------------------------------------------------
-- 3) SEED  contratos demo a partir de clientes reais (só se a tabela estiver vazia).
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

  -- SEM seed de contratos fake (removido a pedido do cliente). A tabela `contratos` nasce
  -- VAZIA e é alimentada por contratos REAIS (assinatura de plano na venda/OS). O relatório
  -- de Contratos mostra empty-state honesto até existir contrato real.
  IF false THEN
    FOR r IN SELECT id, nome FROM clientes WHERE false LOOP
      i := i + 1;
    END LOOP;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS contratos CASCADE;
-- =============================================================================


-- ██  anamnese.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  ANAMNESE / DOCUMENTOS + ORIGENS + MOTIVOS
--   (paridade com o legado: legacy/index.html)
-- =============================================================================
-- CONTEXTO
--   O legado tem três telas de cadastro que não existiam como tabela no lkii:
--
--   1. Documentos / Anamnese Digital (DOCS_LIST / DOC_MODELS / docsRows /
--      openDocEditor / renderDocEditor). Construtor de documentos clínicos com:
--        · metadados (nome, tipo, descrição, preenchimento, obrigatório, status,
--          acumulativo, unidades com acesso);
--        · seções e perguntas dinâmicas (8 tipos de campo: simnao, textocurto,
--          textolongo, numero, selecao, consent, assinatura, imagem);
--        · flags por pergunta: obrig. e "inviabiliza" (regra clínica  respondida
--          positivamente bloqueia os serviços).
--      8 documentos seed: Anamnese, Termo de Sessão (acumulativo), Autorização
--      para Menor, Uso de Imagem, Cancelamento, Transferência de Pacotes,
--      Troca p/ Crédito e Orientações Pós-Laser (Rascunho / subconjunto de unidades).
--
--   2. Origens de Cliente (buildOrigens / ORIGENS)  CRUD de canais de captação,
--      com flags auto (Geolocalizado) e campo (Outros).
--
--   3. Motivos de Cancelamento (buildMotivos / MOTIVOS)  CRUD com flag "sistema"
--      (padrão do sistema: só inativa, não exclui).
--
-- DECISÃO ADOTADA
--   · Catálogo por EMPRESA (config da rede), espelhando catalogo.sql.
--   · documentos.secoes em JSONB (lista de {titulo, campos:[{q,t,obr,inv}]}) 
--     o construtor do legado já trabalha com esse formato; evita N tabelas filhas.
--   · documentos.unidades_ids uuid[] = subconjunto de unidades com acesso
--     (NULL/[] = "Todas as unidades da rede").
--   · RLS por papel (admin_geral / gestor / financeiro escrevem; demais leem).
--   · Seeds idempotentes (só se a tabela estiver vazia para a empresa) espelhando
--     ANAMNESE / SESSAO / MENOR / IMAGEM / CANCEL / TRANSFER / CREDITO + DOCS_LIST.
--
-- SEGURANÇA / IDEMPOTÊNCIA
--   CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS / contagem antes de semear.
--   Rodar duas vezes não quebra.
--
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/anamnese.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) DOCUMENTOS / FICHAS DIGITAIS (DOCS_LIST + DOC_MODELS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  tipo          text NOT NULL DEFAULT 'Anamnese',
  descricao     text,
  -- Preenchimento: legado select 'Obrigatório para todos' / 'Opcional' /
  -- 'Somente clientes de ultrassom'.
  preenchimento text NOT NULL DEFAULT 'Obrigatório para todos os clientes'
                CHECK (preenchimento IN (
                  'Obrigatório para todos os clientes','Opcional','Somente clientes de ultrassom')),
  obrigatorio   boolean NOT NULL DEFAULT false,
  -- Status: Ativo / Rascunho / Inativo (badge de 3 estados no legado).
  status        text NOT NULL DEFAULT 'Ativo'
                CHECK (status IN ('Ativo','Rascunho','Inativo')),
  -- Documento acumulativo de sessões (SESSAO.acumulativo=true).
  acumulativo   boolean NOT NULL DEFAULT false,
  -- Subconjunto de unidades com acesso. NULL/{} = todas as unidades da rede.
  unidades_ids  uuid[],
  -- Seções/campos do construtor (8 tipos de campo + flags obr/inv).
  -- Forma: [{ "titulo": "...", "campos": [{ "q":"...", "t":"simnao", "obr":true, "inv":false }] }]
  secoes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON documentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_status  ON documentos (status);

-- ----------------------------------------------------------------------------
-- 2) ORIGENS DE CLIENTE (buildOrigens / ORIGENS)
--    auto  = preenchido automaticamente (Geolocalizado via CRM/geolocalização)
--    campo = ao selecionar abre campo para especificar (Outros)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS origens_cliente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  ativo         boolean NOT NULL DEFAULT true,
  auto          boolean NOT NULL DEFAULT false,
  campo         boolean NOT NULL DEFAULT false,
  ordem         integer NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_origens_cliente_empresa ON origens_cliente (empresa_id);

-- ----------------------------------------------------------------------------
-- 3) MOTIVOS DE CANCELAMENTO (buildMotivos / MOTIVOS)
--    sistema = padrão do sistema (cadeado): só pode inativar, não excluir.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motivos_cancelamento (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  sistema       boolean NOT NULL DEFAULT false,
  ativo         boolean NOT NULL DEFAULT true,
  ordem         integer NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motivos_cancelamento_empresa ON motivos_cancelamento (empresa_id);

-- ----------------------------------------------------------------------------
-- 4) AUTOMAÇÃO DE NÃO COMPARECIMENTO (WhatsApp)  bloco de config dos Motivos.
--    1 linha por empresa (config singleton). Espelha view-motivos (1762-1788).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noshow_automacao (
  empresa_id        uuid PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  ativa             boolean NOT NULL DEFAULT true,
  primeira_apos     text NOT NULL DEFAULT '2 horas',     -- 1ª mensagem após a sessão
  max_mensagens     integer NOT NULL DEFAULT 2,          -- máximo de mensagens no dia
  intervalo         text NOT NULL DEFAULT '2 horas',     -- intervalo entre mensagens
  mensagem          text NOT NULL DEFAULT 'Olá {cliente}! 💙 Notamos que você não compareceu à sua sessão de {serviço} hoje às {hora}. Aconteceu algo? Temos horários disponíveis e adoraríamos remarcar para você. É só responder aqui que reagendamos na hora! 😊',
  -- 3 toggles de regra de tratamento
  regra_reagenda    boolean NOT NULL DEFAULT true,       -- se responder, reagenda automaticamente
  regra_exclui      boolean NOT NULL DEFAULT true,       -- se não responder, exclui e computa no-show
  regra_oculta      boolean NOT NULL DEFAULT true,       -- não exibe no dia seguinte quem faltou
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5) RLS  habilitar + policies por papel.
--    Leitura: qualquer perfil autenticado. Escrita: admin_geral / gestor.
-- ----------------------------------------------------------------------------
ALTER TABLE documentos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE origens_cliente     ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivos_cancelamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE noshow_automacao    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documentos','origens_cliente','motivos_cancelamento','noshow_automacao'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_sel ON %I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_sel ON %I
      FOR SELECT
      USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()))
    $p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_rw ON %I', t, t);
    EXECUTE format($p$
      CREATE POLICY %I_rw ON %I
      FOR ALL
      USING (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                     AND p.papel IN ('admin_geral','gestor')))
      WITH CHECK (EXISTS (SELECT 1 FROM perfis_usuario p WHERE p.id = auth.uid()
                     AND p.papel IN ('admin_geral','gestor')))
    $p$, t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6) SEED  espelha ORIGENS, MOTIVOS, DOCS_LIST e DOC_MODELS do legado.
--    Idempotente: só insere se a tabela estiver vazia para a empresa.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_empresa uuid;
BEGIN
  SELECT id INTO v_empresa FROM empresas ORDER BY 1 LIMIT 1;
  IF v_empresa IS NULL THEN RETURN; END IF;

  -- Origens de cliente (ORIGENS)
  IF (SELECT count(*) FROM origens_cliente WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO origens_cliente (empresa_id, nome, ativo, auto, campo, ordem) VALUES
      (v_empresa, 'Geolocalizado', true, true,  false, 1),
      (v_empresa, 'Passante',      true, false, false, 2),
      (v_empresa, 'Indicação',     true, false, false, 3),
      (v_empresa, 'Parcerias',     true, false, false, 4),
      (v_empresa, 'Outros',        true, false, true,  5);
  END IF;

  -- Motivos de cancelamento (MOTIVOS)  3 do sistema + 3 personalizados
  IF (SELECT count(*) FROM motivos_cancelamento WHERE empresa_id = v_empresa) = 0 THEN
    INSERT INTO motivos_cancelamento (empresa_id, nome, sistema, ativo, ordem) VALUES
      (v_empresa, 'Cliente Cancelou (antecipadamente)',               true,  true, 1),
      (v_empresa, 'Cliente não compareceu (e não reagendou)',         true,  true, 2),
      (v_empresa, 'Cliente Reagendou (antes ou depois da sessão)',    true,  true, 3),
      (v_empresa, 'Problema de saúde',                                false, true, 4),
      (v_empresa, 'Gravidez',                                         false, true, 5),
      (v_empresa, 'Insatisfação com o serviço',                       false, true, 6);
  END IF;

  -- Config de automação de não comparecimento (singleton por empresa)
  INSERT INTO noshow_automacao (empresa_id) VALUES (v_empresa)
  ON CONFLICT (empresa_id) DO NOTHING;

  -- Documentos (DOCS_LIST + DOC_MODELS). Só se vazio para a empresa.
  IF (SELECT count(*) FROM documentos WHERE empresa_id = v_empresa) = 0 THEN

    -- Anamnese Digital (5 seções, ~44 perguntas, flags inv)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo, secoes) VALUES
    (v_empresa, 'Anamnese Digital', 'Anamnese',
     'Ficha clínica preenchida na sala de avaliação ou de aplicação',
     'Obrigatório para todos os clientes', true, 'Ativo', false,
     $json$[
       {"titulo":"Ficha clínica (preenchido na sala de avaliação ou na sala de aplicação)","campos":[
         {"q":"Você está usando ácido retinóico?","t":"simnao"},
         {"q":"Faz uso de Roacutan?","t":"simnao"},
         {"q":"Faz uso de antidepressivo?","t":"simnao"},
         {"q":"Você está realizando tratamento médico?","t":"simnao"},
         {"q":"Se sim, qual?","t":"textocurto"},
         {"q":"Você tem lúpus?","t":"simnao"},
         {"q":"Tem Psoríase?","t":"simnao"},
         {"q":"Você tem vitiligo?","t":"simnao"},
         {"q":"É epilético?","t":"simnao"},
         {"q":"Já teve alguma alergia?","t":"simnao"},
         {"q":"Você tem histórico de Herpes?","t":"simnao"},
         {"q":"Tem histórico de câncer?","t":"simnao"},
         {"q":"Se sim, aonde e a quanto tempo?","t":"textocurto"},
         {"q":"Possui alguma doença diagnosticada?","t":"simnao"},
         {"q":"Como é a sua cicatrização?","t":"selecao"},
         {"q":"Usa Protetor Solar diariamente?","t":"simnao"},
         {"q":"Usa clareador tópico?","t":"simnao"},
         {"q":"Usa hidratante?","t":"simnao"},
         {"q":"Mais alguma observação em relação à saúde do cliente?","t":"textolongo"}
       ]},
       {"titulo":"Perguntas que, se respondido positivamente, inviabiliza os serviços","campos":[
         {"q":"Você está grávida?","t":"simnao","inv":true},
         {"q":"Está amamentando?","t":"simnao","inv":true},
         {"q":"Se sim, tem quanto tempo?","t":"textocurto"},
         {"q":"Já realizou algum tipo de camuflagem?","t":"simnao"},
         {"q":"Se sim, onde?","t":"textocurto"},
         {"q":"Você possui alergia a algum anestésico?","t":"simnao","inv":true},
         {"q":"Se você respondeu sim à última pergunta, deseja realizar os serviços sem a utilização de anestésicos?","t":"simnao"}
       ]},
       {"titulo":"Exclusivo para clientes de ultrassom","campos":[
         {"q":"Tem PMMA?","t":"simnao"},
         {"q":"Possui Fio Russo?","t":"simnao"},
         {"q":"Tem marcapasso ou implante?","t":"simnao","inv":true},
         {"q":"Qual a prega de gordura do abdômen, flancos, papada, supra e infraescapular?","t":"textocurto"},
         {"q":"Possui doenças do colágeno? (artrite reumatoide, esclerose sistêmica progressiva, dermatomiosite)","t":"simnao"},
         {"q":"Se sim, qual delas?","t":"textocurto"},
         {"q":"O ULTRASSOM proporciona uma baixa quantidade de energia de ultrassom focado para a pele. Entendo que pode haver algum desconforto durante o tratamento, quando o ultrassom está sendo entregue.","t":"consent"},
         {"q":"Estou ciente que são possíveis alguns efeitos pós tratamento, podendo ser apresentada vermelhidão na pele, leve inchaço, hematomas, nódulos, leve sensibilidade ou formigamentos em áreas determinadas, que podem durar algumas horas ou mais.","t":"consent"}
       ]},
       {"titulo":"Avaliação estética","campos":[
         {"q":"Quais os cuidados diários com a pele, descrever aqui:","t":"textolongo"},
         {"q":"Qual o fototipo do cliente?","t":"selecao"},
         {"q":"Qual a sua principal queixa?","t":"textocurto"},
         {"q":"Quais serviços são recomendados? (Incluir número de sessões)","t":"textolongo"},
         {"q":"Estou ciente que, apesar de improváveis, alguns efeitos temporários podem ocorrer, como vermelhidão, hematomas, edemas, hiperpigmentação, hipopigmentação ou sensibilidade reduzida ao toque, herpes, bem como eventual risco de lesão em nervo e formação de cicatriz, de forma TEMPORÁRIA.","t":"consent"},
         {"q":"Estou de acordo que toda fotografia feita do meu caso será usada para fins de acompanhamento da evolução do tratamento, não servindo para outros fins exceto que previamente autorizado.","t":"consent"},
         {"q":"Estou ciente de que os meus dados somente serão utilizados para fins dos serviços contratados, nos termos da LGPD.","t":"consent"},
         {"q":"Autorizo o uso das imagens do meu caso para fins de divulgação da marca, sem a minha identificação.","t":"simnao"}
       ]},
       {"titulo":"Assinaturas","campos":[
         {"q":"Assinatura do cliente","t":"assinatura"},
         {"q":"Nome do profissional responsável e número do registro no Conselho","t":"textocurto"},
         {"q":"Assinatura do profissional de saúde","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Termo de Realização de Sessão (acumulativo, 2 seções)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, acumulativo, secoes) VALUES
    (v_empresa, 'Termo de Realização de Sessão', 'Ficha de sessão',
     'Termo acumulativo: reabre o mesmo documento e registra cada nova sessão',
     'Obrigatório para todos os clientes', true, 'Ativo', true,
     $json$[
       {"titulo":"Declaração de manutenção das condições de saúde","campos":[
         {"q":"Declaro para os devidos fins que as informações prestadas na ficha de Anamnese quando do início do tratamento estão mantidas. Caso sua resposta seja negativa, deve ser refeita a Anamnese.","t":"simnao","inv":true},
         {"q":"Declaro para os devidos fins que não estou grávida.","t":"simnao","inv":true},
         {"q":"Declaro para os devidos fins que não estou tomando nenhum medicamento que não tenha sido declarado na ficha de Anamnese.","t":"simnao"},
         {"q":"Declaro para os devidos fins que estou ciente de que para a realização das sessões devo evitar exposição ao sol 10 dias antes e 10 dias depois da sessão.","t":"simnao"}
       ]},
       {"titulo":"Registro da sessão (preenchido a cada nova sessão)","campos":[
         {"q":"Data da sessão","t":"textocurto"},
         {"q":"Serviços realizados e parâmetros de potências utilizadas","t":"textolongo"},
         {"q":"O que foi feito na sessão","t":"textolongo"},
         {"q":"Evolução do cliente","t":"textolongo"},
         {"q":"Novas fotos da sessão","t":"imagem"},
         {"q":"Assinatura do cliente","t":"assinatura"},
         {"q":"Nome do profissional responsável e número do registro no Conselho","t":"textocurto"},
         {"q":"Assinatura do profissional de saúde","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Autorização para Menor (1 seção, 14 campos)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Autorização para Menor', 'Termo', 'Termo de autorização de realização de sessão(ões) por menor',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Termo de autorização de realização de sessão(ões) por menor","campos":[
         {"q":"Nome do responsável legal","t":"textocurto"},
         {"q":"Documento de identificação do responsável","t":"textocurto"},
         {"q":"Relação de parentesco com o menor","t":"textocurto"},
         {"q":"Nome do menor","t":"textocurto"},
         {"q":"Documento de identificação do menor","t":"textocurto"},
         {"q":"Data de nascimento do menor","t":"textocurto"},
         {"q":"Procedimento a ser realizado e número de sessões contratadas","t":"textolongo"},
         {"q":"Como responsável, fui informado claramente dos riscos, contraindicações, efeitos colaterais e advertências gerais sobre o procedimento a ser realizado.","t":"consent"},
         {"q":"Declaro que os termos técnicos foram explicados e todas as minhas dúvidas foram esclarecidas pela equipe.","t":"consent"},
         {"q":"Declaro que acompanhei presencialmente o(a) menor em todas as etapas, inclusive durante a realização do procedimento estético.","t":"consent"},
         {"q":"Comprometo-me a orientar o(a) menor a seguir corretamente todas as orientações pós-procedimento e a fazer uso dos produtos da prescrição domiciliar recomendada, isentando os profissionais envolvidos de responsabilidade por intercorrência decorrente de maus cuidados pós-procedimento.","t":"consent"},
         {"q":"Declaro minha anuência expressa com todos os termos contidos na ficha clínica que integra o presente termo, bem como me responsabilizo pelos pagamentos dos serviços contratados e aplicados ao menor.","t":"consent"},
         {"q":"Por fim, declaro que li e compreendi o presente termo e seus anexos, pelo que dou meu consentimento e autorizo o(a) menor a submeter-se ao referido procedimento estético, assumindo a responsabilidade pelo mesmo, por livre e espontânea vontade.","t":"consent"},
         {"q":"Assinatura do responsável","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Autorização de Uso de Imagem (regra de comissão 10% / 30 dias)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Autorização de Uso de Imagem', 'Termo', 'Autorização de uso de imagem para divulgação da marca',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Autorização de uso de imagem","campos":[
         {"q":"Procedimento a ser realizado na Declarante","t":"textocurto"},
         {"q":"A parte acima qualificada declara que expressa a sua vontade em autorizar que a empresa, ou qualquer de suas filiais, se utilize da imagem da declarante, seja fazendo procedimentos estéticos ou nas dependências de qualquer unidade da rede, para fins de divulgação.","t":"consent"},
         {"q":"Que, em troca, será ofertado um serviço estético a laser gratuito à declarante, estando ciente que possui obrigação de, sempre que realizar os serviços, fazer a divulgação do referido serviço em suas redes sociais (post e stories) e da marca e/ou suas filiais, bem como compartilhar os referidos materiais para uso; o não cumprimento da divulgação impede a Declarante de receber o serviço ofertado ou deverá pagar pelo serviço realizado.","t":"consent"},
         {"q":"Serviço ofertado e número de sessões","t":"textocurto"},
         {"q":"Estou ciente que não há prazo para a postagem das imagens feitas da Declarante, sendo permitido, inclusive, reposts das fotos, em qualquer rede social da marca.","t":"consent"},
         {"q":"Que a Declarante opta por fazer uma promoção aos seus seguidores ofertando um código com desconto a ser definido, sendo devida à Declarante uma comissão de 10% sobre as vendas realizadas nos 30 dias seguintes à primeira postagem, em serviços estéticos a laser (pacotes, sem desconto sobre o preço de tabela), mediante apresentação de relatório das Ordens de Serviço com o referido desconto.","t":"consent"},
         {"q":"Caso seja positiva a resposta anterior, indique o código de desconto da cliente","t":"textocurto"},
         {"q":"Assinatura da Declarante","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Formulário de Solicitação de Cancelamento (3 seções)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Formulário de Solicitação de Cancelamento', 'Formulário', 'Formulário de solicitação de cancelamento de contrato',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Formulário de solicitação de cancelamento de contrato","campos":[
         {"q":"Nome completo da solicitante","t":"textocurto"},
         {"q":"Número do CPF","t":"textocurto"},
         {"q":"Endereço de e-mail","t":"textocurto"},
         {"q":"Telefone celular com DDD","t":"textocurto"},
         {"q":"Unidade onde contratou o serviço","t":"textocurto"}
       ]},
       {"titulo":"Informações contratuais","campos":[
         {"q":"Quais os serviços que foram contratados?","t":"textolongo"},
         {"q":"Quantas sessões?","t":"textocurto"},
         {"q":"Qual o motivo do cancelamento do serviço?","t":"textolongo"},
         {"q":"Qual a data da contratação?","t":"textocurto"},
         {"q":"Qual o valor pago?","t":"textocurto"},
         {"q":"Qual a forma de pagamento e número de parcelas?","t":"textocurto"},
         {"q":"Quantas sessões foram realizadas?","t":"textocurto"},
         {"q":"Quantas parcelas foram pagas (e o total pago)?","t":"textocurto"}
       ]},
       {"titulo":"Assinatura","campos":[
         {"q":"Assinatura da solicitante","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Termo de Transferência de Pacotes (1 seção, 8 campos)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Termo de Transferência de Pacotes', 'Termo', 'Termo de autorização para transferência de pacote',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Termo de autorização para transferência de pacote","campos":[
         {"q":"De um lado, Cliente Titular e CPF","t":"textocurto"},
         {"q":"E, de outro lado: Beneficiário(a) e CPF","t":"textocurto"},
         {"q":"O(a) Cliente Titular declara que adquiriu junto à rede o pacote de procedimentos abaixo identificado.","t":"consent"},
         {"q":"Procedimento(s) e quantidade de sessões","t":"textolongo"},
         {"q":"O(a) Cliente Titular autoriza, de forma livre e consciente, a TRANSFERÊNCIA do referido pacote de procedimentos ao(à) Beneficiário(a) acima identificado(a).","t":"consent"},
         {"q":"A rede não se responsabiliza por quaisquer tratativas financeiras entre o(a) Cliente Titular e o(a) Beneficiário(a), sendo a transferência válida apenas quanto ao direito de uso dos serviços contratados.","t":"consent"},
         {"q":"Após a assinatura do presente termo, o(a) Beneficiário(a) passa a ser considerado(a) responsável único(a) pelo uso do pacote, não cabendo ao(à) Cliente Titular posteriores reclamações ou solicitações relacionadas a este contrato.","t":"consent"},
         {"q":"Assinatura do(a) Cliente Titular","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Termo de Troca de Procedimento para Crédito (1 seção)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Termo de Troca de Procedimento para Crédito', 'Termo', 'Termo de troca de procedimento para crédito interno',
     'Opcional', false, 'Ativo',
     $json$[
       {"titulo":"Termo de troca de procedimento para crédito","campos":[
         {"q":"Nome","t":"textocurto"},
         {"q":"CPF","t":"textocurto"},
         {"q":"Procedimento","t":"textocurto"},
         {"q":"Quantas sessões","t":"textocurto"},
         {"q":"Valor da troca","t":"textocurto"},
         {"q":"Por meio do presente TERMO declaro estar ciente da substituição, por mim solicitada, de troca de procedimento(s) a laser contratado(s), conforme pacote originalmente adquirido. Declaro estar ciente de que: a) o valor referente ao(s) procedimento(s) já realizado(s) será descontado do total do pacote adquirido, conforme tabela vigente da unidade; b) o saldo remanescente será convertido em crédito interno, exclusivo para aquisição de outros procedimentos oferecidos pela unidade; c) não haverá devolução em dinheiro, sendo a utilização restrita aos serviços da unidade; d) a troca está sujeita à disponibilidade e às condições técnicas indicadas pelos profissionais da unidade; e) os resultados podem variar conforme o perfil individual de cada pessoa, histórico clínico e adesão às recomendações fornecidas.","t":"consent"},
         {"q":"Assinatura do cliente","t":"assinatura"}
       ]}
     ]$json$::jsonb);

    -- Orientações Pós-Laser (Rascunho, subconjunto de unidades  demonstra status)
    INSERT INTO documentos (empresa_id, nome, tipo, descricao, preenchimento, obrigatorio, status, secoes) VALUES
    (v_empresa, 'Orientações Pós-Laser', 'Termo', 'Orientações de cuidados pós-procedimento a laser',
     'Opcional', false, 'Rascunho',
     $json$[
       {"titulo":"Orientações pós-laser","campos":[
         {"q":"Evite exposição solar por 10 dias antes e depois da sessão","t":"consent"},
         {"q":"Aplique protetor solar diariamente na área tratada","t":"consent"},
         {"q":"Assinatura do cliente","t":"assinatura"}
       ]}
     ]$json$::jsonb);

  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS documentos, origens_cliente, motivos_cancelamento,
--                        noshow_automacao CASCADE;
-- =============================================================================


-- ██  automacoes.sql  ████████████████████████████████████████████████████████
-- ============================================================================
-- Módulo: Automações + Disparos WhatsApp
-- Paridade com o legado (legacy/index.html):
--   - AUTOS 3880-3910 (22 automações PADRÃO da rede) + renderAutos 3939-3971
--   - MENS_CUSTOM 3914 (mensagens PERSONALIZADAS por unidade)
--   - DISP_CAMPS 6536 / dispCampanhas 6615 / dispCampReport 6624 (campanhas)
--   - DISP_BASES 6529 / dispBases 6635 / segModal 6678 (bases & segmentos)
--   - VIP_GROUPS 6542 / dispVIP 6713 (Grupo VIP)
--
-- No legado tudo é MOCK em memória (persistState/localStorage). Aqui viram tabelas
-- reais, multi-tenant por empresa, escopo opcional por unidade.
--
-- O catálogo das 22 automações PADRÃO (texto/gatilho/ação/categoria) vive no código
-- (src/lib/automacoes.ts AUTOS_PADRAO)  espelho fiel do AUTOS do legado. Aqui só
-- persistimos o ESTADO por unidade (ativa/inativa) e as personalizadas.
--
-- Aplicar este arquivo no projeto lkii (Supabase) antes de usar as telas.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Estado das automações PADRÃO por unidade (usar / não usar)
--    Legado: switch por card (renderAutos 3967) grava por unidade.
--    Linha presente = override do default; ausência = usa o default do catálogo.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.automacoes_estado (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  -- chave da automação no catálogo (ex.: 'revenda_8m', 'boas_vindas')
  chave       text not null,
  ativa       boolean not null default true,
  atualizado_por uuid references public.perfis_usuario(id),
  atualizado_em  timestamptz not null default now(),
  unique (unidade_id, chave)
);
create index if not exists automacoes_estado_uni_idx on public.automacoes_estado (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Automações PERSONALIZADAS criadas por unidades / padrão da rede (admin)
--    Legado: MENS_CUSTOM (unidade) + AUTOS.push (admin → padrão da rede).
--    escopo='rede' (admin, vale p/ todas as unidades) | 'unidade' (só a dona).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.automacoes_custom (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  -- null quando escopo='rede'; preenchido quando escopo='unidade'.
  unidade_id  uuid references public.unidades(id) on delete cascade,
  escopo      text not null default 'unidade' check (escopo in ('rede', 'unidade')),
  nome        text not null,
  -- gatilho ("Quando…") e ação ("→ …"), iguais aos campos gat/ac do legado.
  gatilho     text not null default 'condição definida pela unidade',
  acao        text not null default 'envia uma mensagem ao cliente',
  categoria   text not null default 'Personalizada',
  ativa       boolean not null default true,
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists automacoes_custom_emp_idx on public.automacoes_custom (empresa_id);
create index if not exists automacoes_custom_uni_idx on public.automacoes_custom (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Config da automação de NÃO COMPARECIMENTO (no-show) por unidade
--    Legado: view-motivos 1762-1788 (4 campos + textarea + 3 regras).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.automacao_noshow (
  unidade_id        uuid primary key references public.unidades(id) on delete cascade,
  empresa_id        uuid not null references public.empresas(id) on delete cascade,
  ativa             boolean not null default true,
  -- "1ª mensagem após a sessão" (legado: "2 horas")
  primeira_apos     text not null default '2 horas',
  -- "Máximo de mensagens no dia" (legado: 2, min 1 max 2)
  max_dia           int not null default 2 check (max_dia between 1 and 2),
  -- "Intervalo entre mensagens" (legado: "2 horas")
  intervalo         text not null default '2 horas',
  mensagem          text not null default 'Olá {cliente}! 💙 Notamos que você não compareceu à sua sessão de {serviço} hoje às {hora}. Aconteceu algo? Temos horários disponíveis e adoraríamos remarcar para você. É só responder aqui que reagendamos na hora! 😊',
  -- 3 toggles de regra (legado 1772-1774)
  reagenda_se_responde boolean not null default true,
  exclui_se_sem_resposta boolean not null default true,
  oculta_dia_seguinte  boolean not null default true,
  atualizado_em     timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Bases & Segmentos para campanhas (Disparos › Bases)
--    Legado: DISP_BASES 6529 + segModal 6678 (tipo Sistema/Externa).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.disparo_bases (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid references public.unidades(id) on delete cascade,
  nome        text not null,
  -- 'sistema' = segmento dinâmico por critérios; 'externa' = CSV/Excel importado
  tipo        text not null default 'sistema' check (tipo in ('sistema', 'externa')),
  -- estimativa de contatos (segCount do legado) OU total importado
  contatos    int not null default 0,
  -- critérios do segmentador (SEG_CAMPOS) quando tipo='sistema' (json)
  criterios   jsonb not null default '[]'::jsonb,
  -- números colados/importados quando tipo='externa' (text[] normalizado)
  numeros     text[] not null default '{}',
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists disparo_bases_emp_idx on public.disparo_bases (empresa_id);
create index if not exists disparo_bases_uni_idx on public.disparo_bases (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 5) Campanhas de disparo (histórico + métricas)
--    Legado: DISP_CAMPS 6536 / dispCampanhas 6615 / dispCampReport 6624.
--    status: draft|sched|run|done (espelha WA_ST do legado).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.disparo_campanhas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid references public.unidades(id) on delete cascade,
  nome        text not null,
  base_nome   text,                       -- rótulo da base/segmento usado
  base_id     uuid references public.disparo_bases(id) on delete set null,
  canal_nome  text,                       -- instancia_nome da UAZAPI
  status      text not null default 'draft' check (status in ('draft', 'sched', 'run', 'done')),
  enviadas    int not null default 0,
  entregues   int not null default 0,
  lidas       int not null default 0,
  respostas   int not null default 0,
  -- id da campanha na UAZAPI (folder_id) p/ acompanhar
  uazapi_id   text,
  agendada_para timestamptz,
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists disparo_campanhas_emp_idx on public.disparo_campanhas (empresa_id, criado_em desc);
create index if not exists disparo_campanhas_uni_idx on public.disparo_campanhas (unidade_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 6) Grupos VIP (Disparos › Grupo VIP)
--    Legado: VIP_GROUPS 6542 / dispVIP 6713 (ciclo Convite/Aquecimento/Ofertas).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.vip_grupos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  unidade_id  uuid references public.unidades(id) on delete cascade,
  nome        text not null,
  data_convite     date,
  data_aquecimento date,
  data_oferta_ini  date,
  data_oferta_fim  date,
  membros     int not null default 0,
  -- status: sched(agendado)|warm(aquecendo)|live(ao vivo)|done(encerrado)
  status      text not null default 'sched' check (status in ('sched', 'warm', 'live', 'done')),
  link_publico text,
  criado_por  uuid references public.perfis_usuario(id),
  criado_em   timestamptz not null default now()
);
create index if not exists vip_grupos_emp_idx on public.vip_grupos (empresa_id);

-- ============================================================================
-- RLS  leitura pela empresa do usuário; escrita por papéis de gestão.
--   A empresa do usuário é resolvida via perfis_usuario → unidades → empresa_id.
-- ============================================================================

-- helper inline repetido nas policies (mesma forma do agenda.sql / categorias.sql):
--   empresa_id in (select u.empresa_id from unidades u join perfis_usuario p on p.unidade_id=u.id where p.id=auth.uid())
--   or perfil admin_geral

do $$
declare t text;
begin
  foreach t in array array[
    'automacoes_estado', 'automacoes_custom', 'automacao_noshow',
    'disparo_bases', 'disparo_campanhas', 'vip_grupos'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format($pol$
      drop policy if exists %1$s_sel on public.%1$s;
      create policy %1$s_sel on public.%1$s
        for select to authenticated
        using (
          empresa_id in (
            select u.empresa_id from public.unidades u
            join public.perfis_usuario p on p.unidade_id = u.id
            where p.id = auth.uid()
          )
          or exists (select 1 from public.perfis_usuario p where p.id = auth.uid() and p.papel = 'admin_geral')
        );
    $pol$, t);

    execute format($pol$
      drop policy if exists %1$s_ins on public.%1$s;
      create policy %1$s_ins on public.%1$s
        for insert to authenticated
        with check (
          exists (select 1 from public.perfis_usuario p
            where p.id = auth.uid() and p.papel in ('admin_geral','gestor','operacoes'))
        );
    $pol$, t);

    execute format($pol$
      drop policy if exists %1$s_upd on public.%1$s;
      create policy %1$s_upd on public.%1$s
        for update to authenticated
        using (
          exists (select 1 from public.perfis_usuario p
            where p.id = auth.uid() and p.papel in ('admin_geral','gestor','operacoes'))
        );
    $pol$, t);

    execute format($pol$
      drop policy if exists %1$s_del on public.%1$s;
      create policy %1$s_del on public.%1$s
        for delete to authenticated
        using (
          exists (select 1 from public.perfis_usuario p
            where p.id = auth.uid() and p.papel in ('admin_geral','gestor','operacoes'))
        );
    $pol$, t);
  end loop;
end $$;

-- ── Seed opcional: bases "Sistema" dinâmicas (espelham DISP_BASES do legado) ──
-- Descomente para semear bases de exemplo na 1ª empresa.
-- insert into public.disparo_bases (empresa_id, nome, tipo, contatos)
-- select e.id, x.nome, 'sistema', x.n
-- from public.empresas e
-- cross join (values
--   ('Clientes ativos', 1204), ('Aniversariantes do mês', 42),
--   ('Inativos há 60 dias', 146), ('Fez Ultrassom há 8 meses', 88)
-- ) as x(nome, n)
-- limit 4;


-- ██  implantacao.sql  ████████████████████████████████████████████████████████
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


-- ██  juridico.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  Jurídico (paridade com o legado: Notificações extrajudiciais,
--             documentos contratuais e modelos de notificação)
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html, bloco "Jurídico" ~4896-5009) tem três peças
--   que NÃO existem no backend lkii:
--     1) FILA DE NOTIFICAÇÕES geradas a partir de recebíveis em atraso
--        (JUR_NOTIFS 4911)  assunto + corpo padrão montados com os dados da
--        unidade, status pendente/enviada, vínculo com o recebível (fin_recebiveis).
--     2) MODELOS de notificação editáveis (JUR_TEMPLATES 4900)  7 pré-prontos
--        com merge fields {unidade},{franqueado},{cnpj},{prazo},{data}.
--     3) DOCUMENTOS contratuais por unidade (JUR_DOCS 4897)  Contrato de
--        Franquia, Pré-contrato e COF (arquivo + data).
--
--   Integração: a fila de notificações se liga ao Financeiro Franqueadora pela
--   coluna fin_recebiveis.jur_id (já existente em scripts/migrations/financeiro.sql).
--
-- COMO APLICAR (manual  esta migration NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/juridico.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) NOTIFICAÇÕES JURÍDICAS  fila gerada a partir de recebíveis em atraso.
--    Espelha JUR_NOTIFS (legado 4911) + finGerarNotifJuridica (4920-4931).
--    Snapshot dos dados da unidade/débito no momento da geração (relatório histórico).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS juridico_notificacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id) ON DELETE SET NULL,
  -- vínculo lógico com fin_recebiveis(id). SEM FK rígida p/ não acoplar a ordem das
  -- migrations (financeiro.sql pode não estar aplicada ainda); a unicidade abaixo
  -- (uq_jur_notif_fin) já evita gerar 2 notificações para o mesmo recebível.
  fin_id        uuid,
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
-- 2) MODELOS DE NOTIFICAÇÃO  templates editáveis por empresa.
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
-- 4) RLS  habilita e cria policies por empresa (alinhado às demais tabelas).
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
-- 5) SEED  7 modelos de notificação pré-prontos (JUR_TEMPLATES 4900-4908).
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
    (v_empresa, 'Royalties em atraso  1ª notificação',
     'Notificação  Royalties em atraso · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Constatamos que os royalties referentes à unidade {unidade} (CNPJ {cnpj}) encontram-se em atraso. Solicitamos a regularização no prazo de {prazo} a contar do recebimento desta.' || E'\n\n' ||
     'Permanecemos à disposição para tratar de eventual repactuação.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico  Laser&Co' || E'\n' || '{data}', 1),
    (v_empresa, 'Royalties em atraso  2ª notificação',
     '2ª Notificação  Royalties em atraso · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Reiteramos a notificação anterior quanto ao atraso dos royalties da unidade {unidade}. A persistência da inadimplência poderá ensejar as medidas previstas no contrato de franquia, inclusive a sua rescisão.' || E'\n\n' ||
     'Concedemos prazo final de {prazo} para a quitação.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico  Laser&Co' || E'\n' || '{data}', 2),
    (v_empresa, 'Uso indevido da marca  1ª notificação',
     'Notificação  Uso indevido da marca · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Identificamos uso da marca Laser&Co em desacordo com o Manual de Identidade e o contrato de franquia na unidade {unidade}. Solicitamos a imediata adequação e a remoção de qualquer material irregular no prazo de {prazo}.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico  Laser&Co' || E'\n' || '{data}', 3),
    (v_empresa, 'Uso indevido da marca  2ª notificação',
     '2ª Notificação  Uso indevido da marca · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Apesar da notificação anterior, persiste o uso indevido da marca na unidade {unidade}. Notificamos, em caráter final, para cessar o uso irregular em {prazo}, sob pena das sanções contratuais e legais cabíveis.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico  Laser&Co' || E'\n' || '{data}', 4),
    (v_empresa, 'Notificação de rescisão contratual',
     'Notificação de rescisão contratual · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Nos termos do contrato de franquia e da Lei 13.966/2019, notificamos a rescisão do contrato relativo à unidade {unidade} (CNPJ {cnpj}), em razão de descumprimento de obrigações essenciais, a produzir efeitos conforme as cláusulas pactuadas.' || E'\n\n' ||
     'Ficam mantidas as obrigações de não concorrência e de cessação do uso da marca.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico  Laser&Co' || E'\n' || '{data}', 5),
    (v_empresa, 'Descumprimento de padrões da rede',
     'Notificação  Descumprimento de padrões · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Em auditoria/checklist da unidade {unidade} foram constatados desvios aos padrões operacionais da rede. Solicitamos plano de ação e regularização no prazo de {prazo}, sob acompanhamento da equipe de Operações.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico  Laser&Co' || E'\n' || '{data}', 6),
    (v_empresa, 'Inadimplência  taxa de franquia / fundo de marketing',
     'Notificação  Inadimplência de taxas · {unidade}',
     'Prezado(a) {franqueado},' || E'\n\n' ||
     'Constatamos inadimplência relativa à taxa de franquia/fundo de marketing da unidade {unidade}. Solicitamos a regularização em {prazo}, evitando a incidência de encargos e medidas contratuais.' || E'\n\n' ||
     'Atenciosamente,' || E'\n' || 'Departamento Jurídico  Laser&Co' || E'\n' || '{data}', 7);
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (manual, se necessário):
--   DROP TABLE IF EXISTS juridico_notificacoes;
--   DROP TABLE IF EXISTS juridico_templates;
--   DROP TABLE IF EXISTS juridico_documentos;
-- =============================================================================


-- ██  marketing.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  Marketing + Disco Virtual + Universidade Corporativa
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
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
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
-- RLS  habilita e cria policies por empresa (alinhado às demais tabelas).
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

-- uni_etapas não tem empresa_id direto  herda da trilha.
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
-- SEED  popula a 1ª empresa com o conteúdo do legado (idempotente: só insere
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


-- ██  nfse.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  Notas Fiscais (NFS-e) + Integração com prefeituras
-- =============================================================================
-- CONTEXTO
--   O legado (legacy/index.html, buildNotas ~8502-8531) tem a tela de Notas
--   Fiscais com três peças que NÃO existem no backend lkii:
--     1) NOTAS EMITIDAS (numero, competencia, tipo, cliente, fato gerador,
--        valor, status)  tabela `nfse`.
--     2) CONFIGURAÇÃO FISCAL POR UNIDADE (provedor municipal, alíquota ISS,
--        inscrição municipal, certificado/token, ambiente, status de conexão)
--         tabela `nfse_config_unidade`.
--     3) POLÍTICA DE EMISSÃO DA REDE (nenhuma|venda|execucao) + flag
--        "calcular por sessão"  tabela `nfse_politica` (1 registro por empresa).
--
--   Tudo idempotente. Espelha as colunas que a UI de /notas lê.
--
-- COMO APLICAR (manual  esta migration NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/nfse.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) POLÍTICA DE EMISSÃO DA REDE  1 registro por empresa.
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
-- 2) CONFIGURAÇÃO FISCAL POR UNIDADE  1 registro por unidade.
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
-- 3) NOTAS EMITIDAS  registro/listagem de NFS-e (emissão fiscal real = TODO).
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
-- 4) RLS  habilita e cria policies por empresa (alinhado às demais tabelas).
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


-- ██  rh.sql  ████████████████████████████████████████████████████████
-- =============================================================================
-- Migration  RH (Portal de RH nativo) + PONTO DIGITAL GPS
--   Paridade com o legado: legacy/index.html (Ponto Digital, buildPontoDigital ~8458;
--   PONTO_CFG ~8415) e legacy/portal-rh.html (Dashboard, Colaboradores, Ponto, Folha,
--   Férias e Ausências, Desempenho, Regras da Rede).
-- =============================================================================
-- CONTEXTO
--   O legado servia o RH como uma SPA React separada via <iframe src="portal-rh.html">
--   e o Ponto Digital guardava tudo em localStorage (PONTO_CFG / PONTO_REG). Aqui
--   recriamos cada tela como rota Next nativa, persistindo o estado em tabelas reais:
--
--     ponto_config        : a config do ponto (PONTO_CFG) por UNIDADE  raio da cerca
--                           virtual, lat/lng da base, chave Google Maps, modo padrão.
--     registros_ponto     : o espelho de ponto (PONTO_REG)  uma linha por marcação,
--                           com GPS, distância da base e validação da cerca (Haversine).
--     folha_pagamento     : a Folha (Salário Bruto/Líquido, INSS, IRRF, FGTS, 13º).
--     solicitacoes_ferias : Férias e Ausências (vacationRequests)  período aquisitivo,
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
-- COMO APLICAR (manual  NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/rh.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) PONTO_CONFIG  config do Ponto Digital por unidade (legado PONTO_CFG).
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
-- 2) REGISTROS_PONTO  espelho de ponto (legado PONTO_REG). Consumida por /ponto.
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
-- 3) RH_DEPARTAMENTOS  tela Configurações do portal (cadastro de departamentos).
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
-- 4) FOLHA_PAGAMENTO  Folha (legado tela Folha de Pagamento).
--    Proventos/descontos por competência (mês/ano) e colaborador.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folha_pagamento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia     text NOT NULL,                           -- 'AAAA-MM'
  salario_bruto   numeric(12,2) NOT NULL DEFAULT 0,
  inss            numeric(12,2) NOT NULL DEFAULT 0,
  irrf            numeric(12,2) NOT NULL DEFAULT 0,
  fgts            numeric(12,2) NOT NULL DEFAULT 0,        -- depósito (8%)  não desconta do líquido
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
-- 5) SOLICITACOES_FERIAS  Férias e Ausências (legado vacationRequests).
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
-- 6) ATESTADOS  atestados médicos (legado collection atestados).
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
-- 7) DESEMPENHO  avaliacoes_desempenho / pdi / metas_colaborador.
--    (Consumidas por /rh/desempenho  criadas aqui se o base ainda não as tiver.)
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
-- 8) RECRUTAMENTO  vagas / candidatos (consumidas por /rh/recrutamento).
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
-- 9) RLS  leitura para qualquer autenticado; escrita para gestão de RH.
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
-- 10) SEED  config de ponto por unidade ativa + departamentos padrão.
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


-- ██  STORAGE BUCKETS  ████████████████████████████████████████████████
insert into storage.buckets (id, name, public) values
  ('disco-virtual','disco-virtual', false), ('contratos','contratos', false), ('sac-midia','sac-midia', true)
on conflict (id) do nothing;
