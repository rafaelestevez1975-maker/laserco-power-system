-- Universidade centralizada (single-org): corrige a RLS de uni_progresso.
--
-- A policy antiga (uni_progresso_emp) exigia que o empresa_id da linha estivesse na
-- empresa da UNIDADE do usuário (perfis_usuario JOIN unidades ON unidade_id). Isso
-- quebrava a gravação de nota/conclusão em dois casos:
--   1) Admin Universidade tem unidade_id = NULL  -> o JOIN dá vazio -> INSERT e SELECT
--      bloqueados (nota não grava; painel do admin lê 0 progresso).
--   2) Colaborador de franquia: a trilha é da franqueadora (000...001) mas a empresa do
--      colaborador é outra -> também bloqueava.
--
-- Como a Universidade é um catálogo único (todas as trilhas na franqueadora) e a escrita
-- é controlada no código (submeterProva grava sempre perfil_id = auth.uid()):
--   * SELECT liberado (o painel Alunos & Notas / Dashboards agrega o progresso de todos).
--   * INSERT/UPDATE só da PRÓPRIA linha (perfil_id = auth.uid()).
drop policy if exists uni_progresso_emp on uni_progresso;
drop policy if exists uni_progresso_sel on uni_progresso;
drop policy if exists uni_progresso_ins on uni_progresso;
drop policy if exists uni_progresso_upd on uni_progresso;

create policy uni_progresso_sel on uni_progresso for select using (true);
create policy uni_progresso_ins on uni_progresso for insert with check ((select auth.uid()) = perfil_id);
create policy uni_progresso_upd on uni_progresso for update using ((select auth.uid()) = perfil_id) with check ((select auth.uid()) = perfil_id);
