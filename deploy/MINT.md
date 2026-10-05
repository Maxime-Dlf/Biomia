# Hébergement de développement sur un PC Linux Mint

> **Guide pour débutant complet** : ce document détaille pas à pas l'installation et
> l'hébergement du jeu sur un ordinateur sous Linux Mint. Aucune connaissance préalable
> de Linux n'est requise.

Choix acté au §16.6 et au journal du §22.4 (T52) de `docs/SOURCE-DE-VERITE.md` : pendant le
développement, les tests et l'équilibrage, le jeu tourne sur un PC personnel sous Linux Mint,
publié par **Tailscale Funnel**.

Tout est **100 % gratuit**. Le passage ultérieur à un domaine payant ne demandera aucune
modification de code (voir la section 6).

Configuration matérielle cible : Bbox → routeur Huawei AX3S → PC Mint (ex. i5-4460, 16 Go, 1 Gbit/s).

---

## Les 4 règles d'or du Terminal Linux (à lire avant de commencer !)

Pour configurer le PC, vous allez utiliser le **Terminal** (l'équivalent de l'invite de commandes).
Pour l'ouvrir à tout moment : appuyez simultanément sur **`Ctrl + Alt + T`** ou cliquez sur le menu
Mint en bas à gauche puis tapez « Terminal ».

1. **Le piège du mot de passe masqué** : quand une commande vous demande votre mot de passe
   administrateur (`[sudo] mot de passe de …`), **rien ne s'affiche à l'écran quand vous tapez**
   (ni lettres, ni étoiles, ni ronds). C'est une sécurité normale sous Linux ! Tapez simplement
   votre mot de passe en aveugle et appuyez sur la touche **Entrée**.
2. **Copier-Coller dans le terminal** :
   - Pour **coller** un texte dans le terminal : faites **`Ctrl + Maj + V`** (ou clic droit → *Coller*).
     Le raccourci classique `Ctrl + V` ne fonctionne pas dans le terminal Linux.
   - Pour **copier** depuis le terminal : faites **`Ctrl + Maj + C`** (ou clic droit → *Copier*).
3. **Le mot `sudo`** : signifie « exécuter en tant qu'administrateur ». Il vous sera demandé
   régulièrement pour installer des programmes système.
4. **Annuler ou arrêter une commande** : si un programme semble bloqué ou attend une saisie,
   faites **`Ctrl + C`** pour revenir à l'invite de commande normale.

---

## Pourquoi Tailscale Funnel ?

Votre installation réseau comporte **deux routeurs** en cascade (la Bbox fournie par le FAI, puis
le routeur Wi-Fi Huawei AX3S). C'est ce qu'on appelle un **double NAT**.

Dans cette situation, une méthode classique (DuckDNS + redirection de ports) obligerait à paramétrer
les deux routeurs l'un après l'autre et rendrait votre adresse IP personnelle visible sur Internet.
**Tailscale Funnel** résout tout cela simplement :

- **Aucune redirection de port** ni manipulation à faire sur la Bbox ou le Huawei ;
- **Certificat de sécurité HTTPS automatique**, avec support des WebSockets (obligatoire pour Discord) ;
- **Adresse IP de votre domicile masquée** et totalement protégée ;
- **Adresse fixe et gratuite** sous la forme `https://<votre-machine>.<tailnet>.ts.net` ;
- Offre personnelle de Tailscale entièrement gratuite.

```
Joueur (navigateur web ou Discord)
             │
             ▼  (HTTPS sécurisé)
      Tailscale Funnel
             │
             ▼
   PC Mint : Caddy (port local 127.0.0.1:8080)
             ├─ /      → Fichiers du jeu web (client statique PixiJS / Svelte)
             ├─ /ws    → Serveur de jeu en temps réel (Colyseus WebSocket)
             └─ /api   → API de santé et d'état
```

---

## 1. Préparer le PC Mint (à faire une seule fois)

### Étape 1.1 — Installer Linux Mint et créer votre compte
1. Installez Linux Mint (version 21 ou 22, édition Cinnamon recommandée car très proche de Windows).
2. Lors de l'installation, définissez votre nom d'utilisateur, par exemple `crassecadia`, et un mot
   de passe solide (dont vous vous souviendrez facilement, car il sera demandé par `sudo`).
3. Connectez le PC à Internet (idéalement en câble Ethernet relié au routeur Huawei).

