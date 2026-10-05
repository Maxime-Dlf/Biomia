# Déploiement (§16.6)

Les règles et choix sont dans `docs/SOURCE-DE-VERITE.md` (§16, journal T38 et T52) ; ce dossier ne
donne que la marche à suivre.

- **Développement, tests et équilibrage** : PC personnel sous Linux Mint publié par Tailscale
  Funnel, gratuit. Tutoriel complet : [MINT.md](MINT.md).
- **Plus tard** : un domaine payant, sur le même PC ou un VPS, en accès direct
  (`docker-compose.direct.yml`). Seuls `DOMAIN` et les URL Mappings Discord changent.

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Serveur + site (Caddy) ; Caddy écoute en local sur 8080 (Funnel) |
| `docker-compose.direct.yml` | Variante accès direct : Caddy sur 80/443 avec certificat Let's Encrypt |
| `server.Dockerfile`, `web.Dockerfile` | Images du serveur et du site (le client est construit dans l'image) |
| `Caddyfile` | Routage `/`, `/ws`, `/api`, liens `/r/<CODE>`, CSP, aucun journal d'accès |
| `.env.example` | Modèle de `.env` (domaine, application Discord, région, budget) |
| `bootstrap-mint.sh` | Préparation du PC Mint (Docker, Tailscale, SSH, pare-feu, pas de veille) |
| `update.sh`, `check.sh` | Mise à jour et vérification |
| `duckdns-update.sh` | Accès direct avec DuckDNS : mise à jour de l'adresse IP |
