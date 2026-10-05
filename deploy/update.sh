#!/usr/bin/env bash
# Met à jour le jeu sur le serveur : dernière version de la branche, reconstruction, redémarrage,
# puis vérification. Usage : ./deploy/update.sh [direct]
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
cd deploy
files=(-f docker-compose.yml)
if [[ "${1:-}" == "direct" ]]; then files+=(-f docker-compose.direct.yml); fi
docker compose "${files[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null
./check.sh
