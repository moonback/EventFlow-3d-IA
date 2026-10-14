# EventFlow 3D — Suivi d'avancement

_Dernière mise à jour : 13 octobre 2026._

## Environnement constaté

- Dépôt initial : uniquement `Concept.md` et `prompt.md` (spécifications).
- Node 22, npm 10, PostgreSQL 16 local, Chromium Playwright préinstallé (→ `@playwright/test` 1.56).
- **Pas de démon Docker** dans l'environnement : `docker-compose.yml` est écrit mais n'a pas pu
  être exécuté ; les bases ont été servies par le PostgreSQL local.
- Registre shadcn/ui inaccessible (proxy) : composants de style shadcn/ui écrits à la main sur
  Radix UI (même API). Police Inter auto-hébergée (`@fontsource-variable/inter`).

## Décisions techniques

| Sujet | Choix | Raison |
|---|---|---|
| Framework | Next.js 15.5 (App Router), React 19.2, TS 5.9 strict | Stables, compatibles R3F 9 / Drei 10 |
| ORM | Prisma 6.19 | Stable ; migrations SQL versionnées avec triggers |
| Auth | Sessions serveur maison (jeton 256 bits haché, cookie httpOnly, Argon2id) | Révocation serveur, réinitialisation, invitations ; testable |
| Multi-organisation | `organizationId` partout, organisation issue de la session | Isolation stricte |
| Permissions | Matrice dans le code + surcharges par organisation | Explicite et configurable |
| Concurrence | Verrous `FOR UPDATE` ordonnés + décrément conditionnel + `CHECK` | Pas de sur-réservation |
| Journal de stock | Ajout seul (trigger), corrections par `REVERSAL` | Traçabilité |
| Factures | Trigger d'immutabilité après émission, avoirs | Intégrité |
| Montants | `Decimal(12,2)` + decimal.js | Pas de flottants |
| 3D | R3F à la demande, identité `TYPE:id`, actions via les API métier, plan SVG de secours | Fiabilité et sécurité |

## État des fonctionnalités

### Terminé et vérifié (tests automatisés et/ou parcours navigateur)

- Authentification (connexion, déconnexion, limitation des tentatives, mot de passe oublié,
  changement de mot de passe, invitations), multi-organisation avec changement d'organisation,
  11 rôles × 45 permissions avec surcharges par organisation, journal d'audit.
- CRM : clients (entreprises/particuliers), contacts, adresses, archivage, historique, documents ;
  fournisseurs.
- Événements : formulaire complet (fuseau horaire, montage/démontage), statuts, tâches, notes,
  équipe, véhicules, dépenses, documents, calendrier mensuel, rentabilité.
- Catalogue et stock : catégories, références, unités sérialisées, photos, emplacements
  hiérarchiques, mouvements (journal en ajout seul, contre-passation), inventaires, seuils
  d'alerte, disponibilité temporelle avec tampons.
- Réservations : brouillon → confirmation sûre en concurrence → préparation → expédition →
  retours partiels/endommagés → pertes ; annulation motivée ; historique ; bons PDF
  (préparation, livraison, retour).
- Maintenance : tickets manuels et automatiques (retour endommagé), quarantaine, atelier,
  réparation / rebut partiels.
- Achats : commandes fournisseurs, réceptions partielles (aucun stock avant réception).
- Véhicules : fiches, statut opérationnel calculé, affectations avec contrôle des conflits
  (chevauchement, entretien, permis, charge utile/volume), entretiens, échéances.
- Personnel : fiches, compétences, indisponibilités, affectations avec conflits, coût horaire
  figé, relevés d'heures ; planning (timelines véhicules et personnel).
