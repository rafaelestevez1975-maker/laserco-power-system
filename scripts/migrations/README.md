# Migrations — Onda 4 (paridade com o legado)

15 migrations que criam as tabelas dos módulos novos no `lkii`. **Enquanto não aplicadas**, as
telas desses módulos mostram banner "aplique a migration" e rodam vazias (não quebram nada).
São **aditivas** (só `CREATE TABLE IF NOT EXISTS`, sem `DROP`/`DELETE` em dado real) e os seeds
entram só em tabelas novas. `050_expansao_pipeline.sql` **já foi aplicada** — não está na lista.

## Como aplicar

### Opção A — SQL Editor do Supabase (mais simples, sem ferramentas)
1. Supabase → seu projeto → **SQL Editor** → New query.
2. Cole o conteúdo de **`_APLICAR-TUDO.sql`** (tudo) e **Run**.
3. Se algum bloco falhar, o editor para nele: corrija e rode de novo (tabelas já criadas são puladas).

### Opção B — psql (linha de comando)
```bash
cd scripts/migrations
DATABASE_URL='postgresql://postgres:SENHA@db.<ref>.supabase.co:5432/postgres' ./aplicar-tudo.sh
```
A connection string (com a **senha do banco**) está em Supabase → **Project Settings → Database →
Connection string** (use a **Session/Direct** na porta 5432, não o pooler 6543, para rodar DDL).
O runner aplica módulo a módulo, reporta OK/FALHOU por módulo e cria os buckets no fim.

## Buckets de Storage (criados pelos dois caminhos acima)
| bucket | público? | uso |
|---|---|---|
| `disco-virtual` | privado | Disco Virtual (upload/download via URL assinada) |
| `contratos` | privado | Modelos/anexos de contrato |
| `sac-midia` | **público** | mídia de WhatsApp re-hospedada (Triagem). ⚠️ Exposta por URL — se a privacidade exigir, troque para privado e ajuste `src/lib/sac-midia.ts` para usar URL assinada. |

## Lista (ordem do runner)
`rbac` · `catalogo` · `categorias` · `financeiro` · `comissoes` · `agenda` · `indiques` ·
`relatorios` · `anamnese` · `automacoes` · `implantacao` · `juridico` · `marketing` · `nfse` · `rh`

> Reaplicar é seguro: tudo é idempotente no nível de tabela. Seeds podem inserir de novo em
> tabelas novas se um módulo for rodado 2x do zero — confira se notar duplicidade.
