# EventFlow Desktop (Electron)

EventFlow Desktop est l'application de bureau Windows d'EventFlow. Elle **n'est pas** une
réécriture : la fenêtre Electron affiche le frontend Next.js existant (mêmes pages, mêmes
composants, mêmes routes API, même authentification). La version web reste inchangée et
continue de se déployer comme avant (`npm run build`, Vercel, `next start`).

## 1. Architecture retenue

```
┌──────────────────────────── EventFlow Desktop ─────────────────────────────┐
│ Processus principal Electron (electron/main.ts)                            │
│  • fenêtre, menu, téléchargements, notifications, mises à jour             │
│  • politique de sécurité (electron/security.ts, electron/policy.ts)        │
│  • choix du backend (electron/config.ts)                                   │
│        │ IPC validés (electron/ipc.ts)                                      │
│        ▼                                                                    │
│ Renderer sandboxé : frontend Next.js existant + preload minimal             │
│  (window.eventflowDesktop : getAppInfo, openExternal, notify)               │
└──────┬──────────────────────────────────────────────┬──────────────────────┘
       │ mode « distant » (recommandé)                │ mode « local »
       ▼                                              ▼
 Serveur EventFlow déployé (HTTPS)        utilityProcess Electron : serveur Next.js
 Next.js + API + Prisma + PostgreSQL      standalone embarqué, 127.0.0.1 uniquement
                                          → PostgreSQL (local ou réseau de l'agence)
```

| Fichier | Rôle |
|---|---|
| `electron/main.ts` | Cycle de vie, fenêtre principale, démarrage du backend, pages d'état, arrêt propre |
| `electron/preload.ts` | Expose `window.eventflowDesktop` (API figée, sans `ipcRenderer` ni Node.js) |
| `electron/security.ts` | Navigation, fenêtres secondaires, permissions Chromium, `<webview>` interdit |
| `electron/policy.ts` | Règles pures (URL, permissions, environnement du serveur) testées par Vitest |
| `electron/ipc.ts` | Canaux IPC : expéditeur et arguments vérifiés |
| `electron/server.ts` | Serveur Next.js local : port, contrôle de santé, journaux, arrêt |
| `electron/config.ts` | Chemins (ressources, `userData`) et résolution du backend |
| `electron/downloads.ts` | Enregistrement des fichiers via la boîte de dialogue native |
| `electron/menu.ts` | Menu Windows et raccourcis |
| `electron/updater.ts` | Mises à jour (`electron-updater`), désactivées sans source configurée |
| `electron/window-state.ts` | Taille / position / état agrandi mémorisés |
| `electron/pages/*` | Pages internes : chargement, erreur, configuration du serveur |
| `electron-builder.config.cjs` | Packaging, installateur NSIS, fusibles Electron |
| `scripts/electron/build.mjs` | Build Electron (esbuild) + build Next.js standalone + assemblage |
| `scripts/electron/verify-package.mjs` | Contrôle du contenu (ressources, modèles 3D, absence de secrets) |
| `scripts/electron/smoke-packaged.mjs` | Démarrage / fermeture / arrêt forcé de l'exécutable packagé, sans orphelin |
| `tests/electron/*`, `playwright.electron.config.ts` | Tests Playwright de l'application de bureau |
| `tests/unit/electron-policy.test.ts` | Tests Vitest des règles de sécurité |
| `src/lib/desktop.ts` | Pont optionnel côté frontend (notifications natives) |

Les seules modifications du code web sont : `output: "standalone"` **conditionnel**
(`NEXT_OUTPUT_STANDALONE=1`, utilisé uniquement par le build de bureau) dans `next.config.ts`,
et l'appel facultatif `notifyDesktop` dans la cloche de notifications (sans effet dans un
navigateur). Le schéma Prisma n'est pas modifié.

## 2. Raisons des choix techniques

