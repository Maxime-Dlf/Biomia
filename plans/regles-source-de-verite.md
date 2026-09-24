# Règles du jeu — Document source de vérité (Phase 0)

> **Statut** : verrouillé pour le **Tier A (v1)**.
> **Version** : 1.2.
> **Périmètre** : jeu web multijoueur temps réel sur **plateau hexagonal unique et
> partagé**. Univers visuel et règles remaniés pour être juridiquement distincts de
> Cascadia.

Ce document prime sur tout autre fichier en cas de contradiction. Les éléments marqués
**[À CONFIRMER]** sont des décisions proposées, à valider avant le codage.

---

## 1. Concept

- Les joueurs construisent ensemble un **plateau commun** de tuiles hexagonales.
- Chaque tuile porte des **couleurs d'arêtes** (créant des **environnements**) et
  accepte certains **types de jetons**.
- Les joueurs peuvent **voler** les environnements et les structures de jetons des
  autres, et **saboter** leurs agencements.
- Trois axes de score : **environnements**, **jetons** (Tier A) et **jokers**.
- **Nombre de joueurs** : 2 à **8 recommandés** (plus possible, mais moins confortable).

---

## 2. Matériel

### 2.1 Tuiles hexagonales

- Deux familles :
  - **Monochrome** : 1 seule couleur d'arête (les 6 arêtes), accepte **1 type** de jeton.
  - **Bicolore** : 2 couleurs d'arête (**3 arêtes consécutives par couleur**), accepte
    **2 ou 3 types** de jetons.

### 2.2 Jetons

- **5 types de jetons** (formes) : **Carré**, **Triangle**, **Cœur**, **Rond**, **Étoile**.
- **5 environnements** (couleurs) existent, distincts des jetons.

### 2.3 Jokers

- Ressource de paiement, **en nombre illimité**.
- Un joker **non utilisé** en fin de partie vaut **1 point**.

### 2.4 Pool de jetons

- **Taille finie**, déterminée par la capacité d'accueil des tuiles :
  - une tuile acceptant 1 type ajoute **1 jeton** ;
  - une tuile acceptant 2 types ajoute **2 jetons** ;
  - une tuile acceptant 3 types ajoute **3 jetons**.
- Les jetons ajoutés sont ceux des **types acceptés** par la tuile (ex. une tuile
  acceptant `{Carré, Cœur}` ajoute 1 Carré + 1 Cœur).
- Il y a donc **plus de jetons que de tuiles**, mais la pool reste **finie** : les
  tirages évoluent selon la stratégie des joueurs.

### 2.5 Génération et équilibrage des tuiles

Le tirage des tuiles en jeu doit être **équilibré** :

- Les **possibilités stratégiques** de chaque **type de jeton** doivent être **à peu
  près égales**, quel que soit le nombre de tuiles en jeu.
- Les **environnements** (couleurs) doivent être **également équilibrés**.
- Répartition des **capacités d'accueil** :
  - **2 fois moins** de tuiles à 1 jeton que de tuiles à 2 jetons ;
  - **autant** de tuiles à 2 qu'à 3 (à peu près).
  - Ratio cible ≈ **1 : 2 : 2** (1 jeton / 2 jetons / 3 jetons).
- En cas de total **non multiple** du ratio, **favoriser** dans l'ordre : tuiles à
  **1** jeton, puis à **2**, puis à **3**.

**Algorithme validé** :
1. Répartir les **5 couleurs d'environnement** équitablement sur l'ensemble des tuiles.
2. Affecter les **capacités d'accueil** selon le ratio 1:2:2, en répartissant les
   restes dans l'ordre 1 → 2 → 3.
3. Affecter les **formes acceptées** pour que chaque forme apparaisse à peu près
   également sur l'ensemble du plateau.
4. La tuile de départ de chaque joueur (3 hex : 1 / 2 / 3) est **fixe et distincte** de
   la pool.

---

## 3. Mise en place

