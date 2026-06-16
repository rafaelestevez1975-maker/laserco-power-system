# Laser&Co Power System

Sistema de gestão (SaaS) para a rede de franquias de estética e laser **Laser&Co**, inspirado nos sistemas **BEMP** (operação da loja) e **SULTS** (franqueadora). Reúne, num único produto, a operação da unidade e a gestão da franqueadora.

> **Aplicação single-file**: todo o sistema principal (HTML + CSS + JavaScript) vive em `index.html`, sem build e sem dependências locais. Dois apps complementares são embarcados via `<iframe>` (`portal-rh.html` e `vendas-dashboards.html`).

---

## Como rodar / editar

Não há etapa de build. Para editar, abra os arquivos `.html` em qualquer editor de código (VS Code recomendado) e abra no navegador.

```bash
# servir localmente (recomendado, por causa dos iframes e do Supabase)
python3 -m http.server 8080
# depois abra http://localhost:8080
```

Abrir `index.html` direto com `file://` funciona para a maior parte das telas, mas os **iframes** (RH e Vendas) e o **login Supabase** exigem servir por HTTP (`http://localhost`).

### Modo demonstração
Na tela de login há o link **“Entrar em modo demonstração (sem nuvem)”** — entra sem backend, com dados de exemplo em memória/localStorage. Ideal para desenvolver sem credenciais.

---

## Arquivos do projeto

| Arquivo | O que é |
|--------|---------|
| `index.html` | **Sistema principal** (~900 KB). SPA single-file: HTML das views + CSS + todo o JavaScript. |
| `portal-rh.html` | App de **RH** (React/Vite já buildado). Embarcado via iframe sob o menu *Recursos Humanos*. |
| `vendas-dashboards.html` | App de **Dashboards de Vendas** (JS puro + Chart.js + Supabase). Embarcado via iframe sob *Dashboards*. |
| `netlify.toml` / `vercel.json` | Configuração de deploy (site estático, sem build). |
| `ARQUITETURA.md` | Guia do desenvolvedor: estrutura interna do `index.html` e como estender. |

---

## Arquitetura (visão rápida)

`index.html` é uma SPA própria, sem framework. Os pontos-chave:

- **Roteador de views**: um objeto `views` mapeia `chave -> id da <section class="view">`. A função `showView(view, el)` ativa a seção e chama o `buildX()` correspondente.
- **Menu lateral**: itens com `data-view="..."` (abre uma view) ou `data-submenu="..."` (expande um submenu). Itens com `data-admin="1"` só aparecem para administradores.
- **Módulos**: cada área tem uma função `buildX()` que monta o HTML dinamicamente (ex.: `buildExpansao`, `buildMarketing`, `buildPontoDigital`, `buildNotas`, `buildFinFranq`, `buildJur`, `buildChecklist`).
- **Perfis de acesso**: `ROLE_ALLOW` define o que cada perfil enxerga; `applyRole()` aplica as restrições; `PERMS` é a matriz de permissões do editor de perfis.
- **Persistência**: `localStorage` (offline/demo) + **Supabase** (Auth + tabelas com RLS) quando autenticado.

Detalhes e convenções em **`ARQUITETURA.md`**.

### Backend (Supabase)
- Projeto: `riutcbwillvqjrpaefkb` (chaves públicas embutidas no `index.html`).
- Tabelas usadas: `app_state`, `profiles`, `sales_entries`, `customers`, `units_db`, `goals`, etc.
- Autenticação por e-mail/senha; políticas **RLS** (escrita de vendas exige `get_my_role()='admin'`).

---

## Deploy

Site **100% estático** — qualquer host serve. Não há comando de build.

- **Vercel / Netlify (a partir do GitHub):** conecte o repositório. *Build command:* (vazio) · *Output/Publish directory:* `.`
- **Netlify Drop:** arraste os 3 `.html` para https://app.netlify.com/drop
- **GitHub Pages:** Settings → Pages → branch `main` / pasta `/ (root)`.

A cada `git push` na `main`, Vercel/Netlify republicam automaticamente.

---

## Como contribuir / editar

1. Crie uma branch: `git checkout -b minha-alteracao`
2. Edite os `.html` (veja `ARQUITETURA.md` para localizar o módulo).
3. Teste no navegador (modo demonstração).
4. Commit + push e abra um Pull Request.

---

## Aviso (LGPD)

Este repositório contém o **protótipo/produto**. **Não** versione dados reais de clientes (nomes, CPF, fotos clínicas, contratos). As chaves embutidas são **públicas** (anon key do Supabase, protegida por RLS); chaves de serviço **nunca** devem ser commitadas.

---

© 2026 Laser&Co — uso interno.

---

## 🔗 Link compartilhável (produção)

**App:** https://laserco-power-system.vercel.app
**Repositório (público):** https://github.com/rafaelestevez1975-maker/laserco-power-system

O link de produção pode ser compartilhado com terceiros para **revisão** e desenvolvimento de **automações**. O repositório é público — qualquer desenvolvedor pode ler o código, abrir *issues* e enviar *Pull Requests*.

## 📱 PWA — instalar como aplicativo

O sistema é um **Progressive Web App**: pode ser instalado com ícone na tela inicial (Android, iOS e desktop), abrindo em tela cheia (standalone) e funcionando offline (cache do app).

- **Android/Chrome/Edge:** aparece o botão **“Instalar app”** (canto inferior direito) ou menu ⋮ → *Instalar aplicativo*.
- **iOS/Safari:** botão *Compartilhar* → *Adicionar à Tela de Início*.
- **Desktop:** ícone de instalação na barra de endereço.

Arquivos PWA: `manifest.webmanifest`, `sw.js` (service worker, *network-first* para manter o app sempre atualizado e com *fallback* offline) e os ícones `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`.

## 👩‍💻 Para desenvolvedores terceiros (revisão & automações)

1. **Clone/serve:** `python3 -m http.server 8080` e abra `http://localhost:8080` (recomendado por causa dos iframes e do Supabase).
2. **Modo demonstração:** na tela de login há *“Entrar em modo demonstração (sem nuvem)”* — roda sem backend, com dados em memória/localStorage. Ideal para revisar sem credenciais.
3. **Onde mexer:** `index.html` concentra a SPA; cada módulo tem uma função `buildX()`. Veja **`ARQUITETURA.md`** para localizar rapidamente.
4. **Validação rápida (sem framework):** comando em `ARQUITETURA.md` que extrai o JS inline e roda `node --check`.
5. **Contribuir:** crie uma branch, faça as alterações, valide no navegador (modo demonstração) e abra um Pull Request.

## 🗄️ Backend — Supabase

- **Projeto:** `riutcbwillvqjrpaefkb` (região us-east-2, Postgres 17) — *ACTIVE_HEALTHY*.
- **Auth:** e-mail/senha. **RLS habilitado em todas as tabelas** (`public`).
- A **anon key** embutida no `index.html` é **pública por design** e protegida por RLS — segura para repositório público.
- **Service role key nunca** deve ser commitada nem usada no front-end.
- Automações de terceiros devem usar a anon key + políticas RLS, ou um backend próprio com a service key guardada em variável de ambiente (fora do repositório).
