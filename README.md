# Party Quest

Party game RPG multijoueur 16-bit dans le navigateur : crée une room, invite tes amis avec un code, et explorez ensemble un overworld généré procéduralement.

HTML / JavaScript pur (aucune compilation), Firebase pour les comptes et le temps réel, GitHub Pages pour l'hébergement.

## Ce qui est en place

- Connexion Google, avec un compte par joueur : niveau 1, 0 EXP, 0 or (pas encore utilisés)
- Créer ou rejoindre une room avec un code à 4 caractères, ou avec un lien `?room=CODE`
- Salon jusqu'à 5 joueurs, puis l'hôte lance la partie
- Overworld infini généré en bruit de Perlin (seed par room) : forêts de sapins 2×2, lacs aux bords arrondis, chemins de sable sinueux, herbes hautes, fleurs. L'eau, les buissons, les rochers et les troncs bloquent ; on passe derrière le feuillage des sapins
- Déplacements sur grille, réplication de la position et de l'orientation de chaque joueur
- Direction artistique façon GBA (tileset original généré en code dans `js/sprites.js`) : herbe menthe, sapins 32×32, personnages 16×32 avec une hitbox d'une case ; chaque joueur a une palette imposée (rouge, bleu, vert, violet, or)
- Mode démo (solo + 2 bots) actif tant que Firebase n'est pas configuré, ou avec `?demo` dans l'URL

## Mise en place

### 1. Firebase
1. Sur [console.firebase.google.com](https://console.firebase.google.com), crée un projet.
2. Va dans **Paramètres du projet → Vos applications → `</>`** pour ajouter une app Web, puis copie le `firebaseConfig` dans `js/config.js`.
3. Va dans **Authentication → Sign-in method → Google** et active-le.
4. Va dans **Authentication → Paramètres → Domaines autorisés** et ajoute `mik0ia.github.io`.
5. Va dans **Realtime Database → Créer une base de données** (région europe-west1), puis dans l'onglet **Règles**, colle le contenu de `database.rules.json` et clique sur **Publier**.

### 2. GitHub Pages
Va dans **Settings → Pages → Build and deployment → Deploy from a branch**, puis choisis `main` et `/ (root)`.

Le jeu est alors en ligne sur `https://mik0ia.github.io/Party-Quest/`.

### Tester en local
```bash
python3 -m http.server 8000
# puis http://localhost:8000/?demo
```
`localhost` est autorisé par défaut dans Firebase Auth.

## Structure

| Fichier | Rôle |
|---|---|
| `js/config.js` | Config Firebase |
| `js/main.js` | Écrans (connexion, menu, salon, jeu) |
| `js/net-firebase.js` | Auth Google, profils, rooms, synchro des positions |
| `js/net-demo.js` | Même interface, en local avec des bots |
| `js/game.js` | Boucle de jeu, déplacements, interpolation, rendu, minimap |
| `js/world.js` | Génération de l'overworld |
| `js/noise.js` | Bruit de Perlin seedé |
| `js/sprites.js` | Pixel art (personnages, tuiles) |
| `js/palette.js` | Palette 16-bit et dégradés des joueurs |
| `database.rules.json` | Règles de sécurité de la Realtime Database |

## Données (Realtime Database)

```
users/{uid}            name, level, xp, gold, createdAt   (création seule : impossible de se donner de l'or)
rooms/{CODE}           host, seed, status (lobby|playing), createdAt
rooms/{CODE}/players   {uid: name, level, joinedAt}
rooms/{CODE}/pos       {uid: x, y, d}   d = u|d|l|r
```

Si l'hôte quitte ou ferme son onglet, la room est supprimée.

Pour faire gagner de l'EXP ou de l'or plus tard sans permettre la triche, il faudra passer par des Cloud Functions (plan Blaze), car les règles interdisent au client de modifier ces valeurs.
