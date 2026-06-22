# Arquitetura Alvo — Next.js + React + Supabase

> Reconstrução do Laser&Co Power System mantendo **layout/tema/fonte idênticos**, com validação por campo, validação de toda chamada Supabase, CRUD completo, RBAC granular por ação e multitenant real por franquia. Este documento define o **como**. O inventário do **o quê** está em [MAPEAMENTO.md](MAPEAMENTO.md); o plano de execução em [BACKLOG.md](BACKLOG.md).

---

## 1. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server Components, Server Actions, revalidação nativa (`revalidatePath`/`revalidateTag`). |
| UI | **React + Tailwind CSS** com tokens do tema atual (`--brand-500` etc.) | Replica o visual 1:1 sem reescrever a identidade. |
| Componentes | **shadcn/ui** (Radix) recolorido para a paleta roxa/dourada | Acessível, sem mudar o look. |
| Ícones | **Tabler Icons** (`@tabler/icons-react`) | Mesmos ícones do protótipo. |
| Formulários | **react-hook-form + Zod** (`@hookform/resolvers`) | Erro **abaixo de cada campo**, validação compartilhada client+server. |
| Backend | **Supabase** (Postgres + Auth + RLS + Storage + Edge Functions) | Reaproveita o backend; RLS faz o multitenant. |
| Dados | `@supabase/ssr` (server) + **Server Actions** para mutações | Toda escrita passa por validação server‑side. |
| Estado servidor | **React Query** (TanStack) onde houver UI muito interativa (Agenda, Kanban) | Cache + revalidação fina. |
| Tabelas | **TanStack Table** | Filtros/paginação que o protótipo já tem. |
| Gráficos | **Recharts** (ou manter Chart.js no módulo de Vendas) | Dashboards. |
| Testes | **Vitest** (unit/Zod) + **Playwright** (e2e por tela) | "Revalidar tudo" — ver §8. |
| PWA | `next-pwa` ou Service Worker custom (manter `sw.js`) | Preservar instalação/offline. |

---

## 2. Estrutura de pastas

```
app/
  (auth)/login/page.tsx
  (app)/
    layout.tsx                 # sidebar + topbar + guarda de auth/tenant
    dashboard/page.tsx
    agenda/page.tsx
    clientes/
      page.tsx                 # lista (Server Component) + filtros
      [id]/page.tsx            # ficha (abas)
      _actions.ts              # server actions: createCliente, updateCliente, ...
    pdv/page.tsx
    crm/page.tsx
    financeiro-franqueadora/...
    comissoes/  metas/  perfis/  unidades/  colaboradores/ ...
    rh/page.tsx                # embed do portal RH (ou migração nativa)
    dashboards/page.tsx        # embed vendas (ou nativo)
  api/
    webhooks/leads-site/route.ts   # P0: leads do site institucional
    webhooks/whatsapp/route.ts
components/
  ui/                          # shadcn recolorido (Button, Input, Select, Dialog...)
  layout/Sidebar.tsx  Topbar.tsx  ViewHeader.tsx
  data/DataTable.tsx  KpiRow.tsx  ChartCard.tsx  ReportFilters.tsx
  form/Field.tsx               # input + <FieldError> abaixo (padrão único)
  guard/Can.tsx                # <Can do="clientes.exportar"> ... </Can>
lib/
  supabase/client.ts  server.ts  middleware.ts
  validation/                  # schemas Zod por entidade (cliente.ts, os.ts, ...)
  auth/                        # sessão, perfil
  rbac/                        # permissions.ts, can(), usePermission()
  tenant/                      # contexto de unidade ativa, troca de franquia
  format/                      # cpf, cnpj, telefone, moeda, data (pt-BR)
  audit.ts  toast.ts
  db/                          # tipos gerados do Supabase (supabase gen types)
supabase/
  migrations/                  # SQL: tabelas + RLS + policies + seeds
  functions/                   # edge functions (royalties, nfse, sgs, ...)
styles/
  theme.css                    # variáveis --brand-500 etc. (copiadas do index.html)
```

---

## 3. Validação por campo (padrão único)

Um schema Zod por entidade, reutilizado no client (react-hook-form) e no server (Server Action). Helpers brasileiros: `cpf`, `cnpj`, `telefoneBR`, `cep`, `moedaBR`, `dataBR`.

```ts
// lib/validation/cliente.ts
export const clienteSchema = z.object({
  nome: z.string().min(3, 'Informe o nome completo'),
  telefone: telefoneBR(),                 // (00) 00000-0000
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  origem: z.string().min(1, 'Selecione onde nos conheceu'),
  documento: cpfOpcional(),               // bloqueia duplicidade no server
  unidadeId: z.string().uuid('Selecione a unidade'),   // multitenant
})
export type ClienteInput = z.infer<typeof clienteSchema>
```

