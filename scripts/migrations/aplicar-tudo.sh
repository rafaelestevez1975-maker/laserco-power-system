#!/usr/bin/env bash
# Aplica as migrations da Onda 4 (paridade legado) no lkii, uma a uma.
# Cada arquivo roda com ON_ERROR_STOP; um módulo que falhar NÃO bloqueia os demais.
# 050_expansao já foi aplicada → fora da lista.
#
# Uso:
#   DATABASE_URL='postgresql://USER:SENHA@HOST:5432/postgres' ./aplicar-tudo.sh
#   (ou)  ./aplicar-tudo.sh 'postgresql://...'
#
# A connection string (com a SENHA do banco) está em: Supabase → Project Settings →
# Database → Connection string (use a "Session"/"Direct", não o pooler 6543, para DDL).

set -uo pipefail
cd "$(dirname "$0")"

DB="${1:-${DATABASE_URL:-}}"
if [ -z "$DB" ]; then
  echo "ERRO: informe a connection string em DATABASE_URL ou como 1º argumento." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "ERRO: 'psql' não encontrado. Instale o postgresql-client OU use o SQL Editor com _APLICAR-TUDO.sql." >&2
  exit 1
fi

# Ordem (módulos independentes; sem FK cruzada).
ORDER=(rbac catalogo categorias financeiro comissoes agenda indiques relatorios \
       anamnese automacoes implantacao juridico marketing nfse rh)

ok=(); fail=()
for m in "${ORDER[@]}"; do
  f="${m}.sql"
  printf '──> %-14s ... ' "$m"
  if psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/mig_"$m".log 2>&1; then
    echo "OK"; ok+=("$m")
  else
    echo "FALHOU (veja /tmp/mig_${m}.log)"; fail+=("$m")
    tail -3 /tmp/mig_"$m".log | sed 's/^/      /'
  fi
done

echo ""
echo "Buckets de storage (Disco/Contratos/SAC-mídia)…"
psql "$DB" -v ON_ERROR_STOP=1 -q -c "insert into storage.buckets (id,name,public) values ('disco-virtual','disco-virtual',false),('contratos','contratos',false),('sac-midia','sac-midia',true) on conflict (id) do nothing;" \
  && echo "  buckets OK" || echo "  buckets FALHOU (crie manualmente no painel: disco-virtual/contratos privados, sac-midia público)"

echo ""
echo "═══════════════════════════════════════════════"
echo "APLICADOS (${#ok[@]}): ${ok[*]:-nenhum}"
echo "FALHARAM  (${#fail[@]}): ${fail[*]:-nenhum}"
[ "${#fail[@]}" -eq 0 ] && echo "✅ Tudo aplicado." || echo "⚠️  Reveja os módulos que falharam (logs em /tmp/mig_*.log). Reaplicar é seguro (IF NOT EXISTS)."
