# SAC — TODO de paridade visual com o legado (`legacy/index.html`)

Inventário tela por tela de **tudo que está diferente** do mockup legado.
Legenda:
- 🎨 **VISUAL** — diferença de layout/estilo. Corrigir para ficar **idêntico**.
- ⚙️ **FEATURE** — o Next adicionou dado/função real que o mockup não tem. Mantido por decisão ("visual idêntico, manter features"). **Marcar se o cliente quiser remover** pra ficar 100% igual ao mockup.
- ✅ feito · ⏳ pendente

> Atenção: o módulo está sendo editado por **várias sessões ao mesmo tempo**. Itens ✅ podem ser sobrescritos; revisar no fim com uma sessão só.

---

## 1. Kanban ✅ (corrigido)
- ✅ 🎨 Header "Quadro de atendimentos · Clique em → para avançar a fase" (faltava).
- ✅ 🎨 Colunas 230px em `surface-2`, título `brand-600` **sem bolinha** + contador `brand-500` (antes reusava `.kan-col` 272px do CRM com bolinha).
- ✅ 🎨 Card: ordem `protocolo → nome → motivo·canal → badge prioridade + seta "→"` (antes: nome primeiro + 2 badges, sem seta).

## 2. Dashboard ✅ (corrigido — outra sessão)
- ✅ 🎨 KPIs `.rel-kpi` (ícone dourado + número Playfair).
- ✅ 🎨 Gráficos `.dash-w` em grid 2×2 + widget "Reembolsos" + "Chamados recentes".

## 3. Importar ✅ (corrigido)
- ✅ 🎨 Header `.rel-card` "Importar leads / reclamações" + descrição das colunas.
- ✅ 🎨 Ação: "Baixar modelo" (ghost) + "Selecionar planilha" (primary).
- ⚙️ Mapeamento de colunas + prévia (feature mantida — não existe no mockup).

## 4. Pagamentos ✅ (header corrigido)
- ✅ 🎨 Header num **card único** `.rel-card`: título `ti-cash` + subtítulo de contagem + botão "Novo acordo" (`ti-plus`) à direita.
- ⏳ ⚙️ Acordos renderizados como **tabela** expansível (legacy = um `.rel-card` por acordo com tabela de parcelas dentro). Decisão: manter tabela (escala melhor) ou voltar a cards do legacy?
- ⚙️ Lista de Reembolsos (espelho Contas a Pagar) — feature, não existe no mockup.

## 5. Chamados ⏳
- ⏳ 🎨 **Cor do badge de prioridade** difere do legacy:
  - Baixa deve ser texto `#2563EB` / fundo `#E7EEFB` (hoje cinza).
  - Média deve ser texto `#B7791F` / fundo `#FBF3E2` (hoje dourado `#9A6700`/`#FBEFD9`).
- ⏳ 🎨 Botão editar deve ser `btn btn-ghost` (hoje só `btn`), padding `3px 8px`.
- ⏳ 🎨 Conferir ordem dos filtros do legacy: Motivo · Atendente · Unidade · Canal · Status · Período.
- ⚙️ Colunas extras "Atendente" e "SLA"; filtros "Fase"/"Situação"; paginação — features reais (manter).

## 6. Triagem ⏳
- ⏳ 🎨 Falta o **header** `.rel-card` "Conversa" + "Veja as conversas e abra o chamado com 1 clique".
- ⏳ 🎨 Grid `320px 1fr` → **`300px 1fr`** + `gap:14`.
- ⏳ 🎨 Bolha de **saída**: `#DCF8C6` → `var(--brand-500)`, **sem border**, texto branco; `max-width 72%` → **78%**.
- ⏳ 🎨 Card "Fluxo inicial": borda `solid` topo → **`1px dashed` em volta**.
- ⏳ 🎨 Label do botão "Abrir chamado" → **"Abrir chamado automaticamente"**.
- ⚙️ Avatares, abas (Todas/Minhas/Fila), **mídia no chat**, atribuição de atendente, notas, dropdown de status — features reais (manter; marcar se quiser remover pra igualar mockup).

## 7. Relatórios ⏳
- ⏳ 🎨 Seletor de **Período**: legacy usa `<select>` dropdown; Next usa pills/chips. Alinhar.
- ⏳ 🎨 Label "Período" 12px normal (legacy) vs 10px uppercase bold (Next).
- ⏳ 🎨 `align-items:flex-end` na barra de filtros (legacy) vs `flex-start`/`space-between`.
- ⏳ 🎨 Widget Reembolsos com `margin-top:14px` (legacy).
- ⚙️ Botão "Exportar CSV" (legacy tinha só "Aplicar"); painel de KPIs no topo; widgets extras "Por fase/Por prioridade"; resumo textual de reembolsos; rodapé informativo — features (manter ou remover p/ igualar).

## 8. Atendentes ⏳
- ⏳ 🎨 Badge de **Perfil** não distingue Administrador: legacy = Admin fundo `brand-500`/texto branco, demais `#EEE`/`#555`. Hoje roxo fixo.
- ⏳ 🎨 Nomenclatura coluna "Papel" (Next) vs **"Perfil"** (legacy).
- ⏳ 🎨 Banner de premiação: legacy = ícone + texto + **link inline** "Matriz de Comissões". Hoje tem 3 botões + subtexto extra.
- ⚙️ Colunas extras (Cargo, Unidade, Conversas, Em aberto, Carga, Prêmio), E-mail como subtexto, botão "Novo atendente", semáforo de cor no SLA, rodapé de ajuda — features reais. Legacy tinha só `Nome · E-mail · Perfil · Status · Chamados · Resolvidos · SLA`.

## 9. Ranking (Premiação) ⏳ (poucas diferenças)
- ⏳ 🎨 Card "Destaque": legacy = rótulo fixo **"Destaque do mês · maior premiação"**; Next deixa dinâmico ("Destaque · {período} · …").
- ⏳ 🎨 Alinhamento de colunas numéricas na tabela: Next centraliza (Atend./Finaliz./Reversões/No prazo/Atrasos) e alinha à direita (Vendas/Prêmio); legacy é tudo à esquerda. (Manter o do Next costuma ficar melhor — confirmar.)
- ⚙️ Linha de "cargo" sob o nome do atendente, campo "Meta CSAT" editável, mensagem de fallback "Sem premiação a destacar…" — features/ajustes do Next (manter).

## 10. Config ⏳
- ⏳ 🎨 Cards usam `.lc-card`; legacy usa **`.rel-card`** (SLA, Canais, Integrações, Motivos).
- ⏳ 🎨 Grid SLA+Canais: `auto-fit minmax(320px)` gap16 → **`1fr 1fr` gap14**.
- ⏳ 🎨 Header margin-bottom 14 → **12**.
- ⏳ 🎨 Integrações: título tem ícone `ti-puzzle` (legacy não tem — só texto bold); status deve mostrar **"Conectado" (verde `#0F6B3A`) / "Desativado" (cinza)** conforme `on`, hoje sempre cinza "Não configurado".
- ⏳ 🎨 Canais: chips **sem** contagem `(n)` no legacy.
- ⚙️ Motivos editáveis + seção "Tags" + input SLA com botão Salvar (legacy = chips read-only, onchange direto, sem Tags) — features. Legacy ordem: SLA → Canais → Integrações → Motivos.
