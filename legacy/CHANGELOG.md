# Changelog — Laser&Co Power System

## 2026-06-19 — RH, Comunicados e Chamados
### Recursos Humanos
- **Ponto Digital** agora aceita marcação no raio da **unidade** OU no raio do **endereço de casa** (home office, capturado por GPS); cada colaborador vê **só o seu ponto**; layout adaptado para **celular**.
- Removido o item **Configurações** do RH. O **vínculo de unidade/local** do colaborador passa a ser definido no **cadastro inicial do colaborador** (campo "Local de lotação").
- Novo **cadastro de Escritório** (ao lado de Unidades) para quem não atua diretamente em loja — selecionável como local de lotação.

### Comunicados
- **Filtros + dashboard**: período (padrão do sistema), destinatário (geral, unidades próprias, franquias, franqueados, office) e **assunto**.
- **Assuntos** padronizados no envio e nos filtros: Marketing, Operações, Comercial, Área Técnica, Diretoria, Treinamentos e Recursos Humanos.
- Gráficos de comunicados por assunto e por destinatário (com percentuais).

### Chamados
- Removidos os **status**; filtros iguais aos de Comunicados (período, assunto, departamento) + filtro **Ativos / Finalizados**.
- **SLA de 2 dias úteis**: contado a partir do **primeiro dia útil seguinte** à abertura; a **data-limite** aparece no chamado e na lista (Em dia / Atrasado / Concluído).


## 2026-06-16 — PWA + link compartilhável
- **PWA instalável**: `manifest.webmanifest` real (tema bordô #230A10), ícones próprios (192/512/maskable/apple-touch), `sw.js` (service worker network-first com fallback offline) e botão **“Instalar app”**.
- **SAC nativo** com filtros (dashboard/chamados), Triagem WhatsApp com fluxo, Ranking, integração com Colaboradores e Matriz de Comissões.
- **SAC → Pagamentos**: acordos parcelados (1º pgto após dia 15), OK do gestor, **espelho automático em Contas a Pagar**, observação ao credor e **encerramento automático do chamado** ao pagar.
- **Reembolso automático** no SAC (busca contrato/sessões, multa 30% editável/isenta).
- **Financeiro**: status **Suspenso** (fora dos totais em aberto e dashboards) + filtro; importação Excel em Pagar/Receber.
- **RH e Dashboards**: removido o menu/login internos dos apps embarcados (sem “flash”).


## 2026-06-15

### Adicionado — Gestão de Indiques (módulo novo, em GESTÃO)
- **Lista de indicações**: planilha com indicador (nome, CPF, WhatsApp) + 3 a 5 indicados (nome/WhatsApp). A indicação fica a favor da unidade que cadastra. Mostra a **última informação** (status do CRM) para saber se a lista está sendo trabalhada. Filtro por unidade + KPIs.
- **Indicação manual**: formulário (indicador + 3 a 5 indicados); os indicados entram automaticamente no **CRM de indicações** (quadro "Gestão Indicações").
- **Prêmio & Link**: cadastro do prêmio do mês (admin) e **link compartilhável por unidade**, preenchido automaticamente. Ciclo mensal do dia 1 ao último dia; sorteio no 1º dia do mês seguinte às 18h no Instagram da unidade.
- **Sorteio animado**: rola pelos nomes (acelera/desacelera), destaca o(a) ganhador(a) com confete — pensado para transmissão ao vivo no Instagram. Notificação do ganhador por e-mail + WhatsApp (parabéns + agendar sessão).
- Perfis de acesso: card "Gestão de Indiques".

### Antes (mesmo ciclo)
- **Financeiro Franqueadora**: importação de lançamentos via Excel (modelo + detecção de atraso); item **Cálculos** com correção monetária + juros 1% + multa 10%, encargos separados do principal, valor nominal/com acréscimos, datas de vencimento e pagamento.
- **Jurídico** integrado às cobranças em atraso do Financeiro (notificação padrão automática, fila com OK/enviar).
- **Notas Fiscais**: emissor NFS-e multi-prefeitura + forma de pagamento **Crédito Recorrente (PagoLivre)** (até 12x, não Ultrassom, dupla visão Vendas/Recorrência).
- **Expansão**: CRM de franquias (captação Geo/Site, disparador próprio, notificação de novo lead).
- **Ponto Digital** (GPS + Google Maps), **Marketing** (materiais + notícias), **Checklist Mensal PDCA** auto-preenchido.
- **59 unidades oficiais** importadas (telefone, endereço, e-mail) de lasercompany.com.

### Infra
- Deploy: GitHub (rafaelestevez1975-maker/laserco-power-system) → Vercel (auto-deploy na branch main).
- Produção: https://laserco-power-system.vercel.app
