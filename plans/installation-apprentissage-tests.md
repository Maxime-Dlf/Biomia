# Installation, apprentissage et tests (Windows + VSCode)

> **Objet** : procédure complète pour installer l'environnement de développement sous
> Windows, comprendre le rôle de chaque outil, apprendre dans le bon ordre, coder le
> projet et vérifier que le code est correct.
>
> Complément du [`plan-compatibilite-et-synchronisation.md`](plan-compatibilite-et-synchronisation.md:1).
> Les règles du jeu sont dans [`regles-source-de-verite.md`](regles-source-de-verite.md:1).

---

## 1. Résumé des rôles

| Développeur | Périmètre | Outils à apprendre |
|---|---|---|
| **Dev A** | Backend, logique, règles, serveur | Node.js, TypeScript, Vitest, Colyseus, Git |
| **Dev B** | Frontend, rendu, interactions | TypeScript, Vite, Phaser 3, Git |

---

## 2. Installation des outils (Windows)

### 2.1 Node.js (LTS)

**À quoi ça sert** : Node.js est le **moteur d'exécution JavaScript** hors du
navigateur. C'est lui qui fait tourner le serveur (Colyseus) et tous les outils de
développement (Vite, Vitest, tsc…). Sans lui, aucune commande `npm` ne fonctionne.

- Télécharger l'installeur `.msi` : https://nodejs.org/en (choisir la version **LTS**,
  plus stable que la version « Current »).
- Documentation : https://nodejs.org/en/learn
- Vérifier dans un terminal :

```powershell
node -v
npm -v
```

**`npm`** (Node Package Manager) est installé **avec** Node.js : c'est le
**gestionnaire de paquets** qui télécharge les bibliothèques. Documentation :
https://docs.npmjs.com/

### 2.2 Git

**À quoi ça sert** : Git est le **système de versionnage** qui enregistre l'historique
du code, permet de travailler à deux sans s'écraser et de revenir en arrière.

- Télécharger : https://git-scm.com/download/win
- Documentation : https://git-scm.com/doc
- Vérifier :

```powershell
git --version
```

### 2.3 Visual Studio Code

**À quoi ça sert** : l'**éditeur de code** (gratuit) utilisé pour tout le projet. Il
intègre un terminal, Git et l'autocomplétion TypeScript.

- Télécharger : https://code.visualstudio.com/

### 2.4 Extensions VSCode (panneau Extensions, `Ctrl+Shift+X`)

| Extension | Identifiant | À quoi ça sert |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | **Analyse statique** du code : signale les erreurs et mauvaises pratiques en direct. Doc : https://eslint.org/docs/latest/use/getting-started |
| Prettier | `esbenp.prettier-vscode` | **Formatage automatique** (indentation, retours à la ligne) à la sauvegarde. Doc : https://prettier.io/docs/en/ |
| GitLens | `eamodio.gitlens` | (optionnel) historique Git enrichi directement dans l'éditeur |

TypeScript est **intégré** à VSCode (aucune extension requise) : autocomplétion et
erreurs de type directement dans l'éditeur.

### 2.5 pnpm (optionnel)

- **Recommandation** : rester sur **npm** (déjà installé) pour débuter.
- `pnpm` est un gestionnaire de paquets alternatif plus rapide : https://pnpm.io/fr/

---

## 3. Structure du monorepo

**À quoi ça sert** : un **monorepo** regroupe plusieurs petits projets (packages) dans
un seul dépôt Git. Ici, les trois packages partagent le même code et les mêmes types.

```
CrasseCadia/
├── package.json          # racine : déclare les workspaces npm
├── shared/               # types + règles pures (Dev A) — partagé par les deux autres
├── server/               # serveur Colyseus (Dev A)
└── client/               # Vite + Phaser (Dev B)
```

- `shared/` : le **contrat commun** (types, géométrie hex, règles). Ni serveur ni
  client ne le duplique → zéro divergence.
- `server/` : la **logique autoritaire** (validation, scoring, réseau).
- `client/` : l'**interface** (rendu, interactions, HUD).

La notion de workspaces npm : https://docs.npmjs.com/cli/v10/using-npm/workspaces

---

## 4. Initialisation du projet (terminal VSCode, PowerShell)

