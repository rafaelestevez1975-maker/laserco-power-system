-- =============================================================================
-- Migration — COMISSÕES + COLABORADORES (paridade com o legado: legacy/index.html)
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
--        · Parte 1 — tiers por dezena (t80/t100/t120/t130)
--        · Parte 2 — fechamento do mês (f100/f120/f130)
--        · cargo (mapeia a categoria a um cargo do enum p/ o simulador casar
--          colaborador → categoria).
--
--   2. Ficha do Colaborador — abas "Acesso ao sistema" e "Agenda & Serviços"
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
-- COMO APLICAR (manual — NÃO é aplicada automaticamente):
--   psql "$DATABASE_URL" -f scripts/migrations/comissoes.sql
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) MATRIZ DE COMISSÕES (COM_CATS) — uma linha por categoria, por empresa.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matriz_comissoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid REFERENCES empresas(id) ON DELETE CASCADE,
  nome            text NOT NULL,                      -- nome da categoria (ex.: 'Consultoras de Vendas')
  cargo           text,                               -- cargo do enum correspondente (p/ pré-seleção no simulador)
  ordem           integer NOT NULL DEFAULT 0,
  -- Premiação base (marque um ou mais) — on + pct
  base_individual_on  boolean NOT NULL DEFAULT false,
  base_individual_pct numeric(6,2) NOT NULL DEFAULT 0,
  base_loja_on        boolean NOT NULL DEFAULT false,
  base_loja_pct       numeric(6,2) NOT NULL DEFAULT 0,
  base_sessao_on      boolean NOT NULL DEFAULT false,
  base_sessao_pct     numeric(6,2) NOT NULL DEFAULT 0,
  -- Parte 1 — adicional por dezena (sobre a premiação base)
  tier_t80        numeric(6,2) NOT NULL DEFAULT 0,
  tier_t100       numeric(6,2) NOT NULL DEFAULT 0,
  tier_t120       numeric(6,2) NOT NULL DEFAULT 0,
  tier_t130       numeric(6,2) NOT NULL DEFAULT 0,
  -- Parte 2 — adicional no fechamento do mês (sobre o valor final da unidade)
  fech_f100       numeric(6,2) NOT NULL DEFAULT 0,
  fech_f120       numeric(6,2) NOT NULL DEFAULT 0,
  fech_f130       numeric(6,2) NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matriz_comissoes_empresa ON matriz_comissoes (empresa_id);

-- ----------------------------------------------------------------------------
-- 2) COLABORADORES — colunas das abas "Acesso ao sistema" e "Agenda & Serviços".
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
-- 3) COLABORADOR_SERVICOS (colabServRender) — "Serviços que o colaborador executa".
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
-- 5) SEED — espelha COM_CATS do legado (5 categorias). Idempotente por empresa.
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
