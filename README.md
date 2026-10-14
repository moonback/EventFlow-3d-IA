<div align="center">

# EventFlow 3D

**L'ERP/CRM des agences événementielles, avec un jumeau numérique 3D de l'activité.**

Clients · Événements · Stock en temps réel · Logistique · Véhicules · Équipes · Devis & factures · Rentabilité · Monde 3D · Assistant vocal

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma)
![Three.js](https://img.shields.io/badge/Three.js-R3F-000?logo=threedotjs)
![Gemini Live](https://img.shields.io/badge/Gemini-3.8%20Live-4285f4?logo=googlegemini&logoColor=white)
![Tests](https://img.shields.io/badge/tests-199%20unitaires%2Fint%C3%A9gration%20%2B%2019%20E2E-success)

[Captures](#-captures-décran) · [Fonctionnalités](#-fonctionnalités) · [Assistant Eric](#-assistant-vocal-eric) · [Démarrage rapide](#-démarrage-rapide) · [Architecture](#-architecture) · [Sécurité](#-sécurité) · [Tests](#-tests) · [Documentation](#-documentation) · [Roadmap](ROADMAP.md)

</div>

---

## Pourquoi EventFlow 3D ?

Une agence événementielle jongle chaque semaine avec des centaines de références de matériel,
des événements qui se chevauchent, des camions, des techniciens et des devis à transformer en
factures. Les tableurs et les outils séparés provoquent des **doubles réservations**, du
**matériel perdu** et des **marges inconnues**.

EventFlow 3D réunit tout le cycle dans un seul outil :

```
Client → Devis → Événement → Réservation → Préparation → Départ → Retour → Facture → Rentabilité
```

…et le rend **visible** : l'entrepôt, les bureaux, les quais, les véhicules et les événements sont
représentés dans un monde 3D relié aux données réelles, intégré dès la page d'accueil. Cliquer sur
un rayonnage montre son contenu exact ; cliquer sur un camion montre son chargement et sa mission ;
s'asseoir à la table de réunion affiche le dossier complet d'un événement.

Et on peut **lui parler** : Eric, le régisseur virtuel, répond à la voix en temps réel à partir des
données de l'agence, montre dans la 3D ce dont il parle et propose des modifications que
l'utilisateur confirme d'un clic.

> **Statut** : version fonctionnelle complète, testée (intégration + navigateur), non encore
> déployée en production. Voir [PROGRESS.md](PROGRESS.md) pour l'état précis et les limites.

## 📸 Captures d'écran

> Captures réalisées sur les données de démonstration (`npm run db:seed`).

**Accueil** — indicateurs du jour, monde 3D intégré, alertes et activité récente.

![Page d'accueil d'EventFlow 3D](docs/screenshots/accueil.jpg)

**Monde 3D** — l'entrepôt, les bureaux, les quais et les véhicules reliés aux données réelles.

![Monde 3D en plein écran](docs/screenshots/monde-3d.jpg)

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/logistique-nuit.jpg" alt="Calque logistique de nuit" /><br /><sub><b>Logistique, de nuit</b> — flux de matériel, véhicules en mission et éclairage jour/nuit.</sub></td>
    <td width="50%"><img src="docs/screenshots/entrepot-chaleur.jpg" alt="Carte de chaleur de l'entrepôt" /><br /><sub><b>Carte de chaleur</b> — sorties des 90 derniers jours par emplacement.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/simulation-chargement.jpg" alt="Simulation de chargement d'un véhicule" /><br /><sub><b>Simulation de chargement</b> — plan de chargement pas à pas d'un camion (dernier chargé, premier déchargé).</sub></td>
    <td width="50%"><img src="docs/screenshots/frise-evenements.jpg" alt="Frise des événements" /><br /><sub><b>Zone événements</b> — frise des événements à venir et « voyager dans le temps ».</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/salle-reunion.jpg" alt="Salle de réunion 3D" /><br /><sub><b>Salle de réunion</b> — le dossier complet d'un événement autour de la table.</sub></td>
    <td width="50%"><img src="docs/screenshots/bureaux.jpg" alt="Bureaux de l'équipe" /><br /><sub><b>Bureau de direction</b> — postes de l'équipe (absences, présence), écrans d'indicateurs et calendrier.</sub></td>
  </tr>
</table>

## ✨ Fonctionnalités

| Domaine | Ce que fait EventFlow 3D |
|---|---|
| **CRM** | Clients entreprises et particuliers, contacts, adresses, historique, documents, archivage, recherche ; fournisseurs |
| **Événements** | Fiche complète (lieu, horaires, montage/démontage, fuseau horaire), statuts, tâches, notes, équipe, véhicules, dépenses, calendrier |
| **Catalogue & stock** | Références, catégories, unités sérialisées, photos, emplacements hiérarchiques (rack, case, quarantaine…), inventaires, seuils d'alerte |
| **Disponibilité temporelle** | Calcul du disponible **sur une période** (pic d'utilisation, tampons de préparation et de retour), conflits affichés en direct |
| **Réservations** | Confirmation **sûre en concurrence** (aucune sur-réservation possible), préparation, expédition, retours partiels, casse, pertes, historique complet |
| **Logistique** | Tableau de bord des départs/retours, bons de préparation, de livraison et de retour en PDF |
| **Maintenance** | Tickets automatiques au retour endommagé, quarantaine, atelier, réparation ou rebut |
| **Achats** | Commandes fournisseurs, réceptions partielles (le stock n'augmente qu'à la réception) |
| **Véhicules** | Fiches, échéances (entretien, contrôle, assurance), affectations avec contrôle des conflits, permis et charge utile |
| **Équipes** | Compétences, disponibilités, affectations sans chevauchement, coûts horaires, relevés d'heures, planning, **portail freelances & intermittents** (propositions de mission à accepter en ligne, disponibilités) |
| **Devis & factures** | Lignes éditables, remises, TVA multi-taux, versions de devis, factures **immuables** après émission, avoirs, paiements partiels, PDF |
| **Finance** | Rentabilité prévue/réelle par événement, synthèses par période, séries mensuelles, 9 rapports filtrables exportables |
| **Pilotage** | Accueil « cockpit » : vue 3D du site, événements à venir, tâches urgentes, indicateurs clés avec courbes, calendrier, activité récente ; blocs personnalisables, notifications, recherche globale `Ctrl/⌘ K` |
| **Données** | Import CSV avec aperçu et rapport d'erreurs, exports CSV sécurisés, documents avec contrôle des droits |
| **Monde 3D** | Jumeau numérique du site relié aux données réelles : entrepôt, bureaux, logistique, frise des événements, centre de contrôle ; panneau contextuel et actions métier, visite à pied, mur d'écrans, présence des collègues, **plan 2D de secours** (détails ci-dessous) |
| **Assistant vocal** | **Eric**, régisseur virtuel présent dans le monde 3D : conversation vocale en temps réel (Gemini Live), réponses tirées des données réelles dans la limite des droits, pilotage de la scène, actions confirmées par un clic (détails ci-dessous) |
| **Organisation** | Multi-organisation, 11 rôles, 46 permissions personnalisables, journal d'audit, invitations |

### Le monde 3D, en pratique

Page **Mon univers 3D** (`/world`), vue intégrée à l'accueil et **mur d'écrans** (`/wall`, rotation
automatique entre les zones pour une TV de l'agence).

| Espace | Ce qu'on y voit (données réelles) |
|---|---|
| **Entrepôt** | Rayonnages remplis selon le stock, alertes de stock bas, **chemin GPS** vers une référence recherchée, carte de chaleur des sorties (90 j), inventaire tournant du jour, préparations en cours animées, chariots élévateurs actifs selon les mouvements du jour |
| **Logistique** | Véhicules (modèles 3D détaillés) avec taux de chargement, échéances (assurance, contrôle technique, entretien), **simulation de chargement** « dernier chargé, premier déchargé », carte des missions en France |
| **Événements** | Frise J-14 → J+60 avec maquettes par type d'événement (scène, banquet, salon, conférence…) à l'échelle des invités, comptes à rebours, liens vers le matériel et les véhicules |
| **Bureaux** | Un poste par collaborateur (au bureau, en mission, absent), planning de la semaine en post-its, écrans à graphiques cliquables, **salle de réunion** (dossier budget / équipe / matériel / tâches), courrier des devis à relancer, pile des factures en retard |
| **Centre de contrôle** | Écrans d'indicateurs de chaque module, arcs de supervision |

**Outils** : visite à pied (ZQSD, collisions), **points de vue enregistrés** partagés avec l'équipe
et liens `?view=…`, présence des collègues connectés, agencement (rotation, aimantation, annulation,
duplication de rayonnage, **historique des versions** avec restauration), raccourcis clavier
(`0` vue d'ensemble, `1`–`5` zones, `Échap`).

**Rendu** : bâtiments vus en coupe, abords (parking, voiries, arbres), **cycle jour/nuit** selon
l'heure réelle du site, thème clair/sombre de l'application, habillage aux couleurs de l'agence,
ombres, halo lumineux. Réglages **Qualité** (basse / moyenne / élevée, dégradation automatique si
la machine peine), **Éclairage** (heure réelle / jour / nuit) et **Animations** (chacune peut être
masquée ou figée), mémorisés dans le navigateur ; le réglage système « réduire les animations » est respecté.

**Principes** :

- Chaque objet porte une **identité métier explicite** (`STOCK_LOCATION:…`, `VEHICLE:…`) : rien
  n'est déduit de sa position.
- Le panneau contextuel lit les données réelles via l'API ; les actions (transfert de stock,
  statut d'un véhicule, mise en maintenance) passent par les **mêmes règles serveur** que les
  écrans classiques. Aucun composant 3D n'écrit directement en base.
- Accessibilité : chaque objet est atteignable au clavier (`Tab`, `Entrée`) et annoncé aux lecteurs
  d'écran. Sans WebGL (ou en cas d'erreur graphique), l'application bascule automatiquement sur un
  plan 2D accessible : aucune fonctionnalité n'est perdue.
- Aucune ressource externe : modèles 3D générés par le projet (`npm run models:build`, compression
  Meshopt), géographie des missions intégrée, reflets d'ambiance générés localement.

## 🎙 Assistant vocal Eric

Dans **Mon univers 3D**, le bouton **Parler à Eric** (ou un clic sur le personnage) ouvre une
conversation en temps réel avec Eric, un régisseur virtuel avec casque-micro qui se tient dans la
salle de contrôle. On lui parle au micro ou on lui écrit ; on peut lui couper la parole à tout moment.

| Capacité | En pratique |
|---|---|
| **Converser** | Voix naturelle en français (Gemini Live `gemini-3.8-live`), transcription en direct, saisie au clavier dans la même conversation, reconnexion automatique |
| **Consulter** | 23 outils en lecture : événements et leur dossier, stock et emplacements, disponibilité sur une période, réservations, logistique, véhicules, équipe et planning, clients, devis, factures, finances, tâches, maintenance, notifications. Réponses à l'oral, heures dans le fuseau de l'agence |
| **Montrer** | 9 commandes de scène : cadrer un véhicule, un rayonnage ou un événement et ouvrir sa fiche, aller à une zone, mettre en évidence, localiser un matériel avec son chemin, changer de vue ou de calque, glisser sur la frise, ouvrir une réunion, jouer un plan de chargement. Eric marche jusqu'à l'objet et le désigne |
| **Agir** | Changer le statut d'un événement, ajouter une note, créer une tâche, transférer du matériel — **uniquement après un clic sur « Confirmer »** sur une carte qui décrit l'action |

L'anneau au sol indique son état : gris au repos, bleu à l'écoute, ambre pendant une
consultation, vert quand il parle ; sa bouche suit le rythme de sa voix.

**Garde-fous** :

- Eric ne voit **jamais plus que l'utilisateur** : chaque outil vérifie les permissions, puis les
  services métier les revérifient et filtrent par organisation. Une question sur les finances posée
  par un profil sans `finance:read` reçoit un refus poli.
- Aucune modification sans clic : la carte de confirmation est construite **à partir de la base**,
  pas des paroles du modèle ; une proposition retirée, interrompue ou expirée (60 s) n'est jamais
  exécutée, et les droits sont relus au moment d'agir. L'annulation d'un événement reste réservée
  à sa fiche.
- Les textes renvoyés par les outils sont traités comme des données, jamais comme des consignes.
- Chaque action est auditée et chaque appel d'outil journalisé (outil, succès, durée — sans le
  contenu). La voix et les messages sont transmis à Google Gemini (mention affichée au premier usage).

**Activer Eric** (désactivé par défaut) :

```bash
# .env.local
ASSISTANT_ENABLED="true"
GEMINI_BACKEND="developer"          # essais : clé GEMINI_API_KEY (variable d'environnement)
NEXT_PUBLIC_ASSISTANT_WS_URL="ws://localhost:3001/ws/assistant"
```

```bash
npm run assistant:check             # vérifie le modèle et les identifiants (un court échange)
npm run assistant:dev               # passerelle WebSocket (port 3001)
npm run dev                         # application (port 3000)
```

En production, utiliser `GEMINI_BACKEND="enterprise"` (Gemini Enterprise Agent Platform,
identifiants Google Cloud du serveur, région `eu`) et router `/ws/assistant` vers la passerelle
sur la même origine : voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#assistant-vocal-eric-optionnel).

## 🚀 Démarrage rapide

**Prérequis** : Node.js ≥ 20 (testé avec 22), npm, Docker *ou* PostgreSQL 16.

```bash
git clone https://github.com/moonback/EVENTFLOW-3D.git && cd EVENTFLOW-3D
cp .env.example .env               # renseigner au minimum DEMO_PASSWORD et CRON_SECRET
docker compose up -d postgres mailpit
npm install                        # installe et génère le client Prisma
npm run db:deploy                  # applique les migrations
npm run db:seed                    # données de DÉMONSTRATION
npm run dev                        # → http://localhost:3000
```

### Comptes de démonstration

Mot de passe : la valeur de `DEMO_PASSWORD` de votre `.env`.

| Rôle | E-mail |
|---|---|
| Propriétaire (2 organisations) | `camille.laurent@demo.eventflow.local` |
| Administrateur | `hugo.bernard@demo.eventflow.local` |
| Responsable logistique | `karim.haddad@demo.eventflow.local` |
| Gestionnaire de stock | `julie.petit@demo.eventflow.local` |
| Commercial | `thomas.roux@demo.eventflow.local` |
| Comptabilité | `nadia.fontaine@demo.eventflow.local` |
| Lecture seule | `paul.mercier@demo.eventflow.local` |

Les autres rôles (direction, technicien, chauffeur, équipe) sont listés dans `prisma/seed.ts`.
Les données de démonstration vivent dans des organisations marquées « (démo) » ;
`npm run db:seed:reset` les recrée sans toucher au reste.

### Services locaux

| Service | URL | Usage |
|---|---|---|
| Application | http://localhost:3000 | — |
| Mailpit | http://localhost:8025 | E-mails capturés (`MAIL_DRIVER=smtp`, port 1025) |
| MinIO (profil `s3`) | http://localhost:9001 | Stockage S3 local : `docker compose --profile s3 up -d` |

## 🧰 Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` · `build` · `start` | Développement, build de production, serveur de production |
| `npm run lint` · `typecheck` | ESLint, vérification TypeScript stricte |
| `npm test` | Tests unitaires et d'intégration (base `eventflow_test` recréée à chaque exécution) |
| `npm run test:e2e` | Tests navigateur Playwright (base `eventflow_e2e`, build dans `.next-e2e` + serveur sur le port 3100, passerelle de l'assistant simulée sur le port 3101) |
| `npm run db:migrate` | Créer une migration (développement) |
| `npm run db:deploy` | Appliquer les migrations (production, non destructif) |
| `npm run db:seed` · `db:seed:reset` | Données de démonstration (refusé en production) |
| `npm run org:create` | Créer une organisation réelle et son propriétaire (lien de mot de passe à usage unique) |
| `npm run jobs:alerts` | Calcul des alertes et envoi des e-mails de notification |
| `npm run stock:reconcile` | Contrôle des soldes de stock face au journal des mouvements |
| `npm run db:studio` | Explorateur de base Prisma Studio |
| `npm run models:build` | Régénère les modèles 3D détaillés (`public/models/*.glb`) |
| `npm run assistant:dev` · `assistant:gateway` | Passerelle WebSocket de l'assistant Eric (rechargement automatique · production) |
| `npm run assistant:check` | Vérifie la connexion à Gemini Live (modèle, région, identifiants) par un court échange réel |

## 🖥 Application de bureau Windows (Electron)

EventFlow Desktop affiche **le même frontend Next.js** dans une fenêtre Windows native, installable
avec raccourcis bureau et menu Démarrer. Il se connecte au serveur EventFlow de l'agence (HTTPS,
recommandé) ou démarre un serveur Next.js local embarqué relié à PostgreSQL. La version web
ci-dessus reste inchangée.

| Commande | Rôle |
|---|---|
| `npm run electron:dev` | `next dev` + fenêtre Electron (attend le serveur, arrêt groupé) |
| `npm run electron:build` | Build Electron + serveur Next.js standalone embarqué (`build/desktop-server`) |
| `npm run electron:pack` | Application non installée : `release/<version>/win-unpacked/EventFlow.exe` |
| `npm run electron:dist` | Installateur : `release/<version>/EventFlow-Setup-<version>.exe` |
| `npm run electron:verify` · `electron:smoke` | Contenu du paquet (ressources, modèles 3D, absence de secrets) · démarrage / arrêt de l'exécutable packagé |
| `npm run electron:lint` · `electron:test` | TypeScript + ESLint d'Electron · tests unitaires et Playwright de l'application de bureau |

Architecture, sécurité, configuration du serveur, mises à jour, signature et limites (pas de mode
hors connexion) : [docs/ELECTRON.md](docs/ELECTRON.md).

## 🏗 Architecture

```
┌──────────── Navigateur ────────────┐
│ Pages serveur (RSC) · Formulaires  │      ┌────────────── Serveur Next.js ──────────────┐
│ Tableaux · Graphiques · Monde 3D   │─────▶│ ~145 routes API  →  apiHandler               │
│                                    │ JSON │   origine · session · permissions · Zod      │
│ Assistant Eric (micro, voix)       │      │ Services métier (transactions, verrous)      │
└──────────────┬─────────────────────┘      │ PDF · e-mail · stockage · audit              │
               │ WebSocket                  └──────────────┬──────────────────────────────┘
               ▼                                           │
┌──── Passerelle /ws/assistant ─────┐  mêmes services      │
│ session · droits · outils         │──────────────────────┤
│ confirmations · audit             │                      ▼
└──────────────┬────────────────────┘   PostgreSQL 16 (62 modèles, contraintes CHECK, triggers)
               ▼ WebSocket
     Gemini Live (gemini-3.8-live)
```

| Couche | Technologies |
|---|---|
| Interface | Next.js 15 App Router, React 19, Tailwind CSS 4, composants style shadcn/ui (Radix), TanStack Table, Recharts, React Hook Form + Zod |
| 3D | Three.js, React Three Fiber, Drei, postprocessing — modèles glTF (Meshopt), rendu à la demande ou continu selon la qualité, chargement différé, repli SVG |
| Serveur | Route handlers Next.js, services métier typés, pdfkit, Nodemailer, AWS SDK (S3) |
| Assistant | Passerelle Node (`ws`) séparée de Next.js, `@google/genai` (Gemini Live), AudioWorklet (PCM 16 kHz → 24 kHz) |
| Données | PostgreSQL 16, Prisma 6, decimal.js pour l'argent, `@date-fns/tz` pour les fuseaux |
| Qualité | TypeScript strict, ESLint, Prettier, Vitest, Playwright |

```
src/
├── app/            Pages (auth, espace de travail) et routes API
├── server/         Auth, apiHandler, services métier, PDF, e-mail, stockage, audit
├── features/       Schémas Zod et composants par domaine
├── components/     UI de base, tableaux, formulaires, graphiques, navigation
├── three/          Monde 3D : objets, ambiance, effets, scène, plan 2D, panneau, réglages, avatar d'Eric
├── assistant/      Client de l'assistant : micro, lecteur audio, hook de conversation
└── lib/            Argent, dates, permissions, libellés, erreurs
prisma/             Schéma, migrations SQL (dont triggers), seed
public/models/      Modèles 3D générés (camion, fourgon, chariot, lyre, flight case)
scripts/            Création d'organisation, alertes, réconciliation du stock, modèles 3D, passerelle de l'assistant
tests/              unit · integration · e2e
docs/               Documentation technique et métier
```

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🔐 Sécurité

- Sessions serveur (jeton 256 bits haché, cookie `HttpOnly`/`SameSite`), mots de passe
  **Argon2id**, limitation des tentatives, réinitialisation à usage unique.
- **Toutes** les autorisations sont vérifiées côté serveur ; l'organisation vient de la session,
  jamais du client. Une ressource d'une autre organisation répond 404.
- Validation Zod de chaque entrée, contrôle d'origine (CSRF), CSP stricte, fichiers vérifiés par
  leurs octets, exports CSV protégés contre l'injection de formules.
- Intégrité garantie **en base** : journal de stock en ajout seul, factures émises immuables,
  soldes jamais négatifs.
- Aucun compte administrateur par défaut, aucun secret dans le dépôt.
- Assistant Eric : passerelle authentifiée par la session avec contrôle d'origine, permission
  `assistant:use`, outils soumis aux mêmes droits que l'utilisateur, **aucune écriture sans clic
  de confirmation**, identifiants Google uniquement côté serveur.

Détails et points d'attention avant production : [docs/SECURITY.md](docs/SECURITY.md).

## 🧪 Tests

| Suite | Contenu | Résultat |
|---|---|---|
| Unitaires et intégration (Vitest, vraie base PostgreSQL) | Disponibilité, argent, ordre de chargement, course du soleil, points de vue ; isolation, permissions, réservations concurrentes, stock, planification, devis/factures, documents, imports ; assistant Eric : passerelle (faux Gemini), chaque outil sur la vraie base, commandes de scène, parcours de confirmation | ✅ 199/199 |
| Navigateur (Playwright, build de production) | Authentification, droits, 29 pages, parcours client → événement → réservation ; monde 3D : panneau, repli sans WebGL, clavier, temps de première image, versions d'agencement, présence, carte et plan de chargement, bureau, points de vue | ✅ 19/19 |
| Assistant de bout en bout (Playwright, Gemini scripté) | Action refusée sans effet, action confirmée exécutée, véhicule montré dans la scène | ⏳ 3 tests écrits, pas encore exécutés |

Les suites refusent de s'exécuter sur une base dont le nom ne contient pas `test` ou `e2e`.
L'assistant a aussi été vérifié avec le vrai Gemini Live sur les données de démonstration
(`npm run assistant:check`, conversations comparées à la base).
Couverture détaillée des exigences : [docs/TESTING.md](docs/TESTING.md).

## ⚙️ Configuration

Toutes les variables sont décrites dans [`.env.example`](.env.example) :

| Groupe | Variables |
|---|---|
| Base & application | `DATABASE_URL`, `APP_URL`, `SESSION_TTL_HOURS`, `CRON_SECRET` |
| E-mail | `MAIL_DRIVER` (`file` · `smtp` · `disabled`), `MAIL_FROM`, `SMTP_*` |
| Fichiers | `STORAGE_DRIVER` (`local` · `s3`), `STORAGE_LOCAL_DIR`, `UPLOAD_MAX_MB`, `S3_*` |
| Démonstration | `DEMO_PASSWORD`, `ALLOW_DEMO_SEED` — **jamais en production** |
| Assistant Eric | `ASSISTANT_ENABLED`, `GEMINI_BACKEND` (`enterprise` · `developer`), `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_API_KEY`, `GEMINI_LIVE_MODEL`, `GEMINI_LIVE_VOICE`, `ASSISTANT_GATEWAY_PORT`, `ASSISTANT_MAX_SESSION_MINUTES`, `ASSISTANT_IDLE_SECONDS`, `NEXT_PUBLIC_ASSISTANT_WS_URL` (développement uniquement) |

## 🚢 Déploiement

Procédure complète (variables, migrations, amorçage, tâches planifiées, sauvegardes et
restauration) : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). En résumé :

```bash
npm ci && npm run build && npm run db:deploy
ORG_NAME="Mon Agence" OWNER_EMAIL="direction@mon-agence.fr" OWNER_NAME="Prénom Nom" npm run org:create
npm run start
```

> ⚠️ EventFlow 3D produit des indicateurs de gestion **opérationnels**. Ce n'est ni une
> comptabilité générale ni un logiciel de facturation certifié : faites valider mentions
> légales, facturation et conservation des données par un professionnel avant usage réel.

## 📚 Documentation

| Document | Contenu |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Couches, conventions, fonctionnement du monde 3D et de l'assistant Eric |
| [docs/DATABASE.md](docs/DATABASE.md) | Modèle de données, contraintes, triggers, numérotation |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Disponibilité, réservations, logistique, devis/factures, formules de rentabilité |
| [docs/SECURITY.md](docs/SECURITY.md) | Authentification, autorisation, protections, points d'attention |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Mise en production, exploitation, sauvegardes |
| [docs/TESTING.md](docs/TESTING.md) | Stratégie, exécution, couverture des exigences |
| [docs/ELECTRON.md](docs/ELECTRON.md) | Application de bureau Windows : architecture, build, installateur, sécurité, mises à jour |
| [PROGRESS.md](PROGRESS.md) | État d'avancement, limites connues, étapes restantes |
| [ROADMAP.md](ROADMAP.md) | Vision et feuille de route vers l'ERP événementiel du futur |
| [Suggestion.md](Suggestion.md) | 50 pistes d'évolution du monde 3D et leur état (36 réalisées) |
| [Plan de l'assistant Eric](docs/superpowers/plans/2026-10-14-assistant-vocal-eric.md) | Conception, étapes livrées, limites et points restant à vérifier |

## 🤝 Contribuer

1. Créer une branche à partir de `main`.
2. Respecter les conventions : TypeScript strict, Zod pour toute entrée, `apiHandler` + service
   pour toute route, `organizationId` sur toute requête, `Decimal` pour tout montant.
3. Ajouter les tests correspondants, puis vérifier : `npm run lint && npm run typecheck && npm test`.
4. Ouvrir une pull request décrivant le changement et son impact métier.