### 4.1 Créer les dossiers et les packages

```powershell
# Créer les dossiers des packages
New-Item -ItemType Directory -Path shared,server,client -Force

# Créer un package.json dans chaque workspace
npm init -y -w shared
npm init -y -w server
npm init -y -w client
```

- `New-Item -ItemType Directory` : crée un dossier (équivalent PowerShell de `mkdir`).
- `npm init -y -w <package>` : crée un `package.json` de base dans le workspace. Le
  flag `-w` désigne le **workspace** cible.

### 4.2 Le `package.json` racine

```json
{
  "name": "crassecadia",
  "private": true,
  "workspaces": ["shared", "server", "client"]
}
```

- `workspaces` : dit à npm que `shared`, `server` et `client` font partie du même
  monorepo. Toutes les dépendances communes sont installées à la racine (dans
  `node_modules/`), une seule fois.
- `private: true` : évite de publier accidentellement le projet sur le registre npm.

### 4.3 Installer les dépendances

```powershell
# shared — types et tests
npm install -D typescript vitest -w shared

# server — Colyseus (dernière version stable : 0.17.10) + TypeScript + tests
npm install colyseus@^0.17.10 @colyseus/schema@^4.0.31 -w server
npm install -D typescript tsx vitest -w server

# client — Phaser + Vite + TypeScript
npm install phaser -w client
npm install -D vite typescript -w client
```

**Rôle de chaque dépendance** :

| Paquet | À quoi ça sert | Documentation |
|---|---|---|
| `typescript` | Compile le TypeScript en JavaScript et **vérifie les types** | https://www.typescriptlang.org/docs/ |
| `vitest` | Lanceur de **tests unitaires** rapide | https://vitest.dev/ |
| `colyseus` | Framework **multijoueur temps réel** (salons, synchronisation d'état) | https://docs.colyseus.io/ |
| `@colyseus/schema` | Définit l'**état synchronisé** entre serveur et clients | https://docs.colyseus.io/ |
| `tsx` | Exécute le TypeScript **directement** dans Node.js (sans compiler à la main) | https://tsx.is/ |
| `phaser` | Moteur de **jeu 2D** (scènes, sprites, caméra, entrées) | https://docs.phaser.io/ |
| `vite` | **Serveur de développement** + bundler ultra-rapide | https://vitejs.dev/ |

- `-D` (devDependency) : outil de développement uniquement, pas embarqué en production.
- `-w <package>` : installe la dépendance dans le workspace précisé.

`@discord/embedded-app-sdk` sera ajouté **plus tard** (Phase 6, Discord Activity) :
https://docs.discord.com/developers/developer-tools/embedded-app-sdk

### 4.6 Versions et avertissements `npm audit` (Colyseus)

- **Version stable actuelle** : `colyseus@0.17.10` (tag `latest`) et
  `@colyseus/schema@4.0.31`. C'est la version installée par défaut — **ne pas
  rétrograder en 0.16** (la 0.16 n'est plus la dernière stable ; la 0.18 est encore en
  `next`).

L'installation affiche des avertissements `npm audit` (`elliptic`, `uuid`, `nanoid`).
Ils proviennent de `@colyseus/auth` (OAuth) et `@colyseus/playground` (interface de
test), inclus par le paquet ombrelle `colyseus` mais **non utilisés dans le MVP** :

- `elliptic` ← `jwk-to-pem` ← `grant` ← `@colyseus/auth` : utilisé uniquement pour
  l'authentification OAuth (non utilisée dans le MVP ; l'OAuth Discord sera géré en
  Phase 6, côté backend, sans ce module).
- `uuid@8` ← `request-oauth` ← `@colyseus/auth` : idem.

