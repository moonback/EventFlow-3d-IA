# Architecture

## Vue d'ensemble

Application Next.js monolithique (App Router) : pages rendues côté serveur, composants clients
pour l'interactivité, API REST interne sous `src/app/api`, logique métier dans des services
serveur, PostgreSQL via Prisma.

```
Navigateur ── pages (RSC) ──────────────┐
          └── composants clients ─ fetch ─> /api/* (apiHandler) ─┐
                                                                  ├─> services métier ─> Prisma ─> PostgreSQL
Monde 3D (R3F) ── lecture /api/scene ─────────────────────────────┘        │
                                                                           ├─> stockage (local / S3)
Tâche planifiée ── POST /api/jobs/alerts (CRON_SECRET) ────────────────────┴─> e-mail (fichier / SMTP)
```

## Arborescence

| Dossier | Contenu |
|---|---|
| `src/app/(auth)` | Connexion, mot de passe oublié/réinitialisation, acceptation d'invitation |
| `src/app/(workspace)` | Toutes les pages métier (tableau de bord, clients, événements, stock, monde 3D…) |
| `src/app/api` | ~130 routes. Chacune délègue à un service via `apiHandler` |
| `src/server/auth` | Mots de passe (Argon2id), jetons, sessions, contexte d'autorisation, helpers de page |
| `src/server/api` | `apiHandler` (origine, authentification, permissions, validation Zod, erreurs), réponses fichier |
| `src/server/services` | Logique métier : une couche par domaine, toujours appelée avec un `AuthContext` |
| `src/server/pdf` | Mise en page pdfkit (devis, factures, bons de préparation/livraison/retour, état de stock) |
| `src/server/mail`, `src/server/storage` | Abstractions e-mail (fichier/SMTP/désactivé) et stockage (local/S3) |
| `src/features/*` | Schémas Zod partagés client/serveur et composants de formulaire par domaine |
| `src/components` | UI de base (style shadcn/ui), tableaux, formulaires, graphiques, mise en page |
| `src/lib` | Utilitaires purs : argent (decimal.js), dates/fuseaux, libellés, permissions, erreurs |
| `src/three` | Monde 3D : objets, matériaux, scène, plan 2D, panneau contextuel |
| `prisma` | Schéma, migrations SQL (dont triggers), seed de démonstration |
| `scripts` | Tâches en ligne de commande (alertes, rapprochement de stock), init SQL Docker |
| `tests` | `unit`, `integration` (Vitest), `e2e` (Playwright), `helpers` |

## Règles de conception

1. **Le serveur décide.** Toute page appelle `pageContext(...permissions)` et toute route
   `apiHandler`. Les services revérifient les permissions (`assertCan`) et filtrent chaque
   requête par `ctx.organizationId`, issu de la session — jamais du client.
2. **Services transactionnels.** Les opérations multi-tables (réservation, préparation, retour,
   réception, facturation) s'exécutent dans une transaction Prisma avec verrous explicites
   (`SELECT … FOR UPDATE`, ordre stable) et nouvelle tentative en cas d'interblocage.
3. **Argent en décimal.** `Decimal(12,2)` en base, `decimal.js` en code, sérialisation en chaînes.
4. **Dates en UTC.** Les formulaires envoient une heure locale + un fuseau IANA, convertis côté
   serveur (`@date-fns/tz`). L'affichage utilise le fuseau de l'organisation.
5. **Journal et audit.** Mouvements de stock en ajout seul, historique des réservations, journal
   d'audit pour les actions sensibles (connexions réussies, permissions, membres, factures,
   paiements, documents, stock…) ; toutes les tentatives de connexion sont aussi tracées dans
   `LoginAttempt` (limitation).
6. **Erreurs typées.** `ValidationError` (400, détail par champ), `UnauthorizedError` (401),
   `ForbiddenError` (403), `NotFoundError` (404 — y compris pour une ressource d'une autre
   organisation, afin de ne pas révéler son existence), `BusinessRuleError` (409).

## Monde 3D

- `/world` charge la scène uniquement côté client (`next/dynamic`, `ssr: false`) après détection
  de WebGL. Rendu à la demande (`frameloop="demand"`), géométries et matériaux partagés,
  libellés en textures canvas (aucune police réseau).
- Les données viennent de `GET /api/scene` (emplacements, véhicules, événements, indicateurs) ;
  chaque objet porte une **identité explicite** `TYPE:identifiant` (jamais déduite de sa position).
  Les positions personnalisées sont stockées dans `SceneObject`, sinon calculées par
  `src/features/scene/layout.ts`.
- Un clic ouvre un panneau qui lit `GET /api/scene/objects/:kind/:id`. Les actions du panneau
  (transfert, statut véhicule/événement, maintenance) appellent les **mêmes API métier** que les
  pages classiques : aucun composant 3D n'écrit en base.
- Le mode « Agencer » (permission `scene:edit`) déplace les objets ; l'enregistrement passe par
  `PUT /api/scene/placements`.
- Repli : le plan SVG `Plan2D` affiche les mêmes objets (accessible au clavier). Il est utilisé
  en mode « Plan », si WebGL est absent, si la scène lève une erreur (ErrorBoundary) ou si le
  contexte WebGL est perdu.

## Assistant vocal Eric

```
Navigateur ── micro PCM 16 kHz ──> passerelle /ws/assistant (Node, `ws`) ──> Gemini Live (gemini-3.8-live)
          <── voix PCM 24 kHz, transcriptions ──┘   cookie de session, AuthContext       identifiants serveur
```

- `scripts/assistant-gateway.ts` démarre `src/server/assistant/gateway.ts`, **processus séparé** de
  Next.js : l'App Router ne gère pas l'upgrade WebSocket, et le code serveur (`server-only`) se
  charge avec la condition `react-server`, comme les autres scripts.
- L'upgrade exige une origine autorisée (`APP_URL`), une session valide (`resolveSessionToken`,
  module sans dépendance à Next.js) et la permission `assistant:use`. La session est revalidée
  pendant la conversation ; une seule conversation par utilisateur.
- `src/server/assistant/live-session.ts` isole Gemini derrière l'interface `LiveConnector`
  (faux connecteur dans les tests). Reprise de session sur `goAway` grâce à la dernière poignée.
- **Outils « données »** (`src/server/assistant/data-tools.ts`) : 23 outils en lecture seule
  (recherche, tableau de bord, événements, stock, disponibilité, réservations, logistique,
  véhicules, équipe, clients, devis, factures, finances, tâches, maintenance, notifications),
  déclarés à Gemini depuis leurs schémas Zod. La passerelle les exécute avec l'`AuthContext` de
  l'utilisateur : contrôle des permissions de l'outil, puis des services (`assertCan`, filtrage
  par organisation). Les réponses sont compactées (`compact.ts` : heures locales précédées du jour
  de la semaine, décimaux en texte, listes et textes tronqués, 12 000 caractères au plus). Les
  erreurs deviennent des codes explicites pour le modèle (`FORBIDDEN`, `NOT_FOUND`,
  `INVALID_ARGUMENTS`, `TIMEOUT`…). Chaque appel est journalisé dans `AssistantToolCall`
  (outil, succès, durée : ni arguments ni contenu).
- Protocole (`src/features/assistant/protocol.ts`) : trames binaires = audio, trames texte = JSON
  validé par Zod. Côté client : `src/assistant/` (micro, lecteur, hook `useAssistant`) et le
  panneau `src/three/ui/assistant-panel.tsx`.
