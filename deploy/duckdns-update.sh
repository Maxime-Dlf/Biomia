#!/usr/bin/env bash
# Accès direct uniquement : met à jour l'adresse IP publique du sous-domaine DuckDNS.
# À lancer toutes les 5 minutes par cron (deploy/MINT.md, annexe).
set -euo pipefail
cd "$(dirname "$0")"
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
TOKEN=$(grep -E '^DUCKDNS_TOKEN=' .env | cut -d= -f2-)
SUBDOMAIN=${DOMAIN%.duckdns.org}
# Réponse « OK » ou « KO », sans journal (§18.3).
curl -fsS "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${TOKEN}&ip=" -o /dev/null