- **Next.js conservé** : l'application repose sur des Route Handlers, des Server Components,
  Prisma et des sessions serveur. Un export statique ne suffit pas.
- **Deux modes de backend** :
  - *distant* (par défaut recommandé) : aucun secret ni accès base de données sur le poste ;
    même serveur que la version web ; mises à jour serveur indépendantes de l'application.
  - *local* : pour un poste unique ou un réseau d'agence sans serveur web. Le build
    `standalone` de Next.js est exécuté par un `utilityProcess` Electron (processus Node.js
    enfant), ce qui permet de désactiver le fusible `RunAsNode`. Les modules natifs (moteur
    Prisma, `@node-rs/argon2`) sont des modules N-API : ils fonctionnent avec le Node.js
    d'Electron sans recompilation.
  - PostgreSQL n'est **pas** embarqué : la base reste unique (pas de seconde base divergente).
- **electron-builder** plutôt qu'Electron Forge : le serveur standalone doit être copié tel
  quel hors de l'archive asar (`extraResources`), l'installateur NSIS gère raccourcis bureau /
  menu Démarrer / dossier d'installation, et `electron-updater` s'intègre directement
  (fournisseur `generic`, vérification SHA-512). Forge aurait demandé des hooks de copie et un
  maker Squirrel moins souple pour une installation par utilisateur.
- **esbuild** pour le processus principal et le preload : un seul fichier JavaScript par
  point d'entrée, aucune dépendance npm dans `app.asar` (le preload sandboxé ne peut pas
  charger de modules locaux).
- **Electron 44** (Chromium 152, Node.js 24) : version stable, compatible Next.js 15
  (Node ≥ 20.18) et React 19.

## 3. Prérequis Windows

- Windows 10 ou 11 64 bits.
- Développement / build : Node.js ≥ 20.18 (22 ou 24 recommandé), npm, Git.
- Mode local et tests : PostgreSQL 16 accessible (`docker compose up -d postgres`).
- Aucun compilateur C++ n'est nécessaire (pas de recompilation native).

## 4. Installation des dépendances

```bash
npm ci
```

`electron`, `electron-builder`, `electron-updater`, `esbuild`, `concurrently` et `wait-on`
sont des dépendances de développement. Sur Vercel (build web uniquement), définir
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` évite de télécharger le binaire Electron pendant `npm ci`.

## 5. Développement

```bash
npm run electron:dev
```

- démarre `next dev -p 3000` et compile le processus Electron ;
- `wait-on` attend que le port 3000 accepte les connexions, puis Electron vérifie
  `GET /api/health` avant de charger l'interface (pas de délai fixe) ;
- la fenêtre ouvre `http://localhost:3000/dashboard` ; le rechargement à chaud de Next.js
  fonctionne comme dans le navigateur ;
- les erreurs Next.js et Electron s'affichent dans le terminal (préfixes `next` / `electron`) ;
- fermer la fenêtre arrête aussi `next dev` (`concurrently -k`) ; `Ctrl+C` arrête les deux.

Assistant vocal en développement : lancer en plus `npm run assistant:dev` (comme pour la
version web). Après une modification de `electron/*`, relancer `npm run electron:dev`
(ou `npm run electron:start` si `next dev` tourne déjà).

`npm run dev` reste inchangé (version web seule).

## 6. Build

```bash
npm run electron:build
```

