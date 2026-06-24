# Guia do Desenvolvedor  `index.html`

`index.html` é grande (~900 KB) porque é uma SPA single-file. Esta página explica **como ele é organizado** para você navegar e estender com segurança.

## Estrutura do arquivo (de cima para baixo)

1. **`<head>` / `<style>`**  variáveis CSS de tema (`--brand-500: #6B4E9E`, `--gold-500`, etc.) e todas as classes (`.nav-item`, `.rel-card`, `.cli-table`, `.kpi`, `.os-st`, ...).
2. **Sidebar** (`<aside class="sidebar">`)  o menu. Cada item:
   - `data-view="x"` → abre a view `x`.
   - `data-submenu="x"` + um `<div class="submenu" id="sub-x">` logo abaixo → grupo expansível.
   - `data-admin="1"` → só admin enxerga.
   - `data-rhpage` / `data-exppage` / `data-dash` / `data-rep` → parâmetro extra para módulos com sub-páginas.
3. **Views** (`<section class="view" id="view-x">`)  uma por tela. Muitas têm só um contêiner (`<div id="xWrap">`) preenchido por JS.
4. **`<script>` principal**  todo o JavaScript: dados (seeds), funções `buildX()`, helpers de relatório, o roteador e a inicialização.

## Roteador

```js
const views = { dashboard:'view-dashboard', expansao:'view-expansao', /* ... */ };
function showView(view, el){
  // esconde todas, mostra views[view], e chama o build do módulo:
  if(view==='expansao') buildExpansao(el?.dataset.exppage || 'dashboard');
  if(view==='marketing') buildMarketing();
  // ...
}
```

Para **adicionar uma tela nova**:
1. Adicione o item no menu: `<div class="sub-item" data-view="novo" data-title="Novo">…</div>`.
2. Adicione a seção: `<section class="view" id="view-novo"><div id="novoWrap"></div></section>`.
3. Registre no mapa: `views.novo = 'view-novo';`.
4. Trate no `showView`: `if(view==='novo') buildNovo();`.
5. Escreva `function buildNovo(){ document.getElementById('novoWrap').innerHTML = ...; }`.

## Helpers de UI reutilizáveis (já existem)

| Helper | Uso |
|--------|-----|
| `relKpis([[label,valor,icone],...])` | linha de cards de KPI |
| `relTable(cols, rows)` | tabela padrão |
| `dashWidget(titulo, icone, inner)` | card de gráfico |
| `barChart(rows, gold)` | gráfico de barras (rows = `[label, valor, textoOpcional]`) |
| `rfPeriod`, `rfUni`, `rfSel`, `rfDate`, `rfText` | campos de filtro (período com data, multisseleção de unidade por estado, etc.) |
| `showToast(msg, icone)` | notificação |
| `auditLog(acao, detalhe)` | registra na Auditoria |
| `isAdmin()`, `uniAtual()` | perfil atual / unidade ativa |

## Dados centrais

| Constante | O que é |
|-----------|---------|
| `UNIDADES` | as 59 unidades ativas (nome, tel, cnpj, endereço, email, cidade, uf, tipo). Gerado de `UNI_RAW`. |
| `COM_CATS` | Matriz de Metas/comissões (base + tiers 80/100/120). |
| `PERMS` / `PERFIS` / `ROLE_ALLOW` | matriz de permissões, lista de perfis e regras de acesso por perfil. |
| `EXP_*` | dados do CRM de Expansão (leads, status, listas de disparo). |
| `MKT_TREE` / `MKT_UPDATES` / `MKT_NEWS` | Marketing (pastas, atualizações, notícias). |
| `FIN_*` / `CALC_*` | Financeiro Franqueadora (recebíveis, pagamentos, cálculos de atualização). |
| `JUR_TEMPLATES` / `JUR_NOTIFS` | Jurídico (modelos e fila de notificações vindas do Financeiro). |
| `PG_RECORRENTE` | config do Crédito Recorrente (PagoLivre). |

## Módulos principais e suas funções

- **Expansão** (CRM de franquias): `buildExpansao(page)`, páginas `dashboard/captacao/funnel/list/disparos/whatsapp/tipos`.
- **Marketing**: `buildMarketing()` (abas Atualizações/Materiais/Notícias) + `MKT_TREE`.
- **Ponto Digital** (GPS + Google Maps): `buildPontoDigital()`, `pontoMarcar(tipo)`, `PONTO_CFG`.
- **Notas Fiscais** (emissor NFS-e): `buildNotas()`, `NFSE_*`, `PG_RECORRENTE`.
- **Financeiro Franqueadora**: `buildFinFranq()` → abas `finFluxoHTML/finDreHTML/finCalcHTML/finReceberHTML/...`.
- **Jurídico**: `buildJur()` → `jurCobrancas()` (integra recebíveis em atraso), `finGerarNotifJuridica(r)`.
- **Checklist** (PDCA): `buildChecklist()` → `chkMensal()` auto-preenchido pelos indicadores.
- **Relatórios**: `buildRelatorio(el)` + `REL_DEFS` (defs por relatório). Faturamento (`relFaturamentoHTML`) e Pagamentos/Premiações (`relPremiacoesHTML`) são renderizadores especiais.

## Apps embarcados (iframes)

- `portal-rh.html` (React) e `vendas-dashboards.html` (JS+Chart.js) são servidos da mesma origem. O `index.html`:
  - injeta CSS no iframe para **esconder o menu interno** e **recolorir** para a paleta roxa (`rhHideSidebar`, `vendasFrameStyle`);
  - faz deep-link chamando funções internas do iframe (`showPage()` no Vendas; clique nos botões de nav no RH).

## Validação rápida (sem framework de teste)

```bash
# checa a sintaxe de todo o JS inline do index.html
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');\
const re=/<script(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)<\\/script>/g;let m,c='';\
while((m=re.exec(h)))c+=m[1]+'\\n;\\n';require('fs').writeFileSync('/tmp/a.js',c);\
require('child_process').execSync('node --check /tmp/a.js');console.log('OK')"
```

## Convenções

- Sem dependências de build. Bibliotecas externas só via CDN (`<script src>` no `<head>`), como Supabase e Chart.js.
- Cores **sempre** via variáveis CSV (`var(--brand-500)`), nunca hex solto, para manter o tema consistente.
- Nada de `localStorage` para segredos. A anon key do Supabase é pública e protegida por RLS.
