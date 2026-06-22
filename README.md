# Laser&Co Power System — App (Next.js)

Front unificado da rede Laser&Co, migrando o protótipo HTML (`legacy/`) para **Next.js 15 + React + TypeScript + Tailwind + Supabase (`@supabase/ssr`) + UAZAPI (WhatsApp)**, sobre o backend compartilhado com RH e SAC (`lkiihnxznphxqekrgsgi`).

## Rodar

```bash
npm install
cp .env.example .env.local   # já criado a partir do ../SAC/.env.local (mesmo backend)
npm run dev                  # http://localhost:3000
```

## Estrutura

```
src/
  app/
    (app)/            # área autenticada (shell: sidebar + topbar)
      layout.tsx      # gate de auth + perfil (perfis_usuario)
      page.tsx        # dashboard
      [...slug]/      # placeholder "em construção" p/ rotas ainda não feitas
    login/            # tela de login (Supabase Auth)
    api/webhooks/     # webhooks (UAZAPI etc.) — fora do gate de auth
  components/layout/  # AppShell, Sidebar, Topbar
  lib/
    supabase/         # client (browser) · server (SSR) · admin (service-role)
    menu.ts           # estrutura de navegação
  middleware.ts       # auth Supabase + proteção de rotas
legacy/               # protótipo HTML original (referência de layout 1:1)
docs/                 # requisitos, backlog, ecossistema, homologação
```

## Convenções
- **Tema vinho/dourado** (`brand-*` #8A2A41 / `gold-*` #E0B252) extraído 1:1 do protótipo. Fontes Inter + Playfair Display.
- **Multitenant/RBAC**: backend já tem (migration 009/010) — admin geral vê tudo; franqueado só a(s) sua(s) unidade(s).
- **Segredos**: `.env.local` (fora do git). Service role só no servidor.

Planejamento e prioridades: [docs/BACKLOG.md](docs/BACKLOG.md) · [docs/REQUISITOS-CLIENTE.md](docs/REQUISITOS-CLIENTE.md) · [docs/ECOSSISTEMA-E-INTEGRACAO.md](docs/ECOSSISTEMA-E-INTEGRACAO.md).