1. **Joueur 1 (J1)** choisi **aléatoirement**.
2. **Tuile de départ** : chaque joueur reçoit une tuile de départ de **3 hexagones
   placés en triangle**, contenant obligatoirement :
   - une case acceptant **1** type de jeton,
   - une case acceptant **2** types,
   - une case acceptant **3** types.
   - Ces tuiles sont **remaniées à chaque partie** (rejouabilité).
3. **Placement initial** :
   - La tuile de J1 est posée **au centre**.
   - Les autres joueurs (après prise de connaissance de leur tuile) la posent sur un
     **emplacement adjacent** au jeu, dans **l'orientation de leur choix**.
4. **Ordre de jeu** : selon **l'ordre des sièges** OU **aléatoirement**, via une option
   choisie par le chef de salon.
5. **Nombre de tours** : choisi par le **chef de salon** en début de partie
   (**défaut : 20**).
6. **Nombre de tuiles en jeu** (total fixé à la mise en place) :
   - Mode libre : `tours × joueurs + 4`.
   - Mode équipes : `taille de la plus grande équipe × nombre d'équipes × tours + 4`.
7. **Pool de jetons** constituée selon le §2.4.
8. **Objectifs secrets (Cartes de mission — Style "Aventuriers du Rail")** :
   - **Tirage initial** : À la mise en place, chaque joueur (ou chaque équipe en mode équipe) reçoit **3 cartes objectif** :
     - **1 objectif à haute valeur** (défi plus ambitieux, ex: 10–15 pts).
     - **2 objectifs à faible valeur** (défis plus accessibles, ex: 4–6 pts).
   - **Choix initial** : Les joueurs/équipes peuvent choisir de **conserver ou rejeter** chacun de ces objectifs lors de la mise en place.
   - **Ravitaillement en cours de partie** : Dès que **tous les objectifs conservés sont complétés**, le joueur ou l'équipe a la possibilité de demander **3 nouveaux objectifs à faible valeur**. Sur ces 3 nouveaux objectifs, le joueur peut en rejeter au maximum 2 (il doit donc en conserver au moins 1).
   - **Décompte et pénalité stricte** :
     - Tout objectif conservé et **rempli** rapporte sa valeur en points positifs (`+valeur`).
     - Tout objectif conservé et **non rempli** en fin de partie voit sa valeur **soustraite du score final** (`-valeur`).
   - Les objectifs restent **strictement secrets** pour leurs détenteurs (partagés entre coéquipiers en mode équipe).
   - **Génération procédurale & Modding** : Le texte et la valeur sont générés dynamiquement à partir de deux templates visuels (faible valeur et haute valeur). Les packs ZIP peuvent injecter de nouveaux objectifs personnalisés.

---

## 4. Déroulement d'un tour

### 4.1 Affichage du marché

- **4 tuiles** et **4 jetons** sont présentés. **Chaque tuile est associée à un jeton**
  (association 1 à 1 par emplacement).

### 4.2 Reroll (relance)

- Déclenchement **en début de tour**, sur les jetons affichés :
  - **3 jetons identiques** → le joueur **peut** relancer ces 3 jetons (le 4ᵉ,
    différent, est conservé). Un **bouton de reroll** s'affiche et reste visible
    jusqu'au choix des jetons.
  - **4 jetons identiques** → reroll **automatique** des 4, sans demander l'avis.
- Le reroll est **définitif** : le bouton retour ne peut pas l'annuler.
- Les jetons **remplacés** ne sont **pas considérés** lors du nouveau tirage (pour ne
  pas les retirer immédiatement) ; ils sont **remis dans la pool après**.
- **Règle anti-boucle** : si l'état de la pool ne permet plus d'obtenir un tirage
  différent de « 4 jetons identiques », le reroll automatique est **désactivé**.
- **Cas des rerolls manuels** :
  - Un reroll à 3 jetons peut retomber sur 3 autres jetons identiques → **pas un problème**.
  - Si un reroll de joueur donne **4 jetons identiques**, on **laisse le jeu tel quel**,
    **sans** reroll automatique (l'auto-reroll ne s'applique qu'à l'affichage initial).

### 4.3 Choix et pose de la tuile

- Le joueur **choisit une tuile**, puis la pose sur une position **adjacente au jeu
  actuel**, en choisissant son **orientation parmi 6**.