```tsx
// componente de campo com erro abaixo (replicado em todo o sistema)
<Field label="Nome completo" error={errors.nome?.message}>
  <Input {...register('nome')} />
</Field>
```

> O mapeamento campo→regra de **todos os formulários** já está extraído em `docs/_raw/forms.txt` (88 formulários). Cada um vira um schema Zod.

**Validação de toda chamada Supabase:** um wrapper padrão que valida input, executa, e trata erro (incluindo RLS/policy) de forma uniforme:

```ts
export async function sb<T>(fn: () => PromiseLike<{data: T; error: PostgrestError|null}>) {
  const { data, error } = await fn()
  if (error) {
    if (/row-level|policy|permission/i.test(error.message))
      throw new ForbiddenError('Você não tem permissão para esta ação nesta unidade.')
    throw new DbError(error.message)
  }
  return data
}
```

---

## 4. RBAC granular por ação

- Tabelas: `roles`, `permissions (key = "modulo.acao")`, `role_permissions`. As ~52 entradas de `PERMS` viram linhas em `permissions`.
- **Server‑side (fonte da verdade):** toda Server Action começa com `await requirePermission('clientes.exportar')`, que lê o `role` do membership na **unidade ativa**. RLS no Postgres é a segunda barreira.
- **Client‑side (só UX):** `usePermission()` + `<Can do="...">` escondem/desabilitam botões. Nunca confiar só no client.

```tsx
<Can do="os.cancelar">
  <Button variant="danger" onClick={cancelarOS}>Cancelar OS</Button>
</Can>
```

- Alçadas (desconto por cargo, cortesias, criação de unidade) são checadas no server com os limites de `discount_limits`/`unit_discount_max`/`courtesy_limits`.

---

## 5. Multitenant

- **Contexto de unidade ativa** resolvido no servidor a partir da sessão (cookie) + `memberships`. Substitui `uniAtual()`.
- **Seletor de franquia** no topo (como hoje o `rolePill`), para usuários com N franquias; troca o tenant ativo.
- **RLS** em toda tabela operacional: `unit_id = current_setting('app.current_unit')` (ou via `auth.uid()` + join em `memberships`). Funções `get_my_units()`, `has_permission(key)`.
- **Franqueadora vs franqueado:** papéis da rede enxergam "Todas as unidades"; franqueado só a(s) sua(s). Status Teste/Inativa aplicado em policies e em filtros de relatório.

---

## 6. Data fetching & revalidação

- **Leitura:** Server Components buscam direto do Supabase (server client) → HTML já populado (substitui os `buildX()` que montavam innerHTML).
- **Escrita:** Server Actions → após sucesso, `revalidatePath('/clientes')` ou `revalidateTag('clientes')`. Listas sempre frescas.
- UI muito interativa (Agenda, Kanban CRM, PDV): React Query com `invalidateQueries` para resposta otimista.
- **Auditoria:** toda mutação chama `audit(modulo, acao, detalhe)` → `audit_log` (append‑only, política soft‑delete preservada).

---

## 7. Apps embarcados (RH e Vendas)

- **Curto prazo:** manter `portal-rh.html` e `vendas-dashboards.html` embarcados (iframe/route), preservando a ponte de dados — porém **migrando a fonte de dados para as tabelas normalizadas** (não o blob).
- **Médio prazo:** reescrever RH e Vendas como rotas nativas Next reaproveitando os componentes de tabela/gráfico. Decisão a confirmar com o cliente (escopo).

---

## 8. "Revalidar tudo" — política de qualidade (pedido explícito do cliente)

Toda alteração precisa ser **revalidada e assertiva**. Padrão por entrega:
1. **Zod**: testes unitários dos schemas (casos válidos/ inválidos) com Vitest.
2. **Server Actions**: teste de permissão (perfil sem acesso → bloqueado) e de tenant (não vaza dados de outra franquia).
3. **E2E (Playwright)** por tela: CRUD completo (create/edit/delete) + erro abaixo do campo + botão gated por permissão.
4. **RLS**: teste que confirma isolamento por `unit_id`.
5. **Revisão**: rodar `/code-review` no diff antes de commit; corrigir achados.
6. Nada de "salvar = toast" — toda ação persiste de verdade e dá feedback real.

---

## 9. Decisões a confirmar com o cliente

- **Supabase:** o cliente fornecerá o projeto de outro sistema para reaproveitar — validar schema existente vs o modelo proposto (§4 do MAPEAMENTO) e planejar migração/normalização.
- **Módulos com foco maior:** **Gestão**, **Saque** e **Integração com o site institucional (leads)**. O módulo **Saque** ainda não existe no protótipo — será modelado sobre Comissões/Premiações/Financeiro (definição de regra com o cliente).
- **Site institucional:** lasercompany.com — mapear quais formulários/fluxos hoje vão para WhatsApp e passarão a cair no painel (CRM/leads).
- Escopo da reescrita nativa de RH/Vendas vs manter embarcado.
