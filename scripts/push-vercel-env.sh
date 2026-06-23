#!/usr/bin/env bash
# Sobe TODAS as variáveis do .env.local para a Vercel (production + preview + development).
#
# Pré-requisitos (uma vez):
#   1) vercel login          # autentica (interativo, abre o navegador)
#   2) vercel link           # vincula esta pasta ao projeto Vercel "laserco-power-system"
#      (ou rode com VERCEL_TOKEN=... e ajuste --scope se preferir headless)
#
# Uso:  bash scripts/push-vercel-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "Faltou $ENV_FILE"; exit 1; }
TOKEN_ARG=""; [ -n "${VERCEL_TOKEN:-}" ] && TOKEN_ARG="--token $VERCEL_TOKEN"

# usa o 'vercel' global se existir; senão cai pro npx (não precisa instalar global)
if command -v vercel >/dev/null 2>&1; then VBIN="vercel"; else VBIN="npx --yes vercel@latest"; fi

# variáveis que vão pra Vercel (na ordem do .env.local; ignora comentários/vazias)
while IFS= read -r line; do
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}"; val="${line#*=}"
  [ -z "$key" ] && continue
  [ -z "$val" ] && { echo "· pulando $key (vazio)"; continue; }
  for envname in production preview development; do
    # remove se já existir (ignora erro) e adiciona de novo
    $VBIN env rm "$key" "$envname" -y $TOKEN_ARG >/dev/null 2>&1 || true
    printf '%s' "$val" | $VBIN env add "$key" "$envname" $TOKEN_ARG >/dev/null 2>&1 \
      && echo "✓ $key → $envname" || echo "✗ falhou $key → $envname"
  done
done < "$ENV_FILE"

echo "--- pronto. Faça um novo deploy (git push ou 'vercel --prod') para aplicar. ---"