### 4.4 Choix et placement du jeton

- Après la pose de la tuile, le joueur choisit **parmi les 4 jetons** proposés :
  - le jeton **associé à la tuile choisie** → **gratuit** ;
  - un **autre** jeton → coûte **1 joker** ;
  - option **« ne rien choisir »** → le jeton associé à sa tuile est **renvoyé à la
    pool et remplacé**.
- Le joueur place son jeton sur **une tuile de son choix qui accepte ce jeton**.

**Jeton non plaçable** :

- Les jetons **non plaçables** (aucune tuile ne les accepte) sont affichés avec un
  **halo rouge** et sont **impossibles à sélectionner**.
- Si le jeton **associé** (gratuit) n'est pas plaçable, le joueur a **deux options** :
  1. **ne pas jouer** ce jeton → il est **renvoyé à la pool** ;
  2. **payer 1 joker** pour prendre un **autre jeton plaçable** présent.
- Le joueur ne peut **en aucun cas** demander un nouveau tirage de son jeton s'il ne
  peut pas être placé.

### 4.5 Bonus joker (tuile monochrome)

- Si la tuile où le jeton est posé **n'accepte qu'un seul type de jeton**
  (monochrome), le joueur **récupère 1 joker** après la pose.

### 4.6 Bouton retour

- Permet d'annuler les actions du joueur **jusqu'au choix initial entre les 4 tuiles**.
- **Rembourse tout** (position de la tuile, jeton posé, jokers dépensés) **sauf les
  rerolls**, qui restent définitifs.

### 4.7 Confirmation de fin de tour

- Une **confirmation** est nécessaire pour terminer le tour :
  - après le placement du jeton ;
  - également lorsque le joueur **ne place pas de jeton**.

### 4.8 Minuteur et expiration

- **Durée par défaut : 60 secondes**, paramétrable entre **15 et 180 secondes**.
- Le temps vaut pour le **tour intégral** (pas de temps par action individuelle).
- À expiration, si le joueur n'a pas terminé son tour, le **serveur joue
  aléatoirement** parmi les **actions restantes**.
- Le serveur ne peut **jamais dépenser les jokers** d'un joueur.

### 4.9 Regarnissage du marché

À la fin du tour, le marché conserve toujours **4 tuiles et 4 jetons** :

- La **tuile choisie** est remplacée par une nouvelle tuile aléatoire.
- Le **jeton choisi** (celui effectivement pris) est remplacé par un nouveau jeton
  aléatoire.
- Cas particuliers :
  - Jeton **associé** pris (gratuit) → la tuile et son jeton associé sont remplacés.
  - **Autre jeton** pris (joker payé) → seuls la tuile choisie et le jeton pris sont
    remplacés ; le **jeton initialement associé** à la tuile choisie **reste**.
  - **« Ne rien choisir »** → le jeton associé est renvoyé à la pool et **remplacé**
    (la tuile est remplacée).
- Les tuiles non choisies et leurs jetons (non pris) sont **conservés**.

---

## 5. Scoring

### 5.1 Environnements (tuiles)

- **Création** : deux tuiles adjacentes dont **l'arête adjacente est de même couleur**
  forment un environnement.
- **Croissance** : la taille d'un environnement peut augmenter **indéfiniment**.
- **Contrôle** : le joueur qui pose une **tuile** qui **augmente la taille** de
  l'environnement en **prend le contrôle intégral** (cf. §6 pour l'ancienneté).
- **Taille minimale** : un environnement n'est comptabilisé que s'il atteint
  `ceil((T − 4) / 10)`, où `T` = nombre total de tuiles en jeu (fixé à la mise en
  place, §3.6). Le seuil est donc **fixe** pour toute la partie.
- **Points en cours de partie** : tout joueur disposant d'environnements valides gagne
  un nombre de points égal au **nombre de tuiles cumulé** de ses environnements
  (scoring **individuel**).
