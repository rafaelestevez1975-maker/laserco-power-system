# Auditoria de paridade BEMP × Power System — 11/07/2026

**Estratégia vigente (reunião 11/07):** espelhar o BEMP exatamente ("copia e cola, até a vírgula")
antes de qualquer melhoria; nível **franqueadora primeiro**, franquias depois. SAC/Saque,
Universidade e Financeiro atuais **não param** (contingência). As melhorias do HTML do Rafael
entram módulo a módulo **depois** da base espelhada.

## Como este material foi levantado

- Login web no BEMP (`laserco.bemp.app`, credenciais do Mateus em `.env.local` → `BEMP_WEB_*`).
  O BEMP é um app Rails server-rendered (Devise + Ransack) — navegável por script com cookie jar.
- 36 telas baixadas autenticadas + as 22 páginas de edição de perfis de acesso + 73 páginas da
  lista de usuários. Todo dado citado aqui tem fonte no BEMP real de produção.
- ⚠️ **O acesso direto ao Postgres do BEMP morreu**: a senha do usuário `org_00103`
  (em `../RH/.env.local`, `BEMP_PG_*`) foi rotacionada após o sync de 04/07. Ver
  `05-DADOS-INACESSIVEIS.md` — item nº 1 da pauta com o cliente/Diego.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `01-MAPA-BEMP.md` | Mapa completo do BEMP: menu, telas, relatórios, volumes, padrões de UX |
| `02-RBAC-BEMP.md` | Perfis de acesso: 22 perfis × 159 permissões × 43 módulos + plano de espelhamento |
| `03-MATCH-DADOS.md` | Dados BEMP × nosso: divergências achadas, **correções já aplicadas em 11/07** e pendências |
| `04-MATCH-TELAS.md` | Match 1:1 tela a tela (BEMP ↔ nossa rota ↔ HTML legado) + sobras classificadas |
| `05-DADOS-INACESSIVEIS.md` | Lista p/ reunião com o cliente: o que não conseguimos puxar do BEMP e o que precisamos pedir |
| `digest-operacao.md` | Funcionamento detalhado: Agenda, OS, Clientes, Serviços, Pacotes, Produtos, Anamnese, CRM |
| `digest-financeiro.md` | Funcionamento detalhado: Contas, Formas de pagto, Descontos, NF, Metas, Comissões, Dashboard |
| `digest-config.md` | Funcionamento detalhado: Unidades, Minha Unidade, Minha Conta, cadastros básicos, mensagens |
| `inventario-nosso.md` | Inventário do nosso sistema: 126 telas, RBAC, tabelas, o que já veio do BEMP |
| `dados/matriz-permissoes.csv` | Matriz permissão × perfil (159 × 22) extraída do BEMP — insumo da nova tela de Perfis |
| `dados/bemp-colaboradores.tsv` | 2.190 usuários do BEMP (601 ativos) com perfil, % comissão e flags |
| `dados/bemp-ativos-*.json` | IDs/nomes do que está ATIVO no BEMP (unidades, pacotes, serviços) |
| `dados/bemp-faltantes.json` | Dados completos dos 9 pacotes + 2 serviços que faltavam (já importados) |
