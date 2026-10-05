#!/usr/bin/env bash
# Vérifie que le jeu répond, en local puis à son adresse publique.
set -euo pipefail
cd "$(dirname "$0")"
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/api/health >/dev/null 2>&1 || curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
echo "Local   : $(curl -fsS http://127.0.0.1:8080/api/health 2>/dev/null || echo 'injoignable (normal en accès direct)')"
echo "Public  : $(curl -fsS "https://${DOMAIN}/api/health" || echo 'injoignable')"
echo "Client  : $(curl -fsS -o /dev/null -w '%{http_code}' "https://${DOMAIN}/")"
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
