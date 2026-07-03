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