Ces vulnérabilités sont de gravité **faible/modérée** et **n'affectent pas** le cœur
du serveur (salons, synchronisation d'état, WebSocket).

**Ne pas exécuter `npm audit fix --force`** : il force des changements de version
majeurs et provoque des allers-retours entre versions (0.15.13 ↔ 0.17.x) sans corriger
le fond.

Deux options :
1. **Accepter les avertissements** (recommandé pour le MVP) : le code vulnérable
   n'est pas exécuté.
2. **Zéro avertissement** : installer uniquement le noyau (sans playground/auth) :
   `npm install @colyseus/core @colyseus/schema @colyseus/ws-transport -w server`
   (moins simple pour débuter, et sans interface de test intégrée).

### 4.7 Nettoyer un état npm cassé (après un `--force`)

```powershell
# Supprimer node_modules et lockfiles (racine + serveur)
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force server\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force server\package-lock.json -ErrorAction SilentlyContinue

# Réinstaller proprement (la version stable est épinglée dans server/package.json)
npm install
```

- `node_modules/` : dossier où npm installe les dépendances ; `package-lock.json` :
  fige les versions exactes. Les supprimer force une réinstallation propre.

---

## 5. Configuration minimale

### 5.1 `shared/tsconfig.json`

**À quoi ça sert** : `tsconfig.json` est la **configuration du compilateur TypeScript**.
Il définit comment le TypeScript est transformé en JavaScript et quelles vérifications
sont appliquées. Référence complète : https://www.typescriptlang.org/tsconfig/

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

**Rôle de chaque option** :

| Option | À quoi ça sert | Pourquoi ce choix |
|---|---|---|
| `target` | Version de JavaScript générée | `ES2022` = moderne et compatible Node/Vite actuels |
| `module` | Format des modules | `ESNext` = modules modernes (import/export) |
| `moduleResolution` | Comment les imports sont résolus | `Bundler` = façon Vite/esbuild, permet d'importer sans extension |
| `strict` | Active **toutes** les vérifications strictes | **Toujours activer** : détecte les bugs à la compilation |
| `esModuleInterop` | Compatibilité entre modules ESM et CommonJS | Évite les erreurs d'import de bibliothèques |
| `skipLibCheck` | Saute la vérification des `.d.ts` des libs | Accélère fortement la compilation |
| `declaration` | Génère les fichiers `.d.ts` | Permet à `server`/`client` de consommer les types de `shared` |
| `include` | Quels fichiers compiler | Limite la compilation à `src/` |

> Pour bien choisir ses options, partir de **`"strict": true`** (le plus important),
> puis adapter `target`/`module` à l'environnement. Le « TSConfig Cheat Sheet »
> résume les bonnes pratiques : https://www.totaltypescript.com/tsconfig-cheat-sheet

### 5.2 Scripts `package.json`

**À quoi ça sert** : les `scripts` sont des **raccourcis de commandes** exécutables via
`npm run <nom>`. Documentation : https://docs.npmjs.com/cli/v10/using-npm/scripts

**`shared/package.json`** :

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

| Script | À quoi ça sert |
|---|---|
| `typecheck` | `tsc --noEmit` vérifie les types **sans** générer de JavaScript |
| `test` | `vitest run` exécute les tests une fois puis s'arrête |
| `test:watch` | `vitest` relance les tests à chaque modification |

**`server/package.json`** :

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

| Script | À quoi ça sert |
|---|---|
| `dev` | `tsx watch` exécute le serveur TypeScript et **relance** à chaque modification |
| `typecheck` | Vérifie les types sans émettre |
| `test` | Exécute les tests unitaires |

**`client/package.json`** :

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

| Script | À quoi ça sert |
|---|---|
| `dev` | Démarre le serveur de développement Vite (rechargement à chaud) |
| `build` | Produit la version optimisée de production |
| `preview` | Prévisualise localement la version de production |
| `typecheck` | Vérifie les types |

### 5.3 `client/vite.config.ts`

**À quoi ça sert** : configure le **serveur de développement Vite** (port, plugins,
alias…). Référence : https://vitejs.dev/config/

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
});
```

- `defineConfig` : fournit l'autocomplétion et la validation de la configuration.
- `server.port` : fixe l'URL de développement (ici http://localhost:5173).

---

## 6. Ordre d'apprentissage (avec documentation officielle)

### 6.1 Dev A — Backend, logique et règles

| # | Outil | Rôle | Documentation | À maîtriser |
|---|---|---|---|---|
| 1 | **TypeScript** | Langage typé compilé en JS | https://www.typescriptlang.org/docs/ | types, interfaces, fonctions pures, `enum` |
| 2 | **Node.js / npm** | Exécution JS + gestion des paquets | https://nodejs.org/en/learn · https://docs.npmjs.com/ | initialiser un projet, modules, scripts |
| 3 | **Vitest** | Tests unitaires | https://vitest.dev/guide/ | écrire et lancer des tests |
| 4 | **Colyseus** | Multijoueur temps réel | https://docs.colyseus.io/ | `Room`, `Schema`, synchronisation d'état |
| 5 | **Git** | Versionnage | https://git-scm.com/doc | `clone`, branche, `commit`, pull request |

**Exercice de validation Dev A** : écrire [`shared/hex.ts`](plan-compatibilite-et-synchronisation.md:86)
(coordonnées axiales `q, r`, voisins, distance, conversions) **avec des tests Vitest**.

### 6.2 Dev B — Frontend, rendu et interactions

| # | Outil | Rôle | Documentation | À maîtriser |
|---|---|---|---|---|
| 1 | **TypeScript** | Langage typé compilé en JS | https://www.typescriptlang.org/docs/ | variables, fonctions, objets, boucles |
| 2 | **Vite** | Serveur de dev + bundler | https://vitejs.dev/guide/ | démarrer un projet |
| 3 | **Phaser 3** | Moteur de jeu 2D | https://docs.phaser.io/ | scènes, sprites, caméra, clics |
| 4 | **Git** | Versionnage | https://git-scm.com/doc | `commit`, `pull`, `push` |

**Exercice de validation Dev B** : afficher une **grille hexagonale statique** (données
arbitraires) avec `hexToPixel`, puis détecter un clic sur un hex avec `pixelToHex`.

### 6.3 Plus tard (Phase 6)

| Outil | Rôle | Documentation |
|---|---|---|
| **Discord Embedded App SDK** | Intégrer le jeu dans une iframe Discord | https://docs.discord.com/developers/developer-tools/embedded-app-sdk · https://docs.discord.com/developers/activities/overview |

### 6.4 Formations recommandées (cours avec exercices)

> Les deux devs partent de **zéro** : commencer par **JavaScript** (TypeScript en est
> un sur-ensemble). Privilégier les cours **gratuits** avec quiz et exercices.

**Base commune — JavaScript (indispensable avant TypeScript) :**

| Ressource | Langue | Contenu | Lien |
|---|---|---|---|
| OpenClassrooms — Apprenez à programmer avec JavaScript | FR | Cours + quiz + exercices | https://openclassrooms.com/fr/courses/7696886-apprenez-a-programmer-avec-javascript |
| javascript.info | EN | Tutoriel complet + exercices | https://javascript.info/ |
| MDN — JavaScript | FR / EN | Guides + référence | https://developer.mozilla.org/fr/docs/Web/JavaScript |
| freeCodeCamp — JavaScript Algorithms and Data Structures | EN | Exercices interactifs | https://www.freecodecamp.org/learn |

**Dev A — Backend, logique et règles (dans cet ordre) :**

| # | Sujet | Formation recommandée | Langue | Lien |
|---|---|---|---|---|
| 1 | JavaScript | OpenClassrooms « Apprenez à programmer avec JavaScript » | FR | https://openclassrooms.com/fr/courses/7696886-apprenez-a-programmer-avec-javascript |
| 2 | TypeScript | OpenClassrooms « Découvrez TypeScript » + Handbook officiel | FR / EN | https://openclassrooms.com/fr/courses/8039116-decouvrez-typescript · https://www.typescriptlang.org/docs/handbook/intro.html |
| 3 | Node.js | OpenClassrooms « Passez au Full Stack avec Node.js, Express et MongoDB » + docs officielles | FR / EN | https://openclassrooms.com/fr/courses/6390246-passez-au-full-stack-avec-node-js-express-et-mongodb · https://nodejs.org/en/learn |
| 4 | Git | OpenClassrooms « Gérez du code avec Git et GitHub » | FR | https://openclassrooms.com/fr/courses/7162856-gerez-du-code-avec-git-et-github |
| 5 | Vitest | Guide officiel « Getting Started » + guide débutant Better Stack | EN | https://vitest.dev/guide/ · https://betterstack.com/community/guides/testing/vitest-explained/ |
| 6 | Colyseus | Docs officielles « Getting Started TypeScript » (pas de cours dédié) | EN | https://docs.colyseus.io/getting-started/typescript |

**Dev B — Frontend, rendu et interactions (dans cet ordre) :**

| # | Sujet | Formation recommandée | Langue | Lien |
|---|---|---|---|---|
| 1 | JavaScript | OpenClassrooms « Apprenez à programmer avec JavaScript » | FR | https://openclassrooms.com/fr/courses/7696886-apprenez-a-programmer-avec-javascript |
| 2 | TypeScript | OpenClassrooms « Découvrez TypeScript » | FR | https://openclassrooms.com/fr/courses/8039116-decouvrez-typescript |
| 3 | Phaser 3 | Tutoriel officiel « Making your first Phaser game » + GameDev Academy | EN | https://docs.phaser.io/phaser/getting-started/making-your-first-phaser-game · https://gamedevacademy.org/phaser-3-tutorial/ |
| 4 | Vite | Guide officiel | EN | https://vitejs.dev/guide/ |
| 5 | Git | OpenClassrooms « Gérez du code avec Git et GitHub » | FR | https://openclassrooms.com/fr/courses/7162856-gerez-du-code-avec-git-et-github |

> **Remarques** : Colyseus et Phaser n'ont pas de formation francophone dédiée — on
> apprend via leur documentation officielle et leurs tutoriels pas-à-pas. France-IOI
> (https://www.france-ioi.org/) peut servir d'entraînement algorithmique (logique,
> boucles, fonctions) pour Dev A, qui a déjà des bases en Python/C.

---

## 7. Ordre de codage par développeur

Cette section précise, pour chaque fichier TypeScript : **ce qu'il contient**, **sa
fonction**, ses **entrées/sorties** (I/O) et l'**ordre recommandé** pour coder ses
fonctions. Les règles exactes sont dans
[`regles-source-de-verite.md`](regles-source-de-verite.md:1).

---

### 7.1 Dev A — Backend, logique et règles

#### 7.1.1 `shared/hex.ts` — géométrie hexagonale (aucune dépendance)

**Fonction** : maths pures de la grille hexagonale. Utilisées **à la fois** par le
client (affichage, clics) et le serveur (validité des poses). C'est le fichier le plus
simple : à coder **en premier** car tout le reste en dépend.

| Fonction | Entrée (I) | Sortie (O) |
|---|---|---|
| `DIRECTIONS` (constante) | — | les 6 vecteurs de voisinage `{q, r}` |
| `hexNeighbors(q, r)` | `q`, `r` (coordonnées axiales) | liste des **6 voisins** |
| `hexDistance(a, b)` | deux hex `{q, r}` | distance (nombre de pas) |
| `hexToPixel(q, r, size)` | coordonnées + taille d'hex | position écran `{x, y}` |
| `pixelToHex(x, y, size)` | position écran + taille | coordonnée axiale `{q, r}` |

**Ordre de codage** : `DIRECTIONS` → `hexNeighbors` → `hexDistance` → `hexToPixel` →
`pixelToHex` (chaque conversion dépend des précédentes). Écrire **un test Vitest par
fonction** au fur et à mesure.

```ts
// shared/hex.ts
export interface Hex { q: number; r: number; }
export const DIRECTIONS: Hex[] = [/* 6 vecteurs */];
export function hexNeighbors(q: number, r: number): Hex[];
export function hexDistance(a: Hex, b: Hex): number;
export function hexToPixel(q: number, r: number, size: number): { x: number; y: number };
export function pixelToHex(x: number, y: number, size: number): Hex;
```

#### 7.1.2 `shared/types.ts` — le contrat de données (aucune logique)

**Fonction** : décrire **uniquement** les types partagés (enums + interfaces). Aucune
fonction exécutable. C'est le « contrat » : si un champ change, la compilation casse
des deux côtés. À valider **avec Dev B** (il doit pouvoir dire « il me manque ce
champ »).

| Élément | Contenu |
|---|---|
| `EnvironmentId` | enum des **5 couleurs** d'environnement |
| `TokenShape` | enum des **5 formes** (`Carre`, `Triangle`, `Coeur`, `Rond`, `Etoile`) |
| `Tile` | `q`, `r`, `edges[6]`, `acceptedShapes[]`, `tokenShape`, `tokenOwnerId`, `tileOwnerId`, `turnPlaced` |
| `Phase` | états du tour (`setup`, `waiting`, `reroll`, `chooseTile`, `placeTile`, `chooseToken`, `placeToken`, `confirm`, `scoring`, `gameOver`) |
| `MarketSlot` | `{ tileId, tokenShape }` (un emplacement du marché) |
| `PlayerState` | `{ id, nickname, avatarUrl, teamId, score, jokers }` |
| `GameState` | `board`, `players`, `currentPlayerId`, `phase`, `turnNumber`, `totalTiles`, `market`, `tokenPool`, `environmentMinSize`, `rerollAvailable`, `winnerId` |
| `Move` | union des coups (`placeTile`, `placeToken`, `skipToken`, `reroll`, `undo`, `confirmTurn`) |
| `MoveResult` | `{ ok, reason?, newState? }` |

**Ordre de codage** : les enums d'abord → `Tile` → `MarketSlot` / `PlayerState` →
`GameState` (qui les assemble) → `Move` / `MoveResult` (qui référencent l'état).

#### 7.1.3 `shared/rules.ts` — moteur de règles (fonctions pures)

**Fonction** : toute la **logique de jeu**. Exécutée par le serveur (autorité) **et**
par le client (prévisualisation) → aucun écart de score possible.

**Partie 1 — Environnements** :

| Fonction | I | O |
|---|---|---|
| `getConnectedEnvironments(board)` | `board` | liste d'environnements (composantes connexes de tuiles par couleur d'arête) |
| `computeEnvironmentScores(state)` | `GameState` | `Record<playerId, points>` (tuiles cumulées + bonus +2/+1) |

**Partie 2 — Jetons (une fonction pure par forme, extensible)** :

| Fonction | I | O |
|---|---|---|
| `scoreSquares(board)` | `board` | `Record<playerId, points>` |
| `scoreTriangles(board)` | `board` | `Record<playerId, points>` |
| `scoreHearts(board)` | `board` | `Record<playerId, points>` |
| `scoreRounds(board)` | `board` | `Record<playerId, points>` |
| `scoreStars(board)` | `board` | `Record<playerId, points>` |

**Partie 3 — Noyau** :

| Fonction | I | O |
|---|---|---|
| `getValidMoves(state, playerId)` | état + joueur | `Move[]` (coups légaux, pour l'affichage) |
| `validateMove(state, move, playerId)` | état + coup + joueur | `boolean` (le coup est-il légal ?) |
| `applyMove(state, move)` | état + coup | nouvel `GameState` (après application) |
| `computeScores(state)` | `GameState` | `Record<playerId, points>` (agrège environnements + 5 formes + jokers) |
| `resolveReroll(state)` | état | nouvel `GameState` ou `null` (relance, anti-boucle) |

**Ordre de codage** : helpers internes → `getConnectedEnvironments` →
`scoreSquares`/`scoreTriangles`/`scoreHearts`/`scoreRounds`/`scoreStars` →
`computeScores` (qui agrège tout) → `getValidMoves`/`validateMove`/`applyMove` (qui
dépendent de tout) → `resolveReroll` en dernier. **Un test par forme** dès qu'elle est
écrite.

#### 7.1.4 `server/` — le serveur autoritaire Colyseus

**Fonction** : fait tourner le jeu côté serveur. Il est la **seule source de vérité** :
chaque coup reçu est validé (`validateMove`) puis appliqué (`applyMove`), et l'état est
diffusé aux clients.

| Fichier | Contenu | I/O |
|---|---|---|
| `src/index.ts` | démarre le serveur HTTP + enregistre la salle `GameRoom` + `listen()` | aucune entrée ; sortie = serveur sur le port (ex. 2567) |
| `src/rooms/GameStateSchema.ts` | classes `@colyseus/schema` (`Player`, `Tile`, `GameState`) pour la synchronisation d'état | — |
| `src/rooms/GameRoom.ts` | `onCreate` (init), `onJoin`, `onLeave`, `onMessage("move")` | reçoit `Move`, renvoie `GameState` / `MoveResult` |

**Ordre de codage** : `GameStateSchema.ts` (l'état synchronisé) → `index.ts` (serveur
vide qui démarre) → `GameRoom.ts` (`onCreate`/`onMessage`, en branchant
`validateMove`/`applyMove` de `shared/rules.ts`).

---

### 7.2 Dev B — Frontend, rendu et interactions

#### 7.2.1 `client/src/main.ts` — bootstrap Phaser

**Fonction** : crée l'instance du jeu Phaser (dimensions, scènes). **Entrée** : aucune.
**Sortie** : le jeu affiché dans la page.

#### 7.2.2 `client/src/scenes/GameScene.ts` — la scène principale

**Fonction** : affiche le plateau et gère les interactions.

| Méthode | I | O | Rôle |
|---|---|---|---|
| `preload()` | — | — | charge les images (sprites) |
| `create()` | — | — | construit la grille à partir d'un **état mocké (arbitraire)** |
| `update()` | temps écoulé | — | boucle de jeu (animations) |
| gestionnaire de clic | position souris | hex ciblé | `pixelToHex` + envoi du coup |

**Ordre de codage** : `preload` → `create` (rendu statique) → clic (`pixelToHex`) →
`update` (animations). Travailler d'abord sur **données mockées**, sans réseau.

#### 7.2.3 HUD (marché, score, minuteur, jokers)

**Fonction** : afficher le **marché** (4 tuiles + 4 jetons, avec halo rouge si
implaçable), le **score**, le **joueur courant**, le **minuteur** et les **jokers**.
**I/O** : reçoit `GameState`, émet `Move` (choix de tuile/jeton, reroll, confirmation).

**Ordre de codage** : marché statique → score/joueur courant → minuteur → boutons
(reroll, confirmation, retour) → halos rouges.

---

## 8. Tester et vérifier le code

### 8.1 Vérification de types (barrière de compatibilité)

```powershell
npm run typecheck -w shared
npm run typecheck -w server
npm run typecheck -w client
```

**À quoi ça sert** : `tsc --noEmit` analyse le code et signale toute erreur de type
**sans générer de fichiers**. C'est la **première barrière de compatibilité** : si Dev A
renomme un champ de `shared/types.ts`, la compilation casse des deux côtés.

### 8.2 Tests unitaires (Vitest)

```powershell
npm test -w shared              # exécute les tests une fois
npm run test:watch -w shared    # relance à chaque modification
```

**À quoi ça sert** : vérifie automatiquement que les **fonctions pures** (`hex.ts`,
`rules.ts`, fonctions de scoring) renvoient les bonnes valeurs, avec des cas issus du
document source de vérité (barèmes, environnements, reroll…).

### 8.3 Lint et formatage

```powershell
npx eslint .                  # détection d'erreurs / mauvaises pratiques
npx prettier --check .        # vérifie le formatage
npx prettier --write .        # corrige le formatage
```

- **ESLint** analyse le style et les erreurs ; **Prettier** uniformise le formatage.
  Ensemble, ils garantissent un code lisible et identique entre les deux devs.

### 8.4 Lancer en local

```powershell
npm run dev -w server   # démarre le serveur Colyseus
npm run dev -w client   # démarre Vite (http://localhost:5173)
```

### 8.5 Critères « le code est bon »

1. `typecheck` passe sur les **trois** packages.
2. Les **tests unitaires** passent (Vitest) sur `shared`.
3. `eslint` et `prettier` ne signalent aucune erreur.
4. Le **même code** `shared/rules.ts` est utilisé par le serveur (autorité) et le
   client (prévisualisation) → aucun écart de score possible.
5. Un coup complet fonctionne de bout en bout (Phase 3) : clic client → `move` →
   validation serveur → état mis à jour → rendu.

---

## 9. Intégration continue (optionnelle, recommandée)

Sur chaque pull request, exécuter :

```powershell
npm run typecheck -w shared && npm run typecheck -w server && npm run typecheck -w client
npm test -w shared
npx eslint . && npx prettier --check .
```

**À quoi ça sert** : automatiser la vérification à chaque changement de code pour
garantir qu'aucun code incorrect ou non formaté n'est fusionné.
