# Handoff — Formulário de SAC do site → Chamado automático

**Para:** time que mantém o site lasercompany.com (Supabase do site).
**Objetivo:** quando um cliente enviar o **formulário de SAC** no site, ele deve cair
**automaticamente** como **chamado** no Power System (menu **SAC › Chamados**), sem ninguém
"rotear" nada. Todo o lado do Power System **já está pronto e no ar** — falta só o site
gravar o lead com o rótulo certo.

---

## O que o site precisa fazer

Inserir **uma linha** na tabela `lasercompany_leads` (Supabase do site, projeto
`riutcbwillvqjrpaefkb`) — exatamente do **mesmo jeito** que os formulários atuais
(oferta, agendamento, avaliação…) já gravam, com a **mesma anon key**. A **única**
diferença é o campo `tipo`, que deve ser **`sac`**.

### Tabela `lasercompany_leads` — campos que importam

| campo | obrigatório | o que vira no chamado |
|---|---|---|
| `tipo` | **SIM** → `'sac'` | identifica como SAC. (também aceitos: `reclamacao`, `suporte`, `pos_venda`) |
| `nome` | sim | nome do cliente |
| `telefone` | recomendado | telefone do cliente |
| `email` | recomendado | e-mail do cliente |
| `dados.assunto` *(ou `dados.area`)* | recomendado | assunto do chamado |
| `dados.mensagem` | recomendado | descrição / observações do chamado |

> ⚠️ **NÃO** gravar a chave `_roteado` dentro de `dados` — o Power System usa isso
> internamente pra controlar o que já virou chamado (evita duplicar).

### Exemplo — supabase-js (mesma anon key dos formulários atuais)

```js
await supabase.from('lasercompany_leads').insert({
  tipo: 'sac',
  nome: form.nome,
  telefone: form.telefone,
  email: form.email,
  dados: {
    assunto: form.assunto,    // ex.: "Reembolso", "Reclamação de atendimento"
    mensagem: form.mensagem,  // texto livre do cliente
  },
})
```

### Exemplo — SQL (para um teste rápido)

```sql
insert into lasercompany_leads (tipo, nome, telefone, email, dados)
values ('sac', 'Maria Silva', '11999999999', 'maria@exemplo.com',
        '{"assunto":"Reembolso","mensagem":"Quero cancelar e ser reembolsada"}'::jsonb);
```

---

## O que acontece depois (já implementado — nada a fazer aqui)

1. O Power System lê os leads `tipo=sac` do site automaticamente (cron diário + ao abrir a tela de Chamados).
2. Cria um **chamado na franqueadora** — o SAC é **centralizado** (não existe SAC em franquia), então o chamado **não vai para uma loja/franquia**.
3. Marca o lead de origem como `_roteado` (idempotente — rodar de novo não duplica).
4. O chamado aparece em **SAC › Chamados** com canal **"formulario"** em até ~1 minuto (ou assim que uma atendente abrir a tela).

## Como testar

1. Inserir uma linha de teste (exemplo SQL acima) no `lasercompany_leads`.
2. Abrir o Power System em **SAC › Chamados** (ou **Canais › Site › Ver chamados**).
3. O chamado de teste deve aparecer. ✅

## Referências (Power System — já entregue)

- `src/lib/sac-ingest.ts` — ingestão (lê o site, cria o chamado, marca `_roteado`).
- `src/app/api/cron/ingest-sac/route.ts` + `vercel.json` (cron) — execução automática.
- Franqueadora: `empresa_id = 00000000-0000-0000-0000-000000000001`, `unidade_id = null`.