### Étape 1.2 — Donner au PC l'accès au dépôt GitHub privé (clé de déploiement)
Pour que votre PC Mint puisse télécharger le code du jeu sans que vous ayez à saisir votre mot de passe
GitHub, on crée une **clé SSH de déploiement** en lecture seule :

1. Sur le PC Mint, ouvrez le terminal (`Ctrl + Alt + T`).
2. Installez Git et les outils SSH en collant cette commande (validez avec *Entrée*, puis tapez votre mot
   de passe Mint si demandé) :
   ```sh
   sudo apt update && sudo apt install -y git openssh-client
   ```
3. Générez la clé de sécurité (appuyez sur *Entrée* sans modifier la commande) :
   ```sh
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "crassecadia-mint"
   ```
4. Affichez la clé publique générée à l'écran :
   ```sh
   cat ~/.ssh/id_ed25519.pub
   ```
   Le terminal affiche une ligne qui commence par `ssh-ed25519 AAAA...` et se termine par `crassecadia-mint`.
   **Sélectionnez toute cette ligne avec la souris, faites un clic droit puis *Copier*.**
5. Enregistrez cette clé sur GitHub (depuis votre navigateur habituel) :
   - Rendez-vous sur la page GitHub de votre projet : `https://github.com/<votre-compte>/<votre-depot>` ;
   - Cliquez sur l'onglet **Settings** (la roue crantée tout en haut à droite du dépôt) ;
   - Dans le menu de gauche, descendez jusqu'à la section **Security** et cliquez sur **Deploy keys** ;
   - Cliquez sur le bouton vert **Add deploy key** en haut à droite ;
   - Dans le champ **Title**, écrivez par exemple `PC Mint Serveur` ;
   - Dans le champ **Key**, collez la clé copiée précédemment ;
   - **Important** : laissez la case *Allow write access* **décochée** (lecture seule par sécurité) ;
   - Cliquez sur **Add key**.

### Étape 1.3 — Récupérer le projet et lancer le script d'installation automatique
Revenez sur le terminal de votre PC Mint :

1. Téléchargez le projet (remplacez `<votre-compte>` et `<votre-depot>` par vos vrais identifiants GitHub) :
   ```sh
   git clone git@github.com:<votre-compte>/<votre-depot>.git ~/crassecadia
   ```
   > 💡 **Première connexion à GitHub ?** Le terminal affichera un message d'avertissement :
   > `Are you sure you want to continue connecting (yes/no/[fingerprint])?`
   > Tapez simplement `yes` et appuyez sur **Entrée**.

