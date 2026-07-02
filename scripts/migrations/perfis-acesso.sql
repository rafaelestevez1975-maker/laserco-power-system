-- ============================================================================
-- PERFIS DE ACESSO pré-configurados — sugestão do cliente (Rafael, 01/07/2026)
-- "Perfis definem o que o usuário ACESSA; cargos identificam a FUNÇÃO (texto no
--  cadastro do colaborador)." Os perfis viram linhas em `cargos` (is_sistema),
-- com permissões por módulo (recursos.modulo × acoes) — mesmo RBAC da migration 009.
-- Idempotente: roda de novo sem duplicar.
-- Módulos existentes: comercial, crm, financeiro, marketing, operacoes, rh, sac,
-- sistema, treinamento. Ações: admin, aprovar, criar, deletar, editar, exportar, ler.
-- ============================================================================

-- 1) Cria os perfis (cargos de sistema, rede — empresa_id null)
insert into cargos (empresa_id, nome, slug, descricao, is_sistema, ativo)
select null, v.nome, v.slug, v.descricao, true, true
from (values
  ('Super Administrador','perfil_super_admin','Acesso total, inclusive configurações do sistema.'),
  ('Administrador','perfil_administrador','Acesso total aos módulos de negócio (sem configurações de sistema).'),
  ('Diretor','perfil_diretor','Visão executiva: lê, exporta e aprova em todos os módulos.'),
  ('Operações','perfil_operacoes','Gestão completa de operações + leitura do comercial.'),
  ('Financeiro','perfil_financeiro','Gestão completa do financeiro + leitura de operações.'),
  ('Marketing','perfil_marketing','Gestão completa de marketing + leitura do CRM.'),
  ('RH','perfil_rh','Gestão completa de RH e treinamento.'),
  ('Expansão','perfil_expansao','Gestão do funil de expansão (CRM) + leitura de comercial e marketing.'),
  ('SAC','perfil_sac','Gestão completa do SAC.'),
  ('Jurídico','perfil_juridico','Leitura do financeiro (cobrança/inadimplência) e do SAC.'),
  ('TI','perfil_ti','Configurações e administração do sistema.'),
  ('Auditor','perfil_auditor','Somente leitura e exportação em todos os módulos.'),
  ('Franqueado','perfil_franqueado','Opera a própria unidade: comercial e operações completos; lê financeiro, RH e treinamento.'),
  ('Gerente de Unidade','perfil_gerente_unidade','Gestão da unidade: comercial e operações completos; lê RH e financeiro.'),
  ('Supervisor','perfil_supervisor','Supervisiona a operação: cria/edita no comercial; lê operações e SAC.'),
  ('Comercial / Recepção','perfil_comercial_recepcao','Vendas e agenda: cria/edita/lê/exporta no comercial.'),
  ('Profissional Técnico','perfil_profissional_tecnico','Executa atendimentos: lê agenda/comercial e operações.')
) as v(nome, slug, descricao)
where not exists (select 1 from cargos c where c.slug = v.slug);

-- 2) Permissões por perfil (módulo × ações). Helper inline por CTE.
with regras(slug, modulo, acoes) as (values
  -- Super Admin: tudo
  ('perfil_super_admin','*','*'),
  -- Administrador: tudo menos módulo sistema
  ('perfil_administrador','comercial','*'),('perfil_administrador','crm','*'),('perfil_administrador','financeiro','*'),
  ('perfil_administrador','marketing','*'),('perfil_administrador','operacoes','*'),('perfil_administrador','rh','*'),
  ('perfil_administrador','sac','*'),('perfil_administrador','treinamento','*'),
  -- Diretor: ler/exportar/aprovar em tudo
  ('perfil_diretor','*','ler,exportar,aprovar'),
  -- Operações
  ('perfil_operacoes','operacoes','*'),('perfil_operacoes','comercial','ler'),
  -- Financeiro
  ('perfil_financeiro','financeiro','*'),('perfil_financeiro','operacoes','ler'),
  -- Marketing
  ('perfil_marketing','marketing','*'),('perfil_marketing','crm','ler'),
  -- RH
  ('perfil_rh','rh','*'),('perfil_rh','treinamento','*'),
  -- Expansão
  ('perfil_expansao','crm','*'),('perfil_expansao','comercial','ler'),('perfil_expansao','marketing','ler'),
  -- SAC
  ('perfil_sac','sac','*'),
  -- Jurídico
  ('perfil_juridico','financeiro','ler,exportar'),('perfil_juridico','sac','ler'),
  -- TI
  ('perfil_ti','sistema','*'),
  -- Auditor: ler/exportar em tudo
  ('perfil_auditor','*','ler,exportar'),
  -- Franqueado
  ('perfil_franqueado','comercial','*'),('perfil_franqueado','operacoes','*'),
  ('perfil_franqueado','financeiro','ler'),('perfil_franqueado','rh','ler'),('perfil_franqueado','treinamento','ler'),
  -- Gerente de Unidade
  ('perfil_gerente_unidade','comercial','*'),('perfil_gerente_unidade','operacoes','*'),
  ('perfil_gerente_unidade','rh','ler'),('perfil_gerente_unidade','financeiro','ler'),
  -- Supervisor
  ('perfil_supervisor','comercial','criar,editar,ler,exportar'),('perfil_supervisor','operacoes','ler'),('perfil_supervisor','sac','ler'),
  -- Comercial / Recepção
  ('perfil_comercial_recepcao','comercial','criar,editar,ler,exportar'),
  -- Profissional Técnico
  ('perfil_profissional_tecnico','comercial','ler'),('perfil_profissional_tecnico','operacoes','ler')
)
insert into cargo_permissoes (cargo_id, permissao_id)
select c.id, p.id
from regras g
join cargos c on c.slug = g.slug
join permissoes p on true
join recursos r on r.id = p.recurso_id
where (g.modulo = '*' or r.modulo = g.modulo)
  and (g.acoes = '*' or p.acao_id = any(string_to_array(g.acoes, ',')))
  and not exists (select 1 from cargo_permissoes cp where cp.cargo_id = c.id and cp.permissao_id = p.id);

notify pgrst, 'reload schema';
