# 🌙 Progresso noturno (sessão Claude do cliente) — parity legacy → Next

> Iniciado quando o cliente foi dormir pedindo "faz tudo que falta do html funcionar, quando voltar quero tudo pronto".
> Branch de trabalho: `feat/sac-paridade-alta` (tudo commitado e enviado pro GitHub).
> Regras que sigo sozinho: **commit + push a cada entrega** (nada se perde) · migrations **só ADITIVAS** (CREATE TABLE de tabela nova; nunca DROP/ALTER em tabela existente; aplico uma de cada vez) · não toco no que a outra sessão deixou (preservado em `wip/paralelo-checkpoint`).

## ✅ Já entregue nesta sessão (commitado + GitHub)
- **Financeiro/Contas/Leads:** submenu do Financeiro; tela `/financeiro` real (sem o lixo fictício "BEMP"); coluna+filtro de Unidade (nosso × franquia) em /contas; filtros nos Leads do site.
- **SAC — paridade com o legado (6 commits):** Novo Chamado e Editar Chamado completos (todos os campos do legado + prioridade Crítica); Config (SLA, Integrações, Canais); Novo acordo avulso; ficha do cliente no modal; importador com Valor Pago/Reembolso/Data.
- **Backup:** trabalho da sessão paralela preservado em `wip/paralelo-checkpoint` (tinha 8 erros de tipo; salvo pra não perder).

## 🔎 Diagnóstico que muda tudo
- O banco lkii tem **136 tabelas** — o sistema está MUITO mais completo do que o pânico sugeria. CRM, Unidades, SAC, Clientes, Agenda, Contas, Catálogo, Perfis, Comunicados, Chamados, Recrutamento, Canais, Expansão: **já funcionam**.
- O "TODO de 600 gaps" está **desatualizado** (gerado antes de várias implementações).
- O que falta de verdade: **ligar telas clone que já têm tabela** (sem migration) + **poucos módulos sem tabela** (com migration aditiva).

## 🏗️ Ondas (atualizo conforme avança)
- [ ] **Onda A (rodando):** Marketing · Ponto Digital · Desempenho · Jurídico — têm tabela real, sem migration.
- [ ] **Onda B:** demais clone com tabela (Folha/Benefícios, Férias/Ausências, Regras da Rede, App do Cliente, etc.).
- [ ] **Onda C (com migration aditiva):** Universidade (cursos/aulas), Notas Fiscais (NFS-e), Disco Virtual (arquivos), e o que mais faltar tabela.
- [ ] **Onda D:** varredura final de paridade tela-a-tela contra o legado + fix de bugs.

## ⚠️ Dependem de você / de credencial externa (não dá pra "funcionar" 100% sem isso)
- **Boletos no banco** (emissão/baixa) e **conciliação bancária real**: exigem convênio/API do banco.
- **NFS-e**: exige backend fiscal/certificado.
- **Envio real de WhatsApp/e-mail**: exige número conectado / SMTP.
- **Disco Virtual**: depende de Storage/Google Workspace.
Para esses, eu construo a tela + a estrutura e deixo pronto pra plugar; marco aqui o que ficou pendente de credencial.

## 🔐 Segurança
Tokens (Supabase x2, Vercel) foram colados no chat — **trocar/revogar** assim que possível.
