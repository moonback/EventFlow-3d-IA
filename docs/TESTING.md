# Tests

## Exécution

```bash
docker compose up -d postgres          # ou PostgreSQL 16 local avec les bases ci-dessous
npm run lint && npm run typecheck
npm test                               # Vitest : unitaires + intégration
npm run test:e2e                       # Playwright : build de production + navigateur
```

| Suite | Base | Préparation automatique |
|---|---|---|
| Vitest (`tests/unit`, `tests/integration`) | `eventflow_test` (`.env.test`, ou `TEST_DATABASE_URL`) | schéma supprimé puis recréé, `prisma migrate deploy` (les migrations sont donc validées à chaque exécution) |
| Playwright (`tests/e2e`) | `eventflow_e2e` (ou `E2E_DATABASE_URL`) | schéma recréé, migrations, seed de démonstration (mot de passe de test dédié) ; `next build` puis `next start` sur le port 3100 (`E2E_SKIP_BUILD=1` pour réutiliser un build) |

**Garde-fou** : les deux suites refusent de s'exécuter si le nom de la base ne contient pas
`test` ou `e2e`. Elles ne doivent jamais viser une base de production.

Les bases `eventflow_test` et `eventflow_e2e` sont créées par `scripts/docker-init-test-db.sql`
au premier démarrage du conteneur PostgreSQL (sinon : `createdb eventflow_test`, etc.).

Playwright utilise Chromium avec rendu WebGL logiciel (SwiftShader) pour tester la scène 3D
sans GPU.

## Couverture des exigences

| Exigence | Test(s) |
|---|---|
| Accès sans authentification bloqué | e2e `auth.spec` (redirection pages, API 401) |
| Isolation entre organisations | intégration `isolation-permissions` (lecture, écriture, scène 3D, recherche), `documents` |
| Permissions côté serveur | intégration `isolation-permissions` (lecture seule, commercial, surcharge) ; e2e `auth.spec` (appels API forgés → 403, page `/forbidden`) |
| CRUD | e2e `business-flows` (création et modification d'un client et d'un événement, réservation, via les formulaires) ; intégration (mises à jour, isolation en écriture) |
| Conflit de réservation | intégration `reservations` (12 + 10 sur 20) ; unitaire `availability` ; e2e (indisponibilité affichée, confirmation forgée → 409) |
| Concurrence | intégration `reservations` (confirmations simultanées), `scheduling` (affectations simultanées du même véhicule) |
| Réservations annulées / brouillons non bloquants | intégration `reservations`, unitaire `availability` |
| Tampons de préparation et de retour | intégration `reservations`, unitaire `availability` |
| Retour partiel, matériel endommagé indisponible | intégration `reservations` (quarantaine + ticket), `stock-movements` (maintenance) |
| Retour supérieur à la sortie refusé | intégration `reservations` |
| Mouvements traçables, journal non modifiable, contre-passation unique | intégration `stock-movements` |
| Solde négatif refusé, écarts d'inventaire tracés | intégration `stock-movements` |
| Commande fournisseur sans stock avant réception | intégration `stock-movements` |
| Conflits véhicule (double affectation, entretien, charge utile) | intégration `scheduling` |
| Conflits personnel (double mission, chauffeur, indisponibilité, compétences) | intégration `scheduling` |
| Totaux de devis exacts | intégration `commercial`, unitaire `money` |
| Précision monétaire (pas de flottants, arrondi au centime, répartition de remise) | unitaire `money` |
| Facture émise immuable, correction par avoir, paiements partiels / trop-perçu | intégration `commercial` |
| Fichiers et PDF générés respectant organisation et permissions | intégration `documents` |
| Import CSV (aperçu, lignes invalides, application, droits) et export CSV (formules neutralisées, isolation) | intégration `imports` |
| Chargement des pages sans erreur | e2e `pages.spec` (29 pages, aucune erreur JS) |
| Monde 3D alimenté par les données serveur | e2e `world.spec` (compteurs, identité `TYPE:id`, panneau chargé depuis l'API) ; intégration `isolation-permissions` (scène filtrée) |
| Erreur WebGL non bloquante | e2e `world.spec` (WebGL désactivé → plan 2D, sélection, navigation classique) |

## Résultats de la dernière exécution

- `npm run lint` : 0 erreur, 0 avertissement.
- `npm run typecheck` : OK.
- `npm test` : 9 fichiers, **55 tests réussis**.
- `npm run test:e2e` : **12 tests réussis** (build de production inclus).

## Non couvert par des tests automatisés

- Envoi SMTP réel (seul le pilote « fichier »/« désactivé » est exercé) et stockage S3 réel
  (le pilote local est testé ; le pilote S3 n'a pas été exécuté contre un bucket).
- Rendu visuel des PDF (génération et droits testés ; mise en page contrôlée visuellement
  pendant le développement, sans test de non-régression visuelle).
- Assistant d'import CSV dans le navigateur (le service est testé, pas l'écran) ; envoi des
  notifications par e-mail.
- `docker-compose.yml` (aucun démon Docker disponible dans l'environnement de développement).
- Tests de charge et de performance sur de gros volumes.
