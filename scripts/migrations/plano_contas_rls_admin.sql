-- 22/07: as Categorias de Contas a pagar mostravam 3 grupos / 12 itens quando o banco tem
-- 12 grupos / 93 categorias (o cliente reclamou: "mandei 10 grupos e 74 categorias, vocês me
-- devolvem 3 e 12, não tem nem salários a pagar").
--
-- NÃO era dado faltando — era RLS. A policy exigia que o empresa_id da linha estivesse na
-- empresa da UNIDADE do usuário:
--     empresa_id IS NULL OR empresa_id IN (
--       SELECT u.empresa_id FROM unidades u JOIN perfis_usuario p ON p.unidade_id = u.id
--        WHERE p.id = auth.uid() ...)
-- Admin/franqueadora tem unidade_id = NULL → o JOIN dá vazio → só enxergava as 26 linhas
-- órfãs (empresa_id IS NULL) e as 95 da empresa ficavam invisíveis. Mesmo bug já corrigido em
-- uni_progresso (ver uni_progresso_rls_single_org.sql) e na policy de clientes.
--
-- Catálogo é da organização e a escrita segue gated no código (PAPEIS_GESTAO/ehAdmin).
alter policy plano_contas_select on plano_contas
  using ((select exists (select 1 from perfis_usuario p where p.id = auth.uid())));

-- PENDÊNCIA conhecida (não corrigida aqui, precisa decisão do cliente): há DOIS grupos com
-- código 3 — "Vendas das Unidades" [receita] e "Custos dos Serviços" [despesa]. Como as telas
-- separam por tipo, não colide na UI, mas o código deixa de ser chave única do plano.
