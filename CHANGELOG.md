# Changelog — Laser&Co Power System

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