1. compile `electron/` vers `dist-electron/` (esbuild) ;
2. `next build` avec `NEXT_OUTPUT_STANDALONE=1` et `NEXT_DIST_DIR=.next-desktop` (le `.next`
   du serveur de développement n'est pas touché) ; `NEXT_PUBLIC_ASSISTANT_WS_URL` est vidée
   pour ne pas figer l'URL de développement de `.env.local` ;
3. assemble `build/desktop-server/` : sortie standalone + `.next-desktop/static` + `public/`
   (modèles `.glb`, images), puis supprime tout fichier `.env*`.

Version non installée pour les essais :

```bash
npm run electron:pack      # → release/<version>/win-unpacked/EventFlow.exe
```

## 7. Installateur Windows

```bash
npm run electron:dist      # → release/<version>/EventFlow-Setup-<version>.exe
npm run electron:verify    # contrôle du contenu du paquet
```

Valeurs par défaut figées au build (facultatives, sans secret) :

| Variable | Effet |
|---|---|
| `EVENTFLOW_SERVER_URL` | Serveur distant proposé par défaut (`https://…` obligatoire) |
| `EVENTFLOW_DEFAULT_MODE` | `remote` ou `local` |
| `EVENTFLOW_UPDATE_URL` | Source HTTPS des mises à jour (voir § 13) |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | Certificat Authenticode (`.pfx`) pour signer |

## 8. Installation et désinstallation

- L'installateur (NSIS, en français) installe par défaut pour l'utilisateur courant
  (`%LOCALAPPDATA%\Programs\EventFlow`), sans droits administrateur ; le dossier peut être
  changé. Il crée un raccourci sur le **bureau** et dans le **menu Démarrer**.
- Désinstallation : *Paramètres → Applications → EventFlow → Désinstaller*. Les données de
  l'utilisateur (`%APPDATA%\EventFlow`) sont conservées volontairement ; les supprimer à la
  main pour une remise à zéro complète.
- Sans signature, Windows SmartScreen affiche « Windows a protégé votre ordinateur » :
  *Informations complémentaires → Exécuter quand même*.

### Emplacement des données

| Nature | Emplacement |
|---|---|
| Code et ressources embarqués (lecture seule) | `<installation>\resources\app.asar`, `<installation>\resources\desktop-server\` |
| Préférences locales | `%APPDATA%\EventFlow\desktop-config.json`, `window-state.json` |
| Cookies de session (chiffrés par DPAPI) | `%APPDATA%\EventFlow\Partitions\eventflow\` |
| Configuration du serveur local (secrets) | `%APPDATA%\EventFlow\server.env` |
| Fichiers téléversés (mode local, stockage `local`) | `%APPDATA%\EventFlow\server-data\storage\uploads` |
| Journaux | `%APPDATA%\EventFlow\logs\main.log`, `server.log` |
| Données métier | serveur PostgreSQL (et S3 si configuré), jamais sur le poste en mode distant |
| Fichiers temporaires | dossier temporaire Windows (Chromium / Electron) |
| Exports de l'utilisateur | l'emplacement choisi dans la boîte de dialogue « Enregistrer » |

## 9. Configuration du backend

Au premier lancement, sans configuration, EventFlow affiche l'écran **Configurer EventFlow** :

- **Serveur EventFlow** : saisir l'URL `https://…` du serveur de l'agence (le même que la
  version web). Seule l'origine est conservée. `http://` n'est accepté que pour `localhost`.
- **Serveur local** : nécessite `%APPDATA%\EventFlow\server.env` (bouton « Ouvrir le dossier
  de configuration »). Le menu *Fichier → Configurer le serveur…* permet d'en changer.

Ordre de résolution : variables `EVENTFLOW_SERVER_MODE` / `EVENTFLOW_SERVER_URL`
(diagnostic), puis `desktop-config.json`, puis valeurs par défaut du build, puis présence de
`server.env` (mode local).

Mode distant — exigences réseau : HTTPS valide (les erreurs de certificat sont refusées), le
serveur doit accepter l'origine (`APP_URL`) et servir `/api/health`. Si le serveur est
injoignable au démarrage ou si une page ne se charge plus, une page d'erreur propose
« Réessayer ».

Mode local — exemple de `server.env` :

```dotenv
DATABASE_URL="postgresql://eventflow:motdepasse@localhost:5432/eventflow?schema=public"
SESSION_TTL_HOURS="12"
STORAGE_DRIVER="local"
MAIL_DRIVER="smtp"
SMTP_HOST="smtp.mon-agence.fr"
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASSWORD="..."
```