- Devis (versions, envoi e-mail avec statut réel, acceptation → réservation brouillon), factures
  (numérotation à l'émission, immuables), avoirs, paiements partiels, PDF.
- Finances : rentabilité par événement, synthèse par période, séries mensuelles ; 9 rapports
  filtrables avec export CSV ; tableau de bord personnalisable (widgets) alimenté par les données.
- Documents (contrôle des octets magiques, droits par entité), import CSV avec aperçu/erreurs/
  confirmation (produits, clients), exports CSV protégés, état de stock PDF.
- Notifications internes + e-mail selon préférences, calculées par une tâche planifiée.
- Recherche globale (Ctrl/⌘K), raccourcis clavier, thème sombre/clair, interface responsive.
- Monde 3D : 5 espaces (direction, entrepôt, logistique, événements, centre de contrôle) reliés
  aux données réelles, sélection → panneau contextuel → actions via les API métier, recherche
  et mise en évidence d'une référence dans l'entrepôt, agencement enregistré (permission
  dédiée), plan 2D accessible utilisé aussi comme repli sans WebGL.
- Seed de démonstration réexécutable (2 organisations « démo », un compte par rôle, 10
  événements couvrant tous les états) ; script d'amorçage d'une organisation réelle
  (`npm run org:create`, lien de définition du mot de passe à usage unique).

### Partiel / limites connues

- **Pilotes externes non exercés contre de vrais services** : SMTP (testé en mode fichier et
  désactivé) et S3 (pilote local testé ; pilote S3 écrit mais jamais exécuté contre un bucket).
- **Docker** : `docker-compose.yml` (services de développement) non exécuté faute de démon ;
  aucun Dockerfile applicatif.
- **Codes-barres** : champ stocké et recherchable (compatible douchettes clavier), sans lecture
  par caméra ni impression d'étiquettes.
- **Logistique** : checklists de chargement/déchargement fournies sous forme de bons PDF et de
  tableau de suivi, sans signature électronique.
- **Facturation** : mentions et pénalités paramétrables mais conformité légale/fiscale **non
  certifiée** ; pas de facturation électronique (Factur-X), pas d'export comptable (FEC).
- **Sécurité** : pas de MFA ni de SSO ; CSP avec `'unsafe-inline'` pour les scripts Next.js.
- **3D** : performances validées uniquement sur le jeu de démonstration (rendu logiciel),
  pas sur de gros volumes ; pas de mode mobile tactile dédié pour l'agencement.
- Pas de test de charge ; pas de tests visuels de non-régression (PDF, 3D).

## Tests exécutés (dernière exécution)

| Commande | Résultat |
|---|---|
| `npm run lint` | 0 erreur, 0 avertissement |
| `npm run typecheck` | OK |
| `npm test` (Vitest, base `eventflow_test`) | 9 fichiers, **55/55** réussis |
| `npm run test:e2e` (Playwright, build de production, base `eventflow_e2e`) | **12/12** réussis |
| `npm run build` | OK (exécuté par la suite E2E) |
| `npm run stock:reconcile` (base de démo) | aucun écart |

Le détail de la couverture des 23 tests obligatoires est dans `docs/TESTING.md`.

## Étapes restantes avant une mise en production sûre

1. Conteneuriser (Dockerfile) ou préparer l'hôte Node, puis valider `docker-compose.yml` /
   l'infrastructure cible.
2. Tester les pilotes SMTP et S3 avec les vrais fournisseurs (bucket privé, versionnage).
3. Mettre en place le proxy HTTPS (remplacement de `X-Forwarded-For`), `APP_URL`, secrets.
4. Mettre en place sauvegardes `pg_dump` + sauvegarde du bucket, et **tester une restauration**.
5. Planifier `POST /api/jobs/alerts` et `stock:reconcile` ; brancher la supervision sur
   `/api/health` et les journaux d'erreurs.
6. Faire valider factures, avoirs, mentions légales et conservation des données par un
   expert-comptable / juriste (RGPD : registre, durées de conservation, droits des personnes).
7. Revue de sécurité indépendante / test d'intrusion ; envisager MFA et CSP à nonce.
8. Tests de charge sur des volumes réalistes ; recette utilisateurs sur une base de pré-production.
9. Amorcer l'organisation réelle avec `npm run org:create` (jamais le seed de démonstration).
