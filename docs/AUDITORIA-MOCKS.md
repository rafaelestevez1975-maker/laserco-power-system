# 🔍 Auditoria de dados mockados (Onda 4)

> Varredura paralela do projeto inteiro (20 agentes, 1 por módulo) a pedido do cliente:
> "o app está lotado de dados mockados, não foi isso que pedi". **38 pontos de mock real**
> (fora config legítima). Regra de correção: **mock com fonte real → query real; sem fonte → empty-state honesto** (nada de inventar dado).

## Placar
- 🔴 **Pesados:** `financeiro`, `dashboards`, `marketing` (disco+universidade)
- 🟡 **Leves (12):** relatorios, clientes, agenda, comissoes, expansao, crm, categorias, sac, automacoes, juridico, nfse, comunicados(0)
- 🟢 **Limpos (5):** catalogo, checklist, rbac, anamnese, rh

## ✅ Corrigido (seeds de migration que injetavam dado de NEGÓCIO fake)
Removidos  as tabelas nascem **vazias** e recebem dado real:
- **`financeiro.sql`**  recebíveis fake (royalties/fundo por unidade, fórmula `58000+(i*37)%92…`) + **8 contas a pagar fake** (Salários R$86.400, Impostos R$41.870, Aluguel, Marketing…).
- **`relatorios.sql`**  **60 contratos fake** (Club Bronze/Prata/Ouro, status/datas rotacionados).
- **`marketing.sql`**  todo o conteúdo fake de Marketing/Notícias/Materiais/Disco/Universidade, **incluindo vídeos rickroll** (`dQw4w9WgXcQ`) nas trilhas. Mantida só a config padrão do Disco.
- `_APLICAR-TUDO.sql` regenerado sem os seeds fake.

## ⏳ Pendente  mock em COMPONENTES/PÁGINAS (renderiza fake na tela)
> ⚠️ Estes arquivos estão sendo editados **agora pela sessão paralela** (`diandra`): `FinanceiroTabs.tsx`, `dashboards/agg.ts`, páginas de relatórios, expansão, jurídico. **Não toquei pra não dar clobber.** Precisam de coordenação.

### 🔴 financeiro (`src/components/financeiro/FinanceiroTabs.tsx`, `src/lib/financeiro.ts`)
- `lib/financeiro.ts:54-55`  saldos chumbados **R$320k / R$412k** na projeção de caixa → deveria vir de saldo real.
- `FinanceiroTabs.tsx:31`  mês **"Maio/2026"** fixo → usar mês atual (`new Date()`).
- `FinanceiroTabs.tsx:232`  **data fixa 13/06/2026** na projeção → usar hoje.
- `FinanceiroTabs.tsx:245`  `SALDO_INICIAL_PROJ=320000` fixo.
- `FinanceiroTabs.tsx:785-790`  índices **IGP-M/IPCA/INPC/SELIC/CDI hardcoded** → API SGS do Banco Central (ou empty/manual).

### 🔴 dashboards (`src/app/(app)/dashboards/funil/page.tsx`, `public/vendas-dashboards.html`)
- `funil/page.tsx:138-161`  sub-dashboard **Revenda** com 4 KPIs + 3 gráficos **100% chumbados** (56%, 47 dias, R$690, categorias) → calcular do real ou empty-state.
- `public/vendas-dashboards.html:593`  objeto **`RAW` (~1MB) de dados fake** alimentando os 4 dashboards de Vendas (geral/mês/comparativo/histórico).

### 🟡 leves (1-4 achados cada)
- **nfse** (4), **crm** (3), **relatorios** (2  seed já tratado), **expansao** (2), e 1 cada em: clientes, agenda, comissoes, categorias, sac, automacoes, juridico.
- Detalhe completo em `/tmp/.../tasks/wp26njvgm.output` (resultado do workflow de auditoria).

## Princípio para fechar
Onde **existe fonte real** (vendas, OS, clientes, agendamentos, lançamentos) → trocar por query.
Onde a fonte **depende de migration não aplicada** ou **não existe** (revenda, índices BCB, RAW de vendas) → **empty-state honesto** ("sem dados" / "aplique a migration"), nunca número inventado.