2. Entrez dans le dossier du projet et lancez le script de configuration :
   ```sh
   cd ~/crassecadia
   sudo bash deploy/bootstrap-mint.sh
   ```
   *(Si vous souhaitez autoriser une clé SSH pour administrer le PC à distance depuis votre autre machine,
   vous pouvez l'ajouter en paramètre : `sudo bash deploy/bootstrap-mint.sh "ssh-ed25519 AAAA... commentaire"`).*

**Ce que fait ce script automatiquement pour vous :**
- Installe **Docker Engine** (le système de conteneurs isolés qui fera tourner le jeu) ;
- Installe **Tailscale** (le tunnel sécurisé) ;
- Active le **pare-feu Linux (UFW)** : bloque toutes les attaques venues d'Internet et n'autorise que
  les connexions légitimes de votre réseau local et de Tailscale ;
- Configure le système pour **empêcher la mise en veille** : le serveur continuera de tourner 24h/24
  même si l'écran s'éteint.

### Étape 1.4 — Redémarrer la session utilisateur (indispensable !)
Pour que votre compte utilisateur ait le droit d'utiliser Docker sans taper `sudo` à chaque commande,
le système doit recharger vos permissions :

- Redémarrez le PC ou fermez la session :
  ```sh
  sudo reboot
  ```
  (Ou via l'interface graphique : Menu Mint en bas à gauche → bouton rouge Quitter → *Redémarrer*).

### Étape 1.5 — Activer les mises à jour automatiques de sécurité (dans l'interface graphique)
1. Ouvrez le menu Mint (icône en bas à gauche) et tapez « **Gestionnaire de mises à jour** », puis ouvrez-le.
2. Dans la barre de menu en haut de la fenêtre : cliquez sur **Édition** → **Préférences**.
3. Cliquez sur l'onglet **Automatisation**.
4. Cochez les options :
   - *Appliquer automatiquement les mises à jour*
   - *Supprimer les anciens noyaux inutilisés*
5. Cliquez sur *Appliquer*. Votre serveur restera ainsi sécurisé sans intervention manuelle.

*(Facultatif mais recommandé)* : Dans l'interface d'administration de votre routeur Huawei AX3S
(généralement accessible sur `http://192.168.3.1`), allez dans les paramètres réseau / DHCP et attribuez
un **bail DHCP statique** (réservation d'adresse IP) à votre PC Mint pour que son adresse IP locale
reste toujours la même.

---

## 2. Configurer Tailscale et activer Funnel (à faire une seule fois)

### Étape 2.1 — Créer votre compte Tailscale
1. Rendez-vous sur <https://login.tailscale.com> depuis n'importe quel navigateur.
2. Créez un compte gratuit (en vous connectant avec votre compte GitHub, Google ou Microsoft).

### Étape 2.2 — Connecter votre PC Mint à Tailscale
1. Sur le PC Mint, ouvrez un terminal (`Ctrl + Alt + T`) et tapez :
   ```sh
   sudo tailscale up --hostname=crassecadia
   ```
2. Le terminal affiche un lien web commençant par `https://login.tailscale.com/a/...`.
3. Maintenez la touche **Ctrl** enfoncée et cliquez sur le lien (ou faites un clic droit dessus → *Ouvrir le lien*,
   ou copiez-le dans le navigateur Firefox du PC).
4. Connectez-vous avec votre compte Tailscale et cliquez sur le bouton **Connect** pour valider la machine.

### Étape 2.3 — Activer les certificats HTTPS et MagicDNS sur le site Tailscale
1. Dans votre navigateur, ouvrez la console d'administration Tailscale : <https://login.tailscale.com/admin/dns>
   (Menu **DNS** en haut).
2. Vérifiez que **MagicDNS** est bien activé (*Enabled*).
3. Faites défiler la page vers le bas jusqu'à la section **HTTPS Certificates** et cliquez sur le bouton
   pour l'activer (*Enable HTTPS*).

### Étape 2.4 — Activer Funnel sur le port du jeu (8080)
1. Dans le terminal du PC Mint, tapez :
   ```sh
   sudo tailscale funnel --bg 8080
   ```
2. **La toute première fois**, Tailscale vous prévient que Funnel doit être autorisé sur votre compte
   et affiche un lien web.
3. Ouvrez ce lien dans votre navigateur et cliquez sur le bouton pour autoriser Funnel.
4. Une fois autorisé sur le site web, **relancez la même commande** dans le terminal :
   ```sh
   sudo tailscale funnel --bg 8080
   ```
5. Vérifiez que tout est actif en tapant :
   ```sh
   tailscale funnel status
   ```
6. Le terminal vous affiche votre adresse publique sécurisée. Elle ressemble à ceci :
   `https://crassecadia.tail12345.ts.net`

> 📌 **NOTEZ PRÉCIEUSEMENT CETTE ADRESSE !**
> La partie située après `https://` (par exemple `crassecadia.tail12345.ts.net`) est votre **DOMAIN**.
> Vous en aurez besoin dans les étapes suivantes.

---

## 3. Configurer et lancer le jeu

### Étape 3.1 — Créer le fichier de configuration `.env`
Le dossier `deploy` contient un fichier modèle `.env.example`. Nous allons le dupliquer pour créer
votre propre fichier secret `.env` :

```sh
cd ~/crassecadia/deploy
cp .env.example .env
chmod 600 .env
```
*(La commande `chmod 600` garantit que seul votre utilisateur peut lire ce fichier contenant vos secrets).*

### Étape 3.2 — Renseigner vos informations dans le fichier `.env`
Vous pouvez ouvrir le fichier avec l'éditeur de texte graphique simple de Linux Mint :
```sh
xed .env &
```
*(Si vous préférez le terminal, vous pouvez utiliser `nano .env`. Pour enregistrer avec nano : faites `Ctrl + O`
puis Entrée, et pour quitter : faites `Ctrl + X`).*

Remplissez les premières valeurs :
1. Sur la ligne `DOMAIN=`, collez votre nom de domaine Tailscale sans `https://`
   (exemple : `DOMAIN=crassecadia.tail12345.ts.net`).
2. Pour l'instant, laissez `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` vides (nous les remplirons à
   l'étape 4 pour l'intégration Discord).
3. Enregistrez le fichier (`Fichier → Enregistrer` ou `Ctrl + S`) et fermez l'éditeur.

### Étape 3.3 — Démarrer le jeu avec Docker
Dans le terminal, lancez la construction et le démarrage du serveur :
```sh
cd ~/crassecadia/deploy
docker compose up -d --build
```
> ⏳ *La première fois, cette opération prend entre 1 et 3 minutes car Docker télécharge les images
> de base et compile le code TypeScript du client et du serveur. Les lancements suivants seront quasi instantanés.*

### Étape 3.4 — Vérifier que tout fonctionne
Exécutez le script de contrôle :
```sh
./check.sh
```
Vous devez obtenir une réponse positive similaire à celle-ci :
```text
Local   : {"ok":true,"version":"1.0.0",...}
Public  : {"ok":true,"version":"1.0.0",...}
Client  : 200
```
Et le tableau Docker en dessous doit afficher les services `caddy` et `server` avec le statut `running` ou `Up`.

🎉 **Félicitations !** Ouvrez dès maintenant `https://<votre-domaine>` dans le navigateur de votre PC,
de votre téléphone ou de votre tablette : le jeu fonctionne déjà en direct sur Internet !

---

## 4. Configurer l'application Discord (Activity)

Pour pouvoir jouer au jeu directement à l'intérieur d'un salon vocal Discord (sur PC ou smartphone) :

1. Rendez-vous sur le portail développeur de Discord : <https://discord.com/developers/applications>.
2. Connectez-vous avec votre compte Discord.
3. Cliquez sur le bouton bleu **New Application** en haut à droite. Donnez-lui un nom, par exemple
   « **CrasseCadia (dev)** », cochez la case des conditions et validez avec **Create**.
4. **Récupérer le Client ID** :
   - Dans le menu de gauche, cliquez sur **General Information** ;
   - Copiez l'**Application ID** (une suite de 18 à 19 chiffres). C'est votre *Client ID*.
5. **Récupérer le Client Secret** :
   - Dans le menu de gauche, cliquez sur **OAuth2** ;
   - Sous la section *Client Information*, cliquez sur le bouton **Reset Secret** ;
   - Discord vous affiche une clé secrète **une seule fois**. Cliquez sur **Copy** ;
   - *(Dans cette même page, sous la section Redirects, cliquez sur Add Redirect et ajoutez `https://127.0.0.1`
     puis enregistrez les modifications).*
6. **Inscrire ces identifiants dans votre PC Mint** :
   - Ouvrez votre fichier `.env` sur le PC Mint (`xed ~/crassecadia/deploy/.env &`) ;
   - Remplissez les deux lignes avec les valeurs obtenues :
     ```env
     DISCORD_CLIENT_ID=123456789012345678
     DISCORD_CLIENT_SECRET=votre_cle_secrete_ici
     ```
   - Enregistrez et fermez le fichier.
7. **Activer l'activité dans Discord** :
   - Dans le portail Discord, menu de gauche, cliquez sur **Activities** → **Settings** ;
   - Activez l'interrupteur (*Enable Activities*).
8. **Configurer les correspondances d'adresses (URL Mappings)** :
   - Toujours dans le menu **Activities**, cliquez sur **URL Mappings** ;
   - Ajoutez trois correspondances (attention : indiquez les cibles **sans** `https://`) :

     | Préfixe | Cible (Mapping) |
     |---|---|
     | `/` | `crassecadia.<votre-tailnet>.ts.net` |
     | `/ws` | `crassecadia.<votre-tailnet>.ts.net/ws` |
     | `/api` | `crassecadia.<votre-tailnet>.ts.net/api` |

   - Cliquez sur **Save Changes** en bas.
9. **Installer l'activité sur votre serveur Discord de test** :
   - Dans le menu de gauche, cliquez sur **Installation** ;
   - Dans les options d'installation, copiez le lien d'invitation proposé et ouvrez-le dans un nouvel
     onglet pour installer l'application sur votre serveur Discord privé.
10. **Reconstruire le jeu pour prendre en compte les identifiants** :
    Sur le PC Mint, exécutez simplement :
    ```sh
    ~/crassecadia/deploy/update.sh
    ```
11. **Lancer une partie dans Discord !**
    - Rejoignez un salon vocal sur votre serveur Discord de test ;
    - Cliquez sur l'icône de fusée (**Démarrer une activité**) en bas à gauche ;
    - Sélectionnez votre jeu « CrasseCadia (dev) » : le plateau apparaît directement dans Discord !

> ℹ️ *Tant que l'application n'est pas vérifiée publiquement par Discord, seuls les membres de votre équipe
> ou les personnes déclarées dans l'onglet Roles/Testeurs du portail développeur peuvent lancer l'activité.*

---

## 5. Commandes utiles au quotidien & Dépannage

Une fois le serveur en place, voici tout ce que vous devez savoir pour l'exploiter sereinement.

### Mettre à jour le jeu après une modification sur GitHub
Quand vous avez poussé de nouvelles modifications sur le dépôt GitHub :
```sh
~/crassecadia/deploy/update.sh
```
Ce script récupère automatiquement le code le plus récent (`git pull`), reconstruit les conteneurs et
vérifie que le serveur est bien reparti.

### Vérifier l'état du serveur
Pour savoir si les conteneurs tournent correctement :
```sh
cd ~/crassecadia/deploy
docker compose ps
```
Vous devez voir `caddy` et `server` avec l'état `running` (vert).

### Consulter les journaux (logs) en cas de problème
Si vous voulez voir ce qui se passe sur le serveur de jeu en direct :
```sh
cd ~/crassecadia/deploy
docker compose logs -f server
```
*(Appuyez sur `Ctrl + C` quand vous souhaitez quitter l'affichage des logs).*

### Arrêter et redémarrer le serveur
- Pour **arrêter** le serveur :
  ```sh
  cd ~/crassecadia/deploy && docker compose down
  ```
- Pour **relancer** le serveur :
  ```sh
  cd ~/crassecadia/deploy && docker compose up -d
  ```

### Que se passe-t-il en cas de coupure de courant ou de redémarrage du PC ?
Rien de grave ! Le script de préparation a configuré Docker pour démarrer automatiquement avec le système
(`restart: unless-stopped`). Dès que le PC Mint se rallume et retrouve la connexion Internet, les
conteneurs et Tailscale Funnel reprennent tout seuls sans aucune action de votre part.

---

## 6. Plus tard : passage à un nom de domaine personnalisé payant

Si vous décidez plus tard d'acheter votre propre nom de domaine (par exemple `monjeunature.com`) ou de louer
un VPS :

1. Créez un enregistrement DNS de type A faisant pointer votre domaine vers l'adresse IP publique de votre serveur.
2. Dans le fichier `.env` sur le serveur : modifiez la ligne `DOMAIN=monjeunature.com`.
3. Lancez la commande en mode direct :
   ```sh
   cd ~/crassecadia/deploy && ./update.sh direct
   ```
   *(Le serveur web Caddy générera automatiquement un certificat HTTPS gratuit Let's Encrypt).*
4. Dans le portail développeur Discord, remplacez les cibles des URL Mappings par votre nouveau domaine.

Aucune ligne de code du moteur ou de l'application n'a besoin d'être modifiée.

---

## Annexe : accès direct avec DuckDNS (sans Tailscale)

*À n'utiliser que si vous ne souhaitez pas utiliser Tailscale Funnel.* Cette méthode nécessite que votre
fournisseur d'accès vous attribue une adresse IPv4 publique dédiée (sans CGNAT : l'adresse IP affichée dans
la console de votre Bbox doit être strictement identique à celle retournée par <https://ifconfig.me>).

1. Créez un sous-domaine gratuit sur <https://www.duckdns.org> et notez votre jeton de compte (*token*).
2. Supprimez le conflit de double NAT au choix :
   - Passez votre routeur Huawei AX3S en **mode point d'accès (pont)**, pour que le PC soit directement
     rattaché au réseau de la Bbox ;
   - Ou conservez le mode routeur : sur la Bbox, redirigez les ports TCP 80 et 443 (et UDP 443) vers
     l'adresse IP WAN du Huawei (ou configurez cette adresse en DMZ) ; puis, sur le Huawei, redirigez ces
     mêmes ports vers l'adresse IP locale de votre PC Mint.
3. Sur le PC Mint, ouvrez les ports dans le pare-feu :
   ```sh
   sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp
   ```
4. Dans `deploy/.env` : renseignez `DOMAIN=votre-sous-domaine.duckdns.org` et `DUCKDNS_TOKEN=votre_jeton`.
5. Activez la mise à jour automatique de l'IP toutes les 5 minutes dans votre crontab (`crontab -e`) :
   ```cron
   */5 * * * * ~/crassecadia/deploy/duckdns-update.sh
   ```
6. Démarrez en mode direct :
   ```sh
   cd ~/crassecadia/deploy && ./update.sh direct
   ```

*Attention : cette méthode expose l'adresse IP de votre domicile sur Internet.*

