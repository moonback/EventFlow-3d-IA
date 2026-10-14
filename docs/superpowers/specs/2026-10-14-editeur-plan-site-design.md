# Éditeur du plan du site (murs, ouvertures, pièces, accessoires)

Date : 2026-10-14 · Statut : validé (sections 1 à 3), en cours d'implémentation

## Objectif

Faire du monde 3D un **jumeau numérique fidèle** des locaux réels de l'agence : chaque organisation
dessine ses bureaux et son entrepôt (murs, portes, fenêtres, pièces nommées) et pose des accessoires
configurables (dimensions, couleur, rotation), comme dans un logiciel d'aménagement.

Décisions prises avec l'utilisateur :

- Tracé sur un **plan 2D vu de dessus** (cotes en mètres, magnétisme), la 3D se met à jour.
- V1 : murs + portes + fenêtres, pièces nommées (surface, revêtement), catalogue d'accessoires.
  Hors V1 : plusieurs sites, étages.
- Les bâtiments codés en dur deviennent le **plan par défaut modifiable** : aucune régression pour les
  organisations existantes tant qu'elles n'ont rien enregistré.
- Stockage : **un document JSON par organisation** (approche A), validé par Zod, enregistré d'un bloc
  avec contrôle de version optimiste.

## Section 1 — Données et architecture

### Base de données

- `SitePlan` : `organizationId` (unique), `plan Json`, `revision Int`, `updatedAt`, `updatedByName`.
- `SceneLayoutVersion.sitePlan Json?` : une version d'agencement peut embarquer le plan du site ;
  restaurer une version restaure aussi le plan (les anciennes versions sans plan le laissent intact).

### Format (`src/features/site-plan/schema.ts`)

Unités en mètres, axe x vers l'est, axe z vers le sud (repère de la scène 3D). Identifiants générés
côté client (chaînes courtes uniques).

```
{ version: 1,
  walls:    [{ id, a:[x,z], b:[x,z], thickness, height, material }],
  openings: [{ id, wallId, offset, width, height, sill, kind }],
  rooms:    [{ id, name, polygon:[[x,z]…], floor, roofHeight? }],
  props:    [{ id, type, position:[x,z], elevation, rotationY, size:[w,h,d], color? }] }
```

- `material` : `plaster | concrete | brick | cladding | glass`.
- `kind` d'ouverture : `door | double-door | sectional | window | opening`. `offset` = distance du
  centre de l'ouverture depuis l'extrémité `a` du mur. Supprimer un mur supprime ses ouvertures.
- `floor` : `concrete | epoxy | tiles | parquet | carpet`. `roofHeight` facultatif : toit translucide.
- Validation : identifiants uniques, ouverture rattachée à un mur existant et contenue dans sa longueur
  et sa hauteur, polygone d'au moins 3 points et de surface non nulle, type d'accessoire connu du
  catalogue, coordonnées bornées à ±150 m, au plus 2 000 murs / 2 000 ouvertures / 500 pièces /
  3 000 accessoires.

Écart assumé par rapport à la première présentation : le lien pièce → zone métier (`zone`) est retiré
de la V1 (YAGNI) : les zones métier restent des repères indépendants, comme aujourd'hui.

### Modules

- `features/site-plan/schema.ts`, `geometry.ts` (découpe des murs autour des ouvertures, obstacles de
  la visite, surface, magnétisme, projection sur un mur), `catalog.ts`, `default-plan.ts`,
  `history.ts` (opérations pures + annuler / rétablir). Testés par Vitest.
- `server/services/site-plan-service.ts` ; routes `PUT /api/scene/site-plan` (enregistrer, 409 si la
  révision a changé) et `DELETE /api/scene/site-plan` (revenir au plan par défaut) — permission
  `scene:edit`. Le plan est livré dans `SceneData` (`sitePlan`, `sitePlanRevision`) : lecture
  `dashboard:read`, comme le reste de la scène.
