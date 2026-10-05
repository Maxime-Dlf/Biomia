# Biomia

**Seule référence : [`docs/SOURCE-DE-VERITE.md`](docs/SOURCE-DE-VERITE.md).** En cas de contradiction
avec le code, le document fait foi. `archive/` est obsolète : ne jamais s'en servir.

## Commandes

```sh
pnpm install          # pnpm via corepack : `corepack enable` ou `corepack pnpm …`
pnpm typecheck        # tsc (TS 7) par paquet, svelte-check (TS 6) pour le client
pnpm lint             # Biome (lint + format) ; `pnpm format` corrige
pnpm test             # Vitest, tous les projets (PERF=1 : budgets du §20.2 ; SIM_GAMES=10000 : simulation)
pnpm e2e              # Playwright (lance Vite et le serveur) : parties hors-ligne (bureau + mobile) et en ligne à 4 navigateurs, captures dans apps/client/e2e/.results
pnpm simulate -- --games 200   # statistiques par tier et taux de réussite des objectifs
pnpm dev:client       # Vite sur http://localhost:5173
pnpm dev:server       # Colyseus sur ws://localhost:2567
```

## Organisation (§15.3)

| Dossier | Rôle | Dépendances autorisées |
|---|---|---|
| `packages/engine` | Moteur pur : hex, rng, types, flux du tour, scoring, objectifs, bots, replays | aucune (ni réseau, ni rendu, ni Node) |
| `packages/content` | Mods internes : `core`, `tier-a`…`tier-d`, `objectives-core`, préréglages | `engine` |
| `packages/protocol` | Messages réseau, schémas Zod, version de protocole | `engine`, `zod` |
| `apps/server` | Colyseus : salons, projection Schema, minuteurs | tout `packages/*` |
| `apps/client` | Vite + PixiJS v8 + Svelte 5 : `game/` (pilotes, session), `render/`, `ui/`, `i18n/`, `settings/` | tout `packages/*` |
| `tools` | Simulateur et scripts d'équilibrage | tout `packages/*` |

## Conventions

- TypeScript strict, ESM, imports avec extension `.ts`. Aucun `any`.
- Moteur : **fonctions pures, état immuable, entiers uniquement, RNG à graine** (§15.1). Jamais
  `Math.random`, `Date` ni E/S dans `packages/engine` ou `packages/content`.
- Le jeu de base est un ensemble de **mods internes** : une règle de tier vit dans
  `packages/content`, le moteur ne connaît aucune forme ni couleur en dur.
- Chaque règle codée a des tests qui **citent la section** : `describe('§9.1.3 Cœur Tier D', …)`.
- **Toute ambiguïté découverte en codant est remontée au §22 du document**, jamais tranchée en
  silence dans le code.
- Plateaux de référence : `packages/content/test/reference/*.json` (format §23.3), scores rédigés à la
  main d'après le document, jamais recopiés depuis la sortie du moteur.
- Le client n'implémente aucune règle : il interroge le moteur (`getLegalActions`, `evaluate`) via la
  session et envoie des actions au pilote (local ou réseau).
- Commits conventionnels (`feat(engine): …`), petites tranches verticales, CI verte.