- Le serveur écoute **uniquement** `127.0.0.1` (port 41730, ou un port libre s'il est pris) ;
  `APP_URL`, `HOSTNAME`, `PORT` et `NODE_ENV` sont imposés.
- L'origine chargée est `http://localhost:41730` (et non `127.0.0.1`) : le serveur Next.js
  standalone construit les redirections du middleware avec `localhost`, et les cookies sont liés
  à l'hôte. Le port est vérifié libre en IPv4 **et** IPv6 (`::1`) pour qu'aucun autre processus
  ne puisse répondre à la place d'EventFlow sur `localhost`.
- Electron attend `GET /api/health` : 200 → chargement ; 503 → page « Base de données
  inaccessible » ; arrêt du serveur → page d'erreur avec le chemin des journaux.
- **Aucune migration n'est lancée automatiquement.** Préparer la base une fois depuis le dépôt :
  `npm run db:deploy` puis `npm run org:create` (voir `docs/DEPLOYMENT.md`).
- `MAIL_DRIVER="file"` n'est pas pris en charge (remplacé par `disabled`) ; l'assistant vocal
  est désactivé (il nécessite la passerelle WebSocket, voir § 15).
- `NODE_OPTIONS`, `NODE_PATH` et `ELECTRON_*` sont ignorées dans `server.env`.

## 10. Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `EVENTFLOW_SERVER_URL`, `EVENTFLOW_DEFAULT_MODE`, `EVENTFLOW_UPDATE_URL` | build | voir § 7 |
| `EVENTFLOW_SERVER_MODE` (`local`/`remote`), `EVENTFLOW_SERVER_URL` | exécution | Forcer un backend (diagnostic, tests) |
| `EVENTFLOW_SERVER_ENV_FILE` | exécution | Autre emplacement de `server.env` |
| `EVENTFLOW_USER_DATA_DIR` | exécution | Profil isolé (tests) |
| `EVENTFLOW_DEVTOOLS=1` | exécution | Outils de développement dans une version packagée (diagnostic volontaire) |
| `EVENTFLOW_DEV_URL` | développement | Autre URL que `http://localhost:3000` |
| Variables du serveur (`DATABASE_URL`, …) | `server.env` (mode local) ou serveur distant | voir `docs/DEPLOYMENT.md` |

Aucun fichier `.env` du dépôt n'est copié dans le paquet (supprimés à l'assemblage, contrôlés
par `npm run electron:verify`).

## 11. Authentification

Le mécanisme existant est utilisé sans modification :

- cookie `ef_session` (`HttpOnly`, `SameSite=Lax`, `Secure` en production) posé par
  `/api/auth/login` ; en mode local, `http://localhost` est un contexte sécurisé pour Chromium,
  le cookie `Secure` y est accepté (vérifié par les tests) ;
- cookies conservés dans la partition persistante `persist:eventflow`, chiffrés sur disque
  (fusible `EnableCookieEncryption`, DPAPI sous Windows) ; la durée reste celle du serveur
  (`SESSION_TTL_HOURS`) ;
- déconnexion = suppression de la session en base (`/api/auth/logout`) ;
- permissions, rôles et isolation des organisations restent vérifiés **côté serveur** ;
  le contrôle d'origine CSRF fonctionne car les requêtes viennent de l'origine du serveur ;
- les redirections (`/login?next=…`) restent sur l'origine de confiance ; aucun compte ni
  secret n'est codé dans l'application.

## 12. Sécurité Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (et `app.enableSandbox()`),
  `webSecurity: true`, `webviewTag: false`, aucun contenu non sûr mélangé.