- **Bonus de fin de partie** (par couleur d'environnement) :
  - **+2 points** pour le **plus grand** environnement de chaque couleur ;
  - **+1 point** pour le **deuxième plus grand** de chaque couleur.
  - En cas d'**égalité de taille**, l'environnement **le plus ancien** remporte le
    bonus ; l'environnement perdant est **rétrogradé au grade suivant** (un plus grand
    environnement perdant concourt alors pour le bonus de +1).

### 5.2 Jetons — Les 4 Tiers Officiels (Tiers A, B, C, D)

> **Système de Tiers** : Les règles ci-dessous détaillées correspondent au **Tier D (Expert / Master)**, offrant un niveau d'exigence et d'interaction élevé. Le jeu intègre 4 Tiers officiels distincts pour renouveler les saisons et modes de jeu :
> - **Tier A (Initiation & Dynamisme)** : Carrés en trios compacts (9 pts), Triangles d'arêtes (4 à 24 pts), Cœurs en paires espacées (6 pts), Ronds en clans libres de 3 à 5 (6 à 17 pts), Étoiles balises (3 pts par biome adjacent).
> - **Tier B (Densité & Alignements)** : Carrés en échelle (14 pts), Triangles en chevrons zig-zag (6 à 21 pts), Cœurs en arbre ramifié (12 pts), Ronds en couronnes hexagonales (8 à 22 pts), Étoiles en pont stellaire entre 2 biomes (8 pts).
> - **Tier C (Sabotage & Conflit Direct)** : Carrés en mur de rupture, Triangles en flèches prédatrices (siphonnent 4 pts), Cœurs parasitaires volant le contrôle, Ronds bloquants, Étoiles trou noir.
> - **Tier D (Expert / Master — Spécification Normative ci-dessous)** : Paires strictes isolées, lignes droites, cœurs sans boucle triangulaire, ronds solitaires et diversité multiforme.

> Règle générale d'adjacence : « côte à côte » = **partage d'une arête complète**
> (voisins hexagonaux).

#### 5.2.1 Carrés (Tier D)

- Une **paire** = 2 jetons carrés **adjacents**.
- Barème selon le nombre de paires du joueur :
  - 1 paire → **5**, 2 → **11**, 3 → **18**, 4 → **27** ;
  - au-delà de 4 paires : **+9 par paire supplémentaire**.
- **Invalidation** : si un jeton carré est placé **à côté d'une paire**, la paire est
  **invalidée** (vaut 0).
- **Propriété** : le joueur qui **complète une paire** (pose le 2ᵉ carré) en obtient la
  pleine propriété.

#### 5.2.2 Triangles

- Les jetons triangles placés **côte à côte** forment une **chaîne** en **ligne
  droite** (un des 3 axes de la grille hexagonale, 6 directions).
- Barème selon la longueur de chaîne :
  - 1 → **2**, 2 → **5**, 3 → **9**, 4 → **13**, 5 → **17**, 6 → **21**, **7 et plus → 25**.
- **Pas d'invalidation possible** : on ne peut que **prendre le contrôle** en ajoutant
  un jeton à la chaîne.
- **Pas de boucle** autorisée dans la chaîne.
- **Ramifications possibles** : le joueur qui pose un jeton **en dernier** et complète
  la **plus longue chaîne** en prend le contrôle ; des **chaînes secondaires** peuvent
  être collées à la principale.

#### 5.2.3 Cœurs