- `three/site/` : rendu 3D (murs avec ouvertures, sols, toits, accessoires). Remplace `Building`,
  `OfficeDecor` et le bureau de direction codé en dur. La visite à pied prend ses collisions dans le
  plan (portes franchissables, fenêtres non).

## Section 2 — L'éditeur 2D

Bouton « Plan du site » (permission `scene:edit`) dans la barre du monde 3D : l'éditeur remplace la
scène, avec un bascule « Plan 2D / Aperçu 3D » (l'aperçu rend le brouillon avec la vraie scène).

- **Outils** : Sélection (V), Mur (M), Pièce (P), Porte (D), Fenêtre (F), Accessoire (catalogue).
- **Navigation** : molette = zoom centré sur le curseur, clic milieu / clic droit / Espace+glisser =
  déplacement, bouton « Recentrer ».
- **Mur** : clics successifs (murs chaînés), Échap ou double-clic pour terminer. Longueur affichée
  en direct. Magnétisme : grille (10 cm / 50 cm / 1 m / aucun), extrémités des murs existants
  (rayon 40 cm) et angles par pas de 15° (Maj = angle libre).
- **Pièce** : clics successifs, fermeture en cliquant le premier point ou double-clic ; surface en m².
- **Porte / fenêtre** : clic sur un mur ; l'ouverture est centrée sur le point cliqué et recalée pour
  tenir dans le mur.
- **Accessoire** : choisir dans le catalogue puis cliquer pour poser.
- **Sélection** : clic ; glisser pour déplacer (mur entier, poignées d'extrémité qui entraînent les
  extrémités jointives, ouverture le long de son mur, accessoire, sommets de pièce). R = tourner de
  90° (accessoire), Suppr = supprimer, Ctrl+D = dupliquer (accessoire), Ctrl+Z / Ctrl+Y.
- **Panneau de propriétés** : champs numériques en mètres (épaisseur, hauteur, matériau, longueur ;
  type, largeur, hauteur, allège, position d'une ouverture ; nom, revêtement, toit d'une pièce ;
  type, position, élévation, rotation en degrés, dimensions, couleur d'un accessoire).
- Les objets métier (rayonnages, véhicules…) sont affichés en gris, en lecture seule, pour repère.
- **Enregistrer** : `PUT` avec la révision ; en cas de conflit (409), message « plan modifié
  entre-temps » avec choix recharger. Une version d'agencement est créée à chaque enregistrement.
  **Revenir au plan par défaut** : confirmation puis `DELETE`.
- Quitter l'éditeur avec des modifications non enregistrées demande confirmation.

## Section 3 — Rendu 3D, catalogue, tests

- **Murs** : chaque mur est découpé en pièces (plein, allège, linteau, vitrage, vantail, lames de
  porte sectionnelle) par une fonction pure. Les pièces pleines sont coupées à 1,2 m : socle opaque,
  partie haute translucide dont l'opacité suit la hauteur de la caméra (vue en coupe de près) ; en
  visite à pied, les murs sont opaques. Les murs sont prolongés d'une demi-épaisseur aux extrémités
  pour fermer les angles. Aucun élément du plan n'intercepte les clics.
- **Sols** : polygone de la pièce légèrement surélevé, couleur selon le revêtement ; toit translucide
  si `roofHeight`.
- **Catalogue** (procédural, aucun asset tiers) : bureau, chaise, table de réunion, canapé, table
  basse, tapis, plante, bibliothèque, armoire, tableau blanc, écran mural, fontaine à eau,
  imprimante, comptoir de cuisine, casiers, palette, caisses empilées, établi, étagère légère,
  extincteur, barrière de sécurité, poubelle, poteau, lampadaire. Chaque entrée : libellé, catégorie,
  dimensions par défaut et bornes, couleur par défaut, recolorable ou non, bloquant ou non.
- **Tests** : unitaires (géométrie, validation, historique, plan par défaut valide et équivalent aux
  bâtiments actuels) ; intégration (enregistrement, conflit de révision, permission, isolation entre
  organisations, restauration d'une version). Vérification visuelle dans le navigateur.