- Preload : API figée (`Object.freeze`) de 3 méthodes applicatives + 6 méthodes réservées aux
  pages internes ; jamais `ipcRenderer`. Le processus principal vérifie pour chaque appel que
  l'expéditeur est le **cadre principal** de l'origine de confiance (ou d'une page interne) et
  valide les arguments.
- Navigation : seule l'origine de confiance (schéma + hôte + port exacts) et les pages internes
  s'affichent. Les autres liens `http(s)`/`mailto` sont ouverts dans le navigateur du système ;
  `file:`, `javascript:`, protocoles Windows, etc. sont refusés.
- Fenêtres secondaires : uniquement l'origine de confiance (aperçus PDF), mêmes protections.
- Permissions Chromium : micro **audio seul** pour l'origine de confiance (assistant vocal),
  presse-papiers en écriture, plein écran ; tout le reste refusé (caméra, géolocalisation,
  notifications web, capture d'écran, USB/HID/série).
- CSP : celle du serveur Next.js s'applique (`default-src 'self'`, `wasm-unsafe-eval` pour le
  décodeur Meshopt des modèles 3D, `worker-src blob:` pour les workers de chargement 3D).
- Pages internes : servies par le protocole dédié `eventflow-app://pages/…` (et non `file://`),
  liste blanche de 6 fichiers lus dans `app.asar`, aucun chemin dérivé de l'URL, CSP stricte
  en en-tête (`default-src 'none'; script-src 'self'`).
- Outils de développement désactivés dans la version packagée (sauf `EVENTFLOW_DEVTOOLS=1`).
- Fusibles : `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off,
  `EnableNodeCliInspectArguments` off, `OnlyLoadAppFromAsar` on, vérification d'intégrité de
  l'asar on, `GrantFileProtocolExtraPrivileges` off, cookies chiffrés.
- Serveur local : boucle locale uniquement ; toutes les routes privées exigent la session.
  Un autre processus de la même session Windows peut joindre le port, mais il pourrait aussi
  lire `server.env` : le modèle de menace du mode local est celui d'un poste de confiance.

## 13. Mises à jour et versionnement

- La version affichée et celle de l'installateur proviennent du champ `version` de
  `package.json` (SemVer). Incrémenter ce champ à chaque publication.
- `electron-updater` (fournisseur `generic`) n'est activé **que** si le build a été fait avec
  `EVENTFLOW_UPDATE_URL=https://…` : electron-builder génère alors `app-update.yml`. Sinon, le
  menu *Aide → Rechercher des mises à jour* indique qu'elles ne sont pas configurées.
- Publication : déposer `EventFlow-Setup-<version>.exe`, `*.blockmap` et `latest.yml` (dossier
  `release/<version>/`) sur le serveur HTTPS. electron-updater vérifie l'empreinte SHA-512
  indiquée dans `latest.yml`, demande l'accord de l'utilisateur avant de télécharger et
  installe à la fermeture.
- Avec une signature Authenticode, ajouter `win.publisherName` dans
  `electron-builder.config.cjs` : electron-updater refusera alors toute mise à jour signée par
  un autre éditeur.
- **Non testé** : aucune source de publication réelle n'existe à ce jour ; le mécanisme doit être
  validé de bout en bout (version N installée → publication N+1 → mise à jour) avant usage.

### Signature et distribution

1. Obtenir un certificat de signature de code (OV, ou EV / Azure Trusted Signing pour une
   réputation SmartScreen immédiate).
2. `CSC_LINK=chemin\certificat.pfx CSC_KEY_PASSWORD=… npm run electron:dist` (ou
   `win.azureSignOptions` pour Azure Trusted Signing).
3. Vérifier : `Get-AuthenticodeSignature .\release\<version>\EventFlow-Setup-<version>.exe`.
4. Publier l'installateur et, pour les mises à jour, `latest.yml` + `.blockmap`.

## 14. Problèmes fréquents

| Symptôme | Cause / solution |
|---|---|
| « Base de données inaccessible » | PostgreSQL arrêté ou `DATABASE_URL` incorrecte (mode local) ; côté serveur distant, voir son `/api/health` |
| « Serveur EventFlow injoignable » | Pas de réseau, URL erronée, certificat invalide ; *Configurer le serveur* |
| « Configuration du serveur local manquante » | Créer `%APPDATA%\EventFlow\server.env` |
| Page blanche après mise à jour du code | `npm run electron:build` (le serveur embarqué n'est pas reconstruit par `electron:dev`) |
| `electron:dev` ne démarre pas | Port 3000 déjà utilisé (`next dev` échoue) : arrêter l'autre serveur |
| SmartScreen bloque l'installateur | Installateur non signé (§ 13) |
| Micro refusé | Autorisation Windows *Paramètres → Confidentialité → Microphone* pour les applications de bureau |
| Scène 3D lente | Pilote graphique / GPU sur liste noire Chromium : mettre à jour le pilote |
| Premier lancement lent (≈ 40 s) | Analyse antivirus des ~3 200 fichiers du serveur embarqué juste après l'installation ; les lancements suivants prennent ≈ 5 s |
| Diagnostic | *Fichier → Ouvrir le dossier des journaux* (`main.log`, `server.log`) |

## 15. Limitations

- **Pas de mode hors connexion** : EventFlow a besoin de son serveur. En mode distant, une
  connexion réseau est indispensable ; en mode local, PostgreSQL doit être joignable. Aucune
  donnée n'est mise en cache pour un usage déconnecté.
- Mode local : l'assistant vocal Eric est désactivé (la passerelle WebSocket
  `scripts/assistant-gateway.ts` n'est pas embarquée) ; e-mails uniquement via SMTP ; une seule
  instance de serveur par poste ; les migrations sont à appliquer manuellement.
- Les mises à jour automatiques ne sont pas validées faute de source de publication réelle.
- L'installateur généré n'est pas signé.
- La version packagée ne peut pas être pilotée par Playwright (fusible
  `EnableNodeCliInspectArguments` désactivé) : les tests automatisés visent le processus Electron
  non packagé avec le serveur embarqué réel.
- Seule l'architecture x64 est construite.

## 16. Stratégie macOS

La structure est déjà portable : chemins calculés avec `app.getPath` / `process.resourcesPath`,
aucun chemin Windows codé en dur, modules natifs N-API disponibles pour macOS. Étapes prévues :

1. build sur un Mac (le serveur standalone embarque les binaires natifs de la plateforme de
   build : `@node-rs/argon2-darwin-*`, moteur Prisma `darwin` / `darwin-arm64`) ;
2. `electron-builder --mac` (cible `dmg` déjà déclarée, `hardenedRuntime`) ;
3. signature Developer ID + notarisation (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
   `APPLE_TEAM_ID`) ; entitlement micro (`com.apple.security.device.audio-input`) et
   `NSMicrophoneUsageDescription` pour l'assistant vocal ;
4. adapter le menu (menu application macOS, `Cmd+Q`, ne pas quitter à la fermeture de la
   dernière fenêtre) et la publication des mises à jour (`latest-mac.yml`).

## Commandes

| Commande | Rôle |
|---|---|
| `npm run electron:dev` | Next.js + Electron en développement |
| `npm run electron:start` | Electron seul vers un `next dev` déjà lancé |
| `npm run electron:build` | Build Electron + serveur Next.js embarqué |
| `npm run electron:pack` | Application non installée (`win-unpacked`) |
| `npm run electron:dist` | Installateur Windows `.exe` |
| `npm run electron:verify` | Vérification du contenu du paquet et absence de secrets |
| `npm run electron:smoke` | Test de fumée de l'exécutable packagé (`EVENTFLOW_EXE=…` pour une copie installée) |
| `npm run electron:lint` | TypeScript + ESLint des fichiers Electron |
| `npm run electron:test` | Tests unitaires Electron + tests Playwright de l'application de bureau |
| `npm run electron:icon` | Régénère `build/icon.png` depuis `public/Images/logo.png` |