- Les cœurs placés **en chaîne adjacente** (peu importe l'orientation) rapportent des
  points.
- Barème selon la longueur de chaîne :
  - 1 → **2**, 2 → **4**, 3 → **7**, 4 → **12**, 5 → **16**, 6 → **20**, **7 et plus → 25**.
- **Cycles permis** : une structure de cœurs peut former des boucles.
- **Exception** : un **cycle triangulaire direct** (3 cœurs mutuellement adjacents,
  formant un triangle) est **invalidé** et **brise** la chaîne à cet endroit.
- Les jetons du cycle triangulaire sont invalidés ; les **segments restants** sont
  traités comme des segments **classiques** et obtiennent un **scoring normal**.

#### 5.2.4 Ronds

- Tout jeton rond **non adjacent à un autre rond** rapporte des points.
- **Scoring individuel** : chaque joueur marque selon le barème pour **ses propres**
  ronds isolés :
  - 1 → **2**, 2 → **5**, 3 → **8**, 4 → **11**, 5 → **14**, 6 → **18**, 7 → **22**,
    **8 et plus → 26**.
- **Invalidation** : placer un rond **adjacent** au rond d'un joueur invalide ce rond
  (deux ronds adjacents **ne valent rien**).
- **Pas de récupération** possible du rond d'un joueur.

#### 5.2.5 Étoiles

- Pour chaque **type de jeton distinct adjacent** au jeton étoile, un nombre de points
  est attribué au joueur qui a posé l'étoile, selon le barème :
  - 1 type distinct → **2**, 2 → **5**, 3 → **9**, 4 → **14**, 5 → **20**.
- Une **paire** autour du jeton étoile **n'invalide pas** le point (les doublons ne
  comptent qu'une fois).
- Les jetons adjacents servent de **support** : un même jeton peut compter pour
  plusieurs étoiles (cf. §5.2.6).

#### 5.2.6 Unicité des jetons

- **Chaque jeton ne peut servir que dans une seule chaîne ou un seul montage.**
  Un jeton qui constitue une structure (paire, chaîne) est **exclusif** à cette
  structure.
- **Briser** une chaîne ou un montage par un autre n'est possible que si la structure
  **concurrente est plus grande** **et** que les règles du tier le permettent (cf. §6).
- **Exception — jetons « autour »** : les jetons adjacents servant de **support**
  (ex. les voisins d'une étoile) peuvent avoir un **nombre de rôles illimité**.
  Ex. : un jeton carré adjacent à deux étoiles compte pour les deux.

### 5.3 Jokers

- Chaque joker **non utilisé** en fin de partie vaut **1 point**.

### 5.4 Équilibrage des jetons — validé

Le barème ajusté est **validé** et intégré aux sections ci-dessus :

- **Étoile** : barème progressif (1 → 2, 2 → 5, 3 → 9, 4 → 14, 5 → 20).
- **Triangle** : barème prolongé (5 → 17, 6 → 21, 7 et plus → 25).
- **Carrés, Ronds et Cœurs** : conservés.

**Principe** : plus une forme est facile à invalider (risque élevé), plus sa récompense
doit être élevée ; toutes les formes doivent **scaler** avec la taille de la structure.

---

## 6. Propriété et ancienneté

- **L'ancienneté prime toujours à longueur égale.**
- Pour **dérober** la propriété de jetons ou d'environnements, un joueur doit
  obligatoirement produire une structure **strictement plus grande**.
- À taille égale, la structure **la plus ancienne** et la plus grande **gagne toujours**.
- **Mesure de l'ancienneté** : l'ancienneté d'un environnement ou d'une structure se
  mesure à l'ancienneté de son **dernier agrandissement** (pas de sa création). À
  taille égale, la structure dont le dernier agrandissement est **le plus ancien** gagne.

### 6.1 Représentation visuelle et lisibilité des structures
- **Environnements (Biomes)** : la propriété d'un environnement est affichée via un **liseré coloré entourant le périmètre extérieur** des tuiles de cet environnement, dans la couleur du joueur (ou de l'équipe) qui le contrôle.
- **Structures de jetons** : les jetons constituant une structure (paires, chaînes, montages) sont reliés par un **trait joignant le milieu des tuiles et passant sous les jetons**. La couleur du trait correspond au propriétaire de la structure.
- **Structures invalidées** : le trait de liaison devient rouge/discontinu et les jetons fracturés en deux restent affichés à l'écran.

---

## 7. Fin de partie

- La partie se termine après le **nombre de tours fixé** (défaut 20).
- Décompte final :
  - points d'**environnements** (courants + bonus de fin) ;
  - points de **jetons** (Tier A) ;
  - points d'**objectifs secrets** (révélés publiquement) :
    - **+valeur de l'objectif** si la condition est remplie ;
    - **-valeur de l'objectif** si l'objectif a été conservé mais n'est pas rempli ;
  - **+1 point par joker** non utilisé.
- Le joueur (ou l'équipe) au total le plus élevé gagne.

---

## 8. Mode équipes

- Les tailles d'équipes sont **gérées par les joueurs, sans limite** (une partie
  `1 vs 42 vs 999` est possible).
- Une option d'organisation **50/50 aléatoire** des équipes est proposée ; en cas
  d'effectif **impair**, une équipe prend un joueur en plus.
- **Alternance** : les joueurs sont alternés **en fonction de leur équipe** pour
  garantir un **même nombre de tours par équipe**.
- Un joueur d'une **petite équipe** joue **plusieurs fois par tour complet** pour que
  chaque équipe obtienne un nombre de tours égal.
- Matériel : `taille de la plus grande équipe × nombre d'équipes × tours + 4`.

### 8.1 Communication & Système de Chat
- **Chat d'équipe** : activé avec la touche **`Entrée`** (`Enter`). Le message n'est diffusé et visible que par les membres de la même équipe.
- **Chat général** : activé avec la combinaison **`Maj + Entrée`** (`Shift + Enter`). Le message est diffusé publiquement à tous les joueurs de la table.
- En mode individuel (« chacun pour soi »), la touche `Entrée` permet d'accéder directement au chat de la partie.

---

## 9. Règles techniques et architecture

À intégrer dans le serveur autoritaire (voir
[`plan-compatibilite-et-synchronisation.md`](plan-compatibilite-et-synchronisation.md:1)) :

1. **Reroll automatique** : avant d'envoyer le résultat d'un reroll au jeu, **vérifier
   qu'il est correct** (pas 4 jetons identiques si le reroll est automatique).
2. **Anti-boucle** : désactiver le reroll automatique si la pool ne permet plus un
   tirage différent de « 4 identiques ».
3. **Reroll manuel** : autorisé à retomber sur 3 identiques ; s'il donne 4 identiques,
   ne **pas** déclencher de reroll automatique (laisser tel quel).
4. Le **client** ne fait que *demander* des coups ; le **serveur** valide toujours
   (anti-triche), notamment la possession, les jokers et la légalité des poses.
5. **Expiration du tour** : le serveur joue aléatoirement parmi les actions restantes,
   sans jamais dépenser les jokers du joueur.
6. **Modularité (DRY)** : le plus grand nombre de mécaniques doit être écrit de façon
   **modulaire**, permettant de les **désactiver sans tout casser** lors de parties
   personnalisées. Toutes les options du jeu doivent être accessibles. L'ajout des
   Tiers B/C/D se fait via de nouvelles fonctions enregistrées dans un registre, sans
   modifier le noyau.
7. **Unicité des jetons** : l'algorithme de scoring doit garantir qu'un jeton
   constituant une structure est affecté à **une seule** structure, tandis que les
   jetons de **support** (voisins d'étoile) peuvent être comptés plusieurs fois.
8. **Adaptation DA** : le code doit permettre d'intégrer facilement les noms, les
   images et les animations (DA forte) à la fin, sans réécriture du noyau. La v1
   démarre avec des **couleurs** et des **formes** simples.
9. **Reconnexion par Token de session invité** : Un joueur sans compte n'est pas kické lors d'une déconnexion accidentelle ; un token de reconnexion temporaire valide 3h lui permet de retrouver son siège et son statut.
10. **Architecture réseau hybride & économie serveur** : Les parties classées tournent sur serveur dédié Node.js/Colyseus pour l'intégrité de l'ELO. Les parties classiques et personnalisées déportent l'autorité sur la machine d'un joueur-hôte (Listen Server via WebRTC DataChannels P2P), réduisant les coûts serveurs de 90%.

---

## 10. Points ouverts — à confirmer avant le codage

| # | Point | Statut |
|---|---|---|
| 1 | **Noms / DA** des 5 environnements et des 5 formes | **Réalisés à la fin** ; la structure du code doit permettre une adaptation simple |
| 2 | **Désambiguïsation des paires de Carrés** (un carré adjacent à plusieurs carrés) | Chaque carré est exclusif à une paire (§5.2.6) ; détail d'implémentation |

> La v1 démarre avec des **couleurs** et des **formes** simples ; les **images** et
> **animations** (DA forte et reconnaissable) seront intégrées plus tard.
